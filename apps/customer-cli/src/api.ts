/**
 * GP4U API Client
 *
 * Thin wrapper around axios for making authenticated requests to the
 * GP4U platform API. All requests include:
 *   Authorization: Bearer <token>
 *   X-Client: gp4u-cli/0.1.0
 *
 * Errors are surfaced as human-readable messages (not raw HTTP errors).
 */

import axios, { type AxiosInstance } from 'axios'
import { config } from './config'

function buildClient(): AxiosInstance {
  const client = axios.create({
    baseURL: config.apiUrl,
    timeout: 30_000,
    headers: {
      'X-Client': 'gp4u-cli/0.1.0',
    },
  })

  // Inject auth token on every request
  client.interceptors.request.use(req => {
    const token = config.token
    if (token) req.headers['Authorization'] = `Bearer ${token}`
    return req
  })

  // Transform error responses into readable messages
  client.interceptors.response.use(
    res => res,
    err => {
      const status  = err.response?.status
      const message = err.response?.data?.error ?? err.message
      if (status === 401) throw new Error('Not authenticated. Run: gp4u login')
      if (status === 403) throw new Error('Access denied. Check your clearance level.')
      if (status === 404) throw new Error(`Not found: ${message}`)
      throw new Error(message ?? `HTTP ${status}`)
    }
  )

  return client
}

export const api = {
  // ─── Auth ──────────────────────────────────────────────────────────────────

  async login(email: string, password: string) {
    const client = buildClient()
    const res = await client.post('/api/auth/login', { email, password })
    return res.data as { token: string; subject_id: string; email: string }
  },

  async register(email: string, password: string, name: string) {
    const client = buildClient()
    const res = await client.post('/api/auth/register', { email, password, name })
    return res.data as { token: string; subject_id: string }
  },

  // ─── GPUs ──────────────────────────────────────────────────────────────────

  async listGpus(filters?: { region?: string; min_vram?: number; max_price?: number }) {
    const client = buildClient()
    const res = await client.get('/api/gpus', { params: filters })
    return res.data as { gpus: GPU[] }
  },

  // ─── Arbitrage ─────────────────────────────────────────────────────────────

  async getArbitrage() {
    const client = buildClient()
    const res = await client.post('/api/arbitrage')
    return res.data as { table: ArbitrageEntry[]; best: ArbitrageEntry; potential_savings_usd: number }
  },

  // ─── Jobs ──────────────────────────────────────────────────────────────────

  async listJobs() {
    const client = buildClient()
    const res = await client.get('/api/jobs')
    return res.data as { jobs: Job[] }
  },

  async submitJob(payload: SubmitJobPayload) {
    const client = buildClient()
    const res = await client.post('/api/jobs', payload)
    return res.data as { job: Job }
  },

  async getJob(id: string) {
    const client = buildClient()
    const res = await client.get(`/api/jobs/${id}`)
    return res.data as { job: Job }
  },

  // ─── Memory Staking ────────────────────────────────────────────────────────

  async listStakes() {
    const client = buildClient()
    const res = await client.get('/api/memory')
    return res.data as { stakes: Stake[]; summary: StakeSummary }
  },

  // ─── Clusters ──────────────────────────────────────────────────────────────

  async listClusters() {
    const client = buildClient()
    const res = await client.get('/api/clusters')
    return res.data as { clusters: Cluster[]; pools: Pool[] }
  },

  // ─── Health ────────────────────────────────────────────────────────────────

  async health() {
    const client = buildClient()
    const res = await client.get('/api/health')
    return res.data as HealthResponse
  },
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GPU {
  id:           string
  name:         string
  provider:     string
  region:       string
  vramGB:       number
  pricePerHour: number
  status:       string
}

export interface ArbitrageEntry {
  provider:   string
  gpu:        string
  region:     string
  price_usd:  number
  availability_pct: number
}

export interface Job {
  id:                    string
  name:                  string
  status:                string
  gpu:                   { name: string; provider: string; region: string }
  costEstimate:          number
  expectedDurationHours: number
  createdAt:             string
}

export interface SubmitJobPayload {
  gpu_id:              string
  name:                string
  workload_type:       string
  expected_duration_h: number
  docker_image?:       string
  command?:            string[]
  env?:                Record<string, string>
}

export interface Stake {
  id:             string
  vram_gb:        number
  ram_gb:         number
  is_active:      boolean
  total_earned_usd: string
  allocation_count: number
  gpu:            { name: string; provider: string; region: string }
}

export interface StakeSummary {
  active_count:     number
  total_vram_gb:    number
  total_earned_usd: number
}

export interface Cluster {
  cluster_id: string
  name:       string
  gpu_count:  number
  status:     string
  total_cost: number
  gpu_type:   string
  region:     string
}

export interface Pool {
  gpu_type:         string
  provider:         string
  region:           string
  available_count:  number
  price_per_gpu_hr: number
  vram_gb:          number
}

export interface HealthResponse {
  status:   string
  bus:      { events_delivered: number; events_dropped: number }
  chambers: Array<{ chamber_id: string; mode: string; events_received: number }>
}
