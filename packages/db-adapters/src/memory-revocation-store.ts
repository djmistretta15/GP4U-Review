/**
 * @gp4u/db-adapters — In-Memory Revocation Store
 *
 * Implements custodes-dextera's RevocationStore interface.
 *
 * DEVELOPMENT: In-memory (resets on restart — fine for dev/test).
 * PRODUCTION: Swap this class for RedisRevocationStore without changing
 *             any calling code. The interface is identical.
 *
 * Bulkhead note: if this store is unavailable, DexteraPassportService.verify()
 * returns { valid: false } — the platform denies access rather than allowing
 * unverified passports through. Fail-closed is always safer.
 */

export interface RevocationStore {
  revoke(passport_id: string, reason: string): Promise<void>
  isRevoked(passport_id: string): Promise<boolean>
  revokeAllForSubject(subject_id: string): Promise<void>
}

export class MemoryRevocationStore implements RevocationStore {
  // passport_id → { reason, revoked_at }
  private revoked = new Map<string, { reason: string; revoked_at: string }>()
  // subject_id → Set<passport_id>
  private bySubject = new Map<string, Set<string>>()

  async revoke(passport_id: string, reason: string): Promise<void> {
    this.revoked.set(passport_id, { reason, revoked_at: new Date().toISOString() })
  }

  async isRevoked(passport_id: string): Promise<boolean> {
    return this.revoked.has(passport_id)
  }

  async revokeAllForSubject(subject_id: string): Promise<void> {
    const passports = this.bySubject.get(subject_id)
    if (!passports) return
    const reason = 'Subject banned — all passports revoked'
    for (const passport_id of passports) {
      this.revoked.set(passport_id, { reason, revoked_at: new Date().toISOString() })
    }
  }

  /** Call this when issuing a passport so revoke-all works correctly */
  trackPassportForSubject(subject_id: string, passport_id: string): void {
    const set = this.bySubject.get(subject_id) ?? new Set()
    set.add(passport_id)
    this.bySubject.set(subject_id, set)
  }
}
