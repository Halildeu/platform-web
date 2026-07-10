import '@testing-library/jest-dom';
import { webcrypto } from 'node:crypto';

// jsdom ortamı `crypto.subtle`'ı sağlamaz (CI'da içerik-hash yolu ölür; lokal
// Node global'i şans eseri kapatıyordu). Node webcrypto ile deterministik hale
// getir — tarayıcıda (secure context) subtle zaten var, bu YALNIZ test ortamı.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}
