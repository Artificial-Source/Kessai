use super::*;
use std::path::{Path, PathBuf};

impl Application {
    /// Export a complete consistent backup; the destination is atomically installed.
    pub fn export_backup_to(&self, path: &Path, overwrite: bool) -> Result<ExportOutcome> {
        let path = absolute_file_path(path)?;
        let backup = self.core.data_management().export_data()?;
        let counts = counts(&backup);
        let bytes = serde_json::to_vec_pretty(&backup)
            .map_err(|error| AppError::Internal(error.to_string()))?;
        crate::fs::atomic_write(&path, &bytes, overwrite)?;
        Ok(ExportOutcome {
            path: path.to_string_lossy().into_owned(),
            bytes: bytes.len() as u64,
            version: backup.version,
            counts,
        })
    }
    /// Validate before any write. Import itself commits through core's transaction.
    pub fn import_backup_from(
        &self,
        path: &Path,
        mode: ImportMode,
        confirm: bool,
        dry_run: bool,
    ) -> Result<ImportResult> {
        let path = absolute_file_path(path)?;
        let bytes = std::fs::read(path)?;
        let backup: core::BackupData = serde_json::from_slice(&bytes)?;
        kessai_core::services::DataManagementService::validate_backup(&backup).map_err(|error| AppError::from(error).with_field("path").with_hint("Use a valid backup produced by backup_export, for example /tmp/kessai-backup.json; fix the record identified in message."))?;
        let incoming = counts(&backup);
        let collisions = self.import_collisions(&backup)?;
        // Core always restores settings. Existing-id records other than identical
        // seeded categories are overwrite collisions even if their values match.
        let requires_confirmation = mode == ImportMode::Replace || collisions.has_overwrites();
        if dry_run {
            return Ok(ImportResult::Preview(ImportPreview {
                dry_run: true,
                mode,
                version: backup.version,
                incoming,
                collisions,
                requires_confirmation,
            }));
        }
        if requires_confirmation {
            require_confirmation(confirm)?;
        }
        let version = backup.version.clone();
        self.core
            .data_management()
            .import_data(backup, mode == ImportMode::Replace)?;
        Ok(ImportResult::Imported(ImportOutcome {
            imported: true,
            mode,
            version,
            counts: incoming,
        }))
    }
    fn import_collisions(&self, backup: &core::BackupData) -> Result<BackupCounts> {
        let categories = self.core.categories().list()?;
        let category_ids: HashMap<_, _> = categories
            .iter()
            .map(|row| (row.id.as_str(), row))
            .collect();
        let cards = self.core.payment_cards().list()?;
        let payments = self.core.payments().list()?;
        let history = self.core.price_history().list()?;
        let ids: Vec<_> = backup
            .subscriptions
            .iter()
            .map(|row| row.id.clone())
            .collect();
        let tags = self.core.tags().list()?;
        let links = self.core.tags().list_links_for_subscriptions(&ids)?;
        let existing: HashSet<_> = links
            .iter()
            .map(|row| (row.subscription_id.as_str(), row.tag_id.as_str()))
            .collect();
        Ok(BackupCounts {
            categories: backup
                .categories
                .iter()
                .filter(|row| {
                    category_ids.get(row.id.as_str()).is_some_and(|existing| {
                        !row.is_default
                            || existing.name != row.name
                            || existing.color != row.color
                            || existing.icon != row.icon
                    })
                })
                .count(),
            subscriptions: backup.subscriptions.iter().try_fold(0, |count, row| {
                match self.core.subscriptions().get_name(&row.id) {
                    Ok(_) => Ok(count + 1),
                    Err(kessai_core::error::KessaiCoreError::NotFound(_)) => Ok(count),
                    Err(error) => Err(AppError::from(error)),
                }
            })?,
            cards: collision_count(
                backup.payment_cards.iter().map(|row| row.id.as_str()),
                cards.iter().map(|row| row.id.as_str()),
            ),
            payments: collision_count(
                backup.payments.iter().map(|row| row.id.as_str()),
                payments.iter().map(|row| row.id.as_str()),
            ),
            price_history: collision_count(
                backup.price_history.iter().map(|row| row.id.as_str()),
                history.iter().map(|row| row.id.as_str()),
            ),
            tags: collision_count(
                backup.tags.iter().map(|row| row.id.as_str()),
                tags.iter().map(|row| row.id.as_str()),
            ),
            tag_links: backup
                .subscription_tags
                .iter()
                .filter(|row| {
                    existing.contains(&(row.subscription_id.as_str(), row.tag_id.as_str()))
                })
                .count(),
        })
    }
}
fn counts(backup: &core::BackupData) -> BackupCounts {
    BackupCounts {
        subscriptions: backup.subscriptions.len(),
        categories: backup.categories.len(),
        cards: backup.payment_cards.len(),
        payments: backup.payments.len(),
        price_history: backup.price_history.len(),
        tags: backup.tags.len(),
        tag_links: backup.subscription_tags.len(),
    }
}
impl BackupCounts {
    fn has_overwrites(&self) -> bool {
        self.subscriptions > 0
            || self.categories > 0
            || self.cards > 0
            || self.payments > 0
            || self.price_history > 0
            || self.tags > 0
    }
}
fn collision_count<'a>(
    incoming: impl Iterator<Item = &'a str>,
    existing: impl Iterator<Item = &'a str>,
) -> usize {
    let existing: HashSet<_> = existing.collect();
    incoming.filter(|id| existing.contains(id)).count()
}
fn absolute_file_path(path: &Path) -> Result<PathBuf> {
    if path.as_os_str().is_empty() || path.file_name().is_none() {
        return Err(AppError::validation(
            "path",
            "path must name a file",
            "Use path=/tmp/kessai-backup.json.",
        ));
    }
    if path.is_absolute() {
        Ok(path.to_owned())
    } else {
        Ok(std::env::current_dir()?.join(path))
    }
}
