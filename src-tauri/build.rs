use std::path::Path;

fn main() {
    // Tauri copies bundle resources even for debug builds. Keep a fresh clone
    // usable with `tauri dev` when the generated SPA does not exist yet; release
    // builds still require `beforeBuildCommand` to create the bundled dist.
    if std::env::var("PROFILE").as_deref() == Ok("debug") && !Path::new("../dist").exists() {
        let mut config = std::env::var("TAURI_CONFIG")
            .ok()
            .map(|value| {
                serde_json::from_str(&value).expect("TAURI_CONFIG must contain valid JSON")
            })
            .unwrap_or_else(|| serde_json::json!({}));
        config["bundle"]["resources"] = serde_json::json!([]);
        std::env::set_var("TAURI_CONFIG", config.to_string());
    }

    tauri_build::build()
}
