import { type PropsWithChildren, useEffect, useState } from 'react';
import { initializeManagerSession } from './auth';

type State = 'loading' | 'ready' | 'redirecting' | 'error';

export function AuthGate({ children }: PropsWithChildren) {
  const [state, setState] = useState<State>('loading');

  useEffect(() => {
    let active = true;
    initializeManagerSession()
      .then((result) => {
        if (active) setState(result);
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
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
  return (
    <main className="manager-session-state" role="status">
      <h1>Etik Speak</h1>
      <p>
        {state === 'redirecting' ? 'Yetkili girişine yönlendiriliyor…' : 'Oturum doğrulanıyor…'}
      </p>
    </main>
  );
}
