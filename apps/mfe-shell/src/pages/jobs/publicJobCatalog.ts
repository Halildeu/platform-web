export type PublicJob = {
  slug: string;
  title: string;
  team: string;
  location: string;
  mode: string;
  employmentType: string;
  summary: string;
  highlights: readonly string[];
};

export const PUBLIC_JOBS = [
  {
    slug: 'urun-yoneticisi',
    title: 'Ürün Yöneticisi',
    team: 'Ürün ve Deneyim',
    location: 'İstanbul',
    mode: 'Hibrit',
    employmentType: 'Tam zamanlı',
    summary:
      'Kullanıcı ihtiyaçlarını ölçülebilir ürün sonuçlarına dönüştürün; keşiften teslimata kadar ekiplerle birlikte ilerleyin.',
    highlights: ['Ürün keşfi', 'Yol haritası', 'Kullanıcı araştırması'],
  },
  {
    slug: 'senior-frontend-developer',
    title: 'Senior Frontend Developer',
    team: 'Platform Engineering',
    location: 'İstanbul',
    mode: 'Hibrit',
    employmentType: 'Tam zamanlı',
    summary:
      'Erişilebilir, hızlı ve güvenilir ürün yüzeyleri geliştirin; tasarım sistemi ve platform ekipleriyle ölçeklenebilir deneyimler kurun.',
    highlights: ['React', 'TypeScript', 'Erişilebilirlik'],
  },
  {
    slug: 'product-designer',
    title: 'Product Designer',
    team: 'Ürün ve Deneyim',
    location: 'Türkiye',
    mode: 'Uzaktan',
    employmentType: 'Tam zamanlı',
    summary:
      'Araştırma içgörülerini anlaşılır akışlara dönüştürün; ürün ekipleriyle uçtan uca ve kapsayıcı deneyimler tasarlayın.',
    highlights: ['Ürün tasarımı', 'Prototipleme', 'Tasarım sistemi'],
  },
] as const satisfies readonly PublicJob[];

export const PUBLIC_JOB_BY_SLUG: Readonly<Record<string, PublicJob>> = Object.fromEntries(
  PUBLIC_JOBS.map((job) => [job.slug, job]),
);
