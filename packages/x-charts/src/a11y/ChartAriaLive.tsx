/**
 * ChartAriaLive — Aria-live region for chart update announcements
 *
 * Announces chart data changes to screen readers via aria-live polite region.
 * Debounces rapid updates to avoid overwhelming assistive technology.
 *
 * Faz 21.11 PR-A2b-a11y — also accepts an `anomalies` prop carrying
 * `AnomalySummary[]` (PR-A2b-ui detector). When the anomaly stream
 * changes the component fires a SECOND debounced announcement
 * summarising the new outliers ("3 outliers detected, 2 above
 * expected range and 1 below. Most extreme: x=Apr, y=129."). Anomaly
 * announcements deduplicate by signature so the same set of
 * outliers re-rendered between data ticks does NOT spam the SR.
 *
 * @see chart-viz-engine-selection D-009 (a11y)
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AnomalySummary } from '../annotations/computeAnomalyOverlay';

/**
 * Localised announcement text builder. Defaults to a tiny
 * English/Turkish formatter that picks the language from the
 * (single optional) `locale` arg. Consumers can override entirely
 * via `formatAnomalyAnnouncement` for full ICU control.
 */
export type AnomalyAnnouncementFormatter = (anomalies: AnomalySummary[], locale: string) => string;

const DEFAULT_TURKISH_LOCALES = new Set(['tr', 'tr-TR', 'TR']);

const defaultFormatAnomalyAnnouncement: AnomalyAnnouncementFormatter = (anomalies, locale) => {
  if (!Array.isArray(anomalies) || anomalies.length === 0) return '';
  const total = anomalies.length;
  const above = anomalies.filter((a) => a.direction === 'above').length;
  const below = total - above;
  const highest = [...anomalies].sort((a, b) => b.severity - a.severity)[0];
  const isTr = DEFAULT_TURKISH_LOCALES.has(locale);
  if (isTr) {
    const dirText =
      below === 0
        ? `${above} tanesi beklenenin üzerinde`
        : above === 0
          ? `${below} tanesi beklenenin altında`
          : `${above} üstte ve ${below} altta`;
    return `${total} aykırı değer tespit edildi (${dirText}). En uç: x=${String(highest.x)}, y=${highest.formattedY}.`;
  }
  const dirText =
    below === 0
      ? `${above} above expected range`
      : above === 0
        ? `${below} below expected range`
        : `${above} above and ${below} below expected range`;
  // Codex iter-2 §P2: "Most extreme" ranks by severity (correct
  // for SR attention signal), not by y-value. Previous "Highest"
  // copy was factually wrong when the most-severe anomaly was a
  // lower-fence outlier (e.g. y=5 reported as "Highest"). TR copy
  // already says "En uç" which matches severity ranking.
  return `${total} outlier${total === 1 ? '' : 's'} detected (${dirText}). Most extreme: x=${String(highest.x)}, y=${highest.formattedY}.`;
};

function anomalySignature(anomalies: AnomalySummary[] | undefined): string {
  if (!Array.isArray(anomalies) || anomalies.length === 0) return '';
  // Sort-stable, severity-ranked signature so the same hit set in
  // a different incoming order still dedupes. `severity` is
  // detector-specific but stable per (point, fence) so it makes
  // a good identity proxy.
  return [...anomalies]
    .map((a) => `${a.id}|${a.direction}|${a.formattedY}|${a.severity.toFixed(4)}`)
    .sort()
    .join('\n');
}

export interface ChartAriaLiveProps {
  /** The announcement message to relay to screen readers. */
  message: string;
  /** Politeness level. @default "polite" */
  politeness?: 'polite' | 'assertive';
  /** Debounce delay in ms to avoid rapid-fire announcements. @default 300 */
  debounceMs?: number;
  /**
   * Faz 21.11 PR-A2b-a11y — anomaly summary list. When the list
   * changes (and isn't an empty-to-empty transition or a repeat of
   * the previously-announced signature) the component fires a
   * SECOND debounced announcement summarising the outliers.
   * Default `[]` is a no-op (backwards compat — existing consumers
   * see no behaviour change).
   */
  anomalies?: AnomalySummary[];
  /**
   * Override the anomaly announcement template. Receives the
   * current anomaly list and the active locale string. Returns the
   * raw text the live region will read out. Defaults to a small
   * EN/TR formatter (no ICU dependency).
   */
  formatAnomalyAnnouncement?: AnomalyAnnouncementFormatter;
  /**
   * Debounce delay specifically for the anomaly stream. Anomaly
   * detection batches naturally cluster on data updates; a 1s
   * window gives the SR a single coherent announcement per stable
   * anomaly state.
   * @default 1000
   */
  anomalyDebounceMs?: number;
  /**
   * Locale identifier for the default formatter. Pass the chart's
   * active locale (the inner `useChartsLocale()` value works for
   * `ChartA11yShell` callers). Ignored when
   * `formatAnomalyAnnouncement` is supplied.
   * @default 'en'
   */
  locale?: string;
}

/**
 * Invisible aria-live region that announces chart updates to screen readers.
 *
 * @example
 * ```tsx
 * <ChartAriaLive
 *   message={`Chart updated: ${data.length} data points loaded`}
 * />
 * ```
 *
 * @example anomaly-aware
 * ```tsx
 * <ChartAriaLive
 *   message={`Chart updated: ${data.length} points`}
 *   anomalies={anomalySummary}
 *   locale="tr"
 * />
 * ```
 */
export function ChartAriaLive({
  message,
  politeness = 'polite',
  debounceMs = 300,
  anomalies,
  formatAnomalyAnnouncement,
  anomalyDebounceMs = 1000,
  locale = 'en',
}: ChartAriaLiveProps) {
  const [announced, setAnnounced] = useState('');
  const [anomalyAnnouncement, setAnomalyAnnouncement] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const anomalyTimerRef = useRef<ReturnType<typeof setTimeout>>();
  // Codex iter-1 §3 dedupe: never re-announce the same anomaly
  // signature twice in a row.
  const lastAnomalySignatureRef = useRef<string>('');

  useEffect(() => {
    if (!message) return;

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      // Toggle between empty and message to force re-announcement
      setAnnounced('');
      requestAnimationFrame(() => setAnnounced(message));
    }, debounceMs);

    return () => clearTimeout(timerRef.current);
  }, [message, debounceMs]);

  // Memoise the signature so identity-stable anomaly arrays don't
  // re-trigger the effect on every parent render.
  const signature = useMemo(() => anomalySignature(anomalies), [anomalies]);

  useEffect(() => {
    if (!signature) {
      // Empty → empty transition or anomaly cleared. Dedupe ref
      // resets so a future re-emission of the same set still
      // announces.
      lastAnomalySignatureRef.current = '';
      // We deliberately do NOT clear `anomalyAnnouncement` here —
      // SR users would lose the last announcement context. The
      // text fades naturally on the next live-region update.
      return;
    }
    if (signature === lastAnomalySignatureRef.current) return; // dedupe
    clearTimeout(anomalyTimerRef.current);
    const formatter = formatAnomalyAnnouncement ?? defaultFormatAnomalyAnnouncement;
    const text = formatter(anomalies ?? [], locale);
    if (!text) return;
    anomalyTimerRef.current = setTimeout(() => {
      lastAnomalySignatureRef.current = signature;
      setAnomalyAnnouncement('');
      requestAnimationFrame(() => setAnomalyAnnouncement(text));
    }, anomalyDebounceMs);
    return () => clearTimeout(anomalyTimerRef.current);
  }, [signature, anomalyDebounceMs, formatAnomalyAnnouncement, locale, anomalies]);

  const srOnlyStyle = {
    position: 'absolute' as const,
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden' as const,
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap' as const,
    borderWidth: 0,
  };

  return (
    <>
      <div
        role="status"
        aria-live={politeness}
        aria-atomic="true"
        className="sr-only"
        style={srOnlyStyle}
      >
        {announced}
      </div>
      {/* Codex iter-1 §3+§4: dedicated SECOND live region for the
          anomaly stream so a chart data update + an anomaly
          re-detection don't smash each other inside the same
          atomic region (atomic regions re-announce the WHOLE
          content on any change). polite default; consumer can
          override the OUTER region's politeness via prop, but the
          anomaly region stays polite — anomalies aren't critical
          alarms.

          IMPORTANT: this region only mounts when the consumer
          supplied the `anomalies` prop (even an empty array
          counts as opt-in). Backwards compat: consumers that
          don't pass the prop see exactly ONE `<div role="status">`
          which keeps `screen.getByRole("status")` callers
          working unchanged. */}
      {anomalies !== undefined && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
          data-testid="chart-aria-live-anomalies"
          style={srOnlyStyle}
        >
          {anomalyAnnouncement}
        </div>
      )}
    </>
  );
}
