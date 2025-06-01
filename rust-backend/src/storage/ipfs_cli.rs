use std::fs;
use std::process::Command;
use crate::storage::StorageBackend;

pub struct IpfsCliStorage;

impl StorageBackend for IpfsCliStorage {
    fn store(&self, id: &str, data: &[u8]) -> Result<(), String> {
        let tmp_path = format!("/tmp/{}.bin", id);
        fs::write(&tmp_path, data).map_err(|e| e.to_string())?;

        let output = Command::new("ipfs")
            .args(["add", "--pin", "-Q", &tmp_path])
            .output()
            .map_err(|e| format!("IPFS CLI error: {}", e))?;

        if output.status.success() {
            let cid = String::from_utf8_lossy(&output.stdout).trim().to_string();
            fs::write(format!("/data/ipfs_cid_{}.txt", id), cid).ok();
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).into())
        }
    }

    fn retrieve(&self, id: &str) -> Result<Vec<u8>, String> {
        let cid_path = format!("/data/ipfs_cid_{}.txt", id);
        let cid = fs::read_to_string(cid_path).map_err(|e| e.to_string())?;

        let output = Command::new("ipfs")
            .args(["cat", &cid])
            .output()
            .map_err(|e| format!("IPFS cat error: {}", e))?;

        if output.status.success() {
            Ok(output.stdout)
        } else {
            Err(String::from_utf8_lossy(&output.stderr).into())
        }
    }
}
