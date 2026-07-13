/**
 * Faz 22.6 — VIEW_ONLY operator screen-observation viewer (web-MFE path).
 *
 * Domain types for the live screen-observation viewer. This surface is the
 * operator-facing tap over the backend slice-1 (#770) VIEW_ONLY broker
 * fan-out: it RENDERS frames and never forwards input. Recording is OFF
 * (ADR-0044) — the data plane relays live `image/png` frames latest-wins
 * and never persists them. The whole feature is disabled-by-default and
 * gated on owner/security acceptance (hash-chain audit slice, gateway route,
 * KVKK DPIA, named 1-person roster) before any live pilot.
 */

/** Lifecycle of the viewer's SSE connection (drives the status banner). */
export type RemoteViewStatus =
  | 'connecting' // request issued, awaiting the response head
  | 'live' // streaming frames
  | 'closed' // session ended / stopped / disconnected cleanly
  | 'error' // transport or non-auth HTTP failure
  | 'forbidden' // 401/403 — not authenticated / not the owning operator
  | 'busy'; // 409 — another operator already holds the 1:1 viewer slot

/**
 * The one-shot session metadata the backend emits before frames. These are
 * invariants of the pilot (always recording-OFF, always attended, always
 * VIEW_ONLY) but are surfaced from the stream so the banner reflects the
 * authoritative server state rather than a hardcoded client assumption.
 */
export interface RemoteViewMeta {
  recording: boolean;
  attended: boolean;
  capability: string;
  /** Opaque, server-generated id that binds render telemetry to this live subscription. */
  viewerId: string;
}

/** One relayed screen frame (base64 image payload, latest-wins upstream). */
export interface RemoteViewFrame {
  seq: number;
  contentType: string;
  /** Broker receipt time; authority for end-to-end frame age. */
  observedAtEpochMillis: number;
  /** Time the backend handed the frame to the authenticated SSE response. */
  sentAtEpochMillis: number;
  dataB64: string;
}

/** A frame whose payload is a safe `image/*` type we will render as a data URL. */
export function isRenderableFrame(frame: RemoteViewFrame): boolean {
  return /^image\/(png|jpeg|webp)$/.test(frame.contentType);
}
