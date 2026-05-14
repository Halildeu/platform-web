/**
 * Türkiye 81 İl (Province) Metadata + Alias Index
 * =================================================
 *
 * Single source of truth for TR province codes, display names, geographic
 * coordinates, and region grouping. Used by the HR Demographic Report module
 * to normalize backend response labels (which arrive in various forms:
 * UPPERCASE Turkish, ASCII-folded, sub-region splits like "İSTANBUL(AVRUPA)")
 * into canonical ISO 3166-2 TR-XX codes for choropleth rendering.
 *
 * ## Alias logic
 *
 * Backend HR API may emit labels in any of these shapes:
 *   - Canonical TitleCase Turkish:  "İstanbul", "Çanakkale", "Şanlıurfa"
 *   - UPPERCASE Turkish:            "İSTANBUL", "ÇANAKKALE", "ŞANLIURFA"
 *   - ASCII-folded UPPERCASE:       "ISTANBUL", "CANAKKALE", "SANLIURFA"
 *   - Sub-region splits:            "İSTANBUL(AVRUPA)", "İSTANBUL(ANADOLU)"
 *
 * All forms map to a single canonical TR-XX code via TR_PROVINCE_ALIASES.
 *
 * ## İstanbul split labels
 *
 * The Avrupa/Anadolu split labels merge to TR-34 here. The source-side
 * breakdown (employee counts by European vs Anatolian side) is preserved by
 * the adapter layer (`api.ts`/`adapter`), not lost in this normalization step.
 *
 * ## References
 *
 * - PR-X14 Codex thread `019e26a9` plan-time AGREE: confirmed 81-province
 *   coverage + ASCII-fold alias strategy + İstanbul merge semantics.
 * - ISO 3166-2:TR (Türkiye plate codes 01-81, matches code suffix).
 */

export interface TRProvince {
  /** ISO 3166-2 code, e.g. 'TR-34' for İstanbul (matches plate code, zero-padded) */
  code: string;
  /** TR plate code (1-81) */
  plate: number;
  /** Canonical Turkish display name (TitleCase, proper Turkish chars), e.g. 'İstanbul' */
  name: string;
  /** Province center coordinates [longitude, latitude] in WGS84, decimal degrees */
  coordinates: [number, number];
  /** Geographic region of Türkiye */
  region:
    | 'Marmara'
    | 'Ege'
    | 'Akdeniz'
    | 'İç Anadolu'
    | 'Karadeniz'
    | 'Doğu Anadolu'
    | 'Güneydoğu Anadolu';
}

/**
 * All 81 Turkish provinces in standard plate code order (TR-01 Adana ... TR-81 Düzce).
 * Coordinates reflect each province's center (valilik / il merkezi), WGS84 lon/lat.
 */
export const TR_PROVINCES: readonly TRProvince[] = [
  { code: 'TR-01', plate: 1, name: 'Adana', coordinates: [35.32, 37.0], region: 'Akdeniz' },
  {
    code: 'TR-02',
    plate: 2,
    name: 'Adıyaman',
    coordinates: [38.28, 37.76],
    region: 'Güneydoğu Anadolu',
  },
  { code: 'TR-03', plate: 3, name: 'Afyonkarahisar', coordinates: [30.54, 38.76], region: 'Ege' },
  { code: 'TR-04', plate: 4, name: 'Ağrı', coordinates: [43.05, 39.72], region: 'Doğu Anadolu' },
  { code: 'TR-05', plate: 5, name: 'Amasya', coordinates: [35.83, 40.65], region: 'Karadeniz' },
  { code: 'TR-06', plate: 6, name: 'Ankara', coordinates: [32.85, 39.93], region: 'İç Anadolu' },
  { code: 'TR-07', plate: 7, name: 'Antalya', coordinates: [30.71, 36.9], region: 'Akdeniz' },
  { code: 'TR-08', plate: 8, name: 'Artvin', coordinates: [41.82, 41.18], region: 'Karadeniz' },
  { code: 'TR-09', plate: 9, name: 'Aydın', coordinates: [27.84, 37.85], region: 'Ege' },
  { code: 'TR-10', plate: 10, name: 'Balıkesir', coordinates: [27.88, 39.65], region: 'Marmara' },
  { code: 'TR-11', plate: 11, name: 'Bilecik', coordinates: [29.98, 40.14], region: 'Marmara' },
  { code: 'TR-12', plate: 12, name: 'Bingöl', coordinates: [40.5, 38.88], region: 'Doğu Anadolu' },
  { code: 'TR-13', plate: 13, name: 'Bitlis', coordinates: [42.11, 38.4], region: 'Doğu Anadolu' },
  { code: 'TR-14', plate: 14, name: 'Bolu', coordinates: [31.61, 40.74], region: 'Karadeniz' },
  { code: 'TR-15', plate: 15, name: 'Burdur', coordinates: [30.29, 37.72], region: 'Akdeniz' },
  { code: 'TR-16', plate: 16, name: 'Bursa', coordinates: [29.06, 40.18], region: 'Marmara' },
  { code: 'TR-17', plate: 17, name: 'Çanakkale', coordinates: [26.41, 40.15], region: 'Marmara' },
  { code: 'TR-18', plate: 18, name: 'Çankırı', coordinates: [33.62, 40.6], region: 'İç Anadolu' },
  { code: 'TR-19', plate: 19, name: 'Çorum', coordinates: [34.95, 40.55], region: 'Karadeniz' },
  { code: 'TR-20', plate: 20, name: 'Denizli', coordinates: [29.09, 37.78], region: 'Ege' },
  {
    code: 'TR-21',
    plate: 21,
    name: 'Diyarbakır',
    coordinates: [40.23, 37.91],
    region: 'Güneydoğu Anadolu',
  },
  { code: 'TR-22', plate: 22, name: 'Edirne', coordinates: [26.56, 41.67], region: 'Marmara' },
  { code: 'TR-23', plate: 23, name: 'Elazığ', coordinates: [39.22, 38.68], region: 'Doğu Anadolu' },
  {
    code: 'TR-24',
    plate: 24,
    name: 'Erzincan',
    coordinates: [39.49, 39.75],
    region: 'Doğu Anadolu',
  },
  { code: 'TR-25', plate: 25, name: 'Erzurum', coordinates: [41.27, 39.9], region: 'Doğu Anadolu' },
  {
    code: 'TR-26',
    plate: 26,
    name: 'Eskişehir',
    coordinates: [30.52, 39.78],
    region: 'İç Anadolu',
  },
  {
    code: 'TR-27',
    plate: 27,
    name: 'Gaziantep',
    coordinates: [37.38, 37.07],
    region: 'Güneydoğu Anadolu',
  },
  { code: 'TR-28', plate: 28, name: 'Giresun', coordinates: [38.39, 40.91], region: 'Karadeniz' },
  { code: 'TR-29', plate: 29, name: 'Gümüşhane', coordinates: [39.48, 40.46], region: 'Karadeniz' },
  {
    code: 'TR-30',
    plate: 30,
    name: 'Hakkari',
    coordinates: [43.74, 37.58],
    region: 'Doğu Anadolu',
  },
  { code: 'TR-31', plate: 31, name: 'Hatay', coordinates: [36.16, 36.2], region: 'Akdeniz' },
  { code: 'TR-32', plate: 32, name: 'Isparta', coordinates: [30.55, 37.76], region: 'Akdeniz' },
  { code: 'TR-33', plate: 33, name: 'Mersin', coordinates: [34.64, 36.81], region: 'Akdeniz' },
  { code: 'TR-34', plate: 34, name: 'İstanbul', coordinates: [28.96, 41.01], region: 'Marmara' },
  { code: 'TR-35', plate: 35, name: 'İzmir', coordinates: [27.14, 38.42], region: 'Ege' },
  { code: 'TR-36', plate: 36, name: 'Kars', coordinates: [43.09, 40.6], region: 'Doğu Anadolu' },
  { code: 'TR-37', plate: 37, name: 'Kastamonu', coordinates: [33.78, 41.39], region: 'Karadeniz' },
  { code: 'TR-38', plate: 38, name: 'Kayseri', coordinates: [35.48, 38.72], region: 'İç Anadolu' },
  { code: 'TR-39', plate: 39, name: 'Kırklareli', coordinates: [27.22, 41.73], region: 'Marmara' },
  { code: 'TR-40', plate: 40, name: 'Kırşehir', coordinates: [34.17, 39.15], region: 'İç Anadolu' },
  { code: 'TR-41', plate: 41, name: 'Kocaeli', coordinates: [29.94, 40.77], region: 'Marmara' },
  { code: 'TR-42', plate: 42, name: 'Konya', coordinates: [32.49, 37.87], region: 'İç Anadolu' },
  { code: 'TR-43', plate: 43, name: 'Kütahya', coordinates: [29.99, 39.42], region: 'Ege' },
  {
    code: 'TR-44',
    plate: 44,
    name: 'Malatya',
    coordinates: [38.32, 38.36],
    region: 'Doğu Anadolu',
  },
  { code: 'TR-45', plate: 45, name: 'Manisa', coordinates: [27.43, 38.61], region: 'Ege' },
  {
    code: 'TR-46',
    plate: 46,
    name: 'Kahramanmaraş',
    coordinates: [36.94, 37.58],
    region: 'Akdeniz',
  },
  {
    code: 'TR-47',
    plate: 47,
    name: 'Mardin',
    coordinates: [40.74, 37.31],
    region: 'Güneydoğu Anadolu',
  },
  { code: 'TR-48', plate: 48, name: 'Muğla', coordinates: [28.36, 37.22], region: 'Ege' },
  { code: 'TR-49', plate: 49, name: 'Muş', coordinates: [41.5, 38.74], region: 'Doğu Anadolu' },
  { code: 'TR-50', plate: 50, name: 'Nevşehir', coordinates: [34.71, 38.63], region: 'İç Anadolu' },
  { code: 'TR-51', plate: 51, name: 'Niğde', coordinates: [34.68, 37.97], region: 'İç Anadolu' },
  { code: 'TR-52', plate: 52, name: 'Ordu', coordinates: [37.88, 40.98], region: 'Karadeniz' },
  { code: 'TR-53', plate: 53, name: 'Rize', coordinates: [40.52, 41.02], region: 'Karadeniz' },
  { code: 'TR-54', plate: 54, name: 'Sakarya', coordinates: [30.4, 40.78], region: 'Marmara' },
  { code: 'TR-55', plate: 55, name: 'Samsun', coordinates: [36.33, 41.29], region: 'Karadeniz' },
  {
    code: 'TR-56',
    plate: 56,
    name: 'Siirt',
    coordinates: [41.94, 37.93],
    region: 'Güneydoğu Anadolu',
  },
  { code: 'TR-57', plate: 57, name: 'Sinop', coordinates: [35.16, 42.03], region: 'Karadeniz' },
  { code: 'TR-58', plate: 58, name: 'Sivas', coordinates: [37.02, 39.75], region: 'İç Anadolu' },
  { code: 'TR-59', plate: 59, name: 'Tekirdağ', coordinates: [27.51, 40.98], region: 'Marmara' },
  { code: 'TR-60', plate: 60, name: 'Tokat', coordinates: [36.55, 40.32], region: 'Karadeniz' },
  { code: 'TR-61', plate: 61, name: 'Trabzon', coordinates: [39.73, 41.0], region: 'Karadeniz' },
  {
    code: 'TR-62',
    plate: 62,
    name: 'Tunceli',
    coordinates: [39.54, 39.11],
    region: 'Doğu Anadolu',
  },
  {
    code: 'TR-63',
    plate: 63,
    name: 'Şanlıurfa',
    coordinates: [38.79, 37.17],
    region: 'Güneydoğu Anadolu',
  },
  { code: 'TR-64', plate: 64, name: 'Uşak', coordinates: [29.41, 38.68], region: 'Ege' },
  { code: 'TR-65', plate: 65, name: 'Van', coordinates: [43.41, 38.5], region: 'Doğu Anadolu' },
  { code: 'TR-66', plate: 66, name: 'Yozgat', coordinates: [34.81, 39.82], region: 'İç Anadolu' },
  { code: 'TR-67', plate: 67, name: 'Zonguldak', coordinates: [31.79, 41.46], region: 'Karadeniz' },
  { code: 'TR-68', plate: 68, name: 'Aksaray', coordinates: [34.03, 38.37], region: 'İç Anadolu' },
  { code: 'TR-69', plate: 69, name: 'Bayburt', coordinates: [40.23, 40.26], region: 'Karadeniz' },
  { code: 'TR-70', plate: 70, name: 'Karaman', coordinates: [33.22, 37.18], region: 'İç Anadolu' },
  {
    code: 'TR-71',
    plate: 71,
    name: 'Kırıkkale',
    coordinates: [33.51, 39.85],
    region: 'İç Anadolu',
  },
  {
    code: 'TR-72',
    plate: 72,
    name: 'Batman',
    coordinates: [41.13, 37.88],
    region: 'Güneydoğu Anadolu',
  },
  {
    code: 'TR-73',
    plate: 73,
    name: 'Şırnak',
    coordinates: [42.46, 37.52],
    region: 'Güneydoğu Anadolu',
  },
  { code: 'TR-74', plate: 74, name: 'Bartın', coordinates: [32.34, 41.64], region: 'Karadeniz' },
  { code: 'TR-75', plate: 75, name: 'Ardahan', coordinates: [42.7, 41.11], region: 'Doğu Anadolu' },
  { code: 'TR-76', plate: 76, name: 'Iğdır', coordinates: [44.05, 39.92], region: 'Doğu Anadolu' },
  { code: 'TR-77', plate: 77, name: 'Yalova', coordinates: [29.27, 40.65], region: 'Marmara' },
  { code: 'TR-78', plate: 78, name: 'Karabük', coordinates: [32.62, 41.2], region: 'Karadeniz' },
  {
    code: 'TR-79',
    plate: 79,
    name: 'Kilis',
    coordinates: [37.11, 36.72],
    region: 'Güneydoğu Anadolu',
  },
  { code: 'TR-80', plate: 80, name: 'Osmaniye', coordinates: [36.25, 37.07], region: 'Akdeniz' },
  { code: 'TR-81', plate: 81, name: 'Düzce', coordinates: [31.16, 40.84], region: 'Karadeniz' },
];

/**
 * Maps various label forms (UPPERCASE Turkish, ASCII-folded, sub-region splits)
 * to canonical TR-XX codes. Used by adapter to normalize incoming HR API labels.
 *
 * Coverage per province:
 *   - Canonical TitleCase (e.g. "İstanbul")
 *   - UPPERCASE Turkish (e.g. "İSTANBUL")
 *   - ASCII-folded UPPERCASE (e.g. "ISTANBUL")
 *   - UPPERCASE TR-locale uppercasing of canonical (covers `i` → `İ` edge)
 *
 * Special: İstanbul Avrupa/Anadolu split labels merge to TR-34.
 */
export const TR_PROVINCE_ALIASES: Readonly<Record<string, string>> = {
  // TR-01 Adana
  Adana: 'TR-01',
  ADANA: 'TR-01',
  // TR-02 Adıyaman
  Adıyaman: 'TR-02',
  ADIYAMAN: 'TR-02',
  ADİYAMAN: 'TR-02',
  // TR-03 Afyonkarahisar
  Afyonkarahisar: 'TR-03',
  AFYONKARAHİSAR: 'TR-03',
  AFYONKARAHISAR: 'TR-03',
  AFYON: 'TR-03',
  // TR-04 Ağrı
  Ağrı: 'TR-04',
  AĞRI: 'TR-04',
  AGRI: 'TR-04',
  // TR-05 Amasya
  Amasya: 'TR-05',
  AMASYA: 'TR-05',
  // TR-06 Ankara
  Ankara: 'TR-06',
  ANKARA: 'TR-06',
  // TR-07 Antalya
  Antalya: 'TR-07',
  ANTALYA: 'TR-07',
  // TR-08 Artvin
  Artvin: 'TR-08',
  ARTVIN: 'TR-08',
  ARTVİN: 'TR-08',
  // TR-09 Aydın
  Aydın: 'TR-09',
  AYDIN: 'TR-09',
  // TR-10 Balıkesir
  Balıkesir: 'TR-10',
  BALIKESİR: 'TR-10',
  BALIKESIR: 'TR-10',
  // TR-11 Bilecik
  Bilecik: 'TR-11',
  BILECIK: 'TR-11',
  BİLECİK: 'TR-11',
  // TR-12 Bingöl
  Bingöl: 'TR-12',
  BİNGÖL: 'TR-12',
  BINGOL: 'TR-12',
  // TR-13 Bitlis
  Bitlis: 'TR-13',
  BITLIS: 'TR-13',
  BİTLİS: 'TR-13',
  // TR-14 Bolu
  Bolu: 'TR-14',
  BOLU: 'TR-14',
  // TR-15 Burdur
  Burdur: 'TR-15',
  BURDUR: 'TR-15',
  // TR-16 Bursa
  Bursa: 'TR-16',
  BURSA: 'TR-16',
  // TR-17 Çanakkale
  Çanakkale: 'TR-17',
  ÇANAKKALE: 'TR-17',
  CANAKKALE: 'TR-17',
  // TR-18 Çankırı
  Çankırı: 'TR-18',
  ÇANKIRI: 'TR-18',
  CANKIRI: 'TR-18',
  // TR-19 Çorum
  Çorum: 'TR-19',
  ÇORUM: 'TR-19',
  CORUM: 'TR-19',
  // TR-20 Denizli
  Denizli: 'TR-20',
  DENIZLI: 'TR-20',
  DENİZLİ: 'TR-20',
  // TR-21 Diyarbakır
  Diyarbakır: 'TR-21',
  DİYARBAKIR: 'TR-21',
  DIYARBAKIR: 'TR-21',
  // TR-22 Edirne
  Edirne: 'TR-22',
  EDIRNE: 'TR-22',
  EDİRNE: 'TR-22',
  // TR-23 Elazığ
  Elazığ: 'TR-23',
  ELAZIĞ: 'TR-23',
  ELAZIG: 'TR-23',
  // TR-24 Erzincan
  Erzincan: 'TR-24',
  ERZINCAN: 'TR-24',
  ERZİNCAN: 'TR-24',
  // TR-25 Erzurum
  Erzurum: 'TR-25',
  ERZURUM: 'TR-25',
  // TR-26 Eskişehir
  Eskişehir: 'TR-26',
  ESKİŞEHİR: 'TR-26',
  ESKISEHIR: 'TR-26',
  // TR-27 Gaziantep
  Gaziantep: 'TR-27',
  GAZIANTEP: 'TR-27',
  GAZİANTEP: 'TR-27',
  ANTEP: 'TR-27',
  // TR-28 Giresun
  Giresun: 'TR-28',
  GIRESUN: 'TR-28',
  GİRESUN: 'TR-28',
  // TR-29 Gümüşhane
  Gümüşhane: 'TR-29',
  GÜMÜŞHANE: 'TR-29',
  GUMUSHANE: 'TR-29',
  // TR-30 Hakkari
  Hakkari: 'TR-30',
  HAKKARI: 'TR-30',
  HAKKÂRİ: 'TR-30',
  HAKKARİ: 'TR-30',
  // TR-31 Hatay
  Hatay: 'TR-31',
  HATAY: 'TR-31',
  // TR-32 Isparta
  Isparta: 'TR-32',
  ISPARTA: 'TR-32',
  // TR-33 Mersin
  Mersin: 'TR-33',
  MERSIN: 'TR-33',
  MERSİN: 'TR-33',
  İÇEL: 'TR-33',
  ICEL: 'TR-33',
  // TR-34 İstanbul (merges Avrupa/Anadolu splits)
  İstanbul: 'TR-34',
  İSTANBUL: 'TR-34',
  ISTANBUL: 'TR-34',
  'İSTANBUL(AVRUPA)': 'TR-34',
  'İSTANBUL(ANADOLU)': 'TR-34',
  'ISTANBUL(AVRUPA)': 'TR-34',
  'ISTANBUL(ANADOLU)': 'TR-34',
  'İSTANBUL (AVRUPA)': 'TR-34',
  'İSTANBUL (ANADOLU)': 'TR-34',
  'ISTANBUL (AVRUPA)': 'TR-34',
  'ISTANBUL (ANADOLU)': 'TR-34',
  // TR-35 İzmir
  İzmir: 'TR-35',
  İZMİR: 'TR-35',
  IZMIR: 'TR-35',
  // TR-36 Kars
  Kars: 'TR-36',
  KARS: 'TR-36',
  // TR-37 Kastamonu
  Kastamonu: 'TR-37',
  KASTAMONU: 'TR-37',
  // TR-38 Kayseri
  Kayseri: 'TR-38',
  KAYSERI: 'TR-38',
  KAYSERİ: 'TR-38',
  // TR-39 Kırklareli
  Kırklareli: 'TR-39',
  KIRKLARELİ: 'TR-39',
  KIRKLARELI: 'TR-39',
  // TR-40 Kırşehir
  Kırşehir: 'TR-40',
  KIRŞEHİR: 'TR-40',
  KIRSEHIR: 'TR-40',
  // TR-41 Kocaeli
  Kocaeli: 'TR-41',
  KOCAELI: 'TR-41',
  KOCAELİ: 'TR-41',
  İZMİT: 'TR-41',
  IZMIT: 'TR-41',
  // TR-42 Konya
  Konya: 'TR-42',
  KONYA: 'TR-42',
  // TR-43 Kütahya
  Kütahya: 'TR-43',
  KÜTAHYA: 'TR-43',
  KUTAHYA: 'TR-43',
  // TR-44 Malatya
  Malatya: 'TR-44',
  MALATYA: 'TR-44',
  // TR-45 Manisa
  Manisa: 'TR-45',
  MANISA: 'TR-45',
  MANİSA: 'TR-45',
  // TR-46 Kahramanmaraş
  Kahramanmaraş: 'TR-46',
  KAHRAMANMARAŞ: 'TR-46',
  KAHRAMANMARAS: 'TR-46',
  MARAŞ: 'TR-46',
  MARAS: 'TR-46',
  // TR-47 Mardin
  Mardin: 'TR-47',
  MARDIN: 'TR-47',
  MARDİN: 'TR-47',
  // TR-48 Muğla
  Muğla: 'TR-48',
  MUĞLA: 'TR-48',
  MUGLA: 'TR-48',
  // TR-49 Muş
  Muş: 'TR-49',
  MUŞ: 'TR-49',
  MUS: 'TR-49',
  // TR-50 Nevşehir
  Nevşehir: 'TR-50',
  NEVŞEHİR: 'TR-50',
  NEVSEHIR: 'TR-50',
  // TR-51 Niğde
  Niğde: 'TR-51',
  NİĞDE: 'TR-51',
  NIGDE: 'TR-51',
  // TR-52 Ordu
  Ordu: 'TR-52',
  ORDU: 'TR-52',
  // TR-53 Rize
  Rize: 'TR-53',
  RIZE: 'TR-53',
  RİZE: 'TR-53',
  // TR-54 Sakarya
  Sakarya: 'TR-54',
  SAKARYA: 'TR-54',
  ADAPAZARI: 'TR-54',
  // TR-55 Samsun
  Samsun: 'TR-55',
  SAMSUN: 'TR-55',
  // TR-56 Siirt
  Siirt: 'TR-56',
  SIIRT: 'TR-56',
  SİİRT: 'TR-56',
  // TR-57 Sinop
  Sinop: 'TR-57',
  SINOP: 'TR-57',
  SİNOP: 'TR-57',
  // TR-58 Sivas
  Sivas: 'TR-58',
  SIVAS: 'TR-58',
  SİVAS: 'TR-58',
  // TR-59 Tekirdağ
  Tekirdağ: 'TR-59',
  TEKİRDAĞ: 'TR-59',
  TEKIRDAG: 'TR-59',
  // TR-60 Tokat
  Tokat: 'TR-60',
  TOKAT: 'TR-60',
  // TR-61 Trabzon
  Trabzon: 'TR-61',
  TRABZON: 'TR-61',
  // TR-62 Tunceli
  Tunceli: 'TR-62',
  TUNCELI: 'TR-62',
  TUNCELİ: 'TR-62',
  // TR-63 Şanlıurfa
  Şanlıurfa: 'TR-63',
  ŞANLIURFA: 'TR-63',
  SANLIURFA: 'TR-63',
  URFA: 'TR-63',
  // TR-64 Uşak
  Uşak: 'TR-64',
  UŞAK: 'TR-64',
  USAK: 'TR-64',
  // TR-65 Van
  Van: 'TR-65',
  VAN: 'TR-65',
  // TR-66 Yozgat
  Yozgat: 'TR-66',
  YOZGAT: 'TR-66',
  // TR-67 Zonguldak
  Zonguldak: 'TR-67',
  ZONGULDAK: 'TR-67',
  // TR-68 Aksaray
  Aksaray: 'TR-68',
  AKSARAY: 'TR-68',
  // TR-69 Bayburt
  Bayburt: 'TR-69',
  BAYBURT: 'TR-69',
  // TR-70 Karaman
  Karaman: 'TR-70',
  KARAMAN: 'TR-70',
  // TR-71 Kırıkkale
  Kırıkkale: 'TR-71',
  KIRIKKALE: 'TR-71',
  // TR-72 Batman
  Batman: 'TR-72',
  BATMAN: 'TR-72',
  // TR-73 Şırnak
  Şırnak: 'TR-73',
  ŞIRNAK: 'TR-73',
  SIRNAK: 'TR-73',
  // TR-74 Bartın
  Bartın: 'TR-74',
  BARTIN: 'TR-74',
  // TR-75 Ardahan
  Ardahan: 'TR-75',
  ARDAHAN: 'TR-75',
  // TR-76 Iğdır
  Iğdır: 'TR-76',
  IĞDIR: 'TR-76',
  IGDIR: 'TR-76',
  // TR-77 Yalova
  Yalova: 'TR-77',
  YALOVA: 'TR-77',
  // TR-78 Karabük
  Karabük: 'TR-78',
  KARABÜK: 'TR-78',
  KARABUK: 'TR-78',
  // TR-79 Kilis
  Kilis: 'TR-79',
  KILIS: 'TR-79',
  KİLİS: 'TR-79',
  // TR-80 Osmaniye
  Osmaniye: 'TR-80',
  OSMANIYE: 'TR-80',
  OSMANİYE: 'TR-80',
  // TR-81 Düzce
  Düzce: 'TR-81',
  DÜZCE: 'TR-81',
  DUZCE: 'TR-81',
};

// Lookup map: TR-XX code → TRProvince
const PROVINCE_BY_CODE: ReadonlyMap<string, TRProvince> = new Map(
  TR_PROVINCES.map((p) => [p.code, p]),
);

/**
 * Build a key for case-insensitive alias lookup.
 * Normalizes whitespace, uppercases (TR-locale aware), but preserves Turkish chars
 * AND also tries ASCII-folded variant.
 */
function buildLookupKeys(label: string): string[] {
  const trimmed = label.trim();
  if (!trimmed) return [];
  const keys = new Set<string>();
  keys.add(trimmed);
  // Turkish-locale uppercase (handles i → İ, ı → I)
  try {
    keys.add(trimmed.toLocaleUpperCase('tr-TR'));
  } catch {
    keys.add(trimmed.toUpperCase());
  }
  keys.add(trimmed.toUpperCase());
  // ASCII-folded uppercase variant
  const folded = trimmed
    .replace(/İ/g, 'I')
    .replace(/ı/g, 'i')
    .replace(/Ş/g, 'S')
    .replace(/ş/g, 's')
    .replace(/Ğ/g, 'G')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'U')
    .replace(/ü/g, 'u')
    .replace(/Ö/g, 'O')
    .replace(/ö/g, 'o')
    .replace(/Ç/g, 'C')
    .replace(/ç/g, 'c')
    .replace(/Â/g, 'A')
    .replace(/â/g, 'a');
  keys.add(folded);
  keys.add(folded.toUpperCase());
  // Strip parenthetical sub-region tail and try again (defensive — splits should already be aliased)
  const stripped = trimmed.replace(/\s*\([^)]*\)\s*$/u, '');
  if (stripped && stripped !== trimmed) {
    keys.add(stripped);
    try {
      keys.add(stripped.toLocaleUpperCase('tr-TR'));
    } catch {
      keys.add(stripped.toUpperCase());
    }
    keys.add(stripped.toUpperCase());
    const strippedFolded = stripped
      .replace(/İ/g, 'I')
      .replace(/ı/g, 'i')
      .replace(/Ş/g, 'S')
      .replace(/ş/g, 's')
      .replace(/Ğ/g, 'G')
      .replace(/ğ/g, 'g')
      .replace(/Ü/g, 'U')
      .replace(/ü/g, 'u')
      .replace(/Ö/g, 'O')
      .replace(/ö/g, 'o')
      .replace(/Ç/g, 'C')
      .replace(/ç/g, 'c')
      .replace(/Â/g, 'A')
      .replace(/â/g, 'a');
    keys.add(strippedFolded);
    keys.add(strippedFolded.toUpperCase());
  }
  return Array.from(keys);
}

/**
 * Find TR-XX code by display name (case-insensitive, alias-aware).
 * Returns null if no match.
 *
 * Examples:
 *   findProvinceCodeByLabel('İstanbul')          → 'TR-34'
 *   findProvinceCodeByLabel('ISTANBUL')          → 'TR-34'
 *   findProvinceCodeByLabel('İSTANBUL(AVRUPA)')  → 'TR-34'
 *   findProvinceCodeByLabel('Çanakkale')         → 'TR-17'
 *   findProvinceCodeByLabel('CANAKKALE')         → 'TR-17'
 *   findProvinceCodeByLabel('Atlantis')          → null
 */
export function findProvinceCodeByLabel(label: string): string | null {
  if (!label || typeof label !== 'string') return null;
  // Direct TR-XX code passthrough
  const codeMatch = label
    .trim()
    .toUpperCase()
    .match(/^TR-(\d{2})$/);
  if (codeMatch) {
    const candidate = `TR-${codeMatch[1]}`;
    if (PROVINCE_BY_CODE.has(candidate)) return candidate;
  }
  const keys = buildLookupKeys(label);
  for (const key of keys) {
    const hit = TR_PROVINCE_ALIASES[key];
    if (hit) return hit;
  }
  return null;
}

/**
 * Get full province metadata by TR-XX code. Returns undefined if invalid.
 *
 * Examples:
 *   getProvinceByCode('TR-34') → { code: 'TR-34', plate: 34, name: 'İstanbul', ... }
 *   getProvinceByCode('TR-99') → undefined
 */
export function getProvinceByCode(code: string): TRProvince | undefined {
  if (!code || typeof code !== 'string') return undefined;
  return PROVINCE_BY_CODE.get(code.trim().toUpperCase());
}

/**
 * Normalize a province label to its canonical Turkish display name (TitleCase).
 * Returns null if the label doesn't match any known province.
 *
 * Examples:
 *   normalizeProvinceLabel('ISTANBUL')         → 'İstanbul'
 *   normalizeProvinceLabel('İSTANBUL(AVRUPA)') → 'İstanbul'
 *   normalizeProvinceLabel('CANAKKALE')        → 'Çanakkale'
 *   normalizeProvinceLabel('Atlantis')         → null
 */
export function normalizeProvinceLabel(label: string): string | null {
  const code = findProvinceCodeByLabel(label);
  if (!code) return null;
  const province = PROVINCE_BY_CODE.get(code);
  return province ? province.name : null;
}

// ===========================================================================
// Invariants — fail loud if data drifts
// ===========================================================================

if (TR_PROVINCES.length !== 81) {
  throw new Error(`TR_PROVINCES expected 81, got ${TR_PROVINCES.length}`);
}
const _codes = new Set(TR_PROVINCES.map((p) => p.code));
if (_codes.size !== 81) {
  throw new Error(`TR_PROVINCES expected 81 unique codes, got ${_codes.size}`);
}
for (let i = 1; i <= 81; i++) {
  const code = `TR-${String(i).padStart(2, '0')}`;
  if (!_codes.has(code)) {
    throw new Error(`Missing province code: ${code}`);
  }
}
