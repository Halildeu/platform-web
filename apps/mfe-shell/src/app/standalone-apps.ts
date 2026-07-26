/**
 * Kenar (ingress) tarafından sunulan bağımsız uygulamalar.
 *
 * Bazı ürünler suite kabuğunun içinde değil, kendi imajı + kendi ingress
 * kuralıyla yayınlanır. Bu yollarda kabuk router'ı **sahip değildir**: tam
 * sayfa isteği her zaman kenardaki uygulamaya gider, kabuk yalnız SPA
 * gezinmesinde araya girebilir. İki taraf aynı yolu sahiplendiğinde ortaya
 * çıkan davranış tıklamanın türüne göre değişir — canlı gözlem (2026-07-26):
 * aynı "Etik Speak" bağlantısı bir kez ana sayfada kaldı, bir kez kenardaki
 * panele tam sayfa gitti.
 *
 * Bu tablo o belirsizliği kapatır: buradaki yollar kabuk içinden **her zaman**
 * tam sayfa gezinmesiyle açılır, kabuk route'u da aynı adrese yönlendirir.
 * Yol → hedef eşlemesi tek yerde durur; ingress kuralı değişirse burası
 * değişir.
 */
export const STANDALONE_APP_TARGETS: Readonly<Record<string, string>> = Object.freeze({
  // kustomize/overlays/test/activation/etik-speak/ingress-manager-ui.yaml
  // testai.acik.com/ethic → service etik-speak-manager
  '/ethic': '/ethic/',
});

/**
 * Verilen kabuk yolu kenarda yayınlanan bağımsız bir uygulamaya mı ait?
 * Eşleşirse tam sayfa gezinmesi için kullanılacak hedef adresi döner.
 */
export const resolveStandaloneAppTarget = (path: string | undefined): string | undefined => {
  if (!path) return undefined;
  const [pathname] = path.split(/[?#]/);
  return STANDALONE_APP_TARGETS[pathname];
};

/**
 * Bağımsız uygulamaya tam sayfa geç. `assign` bilinçli: kullanıcı geri
 * tuşuyla suite'e dönebilmeli (`replace` bunu koparırdı).
 */
export const openStandaloneApp = (target: string): void => {
  window.location.assign(target);
};

/**
 * Kabuk içi gezinme yardımcısı: yol bağımsız bir uygulamaya aitse tam sayfa
 * açar ve `true` döner; değilse hiçbir şey yapmaz ve `false` döner — çağıran
 * kendi SPA gezinmesine devam eder.
 */
export const navigateIfStandaloneApp = (path: string | undefined): boolean => {
  const target = resolveStandaloneAppTarget(path);
  if (!target) return false;
  openStandaloneApp(target);
  return true;
};
