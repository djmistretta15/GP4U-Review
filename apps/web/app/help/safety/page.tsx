import { HelpArticle, Section, Step, CalloutBox, FactRow } from '@/components/ui/help-article'
import { Term } from '@/components/ui/info-tooltip'
import Link from 'next/link'

/**
 * /help/safety — trust and safety guide
 */

const TOC = [
  { id: 'escrow',       label: 'Escrow protection' },
  { id: 'providers',    label: 'Provider accountability' },
  { id: 'zk-proof',     label: 'ZK proofs' },
  { id: 'obsidian',     label: 'Obsidian ledger' },
  { id: 'slash',        label: 'Slashing system' },
  { id: 'disputes',     label: 'Dispute resolution' },
  { id: 'data-safety',  label: 'Your code & data' },
]

const RELATED = [
  { href: '/help/providers',        icon: '🏗️', title: 'Provider guide',     description: 'How providers are screened and monitored' },
  { href: '/help/getting-started',  icon: '🚀', title: 'Getting started',     description: 'Set up your account and run a job' },
  { href: '/help/memory-pooling',   icon: '💾', title: 'Memory pooling risks', description: 'Slash conditions for staked memory' },
]

export default function SafetyPage() {
  return (
    <HelpArticle
      title="Safety & Trust"
      description="How your money, data, and jobs are protected at every step."
      icon="🔒"
      readingTime="6 min"
      tourId="safety"
      toc={TOC}
      related={RELATED}
    >

      <CalloutBox type="success" title="The short version">
        Your credits sit in escrow until your job succeeds. Providers post real stakes that they lose if they misbehave. Every action is sealed in a tamper-proof ledger. You can verify everything independently.
      </CalloutBox>

      <Section id="escrow" title="Escrow protection for every job">
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          When you book a GPU, your credits don't go to the provider yet. They move into <Term id="Escrow" /> — a locked holding state. The provider only receives payment after:
        </p>
        <ul className="space-y-2 mb-4">
          {[
            'Your job runs to completion',
            'The provider agent submits a valid ZK proof of hardware usage',
            'The Tutela anomaly detector raises no critical flags',
            'The job status is confirmed as COMPLETE on the Obsidian ledger',
          ].map(item => (
            <li key={item} className="flex items-start gap-2 text-sm text-slate-600">
              <span className="text-green-500 flex-shrink-0 mt-0.5">✓</span>
              {item}
            </li>
          ))}
        </ul>
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          If a job fails for any reason on the provider's side, your credits return to your balance within 30 seconds — automatically, no claim needed.
        </p>
        <CalloutBox type="warning" title="What escrow does NOT protect">
          If you cancel a job mid-run voluntarily, you are billed for the time that ran. Escrow only protects against provider failure, not customer cancellations.
        </CalloutBox>
      </Section>

      <Section id="providers" title="Provider accountability">
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          Providers can't just say they have hardware — they have to prove it and put something at stake.
        </p>
        <div className="rounded-xl border border-slate-200 overflow-hidden mb-4">
          <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
            <p className="text-xs font-semibold text-slate-600">Provider tiers and stakes</p>
          </div>
          <FactRow label="University tier" value="Reputational stake" sub=".edu institution — slash events are public record" />
          <FactRow label="Commercial tier" value="$25–$50 per GPU" sub="Cash held in escrow — forfeited on hard slash" />
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">
          Providers must also install the monitoring agent, consent to hardware visibility, and pass an initial hardware verification before they enter the routing pool. The <Term id="VeritasTier" /> badge (Gold/Silver/Bronze) reflects their track record.
        </p>
      </Section>

      <Section id="zk-proof" title="ZK proofs — independent verification">
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          After every job, the provider's agent generates a <Term id="ZKProof" />. This is a cryptographic certificate that proves:
        </p>
        <ul className="space-y-1.5 mb-4">
          {[
            ['Hardware attestation', 'Exact GPU model and VRAM used'],
            ['Energy attestation',   'Kilowatt-hours consumed and renewable percentage'],
            ['Uptime attestation',   'Availability percentage and job completion rate'],
          ].map(([title, desc]) => (
            <li key={title} className="flex items-start gap-2 text-sm">
              <span className="text-blue-500 flex-shrink-0 mt-0.5">⬡</span>
              <span><strong className="text-slate-800">{title}:</strong> <span className="text-slate-600">{desc}</span></span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          The proof is generated using the RISC Zero zkVM. You can verify the proof yourself using the GP4U CLI or by downloading the proof file from your job detail page — GP4U's honesty is not required.
        </p>
        <CalloutBox type="tip" title="Where to find your proof">
          Dashboard → click any completed job → "View ZK Proof" → Download proof file.
        </CalloutBox>
      </Section>

      <Section id="obsidian" title="The Obsidian ledger — permanent audit trail">
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          Every significant event on the platform is recorded in the <Term id="ObsidianLedger" /> — an append-only, hash-chained ledger. Recorded events include:
        </p>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {[
            'Job start / complete / fail',
            'Credit addition / deduction',
            'Slash events',
            'Appeal filings and outcomes',
            'Provider registration',
            'ZK proof submissions',
            'Chamber mode changes',
            'Admin actions',
          ].map(item => (
            <div key={item} className="flex items-center gap-2 text-xs text-slate-600 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
              <span className="text-slate-400">▪</span>
              {item}
            </div>
          ))}
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">
          Each entry has a <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">block_hash</code> derived from the previous block's hash — a chain. Tampering with any past entry changes its hash and breaks all subsequent hashes, making tampering immediately detectable. Every 100 blocks, a <Term id="MerkleRoot" /> is sealed.
        </p>
      </Section>

      <Section id="slash" title="The slashing system">
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          When a provider violates the platform rules, a slash is triggered. There are 3 severity levels:
        </p>
        <div className="space-y-3 mb-4">
          {[
            {
              level: 'WARNING',
              color: 'border-yellow-200 bg-yellow-50',
              badge: 'bg-yellow-100 text-yellow-700',
              desc:  'Logged on the Obsidian ledger. No stake deducted. Three warnings in 90 days escalate to a soft slash automatically.',
              examples: ['Borderline VRAM usage', 'Brief connection drop (<30s)', 'Minor telemetry gap'],
            },
            {
              level: 'SOFT SLASH',
              color: 'border-orange-200 bg-orange-50',
              badge: 'bg-orange-100 text-orange-700',
              desc:  'A percentage of the provider\'s stake is deducted (5–25%). 7-day appeal window. Provider remains active.',
              examples: ['VRAM overclaiming (minor)', 'Job abandonment once', 'Delayed proof submission'],
            },
            {
              level: 'HARD SLASH',
              color: 'border-red-200 bg-red-50',
              badge: 'bg-red-100 text-red-700',
              desc:  'Full stake forfeiture and immediate ejection from the network. 14-day appeal window.',
              examples: ['Blocking monitoring agent', 'Crypto mining during job', 'Hardware fraud (fake specs)'],
            },
          ].map(s => (
            <div key={s.level} className={`rounded-xl border ${s.color} p-4`}>
              <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full mb-2 ${s.badge}`}>
                {s.level}
              </span>
              <p className="text-sm text-slate-700 mb-2">{s.desc}</p>
              <p className="text-xs text-slate-500">
                <strong>Examples:</strong> {s.examples.join(', ')}
              </p>
            </div>
          ))}
        </div>
        <p className="text-sm text-slate-600">
          All slash events are permanent on the Obsidian ledger. Accepted appeals add a reversal entry — the original slash stays visible. See the full list of all 13 slash conditions in the <Link href="/help/providers#slash-conditions" className="text-blue-600 underline">Provider guide</Link>.
        </p>
      </Section>

      <Section id="disputes" title="Dispute resolution">
        <Step number={1} title="File a dispute within 30 days">
          Go to Dashboard → your job → "File Dispute". Describe what went wrong and attach evidence (logs, screenshots, output files).
        </Step>
        <Step number={2} title="Evidence is gathered automatically">
          The platform attaches the Obsidian ledger entries, ZK proof, and telemetry data for the job automatically — you don't need to find this yourself.
        </Step>
        <Step number={3} title="Review and decision">
          A resolution is issued within 5 business days. If the provider is at fault, a slash is applied and any owed credits are returned. If the dispute is not upheld, you receive a clear explanation.
        </Step>
        <Step number={4} title="All outcomes are permanent">
          The dispute filing, evidence summary, and outcome are sealed in the Obsidian ledger. Nothing is deleted.
        </Step>
        <CalloutBox type="info">
          If you disagree with the outcome, you can escalate once to the GP4U review panel. Their decision is final and is also sealed in the ledger.
        </CalloutBox>
      </Section>

      <Section id="data-safety" title="Your code and data">
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          Your scripts and data run in an isolated Docker container on the provider's hardware. Protections:
        </p>
        <ul className="space-y-2 mb-4">
          {[
            'The provider cannot access your container filesystem or output',
            'By default, containers have no internet access — you opt in if needed',
            'The monitoring agent only reads hardware telemetry (GPU %, VRAM, power) — not file contents',
            'GP4U never stores your job scripts or output data',
            'Job data is deleted from provider hardware after job completion is confirmed',
          ].map(item => (
            <li key={item} className="flex items-start gap-2 text-sm text-slate-600">
              <span className="text-green-500 flex-shrink-0 mt-0.5">✓</span>
              {item}
            </li>
          ))}
        </ul>
        <CalloutBox type="warning" title="For highly sensitive workloads">
          If you're training on proprietary datasets or running confidential code, use <strong>Veritas Gold</strong> providers only and enable the <strong>ZK verification</strong> option on your job. This adds cryptographic proof that your data was not exfiltrated.
        </CalloutBox>
      </Section>

    </HelpArticle>
  )
}
