import React from 'react';
import type { KvkkNotice } from './kvkk-notices';

/**
 * Aydınlatma metninin gövdesi. İki yerde AYNI bileşenle basılır: onay kutusunun
 * yanındaki açılır bölümde ve kalıcı aydınlatma sayfasında. Metni iki kez yazmak,
 * ikisinin zamanla ayrışması demek olurdu — aday hangisini okuduğunu bilemezdi.
 */
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mt-4">
    <h3 className="text-sm font-bold text-text-primary">{title}</h3>
    <div className="mt-1 text-sm leading-6 text-text-secondary">{children}</div>
  </section>
);

const Bullets = ({ items }: { items: string[] }) => (
  <ul className="list-disc space-y-1 pl-5">
    {items.map((item) => (
      <li key={item}>{item}</li>
    ))}
  </ul>
);

export const KvkkNoticeBody = ({ notice }: { notice: KvkkNotice }) => (
  <div data-testid={`kvkk-notice-body-${notice.version}`}>
    <Section title="Veri sorumlusu">
      <p className="font-semibold text-text-primary">{notice.controller.legalName}</p>
      <p>{notice.controller.address}</p>
      <p>KEP: {notice.controller.kep}</p>
      <p className="mt-1">
        <a
          href={notice.controller.verbisUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="font-semibold text-action-primary underline"
        >
          VERBİS sicil kaydını sorgula
        </a>
      </p>
    </Section>

    <Section title="İşlenen kişisel veriler">
      <Bullets items={notice.collected} />
    </Section>

    <Section title="İşleme amaçları">
      <Bullets items={notice.purposes} />
    </Section>

    <Section title="Hukuki sebep">
      <Bullets items={notice.legalBasis} />
    </Section>

    <Section title="Aktarılan taraflar">
      {notice.recipients.length === 0 ? (
        <p>Verileriniz üçüncü kişilere aktarılmaz.</p>
      ) : (
        <ul className="list-disc space-y-1 pl-5">
          {notice.recipients.map((recipient) => (
            <li key={recipient.legalName}>
              <span className="font-semibold text-text-primary">{recipient.legalName}</span> —{' '}
              {recipient.purpose}
            </li>
          ))}
        </ul>
      )}
    </Section>

    <Section title="Saklama süresi">
      <p>{notice.retention}</p>
    </Section>

    <Section title="Uygulanan koruma önlemleri">
      <Bullets items={notice.safeguards} />
    </Section>

    <Section title="KVKK m.11 kapsamındaki haklarınız">
      <Bullets items={notice.rights} />
      <p className="mt-2">{notice.rightsChannel}</p>
    </Section>

    <p className="mt-4 text-xs text-text-subtle">Metin sürümü: {notice.version}</p>
  </div>
);

/**
 * Onay kutusunun yanındaki açılır bölüm. Aday sayfadan AYRILMADAN okur; ayrı
 * sayfaya gitmek doldurduğu formu kaybettirme riski taşır. Kalıcı sayfaya bağlantı
 * da verilir (paylaşılabilir/arşivlenebilir olması için).
 */
export const KvkkNoticeDisclosure = ({
  notice,
  permanentHref,
}: {
  notice: KvkkNotice;
  permanentHref: string;
}) => (
  <details
    data-testid={`kvkk-notice-disclosure-${notice.version}`}
    className="mt-2 rounded-xl border border-border-subtle bg-surface-subtle px-3 py-2"
  >
    <summary className="cursor-pointer text-sm font-bold text-action-primary">
      {notice.title}’ni oku
    </summary>
    <div className="mt-2 border-t border-border-subtle pt-2">
      <KvkkNoticeBody notice={notice} />
      <p className="mt-3 text-sm">
        <a
          href={permanentHref}
          target="_blank"
          rel="noreferrer noopener"
          className="font-semibold text-action-primary underline"
        >
          Metni ayrı sekmede kalıcı sayfada aç
        </a>
      </p>
    </div>
  </details>
);
