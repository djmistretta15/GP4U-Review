'use client'

/**
 * Workload Advisor Widget
 * =======================
 *
 * Floating hotbar widget that lets users describe their workload (or drag-and-drop
 * a project file / requirements.txt / model card) and immediately get a GPU
 * recommendation with VRAM requirements, estimated duration, and cost.
 *
 * Design:
 *   - Collapsed: a small floating tab anchored to the bottom-right
 *   - Expanded: a panel with description textarea + file drop zone
 *   - Result: recommendation card with one-click "Run This Job"
 *
 * The widget is intentionally minimal — it is a quick-start tool, not a
 * full job configuration form. Complex jobs go through the full /dashboard flow.
 */

import { useState, useCallback, useRef, DragEvent, ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkloadInputForm {
  description:    string
  framework:      string
  model_size_b:   string
  dataset_size_gb:string
  precision:      string
  workload_type:  string
  budget_usd:     string
}

interface GpuRecommendation {
  gpu_type:                string
  gpu_count:               number
  vram_required_gb:        number
  estimated_duration_hours:number
  estimated_cost_usd:      number
  confidence:              'HIGH' | 'MEDIUM' | 'LOW'
  reasoning:               string
  available_now:           boolean
}

interface RecommendResult {
  recommendation: GpuRecommendation
  alternatives:   GpuRecommendation[]
  workload_type:  string
  disclaimer:     string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FRAMEWORKS = ['pytorch', 'tensorflow', 'jax', 'huggingface', 'custom']
const PRECISIONS = ['bf16', 'fp16', 'fp32', 'int8', 'int4']
const WORKLOAD_TYPES = ['TRAINING', 'FINE_TUNING', 'INFERENCE', 'RENDERING', 'DATA_PROCESSING', 'SIMULATION']

const CONFIDENCE_COLORS: Record<string, string> = {
  HIGH:   'text-green-400',
  MEDIUM: 'text-yellow-400',
  LOW:    'text-orange-400',
}

const DEFAULT_FORM: WorkloadInputForm = {
  description:     '',
  framework:       'pytorch',
  model_size_b:    '7',
  dataset_size_gb: '10',
  precision:       'bf16',
  workload_type:   '',
  budget_usd:      '',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WorkloadAdvisor() {
  const router = useRouter()
  const [open, setOpen]       = useState(false)
  const [form, setForm]       = useState<WorkloadInputForm>(DEFAULT_FORM)
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<RecommendResult | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInputRef          = useRef<HTMLInputElement>(null)

  // ── Form helpers ──────────────────────────────────────────────────────────

  const setField = (key: keyof WorkloadInputForm) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }))

  const reset = () => {
    setForm(DEFAULT_FORM)
    setResult(null)
    setError(null)
  }

  // ── File drop handling ────────────────────────────────────────────────────

  const extractTextFromFile = async (file: File): Promise<string> => {
    const text = await file.text()
    // For requirements.txt, parse package names for framework detection
    // For model cards (.md), extract relevant sections
    // For Python files, look for imports
    return text.slice(0, 3000)  // cap at 3KB for the description field
  }

  const handleDrop = useCallback(async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file) return

    const text = await extractTextFromFile(file)
    const name = file.name.toLowerCase()

    // Auto-detect framework from file contents
    let framework = form.framework
    if (text.includes('import torch') || text.includes('pytorch')) framework = 'pytorch'
    else if (text.includes('import tensorflow') || text.includes('tf.')) framework = 'tensorflow'
    else if (text.includes('import jax')) framework = 'jax'
    else if (text.includes('transformers') || text.includes('huggingface')) framework = 'huggingface'

    setForm(f => ({
      ...f,
      description: `File: ${file.name}\n\n${text.slice(0, 500)}`,
      framework,
    }))
  }, [form.framework])

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(true)
  }

  const handleDragLeave = () => setDragging(false)

  // ── API call ──────────────────────────────────────────────────────────────

  const getRecommendation = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const payload = {
        description:     form.description,
        framework:       form.framework,
        model_size_b:    parseFloat(form.model_size_b) || undefined,
        dataset_size_gb: parseFloat(form.dataset_size_gb) || undefined,
        precision:       form.precision,
        workload_type:   form.workload_type || undefined,
        budget_usd:      parseFloat(form.budget_usd) || undefined,
      }

      const res = await fetch('/api/workload/recommend', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }

      const data: RecommendResult = await res.json()
      setResult(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to get recommendation')
    } finally {
      setLoading(false)
    }
  }

  const launchJob = (rec: GpuRecommendation) => {
    // Navigate to dashboard with pre-filled job params
    const params = new URLSearchParams({
      gpu_type:       rec.gpu_type,
      gpu_count:      String(rec.gpu_count),
      duration_hours: String(rec.estimated_duration_hours),
      workload_type:  result?.workload_type ?? 'TRAINING',
    })
    router.push(`/dashboard?${params.toString()}`)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">

      {/* Expanded Panel */}
      {open && (
        <div className="w-96 rounded-2xl border border-white/10 bg-zinc-900/95 shadow-2xl backdrop-blur-md flex flex-col overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-white">Workload Advisor</p>
              <p className="text-xs text-zinc-400">Describe your job — get the right GPU</p>
            </div>
            <button onClick={reset} className="text-xs text-zinc-500 hover:text-zinc-300">Reset</button>
          </div>

          <div className="p-4 flex flex-col gap-3 overflow-y-auto max-h-[70vh]">

            {/* File Drop Zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`rounded-xl border-2 border-dashed px-4 py-3 text-center cursor-pointer transition-colors ${
                dragging
                  ? 'border-blue-400 bg-blue-400/10'
                  : 'border-white/10 hover:border-white/20 bg-white/5'
              }`}
            >
              <p className="text-xs text-zinc-400">
                {dragging ? 'Drop to analyze' : 'Drop requirements.txt, model card, or .py file'}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".txt,.md,.py,.ipynb,.json,.yaml,.yml"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    const text = await extractTextFromFile(file)
                    setForm(f => ({ ...f, description: `File: ${file.name}\n\n${text.slice(0, 500)}` }))
                  }
                }}
              />
            </div>

            {/* Description */}
            <textarea
              value={form.description}
              onChange={setField('description')}
              placeholder="Describe your workload... e.g. 'Fine-tuning LLaMA 7B on medical records dataset'"
              rows={3}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-zinc-500 resize-none focus:outline-none focus:border-blue-400/50"
            />

            {/* Parameters Row 1 */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Framework</label>
                <select
                  value={form.framework}
                  onChange={setField('framework')}
                  className="w-full rounded-lg border border-white/10 bg-zinc-800 px-2 py-1.5 text-sm text-white focus:outline-none"
                >
                  {FRAMEWORKS.map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Precision</label>
                <select
                  value={form.precision}
                  onChange={setField('precision')}
                  className="w-full rounded-lg border border-white/10 bg-zinc-800 px-2 py-1.5 text-sm text-white focus:outline-none"
                >
                  {PRECISIONS.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Parameters Row 2 */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Model Size (B params)</label>
                <input
                  type="number"
                  value={form.model_size_b}
                  onChange={setField('model_size_b')}
                  placeholder="7"
                  min="0.001"
                  max="1000"
                  step="0.5"
                  className="w-full rounded-lg border border-white/10 bg-zinc-800 px-2 py-1.5 text-sm text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Dataset Size (GB)</label>
                <input
                  type="number"
                  value={form.dataset_size_gb}
                  onChange={setField('dataset_size_gb')}
                  placeholder="10"
                  min="0.001"
                  max="10000"
                  className="w-full rounded-lg border border-white/10 bg-zinc-800 px-2 py-1.5 text-sm text-white focus:outline-none"
                />
              </div>
            </div>

            {/* Optional fields */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Workload Type</label>
                <select
                  value={form.workload_type}
                  onChange={setField('workload_type')}
                  className="w-full rounded-lg border border-white/10 bg-zinc-800 px-2 py-1.5 text-sm text-white focus:outline-none"
                >
                  <option value="">Auto-detect</option>
                  {WORKLOAD_TYPES.map(t => (
                    <option key={t} value={t}>{t.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Budget (USD, optional)</label>
                <input
                  type="number"
                  value={form.budget_usd}
                  onChange={setField('budget_usd')}
                  placeholder="No limit"
                  min="1"
                  className="w-full rounded-lg border border-white/10 bg-zinc-800 px-2 py-1.5 text-sm text-white focus:outline-none"
                />
              </div>
            </div>

            {/* Analyze Button */}
            <button
              onClick={getRecommendation}
              disabled={loading || (!form.description && !form.model_size_b)}
              className="w-full rounded-xl bg-blue-500 py-2.5 text-sm font-semibold text-white hover:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Analyzing…' : 'Get GPU Recommendation'}
            </button>

            {/* Error */}
            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            {/* Result */}
            {result && (
              <div className="flex flex-col gap-3">
                <RecommendationCard
                  rec={result.recommendation}
                  label="Best Match"
                  primary
                  onLaunch={launchJob}
                />

                {result.alternatives.length > 0 && (
                  <>
                    <p className="text-xs text-zinc-500">Alternatives</p>
                    {result.alternatives.map((alt, i) => (
                      <RecommendationCard
                        key={i}
                        rec={alt}
                        label={`Option ${i + 2}`}
                        primary={false}
                        onLaunch={launchJob}
                      />
                    ))}
                  </>
                )}

                <p className="text-xs text-zinc-500 leading-relaxed">{result.disclaimer}</p>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Floating Toggle Button */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 rounded-full border px-4 py-3 text-sm font-semibold shadow-xl transition-all ${
          open
            ? 'border-blue-400/30 bg-blue-500 text-white hover:bg-blue-400'
            : 'border-white/10 bg-zinc-900/95 text-white hover:bg-zinc-800 backdrop-blur-md'
        }`}
        title="Workload Advisor — Get GPU recommendations"
      >
        <GpuIcon />
        {open ? 'Close Advisor' : 'Workload Advisor'}
        {!open && <span className="text-xs text-zinc-400">→ find your GPU</span>}
      </button>

    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RecommendationCard({
  rec, label, primary, onLaunch,
}: {
  rec: GpuRecommendation
  label: string
  primary: boolean
  onLaunch: (rec: GpuRecommendation) => void
}) {
  return (
    <div className={`rounded-xl border p-3 flex flex-col gap-2 ${
      primary
        ? 'border-blue-400/30 bg-blue-500/10'
        : 'border-white/10 bg-white/5'
    }`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-zinc-400">{label}</p>
          <p className="text-sm font-semibold text-white">
            {rec.gpu_count > 1 ? `${rec.gpu_count}× ` : ''}{rec.gpu_type}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-white">${rec.estimated_cost_usd}</p>
          <p className="text-xs text-zinc-400">{rec.estimated_duration_hours}h</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="VRAM" value={`${rec.vram_required_gb}GB`} />
        <Stat label="Confidence" value={rec.confidence} className={CONFIDENCE_COLORS[rec.confidence]} />
        <Stat label="Available" value={rec.available_now ? 'Now' : 'Check'} className={rec.available_now ? 'text-green-400' : 'text-yellow-400'} />
      </div>

      <p className="text-xs text-zinc-400 leading-relaxed">{rec.reasoning}</p>

      {primary && (
        <button
          onClick={() => onLaunch(rec)}
          disabled={!rec.available_now}
          className="w-full rounded-lg bg-blue-500 py-2 text-xs font-semibold text-white hover:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {rec.available_now ? 'Launch This Job →' : 'Join Waitlist for This GPU'}
        </button>
      )}
    </div>
  )
}

function Stat({ label, value, className = 'text-white' }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-lg bg-white/5 px-2 py-1.5">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`text-xs font-semibold ${className}`}>{value}</p>
    </div>
  )
}

function GpuIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2"/>
      <path d="M6 6V4M10 6V4M14 6V4M18 6V4"/>
      <path d="M6 18v2M10 18v2M14 18v2M18 18v2"/>
      <rect x="6" y="9" width="4" height="6" rx="1"/>
      <rect x="14" y="9" width="4" height="6" rx="1"/>
    </svg>
  )
}
