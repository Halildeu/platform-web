import React from 'react';
import { Link } from 'react-router-dom';

/**
 * #1047 — aday yüzeyinde YALNIZ personele görünen ince dönüş şeridi.
 *
 * <p>Aday yüzeyi (ilanlar, başvuru formu, aday portalı) bilinçli olarak korumalı kabuğun
 * dışında: aday platform kullanıcısı değildir, ona iç menüleri ve iç aramayı göstermek hem
 * anlamsız hem sızıntıdır. Ama oturum açmış personel o sayfaya gidince geri dönüş yolu
 * kalmıyordu (yalnız tarayıcı geri tuşu) ve "hangi uygulamadayım" bağlamı kopuyordu.
 *
 * <p>Bu şerit kabuğu adaya AÇMAZ: sol menü ve iç arama iki durumda da yok. Oturum yoksa
 * bileşen {@code null} döner — şerit DOM'a hiç girmez, gizlenmez.
 */
export interface PublicSurfaceStaffStripProps {
  /** Oturum açmış personelin erişim anahtarı; yoksa şerit hiç çizilmez. */
  token: string | null | undefined;
  /** Kabukta en son görülen iç sayfa; personel oraya döner. */
  returnPath: string;
}

export const PublicSurfaceStaffStrip: React.FC<PublicSurfaceStaffStripProps> = ({
  token,
  returnPath,
}) => {
  if (!token) return null;
  return (
    <div
      data-testid="staff-public-surface-strip"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-subtle bg-surface-muted px-4 py-2 text-xs text-text-secondary"
    >
      <Link
        to={returnPath}
        className="min-h-8 rounded-lg px-2 py-1 font-bold text-text-primary underline"
      >
        ← Platform&apos;a dön
      </Link>
      <span>Bu sayfa adayların gördüğü görünümdür.</span>
    </div>
  );
};

export default PublicSurfaceStaffStrip;
