/**
 * POST /api/telemetry/russian-doll
 *
 * Telemetry ingestion endpoint called by provider-side agents
 * running the Russian-Doll scheduler on their hardware.
 *
 * The provider agent calls this endpoint every N seconds
 * (default: every 10s, configurable via agent config).
 *
 * Auth: Bearer token issued at job-creation time (stored in job.allocation_id).
 *       In production this would verify a JWT issued by Dextera.
 *       During dev, we accept any payload and log a warning.
 *
 * This endpoint is intentionally kept thin — it just validates,
 * passes to the bridge, and returns. Heavy processing happens
 * inside the bridge's async event bus publishes.
 *
 * Response:
 *   200 { ok: true, threat_detected: bool, risk_score: number, action: string }
 *   400 { error: 'Missing required fields' }
 *   500 { error: '...' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getRussianDollBridge } from '@gp4u/russian-doll-bridge'
import type { RussianDollJobMetrics } from '@gp4u/russian-doll-bridge'

const REQUIRED_FIELDS: (keyof RussianDollJobMetrics)[] = [
  'job_id', 'node_id', 'gpu_id', 'subject_id', 'timestamp',
  'gpu_utilization_pct', 'vram_used_gb', 'vram_allocated_gb',
  'power_draw_watts', 'power_cap_watts',
]

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json() as Partial<RussianDollJobMetrics>

    // Basic validation
    for (const field of REQUIRED_FIELDS) {
      if (payload[field] === undefined || payload[field] === null) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        )
      }
    }

    const metrics = payload as RussianDollJobMetrics

    // Apply defaults for optional telemetry fields
    metrics.outbound_bytes_per_sec  ??= 0
    metrics.inbound_bytes_per_sec   ??= 0
    metrics.active_connections      ??= 0
    metrics.unique_dst_ips          ??= 0
    metrics.dns_queries_per_min     ??= 0
    metrics.suspicious_destinations ??= []
    metrics.process_count           ??= 1
    metrics.unexpected_processes    ??= []
    metrics.privilege_escalation_attempts ??= 0
    metrics.filesystem_writes_per_sec ??= 0
    metrics.gpu_compute_pattern     ??= 'UNKNOWN'
    metrics.declared_framework      ??= 'UNKNOWN'
    metrics.total_tasks_scheduled   ??= 0
    metrics.total_tasks_completed   ??= 0
    metrics.total_energy_consumed_fj ??= 0
    metrics.energy_per_task_fj      ??= 0
    metrics.elapsed_time_seconds    ??= 0
    metrics.die_utilization         ??= {}
    metrics.thermal_throttling      ??= false
    metrics.temperature_c           ??= 0

    const bridge = getRussianDollBridge()
    const result  = await bridge.ingest(metrics)

    // If a CRITICAL threat was detected, the provider agent should kill the job
    const should_kill = result.threat_eval.recommended_action === 'KILL_AND_BAN' ||
                        result.threat_eval.recommended_action === 'KILL_JOB' ||
                        result.threat_eval.recommended_action === 'EMERGENCY_HALT'

    return NextResponse.json({
      ok:              true,
      threat_detected: result.threat_eval.threat_detected,
      risk_score:      result.threat_eval.risk_score,
      severity:        result.threat_eval.severity,
      action:          result.threat_eval.recommended_action,
      kill_job:        should_kill,
      anomalies:       result.threat_eval.anomaly_types,
      energy_kwh:      result.energy.kwh,
      events_published: result.events_published,
      // Only include errors in response if present (don't leak internals unnecessarily)
      ...(result.errors.length > 0 ? { warnings: result.errors } : {}),
    })
  } catch (err) {
    console.error('[telemetry/russian-doll] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
