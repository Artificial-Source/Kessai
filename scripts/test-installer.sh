#!/usr/bin/env bash
# ============================================================================
# Install Script Tests
# ============================================================================
# Run this to verify the install script works correctly without making changes.
# Usage: ./scripts/test-installer.sh
# ============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0
FAIL=0

test_pass() {
    echo -e "${GREEN}✓${NC} $1"
    PASS=$((PASS + 1))
}

test_fail() {
    echo -e "${RED}✗${NC} $1"
    FAIL=$((FAIL + 1))
}

echo ""
echo "Testing Kessai Installer"
echo "======================="
echo ""

# Test 1: --help flag works
echo -n "Test: --help flag... "
if timeout 5 "$SCRIPT_DIR/install.sh" --help 2>&1 | grep -q "USAGE"; then
    test_pass "shows usage"
else
    test_fail "doesn't show usage"
fi

# Test 2: Invalid flag shows error
echo -n "Test: Invalid flag... "
OUTPUT=$(timeout 5 "$SCRIPT_DIR/install.sh" --invalid-flag 2>&1 || true)
if echo "$OUTPUT" | grep -q "Unknown option"; then
    test_pass "shows error"
else
    test_fail "doesn't show error"
fi

# Test 3: Script is executable
echo -n "Test: install.sh permissions... "
if [[ -x "$SCRIPT_DIR/install.sh" ]]; then
    test_pass "executable"
else
    test_fail "not executable"
fi

# Test 4: Uninstall script exists and is executable
echo -n "Test: uninstall.sh... "
if [[ -x "$SCRIPT_DIR/uninstall.sh" ]]; then
    test_pass "exists and executable"
else
    test_fail "missing or not executable"
fi

# Exercise the default download path with a synthetic release and curl override.
# No network requests, real executables, or files under the user's home are used.
WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/kessai-desktop-installer-test.XXXXXX")"
trap 'rm -rf "$WORKDIR"' EXIT
mkdir -p "$WORKDIR/mock-bin" "$WORKDIR/release"
printf '\177ELF\002\001\001\000AI\002' >"$WORKDIR/release/valid.AppImage"
dd if=/dev/zero bs=1 count=128 status=none >>"$WORKDIR/release/valid.AppImage"
printf 'payload\n' >>"$WORKDIR/release/valid.AppImage"
HASH="$(sha256sum "$WORKDIR/release/valid.AppImage")"
printf '%s  Kessai_9.9.9_amd64.AppImage\n' "${HASH%% *}" >"$WORKDIR/release/checksum"

cat >"$WORKDIR/mock-bin/curl" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
out=""
url=""
fail=false
location=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        -o|--output) out="$2"; shift 2 ;;
        --fail) fail=true; shift ;;
        --location) location=true; shift ;;
        https://*) url="$1"; shift ;;
        *) shift ;;
    esac
done
asset="https://github.com/Artificial-Source/Kessai/releases/download/v9.9.9/Kessai_9.9.9_amd64.AppImage"
if [[ "$url" == */releases/latest ]]; then
    printf '{"tag_name":"v9.9.9","assets":[{"browser_download_url":"%s"}' "$asset"
    case "$CASE" in
        legacy) ;;
        missing-sidecar) printf ',{"browser_download_url":"%s.sha256"}' "${asset%/*}/other.deb" ;;
        *) printf ',{"browser_download_url":"%s.sha256"}' "$asset" ;;
    esac
    printf ']}\n'
elif [[ "$url" == *.sha256 ]]; then
    [[ "$CASE" != unavailable-sidecar ]] || exit 22
    cp "$FIXTURES/checksum" "$out"
elif [[ "$url" == *.AppImage ]]; then
    case "$CASE" in
        http-error)
            printf '<html>503 unavailable</html>\n' >"$out"
            [[ "$fail" == false ]] || exit 22
            ;;
        truncated) printf '\177ELF' >"$out" ;;
        mismatch) cp "$FIXTURES/valid.AppImage" "$out"; printf 'corrupt' >>"$out" ;;
        invalid-magic) printf '<html>not an AppImage</html>\n' >"$out" ;;
        *) cp "$FIXTURES/valid.AppImage" "$out" ;;
    esac
else
    exit 99
fi
[[ "$fail" == true && "$location" == true ]] || printf 'unsafe curl options\n' >>"$MOCK_LOG"
MOCK
cat >"$WORKDIR/mock-bin/uname" <<'MOCK'
#!/usr/bin/env bash
echo x86_64
MOCK
for command in pnpm cargo sudo; do
    cat >"$WORKDIR/mock-bin/$command" <<'MOCK'
#!/usr/bin/env bash
echo "unexpected source fallback" >>"$MOCK_LOG"
exit 91
MOCK
done
cat >"$WORKDIR/mock-bin/mv" <<'MOCK'
#!/usr/bin/env bash
[[ "$CASE" != replace-failure ]] || exit 73
exec /bin/mv "$@"
MOCK
cat >"$WORKDIR/mock-bin/chmod" <<'MOCK'
#!/usr/bin/env bash
[[ "$CASE" != chmod-failure ]] || exit 73
exec /bin/chmod "$@"
MOCK
chmod +x "$WORKDIR/mock-bin/"*

for CASE in http-error truncated mismatch missing-sidecar unavailable-sidecar invalid-magic chmod-failure replace-failure success legacy; do
    CASE_DIR="$WORKDIR/$CASE"
    mkdir -p "$CASE_DIR/bin" "$CASE_DIR/home" "$CASE_DIR/tmp"
    printf 'working previous installation\n' >"$CASE_DIR/bin/kessai-desktop"
    ln "$CASE_DIR/bin/kessai-desktop" "$CASE_DIR/previous"
    # Invalid magic must fail independently of the checksum check.
    if [[ "$CASE" == invalid-magic ]]; then
        printf '<html>not an AppImage</html>\n' >"$WORKDIR/release/invalid"
        HASH="$(sha256sum "$WORKDIR/release/invalid")"
    else
        HASH="$(sha256sum "$WORKDIR/release/valid.AppImage")"
    fi
    printf '%s  Kessai_9.9.9_amd64.AppImage\n' "${HASH%% *}" >"$WORKDIR/release/checksum"
    STATUS=0
    OUTPUT="$(PATH="$WORKDIR/mock-bin:/usr/bin:/bin:$PATH" HOME="$CASE_DIR/home" \
        XDG_BIN_HOME="$CASE_DIR/bin" XDG_DATA_HOME="$CASE_DIR/data" TMPDIR="$CASE_DIR/tmp" \
        CASE="$CASE" FIXTURES="$WORKDIR/release" MOCK_LOG="$CASE_DIR/mock.log" \
        timeout 10 bash "$SCRIPT_DIR/install.sh" </dev/null 2>&1)" || STATUS=$?
    if [[ "$CASE" == success || "$CASE" == legacy ]]; then
        if [[ "$STATUS" == 0 && -x "$CASE_DIR/bin/kessai-desktop" && -x "$CASE_DIR/bin/kessai" ]] \
            && cmp -s "$CASE_DIR/bin/kessai-desktop" "$WORKDIR/release/valid.AppImage"; then
            test_pass "$CASE installs verified executable"
        else
            test_fail "$CASE install failed"
            printf '%s\n' "$OUTPUT"
        fi
    elif [[ "$STATUS" != 0 && "$STATUS" != 124 ]] \
        && cmp -s "$CASE_DIR/bin/kessai-desktop" "$CASE_DIR/previous"; then
        test_pass "$CASE preserves previous installation"
    else
        test_fail "$CASE accepted an invalid download or replaced the installation"
        printf '%s\n' "$OUTPUT"
    fi
    if [[ "$(cat "$CASE_DIR/previous")" == 'working previous installation' ]]; then
        test_pass "$CASE never overwrites the existing executable in place"
    else
        test_fail "$CASE damaged the old executable inode"
    fi
    if [[ ! -s "$CASE_DIR/mock.log" && -z "$(find "$CASE_DIR/tmp" -mindepth 1 -print -quit)" ]] \
        && [[ -z "$(find "$CASE_DIR/bin" -name '.kessai-desktop.*' -print -quit)" ]]; then
        test_pass "$CASE uses safe downloads without fallback or staging leftovers"
    else
        test_fail "$CASE used unsafe curl options, fell back to source, or leaked staging files"
    fi
done

# Summary
echo ""
echo "======================="
echo -e "Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}"
echo ""

if [[ $FAIL -gt 0 ]]; then
    exit 1
fi
