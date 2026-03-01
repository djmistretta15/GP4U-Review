import { HelpArticle, Section, Step, CalloutBox, FactRow } from '@/components/ui/help-article'
import { Term } from '@/components/ui/info-tooltip'
import Link from 'next/link'

/**
 * /help/providers — provider guide
 */

const TOC = [
  { id: 'who-can-join',       label: 'Who can join?' },
  { id: 'tiers',              label: 'Tier comparison' },
  { id: 'requirements',       label: 'Hardware requirements' },
  { id: 'install',            label: 'Install the agent' },
  { id: 'visibility',         label: 'Hardware visibility' },
  { id: 'slash-conditions',   label: 'All 13 slash conditions' },
  { id: 'earnings',           label: 'Earnings & payments' },
]

const RELATED = [
  { href: '/help/safety',        icon: '🔒', title: 'Safety & Trust',    description: 'The Obsidian ledger and how slashes are recorded' },
  { href: '/help/memory-pooling', icon: '💾', title: 'Memory Pooling',   description: 'Earn extra yield by staking idle VRAM' },
  { href: '/help/billing',        icon: '💳', title: 'Billing & Payments', description: 'How provider earnings are settled' },
]

const SLASH_CONDITIONS = [
  // Warnings
  { code: 'W-01', label: 'Borderline VRAM usage', severity: 'WARNING', stake: '—',    ejection: false, appeal: '—',   desc: 'GPU VRAM usage is within 5% of declared max. Logged as a signal, no penalty.' },
  { code: 'W-02', label: 'Brief connection drop',  severity: 'WARNING', stake: '—',   ejection: false, appeal: '—',   desc: 'Agent connection dropped for < 30 seconds and recovered. Logged.' },
  { code: 'W-03', label: 'Minor telemetry gap',    severity: 'WARNING', stake: '—',   ejection: false, appeal: '—',   desc: 'Telemetry missing for < 60 seconds. Three in 90 days = automatic soft slash.' },
  // Soft slashes
  { code: 'S-01', label: 'VRAM overclaiming (minor)', severity: 'SOFT', stake: '10%', ejection: false, appeal: '7d',  desc: 'Running 5–15% more VRAM than declared. First offence = warning; second = soft slash.' },
  { code: 'S-02', label: 'Job abandonment',         severity: 'SOFT',  stake: '15%', ejection: false, appeal: '7d',  desc: 'Dropping a running job without a hardware failure event. Customer receives auto-refund.' },
  { code: 'S-03', label: 'Delayed proof submission', severity: 'SOFT', stake: '5%',  ejection: false, appeal: '7d',  desc: 'ZK proof not submitted within 10 minutes of job completion.' },
  { code: 'S-04', label: 'Repeated telemetry gaps',  severity: 'SOFT', stake: '10%', ejection: false, appeal: '7d',  desc: 'Three W-03 warnings accumulate within 90 days.' },
  { code: 'S-05', label: 'Unauthorised workload type', severity: 'SOFT', stake: '20%', ejection: false, appeal: '7d', desc: 'Running a workload type not listed in the provider\'s allowed_workload_types field.' },
  // Hard slashes
  { code: 'H-01', label: 'Blocking monitoring agent', severity: 'HARD', stake: '100%', ejection: true, appeal: '14d', desc: 'Disabling, killing, or interfering with the Tutela monitoring process during a job.' },
  { code: 'H-02', label: 'Crypto mining during job',  severity: 'HARD', stake: '100%', ejection: true, appeal: '14d', desc: 'Tutela detects cryptocurrency mining signatures on GPU or CPU during a customer job.' },
  { code: 'H-03', label: 'Hardware fraud',             severity: 'HARD', stake: '100%', ejection: true, appeal: '14d', desc: 'Declaring a different GPU model or VRAM size than what is actually present.' },
  { code: 'H-04', label: 'VRAM overclaiming (severe)', severity: 'HARD', stake: '100%', ejection: true, appeal: '14d', desc: 'Running > 15% more VRAM than declared. Indicates intentional fraud.' },
  { code: 'H-05', label: 'Data exfiltration attempt',  severity: 'HARD', stake: '100%', ejection: true, appeal: '14d', desc: 'Anomalous outbound network activity consistent with reading job output data.' },
]

export default function ProvidersPage() {
  return (
    <HelpArticle
      title="Becoming a Provider"
      description="Connect your GPU hardware, earn compute revenue, and keep your stake safe."
      icon="🏗️"
      readingTime="7 min"
      tourId="providers"
      toc={TOC}
      related={RELATED}
    >

      <Section id="who-can-join" title="Who can join as a provider?">
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          Anyone with qualifying NVIDIA GPU hardware and a reliable internet connection. There are two paths:
        </p>
        <ul className="space-y-2 mb-4">
          {[
            ['University / Academic', 'A .edu email address, institution name, and a signed MOU. No cash stake. Ideal for university labs, research clusters, student GPU pools.'],
            ['Commercial', 'Any operator — data centre, colo, home lab, cloud re-seller. Cash stake required per GPU. No special credentials needed beyond hardware verification.'],
          ].map(([title, desc]) => (
            <li key={title} className="flex items-start gap-2 text-sm text-slate-600">
              <span className="text-blue-500 flex-shrink-0 mt-0.5">→</span>
              <span><strong className="text-slate-800">{title}:</strong> {desc}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-slate-600 leading-relaxed">
          Register at <Link href="/providers/register" className="text-blue-600 underline">/providers/register</Link>. The tier choice is made on the first screen.
        </p>
      </Section>

      <Section id="tiers" title="Tier comparison">
        <div className="rounded-xl border border-slate-200 overflow-hidden mb-4">
          <div className="grid grid-cols-3 bg-slate-50 border-b border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600">
            <span>Feature</span>
            <span className="text-center">🎓 University</span>
            <span className="text-center">🏢 Commercial</span>
          </div>
          {[
            ['Cash stake required',         'None',              '$25–$50/GPU'],
            ['Stake type',                  'Reputational',      'Cash escrow'],
            ['Sign-up requirement',         '.edu email + MOU',  'Hardware verification'],
            ['Hard slash consequence',      'Public record',     'Stake forfeited + ejection'],
            ['Revenue share',               '+ student program', 'Standard'],
            ['Earnings per GPU-hour',       'Standard rate',     'Higher rate'],
            ['Start date',                  'After MOU signed',  'After verification'],
          ].map(([feat, uni, com]) => (
            <div key={feat} className="grid grid-cols-3 px-4 py-2.5 border-b border-slate-100 last:border-0 text-xs text-slate-700">
              <span className="text-slate-500">{feat}</span>
              <span className="text-center">{uni}</span>
              <span className="text-center">{com}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section id="requirements" title="Hardware requirements">
        <div className="rounded-xl border border-slate-200 overflow-hidden mb-4">
          <FactRow label="GPU" value="NVIDIA CUDA-capable" sub="Any RTX, A-series, H-series, or datacenter-class NVIDIA GPU" />
          <FactRow label="VRAM minimum" value="8 GB" sub="16 GB+ recommended for most commercial workloads" />
          <FactRow label="Internet" value="100 Mbps up/down minimum" sub="1 Gbps+ recommended for large model transfers" />
          <FactRow label="Uptime" value="90%+ required" sub="Below 80% triggers progressive warnings" />
          <FactRow label="Operating system" value="Linux (Ubuntu 20.04+)" sub="The agent also runs on Debian and RHEL-based distros" />
          <FactRow label="Docker" value="Required" sub="The agent runs as a container — Docker 20+ needed" />
        </div>
        <CalloutBox type="tip">
          Multi-GPU machines are supported. Each GPU registers as a separate node and earns independently.
        </CalloutBox>
      </Section>

      <Section id="install" title="Install the agent">
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          After completing registration, you'll be shown the exact install command on the <Link href="/providers/onboarding" className="text-blue-600 underline">onboarding page</Link>. It looks like:
        </p>
        <div className="rounded-xl bg-slate-900 p-4 mb-4 font-mono text-xs text-green-400 overflow-x-auto">
          <p className="text-slate-500 mb-1"># One command — runs as a read-only Docker container</p>
          <p>docker run -d --gpus all --name gp4u-agent \</p>
          <p>&nbsp;&nbsp;-e GP4U_NODE_TOKEN={"<your-token>"} \</p>
          <p>&nbsp;&nbsp;-e GP4U_NODE_ID={"<your-node-id>"} \</p>
          <p>&nbsp;&nbsp;--read-only \</p>
          <p>&nbsp;&nbsp;ghcr.io/gp4u/agent:latest</p>
        </div>
        <Step number={1} title="Run the install command">
          Copy and run the command from your onboarding page. Your node token is embedded automatically — do not share it.
        </Step>
        <Step number={2} title="Wait for connection (≈ 30 seconds)">
          The agent connects to GP4U, submits an initial hardware report, and appears as CONNECTING in your onboarding wizard.
        </Step>
        <Step number={3} title="Hardware verification">
          The platform reads your GPU specs via NVML and asks you to confirm: model, VRAM, and region. The specs you confirm become your declared hardware — overclaiming beyond this is a hard slash.
        </Step>
        <Step number={4} title="You're live">
          Once verified, your GPU enters the routing pool and begins receiving jobs.
        </Step>
        <CalloutBox type="info" title="What the agent does">
          The agent monitors GPU utilisation, VRAM usage, power draw, temperature, and network activity during jobs. It submits telemetry every 10 seconds and generates ZK proofs after job completion. It does not access job data or your filesystem.
        </CalloutBox>
      </Section>

      <Section id="visibility" title="Hardware visibility — what it means">
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          Joining as a provider requires granting the platform visibility into your hardware during jobs. This means:
        </p>
        <div className="space-y-2 mb-4">
          {[
            { label: 'What IS monitored',    items: ['GPU utilisation %', 'VRAM usage (GB)', 'Power draw (watts)', 'Temperature (°C)', 'Running process names', 'Outbound network byte counts', 'CUDA kernel signatures'] },
            { label: 'What is NOT monitored', items: ['File contents on your system', 'Job code or data', 'Memory contents', 'Non-GPU-related processes', 'Keyboard/mouse', 'Persistent system access after jobs end'] },
          ].map(group => (
            <div key={group.label} className="rounded-xl border border-slate-200 p-4">
              <p className="text-xs font-semibold text-slate-700 mb-2">{group.label}</p>
              <ul className="space-y-1">
                {group.items.map(item => (
                  <li key={item} className="flex items-center gap-2 text-xs text-slate-600">
                    <span className={group.label.startsWith('What IS') ? 'text-green-500' : 'text-slate-400'}>
                      {group.label.startsWith('What IS') ? '✓' : '✗'}
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">
          You explicitly consent to this by typing <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">I CONSENT</code> during registration. This is not a checkbox — it's a deliberate acknowledgement.
        </p>
      </Section>

      <Section id="slash-conditions" title="All 13 slash conditions">
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          These are every condition that can trigger a slash. Read them all before going live.
        </p>
        <div className="rounded-xl border border-slate-200 overflow-hidden mb-4">
          <div className="grid grid-cols-12 bg-slate-50 border-b border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600">
            <span className="col-span-1">Code</span>
            <span className="col-span-4">Condition</span>
            <span className="col-span-2">Severity</span>
            <span className="col-span-2">Stake lost</span>
            <span className="col-span-1">Ejected</span>
            <span className="col-span-2">Appeal</span>
          </div>
          {SLASH_CONDITIONS.map(s => (
            <div key={s.code} className="grid grid-cols-12 px-4 py-3 border-b border-slate-100 last:border-0 text-xs text-slate-700 hover:bg-slate-50 group">
              <span className="col-span-1 font-mono text-slate-400">{s.code}</span>
              <div className="col-span-4">
                <p className="font-medium text-slate-800">{s.label}</p>
                <p className="text-slate-500 mt-0.5 leading-relaxed hidden group-hover:block">{s.desc}</p>
              </div>
              <span className="col-span-2">
                <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  s.severity === 'WARNING' ? 'bg-yellow-100 text-yellow-700' :
                  s.severity === 'SOFT'    ? 'bg-orange-100 text-orange-700' :
                                             'bg-red-100 text-red-700'
                }`}>
                  {s.severity}
                </span>
              </span>
              <span className="col-span-2 font-medium">{s.stake}</span>
              <span className="col-span-1">{s.ejection ? '⛔ Yes' : '—'}</span>
              <span className="col-span-2">{s.appeal}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500">Hover over a row to see the full description. All slash events are permanent on the Obsidian ledger; accepted appeals add a reversal entry.</p>
      </Section>

      <Section id="earnings" title="Earnings & payments">
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          Providers earn per GPU-hour for every job that completes on their hardware. Earnings are influenced by:
        </p>
        <div className="rounded-xl border border-slate-200 overflow-hidden mb-4">
          <FactRow label="Base rate" value="GPU type × market price" sub="Tracked live on the Arbitrage page" />
          <FactRow label="Veritas bonus" value="+5–15%" sub="Gold tier earns a premium over Bronze" />
          <FactRow label="Platform fee" value="−15%" sub="GP4U takes 15% of gross job revenue" />
          <FactRow label="Settlement" value="After each job" sub="Credited to your Billing → Provider Earnings" />
          <FactRow label="Payout" value="Via Stripe Connect" sub="Set up in Settings → Provider → Payout" />
        </div>
        <CalloutBox type="tip" title="Earnings estimate">
          Your onboarding wizard shows a conservative / expected / optimistic monthly range based on your hardware and current demand. See /providers/onboarding after registration.
        </CalloutBox>
      </Section>

    </HelpArticle>
  )
}
