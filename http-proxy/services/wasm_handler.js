import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import pinataSDK from "@pinata/sdk";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { readMetadata } from "../utils/metadata_helpers.js";

dotenv.config();
const pinata = new pinataSDK({ pinataJWTKey: process.env.PINATA_JWT });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export async function runWasm(input) {
  return new Promise((resolve, reject) => {
    if (!input || !input.action) {
      return reject(new Error("Invalid input to WASM"));
    }

  const wasmPath = path.join(__dirname, "./rust.wasm");
  const rust = spawn("wasmer", ["run", wasmPath]);

    let output = "";
    let error = "";

    rust.stdin.write(JSON.stringify(input));
    rust.stdin.end();

    rust.stdout.on("data", (data) => {
      output += data.toString();
    });

    rust.stderr.on("data", (data) => {
      error += data.toString();
    });

    rust.on("close", () => {
      if (error) {
        return reject(new Error(error));
      }
      try {
        resolve(JSON.parse(output));
      } catch (err) {
        reject(new Error("Failed to parse WASM output"));
      }
    });
  });
}

async function verifyCID(cid) {
  try {
    const response = await fetch(`https://bronze-working-dragonfly-231.mypinata.cloud/ipfs/${cid}`, {
      method: 'HEAD',
      timeout: 5000
    });
    return response.ok;
  } catch {
    return false;
  }
}
