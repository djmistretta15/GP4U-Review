/**
 * CUSTODES DEXTERA — Core Types
 * Identity, Authentication & Trust Passport
 *
 * Every actor in the system receives a Passport from Dextera.
 * All other Custodes pillars consume the Passport — they never
 * perform their own identity checks.
 */

// ─── Identity Levels ────────────────────────────────────────────────────────

export enum ClearanceLevel {
  UNVERIFIED = 0,     // No identity confirmed
  EMAIL_ONLY = 1,     // Email verified, no institution
  INSTITUTIONAL = 2,  // .edu SSO verified (student/faculty)
  ENTERPRISE = 3,     // KYB verified business
  ADMIN = 4,          // Platform operator
}

export enum IdentityProvider {
  EMAIL_MAGIC = 'EMAIL_MAGIC',     // Magic link / passwordless
  OIDC_EDU = 'OIDC_EDU',          // University SSO via OpenID Connect
  SAML_EDU = 'SAML_EDU',          // University SSO via SAML 2.0
  PASSKEY = 'PASSKEY',            // WebAuthn / FIDO2 passkey
  KYB = 'KYB',                    // Know Your Business (enterprise)
  API_KEY = 'API_KEY',            // Service-to-service (internal only)
}

export enum SubjectType {
  STUDENT = 'STUDENT',
  FACULTY = 'FACULTY',
  RESEARCHER = 'RESEARCHER',
  BUSINESS = 'BUSINESS',
  AGENT = 'AGENT',      // AI agent acting on behalf of a subject
  SERVICE = 'SERVICE',  // Internal service account
}

// ─── Trust Passport ──────────────────────────────────────────────────────────

/**
 * A Passport is the signed identity artifact issued by Dextera.
 * Every other Custodes pillar accepts a Passport as proof of identity.
 * Passports are short-lived and must be refreshed.
 */
export interface DexteraPassport {
  // Core identity
  passport_id: string           // Unique passport ID (UUID v4)
  subject_id: string            // Stable subject identifier (persists across sessions)
  subject_type: SubjectType
  clearance_level: ClearanceLevel

  // Institutional binding (populated for INSTITUTIONAL level)
  institution_id?: string       // e.g. "mit.edu", "stanford.edu"
  institution_name?: string
  department?: string           // e.g. "Computer Science"
  edu_affiliation?: EduAffiliation[]

  // Enterprise binding (populated for ENTERPRISE level)
  org_id?: string
  org_name?: string
  kyb_verified_at?: string      // ISO 8601

  // Trust metadata
  trust_score: number           // 0–100, computed by Dextera
  identity_provider: IdentityProvider
  mfa_verified: boolean
  device_bound: boolean         // True if passkey/hardware-bound

  // Lifecycle
  issued_at: string             // ISO 8601
  expires_at: string            // ISO 8601 (short-lived: 1–8 hours)
  refresh_token_hash: string    // Hash of refresh token (not the token itself)

  // Audit
  issued_by: string             // Dextera instance ID
  signature: string             // JWT signature over passport payload
}

// ─── Supporting Types ─────────────────────────────────────────────────────────

export enum EduAffiliation {
  STUDENT = 'student',
  FACULTY = 'faculty',
  STAFF = 'staff',
  ALUM = 'alum',
  AFFILIATE = 'affiliate',
}

export interface Subject {
  subject_id: string
  subject_type: SubjectType
  clearance_level: ClearanceLevel
  email: string
  display_name?: string
  institution_id?: string
  org_id?: string
  trust_score: number
  is_active: boolean
  is_banned: boolean
  ban_reason?: string
  ban_at?: string
  created_at: string
  updated_at: string
}

export interface Institution {
  institution_id: string        // e.g. "mit.edu"
  name: string
  sso_provider: 'OIDC' | 'SAML'
  sso_endpoint: string
  allowed_domains: string[]     // e.g. ["mit.edu", "csail.mit.edu"]
  hecvat_approved: boolean
  hecvat_approved_at?: string
  contract_expires_at?: string
  admin_contact: string
  created_at: string
}

export interface DeviceRecord {
  device_id: string
  subject_id: string
  device_fingerprint: string    // Hashed device attributes
  is_passkey_bound: boolean
  last_seen_at: string
  created_at: string
}

// ─── Auth Events ─────────────────────────────────────────────────────────────

export enum AuthEventType {
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILED = 'LOGIN_FAILED',
  LOGOUT = 'LOGOUT',
  PASSPORT_ISSUED = 'PASSPORT_ISSUED',
  PASSPORT_REFRESHED = 'PASSPORT_REFRESHED',
  PASSPORT_REVOKED = 'PASSPORT_REVOKED',
  MFA_CHALLENGED = 'MFA_CHALLENGED',
  MFA_PASSED = 'MFA_PASSED',
  MFA_FAILED = 'MFA_FAILED',
  STEP_UP_REQUIRED = 'STEP_UP_REQUIRED',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  ACCOUNT_BANNED = 'ACCOUNT_BANNED',
  INSTITUTION_SSO_RESOLVED = 'INSTITUTION_SSO_RESOLVED',
}

export interface AuthEvent {
  event_id: string
  event_type: AuthEventType
  subject_id: string
  passport_id?: string
  ip_address: string            // Hashed for privacy
  device_id?: string
  institution_id?: string
  metadata: Record<string, unknown>
  timestamp: string             // ISO 8601
}

// ─── Trust Score Input ────────────────────────────────────────────────────────

/**
 * Signals used to compute a subject's trust score (0–100).
 * Higher score = more access, lower friction.
 */
export interface TrustScoreSignals {
  subject_id: string
  identity_verified: boolean
  mfa_enabled: boolean
  device_bound: boolean
  institution_verified: boolean
  account_age_days: number
  login_consistency: number     // 0–1: consistent IP/device patterns
  no_fraud_flags: boolean
  no_abuse_flags: boolean
  job_completion_rate: number   // 0–1: from Obsidian ledger
  payment_health: number        // 0–1: from billing layer
}

// ─── API Interfaces ───────────────────────────────────────────────────────────

export interface VerifyTokenRequest {
  token: string
  expected_audience?: string
}

export interface VerifyTokenResponse {
  valid: boolean
  passport?: DexteraPassport
  error?: string
}

export interface IssuePassportRequest {
  subject_id: string
  identity_provider: IdentityProvider
  provider_claims: Record<string, unknown>  // Raw claims from IdP
  device_id?: string
  mfa_verified?: boolean
}

export interface RevokePassportRequest {
  passport_id: string
  reason: string
  revoked_by: string
}

export interface BanSubjectRequest {
  subject_id: string
  reason: string
  banned_by: string
  notify_institution?: boolean
}

export interface TrustScoreResponse {
  subject_id: string
  trust_score: number
  score_breakdown: Partial<TrustScoreSignals>
  computed_at: string
}
