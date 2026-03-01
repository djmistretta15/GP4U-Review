#!/usr/bin/env bash
# GP4U Customer CLI — Installer
# Usage: curl -fsSL https://gp4u.com/install/cli | bash
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${GREEN}[gp4u]${NC} $*"; }
warn()  { echo -e "${YELLOW}[gp4u]${NC} $*"; }
error() { echo -e "${RED}[gp4u] ERROR:${NC} $*" >&2; exit 1; }

echo ""
echo -e "${CYAN}  ██████╗ ██████╗ ██╗  ██╗██╗   ██╗${NC}"
echo -e "${CYAN} ██╔════╝ ██╔══██╗██║  ██║██║   ██║${NC}"
echo -e "${CYAN} ██║  ███╗██████╔╝███████║██║   ██║${NC}"
echo -e "${CYAN} ██║   ██║██╔═══╝ ██╔══██║██║   ██║${NC}"
echo -e "${CYAN} ╚██████╔╝██║     ██║  ██║╚██████╔╝${NC}"
echo -e "${CYAN}  ╚═════╝ ╚═╝     ╚═╝  ╚═╝ ╚═════╝ ${NC}"
echo "  Customer CLI Installer v0.1.0"
echo ""

# ─── Check Node.js ────────────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || error "Node.js 18+ required. Install: https://nodejs.org"
NODE_VER=$(node -e "process.exit(parseInt(process.versions.node) < 18 ? 1 : 0)" 2>&1 && echo ok || echo fail)
[[ "$NODE_VER" == "fail" ]] && error "Node.js 18+ required (found $(node --version))"
info "✓ Node $(node --version)"

command -v npm >/dev/null 2>&1 || error "npm required"

# ─── Install ──────────────────────────────────────────────────────────────────
INSTALL_DIR="$HOME/.gp4u/cli"
mkdir -p "$INSTALL_DIR"

if [[ -d "$HOME/GP4U-Review/apps/customer-cli" ]]; then
  info "(dev mode: using local source)"
  cp -r "$HOME/GP4U-Review/apps/customer-cli/." "$INSTALL_DIR/"
else
  info "Downloading CLI…"
  curl -fsSL "https://gp4u.com/releases/customer-cli-latest.tar.gz" | tar -xz -C "$INSTALL_DIR" --strip-components=1
fi

info "Installing dependencies…"
cd "$INSTALL_DIR"
npm install --silent
npm run build --silent 2>/dev/null || true  # TypeScript build (optional in dev)

# Create the gp4u launcher
mkdir -p "$HOME/.local/bin"
cat > "$HOME/.local/bin/gp4u" <<EOF
#!/usr/bin/env bash
# GP4U CLI launcher
exec node "$INSTALL_DIR/dist/cli.js" "\$@" 2>/dev/null || \
exec npx --yes ts-node "$INSTALL_DIR/src/cli.ts" "\$@"
EOF
chmod +x "$HOME/.local/bin/gp4u"

# PATH check
if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
  warn "Add ~/.local/bin to your PATH:"
  warn "  echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.bashrc && source ~/.bashrc"
fi

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  GP4U CLI installed!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Get started:"
echo "    gp4u login           — authenticate"
echo "    gp4u gpus            — browse available GPUs"
echo "    gp4u arbitrage       — find the best deal"
echo "    gp4u jobs submit     — launch a compute job"
echo "    gp4u --help          — all commands"
echo ""
