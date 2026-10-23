//! Atomic same-directory replacement, shared by setup and backup export.
use crate::app::{AppError, ErrorKind, Result, SideEffects};
use std::{io::Write, path::Path};

/// Write a complete file without exposing partial contents. No parent directories
/// are created. No-clobber uses the filesystem operation, not a racy exists check.
pub fn atomic_write(path: &Path, bytes: &[u8], overwrite: bool) -> Result<()> {
    if path.as_os_str().is_empty() || path.file_name().is_none() {
        return Err(AppError::validation(
            "path",
            "output path must name a file",
            "Use path=/tmp/kessai-backup.json.",
        ));
    }
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
    temporary.write_all(bytes)?;
    temporary.as_file().sync_all()?;
    let result = if overwrite {
        temporary.persist(path)
    } else {
        temporary.persist_noclobber(path)
    };
    result.map_err(|error| {
        if error.error.kind() == std::io::ErrorKind::AlreadyExists {
            AppError::new(ErrorKind::Conflict, "destination already exists").with_field("path").with_hint("Choose a new path, for example /tmp/kessai-backup-new.json, or set overwrite=true.")
        } else { AppError::from(error.error) }
    })?;
    #[cfg(unix)]
    std::fs::File::open(parent)
        .and_then(|directory| directory.sync_all())
        .map_err(|error| AppError::from(error).with_side_effects(SideEffects::Applied))?;
    Ok(())
}
