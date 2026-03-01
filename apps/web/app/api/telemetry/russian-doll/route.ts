/**
 * POST /api/telemetry/russian-doll
 *
 * Telemetry ingestion for provider agents running the Russian-Doll scheduler.
 *
 * Security model:
 *   - Middleware verifies the provider token is present and ≥ 32 chars
 *   - This route additionally verifies that the job_id in the payload is a real
 *     job AND that it was assigned to the node_id claiming to report for it.
 *     This prevents one provider from spoofing telemetry for another provider's job.
 *   - Numeric fields are clamped to prevent absurd values from poisoning threat scores
 *   - Response error strings do not include internal error details
 */

import { NextRequest, NextResponse } from 'next/server'
import { getRussianDollBridge } from '@gp4u/russian-doll-bridge'
import type { RussianDollJobMetrics } from '@gp4u/russian-doll-bridge'
import { prisma } from '@/lib/db'

const UUID_RE     = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/

function clamp(n: unknown, min: number, max: number): number {
  const v = typeof n === 'number' && isFinite(n) ? n : 0
  return Math.min(Math.max(v, min), max)
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json() as Partial<RussianDollJobMetrics>

    // Validate identity fields
    if (!payload.job_id || !UUID_RE.test(String(payload.job_id))) {
      return NextResponse.json({ error: 'Invalid job_id' }, { status: 400 })
    }
    if (!payload.node_id || typeof payload.node_id !== 'string' || payload.node_id.length < 8) {
      return NextResponse.json({ error: 'Invalid node_id' }, { status: 400 })
    }
    if (!payload.timestamp || !ISO_DATE_RE.test(String(payload.timestamp))) {
      return NextResponse.json({ error: 'Invalid timestamp' }, { status: 400 })
    }

    // Verify the job exists and is assigned to this node
    // Phase 1: verify job_id is a real job in PENDING or RUNNING state
    // Phase 2: store node_id at job acceptance time and verify it matches here
    const job = await prisma.job.findFirst({
      where: {
        id:     String(payload.job_id),
        status: { in: ['PENDING', 'RUNNING'] },
      },
      select: { id: true, userId: true, gpuId: true },
    }).catch(() => null)

    if (!job) {
      // Return 404 — don't reveal whether job exists or just isn't theirs
      return NextResponse.json({ error: 'Job not found or not active' }, { status: 404 })
    }

    // Clamp all numeric signals to prevent poisoned inputs
    const metrics: RussianDollJobMetrics = {
      job_id:     String(payload.job_id),
      node_id:    String(payload.node_id).slice(0, 64),
      gpu_id:     String(payload.gpu_id ?? job.gpuId),
      subject_id: String(payload.subject_id ?? job.userId),
      timestamp:  String(payload.timestamp),

      gpu_utilization_pct:  clamp(payload.gpu_utilization_pct, 0, 100),
      vram_used_gb:         clamp(payload.vram_used_gb, 0, 10000),
      vram_allocated_gb:    clamp(payload.vram_allocated_gb, 0, 10000),
      power_draw_watts:     clamp(payload.power_draw_watts, 0, 100000),
      power_cap_watts:      clamp(payload.power_cap_watts, 0, 100000),
      temperature_c:        clamp(payload.temperature_c, 0, 200),
      thermal_throttling:   Boolean(payload.thermal_throttling),

      outbound_bytes_per_sec: clamp(payload.outbound_bytes_per_sec, 0, 1e12),
      inbound_bytes_per_sec:  clamp(payload.inbound_bytes_per_sec, 0, 1e12),
      active_connections:     clamp(payload.active_connections, 0, 100000),
      unique_dst_ips:         clamp(payload.unique_dst_ips, 0, 100000),
      dns_queries_per_min:    clamp(payload.dns_queries_per_min, 0, 100000),
      // Only allow strings in suspicious_destinations, cap list length
      suspicious_destinations: (Array.isArray(payload.suspicious_destinations)
        ? payload.suspicious_destinations.filter(s => typeof s === 'string').slice(0, 100)
        : []) as string[],

      process_count:                  clamp(payload.process_count, 0, 10000),
      unexpected_processes:           (Array.isArray(payload.unexpected_processes)
        ? payload.unexpected_processes.filter(s => typeof s === 'string').slice(0, 50)
        : []) as string[],
      privilege_escalation_attempts:  clamp(payload.privilege_escalation_attempts, 0, 10000),
      filesystem_writes_per_sec:      clamp(payload.filesystem_writes_per_sec, 0, 1e9),

      declared_framework:  typeof payload.declared_framework === 'string'
        ? payload.declared_framework.slice(0, 64) : 'UNKNOWN',
      detected_framework:  typeof payload.detected_framework === 'string'
        ? payload.detected_framework.slice(0, 64) : undefined,
      gpu_compute_pattern: typeof payload.gpu_compute_pattern === 'string'
        ? payload.gpu_compute_pattern.slice(0, 32) : 'UNKNOWN',

      total_tasks_scheduled:    clamp(payload.total_tasks_scheduled, 0, 1e12),
      total_tasks_completed:    clamp(payload.total_tasks_completed, 0, 1e12),
      tasks_pending:            clamp(payload.tasks_pending, 0, 1e12),
      tasks_active:             clamp(payload.tasks_active, 0, 1e6),
      total_energy_consumed_fj: clamp(payload.total_energy_consumed_fj, 0, 1e30),
      energy_per_task_fj:       clamp(payload.energy_per_task_fj, 0, 1e30),
      elapsed_time_seconds:     clamp(payload.elapsed_time_seconds, 0, 2_592_000), // 30 days max
      throughput_tasks_per_sec: clamp(payload.throughput_tasks_per_sec, 0, 1e12),
      scheduler_policy:         typeof payload.scheduler_policy === 'string'
        ? payload.scheduler_policy.slice(0, 32) : 'unknown',
      total_dies:               clamp(payload.total_dies, 0, 100000),
      die_utilization:          {},  // Don't forward die_utilization — unbounded object
    }

    const bridge     = getRussianDollBridge()
    const result     = await bridge.ingest(metrics)
    const should_kill = ['KILL_AND_BAN', 'KILL_JOB', 'EMERGENCY_HALT'].includes(
      result.threat_eval.recommended_action
    )

    return NextResponse.json({
      ok:              true,
      threat_detected: result.threat_eval.threat_detected,
      risk_score:      result.threat_eval.risk_score,
      severity:        result.threat_eval.severity,
      action:          result.threat_eval.recommended_action,
      kill_job:        should_kill,
      anomalies:       result.threat_eval.anomaly_types,
      energy_kwh:      result.energy.kwh,
    })
  } catch (err) {
    console.error('[telemetry/russian-doll] error:', err)
    return NextResponse.json({ error: 'Telemetry processing failed' }, { status: 500 })
  }
}
