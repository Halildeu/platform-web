import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { KvkkNoticeBody } from '../../features/ats-portals/KvkkNoticeBody';
import { noticesForTenant } from '../../features/ats-portals/kvkk-notices';

/**
 * Kalıcı aydınlatma sayfası. Başvuru formundaki açılır bölümün yanında ayrıca
 * durur: metin paylaşılabilir, arşivlenebilir ve başvuru yapmadan da okunabilir
 * olmalı. Aynı içerik bileşeni kullanılır, dolayısıyla iki yüzey ayrışamaz.
 */
const CandidateNoticePage = () => {
  const { publicHandle } = useParams();
  const notices = noticesForTenant(publicHandle);
  const jobsBase = publicHandle ? `/careers/${encodeURIComponent(publicHandle)}/jobs` : '/jobs';

  return (
    <main
      className="min-h-screen bg-surface-subtle text-text-primary"
      data-testid="candidate-notice-page"
    >
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Link to={jobsBase} className="text-sm font-semibold text-action-primary underline">
          ← Açık pozisyonlara dön
        </Link>

        <h1 className="mt-4 text-2xl font-bold">Aday Aydınlatma Metinleri</h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Başvuru sürecinde kişisel verilerinizin nasıl işlendiğini açıklayan metinler aşağıdadır.
          Aynı metinler başvuru formunda, onay verdiğiniz noktanın yanında da görünür.
        </p>

        {notices.length === 0 ? (
          // Fail-closed'ın görünür yüzü: metin yoksa uydurma bir metin basılmaz.
          <p
            role="alert"
            className="mt-6 rounded-xl border border-state-danger-border bg-state-danger-bg px-4 py-3 text-sm font-semibold text-state-danger-text"
          >
            Bu kariyer sayfası için yayımlanmış bir aydınlatma metni bulunmuyor. Metin
            yayımlanmadan başvuru onayı toplanmaz.
          </p>
        ) : (
          notices.map((notice) => (
            <article
              key={notice.version}
              className="mt-6 rounded-2xl border border-border-subtle bg-surface-default p-5 shadow-xs sm:p-6"
            >
              <h2 className="text-xl font-bold">{notice.title}</h2>
              <KvkkNoticeBody notice={notice} />
            </article>
          ))
        )}
      </div>
    </main>
  );
};

export default CandidateNoticePage;
