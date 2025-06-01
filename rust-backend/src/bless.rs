use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use base64::{engine::general_purpose::STANDARD, Engine};
use hex;

#[derive(Serialize, Deserialize, Debug, Clone)]
struct FileMeta {
    id: String,
    filename: String,
    size: usize,
    hash: String,
    project: Option<String>,
    ipfs_cid: String,
    owner: String,
    created_at: String,
    deleted_at: Option<String>,
    is_deleted: bool,
}

fn load_metadata() -> HashMap<String, FileMeta> {
    let path = Path::new("metadata.json");
    if path.exists() {
        let mut file = File::open(path).expect("Failed to open metadata.json");
        let mut content = String::new();
        file.read_to_string(&mut content).unwrap();
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        HashMap::new()
    }
}

fn save_metadata(metadata: &HashMap<String, FileMeta>) {
    let path = Path::new("metadata.json");
    let json = serde_json::to_string_pretty(metadata).expect("Failed to serialize metadata");
    let mut file = File::create(path).expect("Failed to write metadata.json");
    file.write_all(json.as_bytes()).unwrap();
}

fn hash_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let result = hasher.finalize();
    hex::encode(result)
}

pub fn handle_action(input: &str) -> String {
    let json_input: Value = serde_json::from_str(input).expect("Invalid JSON input");
    let action = json_input["action"].as_str().unwrap_or("");
    let mut metadata = load_metadata();
    let owner = json_input["owner"].as_str().unwrap_or("").to_lowercase();

    let result: Value = match action {
        "Upload" => {
            let filename = json_input["filename"].as_str().unwrap_or("");
            let size = json_input["size"].as_u64().unwrap_or(0) as usize;
            let base64_data = json_input["base64"].as_str().unwrap_or("");
            let project = json_input["project"].as_str().map(|s| s.to_string());
            let cid = json_input["cid"].as_str().unwrap_or("");

            let bytes = STANDARD.decode(base64_data).unwrap_or_default();
            let hash = hash_bytes(&bytes);

            let id = format!("file_{}", Utc::now().timestamp_millis());
            let file = FileMeta {
                id: id.clone(),
                filename: filename.to_string(),
                size,
                hash,
                project,
                ipfs_cid: cid.to_string(),
                owner: owner.clone(),
                created_at: Utc::now().to_rfc3339(),
                deleted_at: None,
                is_deleted: false,
            };

            metadata.insert(id.clone(), file.clone());
            save_metadata(&metadata);

            json!({ "status": "uploaded", "file": file })
        }
        "List" => {
            let visible: HashMap<_, _> = metadata
                .iter()
                .filter(|(_, f)| f.owner == owner && !f.is_deleted)
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect();
            json!(visible)
        }
        "ListDeleted" => {
            let deleted: HashMap<_, _> = metadata
                .iter()
                .filter(|(_, f)| f.owner == owner && f.is_deleted)
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect();
            json!(deleted)
        }
        "Delete" => {
            let id = json_input["id"].as_str().unwrap_or("");
            if let Some(file) = metadata.get_mut(id) {
                file.is_deleted = true;
                file.deleted_at = Some(Utc::now().to_rfc3339());
                let response = json!({ "status": "deleted", "id": file.id.clone() });
                save_metadata(&metadata);
                response
            } else {
                json!({ "error": "File not found" })
            }
        }
        "Restore" => {
            let id = json_input["id"].as_str().unwrap_or("");
            if let Some(file) = metadata.get_mut(id) {
                file.is_deleted = false;
                file.deleted_at = None;
                let response = json!({ "status": "restored", "id": file.id.clone() });
                save_metadata(&metadata);
                response
            } else {
                json!({ "error": "File not found" })
            }
        }
        "empty_recycle_bin" => {
            let before_len = metadata.len();
            metadata.retain(|_, f| !(f.owner == owner && f.is_deleted));
            let removed = before_len - metadata.len();
            save_metadata(&metadata);

            json!({
                "status": "recycle bin emptied",
                "removed": removed
            })
        }
        _ => json!({ "error": "Invalid action" }),
    };

    result.to_string()
}
