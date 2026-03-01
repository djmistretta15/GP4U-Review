/**
 * Rate limiting — Upstash Redis (production) + in-memory fallback (dev/CI)
 *
 * Usage:
 *   const result = await rateLimit('register:ip:1.2.3.4', 5, 3600)
 *   if (!result.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
 *
 * Configuration:
 *   Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN to use Redis.
 *   Without those env vars, falls back silently to the in-memory implementation.
 *
 * The in-memory fallback resets on every deploy and doesn't work across
 * multiple instances — it is only suitable for single-instance dev environments.
 */

// ─── Result type ──────────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed:    boolean
  remaining:  number
  reset_at:   number  // unix ms
}

// ─── In-memory fallback ───────────────────────────────────────────────────────

const _mem_map = new Map<string, { count: number; reset_at: number }>()

function rateLimitMemory(key: string, limit: number, window_s: number): RateLimitResult {
  const now    = Date.now()
  const entry  = _mem_map.get(key)

  if (!entry || now > entry.reset_at) {
    const reset_at = now + window_s * 1000
    _mem_map.set(key, { count: 1, reset_at })
    return { allowed: true, remaining: limit - 1, reset_at }
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, reset_at: entry.reset_at }
  }

  entry.count++
  return { allowed: true, remaining: limit - entry.count, reset_at: entry.reset_at }
}

// ─── Redis implementation (Upstash) ──────────────────────────────────────────

async function rateLimitRedis(
  key:      string,
  limit:    number,
  window_s: number,
): Promise<RateLimitResult> {
  const url   = process.env.UPSTASH_REDIS_REST_URL!
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!

  // Use a sliding window via Redis INCR + EXPIRE
  const redis_key = `rl:${key}`

  const res = await fetch(`${url}/pipeline`, {
    method:  'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([
      ['INCR', redis_key],
      ['TTL',  redis_key],
    ]),
  })

  if (!res.ok) throw new Error(`Upstash error: ${res.status}`)

  const [[, count], [, ttl]] = (await res.json()) as [[string, number], [string, number]]

  // First request in this window — set expiry
  if (count === 1) {
    await fetch(`${url}/expire/${encodeURIComponent(redis_key)}/${window_s}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  }

  const reset_at  = Date.now() + (ttl > 0 ? ttl * 1000 : window_s * 1000)
  const allowed   = count <= limit
  const remaining = Math.max(0, limit - count)

  return { allowed, remaining, reset_at }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check and increment a rate-limit counter.
 *
 * @param key       Unique key (e.g., 'register:ip:1.2.3.4')
 * @param limit     Max requests per window
 * @param window_s  Window size in seconds
 */
export async function rateLimit(
  key:      string,
  limit:    number,
  window_s: number,
): Promise<RateLimitResult> {
  const has_redis =
    !!process.env.UPSTASH_REDIS_REST_URL &&
    !!process.env.UPSTASH_REDIS_REST_TOKEN

  if (has_redis) {
    try {
      return await rateLimitRedis(key, limit, window_s)
    } catch (err) {
      // Redis failure → fail open with in-memory (non-critical path)
      console.warn('[rate-limit] Redis error, falling back to in-memory:', err)
    }
  }

  return rateLimitMemory(key, limit, window_s)
}
