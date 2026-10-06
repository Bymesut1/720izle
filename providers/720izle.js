// ============================================================
//  DÜZENLEYECEĞİNİZ ALAN (SADECE TIRNAK İÇLERİNİ SİLİP DOLDURUN)
//  DİKKAT: Tırnak işaretlerinin '...' kendisini KESİNLİKLE SİLMEYİN!
// ============================================================

var SITE_AYARLARI = {
  // 1. Sitenin Ana Adresi
  PRIMARY_DOMAIN: 'ÖRNEK: https://www.hdfilmcehennemi.life',

  // 2. Arama Adresi Eki (Arama yapınca adreste çıkan ek)
  ARAMA_YOLU: 'ÖRNEK: /ara?q=',

  // 3. Film Link Eki (Filme tıklayınca adreste ne yazıyorsa, örn: /film/ veya /izle/)
  FILM_LINK_EKI: 'ÖRNEK: /film/',

  // 4. Arama Sonucundaki Film Kartının HTML Sınıfı/Etiketi
  ARAMA_KART_ETIKETI: 'ÖRNEK: <article class="card">',

  // 5. Film Detay Sayfasındaki Başlığın Class (Sınıf) Adı
  HERO_TITLE_CLASS: 'ÖRNEK: hero-title',

  // 6. Film Detay Sayfasındaki Yıl / Alt Başlığın Class (Sınıf) Adı
  HERO_SUB_CLASS: 'ÖRNEK: hero-sub',

  // 7. Eklentinin Menüde Görünecek Adı
  EKLENTI_ADI: 'ÖRNEK: HD Film Cehennemi'
};

// ============================================================
//  AŞAĞIDAKİ KODLARA DOKUNMANIZA GEREK YOKTUR
// ============================================================

var TMDB_KEY = '000316508321ce461cf81e7c6815eec7';
var ANDROID_UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36';

var PAGE_HEADERS = {
  'User-Agent': ANDROID_UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'tr-TR,tr;q=0.9',
  'Referer': SITE_AYARLARI.PRIMARY_DOMAIN + '/'
};

function withTimeout(promise, ms) {
  return new Promise(function (resolve, reject) {
    var t = setTimeout(function () { reject(new Error('timeout')); }, ms);
