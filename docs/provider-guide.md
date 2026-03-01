# Provider Guide — Joining the GP4U Network

This guide covers everything a GPU provider needs to join the GP4U network and start earning from idle hardware.

---

## Two Paths to Joining

### University / Research Institution

Perfect for: CS departments, research labs, HPC centers, university IT departments

**What you get:**
- Zero cash stake required — your institution's reputation is the commitment
- Student program revenue share (per MOU terms)
- Priority job routing from enterprise customers who prefer verified academic supply
- A public Veritas profile showing your cluster's reliability and provenance record

**What's required:**
- Verified `.edu` email address
- Institution name (e.g. "MIT CSAIL", "Stanford HAI")
- Signed MOU (digital acceptance during install)
- Full hardware visibility consent (non-negotiable for all providers)

### Commercial Provider

Perfect for: GPU farms, mining operations transitioning from crypto, gaming cafes, cloud providers with idle capacity, individuals with high-end gaming hardware

**Stake required (GP4U credits, USD-pegged):**

| Your Fleet | Per-GPU Stake | Total Stake |
|---|---|---|
| 1–4 GPUs | $50/GPU | $50–$200 |
| 5–16 GPUs | $35/GPU | $175–$560 |
| 17+ GPUs | $25/GPU | $425+ (audit required) |

Stake is held in escrow and fully released on clean exit. If your hardware performs as declared and you follow platform rules, you get it back.

---

## Installation

### Prerequisites

- Python 3.10+
- Docker (running)
- NVIDIA GPU(s) with nvidia-smi accessible
- Linux (systemd recommended) or macOS

### One-Line Install

```bash
curl -fsSL https://gp4u.com/install/provider | bash
```

Or with arguments for automation:

```bash
bash install.sh \
  --token your_provider_token \
  --region us-east-1 \
  --tier UNIVERSITY \
  --institution-name "Stanford HAI" \
  --institution-email your@stanford.edu \
  --accept-mou
```

### What the Installer Does

1. **Tier selection** — prompts University or Commercial
2. **MOU or stake acknowledgment** — displays full terms inline
3. **Visibility consent** — Hardware Visibility Agreement (all providers)
4. **Prerequisites check** — Python, Docker, nvidia-smi
5. **Source install** — copies agent to `~/.gp4u/agent/`
6. **Environment setup** — creates Python virtualenv, installs deps
7. **Node registration** — calls `/api/providers/onboard` with your hardware fingerprint
8. **Config saved** — `~/.gp4u/provider.json` (mode 600, owner-readable only)
9. **Systemd service** — installed and started on Linux

---

## The Visibility Agreement

**This is mandatory and non-negotiable.**

When you install the GP4U provider agent, you agree to grant the platform full visibility into:

- GPU utilization, VRAM usage, power draw, temperature
- Network connections (outbound IPs, bandwidth) during active jobs
- Running processes alongside customer jobs
- Hardware specifications (GPU model, VRAM, RAM, CPU)

**Why this exists:** The visibility requirement is the foundation of trust on GP4U. It is also a natural filter — providers with something to hide will not agree to these terms. That is intentional.

During installation you will be prompted:
```
Type 'I CONSENT' to agree to hardware visibility:
```

There is no way around this. If you cannot agree, you cannot join. This protects every customer who trusts the platform.

---

## How Jobs Are Assigned

After your node is active:

1. Your agent polls for job assignments every 15 seconds
2. Atlas (the routing subsystem) matches jobs to nodes based on:
   - Hardware match (GPU type, VRAM)
   - Trust score and Veritas tier
   - Geographic latency (Aetherion)
   - Carbon intensity of your region (Energy Broker)
   - Chamber routing preferences
3. Matched job arrives in your agent's poll response
4. Agent launches the job in a secured Docker container
5. Telemetry streams back to the platform every 10 seconds

---

## Container Security (What Runs On Your Hardware)

Every job runs in a fully isolated Docker container with:

```
--gpus device=N        Only your assigned GPU; no full host access
--memory <limit>       Hard RAM cap from job manifest
--pids-limit 512       Prevents fork bombs
--cap-drop ALL         Zero Linux capabilities
--no-new-privileges    Cannot escalate permissions
--read-only            Read-only root filesystem
--network bridge       Outbound internet only; no inbound ports
--volume /input:ro     Customer inputs are read-only
--volume /output:rw    Output directory is the only writable location
```

The Docker image is pulled using a digest-pinned reference (`image@sha256:...`), which Docker verifies against the content hash. No one can swap the image for something malicious.

---

## Earnings

**How you get paid:**

- Per job: `GPU_hourly_rate × actual_duration_hours`
- Platform fee deducted (small percentage)
- University providers: student program share allocated per MOU
- Carbon credits: if your power is ≥50% renewable, you earn carbon credit revenue on top of compute revenue (Aetherion + ZK energy attestation)

**Payment settlement:**
- Credited to your GP4U account after each job completes
- Withdraw to bank/crypto per your payout settings

---

## Monitoring Your Node

**Dashboard:** `https://gp4u.com/dashboard/provider`

Shows:
- Active jobs and telemetry
- Earnings (daily, weekly, all-time)
- Uptime percentage (30-day rolling)
- Veritas tier and trust score
- Slash history (if any)
- ZK proof submissions

**CLI:**
```bash
gp4u health          # Platform status
gp4u status          # Your node status
```

**Logs:**
```bash
journalctl --user -u gp4u-provider -f   # Live logs (Linux systemd)
~/.gp4u/agent.log                        # File log (macOS / manual)
```

---

## Slash & Appeal Reference

See [Staking & Slashing](./staking-and-slashing.md) for the complete guide.

**Quick reference — things that will get you slashed:**
- Running more VRAM than declared (soft slash)
- Dropping a job without handoff (soft slash)
- Blocking the visibility layer (hard slash + ejection)
- Mining crypto during an ML job (hard slash + ejection)
- Tampering with telemetry (hard slash + ejection)

**Things that will NOT get you slashed:**
- Brief network interruptions with proper job handoff
- Thermal throttle events (warning only)
- Hardware that performs slightly below peak in hot conditions

---

## University Providers — Student Program

When your institution joins as a university tier provider:

1. A revenue share percentage (per MOU) is allocated from every job processed on your hardware
2. Funds accumulate in your institution's GP4U account
3. Disbursed quarterly per your institution's designated student programs
4. All allocations visible and auditable on the Obsidian ledger

Typical use cases for student program funds:
- Research compute credits for grad students
- Hackathon GPU access
- Course infrastructure (ML/AI coursework)
- Open research grants

---

## Exiting the Network

To exit cleanly:

1. Stop accepting new jobs: set your node to `DRAINING` mode in the dashboard
2. Wait for active jobs to complete (or request job transfers via support)
3. Request stake release (commercial) — processed after 7-day cooldown with no pending slashes
4. Uninstall the agent: `systemctl --user disable --now gp4u-provider && rm -rf ~/.gp4u`

Your Obsidian ledger record (slash history, job history, ZK proofs) persists permanently — this is by design.
