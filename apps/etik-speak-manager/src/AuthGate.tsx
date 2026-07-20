import { type PropsWithChildren, useEffect, useState } from 'react';
import { initializeManagerSession, subscribeManagerSessionInvalidation } from './auth';

type State = 'loading' | 'ready' | 'redirecting' | 'denied' | 'error';

export function AuthGate({ children }: PropsWithChildren) {
  const [state, setState] = useState<State>('loading');

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
  }, []);

  if (state === 'ready') return <>{children}</>;
  if (state === 'error') {
    return (
      <main className="manager-session-state" role="alert">
        <h1>Etik Speak</h1>
        <p>Yetkili oturum güvenli biçimde başlatılamadı. Sayfayı yenileyip tekrar deneyin.</p>
      </main>
    );
  }
  if (state === 'denied') {
    return (
      <main className="manager-session-state" role="alert">
        <h1>Etik Speak</h1>
        <p>Bu ürün için gerekli yetki, rol ve kapsam sözleşmesi bulunamadı.</p>
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
