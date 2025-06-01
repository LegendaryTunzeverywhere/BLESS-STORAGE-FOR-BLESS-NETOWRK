import express from "express";
import axios from "axios";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import os from "os"; // Keep os import as requested
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { verifyEvmSignature } from "../middleware/auth.js";
import { readMetadata, verifyFileOwnership } from "../utils/metadata_helpers.js";

dotenv.config();

const router = express.Router();

// Define __filename and __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define AUDIO_DIR relative to the current file
const AUDIO_DIR = path.join(__dirname, "../audio");

// Ensure AUDIO_DIR exists
fs.mkdirSync(AUDIO_DIR, { recursive: true });

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE = "pNInz6obpgDQGcFmaJgB";

// Helper function to validate API key format
const validateApiKey = (key) => {
  return typeof key === "string" && key.length >= 10; // Basic length check
};

// Helper function to test ElevenLabs API key by making a request to /user endpoint
const testApiKey = async (key) => {
  try {
    if (!validateApiKey(key)) {
      console.error("❌ Invalid API key format for testing.");
      return false;
    }
    const response = await axios.get('https://api.elevenlabs.io/v1/user', {
      headers: {
        'xi-api-key': key,
      },
      timeout: 10000 // 10 second timeout for API key test
    });
    return response.status === 200;
  } catch (error) {
    console.error("❌ ElevenLabs API key test failed:", error.response?.data || error.message);
    return false;
  }
};

// Rate limiting for audio generation
const audioLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each wallet to 10 requests per windowMs
  message: "Too many audio generation requests from this IP, please try again after 15 minutes"
});

// Helper function to extract fileId from filename
const extractFileIdFromFilename = (filename) => {
  console.log("🔍 Extracting fileId from filename:", filename);
  
  try {
    // Directly look for the "file_ID" pattern
    const fileIdMatch = filename.match(/(file_\d{13})/); 
    
    if (fileIdMatch && fileIdMatch[1]) {
      const fileId = fileIdMatch[1];
      console.log("🎯 Extracted fileId:", fileId);
      
      // Validate fileId format to ensure it includes "file_"
      if (!/^file_\d{13}$/.test(fileId)) { 
        throw new Error(`Invalid fileId format: ${fileId}`);
      }
      return fileId;
    } else {
      throw new Error(`Could not extract fileId from filename: ${filename}`);
    }
  } catch (error) {
    console.error("❌ extractFileIdFromFilename error:", error.message);
    throw error;
  }
};

// Generate audio with comprehensive error handling
router.post("/GenerateAudio", audioLimiter, verifyEvmSignature("tts_audio"), async (req, res) => {
  console.log("🎵 GenerateAudio request received");
  
  const wallet = req.headers["x-evm-address"];
  const { text, fileId, filename = "output.mp3", lang = "en" } = req.body;
  
  // Declare filePath outside try block to make it accessible in catch
  let filePath = null;

  console.log("📝 Request details:", {
    wallet,
    textLength: text?.length,
    fileId,
    filename,
    lang,
    hasElevenlabsKey: !!ELEVENLABS_API_KEY
  });

  // Enhanced input validation
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return res.status(400).json({ 
      error: "Missing or invalid 'text' field",
      details: "Text must be a non-empty string"
    });
  }

  if (!wallet || wallet.length !== 42) {
    return res.status(400).json({ 
      error: "Invalid wallet address",
      details: "x-evm-address header must be a valid 42-character wallet address"
    });
  }

  if (!fileId || !fileId.match(/^file_\d{13}/)) {
    return res.status(400).json({ 
      error: "Invalid fileId",
      details: "fileId is required and must be in the format file_XXXXXXXXXXXXX"
    });
  }

  // Enhanced API key validation
  if (!validateApiKey(ELEVENLABS_API_KEY)) {
    console.error("❌ ElevenLabs API key validation failed");
    return res.status(500).json({
      error: "TTS service not configured",
      details: "ELEVENLABS_API_KEY is missing or has invalid format"
    });
  }

  // Test API key before proceeding (optional - remove if it adds too much latency)
  const isValidKey = await testApiKey(ELEVENLABS_API_KEY);
  if (!isValidKey) {
    return res.status(401).json({
      error: "Invalid ElevenLabs API key",
      details: "API key authentication failed. Please check your ELEVENLABS_API_KEY."
    });
  }

  // Add cleanup function
  const cleanup = (path) => {
    if (path && fs.existsSync(path)) {
      try {
        fs.unlinkSync(path);
        console.log(`🗑️ Cleaned up temporary file: ${path}`);
      } catch (err) {
        console.error("❌ Cleanup failed:", err);
      }
    }
  };

  try {
    // Verify file ownership
    console.log("🔐 Starting ownership verification...");
    const file = await verifyFileOwnership(fileId, wallet);
    console.log(`✅ Verified ownership: ${wallet} owns file ${fileId} (${file.filename})`);

    // Prepare text for TTS (limit length to avoid API issues)
    const maxTextLength = 5000; // ElevenLabs limit
    const processedText = text.length > maxTextLength 
      ? text.substring(0, maxTextLength) + "..." 
      : text;

    console.log("🗣️ Calling ElevenLabs API...");
    console.log("📊 Text length:", processedText.length);
    console.log("🔑 Using API key:", ELEVENLABS_API_KEY.substring(0, 10) + "...");

    // Generate TTS audio with enhanced error handling
    let response;
    try {
      response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE}`,
        {
          text: processedText,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.7,
            style: 0.2,
            use_speaker_boost: true,
          },
        },
        {
          headers: {
            "xi-api-key": ELEVENLABS_API_KEY, // Make sure this is correct
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
          },
          responseType: "stream",
          timeout: 60000, // 60 second timeout
        }
      );
    } catch (apiError) {
      console.error("❌ ElevenLabs API error details:", {
        status: apiError.response?.status,
        statusText: apiError.response?.statusText,
        data: apiError.response?.data,
        headers: apiError.response?.headers,
        message: apiError.message
      });
      
      if (apiError.response?.status === 401) {
        return res.status(401).json({
          error: "Invalid ElevenLabs API key",
          details: "Authentication failed. Please verify your API key is correct and active."
        });
      } else if (apiError.response?.status === 429) {
        return res.status(429).json({
          error: "Rate limit exceeded",
          details: "Too many requests to ElevenLabs API. Please try again later."
        });
      } else if (apiError.response?.status === 400) {
        return res.status(400).json({
          error: "Invalid request to TTS service",
          details: apiError.response?.data || "The text or voice settings may be invalid"
        });
      } else {
        throw apiError; // Re-throw to be handled by outer catch
      }
    }

    console.log("✅ ElevenLabs API response received");

    // Create filename with clear structure
    const originalFilename = file.filename.replace(/\.[^/.]+$/, ""); // Remove extension
    const timestamp = Date.now();
    const sanitizedName = `${wallet}_${fileId}_${originalFilename}_audio_${timestamp}.mp3`
      .replace(/[^a-z0-9_.-]/gi, "_")
      .replace(/_+/g, "_"); // Remove multiple underscores
    
    console.log("📝 Generated filename:", sanitizedName);
    
    // Set filePath here so it's accessible in catch block
    filePath = path.join(AUDIO_DIR, sanitizedName);
    console.log("💾 Saving to path:", filePath);

    // Create write stream with error handling
    const writer = fs.createWriteStream(filePath);
    
    // Handle stream errors
    writer.on("error", (err) => {
      cleanup(filePath);
      console.error("❌ File write error:", err.message);
      if (!res.headersSent) {
        res.status(500).json({ 
          error: "Failed to save audio file",
          details: err.message 
        });
      }
    });

    response.data.on("error", (err) => {
      cleanup(filePath);
      console.error("❌ Response stream error:", err.message);
      writer.destroy();
      if (!res.headersSent) {
        res.status(500).json({ 
          error: "Failed to receive audio data",
          details: err.message 
        });
      }
    });

    // Memory management for stream handling
    const MAX_AUDIO_SIZE = 50 * 1024 * 1024; // 50MB limit
    let totalSize = 0;

    response.data.on('data', (chunk) => {
      totalSize += chunk.length;
      if (totalSize > MAX_AUDIO_SIZE) {
        writer.destroy();
        cleanup(filePath);
        if (!res.headersSent) {
          res.status(413).json({ error: "Audio file too large" });
        }
      }
    });

    // Pipe response to file
    response.data.pipe(writer);

    writer.on("finish", () => {
      console.log(`✅ Audio saved successfully: ${filePath}`);
      
      // Verify file was created and has content
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        console.log(`📊 Audio file size: ${stats.size} bytes`);
        
        if (stats.size === 0) {
          console.error("❌ Generated audio file is empty");
          cleanup(filePath);
          if (!res.headersSent) {
            return res.status(500).json({ 
              error: "Generated audio file is empty" 
            });
          }
          return;
        }
        
        if (!res.headersSent) {
          res.json({ 
            url: `/audio/${sanitizedName}`,
            filename: sanitizedName,
            originalFile: file.filename,
            fileId: fileId,
            size: stats.size
          });
        }
      } else {
        console.error("❌ Audio file was not created");
        if (!res.headersSent) {
          res.status(500).json({ 
            error: "Audio file was not created" 
          });
        }
      }
    });

  } catch (err) {
    console.error("💥 GenerateAudio error:", err);
    
    // Clean up file if it exists
    if (filePath) {
      cleanup(filePath);
    }
    
    // Enhanced error response
    let statusCode = 500;
    let errorMessage = "Audio generation failed";
    let details = err.message;

    if (err.message.includes("Unauthorized") || err.message.includes("not found")) {
      statusCode = 403;
      errorMessage = "Access denied";
    } else if (err.response) {
      statusCode = err.response.status || 500;
      details = err.response.data?.detail || err.response.data?.error || err.response.data || err.response.statusText || err.message;
      
      if (err.response.status === 401) {
        errorMessage = "Invalid ElevenLabs API key";
        details = "Please verify your API key is correct and has not expired";
      } else if (err.response.status === 429) {
        errorMessage = "Rate limit exceeded";
      } else if (err.response.status === 400) {
        errorMessage = "Invalid request parameters";
      }
    } else if (err.code === 'ENOTFOUND') {
      errorMessage = "Network error - cannot reach TTS service";
    } else if (err.code === 'TIMEOUT' || err.code === 'ETIMEDOUT') {
      errorMessage = "Request timeout";
    } else if (err.code === 'ECONNREFUSED') {
      errorMessage = "Connection refused by TTS service";
    }

    if (!res.headersSent) {
      res.status(statusCode).json({
        error: errorMessage,
        details: details,
      });
    }
  }
});

// Add before route handlers
const ALLOWED_AUDIO_TYPES = {
  'mp3': 'audio/mpeg',
  'wav': 'audio/wav',
  'ogg': 'audio/ogg',
  'm4a': 'audio/mp4'
};

// Serve audio files with ownership verification
router.get("/serve/:filename", verifyEvmSignature("serve_audio"), async (req, res) => {
  try {
    const wallet = req.headers["x-evm-address"];
    const { filename } = req.params;
    
    console.log("🎵 Serve request - Wallet:", wallet, "Filename:", filename);

    if (!wallet || !filename) {
      return res.status(400).json({ error: "Missing wallet address or filename" });
    }

    // Validate audio file type
    const ext = path.extname(filename).toLowerCase().slice(1);
    if (!ALLOWED_AUDIO_TYPES[ext]) {
      return res.status(400).json({ error: "Invalid audio file type" });
    }

    // Extract fileId from filename
    const fileId = extractFileIdFromFilename(filename);
    console.log("🔍 Extracted fileId for serving:", fileId);
    
    // Verify ownership
    const file = await verifyFileOwnership(fileId, wallet);

    // Define filePath before using it
    const filePath = path.join(AUDIO_DIR, filename);
    console.log("📁 Looking for audio file at:", filePath);
    
    if (!fs.existsSync(filePath)) {
      console.error("❌ Audio file not found at:", filePath);
      
      // List available audio files for debugging
      try {
        const availableFiles = fs.readdirSync(AUDIO_DIR);
        console.log("📂 Available audio files:", availableFiles);
      } catch (e) {
        console.log("📂 Could not list audio directory");
      }
      
      return res.status(404).json({ error: "Audio file not found" });
    }

    console.log(`✅ Serving audio: ${filename} to owner ${wallet}`);
    
    // Get file stats
    const stats = fs.statSync(filePath);
    
    // Set appropriate headers for audio streaming
    res.set({
      'Content-Type': ALLOWED_AUDIO_TYPES[ext],
      'Content-Length': stats.size,
      'Content-Disposition': `inline; filename="${file.filename}_audio.${ext}"`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=86400',
      'ETag': `"${stats.size}-${stats.mtime.getTime()}"`,
    });

    // Stream the audio file
    const audioStream = fs.createReadStream(filePath);
    
    audioStream.on('error', (err) => {
      console.error("❌ Audio stream error:", err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to stream audio" });
      }
    });
    
    audioStream.pipe(res);

  } catch (err) {
    console.error("Failed to serve audio:", err);
    
    if (err.message.includes("Unauthorized") || err.message.includes("not found")) {
      return res.status(403).json({
        error: "Access denied",
        details: err.message,
      });
    }

    if (!res.headersSent) {
      res.status(500).json({
        error: "Failed to serve audio",
        details: err.message,
      });
    }
  }
});

// Download audio with ownership verification
router.get("/download/:filename", verifyEvmSignature("download_audio"), async (req, res) => {
  const wallet = req.headers["x-evm-address"];
  const { filename } = req.params;

  if (!wallet || !filename) {
    return res.status(400).json({ error: "Missing wallet address or filename" });
  }

  try {
    // Extract fileId from filename
    const fileId = extractFileIdFromFilename(filename);
    
    // Verify ownership
    const file = await verifyFileOwnership(fileId, wallet);
    
    const filePath = path.join(AUDIO_DIR, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Audio file not found" });
    }

    console.log(`📥 Download request: ${filename} by owner ${wallet}`);
    
    // Get file stats
    const stats = fs.statSync(filePath);
    
    // Set headers for file download
    const downloadName = `${file.filename}_audio_summary.mp3`;
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': stats.size,
      'Content-Disposition': `attachment; filename="${downloadName}"`,
    });

    // Stream the file for download
    const audioStream = fs.createReadStream(filePath);
    
    audioStream.on('error', (err) => {
      console.error("❌ Download stream error:", err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to download audio" });
      }
    });
    
    audioStream.pipe(res);

  } catch (err) {
    console.error("📥 Download error:", err.message);
    
    if (err.message.includes("Unauthorized") || err.message.includes("not found")) {
      return res.status(403).json({
        error: "Access denied", 
        details: err.message,
      });
    }

    if (!res.headersSent) {
      res.status(500).json({
        error: "Download failed",
        details: err.message,
      });
    }
  }
});

// Get user's audio files
router.get("/my-files", verifyEvmSignature("list_audio"), async (req, res) => {
  try {
    const wallet = req.headers["x-evm-address"];
    if (!wallet) {
      return res.status(400).json({ error: "Missing wallet address" });
    }

    const files = await readMetadata(wallet);
    const audioFiles = files.filter(f => 
      !f.is_deleted && 
      f.owner?.toLowerCase() === wallet.toLowerCase() &&
      f.filename.match(/\.(mp3|wav|ogg|m4a)$/i)
    );

    res.json({ 
      files: audioFiles.map(f => ({ ...f, ipfs_cid: undefined })),
      count: audioFiles.length 
    });
  } catch (err) {
    console.error("Failed to list audio files:", err);
    res.status(500).json({ error: "Failed to list audio files" });
  }
});

// Debug endpoint to help troubleshoot issues
router.get("/debug/info", verifyEvmSignature("debug"), async (req, res) => {
  const wallet = req.headers["x-evm-address"];
  
  try {
    const audioFiles = fs.existsSync(AUDIO_DIR) ? fs.readdirSync(AUDIO_DIR) : [];
    
    let userMetadataFiles = [];
    let totalFiles = 0;
    try {
      userMetadataFiles = await readMetadata(wallet);
      totalFiles = userMetadataFiles.length;
    } catch (e) {
      console.warn(`[debug/info] Could not read metadata for wallet ${wallet}: ${e.message}`);
    }

    res.json({
      wallet,
      metadataExists: userMetadataFiles.length > 0,
      audioDir: AUDIO_DIR,
      audioDirExists: fs.existsSync(AUDIO_DIR),
      audioFiles,
      totalFiles: totalFiles,
      userFiles: userMetadataFiles,
      hasElevenlabsKey: !!ELEVENLABS_API_KEY,
      environment: {
        nodeEnv: process.env.NODE_ENV,
        cwd: process.cwd(),
        platform: os.platform(), // Added os.platform()
        hostname: os.hostname(), // Added os.hostname()
      }
    });
  } catch (err) {
    res.status(500).json({ 
      error: err.message,
      stack: err.stack 
    });
  }
});

// Fix 5: Add a debug endpoint to test API key
router.get("/debug/test-api-key", verifyEvmSignature("debug"), async (req, res) => {
  try {
    console.log("🔑 Testing API key:", ELEVENLABS_API_KEY.substring(0, 10) + "...");
    
    const isValid = validateApiKey(ELEVENLABS_API_KEY);
    if (!isValid) {
      return res.json({
        valid: false,
        error: "Invalid API key format"
      });
    }
    
    const response = await axios.get('https://api.elevenlabs.io/v1/user', {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      timeout: 10000
    });
    
    res.json({
      valid: true,
      user: response.data,
      keyPreview: ELEVENLABS_API_KEY.substring(0, 10) + "..."
    });
    
  } catch (error) {
    console.error("❌ API key test failed:", error.response?.data);
    res.json({
      valid: false,
      error: error.response?.data || error.message,
      status: error.response?.status
    });
  }
});

export default router;
