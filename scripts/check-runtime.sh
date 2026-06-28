#!/usr/bin/env bash
# Quick runtime environment audit for Endfield-MCP (Unix).
#
# Usage:
#   ./scripts/check-runtime.sh        # audit only
#   ./scripts/check-runtime.sh --full # install + typecheck + test + build
#
# Mirrors scripts/check-runtime.ps1 for cross-platform parity.

set -u

full=0
if [[ "${1:-}" == "--full" || "${1:-}" == "-full" ]]; then
  full=1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ts_dir="$repo_root/ts"
exit_code=0

section() {
  printf "\n=== %s ===\n" "$1"
}

# --- Bun -----------------------------------------------------------------
section "Bun runtime"
if command -v bun >/dev/null 2>&1; then
  bun_version="$(bun --version)"
  echo "Bun $bun_version"
  major="${bun_version%%.*}"
  rest="${bun_version#*.}"
  minor="${rest%%.*}"
  if [[ "$major" -lt 1 || ( "$major" -eq 1 && "$minor" -lt 2 ) ]]; then
    echo "WARNING: Bun >=1.2 recommended; found $bun_version" >&2
  fi
else
  echo "ERROR: Bun not found on PATH. Install from https://bun.sh" >&2
  exit_code=1
  if [[ "$full" -eq 0 ]]; then
    exit "$exit_code"
  fi
fi

if [[ "$full" -eq 0 ]]; then
  section "Audit only"
  echo "Pass --full to run typecheck + tests + build."
  exit "$exit_code"
fi

# --- install -------------------------------------------------------------
section "bun install"
( cd "$ts_dir" && bun install ) || exit_code=$?

# --- typecheck -----------------------------------------------------------
section "Typecheck (tsc --noEmit)"
( cd "$ts_dir" && bun run typecheck ) || exit_code=$?

# --- test ----------------------------------------------------------------
section "Tests (bun test)"
( cd "$ts_dir" && bun test ) || exit_code=$?

# --- build ---------------------------------------------------------------
section "Build smoke (tsc emit)"
( cd "$ts_dir" && bun run build ) || exit_code=$?

echo ""
if [[ "$exit_code" -eq 0 ]]; then
  echo "All checks passed."
else
  echo "Some checks failed (exit $exit_code)." >&2
fi
exit "$exit_code"
