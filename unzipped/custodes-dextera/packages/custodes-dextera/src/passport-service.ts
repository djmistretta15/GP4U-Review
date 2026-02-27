/**
 * CUSTODES DEXTERA — Passport Service
 *
 * Issues, verifies, and revokes cryptographically signed Passports.
 * Uses JWT (jose library) with RS256 signing.
 *
 * Usage by other Custodes pillars:
 *   import { DexteraPassportService } from '@custodes/dextera'
 *   const passport = await DexteraPassportService.verify(token)
 *   // passport.clearance_level, passport.trust_score, etc.
 */

import { SignJWT, jwtVerify, importPKCS8, importSPKI, type JWTPayload } from 'jose'
import { v4 as uuidv4 } from 'uuid'
import {
  DexteraPassport,
  Subject,
  SubjectType,
  ClearanceLevel,
  IdentityProvider,
  IssuePassportRequest,
  VerifyTokenRequest,
  VerifyTokenResponse,
  RevokePassportRequest,
  BanSubjectRequest,
  AuthEvent,
  AuthEventType,
  EduAffiliation,
} from './types'
import { computeTrustScore, TrustScoreSignals } from './trust-score'

// ─── Configuration ────────────────────────────────────────────────────────────

export interface DexteraConfig {
  private_key_pem: string        // RS256 private key (PEM)
  public_key_pem: string         // RS256 public key (PEM)
  issuer: string                 // e.g. "custodes.dextera.gp4u.io"
  audience: string               // e.g. "gp4u.io"
  passport_ttl_seconds: number   // Default: 3600 (1 hour)
  refresh_ttl_seconds: number    // Default: 86400 (24 hours)
}

// ─── Revocation Store (interface — implement with Redis/DB in production) ────

export interface RevocationStore {
  revoke(passport_id: string, reason: string): Promise<void>
  isRevoked(passport_id: string): Promise<boolean>
  revokeAllForSubject(subject_id: string): Promise<void>
}

// ─── Subject Store (interface — implement with your DB layer) ────────────────

export interface SubjectStore {
  findById(subject_id: string): Promise<Subject | null>
  findByEmail(email: string): Promise<Subject | null>
  create(subject: Omit<Subject, 'created_at' | 'updated_at'>): Promise<Subject>
  updateTrustScore(subject_id: string, score: number): Promise<void>
  ban(subject_id: string, reason: string): Promise<void>
  emitAuthEvent(event: Omit<AuthEvent, 'event_id'>): Promise<void>
}

// ─── Passport Service ─────────────────────────────────────────────────────────

export class DexteraPassportService {
  private config: DexteraConfig
  private revocationStore: RevocationStore
  private subjectStore: SubjectStore

  constructor(
    config: DexteraConfig,
    revocationStore: RevocationStore,
    subjectStore: SubjectStore
  ) {
    this.config = config
    this.revocationStore = revocationStore
    this.subjectStore = subjectStore
  }

  /**
   * Issue a signed Passport for a verified subject.
   * Called after successful SSO/auth flow.
   */
  async issue(request: IssuePassportRequest): Promise<DexteraPassport> {
    const subject = await this.subjectStore.findById(request.subject_id)
    if (!subject) throw new Error(`Subject not found: ${request.subject_id}`)
    if (subject.is_banned) throw new Error(`Subject is banned: ${subject.ban_reason}`)

    const passport_id = uuidv4()
    const now = new Date()
    const expires = new Date(now.getTime() + this.config.passport_ttl_seconds * 1000)

    // Resolve clearance level from identity provider + subject type
    const clearance_level = this.resolveClearanceLevel(
      subject,
      request.identity_provider
    )

    // Extract institutional claims if SSO
    const institutional = this.extractInstitutionalClaims(
      request.identity_provider,
      request.provider_claims
    )

    // Build trust score signals
    const signals: TrustScoreSignals = {
      subject_id: subject.subject_id,
      identity_verified: true,
      mfa_enabled: request.mfa_verified ?? false,
      device_bound: !!request.device_id,
      institution_verified: clearance_level >= ClearanceLevel.INSTITUTIONAL,
      account_age_days: Math.floor(
        (now.getTime() - new Date(subject.created_at).getTime()) / 86400000
      ),
      login_consistency: 0.8, // TODO: compute from AuthEvent history
      no_fraud_flags: true,    // TODO: query Tutela
      no_abuse_flags: true,    // TODO: query Tutela
      job_completion_rate: 1.0, // TODO: query Obsidian
      payment_health: 1.0,      // TODO: query billing
    }

    const { trust_score } = computeTrustScore(signals)
    await this.subjectStore.updateTrustScore(subject.subject_id, trust_score)

    // Build passport payload
    const passport: DexteraPassport = {
      passport_id,
      subject_id: subject.subject_id,
      subject_type: subject.subject_type,
      clearance_level,
      trust_score,
      identity_provider: request.identity_provider,
      mfa_verified: request.mfa_verified ?? false,
      device_bound: !!request.device_id,
      issued_at: now.toISOString(),
      expires_at: expires.toISOString(),
      refresh_token_hash: '', // populated below
      issued_by: this.config.issuer,
      signature: '', // populated below after JWT signing
      ...institutional,
    }

    // Sign as JWT
    const private_key = await importPKCS8(this.config.private_key_pem, 'RS256')
    const token = await new SignJWT(passport as unknown as JWTPayload)
      .setProtectedHeader({ alg: 'RS256' })
      .setJti(passport_id)
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .setIssuedAt(Math.floor(now.getTime() / 1000))
      .setExpirationTime(Math.floor(expires.getTime() / 1000))
      .sign(private_key)

    passport.signature = token

    // Emit audit event
    await this.subjectStore.emitAuthEvent({
      event_type: AuthEventType.PASSPORT_ISSUED,
      subject_id: subject.subject_id,
      passport_id,
      ip_address: 'unknown', // caller should pass this
      metadata: {
        identity_provider: request.identity_provider,
        clearance_level,
        trust_score,
      },
      timestamp: now.toISOString(),
    })

    return passport
  }

  /**
   * Verify a Passport token.
   * Called by all other Custodes pillars before processing any request.
   */
  async verify(request: VerifyTokenRequest): Promise<VerifyTokenResponse> {
    try {
      const public_key = await importSPKI(this.config.public_key_pem, 'RS256')

      const { payload } = await jwtVerify(request.token, public_key, {
        issuer: this.config.issuer,
        audience: request.expected_audience ?? this.config.audience,
      })

      const passport = payload as unknown as DexteraPassport

      // Check revocation
      const is_revoked = await this.revocationStore.isRevoked(passport.passport_id)
      if (is_revoked) {
        return { valid: false, error: 'Passport has been revoked' }
      }

      // Check subject ban status
      const subject = await this.subjectStore.findById(passport.subject_id)
      if (!subject || subject.is_banned) {
        return { valid: false, error: 'Subject is banned or not found' }
      }

      return { valid: true, passport }
    } catch (err) {
      return {
        valid: false,
        error: err instanceof Error ? err.message : 'Invalid token',
      }
    }
  }

  /**
   * Revoke a specific Passport immediately.
   * Used for logout, suspicious activity, admin action.
   */
  async revoke(request: RevokePassportRequest): Promise<void> {
    await this.revocationStore.revoke(request.passport_id, request.reason)
    await this.subjectStore.emitAuthEvent({
      event_type: AuthEventType.PASSPORT_REVOKED,
      subject_id: request.revoked_by,
      passport_id: request.passport_id,
      ip_address: 'system',
      metadata: { reason: request.reason },
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Ban a subject — revokes all passports and blocks future issuance.
   * Optionally notifies their institution (for university policy enforcement).
   */
  async ban(request: BanSubjectRequest): Promise<void> {
    await this.revocationStore.revokeAllForSubject(request.subject_id)
    await this.subjectStore.ban(request.subject_id, request.reason)
    await this.subjectStore.emitAuthEvent({
      event_type: AuthEventType.ACCOUNT_BANNED,
      subject_id: request.subject_id,
      ip_address: 'system',
      metadata: {
        reason: request.reason,
        banned_by: request.banned_by,
        notify_institution: request.notify_institution,
      },
      timestamp: new Date().toISOString(),
    })
    // TODO: if notify_institution, emit event to institutional webhook
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private resolveClearanceLevel(
    subject: Subject,
    provider: IdentityProvider
  ): ClearanceLevel {
    if (provider === IdentityProvider.KYB) return ClearanceLevel.ENTERPRISE
    if (provider === IdentityProvider.OIDC_EDU || provider === IdentityProvider.SAML_EDU) {
      return ClearanceLevel.INSTITUTIONAL
    }
    if (provider === IdentityProvider.API_KEY) return ClearanceLevel.ADMIN
    return ClearanceLevel.EMAIL_ONLY
  }

  private extractInstitutionalClaims(
    provider: IdentityProvider,
    claims: Record<string, unknown>
  ): Partial<DexteraPassport> {
    if (
      provider !== IdentityProvider.OIDC_EDU &&
      provider !== IdentityProvider.SAML_EDU
    ) {
      return {}
    }

    return {
      institution_id: claims['hd'] as string
        ?? claims['schacHomeOrganization'] as string
        ?? undefined,
      institution_name: claims['institution_name'] as string ?? undefined,
      department: claims['department'] as string ?? undefined,
      edu_affiliation: this.parseEduAffiliation(
        claims['eduPersonAffiliation'] as string | string[] | undefined
      ),
    }
  }

  private parseEduAffiliation(
    raw: string | string[] | undefined
  ): EduAffiliation[] {
    if (!raw) return []
    const values = Array.isArray(raw) ? raw : [raw]
    return values.filter(
      (v): v is EduAffiliation => Object.values(EduAffiliation).includes(v as EduAffiliation)
    )
  }
}
