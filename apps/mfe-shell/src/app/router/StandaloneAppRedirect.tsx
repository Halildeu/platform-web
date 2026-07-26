import React, { useEffect } from 'react';
import { openStandaloneApp, resolveStandaloneAppTarget } from '../standalone-apps';

/**
 * Kabuk içinden bağımsız (kenarda yayınlanan) bir uygulamaya çıkış.
 *
 * Bu route'a yalnız SPA gezinmesiyle gelinebilir: tam sayfa isteği zaten
 * ingress tarafından kenardaki uygulamaya verilir. Bu yüzden burada kabuk
 * içinde bir şey mount etmek yerine tam sayfa gezinmesi yapılır — yolun tek
 * bir sahibi olur ve hangi bileşenin (kabuk kapısı mı, uygulamanın kendi
 * kapısı mı) önce davrandığına bağlı belirsizlik ortadan kalkar.
 */
export const StandaloneAppRedirect: React.FC<{ path: string }> = ({ path }) => {
  const target = resolveStandaloneAppTarget(path);

  useEffect(() => {
    if (target) openStandaloneApp(target);
  }, [target]);

  return null;
};
