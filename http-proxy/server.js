import express from "express";
import fs from "fs";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import fetch from "node-fetch";
import dotenv from "dotenv";
// import multer from "multer";
import crypto from "crypto";
import axios from "axios";
// import os from "os";
import { fileURLToPath } from "url";
import pinataSDK from "@pinata/sdk";
import { Readable } from "stream";
import router from "./routes/audio.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { readMetadata, writeMetadata, verifyFileOwnership } from "./utils/metadata_helpers.js";

import { verifyEvmSignature } from "./middleware/auth.js";
import { runWasm } from "./services/wasm_handler.js";



dotenv.config();
const app = express();
app.set('trust proxy', 1);

const PORT = process.env.PORT || 8080;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUDIO_DIR = path.join(__dirname, "audio");
fs.mkdirSync(AUDIO_DIR, { recursive: true });

const pinata = new pinataSDK({ pinataJWTKey: process.env.PINATA_JWT });
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);


const accessTokens = new Map();

// Add encryption key and functions
if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length !== 64) {
  throw new Error('❌ ENCRYPTION_KEY must be set in .env and be 64 hex characters long (32 bytes)');
}
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

function encryptCid(cid) {
  try {
    const iv = crypto.randomBytes(12); // 12 bytes for GCM
    const key = Buffer.from(ENCRYPTION_KEY, 'hex'); // Must be 32 bytes for aes-256
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
    cipher.setAAD(Buffer.from('cid'));

    let encrypted = cipher.update(cid, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('❌ Encryption failed:', error);
    throw new Error('Failed to encrypt CID');
  }
}

function decryptCid(encryptedCid) {
  try {
    const parts = encryptedCid.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted CID format');
    }

    const [ivHex, authTagHex, encrypted] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAAD(Buffer.from('cid'));
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('❌ Decryption failed:', error);
    throw new Error('Failed to decrypt CID');
  }
}

// Create required directories
//fs.mkdirSync(UPLOAD_TEMP_DIR, { recursive: true });

//console.log(`Using temporary directory for uploads: ${UPLOAD_TEMP_DIR}`);

//const upload = multer({ dest: UPLOAD_TEMP_DIR });

app.use(express.json({ limit: "50mb" }));
app.use(cors({
  origin: ["https://gold-penguin-cristine-6kloqztm.bls.dev"],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    "Content-Type",
    "x-evm-address",
    "x-evm-message",
    "x-evm-signature",
  ],
  credentials: true
}));

app.use(helmet());

app.use("/audio", express.static("audio"));
app.use("/audio", router);

async function checkCIDAvailability(cid) {
  try {
    const url = `https://bronze-working-dragonfly-231.mypinata.cloud/ipfs/${cid}`;
    const res = await fetch(url, { method: "HEAD", timeout: 5000 });
    return res.ok;
  } catch {
    return false;
  }
}

app.post("/Upload", verifyEvmSignature("upload"), async (req, res) => {
  const { filename, base64, size, project = "default" } = req.body;
  const wallet = req.headers["x-evm-address"];
  
  if (!wallet || wallet.length !== 42 || !filename || !base64 || !size) {
    return res.status(400).json({ error: "Invalid input - missing required fields" });
  }

  try {
    const buffer = Buffer.from(base64, "base64");
    const stream = Readable.from(buffer);
    const finalFilename = filename.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    const id = `file_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const created_at = new Date().toISOString();

    console.log(`📤 Uploading file: ${finalFilename} for wallet: ${wallet}`);

    // Upload to IPFS first
    const pin = await pinata.pinFileToIPFS(stream, {
      pinataMetadata: { name: finalFilename },
      pinataOptions: { cidVersion: 1 },
    });

    if (!pin || !pin.IpfsHash) {
      throw new Error("IPFS upload failed - no hash returned");
    }

    console.log(`🔗 File uploaded to IPFS: ${pin.IpfsHash}`);
    
    const encryptedCid = encryptCid(pin.IpfsHash);
    
    // Read existing metadata - this is CRITICAL
    const userFiles = await readMetadata(wallet);
    console.log(`📋 Current files for ${wallet}: ${userFiles.length}`);
    
    const newFile = {
      id,
      filename: finalFilename,
      size,
      owner: wallet, // Keep original case from request
      hash,
      project,
      created_at,
      ipfs_cid: encryptedCid,
      is_deleted: false,
      deleted_at: null,
    };

    // Add new file to existing files (preserve existing files)
    const updatedFiles = [...userFiles, newFile];
    console.log(`📋 Adding file. New total: ${updatedFiles.length}`);
    
    // Write updated metadata - this preserves all existing files
    await writeMetadata(wallet, updatedFiles);

    console.log(`✅ File uploaded successfully: ${id}. Total files for ${wallet}: ${updatedFiles.length}`);
    
    // Return success response without sensitive data
    res.json({ 
      status: "uploaded", 
      file: { 
        id: newFile.id,
        filename: newFile.filename,
        size: newFile.size,
        owner: newFile.owner,
        project: newFile.project,
        created_at: newFile.created_at,
        is_deleted: newFile.is_deleted
        // ipfs_cid and hash intentionally excluded for security
      }
    });
    
  } catch (err) {
    console.error("❌ Upload failed:", err);
    res.status(500).json({ error: "Upload failed: " + err.message });
  }
});

// Fixed StreamUpload endpoint
app.post("/StreamUpload", verifyEvmSignature("upload"), async (req, res) => {
  const { filename, size, base64, project = "default" } = req.body;
  const wallet = req.headers["x-evm-address"];

  if (!wallet || !filename || !size || !base64) {
    return res.status(400).json({ error: "Invalid upload input - missing required fields" });
  }

  try {
    const finalFilename = filename.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const buffer = Buffer.from(base64, "base64");
    
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    const id = `file_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const created_at = new Date().toISOString();

    // Create readable stream directly from buffer
    const readableStream = new Readable();
    readableStream.push(buffer);
    readableStream.push(null);
    
    console.log(`📤 Stream uploading: ${finalFilename} for wallet: ${wallet}`);
    
    // Upload to IPFS first
    const pin = await pinata.pinFileToIPFS(readableStream, {
      pinataMetadata: { name: finalFilename },
      pinataOptions: { cidVersion: 1 }
    });
    
    if (!pin || !pin.IpfsHash) {
      throw new Error("Pinata upload succeeded but returned no IPFS hash");
    }

    console.log(`🔗 Stream file uploaded to IPFS: ${pin.IpfsHash}`);
    
    const encryptedCid = encryptCid(pin.IpfsHash); 
    
    // Read existing metadata - CRITICAL to preserve existing files
    const userFiles = await readMetadata(wallet);
    console.log(`📋 Current files for ${wallet}: ${userFiles.length}`);
    
    const newFile = {
      id,
      filename: finalFilename,
      size,
      owner: wallet, // Keep original case
      project,
      hash,
      created_at,
      ipfs_cid: encryptedCid,
      is_deleted: false,
      deleted_at: null,
    };

    // Add new file to existing files (preserve all existing)
    const updatedFiles = [...userFiles, newFile];
    console.log(`📋 Adding stream file. New total: ${updatedFiles.length}`);
    
    // Write updated metadata
    await writeMetadata(wallet, updatedFiles);

    console.log(`✅ Stream upload successful: ${id}. Total files for ${wallet}: ${updatedFiles.length}`);
    
    res.json({ 
      status: "uploaded", 
      file: {
        id: newFile.id,
        filename: newFile.filename,
        size: newFile.size,
        owner: newFile.owner,
        project: newFile.project,
        created_at: newFile.created_at,
        is_deleted: newFile.is_deleted
        // ipfs_cid and hash excluded for security
      }
    });
    
  } catch (err) {
    console.error("❌ Stream upload failed:", err);
    res.status(500).json({ error: `Upload failed: ${err.message}` });
  }
});

// Fixed List endpoint
app.post("/List", verifyEvmSignature("list"), async (req, res) => {
  try {
    const wallet = req.headers["x-evm-address"];
    
    if (!wallet) {
      return res.status(400).json({ error: "Missing wallet address" });
    }
    
    console.log(`📋 Listing files for wallet: ${wallet}`);
    
    // Read metadata with improved error handling
    const allFiles = await readMetadata(wallet);
    
    if (!Array.isArray(allFiles)) {
      console.error(`❌ Invalid metadata format for ${wallet}. Expected array, got:`, typeof allFiles);
      return res.status(500).json({ 
        error: "Invalid metadata format",
        files: [],
        count: 0
      });
    }
    
    console.log(`📋 Read ${allFiles.length} total files for ${wallet}`);
    
    // Filter files by ownership and deletion status
    let userFiles = allFiles.filter(f => {
      if (!f || typeof f !== 'object') {
        console.warn(`⚠️  Filtering out invalid file object:`, f);
        return false;
      }
      
      const isOwner = f.owner?.toLowerCase() === wallet.toLowerCase();
      const isNotDeleted = !f.is_deleted;
      
      return isOwner && isNotDeleted;
    });
    
    // Filter by project if specified
    if (req.body.project) {
      const originalCount = userFiles.length;
      userFiles = userFiles.filter(f => f.project === req.body.project);
      console.log(`📋 Filtered by project '${req.body.project}': ${userFiles.length}/${originalCount} files`);
    }
    
    console.log(`✅ Found ${userFiles.length} active files for ${wallet} (${allFiles.length} total)`);
    
    // Remove sensitive data before sending
    const sanitizedFiles = userFiles.map(file => {
      const sanitized = {
        id: file.id,
        filename: file.filename,
        size: file.size,
        owner: file.owner,
        project: file.project || "default",
        created_at: file.created_at,
        is_deleted: file.is_deleted || false,
        deleted_at: file.deleted_at || null
      };
      
      // Include analysis if available
      if (file.analysis) {
        sanitized.analysis = file.analysis;
      }
      
      return sanitized;
      // ipfs_cid and hash are intentionally excluded for security
    });
    
    res.json({ 
      files: sanitizedFiles,
      count: sanitizedFiles.length,
      totalFiles: allFiles.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (err) {
    console.error("❌ List files error:", err);
    res.status(500).json({ 
      error: "Failed to list files: " + err.message,
      files: [],
      count: 0
    });
  }
});

app.post("/Debug", verifyEvmSignature("debug"), async (req, res) => {
  const wallet = req.headers["x-evm-address"];
  
  if (!wallet) {
    return res.status(400).json({ error: "Missing wallet address" });
  }
  
  try {
    const safeWallet = wallet.toLowerCase();
    // Removed local metadataPath and registryPath logic
    
    const debugInfo = {
      wallet: wallet,
      safeWallet: safeWallet,
      // Removed metadataPath, fileExists, fileSize, fileCount, firstFile, parseError
      // Removed registryPath, registryEntry
    };
    
    res.json(debugInfo);
    
  } catch (err) {
    console.error("❌ Debug error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Fixed Delete endpoint
app.post("/Delete", verifyEvmSignature("delete"), async (req, res) => {
  const wallet = req.headers["x-evm-address"];
  const { id } = req.body;
  
  if (!id) {
    return res.status(400).json({ error: "Missing file ID" });
  }
  
  if (!wallet) {
    return res.status(400).json({ error: "Missing wallet address" });
  }
  
  try {
    const files = await readMetadata(wallet);
    const fileIndex = files.findIndex(
      (f) => f.id === id && f.owner.toLowerCase() === wallet.toLowerCase()
    );
    
    if (fileIndex === -1) {
      return res.status(404).json({ error: "File not found or unauthorized" });
    }

    // Mark file as deleted instead of removing it
    const updatedFiles = [...files];
    updatedFiles[fileIndex] = {
      ...updatedFiles[fileIndex],
      is_deleted: true,
      deleted_at: new Date().toISOString()
    };
    
    await writeMetadata(wallet, updatedFiles);
    
    console.log(`🗑️ File deleted: ${id} by ${wallet}`);
    res.json({ 
      status: "deleted", 
      id, 
      filename: updatedFiles[fileIndex].filename 
    });
    
  } catch (err) {
    console.error("❌ Delete file error:", err);
    res.status(500).json({ error: "Failed to delete file: " + err.message });
  }
});

app.post("/ListDeleted", verifyEvmSignature("list_deleted"), async (req, res) => {
  const wallet = req.headers["x-evm-address"];

  if (!wallet) {
    return res.status(400).json({ error: "Missing wallet address" });
  }

  try {
    console.log(`📋 Listing deleted files for wallet: ${wallet}`);

    const allFiles = await readMetadata(wallet);

    if (!Array.isArray(allFiles)) {
      return res.status(500).json({
        error: "Invalid metadata format",
        files: [],
        count: 0
      });
    }

    const deletedFiles = allFiles.filter(f => {
      if (!f || typeof f !== 'object') return false;
      return f.owner?.toLowerCase() === wallet.toLowerCase() && f.is_deleted;
    });

    console.log(`🗑️ Found ${deletedFiles.length} deleted files for ${wallet}`);

    const sanitizedFiles = deletedFiles.map(file => ({
      id: file.id,
      filename: file.filename,
      size: file.size,
      owner: file.owner,
      project: file.project || "default",
      created_at: file.created_at,
      is_deleted: file.is_deleted,
      deleted_at: file.deleted_at || null
    }));

    res.json({
      files: sanitizedFiles,
      count: sanitizedFiles.length,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error("❌ ListDeleted error:", err);
    res.status(500).json({ error: "Failed to list deleted files: " + err.message });
  }
});

// Restore endpoint with better validation and logging
app.post("/Restore", verifyEvmSignature("restore"), async (req, res) => {
  const wallet = req.headers["x-evm-address"];
  const { id } = req.body;
  
  if (!id) {
    return res.status(400).json({ error: "Missing file ID" });
  }
  
  if (!wallet || wallet.length !== 42) {
    return res.status(400).json({ error: "Missing or invalid wallet address" });
  }
  
  try {
    console.log(`♻️ RESTORE REQUEST: File ${id} by wallet ${wallet}`);
    
    const files = await readMetadata(wallet);
    console.log(`📋 Total files found for ${wallet}: ${files.length}`);
    
    const fileIndex = files.findIndex(
      (f) => f.id === id && f.owner.toLowerCase() === wallet.toLowerCase()
    );
    
    if (fileIndex === -1) {
      console.error(`❌ RESTORE FAILED: File ${id} not found or unauthorized for ${wallet}`);
      return res.status(404).json({ error: "File not found or unauthorized" });
    }

    const targetFile = files[fileIndex];
    
    // ✅ CRITICAL: Check if file is actually deleted
    if (!targetFile.is_deleted) {
      console.warn(`⚠️ RESTORE WARNING: File ${id} is already active (not deleted)`);
      return res.status(400).json({ 
        error: "File is already active",
        status: "already_active",
        file: {
          id: targetFile.id,
          filename: targetFile.filename,
          is_deleted: targetFile.is_deleted
        }
      });
    }

    console.log(`♻️ RESTORING: ${targetFile.filename} (was deleted at: ${targetFile.deleted_at})`);

    // Create new array to avoid mutation issues
    const updatedFiles = files.map(f => 
      f.id === id 
        ? {
            ...f,
            is_deleted: false,
            deleted_at: null,
            restored_at: new Date().toISOString() // Track restoration
          }
        : f
    );
    
    // ✅ CRITICAL: Write metadata before responding
    await writeMetadata(wallet, updatedFiles);

    let verifiedFile;
    for (let i = 0; i < 15; i++) {
      const verificationFiles = await readMetadata(wallet);
      verifiedFile = verificationFiles.find(f => f.id === id);
  
      if (verifiedFile && !verifiedFile.is_deleted) break;

      await new Promise(res => setTimeout(res, 500));
    }

    if (!verifiedFile) {
      console.error(`❌ RESTORE VERIFICATION FAILED: File not found in metadata`);
      console.error(`Full metadata after restore:`, verificationFiles);
      return res.status(500).json({ 
        error: "File not found after restore",
        status: "verification_failed" 
      });
    }

    if (verifiedFile.is_deleted) {
      console.error(`❌ RESTORE VERIFICATION FAILED: File still marked deleted`);
      console.error("Verified file:", verifiedFile);
      return res.status(500).json({ 
        error: "File still marked deleted after restore",
        status: "verification_failed" 
      });
    }

    // ✅ Restore succeeded
    console.log(`✅ File restored successfully: ${verifiedFile.filename} (${verifiedFile.id})`);
    res.json({ restored: verifiedFile });

  } catch (err) {
    console.error("❌ Restore error:", err);
    res.status(500).json({ error: "Failed to restore file: " + err.message });
  }
});

app.post("/empty_recycle_bin", verifyEvmSignature("empty_recycle_bin"), async (req, res) => {
  const wallet = req.headers["x-evm-address"];
  const { id } = req.body;

  if (!wallet) {
    return res.status(400).json({ error: "Missing wallet address" });
  }

  try {
    const files = await readMetadata(wallet);
    let updatedFiles = [];
    let removedFiles = [];

    if (id) {
      // 🧨 Permanently delete a single file by ID
      const index = files.findIndex(
        (f) => f.id === id && f.owner.toLowerCase() === wallet.toLowerCase()
      );

      if (index === -1) {
        return res.status(404).json({ error: "File not found or unauthorized" });
      }

      removedFiles = [files[index]];
      updatedFiles = files.filter((f) => f.id !== id);

      console.log(`❌ Permanently deleted file from recycle bin: ${id} by ${wallet}`);
    } else {
      // 🧹 Clear all deleted files
      removedFiles = files.filter(f => f.is_deleted && f.owner.toLowerCase() === wallet.toLowerCase());
      updatedFiles = files.filter(f => !f.is_deleted);

      console.log(`🧹 Cleared recycle bin for ${wallet}: Removed ${removedFiles.length} files`);
    }

    await writeMetadata(wallet, updatedFiles);

    res.json({
      status: "recycle_bin_cleared",
      deletedCount: removedFiles.length,
      remainingFiles: updatedFiles.length,
      deletedIds: removedFiles.map(f => f.id),
    });

  } catch (err) {
    console.error("❌ empty_recycle_bin error:", err);
    res.status(500).json({ error: "Failed to empty recycle bin: " + err.message });
  }
});

// Fixed Analyze endpoint
app.post("/Analyze", verifyEvmSignature("analyze"), async (req, res) => {
  const { fileId } = req.body;
  const wallet = req.headers["x-evm-address"];

  if (!fileId || !wallet) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    const file = await verifyFileOwnership(fileId, wallet);

    if (!file) {
      return res.status(404).json({ error: "File not found or unauthorized" });
    }

    // Return cached analysis if available
    if (file.analysis) {
      return res.json({ summary: file.analysis, cached: true });
    }

    if (!file.ipfs_cid) {
      return res.status(400).json({ error: "No IPFS CID available for this file" });
    }

    let fileCid;
    try {
      fileCid = decryptCid(file.ipfs_cid);
    } catch (decryptError) {
      console.error(`Failed to decrypt CID for file ${fileId}:`, decryptError);
      return res.status(500).json({ error: "Failed to decrypt file reference" });
    }

    const gatewayUrl = `https://bronze-working-dragonfly-231.mypinata.cloud/ipfs/${fileCid}`;
    console.log("📥 Downloading file from:", gatewayUrl);

    const response = await axios.get(gatewayUrl, {
      timeout: 30000,
      maxContentLength: 10 * 1024 * 1024, // 10MB
      responseType: 'text'
    });

    let content = response.data;

    // Validate content is string
    if (typeof content !== 'string') {
      if (typeof content === 'object') {
        content = JSON.stringify(content, null, 2);
      } else {
        return res.status(400).json({ error: "Downloaded file is not valid text for analysis" });
      }
    }

    const fileExtension = file.filename.split('.').pop().toLowerCase();
    const allowed = ['txt', 'md', 'json', 'csv', 'js', 'py', 'html', 'css'];
    if (!allowed.includes(fileExtension)) {
      return res.status(400).json({
        error: `File type .${fileExtension} is not supported for analysis`
      });
    }

    // Generate analysis using Gemini
    let analysisPrompt;
    switch (fileExtension) {
      case 'txt':
      case 'md':
      case 'json':
        analysisPrompt = `Please summarize this ${fileExtension.toUpperCase()} file in clear, natural English as if you're describing it to a team. Avoid lists, asterisks, or Markdown symbols. Use complete sentences and paragraph structure. Be concise and human-readable:\n\n${content.slice(0, 4000)}`;
        break;
      case 'csv':
        analysisPrompt = `Please analyze this CSV data. Describe the structure, identify key columns, and provide insights about the data:\n\n${content.slice(0, 4000)}`;
        break;
      case 'js':
      case 'py':
      case 'html':
      case 'css':
        analysisPrompt = `Please explain what this ${fileExtension.toUpperCase()} code does, as if you were describing it to a software engineering team. Provide key insights and main points, use natural English. Avoid lists, asterisks, or Markdown symbols. Use complete sentences and paragraph structure. Be concise and human-readable:\n\n${content.slice(0, 4000)}`;
        break;
      default:
        analysisPrompt = `Please analyze and explain the content of this file (${file.filename}). Extract key information and provide a comprehensive summary:\n\n${content.slice(0, 4000)}`;
    }

    if (!process.env.GOOGLE_API_KEY) {
      console.error("❌ Missing Google API key in environment variables");
      return res.status(500).json({ error: "Google API key not configured" });
    }

    console.log("🧠 Sending to Gemini 1.5 Flash for analysis...");

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: analysisPrompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1000,
      },
    });

    const geminiResponse = result.response;
    const summary = typeof geminiResponse.text === 'function'
      ? geminiResponse.text()
      : '[Error: Gemini returned invalid response format]';

    if (!summary || summary.startsWith('[Error')) {
      throw new Error("No summary generated from Gemini");
    }

    const cleanSummary = summary
      .replace(/[*_~`]+/g, '') // remove *, _, ~, `
      .replace(/^\d+\.\s*/gm, '') // remove numbered lists
      .replace(/:\s*/g, '. ') // colon -> period
      .replace(/\s{2,}/g, ' ') // multiple spaces to one
      .trim();

    // Update the file with analysis - Read, modify, write pattern
    const currentFiles = await readMetadata(wallet);
    const updatedFiles = currentFiles.map(f => 
      f.id === fileId ? { ...f, analysis: cleanSummary } : f
    );
    
    await writeMetadata(wallet, updatedFiles);

    console.log("✅ Analysis completed and saved successfully");
    res.json({ summary: cleanSummary, cached: false });

  } catch (err) {
    console.error("❌ Analyze error:", err);

    if (err.code === 'ECONNABORTED') {
      res.status(408).json({ error: "File download timeout" });
    } else if (err.response?.status === 404) {
      res.status(404).json({ error: "File not found on IPFS" });
    } else {
      res.status(500).json({ error: "Failed to analyze file: " + err.message });
    }
  }
});

app.post("/ExportSummary", verifyEvmSignature("export_summary"), async (req, res) => {
  const { fileId, summary } = req.body;
  const wallet = req.headers["x-evm-address"];

  if (!fileId || !summary || !wallet) {
    return res.status(400).json({ error: "Missing fileId, summary, or wallet address" });
  }

  try {
    const pinataMetadata = {
      name: `summary_${fileId}_${wallet}`,
      keyvalues: {
        fileId: fileId,
        owner: wallet,
        type: "summary",
      },
    };

    const pinOptions = {
      pinataMetadata: pinataMetadata,
      pinataOptions: { cidVersion: 1 },
    };

    const result = await pinata.pinJSONToIPFS({ 
      summary: summary, 
      fileId: fileId, 
      owner: wallet,
      exportedAt: new Date().toISOString()
    }, pinOptions);

    console.log(`📤 Summary exported to IPFS: ${result.IpfsHash}`);
    res.json({ status: "exported", cid: result.IpfsHash });
    
  } catch (err) {
    console.error("❌ ExportSummary error:", err);
    res.status(500).json({ error: "Failed to export summary: " + err.message });
  }
});

// Add new endpoint to download files
app.post("/Download", verifyEvmSignature("download"), async (req, res) => {
  const { fileId } = req.body;
  const wallet = req.headers["x-evm-address"];

  if (!fileId || !wallet) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    const file = await verifyFileOwnership(fileId, wallet);

    if (!file) {
      return res.status(404).json({ error: "File not found or unauthorized" });
    }

    if (!file.ipfs_cid) {
      return res.status(400).json({ error: "No IPFS CID available for this file" });
    }

    let fileCid;
    try {
      fileCid = decryptCid(file.ipfs_cid);
    } catch (decryptError) {
      console.error(`Failed to decrypt CID for file ${fileId}:`, decryptError);
      return res.status(500).json({ error: "Failed to decrypt file reference" });
    }

    const gatewayUrl = `https://bronze-working-dragonfly-231.mypinata.cloud/ipfs/${fileCid}`;
    
    console.log(`📥 Downloading file: ${file.filename} for wallet: ${wallet}`);
    
    res.json({ 
      downloadUrl: gatewayUrl,
      filename: file.filename,
      size: file.size,
      created_at: file.created_at
    });
    
  } catch (err) {
    console.error("❌ Download error:", err);
    res.status(500).json({ error: "Failed to get download URL: " + err.message });
  }
});

// Generate secure access token endpoint (unchanged - already secure)
app.get("/secure-file/:fileId", verifyEvmSignature("access"), async (req, res) => {
  const { fileId } = req.params;
  const wallet = req.headers["x-evm-address"];

  if (!fileId || !wallet) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    // ✅ FIRST SECURITY CHECK: Verify file ownership
    const file = await verifyFileOwnership(fileId, wallet);

    if (!file) {
      return res.status(404).json({ error: "File not found or unauthorized" });
    }

    if (!file.ipfs_cid) {
      return res.status(400).json({ error: "No IPFS CID available for this file" });
    }

    // Generate temporary access token
    const accessToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = Date.now() + (5 * 60 * 1000); // 5 minutes

    // ✅ Store token with OWNER INFO for later verification
    accessTokens.set(accessToken, {
      fileId,
      ownerWallet: wallet.toLowerCase(), // ✅ Store owner's wallet
      ipfs_cid: file.ipfs_cid,
      filename: file.filename,
      size: file.size,
      expires: tokenExpiry,
      createdAt: Date.now()
    });

    // Clean up expired tokens
    cleanupExpiredTokens();

    console.log(`🔐 Generated secure access token for file: ${fileId} by ${wallet}`);
    
    res.json({ 
      accessToken,
      expires: tokenExpiry,
      filename: file.filename,
      size: file.size
    });
    
  } catch (err) {
    console.error("❌ Secure file access error:", err);
    res.status(500).json({ error: "Failed to generate secure access: " + err.message });
  }
});

// OPTION 1: Stream with wallet verification (most secure)
app.get("/stream-file/:accessToken", verifyEvmSignature("download"), async (req, res) => {
  const { accessToken } = req.params;
  const requestingWallet = req.headers["x-evm-address"];

  if (!accessToken) {
    return res.status(400).json({ error: "Missing access token" });
  }

  if (!requestingWallet) {
    return res.status(400).json({ error: "Missing wallet verification" });
  }

  try {
    // ✅ FIRST CHECK: Validate token exists and isn't expired
    const tokenData = accessTokens.get(accessToken);
    
    if (!tokenData) {
      return res.status(401).json({ error: "Invalid or expired access token" });
    }

    if (Date.now() > tokenData.expires) {
      accessTokens.delete(accessToken);
      return res.status(401).json({ error: "Access token expired" });
    }

    // ✅ SECOND CHECK: Verify the requesting wallet matches the token owner
    if (requestingWallet.toLowerCase() !== tokenData.ownerWallet) {
      console.warn(`🚨 Security violation: Wallet ${requestingWallet} tried to use token owned by ${tokenData.ownerWallet}`);
      return res.status(403).json({ error: "Token belongs to different wallet address" });
    }

    // ✅ THIRD CHECK: Double-verify file ownership from metadata
    const file = await verifyFileOwnership(tokenData.fileId, requestingWallet);
    if (!file) {
      console.warn(`🚨 Security violation: File ownership changed for ${tokenData.fileId}`);
      accessTokens.delete(accessToken); // Clean up invalid token
      return res.status(403).json({ error: "File ownership verification failed" });
    }

    // Decrypt the CID
    let fileCid;
    try {
      fileCid = decryptCid(tokenData.ipfs_cid);
    } catch (decryptError) {
      console.error(`Failed to decrypt CID for token ${accessToken}:`, decryptError);
      return res.status(500).json({ error: "Failed to decrypt file reference" });
    }

    const gatewayUrl = `https://bronze-working-dragonfly-231.mypinata.cloud/ipfs/${fileCid}`;
    
    console.log(`📥 Streaming file via secure token: ${tokenData.filename} for verified owner: ${requestingWallet}`);

    // Fetch file from IPFS and stream to client
    const response = await axios.get(gatewayUrl, {
      responseType: 'stream',
      timeout: 30000
    });

    // Set appropriate headers
    res.setHeader('Content-Disposition', `attachment; filename="${tokenData.filename}"`);
    res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
    
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }

    // Stream the file
    response.data.pipe(res);

    // Log successful download
    console.log(`✅ File successfully downloaded: ${tokenData.filename} by ${requestingWallet}`);
    
    // Optional: Delete token after single use for maximum security
    // accessTokens.delete(accessToken);
    
  } catch (err) {
    console.error("❌ Stream file error:", err);
    
    if (err.code === 'ECONNABORTED') {
      res.status(408).json({ error: "File download timeout" });
    } else if (err.response?.status === 404) {
      res.status(404).json({ error: "File not found on IPFS" });
    } else {
      res.status(500).json({ error: "Failed to stream file: " + err.message });
    }
  }
});

// OPTION 2: Alternative - Stream without additional signature (less secure but simpler)
app.get("/stream-file-simple/:accessToken", async (req, res) => {
  const { accessToken } = req.params;

  try {
    const tokenData = accessTokens.get(accessToken);
    
    if (!tokenData || Date.now() > tokenData.expires) {
      if (tokenData) accessTokens.delete(accessToken);
      return res.status(401).json({ error: "Invalid or expired access token" });
    }

    // Token validation is sufficient since it was created by verified owner
    const fileCid = decryptCid(tokenData.ipfs_cid);
    const gatewayUrl = `https://bronze-working-dragonfly-231.mypinata.cloud/ipfs/${fileCid}`;
    
    const response = await axios.get(gatewayUrl, { responseType: 'stream', timeout: 30000 });
    
    res.setHeader('Content-Disposition', `attachment; filename="${tokenData.filename}"`);
    res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
    
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }

    response.data.pipe(res);
    
    console.log(`📥 File downloaded: ${tokenData.filename}`);
    
  } catch (err) {
    console.error("❌ Simple stream error:", err);
    res.status(500).json({ error: "Failed to stream file: " + err.message });
  }
});

// Enhanced cleanup with security logging
function cleanupExpiredTokens() {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [token, data] of accessTokens.entries()) {
    if (now > data.expires) {
      accessTokens.delete(token);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🧹 Cleaned up ${cleanedCount} expired access tokens`);
  }
}

// Clean up expired tokens every 5 minutes
setInterval(cleanupExpiredTokens, 5 * 60 * 1000);

// Enhanced helmet configuration
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "https://bronze-working-dragonfly-231.mypinata.cloud"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: "same-site" },
  dnsPrefetchControl: { allow: false },
  expectCt: { enforce: true, maxAge: 30 },
  frameguard: { action: "deny" },
  hidePoweredBy: true,
  hsts: { maxAge: 15552000, includeSubDomains: true, preload: true },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: { permittedPolicies: "none" },
  referrerPolicy: { policy: "no-referrer" },
  xssFilter: true,
}));

const ALLOWED_FILE_TYPES = {
  // Text formats
  'txt': 'text/plain',
  'md': 'text/markdown',
  'json': 'application/json',
  
  // Documents
  'pdf': 'application/pdf',
  'doc': 'application/msword',
  'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  
  // Images
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'gif': 'image/gif',
  'svg': 'image/svg+xml',
  
  // Code
  'js': 'text/javascript',
  'html': 'text/html',
  'css': 'text/css',
  'py': 'text/x-python',
  'csv': 'text/csv',
};

// Health check endpoint
app.get("/health", (req, res) => {
  try {
    // Removed local metadata check
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      totalFiles: 0, // Placeholder as local check is removed
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      nodeVersion: process.version
    });
  } catch (error) {
    res.status(500).json({
      status: "unhealthy",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  
  if (res.headersSent) {
    return next(err);
  }
  
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
    method: req.method
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔐 Encryption key configured: ${!!ENCRYPTION_KEY}`);
  
  // Removed local metadata check
  console.log(`📂 Total files across all wallets: 0 (IPFS-only metadata)`);
});
