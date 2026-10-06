// ============================================================
//  filmabisi2 — Nuvio scraper (fullhdfilmizlesene.now)
// ============================================================

var SITE_AYARLARI = {
  PRIMARY_DOMAIN: 'https://www.fullhdfilmizlesene.now',
  ARAMA_YOLU: '/arama/',
  FILM_YOLU: '/film/',
  EKLENTI_ADI: 'filmabisi2',
  // true iken hiç akış bulunamazsa listede neden bulunamadığını yazan bir "DEBUG" satırı çıkar.
  // Her şey çalışınca false yap.
  DEBUG_MODU: true
};

var TMDB_KEY = '000316508321ce461cf81e7c6815eec7';
var PROVIDER_ID = 'filmabisi2';
var ANDROID_UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36';

var PAGE_HEADERS = {
  'User-Agent': ANDROID_UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'tr-TR,tr;q=0.9',
  'Referer': SITE_AYARLARI.PRIMARY_DOMAIN + '/'
};

var stage = '';
function log(m) { try { console.log('[filmabisi2] ' + m); } catch (e) {} }

// ---------------- Yardımcılar (Promise tabanlı) ----------------

function withTimeout(promise, ms) {
  return new Promise(function (resolve, reject) {
    var t = setTimeout(function () { reject(new Error('timeout')); }, ms);
    promise.then(function (v) { clearTimeout(t); resolve(v); },
                 function (e) { clearTimeout(t); reject(e); });
  });
}

function getText(url, headers) {
  return withTimeout(fetch(url, { headers: headers || PAGE_HEADERS }), 9000)
    .then(function (res) { return res.ok ? withTimeout(res.text(), 9000) : ''; })
    .catch(function () { return ''; });
}

function decodeHtml(s) {
  return String(s || '').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

var TR_MAP = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'â': 'a', 'î': 'i', 'û': 'u' };
function asciiLower(s) {
  return String(s || '').replace(/İ/g, 'i').replace(/I/g, 'i').toLowerCase()
    .replace(/[çğıöşüâîû]/g, function (c) { return TR_MAP[c]; });
}
function norm(s) { return asciiLower(s).replace(/[^a-z0-9]/g, ''); }
function slugify(s) { return asciiLower(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }

function originOf(u) { return (String(u).match(/^https?:\/\/[^\/]+/) || [''])[0]; }

// base64 (kendi uygulamamız, atob'a bağımlı değil)
var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64ToBytes(s) {
  s = String(s || '').replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+\/]/g, '');
  var out = [], buf = 0, bits = 0;
  for (var i = 0; i < s.length; i++) {
    buf = (buf << 6) | B64.indexOf(s.charAt(i));
    bits += 6;
    if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 255); buf = buf & ((1 << bits) - 1); }
  }
  return out;
}
function bytesToStr(b) {
  var s = '';
  for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}
function rot13(s) {
  return String(s || '').replace(/[a-zA-Z]/g, function (c) {
    var base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode((c.charCodeAt(0) - base + 13) % 26 + base);
  });
}
function hexUnescape(s) {
  return String(s || '')
    .replace(/\\x([0-9a-fA-F]{2})/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); })
    .replace(/\\u([0-9a-fA-F]{4})/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); })
    .replace(/\\\//g, '/');
}

// Sitenin scx token'ı: rot13 -> base64 -> URL
function decodeToken(t) {
  var u = bytesToStr(b64ToBytes(rot13(t)));
  return /^https?:\/\//.test(u) ? u : '';
}

// RapidVid av('...') çözücü: ters çevir -> b64 -> "K9L" anahtarıyla kaydır -> b64
function decodeSecret(input) {
  var rev = String(input).split('').reverse().join('');
  var bytes = b64ToBytes(rev);
  var key = 'K9L', out = [];
  for (var i = 0; i < bytes.length; i++) {
    var off = (key.charCodeAt(i % key.length) % 5) + 1;
    out.push((bytes[i] - off) & 255);
  }
  var inner = bytesToStr(out);
  if (/https?:\/\//.test(inner)) return inner;
  return bytesToStr(b64ToBytes(inner));
}

// eval(function(p,a,c,k,e,d)...) açıcı
function unpackPacked(src) {
  var m = String(src || '').match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\('([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\)/);
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

function unpackAll(text) {
  var list = [String(text || '')], cur = list[0];
  for (var i = 0; i < 3; i++) {
    var u = unpackPacked(cur);
    if (!u) break;
    list.push(u);
    cur = u;
  }
  return list;
}

var BAD_EXT = /\.(vtt|srt|jpg|jpeg|png|webp|gif|css|js|ico|svg)(\?|$)/i;
var CDN_HOST = /^https?:\/\/[^\/]*(?:\.shop|cdnimgs?\d*\.[a-z]+|static\d+\.[a-z]+)(?:[\/:?]|$)/i;

function findStreamUrl(text) {
  text = hexUnescape(text).replace(/&amp;/g, '&');
  var urls = text.match(/https?:\/\/[^\s"'<>\\]+/g) || [];
  var i, u;
  for (i = 0; i < urls.length; i++) {
    u = urls[i];
    if (/\.m3u8/i.test(u) && !BAD_EXT.test(u)) {
      var best = u;
      for (var j = 0; j < urls.length; j++) {
        if (/\.m3u8/i.test(urls[j]) && /master/i.test(urls[j])) { best = urls[j]; break; }
      }
      return { url: best, type: 'hls', quality: 'Auto' };
    }
  }
  for (i = 0; i < urls.length; i++) {
    u = urls[i];
    if (CDN_HOST.test(u) && !BAD_EXT.test(u)) return { url: u, type: 'hls', quality: 'Auto' };
  }
  var f = text.match(/file\s*["']?\s*:\s*["']([^"']+\.mp4[^"']*)["']/);
  if (f) return { url: f[1], type: 'mp4', quality: 'Auto' };
  return null;
}

// ---------------- Film sayfasını bulma ----------------

function parseJsonString(s) {
  try { return JSON.parse('"' + s + '"'); } catch (e) { return s; }
}

function pageInfo(html) {
  var names = [];
  var h1 = (html.match(/<h1[^>]*>\s*(?:<a[^>]*>)?\s*([^<]+)/) || [])[1];
  var h2 = (html.match(/<h1[\s\S]*?<\/h1>\s*<h2[^>]*>\s*([^<]+)<\/h2>/) || [])[1];
  var ldName = (html.match(/"@type"\s*:\s*"Movie"[\s\S]*?"name"\s*:\s*"([^"]+)"/) || [])[1];
  var ldAlt = (html.match(/"alternateName"\s*:\s*"([^"]+)"/) || [])[1];
  [h1, h2, ldName, ldAlt].forEach(function (n) {
    if (n) names.push(decodeHtml(parseJsonString(n)).trim());
  });
  var year = (html.match(/<title>[^<]*\((\d{4})\)/) || [])[1] ||
             (html.match(/\/yil\/(\d{4})-/) || [])[1] || '';
  return { names: names, year: parseInt(year, 10) || 0 };
}

// SIKI doğrulama: yıl (±1) + başlık eşleşmesi. Eşleşmezse sayfa kullanılmaz.
function isRightMovie(html, title, origTitle, year) {
  var info = pageInfo(html);
  var y = parseInt(year, 10);
  if (!info.year || !y || Math.abs(info.year - y) > 1) return false;
  var want = [norm(title), norm(origTitle)].filter(function (n) { return n && n.length >= 2; });
  for (var i = 0; i < info.names.length; i++) {
    var n = norm(info.names[i]);
    if (n && want.indexOf(n) > -1) return true;
  }
  return false;
}

function parseSearchCards(html) {
  var cards = [];
  var chunks = String(html || '').split(/<li class="film[ "]/);
  for (var i = 1; i < chunks.length; i++) {
    var c = chunks[i];
    var href = (c.match(/href="(?:https?:\/\/[^\/"]+)?(\/film\/[a-z0-9-]+\/?)"/) || [])[1];
    if (!href) continue;
    var t = (c.match(/class="film-title"[^>]*>\s*([^<]+)/) || [])[1] || '';
    var kt = (c.match(/class="kt"[^>]*>\s*([^<]+)/) || [])[1] || '';
    var y = (c.match(/class="film-yil"[^>]*>\s*(\d{4})/) || [])[1] || '';
    cards.push({ path: href, title: decodeHtml(t).trim(), orig: decodeHtml(kt).trim(), year: parseInt(y, 10) || 0 });
  }
  return cards;
}

function allFilmPaths(html) {
  var out = [], re = /href="(?:https?:\/\/[^\/"]+)?(\/film\/[a-z0-9-]+\/?)"/g, m;
  while ((m = re.exec(String(html || ''))) !== null) {
    if (out.indexOf(m[1]) === -1) out.push(m[1]);
  }
  return out;
}

function findMoviePage(title, origTitle, year, imdbId) {
  var y = parseInt(year, 10);
  var nTitle = norm(title), nOrig = norm(origTitle);
  var paths = [];
  function add(p) { if (p && paths.indexOf(p) === -1) paths.push(p); }

  var queries = [imdbId, origTitle, title].filter(function (q, i, a) { return q && a.indexOf(q) === i; });

  return Promise.all(queries.map(function (q) {
    return getText(SITE_AYARLARI.PRIMARY_DOMAIN + SITE_AYARLARI.ARAMA_YOLU + encodeURIComponent(q));
  })).then(function (results) {
    var cards = [], loose = [];
    results.forEach(function (html) {
      parseSearchCards(html).forEach(function (c) { cards.push(c); });
      allFilmPaths(html).forEach(function (p) { if (loose.indexOf(p) === -1) loose.push(p); });
    });
    log('arama: ' + cards.length + ' kart, ' + loose.length + ' link');

    function yearOk(c) { return c.year && Math.abs(c.year - y) <= 1; }
    function titleOk(c) {
      var a = norm(c.title), b = norm(c.orig);
      return (a && (a === nTitle || a === nOrig)) || (b && (b === nTitle || b === nOrig));
    }

    cards.filter(function (c) { return yearOk(c) && titleOk(c); }).forEach(function (c) { add(c.path); });
    cards.filter(function (c) { return titleOk(c); }).forEach(function (c) { add(c.path); });
    add(SITE_AYARLARI.FILM_YOLU + slugify(title) + '/');
    add(SITE_AYARLARI.FILM_YOLU + slugify(origTitle) + '/');
    loose.forEach(function (p) { add(p); });

    var candidates = paths.slice(0, 6);
    stage = 'aday=' + candidates.length;
    return Promise.all(candidates.map(function (p) {
      return getText(SITE_AYARLARI.PRIMARY_DOMAIN + p);
    })).then(function (pages) {
      for (var i = 0; i < pages.length; i++) {
        if (pages[i] && isRightMovie(pages[i], title, origTitle, year)) {
          return { url: SITE_AYARLARI.PRIMARY_DOMAIN + candidates[i], html: pages[i] };
        }
      }
      return null;
    });
  });
}

// ---------------- Kaynakları çıkarma ----------------

function extractScxSources(html) {
  var list = [];
  var m = html.match(/var\s+scx\s*=\s*(\{[\s\S]*?\})\s*;/);
  if (!m) return list;
  var scx;
  try { scx = JSON.parse(m[1]); } catch (e) { return list; }
  Object.keys(scx).forEach(function (key) {
    var item = scx[key] || {};
    var name = key;
    try { if (item.tt) name = bytesToStr(b64ToBytes(item.tt)) || key; } catch (e) {}
    var sx = item.sx || {};
    ['t', 'p'].forEach(function (g) {
      (sx[g] || []).forEach(function (tok) {
        var u = decodeToken(tok);
        if (u) list.push({ url: u, label: name });
      });
    });
  });
  return list;
}

function extractLegacySources(html) {
  var list = [];
  var re = /loadSource\('([^']+)'\s*,\s*this\)[^>]*>([\s\S]*?)<\/button>/g, m;
  while ((m = re.exec(html)) !== null) {
    var url = decodeHtml(m[1]);
    var label = decodeHtml(m[2].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
    if (/youtube\.com|youtu\.be/.test(url) || /fragman/i.test(label)) continue;
    list.push({ url: url, label: label });
  }
  return list;
}

// ---------------- Çözücüler ----------------

function resolveRapid(embedUrl, pageUrl) {
  var origin = originOf(embedUrl);
  return getText(embedUrl, {
    'User-Agent': ANDROID_UA,
    'Accept': 'text/html,*/*;q=0.8',
    'Accept-Language': 'tr-TR,tr;q=0.9',
    'Referer': pageUrl
  }).then(function (html) {
    if (!html) { stage = 'rapidvid sayfası boş'; return null; }
    var texts = unpackAll(html), found = null;

    for (var i = 0; i < texts.length && !found; i++) {
      var t = texts[i];

      var av = t.match(/av\('([^']+)'\)/);
      if (av) {
        try {
          var d = decodeSecret(av[1]);
          found = findStreamUrl(d) || (/^https?:\/\/\S+$/.test(d) ? { url: d, type: 'hls', quality: 'Auto' } : null);
        } catch (e) {}
      }
      if (found) break;

      var re = /"?file"?\s*:\s*"([^"]+)"/g, m;
      while ((m = re.exec(t)) !== null) {
        var v = hexUnescape(m[1]);
        if (/^https?:\/\//.test(v) && !BAD_EXT.test(v)) {
          found = { url: v, type: /\.mp4/i.test(v) ? 'mp4' : 'hls', quality: 'Auto' };
          break;
        }
      }
      if (found) break;

      found = findStreamUrl(t);
    }
    if (!found) { stage = 'rapidvid link çıkmadı (' + html.length + ' bayt)'; return null; }
    found.headers = { 'User-Agent': ANDROID_UA, 'Referer': origin + '/' };
    return found;
  });
}

function resolveVidmoly(embedUrl) {
  var clean = embedUrl.split('?')[0];
  var tries = [clean];
  var biz = clean.replace(/^https?:\/\/[^\/]+/, 'https://vidmoly.biz');
  if (biz !== clean) tries.push(biz);

  function attempt(t) {
    if (t >= tries.length) return Promise.resolve(null);
    return getText(tries[t], {
      'User-Agent': ANDROID_UA, 'Accept': 'text/html,*/*;q=0.8',
      'Accept-Language': 'tr-TR,tr;q=0.9', 'Referer': SITE_AYARLARI.PRIMARY_DOMAIN + '/'
    }).then(function (html) {
      if (!html) return attempt(t + 1);
      var texts = unpackAll(html), found = null;
      for (var i = 0; i < texts.length && !found; i++) found = findStreamUrl(texts[i]);
      if (found) {
        found.headers = { 'User-Agent': ANDROID_UA, 'Referer': /vidmoly\./.test(tries[t]) ? 'https://vidmoly.biz/' : originOf(tries[t]) + '/' };
        return found;
      }
      return attempt(t + 1);
    });
  }
  return attempt(0);
}

function resolveOk(embedUrl) {
  return getText(embedUrl.split('?')[0], {
    'User-Agent': ANDROID_UA, 'Referer': SITE_AYARLARI.PRIMARY_DOMAIN + '/'
  }).then(function (html) {
    if (!html) return null;
    var m = html.match(/data-options="([^"]+)"/);
    if (!m) return null;
    try {
      var opts = JSON.parse(decodeHtml(m[1]));
      var meta = opts.flashvars && opts.flashvars.metadata;
      if (typeof meta === 'string') meta = JSON.parse(meta);
      if (!meta) return null;
      var hls = meta.hlsManifestUrl || meta.ondemandHls || meta.hlsMasterPlaylistUrl;
      var hdr = { 'User-Agent': ANDROID_UA, 'Referer': 'https://ok.ru/' };
      if (hls) return { url: hls, type: 'hls', quality: 'Auto', headers: hdr };
      var order = ['full', 'hd', 'sd', 'low', 'lowest', 'mobile'];
      var q = { full: '1080p', hd: '720p', sd: '480p', low: '360p', lowest: '240p', mobile: '144p' };
      var vids = meta.videos || [];
      for (var i = 0; i < order.length; i++) {
        for (var j = 0; j < vids.length; j++) {
          if (vids[j].name === order[i] && vids[j].url) {
            return { url: vids[j].url, type: 'mp4', quality: q[order[i]], headers: hdr };
          }
        }
      }
    } catch (e) {}
    return null;
  });
}

function resolveGeneric(embedUrl, pageUrl) {
  return getText(embedUrl, {
    'User-Agent': ANDROID_UA, 'Accept': 'text/html,*/*;q=0.8', 'Referer': pageUrl
  }).then(function (html) {
    if (!html) return null;
    var texts = unpackAll(html), found = null;
    for (var i = 0; i < texts.length && !found; i++) found = findStreamUrl(texts[i]);
    if (found) found.headers = { 'User-Agent': ANDROID_UA, 'Referer': originOf(embedUrl) + '/' };
    return found;
  });
}

function resolveSource(url, pageUrl) {
  if (/rapidvid|rapid/i.test(originOf(url))) return resolveRapid(url, pageUrl);
  if (/ok\.ru/.test(url)) return resolveOk(url);
  if (/vidmoly/.test(url)) return resolveVidmoly(url);
  return resolveGeneric(url, pageUrl);
}

// ============================================================
//  NUVIO GİRİŞ NOKTASI
// ============================================================

function makeStream(label, r) {
  return {
    name: SITE_AYARLARI.EKLENTI_ADI,
    title: '⌜ ' + SITE_AYARLARI.EKLENTI_ADI.toUpperCase() + ' ⌟ | ' + label,
    url: r.url,
    quality: r.quality || 'Auto',
    type: r.type,
    headers: r.headers || { 'User-Agent': ANDROID_UA },
    provider: PROVIDER_ID
  };
}

function debugStream(msg) {
  if (!SITE_AYARLARI.DEBUG_MODU) return [];
  return [{
    name: SITE_AYARLARI.EKLENTI_ADI,
    title: 'DEBUG: ' + msg,
    url: 'https://debug.invalid/',
    quality: 'Auto',
    provider: PROVIDER_ID
  }];
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (mediaType !== 'movie') return Promise.resolve([]);
  stage = 'tmdb';

  return withTimeout(fetch(
    'https://api.themoviedb.org/3/movie/' + tmdbId + '?language=tr-TR&api_key=' + TMDB_KEY
  ), 9000)
    .then(function (res) { return res.json(); })
    .then(function (info) {
      var title = info.title;
      var origTitle = info.original_title;
      var year = (info.release_date || '').slice(0, 4);
      if (!title || !year) return debugStream('TMDB bilgisi eksik');
      stage = 'arama: ' + title + ' (' + year + ')';

      return findMoviePage(title, origTitle, year, info.imdb_id).then(function (found) {
        if (!found) return debugStream('film sayfası bulunamadı / doğrulanamadı: ' + title + ' (' + year + ') ' + stage);
        log('sayfa: ' + found.url);

        var sources = extractScxSources(found.html);
        if (!sources.length) sources = extractLegacySources(found.html);
        if (!sources.length) return debugStream('sayfada kaynak (scx) yok: ' + found.url);

        return Promise.all(sources.map(function (s) {
          return resolveSource(s.url, found.url).catch(function () { return null; });
        })).then(function (resolved) {
          var streams = [], seen = {};
          for (var i = 0; i < sources.length; i++) {
            var r = resolved[i];
            if (!r || seen[r.url]) continue;
            seen[r.url] = true;
            var label = /rapid/i.test(sources[i].url) ? 'RapidVid' : sources[i].label;
            streams.push(makeStream(label, r));
          }
          if (!streams.length) return debugStream('kaynak çözülemedi: ' + stage + ' | ' + sources[0].url);
          return streams;
        });
      });
    })
    .catch(function (e) { return debugStream('hata: ' + (e && e.message) + ' @' + stage); });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams, _t: { decodeToken: decodeToken, decodeSecret: decodeSecret, extractScxSources: extractScxSources, isRightMovie: isRightMovie, parseSearchCards: parseSearchCards, findStreamUrl: findStreamUrl, pageInfo: pageInfo } };
} else {
  global.getStreams = getStreams;
}
