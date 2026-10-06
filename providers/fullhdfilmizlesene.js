// ============================================================
//  DÜZENLEYECEĞİNİZ ALAN (SADECE TIRNAK İÇLERİNİ SİLİP DOLDURUN)
//  DİKKAT: Tırnak işaretlerinin '...' kendisini KESİNLİKLE SİLMEYİN!
// ============================================================

var SITE_AYARLARI = {
  // 1. Sitenin Ana Adresi
  PRIMARY_DOMAIN: 'https://www.fullhdfilmizlesene.pw',

  // 2. Arama Adresi Eki (Arama yapınca adreste çıkan ek)
  ARAMA_YOLU: '/?s=',

  // 3. Film Link Eki (Filme tıklayınca adreste ne yazıyorsa, örn: /film/ veya /izle/)
  FILM_LINK_EKI: '/film/',

  // 4. Arama Sonucundaki Film Kartının HTML Sınıfı/Etiketi
  ARAMA_KART_ETIKETI: '<article class="card">',

  // 5. Film Detay Sayfasındaki Başlığın Class (Sınıf) Adı
  HERO_TITLE_CLASS: 'hero-title',

  // 6. Film Detay Sayfasındaki Yıl / Alt Başlığın Class (Sınıf) Adı
  HERO_SUB_CLASS: 'hero-sub',

  // 7. Eklentinin Menüde Görünecek Adı
  EKLENTI_ADI: 'FullHD Filmizlesene'
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
    promise.then(function (v) { clearTimeout(t); resolve(v); },
                 function (e) { clearTimeout(t); reject(e); });
  });
}

function decodeHtml(s) {
  return String(s || '').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function norm(s) {
  return String(s || '').replace(/İ/g, 'i').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function slugify(s) {
  var map = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'â': 'a', 'î': 'i', 'û': 'u' };
  return String(s || '').replace(/İ/g, 'i').toLowerCase()
    .replace(/[çğıöşüâîû]/g, function (c) { return map[c]; })
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function getText(url, headers) {
  try {
    var res = await withTimeout(fetch(url, { headers: headers || PAGE_HEADERS }), 8000);
    if (!res.ok) return '';
    return await withTimeout(res.text(), 8000);
  } catch (e) {
    return '';
  }
}

function isRightMovie(html, title, origTitle, year) {
  var subRe = new RegExp('class="' + SITE_AYARLARI.HERO_SUB_CLASS + '"[^>]*>\\s*([^<]+)');
  var h1Re = new RegExp('class="' + SITE_AYARLARI.HERO_TITLE_CLASS + '"[^>]*>\\s*([^<]+)');
  
  var sub = (html.match(subRe) || [])[1] || '';
  var h1 = (html.match(h1Re) || [])[1] || '';
  var y = parseInt(year, 10);
  var yearOk = false;
  for (var d = -1; d <= 1; d++) {
    if (sub.indexOf('(' + (y + d) + ')') > -1) yearOk = true;
  }
  var titleOk = (origTitle && norm(sub).indexOf(norm(origTitle)) > -1) ||
                (title && norm(h1) === norm(title));
  return yearOk && titleOk;
}

function parseSearchCards(html) {
  var cards = [];
  var chunks = String(html || '').split(SITE_AYARLARI.ARAMA_KART_ETIKETI);
  var hrefRe = new RegExp('href="(' + SITE_AYARLARI.FILM_LINK_EKI + '[a-z0-9-]+)"');

  for (var i = 1; i < chunks.length; i++) {
    var c = chunks[i];
    var href = (c.match(hrefRe) || [])[1];
    if (!href) continue;
    var t = (c.match(/class="card-title"[^>]*>\s*([^<]+)/) || [])[1] ||
            (c.match(/alt="([^"]*)"/) || [])[1] || '';
    var y = (c.match(/<span>\s*(\d{4})\s*<\/span>/) || [])[1] || '';
    cards.push({ path: href, title: decodeHtml(t).trim(), year: parseInt(y, 10) || 0 });
  }
  return cards;
}

async function findMoviePage(title, origTitle, year) {
  var y = parseInt(year, 10);
  var nTitle = norm(title);
  var nOrig = norm(origTitle);
  var paths = [];
  function add(p) { if (p && paths.indexOf(p) === -1) paths.push(p); }

  var queries = [origTitle, title].filter(function (q, i, a) { return q && a.indexOf(q) === i; });
  var results = await Promise.all(queries.map(function (q) {
    return getText(SITE_AYARLARI.PRIMARY_DOMAIN + SITE_AYARLARI.ARAMA_YOLU + encodeURIComponent(q));
  }));

  var cards = [];
  results.forEach(function (html) {
    parseSearchCards(html).forEach(function (c) { cards.push(c); });
  });

  function yearOk(c) { return c.year && Math.abs(c.year - y) <= 1; }
  function titleOk(c) {
    var n = norm(c.title);
    return n && (n === nTitle || n === nOrig);
  }

  cards.filter(function (c) { return yearOk(c) && titleOk(c); }).forEach(function (c) { add(c.path); });
  cards.filter(function (c) { return yearOk(c); }).forEach(function (c) { add(c.path); });

  add(SITE_AYARLARI.FILM_LINK_EKI + slugify(title));
  add(SITE_AYARLARI.FILM_LINK_EKI + slugify(origTitle));

  cards.filter(function (c) { return titleOk(c); }).forEach(function (c) { add(c.path); });

  var candidates = paths.slice(0, 6);
  var pages = await Promise.all(candidates.map(function (p) {
    return getText(SITE_AYARLARI.PRIMARY_DOMAIN + p);
  }));
  for (var i = 0; i < pages.length; i++) {
    if (pages[i] && isRightMovie(pages[i], title, origTitle, year)) {
      return { url: SITE_AYARLARI.PRIMARY_DOMAIN + candidates[i], html: pages[i] };
    }
  }
  return null;
}

function extractSources(html) {
  var list = [];
  var re = /loadSource\('([^']+)'\s*,\s*this\)[^>]*>([\s\S]*?)<\/button>/g, m;
  while ((m = re.exec(html)) !== null) {
    var url = decodeHtml(m[1]);
    var label = decodeHtml(m[2].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
    if (/youtube\.com|youtu\.be/.test(url) || /fragman/i.test(label)) continue;
    list.push({ url: url, label: label });
  }
  if (!list.length) {
    var d = html.match(/data-src="([^"]+)"/);
    if (d && /ok\.ru/.test(d[1])) list.push({ url: decodeHtml(d[1]), label: 'Varsayılan' });
  }
  return list;
}

function unpackPacked(src) {
  var m = src.match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\('([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\)/);
  if (!m) return '';
  var p = m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  var a = parseInt(m[2], 10), c = parseInt(m[3], 10), k = m[4].split('|');
  function enc(n) {
    return (n < a ? '' : enc(Math.floor(n / a))) +
           ((n = n % a) > 35 ? String.fromCharCode(n + 29) : n.toString(36));
  }
  var d = {};
  while (c--) d[enc(c)] = k[c] || enc(c);
  return p.replace(/\b\w+\b/g, function (w) { return d[w] !== undefined ? d[w] : w; });
}

function findStreamUrl(text) {
  text = String(text || '').replace(/\\\//g, '/').replace(/&amp;/g, '&');

  // Static, CDN, .shop ve .m3u8 adreslerini kapsayan dinamik arama
  var shopMatch = text.match(/(https?:\/\/[^\s"'<>]+?\.(?:static\d+|cdnimgs\d+|shop)[^\s"'<>]*)/i);
  if (shopMatch) {
    return { url: shopMatch[1], type: 'hls', quality: 'Auto' };
  }

  var all = text.match(/https?:\/\/[^"'\s\\<>]+\.m3u8[^"'\s\\<>]*/g) || [];
  if (all.length) {
    var pick = all[0];
    for (var i = 0; i < all.length; i++) {
      if (/master/i.test(all[i])) { pick = all[i]; break; }
    }
    return { url: pick, type: 'hls', quality: 'Auto' };
  }

  var f = text.match(/file\s*:\s*["']([^"']+\.mp4[^"']*)["']/);
  if (f) return { url: f[1], type: 'mp4', quality: 'Auto' };
  return null;
}

// ============================================================
// ATOM / RAPIDVID (SCX JSON) ÇÖZÜCÜ ENTEGRASYONU
// ============================================================

function getAtomTokenFromHtml(html) {
  try {
    var match = html.match(/var\s+scx\s*=\s*(\{[\s\S]*?\});/);
    if (!match || !match[1]) return null;
    var scxObj = JSON.parse(match[1]);
    if (scxObj && scxObj.atom && scxObj.atom.sx && scxObj.atom.sx.t && scxObj.atom.sx.t[0]) {
      return scxObj.atom.sx.t[0]; // "nUE0pUZ6Yl9lLK..." token verisi
    }
  } catch (e) {}
  return null;
}

async function resolveAtom(token, pageUrl) {
  if (!token) return null;
  var endpoint = SITE_AYARLARI.PRIMARY_DOMAIN + '/ajax/player';
  var commonHeaders = {
    'User-Agent': ANDROID_UA,
    'Referer': pageUrl,
    'X-Requested-With': 'XMLHttpRequest'
  };

  var rawRes = '';

  // 1. POST İsteği Dene
  try {
    var postRes = await withTimeout(fetch(endpoint, {
      method: 'POST',
      headers: Object.assign({}, commonHeaders, {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
      }),
      body: 'token=' + encodeURIComponent(token) + '&id=' + encodeURIComponent(token)
    }), 8000);
    if (postRes.ok) rawRes = await postRes.text();
  } catch (e) {}

  // 2. POST Başarısız/Boşsa GET İsteği Dene
  if (!rawRes || rawRes.length < 20) {
    try {
      var getUrl = endpoint + '?token=' + encodeURIComponent(token) + '&id=' + encodeURIComponent(token);
      var getRes = await withTimeout(fetch(getUrl, { headers: commonHeaders }), 8000);
      if (getRes.ok) rawRes = await getRes.text();
    } catch (e) {}
  }

  if (!rawRes) return null;

  // Yanıttan Akış Bağlantısını Çıkar
  var stream = findStreamUrl(rawRes);
  if (!stream) {
    var unpacked = unpackPacked(rawRes);
    if (unpacked) stream = findStreamUrl(unpacked);
  }

  if (stream) {
    stream.headers = {
      'User-Agent': ANDROID_UA,
      'Referer': pageUrl
    };
    return stream;
  }

  return null;
}

// ============================================================
// DİĞER SAĞLAYICI ÇÖZÜCÜLERİ
// ============================================================

async function resolveVidmoly(embedUrl) {
  var clean = embedUrl.split('?')[0];
  var tries = [clean];
  var biz = clean.replace(/^https?:\/\/[^\/]+/, 'https://vidmoly.biz');
  if (biz !== clean) tries.push(biz);

  for (var t = 0; t < tries.length; t++) {
    var html = await getText(tries[t], {
      'User-Agent': ANDROID_UA,
      'Accept': 'text/html,*/*;q=0.8',
      'Accept-Language': 'tr-TR,tr;q=0.9',
      'Referer': SITE_AYARLARI.PRIMARY_DOMAIN + '/'
    });
    if (!html) continue;
    var found = findStreamUrl(html);
    if (!found) {
      var unpacked = unpackPacked(html);
      if (unpacked) found = findStreamUrl(unpacked);
    }
    if (found) {
      var ref = /vidmoly\./.test(tries[t]) ? 'https://vidmoly.biz/'
        : ((tries[t].match(/^https?:\/\/[^\/]+/) || [''])[0] + '/');
      found.headers = { 'User-Agent': ANDROID_UA, 'Referer': ref };
      return found;
    }
  }
  return null;
}

async function resolveOk(embedUrl) {
  var clean = embedUrl.split('?')[0];
  var html = await getText(clean, {
    'User-Agent': ANDROID_UA,
    'Referer': SITE_AYARLARI.PRIMARY_DOMAIN + '/'
  });
  if (!html) return null;
  var m = html.match(/data-options="([^"]+)"/);
  if (!m) return null;
  try {
    var opts = JSON.parse(decodeHtml(m[1]));
    var meta = opts.flashvars && opts.flashvars.metadata;
    if (typeof meta === 'string') meta = JSON.parse(meta);
    if (!meta) return null;

    var hls = meta.hlsManifestUrl || meta.ondemandHls || meta.hlsMasterPlaylistUrl;
    if (hls) return { url: hls, type: 'hls', quality: 'Auto' };

    var order = ['full', 'hd', 'sd', 'low', 'lowest', 'mobile'];
    var q = { full: '1080p', hd: '720p', sd: '480p', low: '360p', lowest: '240p', mobile: '144p' };
    var vids = meta.videos || [];
    for (var i = 0; i < order.length; i++) {
      for (var j = 0; j < vids.length; j++) {
        if (vids[j].name === order[i] && vids[j].url) {
          return { url: vids[j].url, type: 'mp4', quality: q[order[i]] };
        }
      }
    }
  } catch (e) {}
  return null;
}

async function resolveSource(url) {
  if (/ok\.ru/.test(url)) return resolveOk(url);
  return resolveVidmoly(url);
}

// ============================================================
// GAKİŞ GETİRME ANA FONKSİYONU
// ============================================================

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    if (mediaType !== 'movie') return [];

    var tmdbRes = await withTimeout(fetch(
      'https://api.themoviedb.org/3/movie/' + tmdbId + '?language=tr-TR&api_key=' + TMDB_KEY
    ), 8000);
    var info = await tmdbRes.json();
    var title = info.title;
    var origTitle = info.original_title;
    var year = (info.release_date || '').slice(0, 4);
    if (!title || !year) return [];

    var found = await findMoviePage(title, origTitle, year);
    if (!found) return [];

    var streams = [];

    // 1. Klasik Butonlu Kaynakları Çöz (Vidmoly, OK.ru vb.)
    var sources = extractSources(found.html);
    var resolved = await Promise.all(sources.map(function (s) { return resolveSource(s.url); }));
    for (var i = 0; i < sources.length; i++) {
      var r = resolved[i];
      if (!r) continue;
      streams.push({
        name: SITE_AYARLARI.EKLENTI_ADI,
        title: '⌜ ' + SITE_AYARLARI.EKLENTI_ADI.toUpperCase() + ' ⌟ | ' + sources[i].label,
        url: r.url,
        quality: r.quality,
        type: r.type,
        headers: r.headers || { 'User-Agent': ANDROID_UA, 'Referer': 'https://ok.ru/' }
      });
    }

    // 2. SCX / Atom (RapidVid) Gizli JSON Token Kaynağını Çöz
    var atomToken = getAtomTokenFromHtml(found.html);
    if (atomToken) {
      var atomStream = await resolveAtom(atomToken, found.url);
      if (atomStream) {
        streams.push({
          name: SITE_AYARLARI.EKLENTI_ADI,
          title: '⌜ ' + SITE_AYARLARI.EKLENTI_ADI.toUpperCase() + ' ⌟ | RapidVid (Atom)',
          url: atomStream.url,
          quality: atomStream.quality || 'Auto',
          type: atomStream.type || 'hls',
          headers: atomStream.headers || { 'User-Agent': ANDROID_UA, 'Referer': found.url }
        });
      }
    }

    return streams;
  } catch (e) {
    return [];
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.getStreams = getStreams;
}
