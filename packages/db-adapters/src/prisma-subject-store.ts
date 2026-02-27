/**
 * @gp4u/db-adapters — Prisma Subject Store
 *
 * Implements custodes-dextera's SubjectStore interface using the GP4U
 * Prisma schema. Bridges Dextera's identity model onto the existing
 * User table + new columns added in the platform migration.
 *
 * Required Prisma schema additions (migration file: add_custodes_fields):
 *
 *   model User {
 *     // existing fields...
 *     subject_type      String   @default("HUMAN")
 *     clearance_level   Int      @default(0)
 *     trust_score       Float    @default(0)
 *     is_banned         Boolean  @default(false)
 *     ban_reason        String?
 *     identity_provider String   @default("EMAIL_PASSWORD")
 *     auth_events       AuthEvent[]
 *   }
 *
 *   model AuthEvent {
 *     id           String   @id @default(cuid())
 *     event_type   String
 *     subject_id   String
 *     passport_id  String?
 *     ip_address   String?
 *     metadata     Json?
 *     timestamp    DateTime @default(now())
 *     user         User     @relation(fields: [subject_id], references: [id])
 *     @@index([subject_id])
 *   }
 */

import type { PrismaClient } from '@prisma/client'

// Mirror of Dextera's Subject type — no direct import to avoid circular deps
export interface Subject {
  subject_id: string
  subject_type: string
  email: string
  name?: string
  is_banned: boolean
  ban_reason?: string
  created_at: string
  updated_at: string
}

export interface AuthEvent {
  event_type: string
  subject_id: string
  passport_id?: string
  ip_address?: string
  metadata?: Record<string, unknown>
  timestamp: string
}

export interface SubjectStore {
  findById(subject_id: string): Promise<Subject | null>
  findByEmail(email: string): Promise<Subject | null>
  create(subject: Omit<Subject, 'created_at' | 'updated_at'>): Promise<Subject>
  updateTrustScore(subject_id: string, score: number): Promise<void>
  ban(subject_id: string, reason: string): Promise<void>
  emitAuthEvent(event: Omit<AuthEvent, 'event_id'>): Promise<void>
}

export class PrismaSubjectStore implements SubjectStore {
  constructor(private prisma: PrismaClient) {}

  async findById(subject_id: string): Promise<Subject | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: subject_id },
    })
    if (!user) return null
    return this.toSubject(user)
  }

  async findByEmail(email: string): Promise<Subject | null> {
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (!user) return null
    return this.toSubject(user)
  }

  async create(subject: Omit<Subject, 'created_at' | 'updated_at'>): Promise<Subject> {
    const user = await this.prisma.user.create({
      data: {
        id: subject.subject_id,
        email: subject.email,
        name: subject.name,
      },
    })
    return this.toSubject(user)
  }

  async updateTrustScore(subject_id: string, score: number): Promise<void> {
    // trust_score column added by migration — gracefully no-ops if column missing
    await (this.prisma.user.update as Function)({
      where: { id: subject_id },
      data: { trust_score: score },
    }).catch(() => {
      // Column not yet migrated — log and continue
      console.warn('[PrismaSubjectStore] trust_score column not yet available')
    })
  }

  async ban(subject_id: string, reason: string): Promise<void> {
    await (this.prisma.user.update as Function)({
      where: { id: subject_id },
      data: { is_banned: true, ban_reason: reason },
    }).catch(() => {
      console.warn('[PrismaSubjectStore] ban columns not yet available')
    })
  }

  async emitAuthEvent(event: Omit<AuthEvent, 'event_id'>): Promise<void> {
    // Write to AuthEvent table if it exists — silently skip if not migrated yet
    try {
      await (this.prisma as unknown as { authEvent: { create: Function } }).authEvent.create({
        data: {
          event_type: event.event_type,
          subject_id: event.subject_id,
          passport_id: event.passport_id,
          ip_address: event.ip_address,
          metadata: event.metadata ?? {},
          timestamp: new Date(event.timestamp),
        },
      })
    } catch {
      // AuthEvent table not yet migrated — events are also logged to Obsidian
    }
  }

  private toSubject(user: {
    id: string
    email: string
    name: string | null
    createdAt: Date
    updatedAt: Date
    [key: string]: unknown
  }): Subject {
    return {
      subject_id: user.id,
      subject_type: (user['subject_type'] as string) ?? 'HUMAN',
      email: user.email,
      name: user.name ?? undefined,
      is_banned: (user['is_banned'] as boolean) ?? false,
      ban_reason: (user['ban_reason'] as string) ?? undefined,
      created_at: user.createdAt.toISOString(),
      updated_at: user.updatedAt.toISOString(),
    }
  }
}
