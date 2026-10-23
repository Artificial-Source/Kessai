use std::{
    fs,
    path::{Path, PathBuf},
};

use chrono::Utc;
use schemars::JsonSchema;
use serde::Serialize;
use serde_json::{json, Map, Value};

use crate::app::{AppError, ErrorKind, Result};
use crate::fs::atomic_write;

#[derive(Debug, Serialize, JsonSchema)]
pub struct SetupOutcome {
    /// Requested output path, or null when only returning configuration.
    pub path: Option<String>,
    /// Whether the merged configuration was written.
    pub written: bool,
    /// Backup of the prior file, or null when no backup was made.
    pub backup_path: Option<String>,
    /// Complete merged MCP client configuration.
    pub config: Value,
}

pub fn generate_config(executable: &Path, db_path: &Path, read_only: bool) -> Value {
    let mut args = vec![
        "--db-path".to_string(),
        db_path.to_string_lossy().into_owned(),
        "serve".to_string(),
    ];
    if read_only {
        args.push("--read-only".to_string());
    }
    json!({
        "mcpServers": {
            "kessai": {
                "command": executable.to_string_lossy(),
                "args": args,
            }
        }
    })
}

pub fn merge_config(existing: Option<&str>, generated: &Value) -> Result<Value> {
    let mut root = match existing {
        Some(source) => serde_json::from_str::<Value>(source).map_err(|error| {
            AppError::validation(
                "output",
                format!("invalid existing MCP configuration: {error}"),
                "Use a JSON object, for example {\"mcpServers\":{}}.",
            )
        })?,
        None => Value::Object(Map::new()),
    };
    let root_object = root.as_object_mut().ok_or_else(|| {
        AppError::validation(
            "output",
            "existing MCP config must be a JSON object",
            "Use {\"mcpServers\":{}}.",
        )
    })?;

    if !root_object.contains_key("mcpServers") {
        root_object.insert("mcpServers".into(), Value::Object(Map::new()));
    }
    let servers = root_object
        .get_mut("mcpServers")
        .and_then(Value::as_object_mut)
        .ok_or_else(|| {
            AppError::validation(
                "output",
                "mcpServers must be a JSON object",
                "Use {\"mcpServers\":{}}.",
            )
        })?;
    let kessai = generated
        .get("mcpServers")
        .and_then(Value::as_object)
        .and_then(|servers| servers.get("kessai"))
        .cloned()
        .ok_or_else(|| {
            AppError::new(
                ErrorKind::Internal,
                "generated Kessai MCP config is invalid",
            )
        })?;
    servers.insert("kessai".into(), kessai);
    Ok(root)
}

pub fn run(
    output: Option<&Path>,
    executable: &Path,
    db_path: &Path,
    read_only: bool,
    dry_run: bool,
) -> Result<SetupOutcome> {
    let generated = generate_config(executable, db_path, read_only);
    let existing = output
        .filter(|path| path.exists())
        .map(fs::read_to_string)
        .transpose()?;
    let merged = merge_config(existing.as_deref(), &generated)?;
    let rendered = serde_json::to_string_pretty(&merged)
        .map_err(|error| AppError::new(ErrorKind::Internal, error.to_string()))?
        + "\n";

    let mut backup = None;
    if let Some(path) = output.filter(|_| !dry_run) {
        if path.exists() {
            let destination = backup_path(path)?;
            fs::copy(path, &destination)?;
            backup = Some(destination.to_string_lossy().into_owned());
        }
        atomic_write(path, rendered.as_bytes(), true)?;
    }
    Ok(SetupOutcome {
        path: output.map(|path| path.to_string_lossy().into_owned()),
        written: output.is_some() && !dry_run,
        backup_path: backup,
        config: merged,
    })
}

fn backup_path(path: &Path) -> Result<PathBuf> {
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| {
            AppError::validation(
                "output",
                "output path must name a file",
                "Use --output .mcp.json.",
            )
        })?;
    let timestamp = Utc::now().format("%Y%m%dT%H%M%S%.9fZ");
    Ok(path.with_file_name(format!("{name}.backup-{timestamp}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_config_uses_explicit_stdio_arguments() {
        let value = generate_config(
            Path::new("/opt/kessai-mcp"),
            Path::new("/data/kessai.db"),
            true,
        );
        assert_eq!(
            value["mcpServers"]["kessai"]["args"],
            json!(["--db-path", "/data/kessai.db", "serve", "--read-only"])
        );
        assert_eq!(value["mcpServers"]["kessai"]["command"], "/opt/kessai-mcp");
    }

    #[test]
    fn merge_preserves_other_keys_and_servers_and_replaces_only_kessai() {
        let generated = generate_config(
            Path::new("/new/kessai-mcp"),
            Path::new("/new/kessai.db"),
            false,
        );
        let merged = merge_config(
            Some(
                r#"{
                    "project": true,
                    "mcpServers": {
                        "other": {"command": "other"},
                        "kessai": {"command": "old"}
                    }
                }"#,
            ),
            &generated,
        )
        .unwrap();
        assert_eq!(merged["project"], true);
        assert_eq!(merged["mcpServers"]["other"]["command"], "other");
        assert_eq!(merged["mcpServers"]["kessai"]["command"], "/new/kessai-mcp");
    }

    #[test]
    fn merge_rejects_invalid_object_shapes() {
        let generated = generate_config(Path::new("/bin/kessai"), Path::new("/db"), false);
        assert!(merge_config(Some("[]"), &generated).is_err());
        assert!(merge_config(Some(r#"{"mcpServers": []}"#), &generated).is_err());
    }

    #[test]
    fn output_replacement_creates_backup_and_dry_run_does_not_write() {
        let dir = tempfile::tempdir().unwrap();
        let output = dir.path().join(".mcp.json");
        fs::write(
            &output,
            r#"{"keep":1,"mcpServers":{"other":{"command":"x"}}}"#,
        )
        .unwrap();
        run(
            Some(&output),
            Path::new("/bin/kessai"),
            Path::new("/db"),
            false,
            true,
        )
        .unwrap();
        assert!(!fs::read_to_string(&output).unwrap().contains("kessai"));

        run(
            Some(&output),
            Path::new("/bin/kessai"),
            Path::new("/db"),
            false,
            false,
        )
        .unwrap();
        assert_eq!(
            serde_json::from_str::<Value>(&fs::read_to_string(&output).unwrap()).unwrap()["keep"],
            1
        );
        assert_eq!(
            fs::read_dir(dir.path())
                .unwrap()
                .filter_map(|entry| entry.ok())
                .filter(|entry| entry.file_name().to_string_lossy().contains(".backup-"))
                .count(),
            1
        );
    }
}
