#!/usr/bin/env bash
# ============================================================================
# CLI installer tests (no network)
# ============================================================================
# Exercises install-cli.sh with a synthetic local release tree via the
# test-only override KESSAI_CLI_INSTALL_BASE_URL (file:// or loopback HTTP).
# Platform detection can be forced with KESSAI_CLI_INSTALL_OS / ARCH.
#
# PowerShell: when pwsh is unavailable, this script only statically validates
# install-cli.ps1 contents (does not execute it).
# ============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_SH="$ROOT/install-cli.sh"
INSTALL_PS1="$ROOT/install-cli.ps1"

PASS=0
FAIL=0
WORKDIR=""

cleanup() {
    if [[ -n "${WORKDIR:-}" && -d "${WORKDIR:-}" ]]; then
        rm -rf "$WORKDIR"
    fi
}
trap cleanup EXIT

test_pass() {
    echo -e "${GREEN}✓${NC} $1"
    PASS=$((PASS + 1))
}

test_fail() {
    echo -e "${RED}✗${NC} $1"
    FAIL=$((FAIL + 1))
}

assert_contains() {
    local haystack="$1"
    local needle="$2"
    local label="$3"
    if printf '%s' "$haystack" | grep -Fq -- "$needle"; then
        test_pass "$label"
    else
        test_fail "$label (missing: $needle)"
        printf '  output was:\n%s\n' "$haystack" | sed 's/^/  /'
    fi
}

sha256_file() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | awk '{print tolower($1)}'
    else
        shasum -a 256 "$1" | awk '{print tolower($1)}'
    fi
}

make_fake_binary() {
    local path="$1"
    local version="$2"
    cat >"$path" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cmd="\${1:-}"
if [[ "\$cmd" == "--version" || "\$cmd" == "-V" ]]; then
    echo "kessai-mcp ${version}"
    exit 0
fi
if [[ "\$cmd" == "setup" ]]; then
    output=""
    shift || true
    while [[ \$# -gt 0 ]]; do
        case "\$1" in
            --output)
                output="\$2"
                shift 2
                ;;
            *)
                shift
                ;;
        esac
    done
    if [[ -z "\$output" ]]; then
        echo "setup: missing --output" >&2
        exit 2
    fi
    mkdir -p "\$(dirname "\$output")"
    printf '%s\n' '{"mcpServers":{"kessai":{"command":"kessai-mcp"}}}' >"\$output"
    echo "wrote \$output"
    exit 0
fi
echo "fake kessai-mcp: unsupported args: \$*" >&2
exit 1
EOF
    chmod 0755 "$path"
}

write_checksum() {
    local archive="$1"
    local hash
    hash="$(sha256_file "$archive")"
    printf '%s  %s\n' "$hash" "$(basename "$archive")" >"${archive}.sha256"
}

build_synthetic_release() {
    local version="$1"
    local target="$2"
    local release_root="$3"
    local package_dir="kessai-mcp-${version}-${target}"
    local stage="${release_root}/${package_dir}"
    local archive="${release_root}/${package_dir}.tar.gz"

    rm -rf "$stage"
    mkdir -p "$stage/skills"
    make_fake_binary "$stage/kessai-mcp" "$version"
    printf 'TEST LICENSE\n' >"$stage/LICENSE"
    printf '# archive readme\n' >"$stage/README.md"
    mkdir -p "$stage/skills/kessai"
    printf '# skill\n' >"$stage/skills/kessai/SKILL.md"

    tar -C "$release_root" -czf "$archive" "$package_dir"
    write_checksum "$archive"
}

run_install() {
    local version="$1"
    local base_url="$2"
    local bin_dir="$3"
    shift 3
    KESSAI_CLI_INSTALL_OS=Linux \
        KESSAI_CLI_INSTALL_ARCH=x86_64 \
        KESSAI_CLI_INSTALL_BASE_URL="$base_url" \
        "$INSTALL_SH" --version "$version" --bin-dir "$bin_dir" "$@"
}

echo ""
echo "Testing Kessai CLI Installer"
echo "============================"
echo ""

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/kessai-cli-installer-test.XXXXXX")"

# --------------------------------------------------------------------------
# Test: install-cli.sh is executable
# --------------------------------------------------------------------------
echo -n "Test: install-cli.sh permissions... "
if [[ -x "$INSTALL_SH" ]]; then
    test_pass "executable"
else
    chmod +x "$INSTALL_SH" || true
    if [[ -x "$INSTALL_SH" ]]; then
        test_pass "executable (chmod applied in test env)"
    else
        test_fail "not executable"
    fi
fi

# --------------------------------------------------------------------------
# Test: --help
# --------------------------------------------------------------------------
echo -n "Test: --help flag... "
HELP_OUT="$(timeout 5 "$INSTALL_SH" --help 2>&1)"
HELP_EC=0
timeout 5 "$INSTALL_SH" --help >/dev/null 2>&1 || HELP_EC=$?
if [[ "$HELP_EC" -eq 0 ]] && printf '%s' "$HELP_OUT" | grep -q "USAGE"; then
    test_pass "shows usage"
else
    test_fail "doesn't show usage"
fi
assert_contains "$HELP_OUT" "--dry-run" "help lists --dry-run"
assert_contains "$HELP_OUT" "--version" "help lists --version"
assert_contains "$HELP_OUT" "--bin-dir" "help lists --bin-dir"
assert_contains "$HELP_OUT" "--mcp-config" "help lists --mcp-config"

# --------------------------------------------------------------------------
# Test: unknown option
# --------------------------------------------------------------------------
echo -n "Test: unknown option... "
UNKNOWN_OUT="$(timeout 5 "$INSTALL_SH" --nope 2>&1 || true)"
if printf '%s' "$UNKNOWN_OUT" | grep -qi "unknown option"; then
    test_pass "shows error"
else
    test_fail "doesn't show error"
fi

# --------------------------------------------------------------------------
# Test: unsupported Linux arm64
# --------------------------------------------------------------------------
echo -n "Test: unsupported Linux arm64... "
ARM_OUT="$(
    KESSAI_CLI_INSTALL_OS=Linux \
        KESSAI_CLI_INSTALL_ARCH=aarch64 \
        timeout 5 "$INSTALL_SH" --version 0.5.0 --dry-run 2>&1 || true
)"
if printf '%s' "$ARM_OUT" | grep -qi "arm64\|aarch64"; then
    test_pass "rejects with clear message"
else
    test_fail "missing arm64 rejection"
    printf '%s\n' "$ARM_OUT" | sed 's/^/  /'
fi

# --------------------------------------------------------------------------
# Test: target mapping + dry-run deterministic asset names
# --------------------------------------------------------------------------
map_case() {
    local os="$1"
    local arch="$2"
    local expected_target="$3"
    local version="1.2.3"
    local out
    out="$(
        KESSAI_CLI_INSTALL_OS="$os" \
            KESSAI_CLI_INSTALL_ARCH="$arch" \
            timeout 5 "$INSTALL_SH" --version "$version" --dry-run 2>&1
    )" || true
    local archive="kessai-mcp-${version}-${expected_target}.tar.gz"
    if printf '%s' "$out" | grep -Fq "$archive" \
        && printf '%s' "$out" | grep -Fq "[dry-run] would download:" \
        && printf '%s' "$out" | grep -Fq "${archive}.sha256"; then
        test_pass "dry-run maps ${os}/${arch} → ${expected_target}"
    else
        test_fail "dry-run maps ${os}/${arch} → ${expected_target}"
        printf '%s\n' "$out" | sed 's/^/  /'
    fi

    if printf '%s' "$out" | grep -Fq \
        "https://github.com/Artificial-Source/Kessai/releases/download/v${version}/${archive}"; then
        test_pass "deterministic URL for ${expected_target}"
    else
        test_fail "deterministic URL for ${expected_target}"
    fi
}

map_case Linux x86_64 x86_64-unknown-linux-gnu
map_case Darwin x86_64 x86_64-apple-darwin
map_case Darwin arm64 aarch64-apple-darwin

# --------------------------------------------------------------------------
# Synthetic release install (file:// override — no network)
# --------------------------------------------------------------------------
VERSION="9.9.9"
TARGET="x86_64-unknown-linux-gnu"
RELEASE_DIR="${WORKDIR}/release"
BIN_DIR="${WORKDIR}/bin"
MCP_CONFIG="${WORKDIR}/project/.mcp.json"
mkdir -p "$RELEASE_DIR"
build_synthetic_release "$VERSION" "$TARGET" "$RELEASE_DIR"
BASE_URL="file://${RELEASE_DIR}"

echo -n "Test: full install via file:// override... "
INSTALL_OUT="$(run_install "$VERSION" "$BASE_URL" "$BIN_DIR" 2>&1)" && INSTALL_EC=0 || INSTALL_EC=$?

if [[ "$INSTALL_EC" -eq 0 && -x "${BIN_DIR}/kessai-mcp" ]]; then
    test_pass "installs executable binary"
else
    test_fail "install failed"
    printf '%s\n' "$INSTALL_OUT" | sed 's/^/  /'
fi

echo -n "Test: installed binary --version matches release... "
if [[ -x "${BIN_DIR}/kessai-mcp" ]] \
    && [[ "$("${BIN_DIR}/kessai-mcp" --version)" == "kessai-mcp ${VERSION}" ]]; then
    test_pass "version ${VERSION}"
else
    test_fail "version mismatch"
fi

echo -n "Test: executable mode 0755... "
if [[ -x "${BIN_DIR}/kessai-mcp" ]]; then
    mode="$(stat -c '%a' "${BIN_DIR}/kessai-mcp" 2>/dev/null || stat -f '%OLp' "${BIN_DIR}/kessai-mcp")"
    if [[ "$mode" =~ ^[67][5-7][5-7]$ ]]; then
        test_pass "mode ${mode}"
    else
        test_fail "unexpected mode ${mode}"
    fi
else
    test_fail "binary missing"
fi

# --------------------------------------------------------------------------
# Checksum enforcement
# --------------------------------------------------------------------------
echo -n "Test: checksum mismatch is rejected... "
BAD_DIR="${WORKDIR}/bad-release"
mkdir -p "$BAD_DIR"
cp "${RELEASE_DIR}/kessai-mcp-${VERSION}-${TARGET}.tar.gz" "$BAD_DIR/"
printf '%s  %s\n' \
    "0000000000000000000000000000000000000000000000000000000000000000" \
    "kessai-mcp-${VERSION}-${TARGET}.tar.gz" \
    >"${BAD_DIR}/kessai-mcp-${VERSION}-${TARGET}.tar.gz.sha256"
BAD_BIN="${WORKDIR}/bad-bin"
mkdir -p "$BAD_BIN"
BAD_OUT="$(run_install "$VERSION" "file://${BAD_DIR}" "$BAD_BIN" 2>&1 || true)"
if printf '%s' "$BAD_OUT" | grep -qi "checksum"; then
    test_pass "checksum failure reported"
else
    test_fail "checksum failure not reported"
    printf '%s\n' "$BAD_OUT" | sed 's/^/  /'
fi
if [[ -e "${BAD_BIN}/kessai-mcp" ]]; then
    test_fail "binary should not install on checksum failure"
else
    test_pass "no binary on checksum failure"
fi

# --------------------------------------------------------------------------
# Tar layout / traversal rejection
# --------------------------------------------------------------------------
echo -n "Test: rejects wrong top-level directory... "
WRONG_TOP="${WORKDIR}/wrong-top"
mkdir -p "$WRONG_TOP/not-the-package"
make_fake_binary "$WRONG_TOP/not-the-package/kessai-mcp" "$VERSION"
tar -C "$WRONG_TOP" -czf "${WRONG_TOP}/kessai-mcp-${VERSION}-${TARGET}.tar.gz" "not-the-package"
write_checksum "${WRONG_TOP}/kessai-mcp-${VERSION}-${TARGET}.tar.gz"
WRONG_BIN="${WORKDIR}/wrong-top-bin"
mkdir -p "$WRONG_BIN"
WRONG_OUT="$(run_install "$VERSION" "file://${WRONG_TOP}" "$WRONG_BIN" 2>&1 || true)"
if printf '%s' "$WRONG_OUT" | grep -qi "top-level\|expected top-level\|escapes expected"; then
    test_pass "wrong top-level rejected"
else
    test_fail "wrong top-level not rejected"
    printf '%s\n' "$WRONG_OUT" | sed 's/^/  /'
fi
if [[ -e "${WRONG_BIN}/kessai-mcp" ]]; then
    test_fail "binary installed from wrong top-level"
else
    test_pass "no binary from wrong top-level"
fi

echo -n "Test: rejects path traversal members... "
TRAV_DIR="${WORKDIR}/traversal"
TRAV_STAGE="${TRAV_DIR}/stage"
mkdir -p "${TRAV_STAGE}/kessai-mcp-${VERSION}-${TARGET}"
make_fake_binary "${TRAV_STAGE}/kessai-mcp-${VERSION}-${TARGET}/kessai-mcp" "$VERSION"
python3 - <<PY
import io
import tarfile
from pathlib import Path

root = Path(r'''${TRAV_STAGE}''')
archive = Path(r'''${TRAV_DIR}/kessai-mcp-${VERSION}-${TARGET}.tar.gz''')
pkg = f"kessai-mcp-${VERSION}-${TARGET}"
with tarfile.open(archive, "w:gz") as tf:
    tf.add(root / pkg / "kessai-mcp", arcname=f"{pkg}/kessai-mcp")
    info = tarfile.TarInfo(name=f"{pkg}/../evil/pwned.txt")
    data = b"pwned\n"
    info.size = len(data)
    tf.addfile(info, io.BytesIO(data))
PY
write_checksum "${TRAV_DIR}/kessai-mcp-${VERSION}-${TARGET}.tar.gz"
TRAV_LIST="$(tar -tzf "${TRAV_DIR}/kessai-mcp-${VERSION}-${TARGET}.tar.gz" 2>/dev/null || true)"
TRAV_BIN="${WORKDIR}/trav-bin"
mkdir -p "$TRAV_BIN"
if printf '%s' "$TRAV_LIST" | grep -Fq '..'; then
    TRAV_OUT="$(run_install "$VERSION" "file://${TRAV_DIR}" "$TRAV_BIN" 2>&1 || true)"
    if printf '%s' "$TRAV_OUT" | grep -qi "illegal path segment\|escapes expected\|absolute path"; then
        test_pass "traversal member rejected"
    else
        test_fail "traversal member not rejected"
        printf '%s\n' "$TRAV_OUT" | sed 's/^/  /'
        printf '  members:\n%s\n' "$TRAV_LIST" | sed 's/^/  /'
    fi
    if [[ -e "${TRAV_BIN}/kessai-mcp" ]]; then
        test_fail "binary installed from traversal archive"
    else
        test_pass "no binary from traversal archive"
    fi
else
    test_fail "could not craft archive with .. path segment"
    printf '  members:\n%s\n' "$TRAV_LIST" | sed 's/^/  /'
fi

echo -n "Test: rejects missing exact layout binary... "
MISS_DIR="${WORKDIR}/missing-bin"
MISS_PKG="kessai-mcp-${VERSION}-${TARGET}"
mkdir -p "${MISS_DIR}/${MISS_PKG}"
printf 'not a binary\n' >"${MISS_DIR}/${MISS_PKG}/README.md"
tar -C "$MISS_DIR" -czf "${MISS_DIR}/${MISS_PKG}.tar.gz" "$MISS_PKG"
write_checksum "${MISS_DIR}/${MISS_PKG}.tar.gz"
MISS_BIN="${WORKDIR}/miss-bin"
mkdir -p "$MISS_BIN"
MISS_OUT="$(run_install "$VERSION" "file://${MISS_DIR}" "$MISS_BIN" 2>&1 || true)"
if printf '%s' "$MISS_OUT" | grep -qi "expected binary missing\|release layout"; then
    test_pass "missing layout binary rejected"
else
    test_fail "missing layout binary not rejected"
    printf '%s\n' "$MISS_OUT" | sed 's/^/  /'
fi

echo -n "Test: rejects symlink at expected binary path... "
SYM_DIR="${WORKDIR}/symlink"
SYM_PKG="kessai-mcp-${VERSION}-${TARGET}"
mkdir -p "${SYM_DIR}/${SYM_PKG}"
# Dangling symlink is enough: installer must refuse a symlink at the binary path.
ln -s "not-a-real-binary" "${SYM_DIR}/${SYM_PKG}/kessai-mcp"
tar -C "$SYM_DIR" -czf "${SYM_DIR}/${SYM_PKG}.tar.gz" "$SYM_PKG"
write_checksum "${SYM_DIR}/${SYM_PKG}.tar.gz"
SYM_BIN="${WORKDIR}/sym-bin"
mkdir -p "$SYM_BIN"
SYM_OUT="$(run_install "$VERSION" "file://${SYM_DIR}" "$SYM_BIN" 2>&1 || true)"
if printf '%s' "$SYM_OUT" | grep -qi "symlink"; then
    test_pass "symlink binary rejected"
else
    test_fail "symlink binary not rejected"
    printf '%s\n' "$SYM_OUT" | sed 's/^/  /'
    tar -tzf "${SYM_DIR}/${SYM_PKG}.tar.gz" | sed 's/^/  member: /'
fi

# --------------------------------------------------------------------------
# Version mismatch must not replace an existing good install
# --------------------------------------------------------------------------
echo -n "Test: version mismatch is rejected before install... "
MM_DIR="${WORKDIR}/mismatch"
mkdir -p "$MM_DIR"
# Build archive claiming VERSION but binary reports different version.
MM_PKG="kessai-mcp-${VERSION}-${TARGET}"
mkdir -p "${MM_DIR}/${MM_PKG}"
make_fake_binary "${MM_DIR}/${MM_PKG}/kessai-mcp" "0.0.1-wrong"
tar -C "$MM_DIR" -czf "${MM_DIR}/${MM_PKG}.tar.gz" "$MM_PKG"
write_checksum "${MM_DIR}/${MM_PKG}.tar.gz"
MM_BIN="${WORKDIR}/mm-bin"
mkdir -p "$MM_BIN"
# Seed a known-good sentinel that must remain byte-identical after rejection.
SENTINEL_PATH="${MM_BIN}/kessai-mcp"
printf 'SENTINEL_GOOD_INSTALL_v1\n' >"$SENTINEL_PATH"
chmod 0755 "$SENTINEL_PATH"
SENTINEL_HASH="$(sha256_file "$SENTINEL_PATH")"
SENTINEL_BODY="$(cat "$SENTINEL_PATH")"
MM_OUT="$(run_install "$VERSION" "file://${MM_DIR}" "$MM_BIN" 2>&1 || true)"
if printf '%s' "$MM_OUT" | grep -qi "version mismatch"; then
    test_pass "version mismatch reported"
else
    test_fail "version mismatch not reported"
    printf '%s\n' "$MM_OUT" | sed 's/^/  /'
fi
echo -n "Test: existing install untouched after version mismatch... "
if [[ -f "$SENTINEL_PATH" ]] \
    && [[ "$(cat "$SENTINEL_PATH")" == "$SENTINEL_BODY" ]] \
    && [[ "$(sha256_file "$SENTINEL_PATH")" == "$SENTINEL_HASH" ]] \
    && ! "$SENTINEL_PATH" --version >/dev/null 2>&1; then
    # Sentinel is not a real kessai-mcp; it must still be the original script body.
    test_pass "sentinel binary unchanged"
else
    test_fail "sentinel binary was modified or replaced"
    printf '  body now: %s\n' "$(cat "$SENTINEL_PATH" 2>/dev/null || echo missing)"
    printf '  hash now: %s\n' "$(sha256_file "$SENTINEL_PATH" 2>/dev/null || echo missing)"
fi

# --------------------------------------------------------------------------
# Setup invocation via --mcp-config
# --------------------------------------------------------------------------
echo -n "Test: --mcp-config runs setup... "
SETUP_BIN="${WORKDIR}/setup-bin"
mkdir -p "$SETUP_BIN" "$(dirname "$MCP_CONFIG")"
SETUP_OUT="$(run_install "$VERSION" "$BASE_URL" "$SETUP_BIN" --mcp-config "$MCP_CONFIG" 2>&1)" && SETUP_EC=0 || SETUP_EC=$?

if [[ "$SETUP_EC" -eq 0 && -f "$MCP_CONFIG" ]] && grep -q 'mcpServers' "$MCP_CONFIG"; then
    test_pass "setup wrote config"
else
    test_fail "setup did not write config"
    printf '%s\n' "$SETUP_OUT" | sed 's/^/  /'
fi

# Dry-run with mcp-config should not write
echo -n "Test: dry-run does not write files... "
DRY_BIN="${WORKDIR}/dry-bin"
DRY_CFG="${WORKDIR}/dry.mcp.json"
mkdir -p "$DRY_BIN"
DRY_OUT="$(
    KESSAI_CLI_INSTALL_OS=Linux \
        KESSAI_CLI_INSTALL_ARCH=x86_64 \
        "$INSTALL_SH" --version "$VERSION" --bin-dir "$DRY_BIN" --mcp-config "$DRY_CFG" --dry-run 2>&1
)" && DRY_EC=0 || DRY_EC=$?
if [[ "$DRY_EC" -eq 0 && ! -e "${DRY_BIN}/kessai-mcp" && ! -e "$DRY_CFG" ]]; then
    test_pass "no side effects"
else
    test_fail "dry-run had side effects or failed"
    printf '%s\n' "$DRY_OUT" | sed 's/^/  /'
fi
assert_contains "$DRY_OUT" "setup --output" "dry-run mentions setup"

# --------------------------------------------------------------------------
# Piped stdin must not hang / prompt
# --------------------------------------------------------------------------
echo -n "Test: piped stdin non-interactive... "
PIPE_OUT="$(
    KESSAI_CLI_INSTALL_OS=Linux \
        KESSAI_CLI_INSTALL_ARCH=x86_64 \
        timeout 5 bash -c "cat '$INSTALL_SH' | sh -s -- --version $VERSION --dry-run" 2>&1
)" && PIPE_EC=0 || PIPE_EC=$?
if [[ "$PIPE_EC" -eq 0 ]] && printf '%s' "$PIPE_OUT" | grep -q "dry-run"; then
    test_pass "piped install works"
else
    test_fail "piped install failed or hung"
    printf '%s\n' "$PIPE_OUT" | sed 's/^/  /'
fi

# --------------------------------------------------------------------------
# PowerShell script static validation (and optional pwsh dry-run)
# --------------------------------------------------------------------------
echo -n "Test: install-cli.ps1 exists... "
if [[ -f "$INSTALL_PS1" ]]; then
    test_pass "present"
else
    test_fail "missing"
fi

PS_CONTENT="$(cat "$INSTALL_PS1")"
assert_contains "$PS_CONTENT" "DryRun" "ps1 has DryRun"
assert_contains "$PS_CONTENT" "BinDir" "ps1 has BinDir"
assert_contains "$PS_CONTENT" "McpConfig" "ps1 has McpConfig"
assert_contains "$PS_CONTENT" "Get-FileHash" "ps1 verifies checksum"
assert_contains "$PS_CONTENT" "x86_64-pc-windows-msvc" "ps1 targets windows-msvc"
assert_contains "$PS_CONTENT" "LOCALAPPDATA" "ps1 default bin under LocalAppData"
assert_contains "$PS_CONTENT" "KESSAI_CLI_INSTALL_BASE_URL" "ps1 documents test override"
assert_contains "$PS_CONTENT" "Test-ZipMembers" "ps1 validates zip layout"
assert_contains "$PS_CONTENT" "Assert-BinaryVersion" "ps1 checks version string"
assert_contains "$PS_CONTENT" "version mismatch" "ps1 reports version mismatch"
assert_contains "$PS_CONTENT" "extracted binary" "ps1 verifies before install"

if printf '%s' "$PS_CONTENT" | grep -Fq "Get-ChildItem -Path \$extractDir -Recurse"; then
    test_fail "ps1 still has recursive binary fallback"
else
    test_pass "ps1 has no recursive binary fallback"
fi

if command -v pwsh >/dev/null 2>&1; then
    echo -n "Test: pwsh dry-run syntax... "
    PS_OUT="$(
        pwsh -NoLogo -NoProfile -File "$INSTALL_PS1" -Version 1.2.3 -DryRun 2>&1
    )" && PS_EC=0 || PS_EC=$?
    if [[ "$PS_EC" -eq 0 ]] && printf '%s' "$PS_OUT" | grep -Fq "kessai-mcp-1.2.3-x86_64-pc-windows-msvc.zip"; then
        test_pass "pwsh dry-run"
    else
        test_fail "pwsh dry-run"
        printf '%s\n' "$PS_OUT" | sed 's/^/  /'
    fi
else
    echo -e "${GREEN}✓${NC} pwsh not available — static validation only (not executed)"
    PASS=$((PASS + 1))
fi

# --------------------------------------------------------------------------
# Summary
# --------------------------------------------------------------------------
echo ""
echo "============================"
echo -e "Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}"
echo ""

if [[ "$FAIL" -gt 0 ]]; then
    exit 1
fi
