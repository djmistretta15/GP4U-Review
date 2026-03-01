import { HelpArticle, Section, Step, CalloutBox, FactRow } from '@/components/ui/help-article'
import { Term } from '@/components/ui/info-tooltip'
import Link from 'next/link'

/**
 * /help/billing — billing and payments guide
 */

const TOC = [
  { id: 'credit-system',     label: 'Credit system' },
  { id: 'add-credits',       label: 'Adding credits' },
  { id: 'fee-schedule',      label: 'Fee schedule' },
  { id: 'transaction-history', label: 'Transaction history' },
  { id: 'refund',            label: 'Refund policy' },
  { id: 'failed-jobs',       label: 'Failed job refunds' },
  { id: 'provider-earnings', label: 'Provider earnings' },
]

const RELATED = [
  { href: '/help/getting-started', icon: '🚀', title: 'Getting started',  description: 'Set up your account and add your first credits' },
  { href: '/help/safety',          icon: '🔒', title: 'Safety & Trust',   description: 'How credits are protected in escrow' },
  { href: '/help/providers',       icon: '🏗️', title: 'Provider guide',   description: 'How provider earnings are settled' },
]

export default function BillingHelpPage() {
  return (
    <HelpArticle
      title="Billing & Payments"
      description="How credits work, what fees you pay, and how to get money back."
      icon="💳"
      readingTime="4 min"
      tourId="billing"
      toc={TOC}
      related={RELATED}
    >

      <Section id="credit-system" title="The credit system">
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          GP4U uses a prepaid credit system. <Term id="ComputeCredits" /> are denominated in USD at a 1:1 peg — 1 credit = $1.00.
        </p>
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          Your balance is not stored in a separate field. It's derived from the <Term id="ObsidianLedger" />:
        </p>
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 font-mono text-sm text-center mb-4">
          balance = <span className="text-green-700">sum(CREDITS_ADDED)</span> − <span className="text-slate-700">sum(job costs)</span>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">
          This means your balance is always independently verifiable — no hidden adjustments, no rounding, no drift. Every number traces to a sealed ledger block.
        </p>
        <CalloutBox type="success" title="No subscription, no minimum">
          You only pay when you use compute. There are no monthly fees, no seat licences, no minimum spend. Top up when you need to.
        </CalloutBox>
      </Section>

      <Section id="add-credits" title="Adding credits">
        <Step number={1} title="Go to the Billing page">
          Click <strong>Billing</strong> in the sidebar or go to <Link href="/billing" className="text-blue-600 underline">/billing</Link>.
        </Step>
        <Step number={2} title="Choose a preset or enter a custom amount">
          Presets: $25, $50, $100, $250. Or enter any amount from $10 to $10,000. The preset notes show approximate compute time on an A100 80GB for context.
        </Step>
        <Step number={3} title="Check out via Stripe">
          Secure checkout handled by Stripe. GP4U never stores or sees your card number. Accepted: Visa, Mastercard, Amex, Apple Pay, Google Pay.
        </Step>
        <Step number={4} title="Credits available immediately">
          After Stripe confirms, your credits are added and sealed in the Obsidian ledger within seconds.
        </Step>
        <CalloutBox type="info">
          Enterprise customers can also pay by invoice (net-30). Contact sales@gp4u.com to set up invoice billing.
        </CalloutBox>
      </Section>

      <Section id="fee-schedule" title="Fee schedule — no hidden fees">
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          Every fee is shown before you confirm. Here is the complete list:
        </p>
        <div className="rounded-xl border border-slate-200 overflow-hidden mb-4">
          <FactRow label="Platform fee" value="5% of credit value" sub="Applied at credit addition — shown on receipt" />
          <FactRow label="Payment processing" value="2.9% + $0.30" sub="Stripe standard pricing — same as every SaaS" />
          <FactRow label="Job routing fee" value="15% of job revenue" sub="Deducted from provider payout, not from your balance" />
          <FactRow label="ZK proof generation" value="Included" sub="No extra charge — built into the platform" />
          <FactRow label="Dispute filing" value="Free" sub="No fee to open or respond to a dispute" />
          <FactRow label="Payout to bank" value="$2 per transfer" sub="For provider payouts via Stripe Connect" />
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">
          There are no monthly subscription fees, no inactivity fees, and no fees for browsing the marketplace without booking.
        </p>
        <CalloutBox type="tip" title="What you actually pay per GPU-hour">
          Provider price × 1.05 (platform fee) + applicable payment processing on the original top-up. Example: $3.00/hr GPU + 5% = $3.15/hr total cost to you.
        </CalloutBox>
      </Section>

      <Section id="transaction-history" title="Transaction history">
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          Every credit addition and job cost is listed chronologically on the <Link href="/billing" className="text-blue-600 underline">Billing page</Link>. Each transaction shows:
        </p>
        <div className="rounded-xl border border-slate-200 overflow-hidden mb-4">
          {[
            ['Label',       'What it was (e.g. "Credits added", job name)'],
            ['Amount',      'USD value — credits are green, job costs are negative'],
            ['Timestamp',   'Date and time (relative + absolute on hover)'],
            ['Type',        '"Credit" for additions, "Job cost" for compute spend'],
          ].map(([k, v]) => (
            <FactRow key={k} label={k} value={v} />
          ))}
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">
          For audit purposes, every transaction links to its Obsidian ledger block. You can also download a CSV export of all transactions from Settings → Billing → Export.
        </p>
      </Section>

      <Section id="refund" title="Refund policy">
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 mb-4">
          <p className="text-sm font-semibold text-green-900 mb-1">90-day full refund on unused credits</p>
          <p className="text-sm text-green-800">
            Unused compute credits are refundable in full within 90 days of purchase. No questions asked. The refund goes back to your original payment method via Stripe within 5–10 business days.
          </p>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          To request a refund: Settings → Billing → Refund. Or email support@gp4u.com with your account email and the amount you want refunded.
        </p>
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <FactRow label="Unused credits within 90 days" value="✅ Full refund" />
          <FactRow label="Unused credits after 90 days"  value="❌ Non-refundable" sub="Contact support — edge cases considered" />
          <FactRow label="Credits used for completed jobs" value="❌ Non-refundable" sub="Job ran and completed — provider was paid" />
          <FactRow label="Credits in escrow (running job)" value="✅ Returned if job fails" sub="Automatic, no claim needed" />
          <FactRow label="Partial use (job cancelled mid-run)" value="⚡ Partial refund" sub="Unused time after cancellation is refunded" />
        </div>
      </Section>

      <Section id="failed-jobs" title="Failed job refunds — automatic">
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          If a job fails due to a provider issue, your credits return automatically:
        </p>
        <Step number={1} title="Job is marked FAILED">
          The platform detects the failure (connection drop, telemetry gap, or provider reported error). The job status becomes FAILED on the Obsidian ledger.
        </Step>
        <Step number={2} title="Escrow is released">
          The full estimated cost is returned to your credit balance within 30 seconds. You see the credit addition in your transaction history.
        </Step>
        <Step number={3} title="Ledger entry is sealed">
          The return is recorded as a CREDITS_RETURNED event in the Obsidian ledger — permanently, alongside the original job.
        </Step>
        <CalloutBox type="info">
          You don't need to file anything for a failed job refund. It happens automatically. If your balance doesn't update within 5 minutes of a failed job, contact support.
        </CalloutBox>
      </Section>

      <Section id="provider-earnings" title="Provider earnings">
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          If you're a provider, your earnings appear in the <strong>Provider Earnings</strong> section of the Billing page. They accumulate after each completed job.
        </p>
        <div className="rounded-xl border border-slate-200 overflow-hidden mb-4">
          <FactRow label="Earnings settlement" value="After each job" sub="Appears in Billing → Provider Earnings" />
          <FactRow label="Payout method" value="Stripe Connect" sub="Set up in Settings → Provider → Payout" />
          <FactRow label="Minimum payout" value="$10" sub="Earnings below $10 accumulate to the next payout" />
          <FactRow label="Payout frequency" value="Weekly (default) or on-demand" sub="Change in Settings → Provider → Payout" />
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">
          Provider earnings are separate from your compute credit balance — they can't accidentally be spent on jobs. Set up a payout destination in <Link href="/settings" className="text-blue-600 underline">Settings → Provider</Link>.
        </p>
      </Section>

    </HelpArticle>
  )
}
