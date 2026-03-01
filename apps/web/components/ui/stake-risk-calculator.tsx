'use client'

/**
 * StakeRiskCalculator
 * ====================
 *
 * Shows providers exactly what each slash condition would cost them
 * at their declared stake level — before they commit.
 *
 * This is a transparency tool. Users should know their risk before signing.
 * Displayed during provider onboarding Step 3 (Stake & Risk).
 *
 * Usage:
 *   <StakeRiskCalculator stakeAmount={280} gpuCount={8} tier="COMMERCIAL" />
 */

import { InfoTooltip } from './info-tooltip'

interface SlashRow {
  condition:    string
  severity:     'WARNING' | 'SOFT' | 'HARD'
  pct:          number
  eject:        boolean
  trigger:      string
  appealDays:   number
}

const SLASH_TABLE: SlashRow[] = [
  // Warnings
  { condition: 'Thermal throttle',     severity: 'WARNING', pct: 0,   eject: false, trigger: 'GPU overheating during a job',                    appealDays: 0  },
  { condition: 'Minor uptime drop',    severity: 'WARNING', pct: 0,   eject: false, trigger: 'Offline < 2h with proper job handoff',             appealDays: 0  },
  { condition: 'Telemetry delay',      severity: 'WARNING', pct: 0,   eject: false, trigger: 'Reporting delayed > 60s (likely network blip)',     appealDays: 0  },
  // Soft slashes
  { condition: 'VRAM overclaim',       severity: 'SOFT',    pct: 15,  eject: false, trigger: 'Job used more VRAM than declared in manifest',      appealDays: 7  },
  { condition: 'Job dropped',          severity: 'SOFT',    pct: 10,  eject: false, trigger: 'Job terminated without completing or handoff',      appealDays: 7  },
  { condition: 'Uptime SLA breach',    severity: 'SOFT',    pct: 10,  eject: false, trigger: 'Offline > 4h without notice',                      appealDays: 7  },
  { condition: 'Hardware mismatch',    severity: 'SOFT',    pct: 20,  eject: false, trigger: 'Actual GPU differs > 15% from declared specs',      appealDays: 7  },
  { condition: '3 warnings in 30d',    severity: 'SOFT',    pct: 10,  eject: false, trigger: 'Auto-escalation by Mnemo engine',                  appealDays: 7  },
  // Hard slashes
  { condition: 'Telemetry tampering',  severity: 'HARD',    pct: 100, eject: true,  trigger: 'Fabricated or manipulated monitoring data',         appealDays: 14 },
  { condition: 'Visibility blocked',   severity: 'HARD',    pct: 100, eject: true,  trigger: 'Deliberately blocked hardware monitoring layer',    appealDays: 14 },
  { condition: 'Unauthorized process', severity: 'HARD',    pct: 75,  eject: true,  trigger: 'Processes not in job manifest detected',             appealDays: 14 },
  { condition: 'Crypto mining',        severity: 'HARD',    pct: 100, eject: true,  trigger: 'Mining activity during a declared ML job (fraud)',   appealDays: 14 },
  { condition: '3 soft slashes ever',  severity: 'HARD',    pct: 50,  eject: true,  trigger: 'Repeated violations — auto-escalation by Mnemo',    appealDays: 14 },
]

const SEVERITY_STYLE = {
  WARNING: { badge: 'bg-amber-50 text-amber-700 border-amber-200', row: '' },
  SOFT:    { badge: 'bg-orange-50 text-orange-700 border-orange-200', row: 'bg-orange-50/30' },
  HARD:    { badge: 'bg-red-50 text-red-700 border-red-200', row: 'bg-red-50/30' },
}

interface Props {
  stakeAmount: number  // USD
  gpuCount:    number
  tier:        'UNIVERSITY' | 'COMMERCIAL'
}

export function StakeRiskCalculator({ stakeAmount, gpuCount, tier }: Props) {
  const isUniversity = tier === 'UNIVERSITY'

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            Slash Risk Breakdown
            <InfoTooltip term="Slash" side="right" />
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {isUniversity
              ? `University tier — reputational stake only. No cash at risk.`
              : `${gpuCount} GPU${gpuCount !== 1 ? 's' : ''} × stake = $${stakeAmount.toFixed(0)} total at risk`
            }
          </p>
        </div>
        {!isUniversity && (
          <div className="text-right">
            <p className="text-xs text-slate-500">Your stake</p>
            <p className="text-lg font-bold text-slate-900">${stakeAmount.toFixed(0)}</p>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="px-3 py-2 text-left font-semibold text-slate-500">Condition</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-500">Severity</th>
              {!isUniversity && (
                <th className="px-3 py-2 text-right font-semibold text-slate-500">$ at risk</th>
              )}
              <th className="px-3 py-2 text-center font-semibold text-slate-500">Ejection</th>
              <th className="px-3 py-2 text-center font-semibold text-slate-500">Appeal</th>
            </tr>
          </thead>
          <tbody>
            {SLASH_TABLE.map((row, i) => {
              const style    = SEVERITY_STYLE[row.severity]
              const dollarAt = isUniversity ? null : Math.round(stakeAmount * row.pct / 100)
              return (
                <tr key={i} className={`border-b border-slate-100 last:border-0 ${style.row}`} title={row.trigger}>
                  <td className="px-3 py-2 font-medium text-slate-700">{row.condition}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full border text-[10px] font-semibold ${style.badge}`}>
                      {row.severity === 'WARNING' ? 'Warning' : row.severity === 'SOFT' ? `Soft −${row.pct}%` : `Hard −${row.pct}%`}
                    </span>
                  </td>
                  {!isUniversity && (
                    <td className="px-3 py-2 text-right font-semibold">
                      {row.pct === 0 ? (
                        <span className="text-slate-400">$0</span>
                      ) : (
                        <span className={row.severity === 'HARD' ? 'text-red-600' : 'text-orange-600'}>
                          −${dollarAt}
                        </span>
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2 text-center">
                    {row.eject ? (
                      <span className="text-red-500 font-bold">Yes</span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center text-slate-500">
                    {row.appealDays > 0 ? `${row.appealDays}d` : <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Footer note */}
      <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200">
        <p className="text-[10px] text-slate-500 leading-relaxed">
          Every slash is recorded permanently on the <strong>Obsidian immutable ledger</strong>.
          A successful appeal adds a reversal entry — the original slash record is never erased.
          {!isUniversity && ` Your appeal window starts the moment the slash is issued.`}
        </p>
      </div>
    </div>
  )
}
