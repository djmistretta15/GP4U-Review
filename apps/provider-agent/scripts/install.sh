#!/usr/bin/env bash
# GP4U Provider Agent — Installer
# Usage: curl -fsSL https://gp4u.com/install/provider | bash
# Or:    bash install.sh --token <your-token> --region us-east-1
set -euo pipefail

# ─── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${GREEN}[gp4u]${NC} $*"; }
warn()    { echo -e "${YELLOW}[gp4u]${NC} $*"; }
error()   { echo -e "${RED}[gp4u] ERROR:${NC} $*" >&2; exit 1; }

# ─── Banner ───────────────────────────────────────────────────────────────────
echo ""
echo "  ██████╗ ██████╗ ██╗  ██╗██╗   ██╗"
echo " ██╔════╝ ██╔══██╗██║  ██║██║   ██║"
echo " ██║  ███╗██████╔╝███████║██║   ██║"
echo " ██║   ██║██╔═══╝ ██╔══██║██║   ██║"
echo " ╚██████╔╝██║     ██║  ██║╚██████╔╝"
echo "  ╚═════╝ ╚═╝     ╚═╝  ╚═╝ ╚═════╝ "
echo "  Provider Agent Installer v0.1.0"
echo ""

# ─── Args ─────────────────────────────────────────────────────────────────────
TOKEN=""
REGION="us-east-1"
API_URL="https://gp4u.com"
INSTALL_DIR="$HOME/.gp4u/agent"
SERVICE_NAME="gp4u-provider"

while [[ $# -gt 0 ]]; do
  case $1 in
    --token)   TOKEN="$2";   shift 2 ;;
    --region)  REGION="$2";  shift 2 ;;
    --api-url) API_URL="$2"; shift 2 ;;
    *) error "Unknown argument: $1" ;;
  esac
done

if [[ -z "$TOKEN" ]]; then
  echo -n "Enter your provider token (from https://gp4u.com/dashboard/provider): "
  read -r TOKEN
fi
[[ -z "$TOKEN" ]] && error "Token is required."

# ─── Checks ───────────────────────────────────────────────────────────────────
info "Checking prerequisites…"

command -v python3 >/dev/null 2>&1 || error "Python 3.10+ required. Install via: apt install python3.11"
PY_VER=$(python3 -c "import sys; print(sys.version_info[:2] >= (3,10))")
[[ "$PY_VER" != "True" ]] && error "Python 3.10+ required (found $(python3 --version))"
info "  ✓ Python $(python3 --version)"

command -v docker >/dev/null 2>&1 || error "Docker is required. Install: https://docs.docker.com/get-docker/"
docker info >/dev/null 2>&1 || error "Docker daemon is not running. Start it first."
info "  ✓ Docker $(docker --version | awk '{print $3}' | tr -d ',')"

# NVIDIA GPU check (non-fatal — mock mode works without GPU)
if command -v nvidia-smi >/dev/null 2>&1; then
  GPU_COUNT=$(nvidia-smi --query-gpu=name --format=csv,noheader | wc -l)
  info "  ✓ ${GPU_COUNT} NVIDIA GPU(s) detected"
else
  warn "  ⚠ nvidia-smi not found — running in mock/dev mode (no real jobs will run)"
fi

# ─── Install ──────────────────────────────────────────────────────────────────
info "Installing GP4U Provider Agent to $INSTALL_DIR"

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Download or copy agent source
if [[ -d "$HOME/GP4U-Review/apps/provider-agent" ]]; then
  # Dev mode: symlink local source
  info "  (dev mode: using local source)"
  cp -r "$HOME/GP4U-Review/apps/provider-agent/." "$INSTALL_DIR/"
else
  # Production: download from platform
  info "  Downloading agent source…"
  curl -fsSL "$API_URL/releases/provider-agent-latest.tar.gz" | tar -xz --strip-components=1
fi

# Create virtualenv
info "Setting up Python environment…"
python3 -m venv "$INSTALL_DIR/.venv"
"$INSTALL_DIR/.venv/bin/pip" install --quiet --upgrade pip
"$INSTALL_DIR/.venv/bin/pip" install --quiet -r "$INSTALL_DIR/requirements.txt"
info "  ✓ Dependencies installed"

# Save config
mkdir -p "$HOME/.gp4u"
cat > "$HOME/.gp4u/provider.json" <<EOF
{
  "token":    "$TOKEN",
  "region":   "$REGION",
  "api_url":  "$API_URL",
  "node_id":  "$(python3 -c "import uuid; print(uuid.uuid4())")"
}
EOF
chmod 600 "$HOME/.gp4u/provider.json"
info "  ✓ Config saved to ~/.gp4u/provider.json"

# Create launcher script
cat > "$INSTALL_DIR/gp4u-provider" <<'LAUNCHER'
#!/usr/bin/env bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CFG="$HOME/.gp4u/provider.json"

TOKEN=$(python3 -c "import json; d=json.load(open('$CFG')); print(d['token'])")
REGION=$(python3 -c "import json; d=json.load(open('$CFG')); print(d.get('region','us-east-1'))")
API_URL=$(python3 -c "import json; d=json.load(open('$CFG')); print(d.get('api_url','https://gp4u.com'))")

exec "$DIR/.venv/bin/python" -m src.agent \
  --token "$TOKEN" \
  --region "$REGION" \
  --api-url "$API_URL" \
  "$@"
LAUNCHER
chmod +x "$INSTALL_DIR/gp4u-provider"

# Create symlink in PATH
if [[ -d "$HOME/.local/bin" ]]; then
  ln -sf "$INSTALL_DIR/gp4u-provider" "$HOME/.local/bin/gp4u-provider"
  info "  ✓ gp4u-provider available in PATH"
fi

# ─── systemd service (Linux only) ─────────────────────────────────────────────
if command -v systemctl >/dev/null 2>&1 && [[ "$(uname)" == "Linux" ]]; then
  SYSTEMD_DIR="$HOME/.config/systemd/user"
  mkdir -p "$SYSTEMD_DIR"

  cat > "$SYSTEMD_DIR/$SERVICE_NAME.service" <<EOF
[Unit]
Description=GP4U Provider Agent
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
ExecStart=$INSTALL_DIR/gp4u-provider
Restart=always
RestartSec=30
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
EOF

  systemctl --user daemon-reload
  systemctl --user enable --now "$SERVICE_NAME"
  info "  ✓ Systemd service installed and started"
  info "    Check status:  systemctl --user status $SERVICE_NAME"
  info "    View logs:     journalctl --user -u $SERVICE_NAME -f"
else
  info ""
  info "To start the agent manually:"
  info "  $INSTALL_DIR/gp4u-provider"
  info ""
  info "To run as a background process:"
  info "  nohup $INSTALL_DIR/gp4u-provider > ~/.gp4u/agent.log 2>&1 &"
fi

# ─── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  GP4U Provider Agent installed successfully!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Region:   $REGION"
echo "  Platform: $API_URL"
echo "  Config:   ~/.gp4u/provider.json"
echo ""
echo "  Your GPUs will appear in your dashboard within 60 seconds."
echo "  Jobs will run automatically in isolated Docker containers."
echo ""
