pub mod bless;
pub mod ipfs_cli;
pub mod ipfs_http;

pub trait StorageBackend {
    fn store(&self, id: &str, data: &[u8]) -> Result<(), String>;
    fn retrieve(&self, id: &str) -> Result<Vec<u8>, String>;
}
