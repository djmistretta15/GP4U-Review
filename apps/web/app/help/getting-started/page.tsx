import { HelpArticle, Section, Step, CalloutBox, FactRow } from '@/components/ui/help-article'
import { Term } from '@/components/ui/info-tooltip'
import Link from 'next/link'

/**
 * /help/getting-started — new user guide
 */

const TOC = [
  { id: 'what-is-gp4u',  label: 'What is GP4U?' },
  { id: 'create-account', label: 'Create your account' },
  { id: 'add-credits',    label: 'Add compute credits' },
  { id: 'first-job',      label: 'Run your first job' },
  { id: 'track-job',      label: 'Track your job' },
  { id: 'faq',            label: 'FAQ' },
]

const RELATED = [
  { href: '/help/safety',    icon: '🔒', title: 'Safety & Trust',    description: 'How your money and data are protected' },
  { href: '/help/billing',   icon: '💳', title: 'Billing & Payments', description: 'Credits, fees, and refunds' },
  { href: '/help/marketplace', icon: '🛒', title: 'Marketplace & GPUs', description: 'Finding and booking the right hardware' },
]

export default function GettingStartedPage() {
  return (
    <HelpArticle
      title="Getting Started"
      description="Create your account, add credits, and run your first GPU job in under 5 minutes."
      icon="🚀"
      readingTime="4 min"
      tourId="getting-started"
      toc={TOC}
      related={RELATED}
    >

      <Section id="what-is-gp4u" title="What is GP4U?">
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          GP4U is a marketplace for GPU compute. You pay for GPU time and run any workload — AI training, inference, research, data processing — on verified hardware from universities and commercial operators worldwide.
        </p>
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          What makes GP4U different:
        </p>
        <ul className="space-y-2 mb-4">
          {[
            ['Transparent pricing', 'Real-time comparison across 7 cloud providers. You always see the best price before booking.'],
            ['Verified hardware', 'Every job generates a ZK proof of exactly what hardware ran it. No surprises.'],
            ['Protected money', 'Credits sit in escrow until your job succeeds. Failed job? Automatic refund, no questions.'],
            ['Immutable history', 'Every transaction is sealed in the Obsidian ledger — permanent, tamper-proof.'],
          ].map(([title, desc]) => (
            <li key={title} className="flex items-start gap-2 text-sm text-slate-600">
              <span className="text-green-500 flex-shrink-0 mt-0.5">✓</span>
              <span><strong className="text-slate-800">{title}:</strong> {desc}</span>
            </li>
          ))}
        </ul>
        <CalloutBox type="tip" title="No installation required for users">
          You run jobs through the browser or API. Only <Link href="/help/providers" className="underline">providers</Link> need to install software.
        </CalloutBox>
      </Section>

      <Section id="create-account" title="Create your account">
        <Step number={1} title="Go to /register">
          Visit <Link href="/register" className="text-blue-600 underline">/register</Link>. Enter your full name, email address, and a password (minimum 8 characters).
        </Step>
        <Step number={2} title="Academic email? Automatic pricing">
          If your email ends in <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">.edu</code>, you automatically qualify for academic pricing and the university provider program. Your institution is recognised automatically.
        </Step>
        <Step number={3} title="Agree to the terms">
          The terms are shown inline on the registration form — not buried behind a link. Read them. The key points: you own your data, we don't train on your jobs, you can export everything.
        </Step>
        <Step number={4} title="Check your email">
          A verification email arrives within 2 minutes. Click the link to verify your address. Until verified, you can browse but not submit jobs.
        </Step>
        <CalloutBox type="info" title="Referral codes">
          If someone gave you a referral link, the code is pre-filled automatically. Both you and the referrer receive a credit bonus when your first job completes.
        </CalloutBox>
      </Section>

      <Section id="add-credits" title="Add compute credits">
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          <Term id="ComputeCredits" /> are the currency of GP4U. 1 credit = $1 USD. You only pay for what you use — unused credits are refundable within 90 days.
        </p>
        <Step number={1} title="Go to Billing">
          Click <strong>Billing</strong> in the left sidebar, or go to <Link href="/billing" className="text-blue-600 underline">/billing</Link>.
        </Step>
        <Step number={2} title="Choose an amount">
          Select a preset ($25, $50, $100, $250) or enter a custom amount. Minimum $10.
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
              {[
                ['$25', '~8 hours on an A100 80GB'],
                ['$50', '~16 hours on an A100 80GB'],
                ['$100', '~32 hours on an A100 80GB'],
                ['$250', '~80 hours on an A100 80GB'],
              ].map(([amt, note]) => (
                <div key={amt} className="flex items-center gap-2">
                  <span className="font-bold text-slate-800">{amt}</span>
                  <span>{note}</span>
                </div>
              ))}
            </div>
          </div>
        </Step>
        <Step number={3} title="Pay via Stripe">
          Checkout is handled by Stripe. GP4U never stores your card details. Payment confirmation is immediate.
        </Step>
        <Step number={4} title="Credits available instantly">
          Your balance updates immediately after payment. Every addition is sealed in the <Term id="ObsidianLedger" />.
        </Step>
      </Section>

      <Section id="first-job" title="Run your first job">
        <Step number={1} title="Go to the Dashboard">
          Click <strong>Dashboard</strong> in the sidebar. You'll see your job list (empty for now) and a <strong>New Job</strong> button.
        </Step>
        <Step number={2} title="Choose a GPU">
          Not sure which GPU? Click the <strong>Workload Advisor</strong> (floating button, bottom right) and drop in your model file or describe your workload. It recommends the minimum GPU for your task.
        </Step>
        <Step number={3} title="Set your duration">
          Estimate how long your job will run. You'll be charged only for actual time used — if your job finishes early, unused credits stay in your balance.
        </Step>
        <Step number={4} title="Upload your script">
          Drag-and-drop your Python/shell script or Docker image reference. The platform runs it inside a secured container with no internet access by default.
        </Step>
        <Step number={5} title="Confirm booking">
          Review the cost estimate, then confirm. Your credits move to escrow and the job is queued. Most jobs start within 30 seconds.
        </Step>
        <CalloutBox type="warning" title="Credits in escrow">
          Once a job starts, the estimated cost is held in escrow. It's yours — it only transfers to the provider after successful completion. A failed job returns your credits automatically.
        </CalloutBox>
      </Section>

      <Section id="track-job" title="Track your job">
        <p className="text-sm text-slate-600 leading-relaxed mb-3">
          After submitting, your job appears on the Dashboard with a live status:
        </p>
        <div className="rounded-xl border border-slate-200 overflow-hidden mb-4">
          {[
            ['PENDING',  'Queued, waiting for hardware assignment'],
            ['RUNNING',  'Active on a provider GPU — you can stream logs'],
            ['COMPLETE', 'Finished successfully — ZK proof available, credits settled'],
            ['FAILED',   'Job did not complete — credits automatically returned to your balance'],
          ].map(([status, desc]) => (
            <FactRow key={status} label={status} value={desc} />
          ))}
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">
          After completion, click your job to view the <Term id="ZKProof" /> — proof of exactly what hardware ran it, the energy consumed, and that the VRAM was as declared.
        </p>
      </Section>

      <Section id="faq" title="Frequently asked questions">
        <div className="space-y-4">
          {[
            {
              q: 'Is there a free tier?',
              a: 'There is no ongoing free tier, but new users receive a small credit bonus when they verify their email. Academic users (university .edu emails) receive discounted rates.',
            },
            {
              q: 'Can I cancel a job mid-run?',
              a: 'Yes. Go to Dashboard → your job → Cancel. Credits for unused time are returned to your balance. You are billed for the time the job ran.',
            },
            {
              q: 'What happens if the provider disappears mid-job?',
              a: 'The platform detects the connection drop within 30 seconds. The job is marked FAILED and your full estimated cost is returned to your balance — no manual claim required.',
            },
            {
              q: 'Is my code safe?',
              a: 'Your script runs inside a secured Docker container with no internet access (unless you explicitly request it). The provider cannot access your code or output — only job metadata and hardware telemetry is visible to the platform.',
            },
            {
              q: 'What GPU providers are supported?',
              a: 'The arbitrage engine covers AWS, Google Cloud, Azure, RunPod, Lambda Labs, CoreWeave, and Vast.ai — plus GP4U-native university and commercial nodes.',
            },
          ].map(({ q, a }) => (
            <div key={q} className="rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-800 mb-1">Q: {q}</p>
              <p className="text-sm text-slate-600">{a}</p>
            </div>
          ))}
        </div>
      </Section>

    </HelpArticle>
  )
}
