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

# Tier defaults — detected from context, overridable
PROVIDER_TIER=""           # UNIVERSITY or COMMERCIAL
INSTITUTION_NAME=""
INSTITUTION_EMAIL=""
MOU_ACCEPTED="false"

while [[ $# -gt 0 ]]; do
  case $1 in
    --token)             TOKEN="$2";            shift 2 ;;
    --region)            REGION="$2";           shift 2 ;;
    --api-url)           API_URL="$2";          shift 2 ;;
    --tier)              PROVIDER_TIER="$2";    shift 2 ;;
    --institution-name)  INSTITUTION_NAME="$2"; shift 2 ;;
    --institution-email) INSTITUTION_EMAIL="$2";shift 2 ;;
    --accept-mou)        MOU_ACCEPTED="true";   shift   ;;
    *) error "Unknown argument: $1" ;;
  esac
done

if [[ -z "$TOKEN" ]]; then
  echo -n "Enter your provider token (from https://gp4u.com/dashboard/provider): "
  read -r TOKEN
fi
[[ -z "$TOKEN" ]] && error "Token is required."

# ─── Detect provider tier ─────────────────────────────────────────────────────
# Auto-detect university tier from email domain if not specified.
if [[ -z "$PROVIDER_TIER" ]]; then
  echo ""
  echo "  Are you registering as:"
  echo "  [1] University / Research Institution (no cash stake — .edu email required)"
  echo "  [2] Commercial Provider (GPU farm, gaming cafe, individual)"
  echo -n "  Select [1/2]: "
  read -r TIER_CHOICE
  case "$TIER_CHOICE" in
    1) PROVIDER_TIER="UNIVERSITY" ;;
    2) PROVIDER_TIER="COMMERCIAL" ;;
    *) error "Invalid selection. Run again and choose 1 or 2." ;;
  esac
fi

# University-specific prompts
if [[ "$PROVIDER_TIER" == "UNIVERSITY" ]]; then
  echo ""
  info "University Tier — Reputational stake only. Your institution's brand is your commitment."

  if [[ -z "$INSTITUTION_NAME" ]]; then
    echo -n "  Institution name (e.g. 'MIT Department of EECS'): "
    read -r INSTITUTION_NAME
  fi
  [[ -z "$INSTITUTION_NAME" ]] && error "Institution name required for university tier."

  if [[ -z "$INSTITUTION_EMAIL" ]]; then
    echo -n "  Your institutional .edu email: "
    read -r INSTITUTION_EMAIL
  fi
  [[ "$INSTITUTION_EMAIL" != *".edu" ]] && error "A valid .edu email address is required for university tier."

  if [[ "$MOU_ACCEPTED" != "true" ]]; then
    echo ""
    echo "  ┌─────────────────────────────────────────────────────────────────────┐"
    echo "  │  GP4U University Provider MOU — Key Terms                          │"
    echo "  │                                                                     │"
    echo "  │  1. Hardware Visibility: You grant GP4U full visibility into GPU    │"
    echo "  │     utilization, VRAM, power draw, and process telemetry while     │"
    echo "  │     jobs run on your hardware. This is NON-NEGOTIABLE.             │"
    echo "  │                                                                     │"
    echo "  │  2. Reputational Stake: Your institution's public reputation        │"
    echo "  │     serves as your stake. Slash events are written to the           │"
    echo "  │     Obsidian public ledger permanently.                            │"
    echo "  │                                                                     │"
    echo "  │  3. Job Integrity: You will not tamper with telemetry, run          │"
    echo "  │     unauthorized processes, or interfere with customer jobs.        │"
    echo "  │                                                                     │"
    echo "  │  4. Students: A share of compute revenue will be allocated to       │"
    echo "  │     student programs at your institution per agreed terms.          │"
    echo "  └─────────────────────────────────────────────────────────────────────┘"
    echo ""
    echo -n "  Type 'I ACCEPT' to acknowledge the MOU: "
    read -r MOU_RESPONSE
    [[ "$MOU_RESPONSE" != "I ACCEPT" ]] && error "MOU acceptance required. Run again and type 'I ACCEPT'."
    MOU_ACCEPTED="true"
  fi
  info "  ✓ MOU accepted by $INSTITUTION_EMAIL at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
fi

# ─── Visibility T&C (ALL providers) ───────────────────────────────────────────
echo ""
echo "  ┌─────────────────────────────────────────────────────────────────────┐"
echo "  │  Hardware Visibility Agreement — Required for ALL Providers        │"
echo "  │                                                                     │"
echo "  │  By installing this agent, you grant GP4U full visibility into:    │"
echo "  │    • GPU utilization, VRAM usage, power draw, temperature          │"
echo "  │    • Network connections (outbound IPs, bandwidth)                 │"
echo "  │    • Running processes during active jobs                          │"
echo "  │    • Hardware specifications (GPU model, VRAM, RAM, CPU)          │"
echo "  │                                                                     │"
echo "  │  This visibility is what makes GP4U trustworthy.                   │"
echo "  │  Providers who cannot agree with this should not join.             │"
echo "  └─────────────────────────────────────────────────────────────────────┘"
echo ""
echo -n "  Type 'I CONSENT' to agree to hardware visibility: "
read -r VISIBILITY_RESPONSE
[[ "$VISIBILITY_RESPONSE" != "I CONSENT" ]] && error "Hardware visibility consent required. This cannot be waived."
VISIBILITY_CONSENT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
info "  ✓ Visibility consent recorded at $VISIBILITY_CONSENT_AT"

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

# Save config (mode 600 — readable by owner only)
NODE_ID="$(python3 -c "import uuid; print(uuid.uuid4())")"
mkdir -p "$HOME/.gp4u"
cat > "$HOME/.gp4u/provider.json" <<EOF
{
  "token":                  "$TOKEN",
  "region":                 "$REGION",
  "api_url":                "$API_URL",
  "node_id":                "$NODE_ID",
  "tier":                   "$PROVIDER_TIER",
  "institution_name":       "$INSTITUTION_NAME",
  "institution_email":      "$INSTITUTION_EMAIL",
  "mou_accepted":           $MOU_ACCEPTED,
  "visibility_consent_at":  "$VISIBILITY_CONSENT_AT"
}
EOF
chmod 600 "$HOME/.gp4u/provider.json"
info "  ✓ Config saved to ~/.gp4u/provider.json (mode 600)"

# Detect GPU count for stake quote
GPU_COUNT=0
if command -v nvidia-smi >/dev/null 2>&1; then
  GPU_COUNT=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | wc -l | tr -d ' ')
fi

# Register node with the platform
info "Registering node with GP4U platform…"
GPU_MODELS="[]"
if command -v nvidia-smi >/dev/null 2>&1; then
  GPU_MODELS=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null \
    | python3 -c "import sys,json; print(json.dumps([l.strip() for l in sys.stdin]))")
fi

ONBOARD_PAYLOAD=$(python3 -c "
import json
payload = {
  'node_id':              '$NODE_ID',
  'tier':                 '$PROVIDER_TIER',
  'region':               '$REGION',
  'gpu_count':            $GPU_COUNT,
  'gpu_models':           $GPU_MODELS,
  'visibility_consent':   True,
  'institution_name':     '$INSTITUTION_NAME',
  'institution_email':    '$INSTITUTION_EMAIL',
  'mou_accepted':         $( [[ '$MOU_ACCEPTED' == 'true' ]] && echo 'True' || echo 'False' ),
}
print(json.dumps(payload))
")

ONBOARD_RESPONSE=$(curl -s -X POST "$API_URL/api/providers/onboard" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "$ONBOARD_PAYLOAD" 2>/dev/null || echo '{"error":"Registration failed — will retry on first start"}')

if echo "$ONBOARD_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if 'node_id' in d else 1)" 2>/dev/null; then
  NEXT_STEPS=$(echo "$ONBOARD_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('next_steps',''))" 2>/dev/null)
  info "  ✓ Node registered successfully"
  [[ -n "$NEXT_STEPS" ]] && info "  → $NEXT_STEPS"
else
  warn "  ⚠ Registration deferred — agent will register on first start"
fi

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
echo "  Node ID:  $NODE_ID"
echo "  Tier:     $PROVIDER_TIER"
echo "  Region:   $REGION"
echo "  Platform: $API_URL"
echo "  Config:   ~/.gp4u/provider.json  (mode 600)"
echo ""
if [[ "$PROVIDER_TIER" == "UNIVERSITY" ]]; then
  echo "  Institution:  $INSTITUTION_NAME"
  echo "  Stake:        Reputational (no cash required)"
  echo "  Slash record: Public on Obsidian ledger"
  echo ""
  echo "  Revenue will be shared with your institution's student programs"
  echo "  per the terms in your MOU. Watch your dashboard for earnings."
else
  echo "  Stake: Proportional to GPU count ($GPU_COUNT GPU(s))"
  echo "  Visit your dashboard to complete stake deposit and activate."
fi
echo ""
echo "  Your GPUs will appear in your dashboard within 60 seconds."
echo "  Jobs run automatically in isolated, monitored Docker containers."
echo "  Full hardware telemetry is collected per your visibility consent."
echo ""
