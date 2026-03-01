import { HelpArticle, Section, Step, CalloutBox, FactRow } from '@/components/ui/help-article'
import { Term } from '@/components/ui/info-tooltip'
import Link from 'next/link'

/**
 * /help/memory-pooling — VRAM staking and yield guide
 */

const TOC = [
  { id: 'what-is-pooling',  label: 'What is memory pooling?' },
  { id: 'how-yield-works',  label: 'How yield works' },
  { id: 'tiers',            label: 'University vs Commercial' },
  { id: 'risks',            label: 'Risks to understand' },
  { id: 'how-to-stake',     label: 'How to stake' },
  { id: 'unstaking',        label: 'Unstaking' },
  { id: 'mnemo-chamber',    label: 'The Mnemo chamber' },
]

const RELATED = [
  { href: '/help/safety',    icon: '🔒', title: 'Safety & Trust',    description: 'Slash conditions and your stake protections' },
  { href: '/help/providers', icon: '🏗️', title: 'Becoming a Provider', description: 'How providers earn from compute jobs' },
  { href: '/help/glossary',  icon: '📖', title: 'Glossary',           description: 'Stake, yield, slash, and Mnemo defined' },
]

export default function MemoryPoolingPage() {
  return (
    <HelpArticle
      title="Memory Pooling"
      description="Earn passive yield by staking idle VRAM and RAM into the GP4U memory pool."
      icon="💾"
      readingTime="5 min"
      tourId="memory-pooling"
      toc={TOC}
      related={RELATED}
    >

      <CalloutBox type="warning" title="Read this before staking">
        Memory pooling puts something at risk. Read the Risks section before committing any stake. This is designed for providers with stable, reliable hardware — not for casual participation.
      </CalloutBox>

      <Section id="what-is-pooling" title="What is memory pooling?">
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          Many GPU jobs don't use 100% of a card's <Term id="VRAM" /> at all times. Memory pooling lets providers offer that idle capacity to other jobs — and earn <Term id="Yield" /> while it's in use.
        </p>
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          When you stake VRAM into the pool:
        </p>
        <ul className="space-y-2 mb-4">
          {[
            'The Mnemo chamber registers your available capacity',
            'Incoming jobs that need extra memory are routed toward your hardware',
            'You earn a per-GB-per-second yield while your memory is actively used',
            'When demand drops, your memory sits idle — no income, but no cost either',
          ].map(item => (
            <li key={item} className="flex items-start gap-2 text-sm text-slate-600">
              <span className="text-blue-500 flex-shrink-0 mt-0.5">→</span>
              {item}
            </li>
          ))}
        </ul>
        <p className="text-sm text-slate-600 leading-relaxed">
          RAM pooling works identically — the same mechanism, applied to system RAM instead of GPU VRAM.
        </p>
      </Section>

      <Section id="how-yield-works" title="How yield is calculated">
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          Yield is not a fixed rate. It's dynamic — driven by platform demand.
        </p>
        <div className="rounded-xl border border-slate-200 overflow-hidden mb-4">
          <FactRow label="Base rate" value="$0.0008 / GB / hour" sub="When demand is at equilibrium" />
          <FactRow label="Demand multiplier" value="1.0× – 4.0×" sub="Rises when VRAM requests outpace supply" />
          <FactRow label="Update frequency" value="Every 10 minutes" sub="Shown live on the Memory page" />
          <FactRow label="Settlement" value="After each job using your memory" sub="Credited to your balance immediately" />
        </div>
        <CalloutBox type="tip" title="When yields are highest">
          Peak AI training periods (typically weekday daytime in North America) drive demand spikes. University exam seasons (model evaluation runs) are another common peak.
        </CalloutBox>
        <p className="text-sm text-slate-600 leading-relaxed">
          You can see the current yield rate and 7-day trend on the <Link href="/memory" className="text-blue-600 underline">Memory page</Link>. Hover over "Yield Rate" to see the formula with live numbers.
        </p>
      </Section>

      <Section id="tiers" title="University vs Commercial staking">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm font-bold text-blue-900 mb-2">🎓 University tier</p>
            <ul className="space-y-1.5 text-xs text-blue-800">
              <li>✓ No cash stake required</li>
              <li>✓ Reputational stake only</li>
              <li>✓ Slashes are public record</li>
              <li>✓ .edu email and institution MOU required</li>
              <li>✓ Revenue shared with student programs</li>
            </ul>
          </div>
          <div className="rounded-xl border border-green-200 bg-green-50 p-4">
            <p className="text-sm font-bold text-green-900 mb-2">🏢 Commercial tier</p>
            <ul className="space-y-1.5 text-xs text-green-800">
              <li>✓ $25–$50 per GPU in cash escrow</li>
              <li>✓ Immediate start after verification</li>
              <li>✓ Higher earnings per GPU-hour</li>
              <li>✓ Stake released on clean exit</li>
              <li>⚠ Hard slash = stake forfeited + ejection</li>
            </ul>
          </div>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">
          Both tiers earn the same yield rate. The difference is what's at risk if something goes wrong.
        </p>
      </Section>

      <Section id="risks" title="Risks to understand before staking">
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          Memory pooling is not risk-free. These are the main ways you can lose stake or earn a slash:
        </p>
        <div className="space-y-3 mb-4">
          {[
            {
              risk:  'Hardware goes offline',
              desc:  'If your GPU goes offline while VRAM is staked, any job using that memory fails. This can trigger a WARNING or SOFT SLASH depending on frequency and severity.',
              level: 'WARNING / SOFT',
              color: 'border-yellow-200 bg-yellow-50',
            },
            {
              risk:  'Failure to serve a memory request',
              desc:  "If the Mnemo chamber routes a job to your hardware and you can't serve it, this counts as a failed commitment. Repeated failures escalate.",
              level: 'SOFT SLASH',
              color: 'border-orange-200 bg-orange-50',
            },
            {
              risk:  'Blocking the monitoring agent',
              desc:  "If you disable or block the telemetry agent while memory is staked, this is a hard slash — immediate ejection and full stake loss.",
              level: 'HARD SLASH',
              color: 'border-red-200 bg-red-50',
            },
          ].map(r => (
            <div key={r.risk} className={`rounded-xl border ${r.color} p-4`}>
              <div className="flex items-start justify-between mb-1">
                <p className="text-sm font-semibold text-slate-800">{r.risk}</p>
                <span className="text-[10px] font-bold text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded-full">{r.level}</span>
              </div>
              <p className="text-xs text-slate-600">{r.desc}</p>
            </div>
          ))}
        </div>
        <CalloutBox type="info">
          Only stake what you can reliably serve. If your hardware has planned maintenance or is on an unreliable power supply, unstake first.
        </CalloutBox>
      </Section>

      <Section id="how-to-stake" title="How to stake VRAM">
        <Step number={1} title="Go to the Memory page">
          Click <strong>Memory</strong> in the sidebar, or visit <Link href="/memory" className="text-blue-600 underline">/memory</Link>.
        </Step>
        <Step number={2} title="Select your GPU">
          Choose the GPU you want to stake from the list of your connected hardware. Only GPUs with a verified provider node appear here.
        </Step>
        <Step number={3} title="Enter the GB amount">
          Enter how many gigabytes of VRAM you want to stake. You can stake a portion of your VRAM — you don't have to stake all of it.
        </Step>
        <Step number={4} title="Review the risk summary">
          The form shows your stake amount, current yield rate, and the slash conditions that apply. Read these before confirming.
        </Step>
        <Step number={5} title="Confirm">
          Click Confirm. The Mnemo chamber registers your stake immediately and begins routing eligible jobs to you.
        </Step>
      </Section>

      <Section id="unstaking" title="Unstaking">
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          You can unstake at any time — but there is a <strong>release window</strong>:
        </p>
        <div className="rounded-xl border border-slate-200 overflow-hidden mb-4">
          <FactRow label="No jobs using your memory" value="Instant unstake" sub="Memory returns to your control immediately" />
          <FactRow label="Jobs actively using your memory" value="Queued until job completes" sub="Typically within minutes to hours" />
          <FactRow label="Emergency override" value="Available — triggers a WARNING" sub="Use only if hardware failure is imminent" />
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">
          To unstake: Memory page → your active stake → "Unstake". If you need to unstake urgently, use the Emergency Unstake option and accept the warning log entry.
        </p>
      </Section>

      <Section id="mnemo-chamber" title="The Mnemo chamber">
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          <Term id="Mnemo" /> is the GP4U chamber that manages all memory staking. When active, it:
        </p>
        <ul className="space-y-2 mb-4">
          {[
            'Tracks all staked VRAM and RAM across the network',
            'Routes memory-hungry jobs toward staked capacity',
            'Monitors memory demand signals in real time',
            'Adjusts yield rates based on supply/demand balance',
            'Triggers slash evaluations when staked capacity fails',
          ].map(item => (
            <li key={item} className="flex items-start gap-2 text-sm text-slate-600">
              <span className="text-purple-500 flex-shrink-0 mt-0.5">◆</span>
              {item}
            </li>
          ))}
        </ul>
        <p className="text-sm text-slate-600 leading-relaxed">
          You can see Mnemo's current mode (OFFLINE / PASSIVE / BACKTEST / ACTIVE) on the <Link href="/admin" className="text-blue-600 underline">Admin page</Link>. Memory pooling only generates yield when Mnemo is in ACTIVE mode.
        </p>
      </Section>

    </HelpArticle>
  )
}
