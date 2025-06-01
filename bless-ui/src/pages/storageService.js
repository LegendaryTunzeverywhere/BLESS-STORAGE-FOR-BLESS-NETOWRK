// storageService.js
import axios from "axios";

const API = process.env.API_BASE || 'https://server-bless.onrender.com';

// Configuration
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit
const ALLOWED_FILE_TYPES = [
  'text/', 'application/json',
  'application/msword', 'application/vnd.openxmlformats-officedocument',
  'application/vnd.ms-excel', 'application/javascript',
  'text/css', 'text/html', 'text/csv', 'text/py', 'text/js', 'text/css', 'text/json',
  'text/docx', 'text/ts', 'text/toml'
];

// ✅ Universal Auth Header Generator
export async function generateAuthHeaders(address, signer, action) {
  console.log(`storageService: generateAuthHeaders called for action: ${action}`);
  if (!address || !signer || typeof signer.signMessage !== "function") {
    console.error("storageService: Invalid signer or wallet not connected for action:", action, "Address:", address, "Signer:", signer);
    throw new Error("Invalid signer or wallet not connected");
  }
  const message = `${action}`;
  try {
    const signature = await signer.signMessage(message);
    console.log(`storageService: Signature generated for action: ${action}`);
    return {
      "x-evm-address": address,
      "x-evm-message": message,
      "x-evm-signature": signature,
    };
  } catch (error) {
    console.error(`storageService: Failed to generate signature for action ${action}:`, error);
    throw new Error(`Failed to generate signature: ${error.message}`);
  }
}

// ✅ File validation
function validateFile(file) {
  if (!file) {
    throw new Error("No file provided");
  }
  
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`);
  }
  
  const isAllowedType = ALLOWED_FILE_TYPES.some(type => file.type.startsWith(type));
  if (!isAllowedType) {
    throw new Error(`File type ${file.type} not allowed`);
  }
}

// ✅ Convert file to base64 with validation
export async function toBase64(file) {
  validateFile(file);
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64 = reader.result.split(",")[1]; // strip `data:*/*;base64,`
      resolve(base64);
    };
    reader.onerror = (error) => reject(new Error(`Failed to read file: ${error.message}`));
  });
}

// ✅ Upload file with error handling
export async function uploadFile(file, address, signer, project = "default") {
  try {
    validateFile(file);
    const base64 = await toBase64(file);
    const headers = await generateAuthHeaders(address, signer, "upload");

    const payload = {
      filename: file.name,
      size: file.size,
      type: file.type,
      base64,
      project,
    };

    const res = await axios.post(`${API}/Upload`, payload, { 
      headers,
      timeout: 30000 // 30 second timeout
    });
    return res.data;
  } catch (error) {
    console.error("Upload failed:", error);
    throw new Error(`Upload failed: ${error.message}`);
  }
}

// ✅ List files with error handling
export const listFiles = async (address, signer) => {
  console.log("storageService: Entering listFiles function.");
  try {
    const headers = await generateAuthHeaders(address, signer, "list");
    const res = await axios.post(`${API}/List`, {}, { headers });
    console.log("storageService: listFiles successful.");
    return res.data.files || [];
  } catch (error) {
    console.error("storageService: Failed to list files:", error);
    throw new Error(`Failed to list files: ${error.message}`);
  }
};

// ✅ List deleted files with error handling
export const listDeletedFiles = async (address, signer) => {
  console.log("storageService: Entering listDeletedFiles function.");
  try {
    const headers = await generateAuthHeaders(address, signer, "list_deleted");
    const res = await axios.post(`${API}/ListDeleted`, {}, { headers });
    console.log("storageService: listDeletedFiles successful.");
    return res.data.files || [];
  } catch (error) {
    console.error("storageService: Failed to list deleted files:", error);
    throw new Error(`Failed to list deleted files: ${error.message}`);
  }
};

// ✅ Delete file with validation
export async function deleteFile(id, address, signer) {
  if (!id) {
    throw new Error("File ID is required");
  }

  try {
    const headers = await generateAuthHeaders(address, signer, "delete");
    const res = await axios.post(`${API}/Delete`, { id }, { headers });
    return res.data;
  } catch (error) {
    console.error("Failed to delete file:", error);
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}

// ✅ Restore file with validation
export async function restoreFile(id, address, signer) {
  if (!id) {
    throw new Error("File ID is required");
  }

  try {
    const headers = await generateAuthHeaders(address, signer, "restore");
    const res = await axios.post(`${API}/Restore`, { id }, { headers });
    return res.data;
  } catch (error) {
    console.error("Failed to restore file:", error);
    throw new Error(`Failed to restore file: ${error.message}`);
  }
}

// ✅ Empty Recycle Bin
export async function emptyRecycleBin(address, signer) {
  try {
    const headers = await generateAuthHeaders(address, signer, "empty_recycle_bin");
    const res = await axios.post(`${API}/empty_recycle_bin`, {}, { headers });
    return res.data;
  } catch (error) {
    console.error("Failed to empty recycle bin:", error);
    throw new Error(`Failed to empty recycle bin: ${error.message}`);
  }
}

// ✅ Analyze file with consistent auth and validation
export async function analyzeFile(fileId, address, signer) {
  if (!fileId) {
    throw new Error("File ID is required");
  }

  try {
    const headers = await generateAuthHeaders(address, signer, "analyze");
    const res = await axios.post(`${API}/Analyze`, {
      fileId, // Only send fileId - server gets cid and filename from metadata
    }, { headers });
    return res.data;
  } catch (error) {
    console.error("Failed to analyze file, , file is deleted or:", error);
    throw new Error(`Failed to analyze file, file is deleted or: ${error.message}`);
  }
}

// ✅ Generate audio with consistent auth and validation
export async function generateAudio(text, filename, fileId, lang, address, signer) {
  if (!text || !filename || !fileId || !lang) {
    throw new Error("Text, filename, fileId, and language are required");
  }
  try {
    const headers = await generateAuthHeaders(address, signer, "tts_audio");
    const res = await axios.post(`${API}/audio/GenerateAudio`, {
      text,
      filename,
      fileId,
      lang,
    }, { headers });
    return res.data;
  } catch (error) {
    console.error("Failed to generate audio:", error);
    let errorMessage = "Failed to generate audio";
    if (error.response) {
      if (error.response.status === 401) {
        errorMessage = "Authentication failed for audio generation. Please ensure your wallet is connected and authorized.";
      } else if (error.response.data?.details) {
        errorMessage = error.response.data.details;
      } else {
        errorMessage = `Request failed with status code ${error.response.status}`;
      }
    } else if (error.message) {
      errorMessage = error.message;
    }
    throw new Error(errorMessage);
  }
}

// ✅ Get secure download URL with comprehensive error handling
export async function getSecureDownloadUrl(fileId, address, signer) {
  if (!fileId) {
    throw new Error("File ID is required");
  }

  try {
    // Step 1: Get access token
    const accessHeaders = await generateAuthHeaders(address, signer, "access");
    const tokenRes = await axios.get(`${API}/secure-file/${fileId}`, { 
      headers: accessHeaders,
      timeout: 10000
    });
    
    if (!tokenRes.data?.accessToken) {
      throw new Error("No access token received from server");
    }

    // Step 2: Generate download headers
    const downloadHeaders = await generateAuthHeaders(address, signer, "download");
    
    return {
      streamUrl: `${API}/stream-file/${tokenRes.data.accessToken}`,
      headers: downloadHeaders,
      filename: tokenRes.data.filename,
      size: tokenRes.data.size,
      expires: tokenRes.data.expires
    };
  } catch (error) {
    console.error("Download URL error:", error);
    throw new Error(`Failed to generate secure download link: ${error.message}`);
  }
}

// ✅ Simple secure download URL
export async function getSecureDownloadUrlSimple(fileId, address, signer) {
  if (!fileId) {
    throw new Error("File ID is required");
  }

  try {
    const headers = await generateAuthHeaders(address, signer, "access");
    const res = await axios.get(`${API}/secure-file/${fileId}`, { headers });
    
    if (!res.data?.accessToken) {
      throw new Error("No access token received from server");
    }

    return `${API}/stream-file-simple/${res.data.accessToken}`;
  } catch (error) {
    console.error("Download URL error:", error);
    throw new Error(`Failed to generate secure download link: ${error.message}`);
  }
}
