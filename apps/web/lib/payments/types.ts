/**
 * Payment Provider — shared types
 *
 * Every payment method implements PaymentProvider and registers itself
 * in the payment registry. The billing API and UI interact only with
 * this interface — never directly with Stripe, Coinbase Commerce, or
 * any chain-specific SDK.
 *
 * To add a new provider (e.g., Lightning Network, Solana Pay):
 *   1. Create lib/payments/providers/my-provider.ts implementing PaymentProvider
 *   2. Register in lib/payments/registry.ts
 *   3. Add a feature flag env var  (PAYMENT_<PROVIDER>_ENABLED)
 *   4. The UI and webhook router pick it up automatically
 */

// ─── Core charge lifecycle ────────────────────────────────────────────────────

export type ChargeStatus =
  | 'pending'       // created, awaiting payment
  | 'confirmed'     // payment confirmed — credit the account
  | 'failed'        // payment failed or expired
  | 'overpaid'      // user sent too much (flag for manual review)
  | 'underpaid'     // user sent too little (flag for manual review)

export interface CreateChargeParams {
  amount_usd:  number
  user_id:     string
  user_email:  string
  description: string
  return_url:  string
  cancel_url:  string
}

export interface ChargeResult {
  charge_id:    string       // provider's charge/intent ID (for idempotency)
  redirect_url: string       // where to send the user (hosted checkout page or payment URL)
  expires_at?:  Date         // when the charge expires (crypto charges typically 15-60 min)
  metadata?:    Record<string, string>
}

export interface WebhookEvent {
  charge_id:   string
  status:      ChargeStatus
  amount_usd:  number
  user_id:     string
  raw:         Record<string, unknown>
}

// ─── Provider interface ───────────────────────────────────────────────────────

export interface PaymentProvider {
  /** Unique identifier used in API routes and DB metadata */
  readonly id: ProviderId

  /** Human-readable name shown in the UI */
  readonly name: string

  /** Short description (shown in payment method selector) */
  readonly description: string

  /** Currencies/methods supported (shown as pills in the UI) */
  readonly supportedMethods: string[]

  /** Icon character or emoji for the tab */
  readonly icon: string

  /**
   * Whether this provider is currently active.
   * Reads from PAYMENT_<ID>_ENABLED env var + required secrets check.
   */
  isEnabled(): boolean

  /**
   * Create a charge/payment intent.
   * Returns a redirect URL to send the user to (hosted page or Stripe client_secret).
   */
  createCharge(params: CreateChargeParams): Promise<ChargeResult>

  /**
   * Verify a webhook's authenticity and parse it into a normalised WebhookEvent.
   * Returns null if the signature is invalid or the event type is irrelevant.
   */
  parseWebhook(
    rawBody:   string,
    headers:   Record<string, string | string[] | undefined>,
  ): WebhookEvent | null
}

// ─── Provider IDs ─────────────────────────────────────────────────────────────

export type ProviderId =
  | 'stripe'            // Cards, Apple Pay, Google Pay, Link — live
  | 'coinbase_commerce' // BTC, ETH, SOL, XRP, USDC — toggleable
  | 'ondo'              // OUSG, USDY (RWA) — port stub
  | 'solana_pay'        // Direct Solana Pay QR — port stub
