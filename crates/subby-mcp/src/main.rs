mod cli;
mod mcp;

use std::path::PathBuf;

use clap::Parser;
use rmcp::{transport::stdio, ServiceExt};
use subby_core::SubbyCore;

#[derive(Parser)]
#[command(
    name = "subby-mcp",
    about = "Subby subscription tracker — CLI & MCP server",
    version
)]
struct Cli {
    /// Path to the Subby database file
    #[arg(long, env = "SUBBY_DB_PATH", global = true)]
    db_path: Option<PathBuf>,

    #[command(subcommand)]
    command: Option<cli::Command>,
}

fn resolve_db_path(cli_path: Option<PathBuf>) -> PathBuf {
    if let Some(path) = cli_path {
        return path;
    }

    if let Some(data_dir) = dirs::data_dir() {
        let app_dir = data_dir.join("com.asf.subby");
        std::fs::create_dir_all(&app_dir).ok();
        return app_dir.join("subby.db");
    }

    PathBuf::from("subby.db")
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    let db_path = resolve_db_path(cli.db_path);

    match cli.command {
        // No subcommand or explicit `serve` -> MCP server mode
        None | Some(cli::Command::Serve) => {
            // Set up log directory next to the database
            let db_dir = db_path.parent().unwrap_or_else(|| std::path::Path::new("."));
            let logs_dir = db_dir.join("logs");
            std::fs::create_dir_all(&logs_dir).ok();

            let file_appender = tracing_appender::rolling::daily(&logs_dir, "subby-mcp.log");
            let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);

            let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| {
                    tracing_subscriber::EnvFilter::new("info")
                        .add_directive("subby_mcp=info".parse().unwrap())
                        .add_directive("subby_core=debug".parse().unwrap())
                });

            use tracing_subscriber::layer::SubscriberExt;
            use tracing_subscriber::util::SubscriberInitExt;

            // Log to stderr (MCP protocol uses stdout) and to file
            tracing_subscriber::registry()
                .with(env_filter)
                .with(
                    tracing_subscriber::fmt::layer()
                        .with_writer(std::io::stderr)
                )
                .with(
                    tracing_subscriber::fmt::layer()
                        .with_writer(non_blocking)
                        .with_ansi(false)
                )
                .init();

            tracing::info!("Opening database at: {}", db_path.display());
            tracing::info!("Logs directory: {}", logs_dir.display());

            let core = SubbyCore::new(&db_path)?;
            let service = mcp::SubbyMcp::new(core).serve(stdio()).await?;

            tracing::info!("subby-mcp server started");
            service.waiting().await?;
        }
        // CLI subcommand
        Some(command) => {
            let core = SubbyCore::new(&db_path)?;
            cli::run(command, &core)?;
        }
    }

    Ok(())
}
