/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Web Push Protocol VAPID public key (base64url-encoded uncompressed
   * P-256, 65-byte 0x04 prefix).
   *
   * Faz 23.7 M7 T4.2 PR-W5 follow-up. Backend Vault'tan ConfigMap'e
   * `NOTIFY_ADAPTERS_WEBPUSH_PUBLIC_KEY` olarak inject edilir; FE
   * tarafında bu env üzerinden okunur ve {@code PushManager.subscribe}
   * {@code applicationServerKey} parametresine geçirilir.
   *
   * Operator action gerek: Vault VAPID seed +
   * `VITE_NOTIFY_VAPID_PUBLIC_KEY` build-time injection
   * (helm-values / overlay frontend env). Boş ise
   * {@code PushSubscriptionCard} configuration-missing warning gösterir.
   */
  readonly VITE_NOTIFY_VAPID_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
