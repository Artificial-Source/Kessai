use std::fs;
use std::io::Write;
use std::net::Ipv4Addr;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Weak};
use std::time::Duration;

use kessai_core::KessaiCore;
use kessai_web::{AppState, PreparedServer, ServerConfig};
use serde::{Deserialize, Serialize};
use tokio::sync::{watch, Mutex, OwnedMutexGuard};
use tokio::task::AbortHandle;
use uuid::Uuid;

const DEFAULT_PORT: u16 = 3000;
const MIN_PORT: u32 = 1024;
const MAX_PORT: u32 = 65_535;
const DEFAULT_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(3);
const IMPORT_BLOCKED_ERROR: &str = "Private Web Access is starting, running, or stopping. Stop Private Web Access before importing data.";

#[derive(Clone, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
struct PrivateWebAccessConfig {
    enabled: bool,
    port: u16,
    #[serde(default = "generate_access_key")]
    access_key: String,
}

impl Default for PrivateWebAccessConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            port: DEFAULT_PORT,
            access_key: generate_access_key(),
        }
    }
}

struct LoadedConfig {
    config: PrivateWebAccessConfig,
    generated_access_key: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum PrivateWebAccessState {
    Stopped,
    Starting,
    Running,
    Stopping,
    Error,
}

#[derive(Clone, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PrivateWebAccessStatus {
    state: PrivateWebAccessState,
    enabled: bool,
    port: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    serve_command: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    access_key: Option<String>,
}

struct ServerInstance {
    generation: u64,
    port: u16,
    access_key: String,
    shutdown: Option<tokio::sync::oneshot::Sender<()>>,
    completion: watch::Receiver<bool>,
    abort: AbortHandle,
}

struct RuntimeData {
    config: PrivateWebAccessConfig,
    config_valid: bool,
    config_needs_persist: bool,
    state: PrivateWebAccessState,
    error: Option<String>,
    generation: u64,
    server: Option<ServerInstance>,
}

#[derive(Clone)]
struct RuntimeSnapshot {
    active_server: Option<(u16, String)>,
    state: PrivateWebAccessState,
    error: Option<String>,
}

struct Shared {
    config_path: PathBuf,
    dist_dir: PathBuf,
    web_state: Arc<AppState>,
    operation_gate: Arc<Mutex<()>>,
    runtime: Mutex<RuntimeData>,
    shutdown_timeout: Duration,
}

#[derive(Clone)]
pub(crate) struct PrivateWebAccessManager {
    shared: Arc<Shared>,
}

impl PrivateWebAccessManager {
    pub(crate) fn new(
        config_path: PathBuf,
        dist_dir: PathBuf,
        core: KessaiCore,
        logos_dir: PathBuf,
    ) -> Self {
        Self::new_with_timeout(
            config_path,
            dist_dir,
            core,
            logos_dir,
            DEFAULT_SHUTDOWN_TIMEOUT,
        )
    }

    fn new_with_timeout(
        config_path: PathBuf,
        dist_dir: PathBuf,
        core: KessaiCore,
        logos_dir: PathBuf,
        shutdown_timeout: Duration,
    ) -> Self {
        let (config, config_valid, config_needs_persist, state, error) =
            match load_config(&config_path) {
                Ok(loaded) => (
                    loaded.config,
                    true,
                    loaded.generated_access_key,
                    PrivateWebAccessState::Stopped,
                    None,
                ),
                Err(error) => {
                    let message = format!(
                        "Private Web Access configuration is invalid and was disabled: {error}"
                    );
                    tracing::error!("{message}");
                    (
                        PrivateWebAccessConfig::default(),
                        false,
                        false,
                        PrivateWebAccessState::Error,
                        Some(message),
                    )
                }
            };

        Self {
            shared: Arc::new(Shared {
                config_path,
                dist_dir,
                web_state: Arc::new(AppState { core, logos_dir }),
                operation_gate: Arc::new(Mutex::new(())),
                runtime: Mutex::new(RuntimeData {
                    config,
                    config_valid,
                    config_needs_persist,
                    state,
                    error,
                    generation: 0,
                    server: None,
                }),
                shutdown_timeout,
            }),
        }
    }

    pub(crate) async fn status(&self) -> PrivateWebAccessStatus {
        let runtime = self.shared.runtime.lock().await;
        status_from_runtime(&runtime)
    }

    pub(crate) async fn auto_start(&self) {
        let _operation = self.shared.operation_gate.clone().lock_owned().await;
        let (config, needs_persist) = {
            let runtime = self.shared.runtime.lock().await;
            if !runtime.config.enabled || runtime.server.is_some() {
                return;
            }
            (runtime.config.clone(), runtime.config_needs_persist)
        };

        if let Err(error) = self
            .transition_runtime(true, config.port, &config.access_key, !needs_persist)
            .await
        {
            tracing::error!("failed to auto-start Private Web Access: {error}");
            return;
        }

        if needs_persist {
            if let Err(error) = persist_config(&self.shared.config_path, &config) {
                let message =
                    format!("Failed to save migrated Private Web Access configuration: {error}");
                if let Err(stop_error) = self.stop_server().await {
                    tracing::error!(
                        "failed to auto-start Private Web Access: {message}. {stop_error}"
                    );
                    return;
                }
                let mut runtime = self.shared.runtime.lock().await;
                runtime.state = PrivateWebAccessState::Error;
                runtime.error = Some(message.clone());
                tracing::error!("failed to auto-start Private Web Access: {message}");
                return;
            }

            let mut runtime = self.shared.runtime.lock().await;
            runtime.config_needs_persist = false;
            runtime.config_valid = true;
            if runtime.server.is_some() && runtime.state == PrivateWebAccessState::Starting {
                runtime.state = PrivateWebAccessState::Running;
                tracing::info!(
                    "Private Web Access started on http://127.0.0.1:{}",
                    config.port
                );
            }
        }
    }

    pub(crate) async fn apply(
        &self,
        enabled: bool,
        requested_port: u32,
    ) -> Result<PrivateWebAccessStatus, String> {
        let port = validate_port(requested_port)?;
        let _operation = self.shared.operation_gate.clone().lock_owned().await;

        let (previous_config, config_valid, config_needs_persist, previous_runtime) = {
            let runtime = self.shared.runtime.lock().await;
            (
                runtime.config.clone(),
                runtime.config_valid,
                runtime.config_needs_persist,
                RuntimeSnapshot {
                    active_server: runtime
                        .server
                        .as_ref()
                        .map(|server| (server.port, server.access_key.clone())),
                    state: runtime.state,
                    error: runtime.error.clone(),
                },
            )
        };
        let desired = PrivateWebAccessConfig {
            enabled,
            port,
            access_key: if enabled && !previous_config.enabled {
                generate_access_key()
            } else {
                previous_config.access_key.clone()
            },
        };
        let runtime_matches = if enabled {
            previous_runtime.state == PrivateWebAccessState::Running
                && previous_runtime.active_server.as_ref().is_some_and(
                    |(active_port, active_key)| {
                        *active_port == port && active_key == &desired.access_key
                    },
                )
        } else {
            previous_runtime.state == PrivateWebAccessState::Stopped
                && previous_runtime.active_server.is_none()
        };
        let stable_noop =
            previous_config == desired && config_valid && !config_needs_persist && runtime_matches;

        if stable_noop {
            return Ok(self.status().await);
        }

        self.transition_runtime(enabled, port, &desired.access_key, true)
            .await?;

        let must_persist = !config_valid || config_needs_persist || previous_config != desired;
        if must_persist {
            if let Err(error) = persist_config(&self.shared.config_path, &desired) {
                let persistence_error =
                    format!("Failed to save Private Web Access configuration: {error}");
                let rollback_error = self.restore_runtime(previous_runtime).await.err();
                return Err(match rollback_error {
                    Some(rollback_error) => format!(
                        "{persistence_error}. The previous runtime state could not be restored: {rollback_error}"
                    ),
                    None => persistence_error,
                });
            }
        }

        {
            let mut runtime = self.shared.runtime.lock().await;
            runtime.config = desired;
            runtime.config_valid = true;
            runtime.config_needs_persist = false;
        }

        Ok(self.status().await)
    }

    pub(crate) async fn begin_import(&self) -> Result<OwnedMutexGuard<()>, String> {
        let operation = self.shared.operation_gate.clone().lock_owned().await;
        let runtime = self.shared.runtime.lock().await;
        if runtime.server.is_some()
            || matches!(
                runtime.state,
                PrivateWebAccessState::Starting
                    | PrivateWebAccessState::Running
                    | PrivateWebAccessState::Stopping
            )
        {
            return Err(IMPORT_BLOCKED_ERROR.to_string());
        }
        drop(runtime);
        Ok(operation)
    }

    pub(crate) async fn shutdown_for_exit(&self) {
        let shutdown = async {
            let _operation = self.shared.operation_gate.clone().lock_owned().await;
            self.stop_server().await
        };
        let total_timeout = self.shared.shutdown_timeout + Duration::from_secs(1);
        match tokio::time::timeout(total_timeout, shutdown).await {
            Ok(Ok(())) => {}
            Ok(Err(error)) => {
                tracing::warn!("{error}; force-aborting for application exit");
                self.force_abort_active().await;
            }
            Err(_) => {
                tracing::warn!("timed out waiting for Private Web Access to shut down");
                self.force_abort_active().await;
            }
        }
    }

    async fn transition_runtime(
        &self,
        enabled: bool,
        port: u16,
        access_key: &str,
        report_running: bool,
    ) -> Result<(), String> {
        if !enabled {
            return self.stop_server().await;
        }

        {
            let runtime = self.shared.runtime.lock().await;
            if runtime.state == PrivateWebAccessState::Running
                && runtime
                    .server
                    .as_ref()
                    .is_some_and(|server| server.port == port && server.access_key == access_key)
            {
                return Ok(());
            }
        }

        let (previous_server, previous_state, previous_error) = {
            let mut runtime = self.shared.runtime.lock().await;
            let previous_server = runtime
                .server
                .as_ref()
                .map(|server| (server.port, server.access_key.clone()));
            let previous_state = runtime.state;
            let previous_error = runtime.error.clone();
            if previous_server.is_none() {
                runtime.state = PrivateWebAccessState::Starting;
                runtime.error = None;
            }
            (previous_server, previous_state, previous_error)
        };

        let prepared = match self.prepare_server(port, access_key).await {
            Ok(prepared) => prepared,
            Err(error) => {
                let mut runtime = self.shared.runtime.lock().await;
                if previous_server.is_some() && runtime.server.is_some() {
                    runtime.state = previous_state;
                    runtime.error = previous_error;
                } else {
                    runtime.state = PrivateWebAccessState::Error;
                    runtime.error = Some(error.clone());
                }
                return Err(error);
            }
        };

        if previous_server.is_some() {
            self.stop_server().await?;
        }
        let started_state = if report_running {
            PrivateWebAccessState::Running
        } else {
            PrivateWebAccessState::Starting
        };
        if let Err(start_error) = self
            .launch_prepared(prepared, access_key.to_string(), started_state)
            .await
        {
            let Some((previous_port, previous_key)) = previous_server else {
                let mut runtime = self.shared.runtime.lock().await;
                runtime.state = PrivateWebAccessState::Error;
                runtime.error = Some(start_error.clone());
                return Err(start_error);
            };
            let restore_result = match self.prepare_server(previous_port, &previous_key).await {
                Ok(previous) => {
                    self.launch_prepared(previous, previous_key, PrivateWebAccessState::Running)
                        .await
                }
                Err(error) => Err(error),
            };
            if let Err(restore_error) = restore_result {
                let message = format!(
                    "{start_error}. The previous Private Web Access server could not be restored: {restore_error}"
                );
                let mut runtime = self.shared.runtime.lock().await;
                runtime.state = PrivateWebAccessState::Error;
                runtime.error = Some(message.clone());
                return Err(message);
            }
            return Err(start_error);
        }
        Ok(())
    }

    async fn prepare_server(&self, port: u16, access_key: &str) -> Result<PreparedServer, String> {
        let listener = tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, port))
            .await
            .map_err(|error| {
                format!("Failed to bind Private Web Access to 127.0.0.1:{port}: {error}")
            })?;
        let config =
            ServerConfig::private_hosted(self.shared.dist_dir.clone(), access_key.to_string())
                .map_err(|error| format!("Failed to configure Private Web Access: {error:#}"))?;
        kessai_web::prepare(listener, self.shared.web_state.clone(), &config)
            .map_err(|error| format!("Failed to prepare Private Web Access: {error:#}"))
    }

    async fn launch_prepared(
        &self,
        prepared: PreparedServer,
        access_key: String,
        started_state: PrivateWebAccessState,
    ) -> Result<(), String> {
        let port = prepared
            .local_addr()
            .map_err(|error| format!("Failed to read the Private Web Access address: {error}"))?
            .port();
        let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
        let (completion_tx, completion_rx) = watch::channel(false);

        let mut runtime = self.shared.runtime.lock().await;
        if runtime.server.is_some() {
            return Err(
                "Private Web Access could not start because another managed server is still active"
                    .to_string(),
            );
        }
        runtime.generation = runtime.generation.wrapping_add(1);
        let generation = runtime.generation;
        let weak = Arc::downgrade(&self.shared);
        let task = tokio::spawn(async move {
            let result = kessai_web::serve_prepared(prepared, async move {
                let _ = shutdown_rx.await;
            })
            .await;
            let exit_error = result.err().map(|error| format!("{error:#}"));
            record_server_exit(weak, generation, exit_error).await;
            let _ = completion_tx.send(true);
        });

        runtime.server = Some(ServerInstance {
            generation,
            port,
            access_key,
            shutdown: Some(shutdown_tx),
            completion: completion_rx,
            abort: task.abort_handle(),
        });
        runtime.state = started_state;
        runtime.error = None;
        if started_state == PrivateWebAccessState::Running {
            tracing::info!("Private Web Access started on http://127.0.0.1:{port}");
        }
        Ok(())
    }

    async fn stop_server(&self) -> Result<(), String> {
        let Some((generation, shutdown, mut completion)) = (async {
            let mut runtime = self.shared.runtime.lock().await;
            let server = match runtime.server.as_mut() {
                Some(server) => (
                    server.generation,
                    server.shutdown.take(),
                    server.completion.clone(),
                ),
                None => {
                    runtime.state = PrivateWebAccessState::Stopped;
                    runtime.error = None;
                    return None;
                }
            };
            runtime.state = PrivateWebAccessState::Stopping;
            runtime.error = None;
            Some(server)
        })
        .await
        else {
            return Ok(());
        };

        if let Some(shutdown) = shutdown {
            let _ = shutdown.send(());
        }

        let completed = if *completion.borrow() {
            true
        } else {
            matches!(
                tokio::time::timeout(self.shared.shutdown_timeout, completion.changed()).await,
                Ok(Ok(()))
            )
        };

        if completed {
            return Ok(());
        }

        let error = "Private Web Access did not stop before the shutdown timeout; waiting for active requests to finish".to_string();
        let mut runtime = self.shared.runtime.lock().await;
        if runtime
            .server
            .as_ref()
            .is_some_and(|server| server.generation == generation)
        {
            runtime.state = PrivateWebAccessState::Stopping;
            runtime.error = Some(error.clone());
            tracing::warn!("{error}");
            return Err(error);
        }

        Ok(())
    }

    async fn restore_runtime(&self, snapshot: RuntimeSnapshot) -> Result<(), String> {
        match &snapshot.active_server {
            Some((port, access_key)) => {
                self.transition_runtime(true, *port, access_key, true)
                    .await?
            }
            None => {
                let access_key = self.shared.runtime.lock().await.config.access_key.clone();
                self.transition_runtime(false, DEFAULT_PORT, &access_key, true)
                    .await?
            }
        }

        let mut runtime = self.shared.runtime.lock().await;
        runtime.state = snapshot.state;
        runtime.error = snapshot.error;
        Ok(())
    }

    async fn force_abort_active(&self) {
        let mut runtime = self.shared.runtime.lock().await;
        if let Some(server) = runtime.server.take() {
            server.abort.abort();
        }
        runtime.state = PrivateWebAccessState::Stopped;
        runtime.error = None;
    }
}

async fn record_server_exit(shared: Weak<Shared>, generation: u64, exit_error: Option<String>) {
    let Some(shared) = shared.upgrade() else {
        return;
    };
    let mut runtime = shared.runtime.lock().await;
    if runtime
        .server
        .as_ref()
        .is_none_or(|server| server.generation != generation)
    {
        return;
    }

    let expected = runtime.state == PrivateWebAccessState::Stopping;
    runtime.server = None;
    if expected {
        runtime.state = PrivateWebAccessState::Stopped;
        runtime.error = None;
    } else {
        let error = exit_error.map_or_else(
            || "Private Web Access server stopped unexpectedly".to_string(),
            |error| format!("Private Web Access server exited unexpectedly: {error}"),
        );
        tracing::error!("{error}");
        runtime.state = PrivateWebAccessState::Error;
        runtime.error = Some(error);
    }
}

fn status_from_runtime(runtime: &RuntimeData) -> PrivateWebAccessStatus {
    PrivateWebAccessStatus {
        state: runtime.state,
        enabled: runtime.config.enabled,
        port: runtime.config.port,
        error: runtime.error.clone(),
        serve_command: serve_command(runtime.config.port),
        access_key: runtime
            .config
            .enabled
            .then(|| runtime.config.access_key.clone()),
    }
}

fn serve_command(port: u16) -> String {
    format!("tailscale serve --bg http://127.0.0.1:{port}")
}

fn validate_port(port: u32) -> Result<u16, String> {
    if !(MIN_PORT..=MAX_PORT).contains(&port) {
        return Err(format!(
            "Private Web Access port must be between {MIN_PORT} and {MAX_PORT}"
        ));
    }
    Ok(port as u16)
}

fn generate_access_key() -> String {
    Uuid::new_v4().simple().to_string()
}

fn load_config(path: &Path) -> Result<LoadedConfig, String> {
    let contents = match fs::read(path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(LoadedConfig {
                config: PrivateWebAccessConfig::default(),
                generated_access_key: false,
            });
        }
        Err(error) => return Err(format!("failed to read '{}': {error}", path.display())),
    };
    let value: serde_json::Value = serde_json::from_slice(&contents)
        .map_err(|error| format!("failed to parse '{}': {error}", path.display()))?;
    let generated_access_key = value
        .as_object()
        .is_some_and(|object| !object.contains_key("access_key"));
    let config: PrivateWebAccessConfig = serde_json::from_value(value)
        .map_err(|error| format!("failed to parse '{}': {error}", path.display()))?;
    validate_port(u32::from(config.port))?;
    if config.access_key.is_empty() {
        return Err("Private Web Access access key cannot be empty".to_string());
    }
    Ok(LoadedConfig {
        config,
        generated_access_key,
    })
}

fn persist_config(path: &Path, config: &PrivateWebAccessConfig) -> Result<(), String> {
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(parent).map_err(|error| {
        format!(
            "failed to create configuration directory '{}': {error}",
            parent.display()
        )
    })?;

    let mut staged = tempfile::Builder::new()
        .prefix(".private-web-access-")
        .tempfile_in(parent)
        .map_err(|error| format!("failed to stage configuration: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        staged
            .as_file()
            .set_permissions(fs::Permissions::from_mode(0o600))
            .map_err(|error| format!("failed to secure staged configuration: {error}"))?;
    }
    serde_json::to_writer_pretty(staged.as_file_mut(), config)
        .map_err(|error| format!("failed to write staged configuration: {error}"))?;
    staged
        .as_file_mut()
        .write_all(b"\n")
        .map_err(|error| format!("failed to finish staged configuration: {error}"))?;
    staged
        .as_file_mut()
        .sync_all()
        .map_err(|error| format!("failed to sync staged configuration: {error}"))?;
    staged.persist(path).map_err(|error| {
        format!(
            "failed to atomically replace '{}': {}",
            path.display(),
            error.error
        )
    })?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn get_private_web_access_status(
    manager: tauri::State<'_, PrivateWebAccessManager>,
) -> Result<PrivateWebAccessStatus, String> {
    Ok(manager.status().await)
}

#[tauri::command]
pub(crate) async fn apply_private_web_access(
    manager: tauri::State<'_, PrivateWebAccessManager>,
    enabled: bool,
    port: u32,
) -> Result<PrivateWebAccessStatus, String> {
    manager.apply(enabled, port).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::TempDir;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    struct Fixture {
        _temp: TempDir,
        manager: PrivateWebAccessManager,
    }

    fn fixture() -> Fixture {
        let temp = tempfile::tempdir().unwrap();
        let manager = manager_in(&temp, Duration::from_millis(500));
        Fixture {
            _temp: temp,
            manager,
        }
    }

    fn manager_in(temp: &TempDir, timeout: Duration) -> PrivateWebAccessManager {
        let dist_dir = temp.path().join("dist");
        let logos_dir = temp.path().join("logos");
        fs::create_dir_all(&dist_dir).unwrap();
        fs::create_dir_all(&logos_dir).unwrap();
        fs::write(
            dist_dir.join("index.html"),
            "<!doctype html><title>Kessai</title>",
        )
        .unwrap();
        let core = KessaiCore::new(&temp.path().join("kessai.db")).unwrap();
        PrivateWebAccessManager::new_with_timeout(
            temp.path().join("private-web-access.json"),
            dist_dir,
            core,
            logos_dir,
            timeout,
        )
    }

    fn free_port() -> u16 {
        let listener = std::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        listener.local_addr().unwrap().port()
    }

    #[test]
    fn config_defaults_migrates_and_roundtrips_access_key() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("private-web-access.json");
        let default = load_config(&path).unwrap();
        assert!(!default.config.enabled);
        assert_eq!(default.config.port, DEFAULT_PORT);
        assert!(!default.config.access_key.is_empty());
        assert!(!default.generated_access_key);

        fs::write(&path, br#"{"enabled":true,"port":4321}"#).unwrap();
        let migrated = load_config(&path).unwrap();
        assert!(migrated.config.enabled);
        assert_eq!(migrated.config.port, 4321);
        assert!(!migrated.config.access_key.is_empty());
        assert!(migrated.generated_access_key);

        persist_config(&path, &migrated.config).unwrap();
        let loaded = load_config(&path).unwrap();
        assert!(!loaded.generated_access_key);
        assert_eq!(loaded.config.enabled, migrated.config.enabled);
        assert_eq!(loaded.config.port, migrated.config.port);
        assert!(loaded.config.access_key == migrated.config.access_key);
        let value = serde_json::from_slice::<serde_json::Value>(&fs::read(path).unwrap()).unwrap();
        assert_eq!(value["enabled"], true);
        assert_eq!(value["port"], 4321);
        assert!(value["access_key"].as_str() == Some(loaded.config.access_key.as_str()));
    }

    #[cfg(unix)]
    #[test]
    fn persisted_config_is_owner_only() {
        use std::os::unix::fs::PermissionsExt;

        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("private-web-access.json");
        persist_config(&path, &PrivateWebAccessConfig::default()).unwrap();

        let mode = fs::metadata(path).unwrap().permissions().mode();
        assert_eq!(mode & 0o077, 0);
    }

    #[tokio::test]
    async fn malformed_config_fails_closed_and_surfaces_an_error_without_a_key() {
        let temp = tempfile::tempdir().unwrap();
        let config_path = temp.path().join("private-web-access.json");
        fs::write(&config_path, br#"{"enabled":true,"port":80}"#).unwrap();
        let manager = manager_in(&temp, Duration::from_millis(500));

        let status = manager.status().await;
        assert_eq!(status.state, PrivateWebAccessState::Error);
        assert!(!status.enabled);
        assert_eq!(status.port, DEFAULT_PORT);
        assert!(status.access_key.is_none());
        assert!(status.error.unwrap().contains("invalid and was disabled"));
    }

    #[test]
    fn port_bounds_are_enforced() {
        assert!(validate_port(1023).is_err());
        assert_eq!(validate_port(1024).unwrap(), 1024);
        assert_eq!(validate_port(65_535).unwrap(), 65_535);
        assert!(validate_port(65_536).is_err());
    }

    #[test]
    fn status_serializes_access_key_only_while_enabled() {
        let enabled = PrivateWebAccessStatus {
            state: PrivateWebAccessState::Starting,
            enabled: true,
            port: 4321,
            error: None,
            serve_command: serve_command(4321),
            access_key: Some("test-access-key".to_string()),
        };
        assert_eq!(
            serde_json::to_value(enabled).unwrap(),
            json!({
                "state": "starting",
                "enabled": true,
                "port": 4321,
                "serveCommand": "tailscale serve --bg http://127.0.0.1:4321",
                "accessKey": "test-access-key"
            })
        );

        let disabled = PrivateWebAccessStatus {
            state: PrivateWebAccessState::Stopped,
            enabled: false,
            port: 4321,
            error: None,
            serve_command: serve_command(4321),
            access_key: None,
        };
        assert!(serde_json::to_value(disabled)
            .unwrap()
            .get("accessKey")
            .is_none());
    }

    #[tokio::test]
    async fn occupied_port_does_not_persist_enabled_config() {
        let fixture = fixture();
        let occupied = std::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = occupied.local_addr().unwrap().port();

        let error = fixture
            .manager
            .apply(true, u32::from(port))
            .await
            .err()
            .unwrap();
        assert!(error.contains("Failed to bind"));
        assert!(!fixture.shared_config_path().exists());
        let status = fixture.manager.status().await;
        assert!(!status.enabled);
        assert!(status.access_key.is_none());
        assert_eq!(status.state, PrivateWebAccessState::Error);
    }

    #[tokio::test]
    async fn old_enabled_config_persists_migration_key_and_reuses_it_after_restart() {
        let temp = tempfile::tempdir().unwrap();
        let port = free_port();
        let config_path = temp.path().join("private-web-access.json");
        fs::write(
            &config_path,
            serde_json::to_vec_pretty(&json!({ "enabled": true, "port": port })).unwrap(),
        )
        .unwrap();

        let manager = manager_in(&temp, Duration::from_millis(500));
        manager.auto_start().await;
        let first = manager.status().await;
        assert_eq!(first.state, PrivateWebAccessState::Running);
        let first_key = first.access_key.unwrap();
        let persisted = load_config(&config_path).unwrap();
        assert!(!persisted.generated_access_key);
        assert!(persisted.config.access_key == first_key);
        manager.shutdown_for_exit().await;

        let restarted = manager_in(&temp, Duration::from_millis(500));
        restarted.auto_start().await;
        let second = restarted.status().await;
        assert_eq!(second.state, PrivateWebAccessState::Running);
        assert!(second.access_key.as_deref() == Some(first_key.as_str()));
        restarted.shutdown_for_exit().await;
    }

    #[tokio::test]
    async fn auto_start_migration_persistence_failure_stops_server_and_reports_error() {
        let temp = tempfile::tempdir().unwrap();
        let port = free_port();
        let config_path = temp.path().join("private-web-access.json");
        fs::write(
            &config_path,
            serde_json::to_vec_pretty(&json!({ "enabled": true, "port": port })).unwrap(),
        )
        .unwrap();
        let manager = manager_in(&temp, Duration::from_millis(500));
        fs::remove_file(&config_path).unwrap();
        fs::create_dir(&config_path).unwrap();

        manager.auto_start().await;
        let status = manager.status().await;
        assert!(status.enabled);
        assert!(status.access_key.is_some());
        assert_eq!(status.state, PrivateWebAccessState::Error);
        assert!(status.error.unwrap().contains("Failed to save migrated"));
        let rebound = std::net::TcpListener::bind((Ipv4Addr::LOCALHOST, port)).unwrap();
        drop(rebound);
    }

    #[tokio::test]
    async fn auto_start_failure_keeps_the_persisted_enabled_config_and_key() {
        let temp = tempfile::tempdir().unwrap();
        let occupied = std::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = occupied.local_addr().unwrap().port();
        let config_path = temp.path().join("private-web-access.json");
        let config = PrivateWebAccessConfig {
            enabled: true,
            port,
            access_key: generate_access_key(),
        };
        persist_config(&config_path, &config).unwrap();
        let manager = manager_in(&temp, Duration::from_millis(500));

        manager.auto_start().await;
        let status = manager.status().await;
        assert!(status.enabled);
        assert_eq!(status.port, port);
        assert!(status.access_key.as_deref() == Some(config.access_key.as_str()));
        assert_eq!(status.state, PrivateWebAccessState::Error);
        assert!(status.error.unwrap().contains("Failed to bind"));
    }

    #[tokio::test]
    async fn persistence_failure_restores_the_inactive_runtime_and_prior_key() {
        let temp = tempfile::tempdir().unwrap();
        let config_path = temp.path().join("private-web-access.json");
        fs::create_dir(&config_path).unwrap();
        let manager = manager_in(&temp, Duration::from_millis(500));
        let prior_key = manager
            .shared
            .runtime
            .lock()
            .await
            .config
            .access_key
            .clone();
        let port = free_port();

        let error = manager.apply(true, u32::from(port)).await.err().unwrap();
        assert!(error.contains("Failed to save"));
        let status = manager.status().await;
        assert!(!status.enabled);
        assert!(status.access_key.is_none());
        assert!(manager.shared.runtime.lock().await.config.access_key == prior_key);
        assert_eq!(status.state, PrivateWebAccessState::Error);
        let rebound = std::net::TcpListener::bind((Ipv4Addr::LOCALHOST, port)).unwrap();
        drop(rebound);
    }

    #[tokio::test]
    async fn key_is_stable_for_noop_port_change_and_failed_switch_then_rotates_on_reenable() {
        let fixture = fixture();
        let first_port = free_port();
        let mut second_port = free_port();
        while second_port == first_port {
            second_port = free_port();
        }

        let started = fixture
            .manager
            .apply(true, u32::from(first_port))
            .await
            .unwrap();
        assert_eq!(started.state, PrivateWebAccessState::Running);
        let first_key = started.access_key.unwrap();
        let first_generation = fixture.manager.shared.runtime.lock().await.generation;

        let unchanged = fixture
            .manager
            .apply(true, u32::from(first_port))
            .await
            .unwrap();
        assert!(unchanged.access_key.as_deref() == Some(first_key.as_str()));
        assert_eq!(
            fixture.manager.shared.runtime.lock().await.generation,
            first_generation
        );

        let occupied = std::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let occupied_port = occupied.local_addr().unwrap().port();
        assert!(fixture
            .manager
            .apply(true, u32::from(occupied_port))
            .await
            .is_err());
        let after_failure = fixture.manager.status().await;
        assert_eq!(after_failure.state, PrivateWebAccessState::Running);
        assert_eq!(after_failure.port, first_port);
        assert!(after_failure.access_key.as_deref() == Some(first_key.as_str()));
        drop(occupied);

        let restarted = fixture
            .manager
            .apply(true, u32::from(second_port))
            .await
            .unwrap();
        assert_eq!(restarted.state, PrivateWebAccessState::Running);
        assert!(restarted.access_key.as_deref() == Some(first_key.as_str()));
        let rebound = std::net::TcpListener::bind((Ipv4Addr::LOCALHOST, first_port)).unwrap();
        drop(rebound);

        let stopped = fixture
            .manager
            .apply(false, u32::from(second_port))
            .await
            .unwrap();
        assert_eq!(stopped.state, PrivateWebAccessState::Stopped);
        assert!(!stopped.enabled);
        assert!(stopped.access_key.is_none());

        let reenabled = fixture
            .manager
            .apply(true, u32::from(second_port))
            .await
            .unwrap();
        assert_eq!(reenabled.state, PrivateWebAccessState::Running);
        assert!(reenabled.access_key.is_some());
        assert!(reenabled.access_key.as_deref() != Some(first_key.as_str()));
    }

    #[tokio::test]
    async fn persistence_failure_during_port_switch_restores_server_and_key() {
        let fixture = fixture();
        let first_port = free_port();
        let mut second_port = free_port();
        while second_port == first_port {
            second_port = free_port();
        }
        let started = fixture
            .manager
            .apply(true, u32::from(first_port))
            .await
            .unwrap();
        let first_key = started.access_key.unwrap();
        fs::remove_file(fixture.shared_config_path()).unwrap();
        fs::create_dir(fixture.shared_config_path()).unwrap();

        let error = fixture
            .manager
            .apply(true, u32::from(second_port))
            .await
            .err()
            .unwrap();
        assert!(error.contains("Failed to save"));
        let restored = fixture.manager.status().await;
        assert_eq!(restored.state, PrivateWebAccessState::Running);
        assert_eq!(restored.port, first_port);
        assert!(restored.access_key.as_deref() == Some(first_key.as_str()));
        let runtime = fixture.manager.shared.runtime.lock().await;
        let server = runtime.server.as_ref().unwrap();
        assert_eq!(server.port, first_port);
        assert!(server.access_key == first_key);
    }

    #[tokio::test]
    async fn unexpected_exit_sets_error_and_stale_generation_is_ignored() {
        let fixture = fixture();
        let port = free_port();
        fixture.manager.apply(true, u32::from(port)).await.unwrap();
        let (generation, abort) = {
            let runtime = fixture.manager.shared.runtime.lock().await;
            let server = runtime.server.as_ref().unwrap();
            (server.generation, server.abort.clone())
        };

        record_server_exit(
            Arc::downgrade(&fixture.manager.shared),
            generation.wrapping_add(1),
            Some("stale failure".to_string()),
        )
        .await;
        assert_eq!(
            fixture.manager.status().await.state,
            PrivateWebAccessState::Running
        );

        record_server_exit(
            Arc::downgrade(&fixture.manager.shared),
            generation,
            Some("accept loop failed".to_string()),
        )
        .await;
        let status = fixture.manager.status().await;
        assert_eq!(status.state, PrivateWebAccessState::Error);
        assert!(status.error.unwrap().contains("accept loop failed"));
        abort.abort();
    }

    #[tokio::test]
    async fn shutdown_timeout_keeps_import_blocked_until_slow_request_finishes() {
        let temp = tempfile::tempdir().unwrap();
        let manager = manager_in(&temp, Duration::from_millis(50));
        let port = free_port();
        let started = manager.apply(true, u32::from(port)).await.unwrap();
        let access_key = started.access_key.unwrap();
        let origin = format!("http://127.0.0.1:{port}");
        let login = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap()
            .post(format!("{origin}/__kessai/private-access"))
            .header(reqwest::header::ORIGIN, &origin)
            .header(
                reqwest::header::CONTENT_TYPE,
                "application/x-www-form-urlencoded",
            )
            .body(format!("access_key={access_key}"))
            .send()
            .await
            .unwrap();
        assert_eq!(login.status(), reqwest::StatusCode::SEE_OTHER);
        let cookie = login.headers()[reqwest::header::SET_COOKIE]
            .to_str()
            .unwrap()
            .split(';')
            .next()
            .unwrap();
        assert_ne!(cookie, format!("kessai_private_access={access_key}"));
        let body = br##"{"name":"Slow request","color":"#ffffff","icon":"clock"}"##;

        let mut request = tokio::net::TcpStream::connect((Ipv4Addr::LOCALHOST, port))
            .await
            .unwrap();
        request
            .write_all(
                format!(
                    "POST /api/categories HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nOrigin: http://127.0.0.1:{port}\r\nCookie: {cookie}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nExpect: 100-continue\r\nConnection: close\r\n\r\n",
                    body.len()
                )
                .as_bytes(),
            )
            .await
            .unwrap();

        let mut interim_response = Vec::new();
        tokio::time::timeout(Duration::from_secs(1), async {
            while !interim_response.ends_with(b"\r\n\r\n") {
                let mut bytes = [0; 128];
                let read = request.read(&mut bytes).await.unwrap();
                assert!(read > 0, "server closed before accepting the slow request");
                interim_response.extend_from_slice(&bytes[..read]);
            }
        })
        .await
        .expect("server did not acknowledge the slow request");
        assert!(interim_response.starts_with(b"HTTP/1.1 100 Continue\r\n"));

        let error = manager
            .apply(false, u32::from(port))
            .await
            .err()
            .expect("disable should time out while the request body is incomplete");
        assert!(error.contains("did not stop before the shutdown timeout"));

        let stopping = manager.status().await;
        assert_eq!(stopping.state, PrivateWebAccessState::Stopping);
        assert!(stopping.error.as_deref() == Some(error.as_str()));
        assert!(manager.shared.runtime.lock().await.server.is_some());
        assert_eq!(
            manager.begin_import().await.unwrap_err(),
            IMPORT_BLOCKED_ERROR
        );

        let persisted = load_config(&manager.shared.config_path).unwrap().config;
        assert!(persisted.enabled);
        assert_eq!(persisted.port, port);

        request.write_all(body).await.unwrap();
        let mut final_response = Vec::new();
        tokio::time::timeout(
            Duration::from_secs(1),
            request.read_to_end(&mut final_response),
        )
        .await
        .expect("slow request did not finish")
        .unwrap();
        assert!(final_response.starts_with(b"HTTP/1.1 201 Created\r\n"));

        tokio::time::timeout(Duration::from_secs(1), async {
            loop {
                if manager.status().await.state == PrivateWebAccessState::Stopped {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("server did not finish draining the slow request");
        assert!(manager
            .shared
            .web_state
            .core
            .categories()
            .list()
            .unwrap()
            .iter()
            .any(|category| category.name == "Slow request"));

        let import = manager.begin_import().await.unwrap();
        drop(import);
    }

    #[tokio::test]
    async fn import_guard_shares_the_apply_gate_and_rejects_active_access() {
        let fixture = fixture();
        let port = free_port();
        let import_guard = fixture.manager.begin_import().await.unwrap();
        let manager = fixture.manager.clone();
        let mut apply = tokio::spawn(async move { manager.apply(true, u32::from(port)).await });

        assert!(tokio::time::timeout(Duration::from_millis(50), &mut apply)
            .await
            .is_err());
        drop(import_guard);
        apply.await.unwrap().unwrap();

        let error = fixture.manager.begin_import().await.unwrap_err();
        assert_eq!(error, IMPORT_BLOCKED_ERROR);
        fixture.manager.apply(false, u32::from(port)).await.unwrap();
    }

    impl Fixture {
        fn shared_config_path(&self) -> &Path {
            &self.manager.shared.config_path
        }
    }
}
