use crate::storage::StorageBackend;
use std::fs;
use ureq;
use std::io::Read;

pub struct IpfsHttpStorage;

impl StorageBackend for IpfsHttpStorage {
    fn store(&self, id: &str, data: &[u8]) -> Result<(), String> {
        let url = "http://127.0.0.1:5001/api/v0/add?pin=true&wrap-with-directory=false";

        let response = ureq::post(url)
            .set("Content-Type", "application/octet-stream")
            .send_bytes(data)
            .map_err(|e| format!("IPFS POST failed: {}", e))?;

        let mut text = String::new();
        response.into_reader()
            .read_to_string(&mut text)
            .map_err(|e| format!("IPFS response read failed: {}", e))?;

        let cid = text
            .lines()
            .find(|line| line.contains("\"Hash\""))
            .and_then(|line| line.split('"').nth(3))
            .unwrap_or("")
            .to_string();

        fs::write(format!("/data/ipfs_cid_{}.txt", id), &cid).map_err(|e| e.to_string())?;
        Ok(())
    }

    fn retrieve(&self, id: &str) -> Result<Vec<u8>, String> {
        let cid = fs::read_to_string(format!("/data/ipfs_cid_{}.txt", id))
            .map_err(|e| format!("CID not found: {}", e))?;

        let url = format!("http://127.0.0.1:5000/ipfs/{}", cid.trim());
        let response = ureq::get(&url).call().map_err(|e| e.to_string())?;
        let mut reader = response.into_reader();
        let mut buffer = Vec::new();
        use std::io::Read;

        reader.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
        Ok(buffer)

    }
}
