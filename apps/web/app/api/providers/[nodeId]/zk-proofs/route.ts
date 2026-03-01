/**
 * POST /api/providers/[nodeId]/zk-proofs — Submit a ZK Proof
 *
 * Provider agent submits a completed ZK proof for storage and verification.
 * Proof is verified on receipt — invalid proofs are stored with INVALID status
 * and a slash WARNING is logged.
 *
 * GET /api/providers/[nodeId]/zk-proofs — List proofs for a node
 *   - Node owner: sees all proofs for their node
 *   - Customers: can verify specific proofs by proof_id
 *   - Public: only VERIFIED proofs visible
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, rateLimit, clientIp, assertString } from '@/lib/auth-guard'
import { verifyProof } from '@gp4u/zk-attestation'
import type { ZKProofPackage, ProofType } from '@gp4u/zk-attestation'

const VALID_PROOF_TYPES = new Set<ProofType>([
  'HARDWARE_ATTESTATION',
  'ENERGY_ATTESTATION',
  'UPTIME_ATTESTATION',
])

// ─── POST: Submit a new ZK proof ───────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { nodeId: string } },
) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.response

  const { nodeId } = params

  // Verify the caller owns this node
  const node = await prisma.providerNode.findUnique({
    where:  { node_id: nodeId },
    select: { owner_user_id: true, status: true },
  })

  if (!node) {
    return NextResponse.json({ error: 'Provider node not found' }, { status: 404 })
  }

  if (node.owner_user_id !== auth.user.id) {
    return NextResponse.json({ error: 'Not authorized for this node' }, { status: 403 })
  }

  // Rate limit: 100 proofs per hour (proofs are generated per-job)
  const rl = rateLimit(clientIp(req) + nodeId, 100, 3600)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Proof submission rate limit exceeded' }, { status: 429 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const b = body as Record<string, unknown>

  try {
    assertString(b.proof_type,       'proof_type',       64)
    assertString(b.proof_data,       'proof_data',       500000) // proofs can be large
    assertString(b.verification_key, 'verification_key', 128)
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Validation error' }, { status: 400 })
  }

  const proof_type = String(b.proof_type).trim() as ProofType
  if (!VALID_PROOF_TYPES.has(proof_type)) {
    return NextResponse.json({ error: `Invalid proof_type: ${proof_type}` }, { status: 400 })
  }

  const pkg: ZKProofPackage = {
    proof_id:         crypto.randomUUID(),
    proof_type,
    node_id:          nodeId,
    job_id:           b.job_id ? String(b.job_id) : undefined,
    public_inputs:    (b.public_inputs as object) ?? {},
    proof_data:       String(b.proof_data),
    verification_key: String(b.verification_key),
    generated_at:     new Date(String(b.generated_at ?? new Date().toISOString())),
    expires_at:       new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
  }

  // Verify the proof immediately on receipt
  const result = verifyProof(pkg)
  const status = result.valid ? 'VERIFIED' : 'INVALID'

  const stored = await prisma.zKProof.create({
    data: {
      proof_id:         pkg.proof_id,
      node_id:          nodeId,
      job_id:           pkg.job_id ?? null,
      proof_type:       proof_type as never,
      status:           status as never,
      proof_data:       pkg.proof_data,
      public_inputs:    pkg.public_inputs as object,
      verification_key: pkg.verification_key,
      generated_at:     pkg.generated_at,
      verified_at:      result.valid ? new Date() : null,
      expires_at:       pkg.expires_at,
    },
  })

  if (!result.valid) {
    // Log a warning slash for invalid proof submission
    // (automated — issued_by: 'SYSTEM')
    // We don't slash immediately, just log to Obsidian for pattern detection
    console.warn(`[zk] Invalid proof submitted by node ${nodeId}: ${result.failure_reason}`)
  }

  return NextResponse.json({
    proof_id:       stored.proof_id,
    status,
    verified_at:    result.valid ? new Date() : null,
    failure_reason: result.valid ? undefined : result.failure_reason,
  }, { status: 201 })
}

// ─── GET: List proofs for a node ───────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: { nodeId: string } },
) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.response

  const { nodeId } = params

  const node = await prisma.providerNode.findUnique({
    where:  { node_id: nodeId },
    select: { owner_user_id: true },
  })

  if (!node) {
    return NextResponse.json({ error: 'Provider node not found' }, { status: 404 })
  }

  const is_owner = node.owner_user_id === auth.user.id
  const { searchParams } = new URL(req.url)
  const proof_type = searchParams.get('proof_type') as ProofType | null
  const limit      = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 50)))

  const where: Record<string, unknown> = { node_id: nodeId }

  // Non-owners only see VERIFIED proofs (for attestation purposes)
  if (!is_owner) where.status = 'VERIFIED'

  if (proof_type && VALID_PROOF_TYPES.has(proof_type)) {
    where.proof_type = proof_type
  }

  const proofs = await prisma.zKProof.findMany({
    where,
    orderBy: { created_at: 'desc' },
    take:    limit,
    select: {
      proof_id:         true,
      proof_type:       true,
      status:           true,
      public_inputs:    true,
      verification_key: true,
      generated_at:     true,
      verified_at:      true,
      expires_at:       true,
      job_id:           true,
      // proof_data excluded from list — only returned on individual proof fetch
    },
  })

  return NextResponse.json({ proofs, node_id: nodeId })
}
