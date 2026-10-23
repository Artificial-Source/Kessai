use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum KessaiCoreError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Connection pool error: {0}")]
    Pool(#[from] r2d2::Error),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Conflict: {0}")]
    Conflict(String),

    #[error("Cannot delete default category")]
    CannotDeleteDefault,

    #[error("Import error: {0}")]
    Import(String),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

// Implement Serialize so Tauri commands can return KessaiCoreError
impl Serialize for KessaiCoreError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, KessaiCoreError>;
