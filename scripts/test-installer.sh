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

# Summary
echo ""
echo "======================="
echo -e "Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}"
echo ""

if [[ $FAIL -gt 0 ]]; then
    exit 1
fi
