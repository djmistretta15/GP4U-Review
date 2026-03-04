/**
 * POST /api/billing/crypto-checkout — Create a crypto payment charge
 *
 * Routes to the appropriate crypto provider via the payment registry.
 * Currently supports Coinbase Commerce (BTC, ETH, SOL, XRP, USDC).
 *
 * Flow:
 *   1. Client POSTs { amount_usd, provider_id? }
 *   2. This route creates a charge via the provider's createCharge()
 *   3. Returns { charge_id, redirect_url, expires_at }
 *   4. Client redirects the user to redirect_url (hosted checkout)
 *   5. Provider fires webhook to /api/billing/crypto-webhook on payment
 *
 * Rate limit: 10 checkout attempts per hour per user.
 */

import { NextRequest, NextResponse }  from 'next/server'
import { requireAuth }               from '@/lib/auth-guard'
import { rateLimit }                 from '@/lib/rate-limit'
import { registry }                  from '@/lib/payments/registry'
import type { ProviderId }           from '@/lib/payments/types'

const MIN_USD = 10
const MAX_USD = 10_000

// Providers that are valid targets for this route (not Stripe — that has its own route)
const CRYPTO_PROVIDERS: ProviderId[] = ['coinbase_commerce']

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.response

  const { user } = auth

  const rl = await rateLimit(`crypto-checkout:user:${user.id}`, 10, 3600)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many checkout attempts. Please wait before trying again.' }, { status: 429 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { amount_usd, provider_id } = body as { amount_usd?: unknown; provider_id?: unknown }

  if (
    typeof amount_usd !== 'number' ||
    !isFinite(amount_usd) ||
    amount_usd < MIN_USD ||
    amount_usd > MAX_USD
  ) {
    return NextResponse.json(
      { error: `Amount must be between $${MIN_USD} and $${MAX_USD.toLocaleString()}` },
      { status: 400 }
    )
  }

  // Default to Coinbase Commerce; allow explicit selection from the allowed list
  const targetId: ProviderId =
    typeof provider_id === 'string' && CRYPTO_PROVIDERS.includes(provider_id as ProviderId)
      ? (provider_id as ProviderId)
      : 'coinbase_commerce'

  const provider = registry.getEnabled(targetId)
  if (!provider) {
    return NextResponse.json(
      { error: `Payment provider '${targetId}' is not currently enabled` },
      { status: 503 }
    )
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gp4u.com'

  try {
    const charge = await provider.createCharge({
      amount_usd,
      user_id:    user.id,
      user_email: user.email,
      description: `GP4U compute credits — $${amount_usd}`,
      return_url: `${baseUrl}/billing?payment=success&provider=${targetId}`,
      cancel_url: `${baseUrl}/billing?payment=cancelled`,
    })

    return NextResponse.json({
      charge_id:    charge.charge_id,
      redirect_url: charge.redirect_url,
      expires_at:   charge.expires_at?.toISOString() ?? null,
      provider:     targetId,
    })
  } catch (err) {
    console.error(`[crypto-checkout] ${targetId} createCharge failed:`, err)
    return NextResponse.json(
      { error: 'Failed to create payment charge. Please try again.' },
      { status: 502 }
    )
  }
}
