import fs from "fs";
import path from "path";

const CACHE_DIR = path.resolve("ipfs-cache");
const TTL_MS = 24 * 60 * 60 * 1000; // 1 day

export function cleanIpfsCache() {
  if (!fs.existsSync(CACHE_DIR)) return;

  const now = Date.now();
  const files = fs.readdirSync(CACHE_DIR);

  files.forEach(file => {
    const filePath = path.join(CACHE_DIR, file);
    const stat = fs.statSync(filePath);
    const age = now - stat.mtimeMs;

    if (age > TTL_MS) {
      fs.unlinkSync(filePath);
      console.log(`🧹 Deleted expired cache file: ${file}`);
    }
  });
}
