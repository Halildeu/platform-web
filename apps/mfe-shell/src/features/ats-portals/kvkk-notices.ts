/**
 * KVKK aydınlatma metinleri — okunabilir içerik, sürüme bağlı.
 *
 * NEDEN VAR: sistemde yalnız sürüm KİMLİĞİ vardı (`kvkk-application-v1`), metnin
 * kendisi hiçbir yerde yoktu — ne backend'de bir uç, ne frontend'de içerik. İki
 * onay noktası da "aydınlatma metnini okudum" beyanı alıyor ve bu beyan
 * `noticeAcceptedAt` ile KALICI kaydediliyordu. Okunamayan bir metne alınan onay
 * aydınlatma değildir; KVKK m.10 veri sorumlusuna ilgili kişiyi BİLGİLENDİRME
 * yükümlülüğü yükler, "okudum" kutusu bu yükümlülüğü karşılamaz.
 *
 * KİRACI-PARAMETRİK: veri sorumlusu kiracıya göre değişir. Çok kiracılı bir ATS'te
 * sorumluyu sabitlemek, bir şirketin kariyer sayfasına başka şirketin adını yazmak
 * demektir. Sabit tek-mod compliance bu projede açıkça yasak.
 *
 * FAIL-CLOSED: bir kiracı/sürüm için metin yoksa onay TOPLANMAZ (bkz.
 * `noticeFor` null döner → arayüz onay kutusunu göstermez ve gönderimi kapatır).
 * Böylece "metin yok ama onay var" durumu bir daha oluşamaz.
 */

/** Veri sorumlusu kimliği — kaynağı VERBİS sicili (kamuya açık kayıt). */
export type DataController = {
  legalName: string;
  address: string;
  /** KEP adresi; KVKK m.11 başvuruları için resmi kanal. */
  kep: string;
  /** VERBİS sicil sorgulama bağlantısı — aday beyanı doğrulayabilsin. */
  verbisUrl: string;
};

export type NoticeRecipient = {
  legalName: string;
  purpose: string;
};

export type KvkkNotice = {
  version: string;
  title: string;
  controller: DataController;
  /** Toplanan veri kalemleri — formun gerçekten gönderdiği alanlar. */
  collected: string[];
  purposes: string[];
  legalBasis: string[];
  recipients: NoticeRecipient[];
  retention: string;
  /** Sistemin fiilen uyguladığı koruma önlemleri. */
  safeguards: string[];
  rights: string[];
  rightsChannel: string;
};

const ACIK_HOLDING: DataController = {
  legalName: 'AÇIK HOLDİNG ANONİM ŞİRKETİ',
  address: 'Bağlar Mahallesi, Yalçın Koreş Caddesi No: 16A, Bağcılar / İstanbul',
  kep: 'acikholding@hs03.kep.tr',
  verbisUrl: 'https://verbis.kvkk.gov.tr/sicil-sorgula',
};

/**
 * Grup şirketleri alıcı olarak açıkça yazılır. Aday Açık Holding'e başvurup grup
 * içindeki başka bir şirketin açık pozisyonu için değerlendirilebiliyorsa bu bir
 * VERİ AKTARIMIDIR ve KVKK m.10 gereği kime, hangi amaçla aktarıldığı bildirilmek
 * zorundadır. Adayın yararına olan bir uygulama olması bildirim yükümlülüğünü
 * ortadan kaldırmaz.
 */
const GROUP_RECIPIENTS: NoticeRecipient[] = [
  {
    legalName: 'SERBAN İNŞAAT SANAYİ VE TİCARET ANONİM ŞİRKETİ',
    purpose: 'grup içindeki açık pozisyonlar için değerlendirme',
  },
];

/**
 * Başvuru aydınlatma metni. `collected` listesi formun GERÇEKTEN gönderdiği
 * alanlardır — gönderim gövdesiyle birebir tutulur, aksi hâlde metin yanlış beyan olur.
 */
const APPLICATION_NOTICE: KvkkNotice = {
  version: 'kvkk-application-v1',
  title: 'Aday Başvurusu Aydınlatma Metni',
  controller: ACIK_HOLDING,
  collected: [
    'Ad soyad',
    'E-posta adresi',
    'Telefon numarası',
    'Şehir',
    'LinkedIn ve portföy adresi (isteğe bağlı)',
    'Profesyonel özet',
    'İş deneyimi kayıtları (pozisyon, şirket, tarih aralığı, açıklama)',
    'Eğitim kayıtları (okul, derece, bölüm, yıl)',
    'Beceriler',
    'Diller (isteğe bağlı)',
    'Sertifikalar ve eğitimler (isteğe bağlı)',
    'Başvuru notu (isteğe bağlı)',
  ],
  purposes: [
    'Başvurduğunuz pozisyon için değerlendirme yapılması',
    'İşe alım süreci boyunca sizinle iletişim kurulması',
    'Başvurunuzun kaydı ve durumunun tarafınızca takip edilebilmesi',
    'Grup içindeki diğer açık pozisyonlar için değerlendirme',
  ],
  legalBasis: [
    'KVKK m.5/2-c — bir sözleşmenin kurulması veya ifasıyla doğrudan ilgili olması (iş başvurunuzun değerlendirilmesi)',
    'KVKK m.5/2-f — veri sorumlusunun meşru menfaati (işe alım süreçlerinin yürütülmesi)',
  ],
  recipients: GROUP_RECIPIENTS,
  retention: 'Başvuru tarihinden itibaren 2 yıl. Süre sonunda kayıtlar silinir.',
  safeguards: [
    'Yüklediğiniz CV dosyası yalnız alan çıkarımı için geçici olarak işlenir; ham PDF ve dosya adı saklanmaz.',
    'CV’den çıkarılan alanların hangisinin forma geçeceğine siz karar verirsiniz; reddettiğiniz alan aktarılmaz.',
    'Sağlık durumu, doğum tarihi, cinsiyet, medeni hâl, adres ve benzeri özel nitelikli ya da işe alımla ilgisiz veriler CV’den çıkarılsa bile sistem tarafından otomatik olarak BASTIRILIR ve öneri olarak size sunulmaz.',
    'Başvuru gönderimi öncesinde tüm alanları önizleyip düzeltebilirsiniz.',
  ],
  rights: [
    'Kişisel verilerinizin işlenip işlenmediğini öğrenme',
    'İşlenmişse buna ilişkin bilgi talep etme',
    'İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme',
    'Yurt içinde veya yurt dışında verilerin aktarıldığı üçüncü kişileri bilme',
    'Eksik veya yanlış işlenmişse düzeltilmesini isteme',
    'Şartları oluştuğunda silinmesini veya yok edilmesini isteme',
    'Düzeltme, silme ve yok etme işlemlerinin aktarılan üçüncü kişilere bildirilmesini isteme',
    'Otomatik sistemlerle analiz sonucu aleyhinize bir sonuç doğmasına itiraz etme',
    'Kanuna aykırı işleme sebebiyle zarara uğramanız hâlinde zararın giderilmesini talep etme',
  ],
  rightsChannel:
    'KVKK m.11 kapsamındaki taleplerinizi veri sorumlusunun yukarıdaki KEP adresine ya da tebligata elverişli adresine iletebilirsiniz. Başvurunuzun durumunu “Aday Alanım” ekranından da takip edebilirsiniz.',
};

/** CV içe aktarma aydınlatma metni — ayrı sürüm, ayrı ve daha dar kapsam. */
const RESUME_IMPORT_NOTICE: KvkkNotice = {
  version: 'candidate-resume-import-v1',
  title: 'CV İçe Aktarma Aydınlatma Metni',
  controller: ACIK_HOLDING,
  collected: [
    'Yüklediğiniz PDF dosyasının içeriği (yalnız alan çıkarımı süresince, geçici olarak)',
    'Çıkarılan alan önerileri ve bunlara verdiğiniz kabul / düzenleme / reddetme kararları',
  ],
  purposes: [
    'Başvuru formunun sizin onayınızla önceden doldurulması',
    'Yüklenen dosyanın güvenlik taramasından geçirilmesi',
  ],
  legalBasis: [
    'KVKK m.5/1 — açık rızanız. Bu adımı atlayıp formu elle doldurabilirsiniz; içe aktarma yalnız bir kolaylıktır.',
  ],
  recipients: [],
  retention:
    'Ham PDF ve dosya adı saklanmaz. Alan önerileri, içe aktarma oturumu sona erdiğinde veya başvurunuz gönderildiğinde silinir.',
  safeguards: [
    'Dosya işlenirken dışarıya veri gönderilmez; çıkarım kendi altyapımızda yapılır.',
    'Özel nitelikli veriler ve işe alımla ilgisiz alanlar öneri listesine hiç alınmaz.',
    'Hiçbir alan sizin onayınız olmadan forma geçmez; tümünü reddedebilirsiniz.',
  ],
  rights: APPLICATION_NOTICE.rights,
  rightsChannel: APPLICATION_NOTICE.rightsChannel,
};

/**
 * Kiracı → sürüm → metin. Kiracı anahtarı, kariyer sayfasının yol parametresidir
 * (`/careers/:publicHandle/...`).
 */
const NOTICES_BY_TENANT: Record<string, Record<string, KvkkNotice>> = {
  acik: {
    [APPLICATION_NOTICE.version]: APPLICATION_NOTICE,
    [RESUME_IMPORT_NOTICE.version]: RESUME_IMPORT_NOTICE,
  },
};

/** Kiracı handle'ı verilmediğinde kullanılan varsayılan — testai tek kiracılı akış. */
export const DEFAULT_NOTICE_TENANT = 'acik';

/**
 * Sürüme karşılık gelen metni döner; YOKSA `null`.
 *
 * `null` fail-closed anlamına gelir: arayüz o onay kutusunu göstermez ve ilgili
 * adımı kapatır. Metni olmayan bir sürüm için onay toplamak, ilk baştaki kusurun
 * kendisiydi.
 */
export const noticeFor = (version: string, tenant?: string): KvkkNotice | null =>
  NOTICES_BY_TENANT[tenant ?? DEFAULT_NOTICE_TENANT]?.[version] ?? null;

/** Bir kiracının tüm metinleri — kalıcı aydınlatma sayfası bunları listeler. */
export const noticesForTenant = (tenant?: string): KvkkNotice[] =>
  Object.values(NOTICES_BY_TENANT[tenant ?? DEFAULT_NOTICE_TENANT] ?? {});
