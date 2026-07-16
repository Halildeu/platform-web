import { ATS_PRODUCT_HUB_ENTRY } from '../../ats-product-catalog/model/ats-capability-registry';

export const CANDIDATE_PORTAL_ENTRY = {
  id: 'candidate-portal',
  label: 'Aday Alanım',
  route: '/candidate',
  routePattern: '/candidate/*',
  mode: 'SYNTHETIC_SANDBOX',
} as const;

export const RECRUITER_WORKSPACE_ENTRY = {
  id: 'recruiter-workspace',
  label: 'İK Çalışma Alanı',
  route: '/admin/ats/recruiter',
  routePattern: '/admin/ats/recruiter/*',
  requiredModule: ATS_PRODUCT_HUB_ENTRY.requiredModule,
  mode: 'PROPOSAL_ONLY',
} as const;

export const ATS_PORTAL_SAFETY_BOUNDARIES = [
  'Gerçek aday hesabı yoktur; CV/PDF içeriği okunmaz veya sunucuya gönderilmez.',
  'Mesaj, ret, teklif, sıralama ve toplu işlem yürütülmez.',
  'Bütün örnekler sentetiktir; tarayıcı dışına veri gönderilmez.',
] as const;

export interface CandidateProfileTask {
  id: string;
  label: string;
  state: 'READY' | 'IN_PROGRESS' | 'GATED';
  detail: string;
}

export const CANDIDATE_PROFILE_TASKS: readonly CandidateProfileTask[] = [
  {
    id: 'contact',
    label: 'İletişim bilgileri',
    state: 'READY',
    detail: 'Sentetik örnek alanlar düzenlemeye hazır.',
  },
  {
    id: 'experience',
    label: 'Deneyim ve eğitim özeti',
    state: 'IN_PROGRESS',
    detail: 'Örnek CV taslağındaki alanları gözden geçirin.',
  },
  {
    id: 'skills',
    label: 'Beceri ve bağlantılar',
    state: 'IN_PROGRESS',
    detail: 'Yalnız sizin doğruladığınız bilgiler taslakta kalır.',
  },
  {
    id: 'privacy',
    label: 'Aydınlatma ve açık onay',
    state: 'GATED',
    detail: 'Gerçek hesap ve KVKK akışı aktive edilmeden açılamaz.',
  },
] as const;

export interface CandidateJourneyStep {
  id: string;
  label: string;
  state: 'CURRENT' | 'NEXT' | 'GATED';
  description: string;
}

export const CANDIDATE_DEMO_JOURNEY: readonly CandidateJourneyStep[] = [
  {
    id: 'draft',
    label: 'Başvuru taslağı',
    state: 'CURRENT',
    description: 'Formu sentetik CV önerileriyle hazırlayın ve her alanı değiştirin.',
  },
  {
    id: 'review',
    label: 'Aday kontrolü',
    state: 'NEXT',
    description: 'Göndermeden önce bütün bilgileri, onayları ve ilan bağlamını inceleyin.',
  },
  {
    id: 'submitted',
    label: 'Kalıcı başvuru',
    state: 'GATED',
    description: 'Backend write, aday kimliği ve veri yönetişimi hazır olmadan çalışmaz.',
  },
  {
    id: 'interview',
    label: 'Mülakat ve değerlendirme',
    state: 'GATED',
    description: 'Gerçek davet, kayıt ve değerlendirme yalnız insan kontrollü canlı akışta açılır.',
  },
] as const;

export type RecruiterPipelineStage = 'NEW' | 'REVIEW' | 'INTERVIEW' | 'OFFER_DRAFT';

export const RECRUITER_PIPELINE_STAGES: ReadonlyArray<{
  id: RecruiterPipelineStage;
  label: string;
  description: string;
}> = [
  { id: 'NEW', label: 'Yeni', description: 'İnsan incelemesi henüz başlamadı.' },
  { id: 'REVIEW', label: 'İncelemede', description: 'Kanıt ve ölçüt kapsamı kontrol ediliyor.' },
  {
    id: 'INTERVIEW',
    label: 'Mülakat',
    description: 'Planlama veya insan değerlendirmesi bekliyor.',
  },
  {
    id: 'OFFER_DRAFT',
    label: 'Teklif taslağı',
    description: 'Yalnız taslak görünür; teklif gönderilemez.',
  },
] as const;

export interface RecruiterPosition {
  id: string;
  title: string;
  team: string;
  location: string;
  owner: string;
  openDays: number;
}

export const RECRUITER_POSITIONS: readonly RecruiterPosition[] = [
  {
    id: 'product-manager',
    title: 'Ürün Yöneticisi',
    team: 'Ürün',
    location: 'İstanbul · Hibrit',
    owner: 'İK Ekibi A',
    openDays: 12,
  },
  {
    id: 'frontend-developer',
    title: 'Senior Frontend Developer',
    team: 'Mühendislik',
    location: 'Türkiye · Uzaktan',
    owner: 'İK Ekibi B',
    openDays: 8,
  },
  {
    id: 'product-designer',
    title: 'Product Designer',
    team: 'Tasarım',
    location: 'İstanbul · Hibrit',
    owner: 'İK Ekibi A',
    openDays: 5,
  },
] as const;

export interface RecruiterCandidate {
  id: string;
  alias: string;
  positionId: string;
  stage: RecruiterPipelineStage;
  evidenceReady: number;
  evidenceTotal: number;
  waitingLabel: string;
  skills: readonly string[];
  humanReview: string;
}

export const RECRUITER_CANDIDATES: readonly RecruiterCandidate[] = [
  {
    id: 'demo-104',
    alias: 'Aday DEMO-104',
    positionId: 'product-manager',
    stage: 'NEW',
    evidenceReady: 2,
    evidenceTotal: 5,
    waitingLabel: 'Bugün eklendi',
    skills: ['Ürün keşfi', 'Analitik'],
    humanReview: 'İnsan incelemesi başlamadı.',
  },
  {
    id: 'demo-118',
    alias: 'Aday DEMO-118',
    positionId: 'product-manager',
    stage: 'REVIEW',
    evidenceReady: 4,
    evidenceTotal: 5,
    waitingLabel: '1 gündür bekliyor',
    skills: ['Kullanıcı araştırması', 'Yol haritası'],
    humanReview: 'Ölçüt kapsamı insan tarafından kontrol ediliyor.',
  },
  {
    id: 'demo-121',
    alias: 'Aday DEMO-121',
    positionId: 'product-manager',
    stage: 'INTERVIEW',
    evidenceReady: 3,
    evidenceTotal: 5,
    waitingLabel: 'Planlama bekliyor',
    skills: ['Paydaş yönetimi', 'Deney tasarımı'],
    humanReview: 'Mülakat planı ve değerlendirici ataması bekliyor.',
  },
  {
    id: 'demo-207',
    alias: 'Aday DEMO-207',
    positionId: 'frontend-developer',
    stage: 'NEW',
    evidenceReady: 3,
    evidenceTotal: 5,
    waitingLabel: 'Bugün eklendi',
    skills: ['React', 'Erişilebilirlik'],
    humanReview: 'İnsan incelemesi başlamadı.',
  },
  {
    id: 'demo-215',
    alias: 'Aday DEMO-215',
    positionId: 'frontend-developer',
    stage: 'REVIEW',
    evidenceReady: 5,
    evidenceTotal: 5,
    waitingLabel: '2 gündür bekliyor',
    skills: ['TypeScript', 'Web performansı'],
    humanReview: 'Teknik kanıt kapsamı insan tarafından inceleniyor.',
  },
  {
    id: 'demo-302',
    alias: 'Aday DEMO-302',
    positionId: 'product-designer',
    stage: 'INTERVIEW',
    evidenceReady: 4,
    evidenceTotal: 5,
    waitingLabel: 'Değerlendirme bekliyor',
    skills: ['Ürün tasarımı', 'Araştırma'],
    humanReview: 'Portföy kanıtı ve mülakat notu insan kontrolünde.',
  },
  {
    id: 'demo-309',
    alias: 'Aday DEMO-309',
    positionId: 'product-designer',
    stage: 'OFFER_DRAFT',
    evidenceReady: 5,
    evidenceTotal: 5,
    waitingLabel: 'Yetkili onayı bekliyor',
    skills: ['Etkileşim tasarımı', 'Tasarım sistemi'],
    humanReview: 'Teklif yalnız taslak; yetkili insan onayı olmadan gönderilemez.',
  },
] as const;

export const RECRUITER_DISABLED_ACTIONS = [
  'Adaya mesaj gönder',
  'Adayı reddet',
  'Teklif gönder',
] as const;
