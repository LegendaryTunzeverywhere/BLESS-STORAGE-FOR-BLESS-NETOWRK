import dotenv from 'dotenv';
import pinataSDK from '@pinata/sdk';
import fetch from 'node-fetch';

dotenv.config();

const pinata = new pinataSDK({ pinataJWTKey: process.env.PINATA_JWT });

// Read metadata from IPFS using latest CID from Pinata metadata search
export async function readMetadata(wallet) {
  if (!wallet) throw new Error('Wallet is required');
  const safeWallet = wallet.toLowerCase();

  try {
    const result = await pinata.pinList({
      metadata: {
        keyvalues: {
          wallet: { value: safeWallet, op: "eq" },
          type: { value: "metadata", op: "eq" }
        }
      },
      pageLimit: 1,
      sortBy: "timestamp",
      sortOrder: "desc"
    });

    const cid = result?.rows?.[0]?.ipfs_pin_hash;
    if (!cid) {
      console.warn(`📭 No metadata found for wallet: ${safeWallet}`);
      return [];
    }

    // Use your dedicated Pinata gateway instead of the public IPFS gateway
    const url = `https://bronze-working-dragonfly-231.mypinata.cloud/ipfs/${cid}?cacheBust=${Date.now()}`;
    console.log(`📥 Fetching metadata from: ${url}`);
    
    const res = await fetch(url, {
      timeout: 10000, // 10 second timeout
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'File-Manager-Server',
        'Authorization': `Bearer ${process.env.PINATA_JWT}`,
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const contentType = res.headers.get('content-type');
    const responseText = await res.text(); // Read response text once
    if (!contentType || !contentType.includes('application/json')) {
      console.error(`❌ Invalid content type: ${contentType}. Response: ${responseText}`);
      throw new Error(`Expected JSON but got: ${contentType}`);
    }

    // Attempt to parse JSON from the responseText
    let metadata;
    try {
      metadata = JSON.parse(responseText);
    } catch (jsonParseError) {
      console.error(`❌ Failed to parse JSON from response for ${safeWallet}:`, jsonParseError);
      console.error(`Raw response text:`, responseText);
      throw new Error("Failed to parse metadata as JSON");
    }

    if (!Array.isArray(metadata)) {
      console.error(`❌ Invalid metadata format for ${safeWallet}:`, metadata);
      throw new Error("Invalid metadata format - expected array");
    }

    console.log(`✅ Successfully read ${metadata.length} files for ${safeWallet}`);
    return metadata;

  } catch (err) {
    console.error(`❌ Failed to read metadata for ${safeWallet}:`, err.message);
    // Return empty array instead of throwing to prevent cascade failures
    return [];
  }
}

// Write metadata to IPFS and return new CID
export async function writeMetadata(wallet, files) {
  if (!wallet) throw new Error("Wallet is required");
  const safeWallet = wallet.toLowerCase();

  if (!Array.isArray(files)) throw new Error("Files must be an array");

  try {
    const result = await pinata.pinJSONToIPFS(files, {
      pinataMetadata: {
        name: `metadata_${safeWallet}.json`,
        keyvalues: {
          wallet: safeWallet,
          type: "metadata",
          timestamp: new Date().toISOString(),
        },
      },
      pinataOptions: { cidVersion: 1 },
    });

    console.log(`📤 Metadata uploaded to IPFS for ${safeWallet}: ${result.IpfsHash}`);
    return result.IpfsHash;

  } catch (err) {
    console.error(`❌ Failed to write metadata for ${safeWallet}:`, err.message);
    throw err; // Re-throw write errors as they're critical
  }
}

export async function verifyFileOwnership(fileId, wallet) {
  if (!fileId || !wallet) throw new Error("fileId and wallet required");
  
  try {
    const files = await readMetadata(wallet);
    const file = files.find(
      (f) => f.id === fileId && f.owner?.toLowerCase() === wallet.toLowerCase() && !f.is_deleted
    );
    return file || null;
  } catch (err) {
    console.error(`❌ Failed to verify file ownership for ${fileId}:`, err.message);
    return null;
  }
}
