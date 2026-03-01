import { HelpArticle, Section, Step, CalloutBox, FactRow } from '@/components/ui/help-article'
import { Term } from '@/components/ui/info-tooltip'
import Link from 'next/link'

/**
 * /help/marketplace — marketplace and GPU guide
 */

const TOC = [
  { id: 'how-pricing-works',  label: 'How pricing works' },
  { id: 'arbitrage-tool',     label: 'The Arbitrage tool' },
  { id: 'choosing-gpu',       label: 'Choosing a GPU' },
  { id: 'workload-advisor',   label: 'Workload Advisor' },
  { id: 'booking',            label: 'Booking a GPU' },
  { id: 'veritas-tiers',      label: 'Veritas reliability tiers' },
]

const RELATED = [
  { href: '/help/getting-started', icon: '🚀', title: 'Getting started',       description: 'Set up your account and credits first' },
  { href: '/help/safety',          icon: '🔒', title: 'Safety & Trust',         description: 'How bookings and payments are protected' },
  { href: '/help/providers',       icon: '🏗️', title: 'Becoming a provider',   description: 'Connect your hardware to the marketplace' },
]

const GPU_GUIDE = [
  {
    gpu:   'H100 80GB',
    best:  'Largest LLMs (70B+), multi-GPU distributed training',
    vram:  '80 GB',
    tflops: '~200',
    price: '$3.50–$6/hr',
  },
  {
    gpu:   'A100 80GB',
    best:  'Most training jobs, fine-tuning LLMs up to 70B',
    vram:  '80 GB',
    tflops: '~77',
    price: '$2.50–$4/hr',
  },
  {
    gpu:   'A100 40GB',
    best:  'Models up to 13B, efficient for most fine-tuning',
    vram:  '40 GB',
    tflops: '~77',
    price: '$1.80–$3/hr',
  },
  {
    gpu:   'RTX 4090 24GB',
    best:  'Budget inference, small-model fine-tuning, research',
    vram:  '24 GB',
    tflops: '~82',
    price: '$0.60–$1.20/hr',
  },
  {
    gpu:   'RTX 3090 24GB',
    best:  'Budget training, student projects, development',
    vram:  '24 GB',
    tflops: '~35',
    price: '$0.40–$0.80/hr',
  },
]

export default function MarketplacePage() {
  return (
    <HelpArticle
      title="Marketplace & GPUs"
      description="Find the best GPU for your workload — and pay the best price for it."
      icon="🛒"
      readingTime="5 min"
      tourId="marketplace"
      toc={TOC}
      related={RELATED}
    >

      <Section id="how-pricing-works" title="How pricing works">
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          GPU compute is priced in <strong>USD per GPU-hour</strong>. You are billed for actual time used — if your job finishes in 4.7 hours when you booked 6, you pay for 4.7 hours.
        </p>
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          Prices come from two sources:
        </p>
        <div className="space-y-3 mb-4">
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-800 mb-1">Cloud providers (arbitrage)</p>
            <p className="text-sm text-slate-600">AWS, Google Cloud, Azure, RunPod, Lambda Labs, CoreWeave, Vast.ai. Prices are fetched every minute via the arbitrage engine. You get the live market price.</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-800 mb-1">GP4U-native nodes</p>
            <p className="text-sm text-slate-600">University and commercial providers on the GP4U network. Often 20–40% cheaper than cloud providers for the same hardware because of lower overheads.</p>
          </div>
        </div>
        <CalloutBox type="tip">
          GP4U adds a 5% platform fee on top of the provider's price. This is shown on every quote — it is never hidden.
        </CalloutBox>
      </Section>

      <Section id="arbitrage-tool" title="The Arbitrage tool">
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          The <Link href="/arbitrage" className="text-blue-600 underline">Arbitrage page</Link> is your live price comparison dashboard. It shows every available GPU with its current price, region, <Term id="VRAM" />, and <Term id="VeritasTier" />.
        </p>
        <Step number={1} title="Filter by VRAM">
          Set a minimum VRAM requirement for your model. The table hides everything that can't fit your workload.
        </Step>
        <Step number={2} title="Filter by Veritas tier (optional)">
          If reliability matters (long training runs, customer-facing inference), filter to Veritas Gold only (99.5%+ uptime). For quick experiments, any tier is fine.
        </Step>
        <Step number={3} title="Sort by price">
          Sort ascending by price to see the cheapest matching GPU at the top. The spread between the cheapest and most expensive option for the same GPU type often exceeds 40%.
        </Step>
        <Step number={4} title="Click to book">
          Click a row to see the full provider card — specs, location, trust score, recent ZK proofs. Click Book to proceed to the job setup form.
        </Step>
        <CalloutBox type="info" title="Arbitrage snapshots">
          Prices are captured as <Term id="Arbitrage" /> snapshots every minute and stored permanently. You can see historical price trends for any GPU type.
        </CalloutBox>
      </Section>

      <Section id="choosing-gpu" title="Choosing the right GPU">
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          The GPU you need depends on <Term id="WorkloadType" /> and model size. Use this table as a starting point:
        </p>
        <div className="rounded-xl border border-slate-200 overflow-hidden mb-4">
          <div className="grid grid-cols-5 bg-slate-50 border-b border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600">
            <span>GPU</span>
            <span className="col-span-2">Best for</span>
            <span>VRAM</span>
            <span>~Price/hr</span>
          </div>
          {GPU_GUIDE.map(g => (
            <div key={g.gpu} className="grid grid-cols-5 px-4 py-2.5 border-b border-slate-100 last:border-0 text-xs text-slate-700">
              <span className="font-medium text-slate-900">{g.gpu}</span>
              <span className="col-span-2 text-slate-600">{g.best}</span>
              <span>{g.vram}</span>
              <span className="text-green-700 font-medium">{g.price}</span>
            </div>
          ))}
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">
          <strong>Rule of thumb for VRAM:</strong> A model at <Term id="bf16" /> precision needs approximately 2 bytes × parameter count. A 7B-parameter model = ~14GB VRAM minimum, ~28GB recommended for training.
        </p>
      </Section>

      <Section id="workload-advisor" title="Workload Advisor">
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          Not sure what GPU you need? The <strong>Workload Advisor</strong> is a floating widget (bottom-right corner of every page) that analyses your workload and recommends hardware.
        </p>
        <Step number={1} title="Open the Advisor">
          Click the floating button in the bottom-right corner of any page. It opens a panel with a file drop zone.
        </Step>
        <Step number={2} title="Drop your model file or config">
          Drag in a PyTorch <code className="text-xs bg-slate-100 px-1 rounded">.pt</code> file, a Hugging Face config JSON, or a requirements file. The Advisor reads metadata only — no weights are uploaded.
        </Step>
        <Step number={3} title="Get a recommendation">
          The Advisor estimates minimum VRAM needed and suggests the cheapest GPU currently available that fits. It also shows the current market price for that GPU.
        </Step>
        <CalloutBox type="tip">
          You can also type a description like "Fine-tune Llama 3 8B with LoRA, batch size 4, bf16" and the Advisor will estimate your requirements.
        </CalloutBox>
      </Section>

      <Section id="booking" title="Booking a GPU">
        <Step number={1} title="Click Book on a GPU listing">
          From the Arbitrage page, click any GPU row to open the booking form.
        </Step>
        <Step number={2} title="Set duration">
          Enter your estimated job duration. You can extend a running job if it takes longer — as long as the GPU has availability.
        </Step>
        <Step number={3} title="Upload your script">
          Attach your Python script, Docker image reference, or shell commands. Your code runs in an isolated container with no outbound internet by default.
        </Step>
        <Step number={4} title="Confirm — credits move to escrow">
          Review the cost estimate (including the 5% platform fee) and confirm. Credits move to escrow immediately. The job is queued and typically starts within 30 seconds.
        </Step>
      </Section>

      <Section id="veritas-tiers" title="Veritas reliability tiers">
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          The <Term id="VeritasTier" /> is a cryptographically-attested reliability badge. It's earned from ZK uptime proofs — not purchased or self-reported.
        </p>
        <div className="space-y-2 mb-4">
          {[
            { tier: 'Gold',   uptime: '≥ 99.5%', color: 'text-yellow-700 bg-yellow-50 border-yellow-200',  desc: 'Recommended for long runs, production workloads, deadline-sensitive jobs.' },
            { tier: 'Silver', uptime: '≥ 98.0%', color: 'text-slate-600 bg-slate-50 border-slate-200',    desc: 'Good for most training and research. Occasional drop unlikely to affect short jobs.' },
            { tier: 'Bronze', uptime: '≥ 95.0%', color: 'text-orange-700 bg-orange-50 border-orange-200', desc: 'Budget jobs, experiments, tolerant workloads. Risk of occasional interruption.' },
          ].map(t => (
            <div key={t.tier} className={`rounded-xl border ${t.color} p-4 flex items-start gap-3`}>
              <span className="text-lg flex-shrink-0">🏆</span>
              <div>
                <p className="text-sm font-bold">{t.tier} — {t.uptime} uptime</p>
                <p className="text-xs mt-0.5 text-slate-600">{t.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

    </HelpArticle>
  )
}
