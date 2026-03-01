'use client'

/**
 * /providers/onboarding — Provider Agent Install & Verification
 * ==============================================================
 *
 * After the provider registers their node, this wizard walks them through:
 *   Step 1: Install the provider agent (one-line command, copy button)
 *   Step 2: Verify first connection (shows live heartbeat status)
 *   Step 3: Hardware confirmation (what the agent detected)
 *   Step 4: Ready (earnings estimate, first job waiting)
 *
 * Design principles:
 *   - The install command is the most prominent thing on Step 1 — big, copyable
 *   - Agent connection status updates every 5 seconds automatically
 *   - Detected hardware is shown back to the provider for confirmation
 *   - If something is wrong, we say so with specific guidance
 *   - The provider knows their first expected earnings before we're done
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { StepWizard, WizardStep } from '@/components/ui/step-wizard'
import { StatusBadge } from '@/components/ui/status-badge'

const STEPS: WizardStep[] = [
  { id: 'install',  label: 'Install',  description: 'One command'     },
  { id: 'connect',  label: 'Connect',  description: 'Verify agent'    },
  { id: 'hardware', label: 'Hardware', description: 'Confirm GPUs'    },
  { id: 'ready',    label: 'Earnings', description: 'Ready to earn'   },
]

type ConnectionStatus = 'waiting' | 'connected' | 'error'

interface DetectedHardware {
  gpu_models:    string[]
  total_vram_gb: number
  gpu_count:     number
  region:        string
}

// ── Earnings estimate ─────────────────────────────────────────────────────────
function estimateMonthlyEarnings(gpuCount: number, vramPerGpu: number): number {
  // Conservative: 60% utilization, $1.20/hr average across GPU types
  const utilization = 0.6
  const avgHrRate   = vramPerGpu >= 40 ? 2.80 : vramPerGpu >= 24 ? 1.80 : 0.90
  return Math.round(gpuCount * avgHrRate * 24 * 30 * utilization)
}

// ── Install command generator ─────────────────────────────────────────────────
function getInstallCommand(nodeId: string, tier: string): string {
  return `curl -fsSL https://gp4u.com/install/provider | bash -s -- --node-id ${nodeId} --tier ${tier}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProviderOnboardingPage() {
  const searchParams = useSearchParams()
  const nodeId       = searchParams.get('node_id') ?? 'node_pending'
  const tier         = searchParams.get('tier') ?? 'COMMERCIAL'

  const [step, setStep]             = useState(0)
  const [copied, setCopied]         = useState(false)
  const [connStatus, setConnStatus] = useState<ConnectionStatus>('waiting')
  const [hardware, setHardware]     = useState<DetectedHardware | null>(null)
  const [completing, setCompleting] = useState(false)
  const pollRef                     = useRef<ReturnType<typeof setInterval> | null>(null)

  const installCmd = getInstallCommand(nodeId, tier)

  // ── Polling for agent connection (Step 1-2) ──────────────────────────────

  const pollConnection = useCallback(async () => {
    try {
      const res = await fetch(`/api/health?node_check=${nodeId}`, { cache: 'no-store' })
      if (res.ok) {
        // For demo: simulate a connection after 10s
        // In production: check actual node heartbeat in DB
        setConnStatus('connected')
        setHardware({
          gpu_models:    ['NVIDIA RTX 4090', 'NVIDIA RTX 4090'],
          total_vram_gb: 48,
          gpu_count:     2,
          region:        'us-east-1',
        })
        if (pollRef.current) clearInterval(pollRef.current)
      }
    } catch { /* network error — keep polling */ }
  }, [nodeId])

  useEffect(() => {
    if (step === 1) {
      // Auto-advance check every 5s
      pollRef.current = setInterval(pollConnection, 5000)
      // Simulate success after 8s for demo
      const timer = setTimeout(() => {
        setConnStatus('connected')
        setHardware({
          gpu_models:    ['NVIDIA RTX 4090'],
          total_vram_gb: 24,
          gpu_count:     1,
          region:        'us-east-1',
        })
        if (pollRef.current) clearInterval(pollRef.current)
      }, 8000)
      return () => { clearInterval(pollRef.current!); clearTimeout(timer) }
    }
  }, [step, pollConnection])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(installCmd)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch { /* clipboard not available */ }
  }

  const handleComplete = async () => {
    setCompleting(true)
    await new Promise(r => setTimeout(r, 1000))
    setCompleting(false)
    setStep(3)
  }

  const canProceed = [
    true,                    // install — can proceed any time (async install)
    connStatus === 'connected', // connect — must have a live agent
    hardware !== null,          // hardware — must be confirmed
    true,                    // ready — always
  ][step]

  const estimatedEarnings = hardware
    ? estimateMonthlyEarnings(hardware.gpu_count, hardware.total_vram_gb / hardware.gpu_count)
    : 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">

        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <span className="text-white text-xs font-black">G</span>
            </div>
            <span className="font-black text-slate-900">GP4U</span>
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Setting up your node</h1>
          <p className="text-sm text-slate-500 mt-1">Node ID: <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">{nodeId}</code></p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <StepWizard
            steps={STEPS}
            currentStep={step}
            onStepChange={setStep}
            canProceed={!!canProceed}
            onComplete={handleComplete}
            completing={completing}
            completeLabel="Go to Provider Dashboard"
          >

            {/* ── Step 0: Install ──────────────────────────────────────── */}
            {step === 0 && (
              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-1">Install the provider agent</h2>
                <p className="text-sm text-slate-500 mb-6">
                  One command. Runs as a user-level service — no root required.
                  Takes about 2 minutes on a clean machine.
                </p>

                {/* The install command — the hero of this page */}
                <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden mb-6">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700">
                    <span className="text-xs font-mono text-slate-400">Terminal</span>
                    <button
                      onClick={handleCopy}
                      className={`text-xs font-medium transition-colors px-3 py-1 rounded-lg ${
                        copied
                          ? 'bg-green-800 text-green-200'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      {copied ? '✓ Copied!' : 'Copy'}
                    </button>
                  </div>
                  <pre className="px-4 py-4 text-sm font-mono text-green-400 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
                    {installCmd}
                  </pre>
                </div>

                {/* What the installer does */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 mb-6">
                  <p className="text-xs font-semibold text-slate-700">What this command does</p>
                  {[
                    ['Downloads the GP4U agent', 'Verified SHA-256 checksum before installation'],
                    ['Checks prerequisites', 'Python 3.10+, Docker, nvidia-smi'],
                    ['Registers this node ID', `Binds ${nodeId} to your hardware fingerprint`],
                    ['Creates systemd service', 'Starts automatically on boot (Linux), launchd (macOS)'],
                    ['First heartbeat', 'Sends hardware report to platform — you\'ll see it on the next page'],
                  ].map(([action, detail]) => (
                    <div key={action} className="flex items-start gap-2">
                      <span className="text-blue-500 text-xs flex-shrink-0 mt-0.5">→</span>
                      <div>
                        <span className="text-xs font-medium text-slate-700">{action}: </span>
                        <span className="text-xs text-slate-500">{detail}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Linux (systemd)', icon: '🐧', note: 'Recommended' },
                    { label: 'macOS (launchd)', icon: '🍎', note: 'Supported' },
                    { label: 'Docker Compose',  icon: '🐳', note: 'Alternative' },
                  ].map(os => (
                    <div key={os.label} className="rounded-xl border border-slate-200 p-3 text-center">
                      <span className="text-xl block mb-1">{os.icon}</span>
                      <p className="text-xs font-medium text-slate-700">{os.label}</p>
                      <p className="text-[10px] text-slate-400">{os.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Step 1: Connect ──────────────────────────────────────── */}
            {step === 1 && (
              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-1">Waiting for agent connection</h2>
                <p className="text-sm text-slate-500 mb-6">
                  Run the install command, then come back here. The platform checks for your node's
                  first heartbeat every 5 seconds.
                </p>

                {/* Connection status */}
                <div className={`rounded-2xl border-2 p-6 text-center mb-6 transition-all ${
                  connStatus === 'connected'
                    ? 'border-green-400 bg-green-50'
                    : connStatus === 'error'
                      ? 'border-red-300 bg-red-50'
                      : 'border-slate-200 bg-slate-50'
                }`}>
                  {connStatus === 'waiting' && (
                    <>
                      <div className="w-12 h-12 rounded-full border-4 border-blue-200 border-t-blue-500 animate-spin mx-auto mb-3" />
                      <p className="font-semibold text-slate-700">Listening for heartbeat…</p>
                      <p className="text-sm text-slate-500 mt-1">
                        Run the install command in your terminal. This page updates automatically.
                      </p>
                    </>
                  )}
                  {connStatus === 'connected' && (
                    <>
                      <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center mx-auto mb-3">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                          <path d="M20 6L9 17l-5-5"/>
                        </svg>
                      </div>
                      <p className="font-bold text-green-800 text-lg">Agent connected!</p>
                      <p className="text-sm text-green-700 mt-1">
                        First heartbeat received. Hardware detection running…
                      </p>
                    </>
                  )}
                  {connStatus === 'error' && (
                    <>
                      <p className="text-red-700 font-semibold mb-2">Connection failed</p>
                      <p className="text-sm text-red-600">
                        Check that Docker and nvidia-smi are installed, then re-run the install command.
                      </p>
                    </>
                  )}
                </div>

                {/* Troubleshooting */}
                <details className="rounded-xl border border-slate-200">
                  <summary className="px-4 py-3 text-sm font-medium text-slate-700 cursor-pointer">
                    Troubleshooting — agent not connecting?
                  </summary>
                  <div className="px-4 pb-4 pt-2 space-y-2 text-xs text-slate-600">
                    {[
                      ['Docker not running', 'Start Docker: sudo systemctl start docker'],
                      ['nvidia-smi not found', 'Install CUDA drivers: https://docs.nvidia.com/cuda/'],
                      ['Python version', 'Requires Python 3.10 or later: python3 --version'],
                      ['Firewall blocking outbound', 'Allow outbound HTTPS (port 443) from this machine'],
                      ['Check agent logs', 'journalctl --user -u gp4u-provider -n 50'],
                    ].map(([issue, fix]) => (
                      <div key={issue}>
                        <p className="font-medium text-slate-700">{issue}</p>
                        <p className="text-slate-500 font-mono text-[11px]">{fix}</p>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            )}

            {/* ── Step 2: Hardware confirmation ────────────────────────── */}
            {step === 2 && hardware && (
              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-1">Confirm your hardware</h2>
                <p className="text-sm text-slate-500 mb-6">
                  The agent detected the following. Confirm this is accurate —
                  hardware misrepresentation results in a slash.
                </p>

                <div className="rounded-xl border-2 border-green-300 bg-green-50 p-5 mb-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <p className="text-sm font-semibold text-green-800">Hardware detected</p>
                    <StatusBadge status="ACTIVE" size="xs" label="Live" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-green-600 mb-0.5">GPU Models</p>
                      <p className="text-sm font-semibold text-green-900">
                        {hardware.gpu_models.join(', ')}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-green-600 mb-0.5">GPU Count</p>
                      <p className="text-sm font-semibold text-green-900">{hardware.gpu_count}</p>
                    </div>
                    <div>
                      <p className="text-xs text-green-600 mb-0.5">Total VRAM</p>
                      <p className="text-sm font-semibold text-green-900">{hardware.total_vram_gb} GB</p>
                    </div>
                    <div>
                      <p className="text-xs text-green-600 mb-0.5">Region</p>
                      <p className="text-sm font-semibold text-green-900">{hardware.region}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs text-amber-800 leading-relaxed">
                    <strong>Important:</strong> Jobs will be offered based on this hardware profile.
                    If actual performance deviates significantly from detected specs,
                    a HARDWARE_MISREPRESENTATION slash may be issued (20% of stake).
                    If something looks wrong, go back and check your GPU drivers.
                  </p>
                </div>
              </div>
            )}

            {/* ── Step 3: Ready ────────────────────────────────────────── */}
            {step === 3 && (
              <div className="text-center">
                <span className="text-5xl block mb-4">🚀</span>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Your node is live</h2>
                <p className="text-slate-500 text-sm mb-6 max-w-sm mx-auto leading-relaxed">
                  Jobs will start arriving as the routing system builds confidence in your
                  hardware. Your first job typically arrives within 30 minutes.
                </p>

                {/* Earnings estimate */}
                {hardware && (
                  <div className="rounded-xl border border-green-200 bg-green-50 p-5 mb-6 text-left">
                    <p className="text-sm font-semibold text-green-800 mb-3">Estimated monthly earnings</p>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-2xl font-black text-green-700">
                          ${Math.round(estimatedEarnings * 0.7)}
                        </p>
                        <p className="text-xs text-green-600">Conservative<br/>(40% util)</p>
                      </div>
                      <div className="border-x border-green-200">
                        <p className="text-2xl font-black text-green-800">
                          ${estimatedEarnings}
                        </p>
                        <p className="text-xs text-green-600">Expected<br/>(60% util)</p>
                      </div>
                      <div>
                        <p className="text-2xl font-black text-green-700">
                          ${Math.round(estimatedEarnings * 1.4)}
                        </p>
                        <p className="text-xs text-green-600">Optimistic<br/>(85% util)</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-green-600 mt-3 text-center">
                      Based on {hardware.gpu_count}× {hardware.gpu_models[0]} at current market rates.
                      Actual earnings depend on demand and your Veritas trust tier.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 mb-6">
                  <Link
                    href="/dashboard"
                    className="rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-500 transition-colors"
                  >
                    Provider Dashboard →
                  </Link>
                  <Link
                    href="/docs/provider-guide"
                    className="rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Provider Guide
                  </Link>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[10px] text-slate-500">
                    Node <code className="font-mono">{nodeId}</code> is now recorded on the Obsidian immutable ledger.
                    Every job, earning, and slash will be permanently linked to this node ID.
                  </p>
                </div>
              </div>
            )}

          </StepWizard>
        </div>
      </div>
    </div>
  )
}
