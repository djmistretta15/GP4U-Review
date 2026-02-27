# @custodes/dextera

**Identity, Authentication & Trust Passport**

Dextera is the first gate in the Custodes stack. Every actor — student, enterprise, AI agent, or internal service — must receive a signed Passport from Dextera before any other pillar will process their request.

---

## What it does

- Issues cryptographically signed **Passports** (JWT RS256) after successful authentication
- Supports **University SSO** via OIDC and SAML 2.0 (Shibboleth, Microsoft Entra, Google Workspace)
- Computes a **Trust Score** (0–100) per subject based on identity strength, behavior, and institutional affiliation
- Manages **subject banning** and **passport revocation** with full audit trail
- Enforces **.edu domain allowlists** per institution

---

## Trust Score Bands

| Band | Score | Access |
|------|-------|--------|
| RESTRICTED | 0–30 | Sandboxed only, no real capacity |
| STANDARD | 31–60 | Normal marketplace access |
| TRUSTED | 61–80 | Higher limits, priority queue |
| HIGH_CLEARANCE | 81–100 | Institutional backbone, reserved capacity |

---

## Quick Start

```typescript
import {
  DexteraPassportService,
  DexteraOIDCHandler,
  InstitutionRegistry,
  ClearanceLevel,
  IdentityProvider,
} from '@custodes/dextera'

// 1. Initialize with your key pair and stores
const dextera = new DexteraPassportService(
  {
    private_key_pem: process.env.DEXTERA_PRIVATE_KEY!,
    public_key_pem: process.env.DEXTERA_PUBLIC_KEY!,
    issuer: 'custodes.dextera.gp4u.io',
    audience: 'gp4u.io',
    passport_ttl_seconds: 3600,
    refresh_ttl_seconds: 86400,
  },
  myRevocationStore,  // Implement RevocationStore (Redis recommended)
  mySubjectStore      // Implement SubjectStore (your DB layer)
)

// 2. After SSO callback — issue a Passport
const passport = await dextera.issue({
  subject_id: 'sub_abc123',
  identity_provider: IdentityProvider.OIDC_EDU,
  provider_claims: oidcClaims,
  mfa_verified: true,
  device_id: 'dev_xyz',
})

// passport.signature is the JWT to send to the client
// All other pillars call dextera.verify() before processing

// 3. In any other pillar — verify a Passport
const result = await dextera.verify({ token: incoming_jwt })
if (!result.valid || !result.passport) throw new Error('Unauthorized')

const { clearance_level, trust_score, subject_id } = result.passport
```

---

## University SSO Flow

```
Browser → GP4U Login Page
  → User enters .edu email
  → InstitutionRegistry.getSSOLoginUrl() → redirect to university IdP
  → University IdP authenticates → callback to /auth/callback?code=...
  → DexteraOIDCHandler.resolveSubjectFromOIDC(claims, institution_id)
  → DexteraPassportService.issue(...)
  → JWT Passport returned to client
```

---

## Environment Variables

```env
DEXTERA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
DEXTERA_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n..."
DEXTERA_ISSUER="custodes.dextera.gp4u.io"
DEXTERA_AUDIENCE="gp4u.io"
DEXTERA_PASSPORT_TTL=3600
DEXTERA_REFRESH_TTL=86400
```

---

## Integration Points

| Pillar / Chamber | How it uses Dextera |
|---|---|
| **Obsidian** | `passport.subject_id` is the audit log actor |
| **Aedituus** | `passport.clearance_level` + `passport.trust_score` gate every policy check |
| **Atlas** | `passport.institution_id` scopes resource discovery to campus nodes |
| **Tutela** | `passport.subject_id` links runtime anomalies to identity records |
| **GP4U Jobs** | Passport required before any job creation or GPU rental |
| **Mnemo** | `passport.clearance_level` determines VRAM allocation tier |

---

## Files

```
src/
├── types.ts            Core types: Passport, Subject, Institution, AuthEvent
├── trust-score.ts      Trust score computation engine (0–100)
├── passport-service.ts JWT issuance, verification, revocation, banning
├── sso-middleware.ts   OIDC/SAML claim resolution, institution registry
└── index.ts            Public export surface
```

---

## What agents building this must implement

The following interfaces need concrete implementations connected to your database:

**`RevocationStore`** — Use Redis with TTL matching passport expiry. Key: `revoked:${passport_id}`

**`SubjectStore`** — Connect to your Prisma `User` model (extended with Custodes fields). The `emitAuthEvent()` method should write to Obsidian's event bus.

**`Institution` seed data** — Load from DB on startup. Start with 2–3 pilot universities.
