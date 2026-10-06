var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try { step(generator.next(value)); } catch (e) { reject(e); }
    };
    var rejected = (value) => {
      try { step(generator.throw(value)); } catch (e) { reject(e); }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// ==============================================================================
// 1. OYNATICI VİDEO ÇEKİCİLERİ (EXTRACTORS)
// ==============================================================================
var require_extractors = __commonJS({
  "src/utils/extractors.js"(exports2, module2) {
    function unpack(packed) {
      const regex = new RegExp('eval\\s*\\(\\s*function\\s*\\(\\s*p\\s*,\\s*a\\s*,\\s*c\\s*,\\s*k\\s*,\\s*e\\s*,\\s*d\\s*\\).*?return\\s+p\\s*}\\s*\\(\\s*\\"(.*?)\\"\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*\\"(.*?)\\"\\.split\\(\\"\\Vert{}\\"\\)', "s");
      let match = packed.match(regex);
      if (!match) {
        const regexSq = new RegExp("eval\\s*\\(\\s*function\\s*\\(\\s*p\\s*,\\s*a\\s*,\\s*c\\s*,\\s*k\\s*,\\s*e\\s*,\\s*d\\s*\\).*?return\\s+p\\s*}\\s*\\(\\s*\\'(.*?)\\'\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*\\'(.*?)\\'\\.split\\(\\'\\Vert{}\\'\\)", "s");
        match = packed.match(regexSq);
      }
      if (!match) return null;
      let p = match[1];
      const a = parseInt(match[2], 10);
      let c = parseInt(match[3], 10);
      const k = match[4].split("|");
      function e(c2) {
        return (c2 < a ? "" : e(Math.floor(c2 / a))) + (c2 % a > 35 ? String.fromCharCode(c2 % a + 29) : (c2 % a).toString(36));
      }
      while (c--) {
        if (k[c]) {
          const pattern = new RegExp("\\b" + e(c) + "\\b", "g");
          p = p.replace(pattern, k[c]);
        }
      }
      return p;
    }
    function extractVidmoly(url) {
      return __async(this, null, function* () {
        try {
          const res = yield fetch(url, { headers: { "Referer": url } });
          const html = yield res.text();
          const m = html.match(/file:\s*["'](.*?m3u8.*?)["']/);
          if (m) return { url: m[1], quality: "Unknown", source: "Vidmoly" };
        } catch (e) {}
        return null;
      });
    }
    function extractFilemoon(url) {
      return __async(this, null, function* () {
        try {
          const res = yield fetch(url, { headers: { "Referer": url } });
          const html = yield res.text();
          const unpacked = unpack(html);
          if (unpacked) {
            const m = unpacked.match(/file:\s*["'](.*?m3u8.*?)["']/);
            if (m) return { url: m[1], quality: "Unknown", source: "Filemoon" };
          }
        } catch (e) {}
        return null;
      });
    }
    function extractStreamhide(url) {
      return __async(this, null, function* () {
        try {
          const res = yield fetch(url, { headers: { "Referer": url } });
          const html = yield res.text();
          const unpacked = unpack(html);
          if (unpacked) {
            const m = unpacked.match(/sources:\s*\[\s*{\s*file:\s*["'](.*?m3u8.*?)["']/);
            if (m) return { url: m[1], quality: "Unknown", source: "Streamhide" };
          }
        } catch (e) {}
        return null;
      });
    }
    function extractVoe(url) {
      return __async(this, null, function* () {
        try {
          const res = yield fetch(url);
          const html = yield res.text();
          const m = html.match(/hls':\s*'(.*?)'/);
          if (m) return { url: m[1], quality: "Unknown", source: "Voe" };
        } catch (e) {}
        return null;
      });
    }
    function extract2(url) {
      return __async(this, null, function* () {
        if (!url) return null;
        const lowerUrl = url.toLowerCase();
        if (lowerUrl.includes("vidmoly")) return yield extractVidmoly(url);
        if (lowerUrl.includes("filemoon") || lowerUrl.includes("abyssplayer") || lowerUrl.includes("rubystm")) return yield extractFilemoon(url);
        if (lowerUrl.includes("streamhide") || lowerUrl.includes("cloudy.upns") || lowerUrl.includes("gdmirrorbot") || lowerUrl.includes("emturbovid")) return yield extractStreamhide(url);
        if (lowerUrl.includes("voe.sx") || lowerUrl.includes("voe.network")) return yield extractVoe(url);
        return null;
      });
    }
    module2.exports = { extract: extract2 };
  }
});

// ==============================================================================
// 2. SİTE ÖZEL AYARLARI VE AYRIŞTIRICI (BURAYI DÜZENLEYECEKSİNİZ)
// ==============================================================================
var cheerio = require("cheerio-without-node-native");

// SADECE BU TIRNAK İÇLERİNİ DEĞİŞTİRİN:
var SITE_AYARLARI = {
  // Sitenin Tam Adresi (Sonunda taksın/slash olmadan yazın)
  BASE_URL: "https://5movierulz.gripe",

  // Sitede Arama Yapma Adresi (Arama parametresi ne ise onu ekleyin, örn: "/?s=" veya "/arama?q=")
  ARAMA_URL_EKSI: "/?s=",

  // Arama Sonucundaki Film Kutularının CSS Seçicisi
  // Sitede class="cont_display" yazıyorsa koda ".cont_display" yazın. id="main" içindeyse "#main .cont_display" yazılır.
  ARAMA_FILM_KUTUSU: "#main .cont_display",

  // Kutunun içindeki Film Linki Etiketi (Genelde "a" harfidir)
  FILM_LINK_ETIKETI: "a",

  // Film Sayfasında Video/Izleme Linklerinin Bulunduğu Kutu Veya Etiket
  // Örneğin paragrafların içindeki a etiketleri için "p a", iframe oynatıcılar için "iframe" yazılır.
  VIDEO_LINK_CONTAINER: "p a",

  // Link butonunun üstünde yazan tetikleyici kelime (Tüm linkleri almak için boş "" bırakabilirsiniz)
  LINK_ICERIK_METNI: "watch online",

  // Eklenti menüsünde gözükecek isim başlığı
  EKLENTI_ADI: "5movierulz"
};

var TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
var HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  "Referer": `${SITE_AYARLARI.BASE_URL}/`
};

function extractQuality(url) {
  const u = (url || "").toLowerCase();
  if (u.includes("2160p") || u.includes("4k")) return "4K";
  if (u.includes("1080p")) return "1080p";
  if (u.includes("720p")) return "720p";
  if (u.includes("480p")) return "480p";
  return "Unknown";
}

function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    try {
      const tmdbUrl = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}`;
      const mediaInfo = yield (yield fetch(tmdbUrl, { skipSizeCheck: true })).json();
      const title = mediaInfo.title || mediaInfo.name;
      if (!title) return [];

      // Sitede Arama Yapılır
      const searchUrl = `${SITE_AYARLARI.BASE_URL}${SITE_AYARLARI.ARAMA_URL_EKSI}${encodeURIComponent(title)}`;
      const searchHtml = yield (yield fetch(searchUrl, { headers: HEADERS, skipSizeCheck: true })).text();
      const $ = cheerio.load(searchHtml);
      const results = [];

      // Arama Sonuçları Ayrıştırılır
      $(SITE_AYARLARI.ARAMA_FILM_KUTUSU).each((i, el) => {
        const a = $(SITE_AYARLARI.FILM_LINK_ETIKETI, el).first();
        const href = a.attr("href");
        const t = (a.attr("title") || a.text()).trim().replace(/\(.*$/, "").trim();
        if (href) results.push({ title: t, url: href });
      });

      if (!results.length) return [];
      const lcTitle = title.toLowerCase();
      let match = results.find((r) => r.title.toLowerCase().includes(lcTitle));
      if (!match) match = results[0];

      // Filmin Detay Sayfası Açılır
      const pageUrl = match.url.startsWith("http") ? match.url : `${SITE_AYARLARI.BASE_URL}${match.url}`;
      const pageHtml = yield (yield fetch(pageUrl, { headers: HEADERS, skipSizeCheck: true })).text();
      const $page = cheerio.load(pageHtml);
      const streams = [];

      // Video Linkleri Toplanır
      $page(SITE_AYARLARI.VIDEO_LINK_CONTAINER).each((i, a) => {
        const text = $page(a).text().toLowerCase();
        const href = $page(a).attr("href") \vert{}\vert{} $page(a).attr("src") || "";

        // Link
