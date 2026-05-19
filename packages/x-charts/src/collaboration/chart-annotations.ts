/**
 * Chart Annotations — Data point comments and markers
 *
 * @see contract P7 DoD: "Shared annotations on chart data points"
 */

import { useState, useCallback } from 'react';

import { resolveCssVarColor } from '../utils/resolveCssVarColor';

export type AnnotationType = 'comment' | 'marker' | 'highlight' | 'threshold';

export interface Annotation {
  id: string;
  type: AnnotationType;
  /** Data point reference (x value or index) */
  dataRef: string | number;
  /** Series name (if multi-series) */
  seriesName?: string;
  /** Annotation text content */
  text: string;
  /** Author identifier */
  author?: string;
  /** Creation timestamp */
  createdAt: number;
  /** Optional color override */
  color?: string;
  /** For threshold type: the threshold value */
  thresholdValue?: number;
}

/**
 * Hook for managing chart annotations.
 * Annotations are stored in-memory; persistence is handled by the consumer.
 */
export function useChartAnnotations(initialAnnotations?: Annotation[]) {
  const [annotations, setAnnotations] = useState<Annotation[]>(initialAnnotations ?? []);

  const addAnnotation = useCallback((annotation: Omit<Annotation, 'id' | 'createdAt'>) => {
    const newAnnotation: Annotation = {
      ...annotation,
      id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
    };
    setAnnotations((prev) => [...prev, newAnnotation]);
    return newAnnotation;
  }, []);

  const removeAnnotation = useCallback((id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const updateAnnotation = useCallback(
    (id: string, updates: Partial<Omit<Annotation, 'id' | 'createdAt'>>) => {
      setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));
    },
    [],
  );

  const getAnnotationsForPoint = useCallback(
    (dataRef: string | number, seriesName?: string) => {
      return annotations.filter(
        (a) => a.dataRef === dataRef && (!seriesName || a.seriesName === seriesName),
      );
    },
    [annotations],
  );

  // The consumer-supplied `Annotation.color` flows straight into an
  // ECharts `itemStyle.color` / `lineStyle.color` field below. The
  // canvas renderer silently ignores a `var(--token)` string (drawing a
  // dark fallback with no console error), so each color is run through
  // `resolveCssVarColor` first — keeping `useChartAnnotations` aligned
  // with the x-charts standard that no public API emits a raw `var()`
  // to an ECharts color field.
  const toEChartsMarkPoints = useCallback(() => {
    return annotations
      .filter((a) => a.type === 'marker' || a.type === 'comment')
      .map((a) => ({
        name: a.text,
        xAxis: a.dataRef,
        yAxis: a.thresholdValue,
        itemStyle: a.color ? { color: resolveCssVarColor(a.color) } : undefined,
      }));
  }, [annotations]);

  const toEChartsMarkLines = useCallback(() => {
    return annotations
      .filter((a) => a.type === 'threshold')
      .map((a) => ({
        name: a.text,
        yAxis: a.thresholdValue,
        lineStyle: { color: resolveCssVarColor(a.color ?? '#ef4444'), type: 'dashed' as const },
        label: { formatter: a.text },
      }));
  }, [annotations]);

  return {
    annotations,
    addAnnotation,
    removeAnnotation,
    updateAnnotation,
    getAnnotationsForPoint,
    toEChartsMarkPoints,
    toEChartsMarkLines,
    setAnnotations,
  };
}
