/**
 * Solana Pay Direct Provider — Port Stub
 *
 * Covers: SOL, USDC (SPL), any SPL token
 *
 * Status: PORT STUB — generates a Solana Pay QR code URL when enabled,
 *         but the backend confirmation (on-chain tx polling or webhook)
 *         is not yet implemented.
 *
 * Solana Pay flow (when complete):
 *   1. createCharge() generates a solana:<address>?amount=<SOL>&reference=<ref>
 *      URL and wraps it in a QR code for the billing page
 *   2. User scans QR with any Solana wallet (Phantom, Backpack, etc.)
 *   3. Transaction is submitted on-chain
 *   4. Backend polls or subscribes to the reference account for tx confirmation
 *   5. Once confirmed, apply credits (no webhook — on-chain verification)
 *
 * Enable:
 *   PAYMENT_SOLANA_PAY_ENABLED=true
 *   SOLANA_PAYMENT_ADDRESS=<your_treasury_address>
 *   SOLANA_RPC_URL=https://api.mainnet-beta.solana.com (or Helius/Triton)
 */

import type { PaymentProvider, CreateChargeParams, ChargeResult, WebhookEvent } from '../types'

export class SolanaPayProvider implements PaymentProvider {
  readonly id               = 'solana_pay' as const
  readonly name             = 'Solana Pay'
  readonly description      = 'Scan a QR code and pay instantly with SOL or USDC — gasless for USDC'
  readonly supportedMethods = ['SOL', 'USDC (SPL)']
  readonly icon             = '◎'

  isEnabled(): boolean {
    return process.env.PAYMENT_SOLANA_PAY_ENABLED === 'true'
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async createCharge(_params: CreateChargeParams): Promise<ChargeResult> {
    throw new Error(
      'Solana Pay direct integration is not yet live. ' +
      'Set PAYMENT_SOLANA_PAY_ENABLED=false or contact team@gp4u.com to join the beta.'
    )
  }

  /**
   * Solana Pay has no server webhook — confirmation is on-chain.
   * This returns null until a polling/subscription mechanism is implemented.
   */
  parseWebhook(_rawBody: string, _headers: Record<string, string | string[] | undefined>): WebhookEvent | null {
    return null
  }
}
