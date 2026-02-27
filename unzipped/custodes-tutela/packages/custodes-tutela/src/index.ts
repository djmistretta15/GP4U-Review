/**
 * CUSTODES TUTELA — Public API
 *
 * Import surface for all other modules:
 *   import { TutelaService, ThreatCategory, TutelaAction } from '@custodes/tutela'
 */

// Core types
export type {
  RuntimeSignals,
  DetectionRule,
  DetectionConditions,
  TutelaIncident,
  JobRiskScore,
  RiskScoreBreakdown,
  TutelaConfig,
  TutelaResponse,
  TutelaRuleStore,
  TutelaIncidentStore,
  TutelaRiskStore,
  // Response service interfaces
  TutelaObsidianSink,
  TutelaAtlasSink,
  TutelaDexteraSink,
  TutelaOrchestrationSink,
  TutelaNotificationSink,
} from './types'

export {
  ThreatCategory,
  ThreatSeverity,
  AnomalyType,
  TutelaAction,
  ComputePattern,
  IncidentStatus,
} from './types'

// Services
export { TutelaService }          from './tutela-service'
export { TutelaDetectionEngine }  from './detection-engine'
export { TutelaResponseService }  from './response-service'

// Default rules (seed data)
export { buildDefaultDetectionRules } from './default-rules'

// Detection result types
export type { DetectionResult, DetectedAnomaly } from './detection-engine'
