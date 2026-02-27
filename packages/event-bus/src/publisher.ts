/**
 * @gp4u/event-bus — Publisher Helpers
 *
 * Typed publish functions for each event domain.
 * Call these from GP4U core, Custodes middleware, and Russian-Doll agent.
 *
 * Every publish auto-injects: event_id, timestamp, source.
 * Caller provides: correlation_id (from request context) + domain payload.
 */

import { v4 as uuidv4 } from 'uuid'
import { getEventBus } from './event-bus'
import type {
  JobCreatedEvent,
  JobStartedEvent,
  JobCompletedEvent,
  JobFailedEvent,
  GPUListedEvent,
  GPUStatusChangedEvent,
  GPUHealthReportedEvent,
  ArbitrageCalculatedEvent,
  MemoryStakedEvent,
  MemoryAllocatedEvent,
  RouteCalculatedEvent,
  EnergyConsumedEvent,
  AnomalyDetectedEvent,
  UserAuthenticatedEvent,
  UserRegisteredEvent,
  DataProvenanceRecordedEvent,
} from '@gp4u/types'

function base(source: string, correlation_id?: string) {
  return {
    event_id: uuidv4(),
    correlation_id: correlation_id ?? uuidv4(),
    timestamp: new Date().toISOString(),
    source,
  }
}

const bus = () => getEventBus()

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const publishUserRegistered = (
  payload: Omit<UserRegisteredEvent, 'event_id' | 'correlation_id' | 'timestamp' | 'source' | 'type'>,
  correlation_id?: string
) => bus().publish<UserRegisteredEvent>({
  ...base('custodes.dextera', correlation_id),
  type: 'auth.user_registered',
  ...payload,
})

export const publishUserAuthenticated = (
  payload: Omit<UserAuthenticatedEvent, 'event_id' | 'correlation_id' | 'timestamp' | 'source' | 'type'>,
  correlation_id?: string
) => bus().publish<UserAuthenticatedEvent>({
  ...base('custodes.dextera', correlation_id),
  type: 'auth.authenticated',
  ...payload,
})

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export const publishJobCreated = (
  payload: Omit<JobCreatedEvent, 'event_id' | 'correlation_id' | 'timestamp' | 'source' | 'type'>,
  correlation_id?: string
) => bus().publish<JobCreatedEvent>({
  ...base('gp4u.web', correlation_id),
  type: 'job.created',
  ...payload,
})

export const publishJobStarted = (
  payload: Omit<JobStartedEvent, 'event_id' | 'correlation_id' | 'timestamp' | 'source' | 'type'>,
  correlation_id?: string
) => bus().publish<JobStartedEvent>({
  ...base('custodes.atlas', correlation_id),
  type: 'job.started',
  ...payload,
})

export const publishJobCompleted = (
  payload: Omit<JobCompletedEvent, 'event_id' | 'correlation_id' | 'timestamp' | 'source' | 'type'>,
  correlation_id?: string
) => bus().publish<JobCompletedEvent>({
  ...base('gp4u.agent', correlation_id),
  type: 'job.completed',
  ...payload,
})

export const publishJobFailed = (
  payload: Omit<JobFailedEvent, 'event_id' | 'correlation_id' | 'timestamp' | 'source' | 'type'>,
  correlation_id?: string
) => bus().publish<JobFailedEvent>({
  ...base('gp4u.agent', correlation_id),
  type: 'job.failed',
  ...payload,
})

// ─── GPUs ─────────────────────────────────────────────────────────────────────

export const publishGPUListed = (
  payload: Omit<GPUListedEvent, 'event_id' | 'correlation_id' | 'timestamp' | 'source' | 'type'>,
  correlation_id?: string
) => bus().publish<GPUListedEvent>({
  ...base('custodes.atlas', correlation_id),
  type: 'gpu.listed',
  ...payload,
})

export const publishGPUStatusChanged = (
  payload: Omit<GPUStatusChangedEvent, 'event_id' | 'correlation_id' | 'timestamp' | 'source' | 'type'>,
  correlation_id?: string
) => bus().publish<GPUStatusChangedEvent>({
  ...base('custodes.atlas', correlation_id),
  type: 'gpu.status_changed',
  ...payload,
})

export const publishGPUHealthReported = (
  payload: Omit<GPUHealthReportedEvent, 'event_id' | 'correlation_id' | 'timestamp' | 'source' | 'type'>,
  correlation_id?: string
) => bus().publish<GPUHealthReportedEvent>({
  ...base('gp4u.agent', correlation_id),
  type: 'gpu.health_reported',
  ...payload,
})

// ─── Arbitrage ────────────────────────────────────────────────────────────────

export const publishArbitrageCalculated = (
  payload: Omit<ArbitrageCalculatedEvent, 'event_id' | 'correlation_id' | 'timestamp' | 'source' | 'type'>,
  correlation_id?: string
) => bus().publish<ArbitrageCalculatedEvent>({
  ...base('gp4u.web', correlation_id),
  type: 'arbitrage.calculated',
  ...payload,
})

// ─── Memory ───────────────────────────────────────────────────────────────────

export const publishMemoryStaked = (
  payload: Omit<MemoryStakedEvent, 'event_id' | 'correlation_id' | 'timestamp' | 'source' | 'type'>,
  correlation_id?: string
) => bus().publish<MemoryStakedEvent>({
  ...base('chamber.mnemo', correlation_id),
  type: 'memory.staked',
  ...payload,
})

export const publishMemoryAllocated = (
  payload: Omit<MemoryAllocatedEvent, 'event_id' | 'correlation_id' | 'timestamp' | 'source' | 'type'>,
  correlation_id?: string
) => bus().publish<MemoryAllocatedEvent>({
  ...base('chamber.mnemo', correlation_id),
  type: 'memory.allocated',
  ...payload,
})

// ─── Network ──────────────────────────────────────────────────────────────────

export const publishRouteCalculated = (
  payload: Omit<RouteCalculatedEvent, 'event_id' | 'correlation_id' | 'timestamp' | 'source' | 'type'>,
  correlation_id?: string
) => bus().publish<RouteCalculatedEvent>({
  ...base('chamber.aetherion', correlation_id),
  type: 'network.route_calculated',
  ...payload,
})

// ─── Energy ───────────────────────────────────────────────────────────────────

export const publishEnergyConsumed = (
  payload: Omit<EnergyConsumedEvent, 'event_id' | 'correlation_id' | 'timestamp' | 'source' | 'type'>,
  correlation_id?: string
) => bus().publish<EnergyConsumedEvent>({
  ...base('gp4u.agent', correlation_id),
  type: 'energy.consumed',
  ...payload,
})

// ─── Security ─────────────────────────────────────────────────────────────────

export const publishAnomalyDetected = (
  payload: Omit<AnomalyDetectedEvent, 'event_id' | 'correlation_id' | 'timestamp' | 'source' | 'type'>,
  correlation_id?: string
) => bus().publish<AnomalyDetectedEvent>({
  ...base('custodes.tutela', correlation_id),
  type: 'security.anomaly_detected',
  ...payload,
})

// ─── Provenance ───────────────────────────────────────────────────────────────

export const publishDataProvenanceRecorded = (
  payload: Omit<DataProvenanceRecordedEvent, 'event_id' | 'correlation_id' | 'timestamp' | 'source' | 'type'>,
  correlation_id?: string
) => bus().publish<DataProvenanceRecordedEvent>({
  ...base('chamber.veritas', correlation_id),
  type: 'provenance.recorded',
  ...payload,
})
