/**
 * POST /api/providers/onboard — Provider Node Onboarding
 *
 * Two paths depending on tier:
 *
 * UNIVERSITY tier:
 *   - Requires institution_email (.edu), institution_name, mou_accepted: true
 *   - Zero cash stake — reputational commitment only
 *   - Node created in PENDING_VERIFICATION status — admin approves the MOU
 *
 * COMMERCIAL tier:
 *   - Requires gpu_count — determines stake requirement
 *   - Node created in PENDING_VERIFICATION — stake payment required before ACTIVE
 *   - Returns stake_requirement so the client knows how much to deposit
 *
 * Both tiers MUST accept the visibility_consent T&C. Without this, the
 * provider's hardware cannot be monitored and they cannot be onboarded.
 * This is the foundational trust guarantee of the platform.
 *
 * GET /api/providers/onboard — Returns stake requirement for given gpu_count + tier
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, assertString, assertFinite, rateLimit, clientIp } from '@/lib/auth-guard'
import { calculateStake } from '@gp4u/mnemo-engine'
import type { ProviderTier } from '@gp4u/mnemo-engine'

const VALID_TIERS = new Set<ProviderTier>(['UNIVERSITY', 'COMMERCIAL'])
const EDU_PATTERN = /^[^\s@]+@[^\s@]+\.edu$/i

// ─── GET: Quote a stake requirement ───────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const tier_raw  = searchParams.get('tier') ?? 'COMMERCIAL'
  const gpu_count = Math.max(1, Math.min(10000, Number(searchParams.get('gpu_count') ?? 1)))

  const tier = VALID_TIERS.has(tier_raw as ProviderTier) ? tier_raw as ProviderTier : 'COMMERCIAL'
  const requirement = calculateStake(tier, gpu_count)

  return NextResponse.json({ requirement })
}

// ─── POST: Register a new provider node ───────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.response

  // Limit: 5 onboarding attempts per day per IP
  const rl = rateLimit(clientIp(req), 5, 86400)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many onboarding attempts' }, { status: 429 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const b = body as Record<string, unknown>

  // All providers must explicitly accept the visibility T&C
  if (b.visibility_consent !== true) {
    return NextResponse.json({
      error:
        'visibility_consent must be true. The hardware visibility T&C is ' +
        'mandatory — it is the foundation of trust on this platform. ' +
        'Providers who cannot agree should not join.',
    }, { status: 400 })
  }

  const tier_raw = String(b.tier ?? 'COMMERCIAL').trim().toUpperCase() as ProviderTier
  if (!VALID_TIERS.has(tier_raw)) {
    return NextResponse.json({ error: 'tier must be UNIVERSITY or COMMERCIAL' }, { status: 400 })
  }

  try {
    assertString(b.node_id, 'node_id', 64)
    assertString(b.region,  'region',  32)
    assertFinite(b.gpu_count as number, 'gpu_count', 1, 10000)
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Validation error' }, { status: 400 })
  }

  const node_id   = String(b.node_id).trim()
  const region    = String(b.region).trim()
  const gpu_count = Math.floor(Number(b.gpu_count))

  // Check node_id not already registered
  const existing = await prisma.providerNode.findUnique({ where: { node_id } })
  if (existing) {
    return NextResponse.json({ error: 'node_id already registered' }, { status: 409 })
  }

  // University-specific validation
  if (tier_raw === 'UNIVERSITY') {
    const institution_email = String(b.institution_email ?? '').trim()
    const institution_name  = String(b.institution_name ?? '').trim()
    if (!EDU_PATTERN.test(institution_email)) {
      return NextResponse.json({
        error: 'institution_email must be a valid .edu address for university tier',
      }, { status: 400 })
    }
    if (!institution_name || institution_name.length < 3) {
      return NextResponse.json({
        error: 'institution_name is required for university tier',
      }, { status: 400 })
    }
    if (b.mou_accepted !== true) {
      return NextResponse.json({
        error: 'mou_accepted must be true. Universities must acknowledge the MOU before joining.',
      }, { status: 400 })
    }
  }

  const stake_requirement = calculateStake(tier_raw, gpu_count)

  // Create node + stake record in a transaction
  const [node, stake] = await prisma.$transaction([
    prisma.providerNode.create({
      data: {
        node_id,
        owner_user_id:       auth.user.id,
        tier:                tier_raw as never,
        institution_name:    tier_raw === 'UNIVERSITY' ? String(b.institution_name).trim() : null,
        institution_email:   tier_raw === 'UNIVERSITY' ? String(b.institution_email).trim().toLowerCase() : null,
        mou_signed_at:       tier_raw === 'UNIVERSITY' ? new Date() : null,
        gpu_count,
        gpu_models:          JSON.stringify(Array.isArray(b.gpu_models) ? b.gpu_models : []),
        total_vram_gb:       Math.floor(Number(b.total_vram_gb ?? 0)),
        region,
        visibility_consent_at: new Date(),
        visibility_scope:    'FULL',
        status:              'PENDING_VERIFICATION',
      },
    }),
    prisma.providerStake.create({
      data: {
        node_id,
        tier:           tier_raw as never,
        initial_amount: stake_requirement.cash_stake_usd,
        current_amount: stake_requirement.cash_stake_usd,
        total_slashed:  0,
        status:         'ACTIVE',
      },
    }),
  ])

  return NextResponse.json({
    node_id:         node.node_id,
    status:          node.status,
    tier:            node.tier,
    stake_requirement,
    next_steps:      tier_raw === 'UNIVERSITY'
      ? 'Your node is pending MOU verification. An admin will review within 2 business days.'
      : stake_requirement.cash_stake_usd > 0
        ? `Deposit $${stake_requirement.cash_stake_usd} in GP4U credits to activate your node.`
        : 'Your node is ready for activation.',
    requires_audit:  stake_requirement.requires_audit,
  }, { status: 201 })
}
