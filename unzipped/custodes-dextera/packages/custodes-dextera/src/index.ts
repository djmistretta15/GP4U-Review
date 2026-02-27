/**
 * CUSTODES DEXTERA — Public API
 *
 * This is the only import surface other modules should use:
 *   import { DexteraPassportService, ClearanceLevel, ... } from '@custodes/dextera'
 *
 * Never import from internal files directly.
 */

// Core types
export type {
  DexteraPassport,
  Subject,
  Institution,
  DeviceRecord,
  AuthEvent,
  TrustScoreSignals,
  TrustScoreResponse,
  VerifyTokenRequest,
  VerifyTokenResponse,
  IssuePassportRequest,
  RevokePassportRequest,
  BanSubjectRequest,
  RevocationStore,
  SubjectStore,
  DexteraConfig,
} from './types'

export {
  ClearanceLevel,
  IdentityProvider,
  SubjectType,
  EduAffiliation,
  AuthEventType,
} from './types'

// Passport service
export { DexteraPassportService } from './passport-service'

// SSO
export {
  DexteraOIDCHandler,
  InstitutionRegistry,
  isEduEmail,
  extractDomain,
  isAllowedDomain,
} from './sso-middleware'

// Trust scoring
export {
  computeTrustScore,
  getTrustBand,
  meetsMinimumTrust,
  TRUST_BANDS,
} from './trust-score'

export type { TrustBand } from './trust-score'
