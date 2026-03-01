/**
 * Stripe client singleton
 *
 * Import { stripe } from '@/lib/stripe' anywhere you need the Stripe SDK.
 * The client is lazy-initialized and throws clearly if STRIPE_SECRET_KEY is missing.
 */

import Stripe from 'stripe'

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
    _stripe = new Stripe(key, { apiVersion: '2024-06-20', typescript: true })
  }
  return _stripe
}

export { Stripe }
