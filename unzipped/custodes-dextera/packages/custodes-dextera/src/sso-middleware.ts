/**
 * CUSTODES DEXTERA — SSO Middleware
 *
 * Handles the university OIDC/SAML callback flow and converts
 * provider claims into a GP4U Subject + Passport.
 *
 * Supports:
 *   - OIDC (most modern universities: Shibboleth + OIDC, Microsoft Entra)
 *   - SAML 2.0 (legacy universities)
 *   - .edu domain allowlist enforcement
 */

import { v4 as uuidv4 } from 'uuid'
import {
  Subject,
  SubjectType,
  ClearanceLevel,
  IdentityProvider,
  EduAffiliation,
  Institution,
} from './types'

// ─── OIDC Claims (standard eduPerson + Google/Microsoft extensions) ──────────

export interface OIDCClaims {
  sub: string                           // Provider subject ID
  email: string
  email_verified?: boolean
  name?: string
  given_name?: string
  family_name?: string
  // EDU-specific
  hd?: string                           // Google Workspace: hosted domain
  eduPersonAffiliation?: string | string[]
  eduPersonPrimaryAffiliation?: string
  eduPersonScopedAffiliation?: string | string[]
  schacHomeOrganization?: string        // SAML → OIDC bridge
  department?: string
  // Microsoft Entra (Azure AD)
  'extension_Department'?: string
  tid?: string                          // Tenant ID
}

// ─── OIDC Handler ────────────────────────────────────────────────────────────

export class DexteraOIDCHandler {
  private institutions: Map<string, Institution>

  constructor(institutions: Institution[]) {
    this.institutions = new Map(
      institutions.map(i => [i.institution_id, i])
    )
  }

  /**
   * Validate OIDC claims and return a resolved Subject.
   * Called after the IdP redirects back with claims.
   */
  resolveSubjectFromOIDC(
    claims: OIDCClaims,
    institution_id: string
  ): Omit<Subject, 'created_at' | 'updated_at'> {
    const institution = this.institutions.get(institution_id)
    if (!institution) throw new Error(`Unknown institution: ${institution_id}`)

    // Enforce .edu domain allowlist
    const email_domain = claims.email.split('@')[1]?.toLowerCase()
    if (!institution.allowed_domains.some(d => email_domain?.endsWith(d))) {
      throw new Error(
        `Email domain ${email_domain} not allowed for institution ${institution_id}`
      )
    }

    const affiliation = this.resolveAffiliation(claims)
    const subject_type = this.affiliationToSubjectType(affiliation)

    return {
      subject_id: uuidv4(),
      subject_type,
      clearance_level: ClearanceLevel.INSTITUTIONAL,
      email: claims.email.toLowerCase(),
      display_name: claims.name ?? `${claims.given_name ?? ''} ${claims.family_name ?? ''}`.trim(),
      institution_id,
      trust_score: 60, // Initial score — will be recomputed by PassportService
      is_active: true,
      is_banned: false,
    }
  }

  /**
   * Build the provider_claims object to pass to PassportService.issue()
   */
  buildProviderClaims(
    claims: OIDCClaims,
    institution: Institution
  ): Record<string, unknown> {
    return {
      hd: claims.hd ?? institution.institution_id,
      schacHomeOrganization: claims.schacHomeOrganization ?? institution.institution_id,
      institution_name: institution.name,
      department: claims.department ?? claims['extension_Department'],
      eduPersonAffiliation: claims.eduPersonAffiliation,
      provider_sub: claims.sub,
    }
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private resolveAffiliation(claims: OIDCClaims): EduAffiliation {
    const primary = claims.eduPersonPrimaryAffiliation
      ?? (Array.isArray(claims.eduPersonAffiliation)
        ? claims.eduPersonAffiliation[0]
        : claims.eduPersonAffiliation)

    const map: Record<string, EduAffiliation> = {
      student:   EduAffiliation.STUDENT,
      faculty:   EduAffiliation.FACULTY,
      staff:     EduAffiliation.STAFF,
      alum:      EduAffiliation.ALUM,
      affiliate: EduAffiliation.AFFILIATE,
    }

    return map[primary?.toLowerCase() ?? ''] ?? EduAffiliation.AFFILIATE
  }

  private affiliationToSubjectType(affiliation: EduAffiliation): SubjectType {
    switch (affiliation) {
      case EduAffiliation.STUDENT:  return SubjectType.STUDENT
      case EduAffiliation.FACULTY:  return SubjectType.FACULTY
      case EduAffiliation.STAFF:    return SubjectType.FACULTY
      default:                       return SubjectType.RESEARCHER
    }
  }
}

// ─── Institution Registry ─────────────────────────────────────────────────────

/**
 * In-memory institution registry (seed from DB on startup).
 * Provides domain → institution lookups for SSO routing.
 */
export class InstitutionRegistry {
  private byDomain: Map<string, Institution> = new Map()
  private byId: Map<string, Institution> = new Map()

  load(institutions: Institution[]): void {
    for (const inst of institutions) {
      this.byId.set(inst.institution_id, inst)
      for (const domain of inst.allowed_domains) {
        this.byDomain.set(domain, inst)
      }
    }
  }

  findByDomain(domain: string): Institution | undefined {
    // Try exact match first, then suffix match
    return this.byDomain.get(domain)
      ?? [...this.byDomain.entries()]
         .find(([d]) => domain.endsWith(d))?.[1]
  }

  findById(id: string): Institution | undefined {
    return this.byId.get(id)
  }

  getAll(): Institution[] {
    return [...this.byId.values()]
  }

  /**
   * Determine which identity provider to use for a given email.
   * Returns the SSO login URL to redirect to.
   */
  getSSOLoginUrl(email: string, return_url: string): string | null {
    const domain = email.split('@')[1]?.toLowerCase()
    if (!domain) return null

    const inst = this.findByDomain(domain)
    if (!inst) return null

    const encoded_return = encodeURIComponent(return_url)
    return `${inst.sso_endpoint}?redirect_uri=${encoded_return}&institution=${inst.institution_id}`
  }
}

// ─── .edu Email Validator ─────────────────────────────────────────────────────

export function isEduEmail(email: string): boolean {
  return email.toLowerCase().endsWith('.edu')
}

export function extractDomain(email: string): string {
  return email.split('@')[1]?.toLowerCase() ?? ''
}

export function isAllowedDomain(email: string, allowed_domains: string[]): boolean {
  const domain = extractDomain(email)
  return allowed_domains.some(d => domain === d || domain.endsWith(`.${d}`))
}
