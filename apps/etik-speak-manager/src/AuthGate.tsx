import { type PropsWithChildren, useCallback, useEffect, useState } from 'react';
import {
  initializeManagerSession,
  resetManagerSessionForRetry,
  subscribeManagerSessionInvalidation,
} from './auth';

type State = 'loading' | 'ready' | 'redirecting' | 'denied' | 'error';

export function AuthGate({ children }: PropsWithChildren) {
  const [state, setState] = useState<State>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeManagerSessionInvalidation(() => {
      if (active) setState('error');
    });
    initializeManagerSession()
      .then((result) => {
        if (active) setState(result);
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [attempt]);

  // Faz 35 ES: `denied`/`error` ekranları çıkışsızdı — dar kapsamlı suite
  // oturumuyla gelen yetkili kullanıcı yükseltme işaretine takılıp TTL dolana
  // kadar (5 dk) bekliyordu. Yeniden deneme işareti temizler ve oturumu baştan
  // kurar; yetki kapısı aynı kalır, yalnız KC yükseltme akışı serbest bırakılır.
  const retry = useCallback(() => {
    resetManagerSessionForRetry();
    setState('loading');
    setAttempt((value) => value + 1);
  }, []);

  if (state === 'ready') return <>{children}</>;
  if (state === 'error') {
    return (
      <main className="manager-session-state" role="alert">
        <h1>Etik Speak</h1>
        <p>Yetkili oturum güvenli biçimde başlatılamadı.</p>
        <button type="button" onClick={retry} data-testid="manager-session-retry">
          Yeniden dene
        </button>
      </main>
    );
  }
  if (state === 'denied') {
    return (
      <main className="manager-session-state" role="alert">
        <h1>Etik Speak</h1>
        <p>Bu ürün için gerekli yetki, rol ve kapsam sözleşmesi bulunamadı.</p>
        <p>
          Yetkiniz olduğunu düşünüyorsanız oturumunuz bu ürün için gereken kapsamı
          taşımıyor olabilir. Yeniden deneyerek yetkili girişi başlatabilirsiniz.
        </p>
        <button type="button" onClick={retry} data-testid="manager-session-retry">
          Yeniden dene
        </button>
      </main>
    );
  }
  return (
    <main className="manager-session-state" role="status">
      <h1>Etik Speak</h1>
      <p>
        {state === 'redirecting' ? 'Yetkili girişine yönlendiriliyor…' : 'Oturum doğrulanıyor…'}
      </p>
    </main>
  );
}
