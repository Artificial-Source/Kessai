use clap::{error::ErrorKind as ClapErrorKind, ArgMatches};
use kessai_core::KessaiCore;
use kessai_mcp::{
    app::{AppError, Application, ErrorKind, Result},
    cli, http, mcp, setup,
};
use std::{path::Path, process::ExitCode};

#[tokio::main]
async fn main() -> ExitCode {
    // Piping into `head` closes stdout early; die quietly like other CLIs instead of panicking.
    #[cfg(unix)]
    // SAFETY: sets a process-wide signal disposition; nothing else installs a SIGPIPE handler.
    unsafe {
        libc::signal(libc::SIGPIPE, libc::SIG_DFL);
    }
    let args = std::env::args().collect::<Vec<_>>();
    let json_mode = args.iter().any(|arg| arg == "--json");
    let matches = match cli::command().try_get_matches_from(&args) {
        Ok(matches) => matches,
        Err(error)
            if matches!(
                error.kind(),
                ClapErrorKind::DisplayHelp | ClapErrorKind::DisplayVersion
            ) =>
        {
            let _ = error.print();
            return ExitCode::SUCCESS;
        }
        Err(error) => {
            let hint = cli::usage_hint(&args);
            if json_mode {
                eprintln!(
                    "{}",
                    AppError::validation("arguments", error.to_string(), hint).json()
                );
            } else {
                let _ = error.print();
                eprintln!("Hint: {hint}");
            }
            return ExitCode::from(2);
        }
    };
    if matches.subcommand().is_none() {
        let _ = cli::command().print_long_help();
        println!();
        return ExitCode::from(2);
    }
    match run(&matches).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(mut error) => {
            if matches!(error.kind, ErrorKind::Confirmation) {
                error.hint = Some(cli::confirmation_hint(&args));
            }
            if json_mode {
                eprintln!("{}", error.json());
            } else {
                eprintln!("Error: {error}");
                if let Some(hint) = &error.hint {
                    eprintln!("Hint: {hint}");
                }
            }
            ExitCode::from(error.exit_code())
        }
    }
}
async fn run(matches: &ArgMatches) -> Result<()> {
    let (group, args) = matches.subcommand().expect("main handles bare invocation");
    let no_color = matches.get_flag("no-color");
    let json_mode = matches.get_flag("json");
    if group == "schema" {
        let value = cli::schema(
            args.get_one::<String>("group").map(String::as_str),
            args.get_one::<String>("verb").map(String::as_str),
        )?;
        cli::emit(&value, true, no_color);
        return Ok(());
    }
    let db_path = cli::resolve_db_path(matches.get_one::<String>("db-path").map(Into::into))?;
    if group == "info" {
        let value = serde_json::to_value(cli::info(&db_path)?)
            .map_err(|error| AppError::new(ErrorKind::Internal, error.to_string()))?;
        cli::emit(&value, json_mode, no_color);
        return Ok(());
    }
    if group == "setup" {
        let value = setup::run(
            args.get_one::<String>("output").map(Path::new),
            &std::env::current_exe()?,
            &db_path,
            args.get_flag("read-only"),
            args.get_flag("dry-run"),
        )?;
        cli::emit(
            &serde_json::to_value(value)
                .map_err(|error| AppError::new(ErrorKind::Internal, error.to_string()))?,
            json_mode,
            no_color,
        );
        return Ok(());
    }
    // Authentication is validated before creating a database or directories.
    let token = if group == "serve" && args.get_flag("http") {
        Some(http::load_token(
            args.get_one::<String>("token-file").map(Path::new),
        )?)
    } else {
        None
    };
    cli::ensure_parent(&db_path)?;
    let core = KessaiCore::new(&db_path)
        .map_err(|error| AppError::new(ErrorKind::Io, error.to_string()))?;
    if group == "serve" {
        let _guard = init_tracing(&db_path)?;
        if let Some(token) = token {
            mcp::serve_http(
                core,
                args.get_one::<u16>("port").copied().unwrap_or(8742),
                token,
                args.get_flag("read-only"),
            )
            .await
        } else {
            mcp::serve_stdio(
                core,
                mcp::McpOptions {
                    read_only: args.get_flag("read-only"),
                },
            )
            .await
        }
    } else {
        let value = cli::run(group, args, &Application::new(core))?;
        cli::emit(&value, json_mode, no_color);
        Ok(())
    }
}
fn init_tracing(db_path: &Path) -> Result<tracing_appender::non_blocking::WorkerGuard> {
    let logs = db_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join("logs");
    std::fs::create_dir_all(&logs)?;
    let appender = tracing_appender::rolling::daily(logs, "kessai-mcp.log");
    let (writer, guard) = tracing_appender::non_blocking(appender);
    use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .with(
            tracing_subscriber::fmt::layer()
                .with_writer(std::io::stderr)
                .with_ansi(false),
        )
        .with(
            tracing_subscriber::fmt::layer()
                .with_writer(writer)
                .with_ansi(false),
        )
        .try_init()
        .map_err(|error| AppError::new(ErrorKind::Internal, error.to_string()))?;
    Ok(guard)
}
