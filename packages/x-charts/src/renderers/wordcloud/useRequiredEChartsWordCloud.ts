/**
 * useRequiredEChartsWordCloud — Faz 21.11 Campaign 5 WordCloudChart
 * lazy load + state machine hook (mirrors useRequiredEChartsLiquidFill).
 *
 * 4-state machine ensures wrapper never dispatches a `'wordCloud'`
 * option before the lazy chunk has registered the series type. No
 * WebGL probe — wordCloud renders on standard Canvas/SVG.
 *
 *   - 'idle'         → enabled=false OR just mounted
 *   - 'loading'      → dynamic `import('echarts-wordcloud')` in flight
 *   - 'ready'        → registration resolved; chart can dispatch
 *   - 'unsupported'  → import rejected. Caller renders empty/error
 *                       state (no canvas substitute).
 */
import { useEffect, useState } from 'react';
import { isEChartsWordCloudRegistered, registerEChartsWordCloud } from './registerEChartsWordCloud';

export type EChartsWordCloudStatus = 'idle' | 'loading' | 'ready' | 'unsupported';
export type EChartsWordCloudUnsupportedReason = 'wordcloud-import-failed' | 'disabled';

export interface UseRequiredEChartsWordCloudOptions {
  enabled?: boolean;
}

export interface UseRequiredEChartsWordCloudResult {
  status: EChartsWordCloudStatus;
  reason?: EChartsWordCloudUnsupportedReason;
  error?: Error;
}

/**
 * Lazy-load `echarts-wordcloud` and report a four-state lifecycle so
 * the WordCloudChart wrapper can branch its render path safely.
 */
export function useRequiredEChartsWordCloud(
  options?: UseRequiredEChartsWordCloudOptions,
): UseRequiredEChartsWordCloudResult {
  const enabled = options?.enabled ?? true;

  const [state, setState] = useState<UseRequiredEChartsWordCloudResult>(() => {
    if (!enabled) return { status: 'idle', reason: 'disabled' };
    if (isEChartsWordCloudRegistered()) return { status: 'ready' };
    return { status: 'idle' };
  });

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'idle', reason: 'disabled' });
      return;
    }

    if (isEChartsWordCloudRegistered()) {
      setState({ status: 'ready' });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    registerEChartsWordCloud().then(
      () => {
        if (cancelled) return;
        setState({ status: 'ready' });
      },
      (err: unknown) => {
        if (cancelled) return;
        const error = err instanceof Error ? err : new Error(String(err));
        setState({ status: 'unsupported', reason: 'wordcloud-import-failed', error });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return state;
}

/**
 * Human-readable copy for the unsupported banner that WordCloudChart
 * renders when the chunk fails to load.
 */
export function describeEChartsWordCloudReason(reason?: EChartsWordCloudUnsupportedReason): string {
  switch (reason) {
    case 'wordcloud-import-failed':
      return 'Kelime bulutu grafiği yüklenemedi. Ağ bağlantınızı kontrol edip sayfayı yenileyin.';
    case 'disabled':
      return 'Kelime bulutu grafiği bu görsel için devre dışı.';
    default:
      return 'Kelime bulutu grafiği yüklenirken bir sorun oluştu.';
  }
}
