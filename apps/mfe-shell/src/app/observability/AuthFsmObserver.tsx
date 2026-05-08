import React, { useEffect, useRef } from 'react';
import {
  getMetricsSnapshot,
  recordTransportReady,
  subscribeMetrics,
  type MetricsSnapshot,
} from '@mfe/shared-http';
import { useAppSelector } from '../store/store.hooks';
import {
  selectAuthEpoch,
  selectAuthPhase,
  type AuthPhase,
} from '../../features/auth/model/auth.slice';
import telemetryClient from '../telemetry/telemetry-client';

const PERIODIC_SNAPSHOT_INTERVAL_MS = 60_000;

/**
 * Phase 2 PR-Obs-5: invisible React component that bridges the auth
 * FSM to the structured-log + telemetry pipeline.
 *
 * <p>Three responsibilities:
 * <ol>
 *   <li>Phase-change events: every transition emits a low-cardinality
 *       telemetry event with {@code from}/{@code to}/{@code authEpoch}.
 *       Used by ops to count transitions and detect stuck FSMs.</li>
 *   <li>Time-to-transportReady gauge: when the FSM reaches
 *       {@code transportReady}, records the elapsed time since the
 *       current auth epoch began. Dedup'd by {@code recordedEpochRef}
 *       so StrictMode double-mount or Redux re-renders never inflate
 *       the metric (Codex iter-1 P1 acceptance criterion).</li>
 *   <li>Periodic metric snapshot emission: once per minute, sends the
 *       current observability snapshot to the telemetry endpoint
 *       (PII-free counters; no URLs, headers, or tokens).</li>
 * </ol>
 *
 * <p>Mounted by {@code AppProviders} alongside other side-effect-only
 * components ({@code DownloadProgressListener}). Returns {@code null}
 * — invisible by design.
 */
export const AuthFsmObserver: React.FC = () => {
  const phase = useAppSelector(selectAuthPhase);
  const authEpoch = useAppSelector(selectAuthEpoch);

  const prevPhaseRef = useRef<AuthPhase | null>(null);
  const epochStartRef = useRef<number>(Date.now());
  const recordedEpochRef = useRef<number | null>(null);
  const lastEpochRef = useRef<number>(authEpoch);

  // Phase-change telemetry. Fires on every transition (including the
  // very first phase observed, since prevPhaseRef starts null).
  useEffect(() => {
    const prev = prevPhaseRef.current;
    if (prev !== null && prev !== phase) {
      telemetryClient.emit({
        type: 'auth_fsm_phase_change',
        payload: {
          from: prev,
          to: phase,
          authEpoch,
        },
        timestamp: Date.now(),
      });
    }
    prevPhaseRef.current = phase;
  }, [phase, authEpoch]);

  // Reset epoch start on bumpAuthEpoch (logout / re-login). Without
  // this, time-to-transportReady would measure from the original page
  // load even after a re-login cycle.
  useEffect(() => {
    if (lastEpochRef.current !== authEpoch) {
      lastEpochRef.current = authEpoch;
      epochStartRef.current = Date.now();
      recordedEpochRef.current = null;
    }
  }, [authEpoch]);

  // Time-to-transportReady gauge — single observation per epoch.
  useEffect(() => {
    if (phase !== 'transportReady') {
      return;
    }
    if (recordedEpochRef.current === authEpoch) {
      return;
    }
    recordedEpochRef.current = authEpoch;
    const durationMs = Date.now() - epochStartRef.current;
    recordTransportReady(durationMs);
    telemetryClient.emit({
      type: 'auth_transport_ready',
      payload: {
        durationMs,
        authEpoch,
      },
      timestamp: Date.now(),
    });
  }, [phase, authEpoch]);

  // Periodic snapshot emit (1/min). PII-free counter map.
  useEffect(() => {
    const handle = setInterval(() => {
      const snap: MetricsSnapshot = getMetricsSnapshot();
      telemetryClient.emit({
        type: 'auth_transport_metric_snapshot',
        payload: {
          requestTotal: snap.requestTotal,
          authNotReadyTotal: snap.authNotReadyTotal,
          refreshAttemptTotal: snap.refreshAttemptTotal,
          refreshWaiterTotal: snap.refreshWaiterTotal,
          recentRefreshFailureCount: snap.recentRefreshFailures.length,
          transportReadyDurationMs: snap.transportReadyDurationMs,
        },
        timestamp: Date.now(),
      });
    }, PERIODIC_SNAPSHOT_INTERVAL_MS);
    return () => clearInterval(handle);
  }, []);

  // Subscribe is a no-op here (the periodic snapshot drives emission);
  // we keep the import to make the pattern discoverable for future
  // consumers (degraded banner uses it). The empty subscribe ensures
  // the observability module stays warm.
  useEffect(() => {
    const unsubscribe = subscribeMetrics(() => undefined);
    return unsubscribe;
  }, []);

  return null;
};
