import { MODULE_KEYS } from '../../../features/auth/lib/permissions.constants';

export const ATS_PRODUCT_ROLES = {
  CANDIDATE: 'Aday',
  RECRUITER: 'İşe alım uzmanı',
  HIRING_MANAGER: 'İşe alım yöneticisi',
  INTERVIEWER: 'Mülakatçı',
  AUDITOR: 'Denetçi',
  ADMIN: 'Yönetici',
} as const;

export type AtsProductRole = keyof typeof ATS_PRODUCT_ROLES;

export type AtsCapabilityMode =
  | 'LIVE_READ'
  | 'LIVE_WRITE'
  | 'SYNTHETIC_SANDBOX'
  | 'PROPOSAL_ONLY'
  | 'OWNER_GATED'
  | 'UNAVAILABLE';

export interface AtsSafePreview {
  scenario: string;
  output: string;
  boundary: string;
}

export interface AtsCapabilityDefinition {
  id: string;
  title: string;
  description: string;
  route: string;
  requiredModule: string;
  targetRoles: readonly AtsProductRole[];
  mode: AtsCapabilityMode;
  liveDependency: string;
  actionCeiling: string;
  safePreview: AtsSafePreview | null;
  remoteEnabledMode?: AtsCapabilityMode;
  remoteEnabledActionCeiling?: string;
}

export const ATS_PRODUCT_HUB_ENTRY = {
  id: 'ats-product-hub',
  label: 'ATS Ürün Merkezi',
  route: '/admin/ats',
  routePattern: '/admin/ats/*',
  requiredModule: MODULE_KEYS.INTERVIEW_EVIDENCE,
} as const;

export const INTERVIEW_EVIDENCE_ENTRY = {
  id: 'interview-evidence',
  label: 'Interview Evidence',
  route: '/admin/interview-evidence',
  routePattern: '/admin/interview-evidence/*',
  requiredModule: MODULE_KEYS.INTERVIEW_EVIDENCE,
} as const;

/**
 * Shell-owned product catalog for the permanent ATS product hub.
 *
 * The hub is intentionally independent from federated-remote readiness: an
 * authorized user can discover these capabilities while the remote is OFF or
 * ON. Runtime resolution may promote only explicitly declared capabilities
 * (currently Interview Evidence) to their remote-enabled mode. It never
 * widens OpenFGA authorization or claims production readiness. Real candidate
 * data and mutations remain owned by protected product routes and their
 * backend gates.
 */
export const ATS_CAPABILITY_REGISTRY = [
  {
    id: 'interview-evidence-workspace',
    title: 'Mülakat kanıt çalışma alanı',
    description:
      'Kayıt izni, transkript, kanıt alıntıları ve insan onaylı değerlendirme akışını tek yerde toplar.',
    route: INTERVIEW_EVIDENCE_ENTRY.route,
    requiredModule: ATS_PRODUCT_HUB_ENTRY.requiredModule,
    targetRoles: ['RECRUITER', 'HIRING_MANAGER', 'INTERVIEWER', 'AUDITOR', 'ADMIN'],
    mode: 'UNAVAILABLE',
    liveDependency: 'Canlı Interview Evidence modülü ve yetkili ATS API bağlantısı',
    actionCeiling:
      'Bu dağıtımda yalnız ürün kapsamı görülebilir; gerçek kayıt veya aday verisi açılamaz.',
    safePreview: null,
    remoteEnabledMode: 'LIVE_READ',
    remoteEnabledActionCeiling:
      'Canlı çalışma alanı açılabilir; işlemler kullanıcının gerçek rol ve policy tavanını aşamaz. Bu katalog yönetim yetkisi vermez.',
  },
  {
    id: 'candidate-cv-pdf-import',
    title: 'PDF özgeçmişten düzenlenebilir başvuru taslağı',
    description:
      'Adayın yüklediği PDF özgeçmişteki iletişim, deneyim, eğitim ve beceri alanlarını düzenleyebileceği bir başvuru taslağına dönüştürür.',
    route: ATS_PRODUCT_HUB_ENTRY.route,
    requiredModule: ATS_PRODUCT_HUB_ENTRY.requiredModule,
    targetRoles: ['CANDIDATE', 'RECRUITER'],
    mode: 'OWNER_GATED',
    liveDependency:
      'Halildeu/ats#163; aday portalı, açık rıza/aydınlatma, zararlı dosya taraması, veri saklama ve alan-güven skoru sözleşmesi',
    actionCeiling:
      'Bu dilimde yükleme kontrolü açılmaz; gerçek CV/PII işlenmez. Yalnız planlanan düzenlenebilir taslak akışının sınırı görünür.',
    safePreview: null,
  },
  {
    id: 'candidate-review-and-appeal',
    title: 'Aday inceleme, düzeltme ve itiraz',
    description:
      'Adaya kendisiyle ilgili kanıtı görme, yanlış bilgiyi işaretleme ve insan incelemesi isteme yolu sunar.',
    route: ATS_PRODUCT_HUB_ENTRY.route,
    requiredModule: ATS_PRODUCT_HUB_ENTRY.requiredModule,
    targetRoles: ['CANDIDATE', 'RECRUITER', 'AUDITOR', 'ADMIN'],
    mode: 'PROPOSAL_ONLY',
    liveDependency: 'Aday portalı, doğrulanmış kimlik ve DSAR/itiraz iş akışı',
    actionCeiling:
      'Örnek yalnız düzeltme talebini gösterir; gerçek dosya, bildirim veya karar oluşturmaz.',
    safePreview: {
      scenario: 'Sentetik aday, transkriptteki görev süresi bilgisinin yanlış olduğunu işaretler.',
      output: 'İnsan incelemesine gönderilecek kanıta bağlı düzeltme taslağı gösterilir.',
      boundary: 'Talep gönderilmez; aday kimliği, kişisel veri ve üretim kaydı kullanılmaz.',
    },
  },
  {
    id: 'citation-backed-coaching',
    title: 'Kanıta bağlı mülakatçı koçluğu',
    description:
      'Mülakat kalitesini iyileştirmek için her öneriyi izinli bir kanıt ve değerlendirme ölçütüne bağlar.',
    route: ATS_PRODUCT_HUB_ENTRY.route,
    requiredModule: ATS_PRODUCT_HUB_ENTRY.requiredModule,
    targetRoles: ['RECRUITER', 'HIRING_MANAGER', 'INTERVIEWER', 'AUDITOR'],
    mode: 'PROPOSAL_ONLY',
    liveDependency: 'Doğrulanmış görüşme kanıtı ve insan onaylı değerlendirme ölçütleri',
    actionCeiling:
      'Öneriler yalnız okunabilir; otomatik uygulama, puanlama veya istihdam kararı yoktur.',
    safePreview: {
      scenario: 'Sentetik görüşmede bir yetkinlik için takip sorusu eksik kalır.',
      output: 'İlgili kanıt alıntısına bağlı, tarafsız bir takip sorusu taslağı gösterilir.',
      boundary: 'Öneri uygulanamaz; duygu, kişilik, aldatma veya uygunluk çıkarımı yapılmaz.',
    },
  },
  {
    id: 'fairness-audit',
    title: 'Adalet ve tutarlılık incelemesi',
    description:
      'Değerlendirme ölçütlerinin tutarlı uygulanıp uygulanmadığını sentetik örneklerle görünür kılar.',
    route: ATS_PRODUCT_HUB_ENTRY.route,
    requiredModule: ATS_PRODUCT_HUB_ENTRY.requiredModule,
    targetRoles: ['HIRING_MANAGER', 'AUDITOR', 'ADMIN'],
    mode: 'SYNTHETIC_SANDBOX',
    liveDependency: 'Onaylı ölçüm planı, minimum örneklem ve Legal/DPO veri kullanım kararı',
    actionCeiling:
      'Yalnız sentetik toplulaştırılmış örnek; kişi veya korunan özellik bazında karar üretmez.',
    safePreview: {
      scenario:
        'Tamamen sentetik iki değerlendirme grubunda ölçüt kullanım oranları karşılaştırılır.',
      output: 'Tutarlılık farkı, örneklem uyarısı ve insan inceleme önerisi gösterilir.',
      boundary: 'Gerçek aday, korunan özellik, sıralama veya otomatik aksiyon kullanılmaz.',
    },
  },
  {
    id: 'quality-of-hire',
    title: 'İşe alım kalitesi geri-bildirim döngüsü',
    description:
      'İnsan tarafından belirlenen sonuç ölçütlerini mülakat kanıt kalitesiyle güvenli biçimde ilişkilendirir.',
    route: ATS_PRODUCT_HUB_ENTRY.route,
    requiredModule: ATS_PRODUCT_HUB_ENTRY.requiredModule,
    targetRoles: ['RECRUITER', 'HIRING_MANAGER', 'AUDITOR', 'ADMIN'],
    mode: 'SYNTHETIC_SANDBOX',
    liveDependency: 'Müşteri onaylı sonuç tanımı, zaman penceresi ve veri yönetişimi',
    actionCeiling:
      'Yalnız sentetik senaryo; çalışan performansı veya aday uygunluğu tahmini yapılmaz.',
    safePreview: {
      scenario: 'Sentetik bir işe alım kohortunda kanıt kapsama oranı zaman içinde izlenir.',
      output: 'Eksik kanıt alanları ve ölçüm belirsizliği gösterilir.',
      boundary: 'Kişi puanı, performans tahmini, sıralama veya iş akışı mutasyonu yoktur.',
    },
  },
  {
    id: 'skills-evidence',
    title: 'Yetkinlik ve beceri kanıtı',
    description:
      'Beceri iddialarını özgeçmiş kelimeleri yerine görüşmedeki izinli kanıt alıntılarıyla ilişkilendirir.',
    route: ATS_PRODUCT_HUB_ENTRY.route,
    requiredModule: ATS_PRODUCT_HUB_ENTRY.requiredModule,
    targetRoles: ['CANDIDATE', 'RECRUITER', 'HIRING_MANAGER', 'INTERVIEWER'],
    mode: 'PROPOSAL_ONLY',
    liveDependency: 'Onaylı beceri sözlüğü ve role özgü değerlendirme ölçütleri',
    actionCeiling:
      'İnsan onayı bekleyen etiket taslağı; otomatik eleme, eşleştirme veya sıralama yoktur.',
    safePreview: {
      scenario: 'Sentetik yanıt, problem çözme ölçütüyle ilişkili açık bir örnek içerir.',
      output: 'Kanıt alıntısı ve insanın onaylayabileceği beceri etiketi taslağı gösterilir.',
      boundary: 'Etiket kaydedilmez ve aday hakkında nihai çıkarım yapılmaz.',
    },
  },
  {
    id: 'media-integrity',
    title: 'Medya bütünlüğü ve içerik güveni',
    description:
      'Yüklenen görüşme kanıtının teknik bütünlük sinyallerini inceleme kuyruğuna taşır.',
    route: ATS_PRODUCT_HUB_ENTRY.route,
    requiredModule: ATS_PRODUCT_HUB_ENTRY.requiredModule,
    targetRoles: ['RECRUITER', 'AUDITOR', 'ADMIN'],
    mode: 'SYNTHETIC_SANDBOX',
    liveDependency: 'Onaylı bütünlük sağlayıcısı, kalibre edilmiş eşikler ve itiraz süreci',
    actionCeiling:
      'Yalnız sentetik teknik sinyal; aldatma tespiti, kişi suçlama veya otomatik ret yoktur.',
    safePreview: {
      scenario: 'Sentetik medya manifestinde beklenen dosya özeti ile gelen özet uyuşmaz.',
      output: 'Teknik yeniden-doğrulama uyarısı ve insan inceleme adımı gösterilir.',
      boundary: 'Kişi niyeti veya aldatma çıkarımı yapılmaz; aday kararı etkilenmez.',
    },
  },
  {
    id: 'agentic-screening',
    title: 'Ajan destekli tarama önerileri',
    description:
      'Gelecekteki ajan destekli iş akışının sınırlarını görünür kılar; bağımsız karar yetkisi vermez.',
    route: ATS_PRODUCT_HUB_ENTRY.route,
    requiredModule: ATS_PRODUCT_HUB_ENTRY.requiredModule,
    targetRoles: ['RECRUITER', 'HIRING_MANAGER', 'AUDITOR', 'ADMIN'],
    mode: 'OWNER_GATED',
    liveDependency: 'Owner, Legal/DPO, müşteri ve yüksek-risk uygunluk kararı',
    actionCeiling: 'Kapalıdır; otomatik eleme, sıralama, iletişim veya üretim mutasyonu yapılamaz.',
    safePreview: null,
  },
] as const satisfies readonly AtsCapabilityDefinition[];

export type AtsResolvedCapabilityDefinition = Omit<
  AtsCapabilityDefinition,
  'remoteEnabledMode' | 'remoteEnabledActionCeiling'
>;

/** Resolve only registry-declared runtime changes; never infer authorization. */
export const resolveAtsCapabilities = (
  remoteEnabled: boolean,
): readonly AtsResolvedCapabilityDefinition[] =>
  ATS_CAPABILITY_REGISTRY.map(
    (definition: AtsCapabilityDefinition): AtsResolvedCapabilityDefinition => {
      const { remoteEnabledMode, remoteEnabledActionCeiling, ...capability } = definition;
      return {
        ...capability,
        mode: remoteEnabled && remoteEnabledMode ? remoteEnabledMode : capability.mode,
        actionCeiling:
          remoteEnabled && remoteEnabledActionCeiling
            ? remoteEnabledActionCeiling
            : capability.actionCeiling,
      };
    },
  );
