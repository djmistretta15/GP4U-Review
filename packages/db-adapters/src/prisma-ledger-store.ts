/**
 * @gp4u/db-adapters — Prisma Ledger Store
 *
 * Implements custodes-obsidian's LedgerStore interface using Prisma.
 *
 * Required Prisma schema additions (migration: add_obsidian_ledger):
 *
 *   model LedgerEntry {
 *     id             String   @id @default(cuid())
 *     entry_id       String   @unique
 *     block_index    Int      @unique
 *     event_type     String
 *     severity       String
 *     subject_id     String?
 *     passport_id    String?
 *     institution_id String?
 *     target_id      String?
 *     target_type    String?
 *     metadata       Json?
 *     ip_address_hash String?
 *     region         String?
 *     timestamp      DateTime
 *     sequence       Int
 *     prev_hash      String
 *     payload_hash   String
 *     block_hash     String
 *     merkle_root    String?
 *     created_at     DateTime @default(now())
 *     @@index([event_type])
 *     @@index([subject_id])
 *     @@index([target_id])
 *     @@index([block_index])
 *   }
 *
 *   model MerkleBlock {
 *     id           String   @id @default(cuid())
 *     block_number Int      @unique
 *     merkle_root  String
 *     entry_count  Int
 *     first_index  Int
 *     last_index   Int
 *     sealed_at    DateTime
 *     signature    String
 *     sealed_by    String
 *   }
 *
 *   model Dispute {
 *     id                 String   @id @default(cuid())
 *     dispute_id         String   @unique
 *     job_id             String
 *     opened_by          String
 *     against            String
 *     reason             String
 *     status             String   @default("OPEN")
 *     outcome            String?
 *     resolved_by        String?
 *     resolution_notes   String?
 *     refund_amount      Decimal? @db.Decimal(10,2)
 *     evidence_entry_ids Json
 *     opened_at          DateTime @default(now())
 *     resolved_at        DateTime?
 *     @@index([job_id])
 *     @@index([status])
 *   }
 */

import type { PrismaClient } from '@prisma/client'

// Minimal shape types — mirrors Obsidian's types without direct import
export interface LedgerEntryRecord {
  entry_id: string
  block_index: number
  event_type: string
  severity: string
  subject_id?: string
  passport_id?: string
  institution_id?: string
  target_id?: string
  target_type?: string
  metadata?: Record<string, unknown>
  ip_address_hash?: string
  region?: string
  timestamp: string
  sequence: number
  prev_hash: string
  payload_hash: string
  block_hash: string
  merkle_root?: string
}

export interface LedgerQuery {
  subject_id?: string
  target_id?: string
  event_type?: string
  from_timestamp?: string
  to_timestamp?: string
  limit?: number
  offset?: number
}

export class PrismaLedgerStore {
  constructor(private prisma: PrismaClient) {}

  async append(entry: LedgerEntryRecord): Promise<void> {
    const db = this.prisma as unknown as { ledgerEntry: { create: Function } }
    await db.ledgerEntry.create({
      data: {
        entry_id: entry.entry_id,
        block_index: entry.block_index,
        event_type: entry.event_type,
        severity: entry.severity,
        subject_id: entry.subject_id,
        passport_id: entry.passport_id,
        institution_id: entry.institution_id,
        target_id: entry.target_id,
        target_type: entry.target_type,
        metadata: entry.metadata ?? {},
        ip_address_hash: entry.ip_address_hash,
        region: entry.region,
        timestamp: new Date(entry.timestamp),
        sequence: entry.sequence,
        prev_hash: entry.prev_hash,
        payload_hash: entry.payload_hash,
        block_hash: entry.block_hash,
        merkle_root: entry.merkle_root,
      },
    })
  }

  async getByIndex(block_index: number): Promise<LedgerEntryRecord | null> {
    const db = this.prisma as unknown as { ledgerEntry: { findUnique: Function } }
    const row = await db.ledgerEntry.findUnique({ where: { block_index } })
    return row ? this.toRecord(row) : null
  }

  async getLatestIndex(): Promise<number> {
    const db = this.prisma as unknown as {
      ledgerEntry: { findFirst: Function }
    }
    const row = await db.ledgerEntry.findFirst({
      orderBy: { block_index: 'desc' },
    })
    return row?.block_index ?? -1
  }

  async getLatestHash(): Promise<string> {
    const db = this.prisma as unknown as {
      ledgerEntry: { findFirst: Function }
    }
    const row = await db.ledgerEntry.findFirst({
      orderBy: { block_index: 'desc' },
      select: { block_hash: true },
    })
    return row?.block_hash ?? ''
  }

  async query(query: LedgerQuery): Promise<{ entries: LedgerEntryRecord[]; total: number }> {
    const db = this.prisma as unknown as {
      ledgerEntry: { findMany: Function; count: Function }
    }

    const where: Record<string, unknown> = {}
    if (query.subject_id) where['subject_id'] = query.subject_id
    if (query.target_id) where['target_id'] = query.target_id
    if (query.event_type) where['event_type'] = query.event_type
    if (query.from_timestamp || query.to_timestamp) {
      where['timestamp'] = {
        ...(query.from_timestamp ? { gte: new Date(query.from_timestamp) } : {}),
        ...(query.to_timestamp ? { lte: new Date(query.to_timestamp) } : {}),
      }
    }

    const [rows, total] = await Promise.all([
      db.ledgerEntry.findMany({
        where,
        orderBy: { block_index: 'asc' },
        take: query.limit ?? 100,
        skip: query.offset ?? 0,
      }),
      db.ledgerEntry.count({ where }),
    ])

    return { entries: rows.map((r: Record<string, unknown>) => this.toRecord(r)), total }
  }

  private toRecord(row: Record<string, unknown>): LedgerEntryRecord {
    return {
      entry_id: row['entry_id'] as string,
      block_index: row['block_index'] as number,
      event_type: row['event_type'] as string,
      severity: row['severity'] as string,
      subject_id: row['subject_id'] as string | undefined,
      passport_id: row['passport_id'] as string | undefined,
      institution_id: row['institution_id'] as string | undefined,
      target_id: row['target_id'] as string | undefined,
      target_type: row['target_type'] as string | undefined,
      metadata: row['metadata'] as Record<string, unknown> | undefined,
      ip_address_hash: row['ip_address_hash'] as string | undefined,
      region: row['region'] as string | undefined,
      timestamp: (row['timestamp'] as Date).toISOString(),
      sequence: row['sequence'] as number,
      prev_hash: row['prev_hash'] as string,
      payload_hash: row['payload_hash'] as string,
      block_hash: row['block_hash'] as string,
      merkle_root: row['merkle_root'] as string | undefined,
    }
  }
}
