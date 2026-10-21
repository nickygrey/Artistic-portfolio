#!/usr/bin/env bash
# One-time setup on a new machine: installs the Claude Code plugins this site
# is built with. Safe to re-run; anything already installed is skipped.
#
#   bash scripts/setup-claude-tools.sh
#
# Plugins install at user scope, so they work in every project on this Mac.
# Project-only pieces (Astro docs MCP, motion/UI skills) already live in this
# repo under .mcp.json and .claude/skills/.

set -u

if ! command -v claude >/dev/null 2>&1; then
  echo "Claude Code ('claude') isn't installed or isn't on your PATH." >&2
  exit 1
fi

echo "Checking marketplaces…"
for m in anthropics/claude-plugins-official pbakaus/impeccable accesslint/claude-marketplace; do
  claude plugin marketplace add "$m" >/dev/null 2>&1 || true
done

installed="$(claude plugin list 2>/dev/null || true)"
failed=0

install() {
  local id="$1" name="${1%@*}"
  if grep -qE "(^|[^A-Za-z0-9-])${name}@" <<<"$installed"; then
    echo "  ✓ ${id}  (already installed)"
    return
  fi
  if out="$(claude plugin install "$id" 2>&1)"; then
    echo "  + ${id}"
  else
    echo "  ✗ ${id}"
    echo "$out" | sed 's/^/      /'
    failed=1
  fi
}

echo "Installing plugins…"
# Design direction and polish
install frontend-design@claude-plugins-official
install impeccable@impeccable
# Process: brainstorm → plan → TDD → review
install superpowers@claude-plugins-official
# Eyes on the real page: screenshots, clicks, performance traces
install playwright@claude-plugins-official
install chrome-devtools-mcp@claude-plugins-official
# Current docs and current web-platform practice
install context7@claude-plugins-official
install modern-web-guidance@claude-plugins-official
# Accessibility (WCAG 2.2)
install accesslint@accesslint
# Code intelligence for the .ts files
install typescript-lsp@claude-plugins-official

if ! command -v typescript-language-server >/dev/null 2>&1; then
  echo "Installing the TypeScript language server (needed by typescript-lsp)…"
  npm install -g typescript-language-server typescript >/dev/null 2>&1 \
    && echo "  + typescript-language-server" \
    || { echo "  ✗ run: npm install -g typescript-language-server typescript"; failed=1; }
fi

echo
if [ "$failed" -eq 0 ]; then
  echo "Done. Start Claude Code in this folder and run /reload-plugins (or restart it)."
else
  echo "Finished with errors above. Fix those, then re-run this script."
fi
