#!/usr/bin/env bash
# Install the bugscope CLI binary to ~/.local/bin
# Run after every release: bash scripts/install.sh

set -euo pipefail

DEST="${BUGSCOPE_INSTALL_DIR:-$HOME/.local/bin}"
BINARY="dist/bugscope"

if [ ! -f "$BINARY" ]; then
  echo "Building..."
  bun run build
fi

mkdir -p "$DEST"
cp "$BINARY" "$DEST/bugscope"
chmod +x "$DEST/bugscope"

echo "Installed: $DEST/bugscope"
"$DEST/bugscope" --version 2>/dev/null || true
