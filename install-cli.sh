#!/bin/sh
# ============================================================================
# Kessai CLI / MCP installer (macOS + Linux)
# ============================================================================
# Installs the prebuilt `kessai-mcp` binary from GitHub Releases into a user
# bin directory. No sudo required.
#
# One-liner:
#   curl -fsSL https://raw.githubusercontent.com/Artificial-Source/Kessai/main/install-cli.sh | sh
#
# Usage:
#   ./install-cli.sh [--help] [--dry-run] [--version VERSION]
#                    [--bin-dir PATH] [--mcp-config PATH]
# ============================================================================
#
# Bootstrap: always run the installer body under bash. A quoted heredoc keeps
# the body opaque to dash/POSIX sh (required for `curl | sh`).

set -eu

if ! command -v bash >/dev/null 2>&1; then
    printf 'error: bash is required to run this installer\n' >&2
    exit 1
fi

# shellcheck disable=SC2096
exec bash -s -- "$@" <<'__KESSAI_INSTALL_CLI_EOF__'
set -euo pipefail

GITHUB_REPO="Artificial-Source/Kessai"
BINARY_NAME="kessai-mcp"
DEFAULT_BIN_DIR="${XDG_BIN_HOME:-$HOME/.local/bin}"

VERSION=""
BIN_DIR="$DEFAULT_BIN_DIR"
MCP_CONFIG=""
DRY_RUN=0
SHOW_HELP=0

TMP_DIR=""
cleanup() {
    if [[ -n "${TMP_DIR:-}" && -d "${TMP_DIR:-}" ]]; then
        rm -rf "$TMP_DIR"
    fi
}
trap cleanup EXIT

usage() {
    cat <<'EOF'
Kessai CLI / MCP installer

USAGE:
  install-cli.sh [OPTIONS]

OPTIONS:
  --help              Show this help and exit
  --dry-run           Print planned actions without downloading or installing
  --version VERSION   Install a specific release (with or without leading v)
  --bin-dir PATH      Install directory (default: ${XDG_BIN_HOME:-$HOME/.local/bin})
  --mcp-config PATH   After install, run: kessai-mcp setup --output PATH

ENVIRONMENT:
  XDG_BIN_HOME        Default bin directory when --bin-dir is omitted

EXAMPLES:
  curl -fsSL https://raw.githubusercontent.com/Artificial-Source/Kessai/main/install-cli.sh | sh
  ./install-cli.sh --version 0.5.0
  ./install-cli.sh --bin-dir "$HOME/bin" --mcp-config .mcp.json

Supported targets:
  x86_64-unknown-linux-gnu
  x86_64-apple-darwin
  aarch64-apple-darwin
EOF
}

err() {
    printf 'error: %s\n' "$*" >&2
}

info() {
    printf '%s\n' "$*"
}

require_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        err "required command not found: $1"
        exit 1
    fi
}

normalize_version() {
    local raw="$1"
    raw="${raw#v}"
    if [[ -z "$raw" ]]; then
        err "version must not be empty"
        exit 1
    fi
    printf '%s' "$raw"
}

detect_target() {
    local os arch
    # Test-only overrides (see scripts/test-cli-installer.sh).
    os="${KESSAI_CLI_INSTALL_OS:-$(uname -s)}"
    arch="${KESSAI_CLI_INSTALL_ARCH:-$(uname -m)}"

    case "$os" in
        Linux | linux) os="linux" ;;
        Darwin | darwin) os="darwin" ;;
        *)
            err "unsupported operating system: $os (supported: Linux, macOS)"
            exit 1
            ;;
    esac

    case "$arch" in
        x86_64 | amd64) arch="x86_64" ;;
        arm64 | aarch64) arch="aarch64" ;;
        *)
            err "unsupported architecture: $arch"
            exit 1
            ;;
    esac

    case "${os}-${arch}" in
        linux-x86_64)
            printf '%s' "x86_64-unknown-linux-gnu"
            ;;
        darwin-x86_64)
            printf '%s' "x86_64-apple-darwin"
            ;;
        darwin-aarch64)
            printf '%s' "aarch64-apple-darwin"
            ;;
        linux-aarch64)
            err "Linux arm64/aarch64 prebuilt releases are not published yet (supported Linux target: x86_64-unknown-linux-gnu)"
            exit 1
            ;;
        *)
            err "unsupported platform: ${os}-${arch}"
            exit 1
            ;;
    esac
}

latest_version() {
    require_cmd curl
    local api_url json tag
    api_url="https://api.github.com/repos/${GITHUB_REPO}/releases/latest"
    json="$(curl -fsSL "$api_url")" || {
        err "failed to query GitHub latest release"
        exit 1
    }
    tag="$(printf '%s' "$json" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
    if [[ -z "$tag" ]]; then
        err "could not parse latest release tag from GitHub API"
        exit 1
    fi
    normalize_version "$tag"
}

download_url_for() {
    local version="$1"
    local target="$2"
    local archive_name="kessai-mcp-${version}-${target}.tar.gz"
    # Test-only base URL override (file:// or https). See scripts/test-cli-installer.sh.
    local base="${KESSAI_CLI_INSTALL_BASE_URL:-}"
    if [[ -n "$base" ]]; then
        base="${base%/}"
        printf '%s/%s' "$base" "$archive_name"
        return
    fi
    printf 'https://github.com/%s/releases/download/v%s/%s' "$GITHUB_REPO" "$version" "$archive_name"
}

verify_https_or_test_override() {
    local url="$1"
    case "$url" in
        https://*)
            return 0
            ;;
        http://127.0.0.1/* | http://localhost/* | file://*)
            # Allowed only when the test-only base URL override is active.
            if [[ -n "${KESSAI_CLI_INSTALL_BASE_URL:-}" ]]; then
                return 0
            fi
            ;;
    esac
    err "refusing non-HTTPS download URL: $url"
    exit 1
}

sha256_file() {
    local path="$1"
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$path" | awk '{print tolower($1)}'
    elif command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$path" | awk '{print tolower($1)}'
    else
        err "need sha256sum or shasum to verify downloads"
        exit 1
    fi
}

verify_checksum() {
    local archive_path="$1"
    local checksum_path="$2"
    local archive_base expected actual line hash name

    archive_base="$(basename "$archive_path")"
    if [[ ! -f "$checksum_path" ]]; then
        err "checksum file missing: $checksum_path"
        exit 1
    fi

    line="$(tr -d '\r' <"$checksum_path" | head -n 1)"
    # Accept "HASH  NAME" (two spaces) or "HASH NAME" / "HASH *NAME".
    hash="$(printf '%s' "$line" | awk '{print tolower($1)}')"
    name="$(printf '%s' "$line" | awk '{print $2}' | sed 's/^\*//')"

    if [[ -z "$hash" || ! "$hash" =~ ^[0-9a-f]{64}$ ]]; then
        err "invalid checksum file format: $checksum_path"
        exit 1
    fi
    if [[ -n "$name" && "$name" != "$archive_base" ]]; then
        err "checksum filename mismatch: expected $archive_base, got $name"
        exit 1
    fi

    actual="$(sha256_file "$archive_path")"
    expected="$hash"
    if [[ "$actual" != "$expected" ]]; then
        err "checksum verification failed for $archive_base"
        err "  expected: $expected"
        err "  actual:   $actual"
        exit 1
    fi
}

download_to() {
    local url="$1"
    local dest="$2"
    verify_https_or_test_override "$url"
    require_cmd curl
    curl -fsSL "$url" -o "$dest"
}

# Reject absolute paths, empty/`.`/`..` segments, and members outside the
# exact release top-level directory before extraction.
validate_tar_members() {
    local archive_path="$1"
    local expected_top="$2"
    local member path segment rest first
    local found_any=0

    while IFS= read -r member; do
        [[ -z "$member" ]] && continue
        path="${member%/}"
        [[ -z "$path" ]] && continue
        found_any=1

        case "$path" in
            /* | ~*)
                err "archive contains absolute path member: $member"
                exit 1
                ;;
        esac

        rest="$path"
        first="${rest%%/*}"
        if [[ "$first" != "$expected_top" ]]; then
            err "archive member escapes expected top-level directory '${expected_top}': $member"
            exit 1
        fi

        while [[ -n "$rest" ]]; do
            if [[ "$rest" == */* ]]; then
                segment="${rest%%/*}"
                rest="${rest#*/}"
            else
                segment="$rest"
                rest=""
            fi
            if [[ -z "$segment" || "$segment" == "." || "$segment" == ".." ]]; then
                err "archive member has illegal path segment: $member"
                exit 1
            fi
        done
    done < <(tar -tzf "$archive_path")

    if [[ "$found_any" -ne 1 ]]; then
        # found_any tracks whether any member was seen; 0 means empty archive.
        err "archive contains no members: $archive_path"
        exit 1
    fi
}

extract_tar_safe() {
    local archive_path="$1"
    local dest_dir="$2"
    local tar_version
    local -a opts

    tar_version="$(tar --version 2>&1 | head -n 1 || true)"
    opts=(-xzf "$archive_path" -C "$dest_dir")

    # Prefer ownership/permission hardening available on GNU tar and bsdtar.
    case "$tar_version" in
        *GNU* | *gnu*)
            opts+=(--no-same-owner --no-same-permissions --no-absolute-filenames)
            ;;
        *bsdtar* | *libarchive*)
            opts+=(--no-same-owner)
            ;;
        *)
            opts+=(--no-same-owner)
            ;;
    esac

    if ! tar "${opts[@]}" 2>/dev/null; then
        # Fall back to a smaller portable set if the flavor rejected a flag.
        if ! tar -xzf "$archive_path" -C "$dest_dir" --no-same-owner 2>/dev/null; then
            tar -xzf "$archive_path" -C "$dest_dir"
        fi
    fi
}

# Verify a candidate binary reports the requested release version.
# Must run on the extracted payload before replacing any installed binary.
verify_binary_version() {
    local bin_path="$1"
    local version="$2"
    local label="${3:-binary}"
    local out first expected

    if ! out="$("$bin_path" --version 2>&1)"; then
        err "${label} failed --version check: $bin_path"
        exit 1
    fi
    first="$(printf '%s\n' "$out" | head -n 1 | tr -d '\r')"
    expected="kessai-mcp ${version}"
    if [[ "$first" != "$expected" ]]; then
        err "${label} version mismatch: expected '${expected}', got '${first}'"
        exit 1
    fi
    info "Verified ${label}: ${first}"
}

path_has_dir() {
    local dir="$1"
    local IFS=':'
    local part
    # shellcheck disable=SC2086
    for part in $PATH; do
        if [[ "$part" == "$dir" ]]; then
            return 0
        fi
    done
    return 1
}

install_binary() {
    local source_bin="$1"
    local dest_dir="$2"
    local dest_bin="${dest_dir}/${BINARY_NAME}"
    local tmp_bin

    mkdir -p "$dest_dir"
    tmp_bin="$(mktemp "${dest_dir}/.${BINARY_NAME}.XXXXXX")"
    cp "$source_bin" "$tmp_bin"
    chmod 0755 "$tmp_bin"
    mv -f "$tmp_bin" "$dest_bin"
    printf '%s' "$dest_bin"
}

run_setup() {
    local installed_bin="$1"
    local config_path="$2"
    if [[ ! -x "$installed_bin" ]]; then
        err "installed binary is not executable: $installed_bin"
        exit 1
    fi
    info "Configuring MCP project file: $config_path"
    "$installed_bin" setup --output "$config_path"
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --help | -h)
                SHOW_HELP=1
                shift
                ;;
            --dry-run)
                DRY_RUN=1
                shift
                ;;
            --version)
                if [[ $# -lt 2 ]]; then
                    err "--version requires a value"
                    exit 1
                fi
                VERSION="$(normalize_version "$2")"
                shift 2
                ;;
            --bin-dir)
                if [[ $# -lt 2 ]]; then
                    err "--bin-dir requires a value"
                    exit 1
                fi
                BIN_DIR="$2"
                shift 2
                ;;
            --mcp-config)
                if [[ $# -lt 2 ]]; then
                    err "--mcp-config requires a value"
                    exit 1
                fi
                MCP_CONFIG="$2"
                shift 2
                ;;
            *)
                err "unknown option: $1"
                usage >&2
                exit 1
                ;;
        esac
    done
}

main() {
    parse_args "$@"

    if [[ "$SHOW_HELP" -eq 1 ]]; then
        usage
        exit 0
    fi

    local target version archive_name archive_url checksum_url
    target="$(detect_target)"

    if [[ -n "$VERSION" ]]; then
        version="$VERSION"
    else
        if [[ "$DRY_RUN" -eq 1 && -z "${KESSAI_CLI_INSTALL_BASE_URL:-}" ]]; then
            # Dry-run without an explicit version still needs a tag for URL display.
            version="$(latest_version)"
        elif [[ "$DRY_RUN" -eq 1 && -n "${KESSAI_CLI_INSTALL_VERSION:-}" ]]; then
            version="$(normalize_version "$KESSAI_CLI_INSTALL_VERSION")"
        else
            version="$(latest_version)"
        fi
    fi

    archive_name="kessai-mcp-${version}-${target}.tar.gz"
    archive_url="$(download_url_for "$version" "$target")"
    checksum_url="${archive_url}.sha256"

    info "Kessai CLI installer"
    info "  version : ${version}"
    info "  target  : ${target}"
    info "  bin-dir : ${BIN_DIR}"
    info "  archive : ${archive_name}"

    if [[ "$DRY_RUN" -eq 1 ]]; then
        info "[dry-run] would download: ${archive_url}"
        info "[dry-run] would verify:   ${checksum_url}"
        info "[dry-run] would install:  ${BIN_DIR}/${BINARY_NAME}"
        if [[ -n "$MCP_CONFIG" ]]; then
            info "[dry-run] would run:      ${BIN_DIR}/${BINARY_NAME} setup --output ${MCP_CONFIG}"
        fi
        exit 0
    fi

    require_cmd curl
    require_cmd tar
    require_cmd mktemp

    TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/kessai-cli-install.XXXXXX")"
    local archive_path checksum_path extract_dir source_bin installed_bin
    archive_path="${TMP_DIR}/${archive_name}"
    checksum_path="${TMP_DIR}/${archive_name}.sha256"
    extract_dir="${TMP_DIR}/extract"

    local package_top="kessai-mcp-${version}-${target}"

    info "Downloading ${archive_name}..."
    download_to "$archive_url" "$archive_path"
    download_to "$checksum_url" "$checksum_path"
    verify_checksum "$archive_path" "$checksum_path"
    validate_tar_members "$archive_path" "$package_top"

    mkdir -p "$extract_dir"
    extract_tar_safe "$archive_path" "$extract_dir"

    # Require the exact release layout controlled by packaging:
    #   kessai-mcp-<version>-<target>/kessai-mcp
    source_bin="${extract_dir}/${package_top}/${BINARY_NAME}"
    if [[ -L "$source_bin" ]]; then
        err "refusing symlink at expected binary path: ${package_top}/${BINARY_NAME}"
        exit 1
    fi
    if [[ ! -f "$source_bin" ]]; then
        err "expected binary missing at release layout path: ${package_top}/${BINARY_NAME}"
        exit 1
    fi

    # Validate the extracted payload before touching the destination install.
    verify_binary_version "$source_bin" "$version" "extracted binary"

    installed_bin="$(install_binary "$source_bin" "$BIN_DIR")"
    info "Installed ${installed_bin}"
    # Confirm the installed path still reports the requested version.
    verify_binary_version "$installed_bin" "$version" "installed binary"

    if [[ -n "$MCP_CONFIG" ]]; then
        run_setup "$installed_bin" "$MCP_CONFIG"
    fi

    if ! path_has_dir "$BIN_DIR"; then
        info ""
        info "Note: ${BIN_DIR} is not on your PATH."
        info "Add it for this shell session:"
        info "  export PATH=\"${BIN_DIR}:\$PATH\""
        info "Or append that line to your shell profile."
    fi

    info ""
    info "Done. Try: ${BINARY_NAME} --help"
    if [[ -z "$MCP_CONFIG" ]]; then
        info "Optional MCP setup: ${BINARY_NAME} setup"
    fi
}

main "$@"
__KESSAI_INSTALL_CLI_EOF__
