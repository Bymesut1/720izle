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
  DEBUG_MODU: false,
  // YANLIŞ FİLM KORUMASI: bulunan akışın süresi TMDB'deki film süresiyle karşılaştırılır; uymayan akış (başka film, reklam, fragman) listeye girmez.
  SURE_KONTROL: true,
  SURE_ALT: 0.78,        // tek parça film: süre / TMDB süresi en az bu kadar olmalı
  SURE_UST: 1.3,         //                                       en fazla bu kadar
  PARCA_ALT: 0.2,        // parçalı (Part 1/2...) kaynaklar için alt sınır
  SURE_BEKLEME: 5000     // ms: süre okuma en geç bu sürede biter (okunamazsa akış korunur)
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

var dbg = [];
var DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function getText(url, headers, label) {
  function once(h) {
    return withTimeout(fetch(url, { headers: h }), 9000).then(function (res) {
      return withTimeout(res.text(), 9000).then(
        function (t) { return { status: res.status, ok: res.ok, text: t || '' }; },
        function () { return { status: res.status, ok: false, text: '' }; }
      );
    }).catch(function (e) { return { status: 0, ok: false, text: '', err: (e && e.message) || 'hata' }; });
  }
  var h = headers || PAGE_HEADERS;
  return once(h).then(function (r) {
    if (!r.ok && (r.status === 0 || r.status === 403 || r.status === 429 || r.status === 503) && /fullhdfilmizlesene/.test(url)) {
      var h2 = {};
      Object.keys(h).forEach(function (k) { h2[k] = h[k]; });
      h2['User-Agent'] = DESKTOP_UA;
      return once(h2).then(function (r2) { return r2.ok ? r2 : r; });
    }
    return r;
  }).then(function (r) {
    if (label) dbg.push(label + ' ' + (r.status || r.err || '?') + '/' + r.text.length);
    return r.ok ? r.text : '';
  });
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
var CDN_HOST = /^https?:\/\/[^\/]*(?:\.shop|pictabox\.[a-z]+|cdnimgs?\d*\.[a-z]+|static\d+\.[a-z]+)(?:[\/:?]|$)/i;

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
  // h1'den sonraki ilk metin (film özeti). Site adı "Yenilmezler 4 Son Oyun" iken özet "Avengers: Endgame" diyebilir.
  var hi = html.search(/<h1/i);
  var region = hi > -1 ? html.substr(hi, 15000) : '';
  region = norm(decodeHtml(region.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' '))).substr(0, 1500);
  var origs = [];
  [h2, ldAlt].forEach(function (n) { if (n) origs.push(decodeHtml(parseJsonString(n)).trim()); });
  return { names: names, orig: origs, year: parseInt(year, 10) || 0, region: region };
}

// ---------------- Başlık eşleştirme (puanlı, bulanık) ----------------
// Sitedeki ad ile TMDB adı birebir aynı olmak zorunda değil:
//   "The Matrix 4 Resurrections" ~ "Matrix Resurrections"   (baştaki The, ortadaki sıra numarası)
//   "Yenilmezler 4 Son Oyun"     ~ "Avengers: Endgame"      (film özetindeki orijinal ad)
var STOP_WORDS = { the: 1, a: 1, an: 1, of: 1, and: 1, ve: 1, ile: 1, film: 1, filmi: 1, izle: 1, movie: 1 };
var ROMAN = { ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };

function sigTokens(s) {
  var words = [], nums = [];
  asciiLower(s).split(/[^a-z0-9]+/).forEach(function (t) {
    if (!t) return;
    if (/^\d{1,2}$/.test(t)) { nums.push(parseInt(t, 10)); return; }
    if (ROMAN[t]) { nums.push(ROMAN[t]); return; }
    if (STOP_WORDS[t]) return;
    words.push(t);
  });
  return { words: words, nums: nums };
}

// 0 = eşleşmedi, 2 = zayıf (tek kelime), 4 = kısmi, 6 = aynı kelimeler, 7 = birebir
function nameScore(siteName, wantList) {
  var best = 0;
  var a = sigTokens(siteName), na = norm(siteName);
  if (!na) return 0;
  for (var i = 0; i < wantList.length; i++) {
    var w = wantList[i], nw = norm(w);
    if (!nw) continue;
    var sc = 0;
    if (na === nw) sc = 7;
    else {
      var b = sigTokens(w);
      if (!a.words.length || !b.words.length) continue;
      if (a.nums.length && b.nums.length) {
        var common = a.nums.some(function (n) { return b.nums.indexOf(n) > -1; });
        if (!common) continue; // "Taken 2" ile "Taken 3" karışmasın
      }
      var inter = 0;
      a.words.forEach(function (t) { if (b.words.indexOf(t) > -1) inter++; });
      var small = Math.min(a.words.length, b.words.length);
      if (inter === small) {
        if (a.words.length === b.words.length) sc = 6;
        else if (small >= 2) sc = 4;
        else sc = 2;
      }
    }
    if (sc > best) best = sc;
  }
  return best;
}

function wantStrings(title, origTitle, extra) {
  var out = [];
  [title, origTitle].concat(extra || []).forEach(function (s) {
    if (s && norm(s).length >= 2 && out.indexOf(s) === -1) out.push(s);
  });
  return out;
}

// Film özeti (h1'den sonraki ilk ~350 karakter) orijinal/İngilizce adla başlıyorsa 3 puan
function descScore(html, wantList) {
  var info = pageInfo(html), best = 0;
  wantList.forEach(function (w) {
    var nw = norm(w);
    if (nw.length < 7) return;
    var p = info.region.indexOf(nw);
    if (p > -1 && p < 350) best = 3;
  });
  return best;
}

// Sayfadaki IMDb kimlikleri (imdb.com/title/tt...)
function imdbIds(html) {
  var out = [], re = /imdb\.com\/title\/(tt\d{6,9})/g, m;
  while ((m = re.exec(String(html || ''))) !== null) { if (out.indexOf(m[1]) === -1) out.push(m[1]); }
  return out;
}

// Aday değerlendirme: arama kartı ve/veya sayfa bilgisi birleştirilir. 0 = reddet, yüksek = iyi.
// opt.origWants: TMDB'deki orijinal / İngilizce / alternatif adlar. opt.imdb: TMDB IMDb kimliği.
// YANLIŞ FİLM KORUMASI: sitede aynı Türkçe ada sahip başka bir film olabilir (ör. "Yenilmezler" ~ "Yenilmezler 1").
// Bu yüzden sitenin gösterdiği ORİJİNAL ad da TMDB'deki orijinal adlardan biriyle uyuşmalı, uyuşmuyorsa aday reddedilir.
function rankCandidate(c, wantList, y, opt) {
  opt = opt || {};
  var names = [], years = [], origs = [], titles = [];
  if (c.card) {
    names.push(c.card.title, c.card.orig); years.push(c.card.year);
    titles.push(c.card.title);
    if (c.card.orig) origs.push(c.card.orig);
  }
  var ds = 0, imdbBonus = 0;
  if (c.html) {
    var info = pageInfo(c.html);
    names = names.concat(info.names);
    if (info.names[0]) titles.push(info.names[0]);
    (info.orig || []).forEach(function (o) { if (o) origs.push(o); });
    years.push(info.year);
    ds = descScore(c.html, wantList);
    var ids = imdbIds(c.html);
    if (opt.imdb && ids.length) {
      if (ids.indexOf(opt.imdb) > -1) imdbBonus = 40;
      else if (ids.length <= 2) return 0;      // sayfa başka bir IMDb kimliğine bağlı: başka film
    }
  }
  var ns = ds;
  names.forEach(function (n) { if (n) ns = Math.max(ns, nameScore(n, wantList)); });
  if (!ns) return 0;
  var yd = 99;
  years.forEach(function (yr) { if (yr) yd = Math.min(yd, Math.abs(yr - y)); });
  if (yd > 2) return 0;
  if (yd === 2 && ns < 6) return 0;          // 2 yıl fark: yalnızca ad birebir aynıysa
  if (ns === 2 && yd !== 0) return 0;        // tek kelimelik zayıf eşleşme: yıl tam tutmalı

  var origBonus = 0;
  if (opt.origWants && opt.origWants.length) {
    var tn = titles.map(norm);
    var oc = origs.filter(function (o) { return norm(o).length >= 2 && tn.indexOf(norm(o)) === -1; });   // başlığın kopyası olan orijinal ad bilgi vermez
    if (oc.length) {
      var os = 0;
      oc.forEach(function (o) { os = Math.max(os, nameScore(o, opt.origWants)); });
      if (!os) return 0;                       // site orijinal adı TMDB'dekilerle hiç uyuşmuyor: başka film
      if (os >= 6) origBonus = 20;
    }
  }
  return ns * 10 + (3 - Math.min(yd, 3)) + origBonus + imdbBonus;
}

// Geriye dönük uyum (testler için)
function isRightMovie(html, title, origTitle, year, extra) {
  return rankCandidate({ html: html }, wantStrings(title, origTitle, extra), parseInt(year, 10)) > 0;
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

function searchVariants(list) {
  var out = [];
  function push(x) { x = String(x || '').replace(/\s+/g, ' ').trim(); if (x.length >= 2 && out.indexOf(x) === -1) out.push(x); }
  list.forEach(function (q) {
    if (!q) return;
    q = String(q).trim();
    var clean = q.replace(/[:\-–—!?,.'"’&]+/g, ' ');
    push(q);
    push(clean);
    push(clean.replace(/^the\s+/i, ''));
    if (q.indexOf(':') > 0) { push(q.split(':')[0]); push(q.split(':').slice(1).join(' ')); }
  });
  return out;
}

// Son çare aramalar: başlığın en uzun 1-2 anlamlı kelimesi (geniş sonuç; yıl ve ad filtresi sayfada yapılır)
function broadQueries(list) {
  var words = [];
  list.forEach(function (q) {
    sigTokens(q).words.forEach(function (t) { if (t.length >= 4 && words.indexOf(t) === -1) words.push(t); });
  });
  words.sort(function (a, b) { return b.length - a.length; });
  return words.slice(0, 2);
}

function findMoviePage(title, origTitle, year, imdbId, extra, origWants) {
  var opt = { origWants: origWants || [], imdb: imdbId || '' };
  var y = parseInt(year, 10);
  var wants = wantStrings(title, origTitle, extra);
  var base = [imdbId, origTitle, title].concat(extra || []);
  var queries = searchVariants(base).slice(0, 7);
  broadQueries(wants).forEach(function (q) { if (queries.indexOf(q) === -1) queries.push(q); });
  queries = queries.slice(0, 9);

  return Promise.all(queries.map(function (q, qi) {
    return getText(SITE_AYARLARI.PRIMARY_DOMAIN + SITE_AYARLARI.ARAMA_YOLU + encodeURIComponent(q), null, 'S' + (qi + 1));
  })).then(function (results) {
    var cardMap = {}, cardOrder = [], loose = [];
    results.forEach(function (html) {
      parseSearchCards(html).forEach(function (c) {
        if (!cardMap[c.path]) { cardMap[c.path] = c; cardOrder.push(c.path); }
      });
      allFilmPaths(html).forEach(function (p) { if (loose.indexOf(p) === -1) loose.push(p); });
    });
    log('arama: ' + cardOrder.length + ' kart, ' + loose.length + ' link');
    dbg.push('kart ' + cardOrder.length + ' link ' + loose.length);

    // Kart bilgisiyle ön puanlama
    var scored = cardOrder.map(function (p) {
      return { path: p, card: cardMap[p], rank: rankCandidate({ card: cardMap[p] }, wants, y, opt) };
    });
    var good = scored.filter(function (c) { return c.rank > 0; }).sort(function (a, b) { return b.rank - a.rank; });

    var cands = [], seen = {};
    function addC(c) { if (!seen[c.path] && cands.length < 10) { seen[c.path] = true; cands.push(c); } }

    if (good.length && good[0].rank >= 60) {
      good.slice(0, 3).forEach(addC);        // kesin eşleşme var: gereksiz sayfa çekme
    } else {
      good.slice(0, 6).forEach(addC);
      [slugify(title), slugify(origTitle)].forEach(function (s) {
        if (s) addC({ path: SITE_AYARLARI.FILM_YOLU + s + '/', rank: 0 });
      });
      scored.filter(function (c) { return c.rank === 0; }).slice(0, 4).forEach(addC);
      loose.slice(0, 4).forEach(function (p) { addC({ path: p, card: cardMap[p], rank: 0 }); });
    }
    stage = 'aday=' + cands.length;

    return Promise.all(cands.map(function (c) {
      return getText(SITE_AYARLARI.PRIMARY_DOMAIN + c.path, null, null);
    })).then(function (pages) {
      var okList = [];
      pages.forEach(function (pg, i) {
        if (!pg) { dbg.push('P' + (i + 1) + ' bos'); return; }
        cands[i].html = pg;
        var inf = pageInfo(pg);
        var r = rankCandidate(cands[i], wants, y, opt);
        dbg.push('P' + (i + 1) + ' y' + inf.year + ' ' + (inf.names[0] || 'adyok') + ' / ' + ((inf.orig && inf.orig[0]) || '-') + ' r' + r);
        if (r > 0) okList.push({ url: SITE_AYARLARI.PRIMARY_DOMAIN + cands[i].path, html: pg, rank: r });
      });
      okList.sort(function (a, b) { return b.rank - a.rank; });
      return okList;                       // en iyiden başlayarak sıralı liste (boş olabilir)
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
        if (u) list.push({ url: u, label: name, group: g });
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


// ---- RapidVid yedek çözücü: anahtar/format değişse de dener ----
function revStr(s) { return String(s).split('').reverse().join(''); }
function hasHttp(x) { return /https?:\/\/[A-Za-z0-9]/.test(x); }

function tryDecodeString(str) {
  var variants = [str, revStr(str), rot13(str), revStr(rot13(str))];
  for (var vi = 0; vi < variants.length; vi++) {
    var bytes = b64ToBytes(variants[vi]);
    if (bytes.length < 12) continue;
    var plain = bytesToStr(bytes);
    if (hasHttp(plain)) return plain;
    var inner0 = bytesToStr(b64ToBytes(plain));
    if (hasHttp(inner0)) return inner0;
    for (var a = 0; a <= 5; a++) for (var b = 0; b <= 5; b++) for (var c = 0; c <= 5; c++) {
      if (!a && !b && !c) continue;
      var off = [a, b, c], out = [];
      for (var i = 0; i < bytes.length; i++) out.push((bytes[i] - off[i % 3]) & 255);
      var s2 = bytesToStr(out);
      if (hasHttp(s2)) return s2;
      if (/^[A-Za-z0-9+\/=_\-]+$/.test(s2)) {
        var s3 = bytesToStr(b64ToBytes(s2));
        if (hasHttp(s3)) return s3;
      }
    }
  }
  return '';
}

function bruteFindStream(texts) {
  var cands = [];
  texts.forEach(function (t) {
    var re = /["']([A-Za-z0-9+\/=_\-]{30,6000})["']/g, m;
    while ((m = re.exec(t)) !== null) {
      if (cands.indexOf(m[1]) === -1) cands.push(m[1]);
    }
  });
  cands.sort(function (x, y) { return y.length - x.length; });
  cands = cands.slice(0, 8);
  dbg.push('RV aday ' + cands.length);
  for (var i = 0; i < cands.length; i++) {
    var d = tryDecodeString(cands[i]);
    if (d) {
      var f = findStreamUrl(d);
      if (f) return f;
      var u = (d.match(/https?:\/\/[^\s"'<>\\]+/) || [])[0];
      if (u && !BAD_EXT.test(u)) return { url: u, type: /\.mp4/i.test(u) ? 'mp4' : 'hls', quality: 'Auto' };
    }
  }
  return null;
}

function rvDiag(html, texts) {
  var t = texts[texts.length - 1];
  var i = t.search(/av\s*\(/);
  dbg.push('RV len=' + html.length + ' paket=' + (texts.length - 1) + ' av=' + (i > -1) +
    ' file=' + /file/.test(t) + ' m3u8=' + /m3u8/.test(t) + ' atob=' + /atob/.test(t));
  if (i > -1) dbg.push('RV av: ' + t.substr(Math.max(0, i - 30), 140));
  var si = html.search(/<script/i);
  dbg.push('RV bas: ' + html.substr(0, 90).replace(/\s+/g, ' '));
  var ss = html.lastIndexOf('<script');
  if (ss > -1) dbg.push('RV son: ' + html.substr(ss, 160).replace(/\s+/g, ' '));
}

function extractRapid(html) {
  var texts = unpackAll(html), found = null;

  // Düz <video><source src="..."> / <video src="..."> (uzantısız link de olabilir)
  var sm = html.match(/<(?:source|video)[^>]*\ssrc=["'](https?:\/\/[^"']+)["']/i);
  if (sm && !BAD_EXT.test(sm[1])) {
    return { found: { url: decodeHtml(sm[1]), type: /\.mp4(\?|$)/i.test(sm[1]) ? 'mp4' : 'hls', quality: 'Auto' }, texts: texts };
  }

  for (var i = 0; i < texts.length && !found; i++) {
    var t = texts[i];

    var av = t.match(/av\(\s*['"]([^'"]+)['"]\s*\)/);
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
  if (!found) { try { found = bruteFindStream(texts); } catch (e) { dbg.push('RV brute hata ' + e.message); } }
  return { found: found, texts: texts };
}

function resolveRapid(embedUrl, pageUrl) {
  var origin = originOf(embedUrl);
  function fetchEmbed(ua) {
    return getText(embedUrl, {
      'User-Agent': ua,
      'Accept': 'text/html,*/*;q=0.8',
      'Accept-Language': 'tr-TR,tr;q=0.9',
      'Referer': pageUrl
    });
  }
  return fetchEmbed(ANDROID_UA).then(function (html) {
    var r = html ? extractRapid(html) : { found: null, texts: [] };
    if (r.found) return { r: r, html: html, ua: ANDROID_UA };
    // Mobil UA ile bulunamadıysa masaüstü UA ile dene (site farklı sayfa sunabiliyor)
    return fetchEmbed(DESKTOP_UA).then(function (html2) {
      var r2 = html2 ? extractRapid(html2) : { found: null, texts: [] };
      if (r2.found) { dbg.push('RV masaustu UA ile bulundu'); return { r: r2, html: html2, ua: DESKTOP_UA }; }
      return { r: r.found ? r : r2, html: html || html2 || '', ua: ANDROID_UA, fail: true, h1: html, h2: html2 };
    });
  }).then(function (o) {
    if (o.fail) {
      if (!o.html) { stage = 'rapidvid sayfası boş'; return null; }
      try { rvDiag(o.h1 || o.html, o.r.texts); } catch (e) {}
      if (o.h2 && o.h2 !== o.h1) dbg.push('RV masaustu len=' + o.h2.length);
      stage = 'rapidvid link çıkmadı (' + o.html.length + ' bayt)';
      return null;
    }
    var found = o.r.found;
    found.headers = { 'User-Agent': o.ua, 'Referer': origin + '/' };
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
      var okDur = parseInt((meta.movie && meta.movie.duration) || 0, 10) || 0;     // ok.ru: video süresi (sn)
      if (hls) return { url: hls, type: 'hls', quality: 'Auto', headers: hdr, duration: okDur };
      var order = ['full', 'hd', 'sd', 'low', 'lowest', 'mobile'];
      var q = { full: '1080p', hd: '720p', sd: '480p', low: '360p', lowest: '240p', mobile: '144p' };
      var vids = meta.videos || [];
      for (var i = 0; i < order.length; i++) {
        for (var j = 0; j < vids.length; j++) {
          if (vids[j].name === order[i] && vids[j].url) {
            return { url: vids[j].url, type: 'mp4', quality: q[order[i]], headers: hdr, duration: okDur };
          }
        }
      }
    } catch (e) {}
    return null;
  });
}

function resolveGeneric(embedUrl, pageUrl) {
  // vidmoxy (Fastly) ve bilinmeyen kaynaklar: RapidVid ile aynı çıkarma + UA yeniden denemesi
  return resolveRapid(embedUrl, pageUrl);
}

function resolveSource(url, pageUrl) {
  if (/rapidvid|rapid/i.test(originOf(url))) return resolveRapid(url, pageUrl);
  if (/ok\.ru/.test(url)) return resolveOk(url);
  if (/vidmoly/.test(url)) return resolveVidmoly(url);
  return resolveGeneric(url, pageUrl);
}

// ---------------- Süre doğrulama (yanlış film koruması) ----------------

function urlJoin(rel, base) {
  rel = String(rel || '');
  if (/^https?:\/\//i.test(rel)) return rel;
  if (rel.indexOf('//') === 0) return 'https:' + rel;
  if (rel.charAt(0) === '/') return originOf(base) + rel;
  return String(base).replace(/[?#].*$/, '').replace(/[^\/]*$/, '') + rel;
}

function fetchPlain(url, headers, ms) {
  return withTimeout(fetch(url, { headers: headers || { 'User-Agent': ANDROID_UA } }), ms).then(function (res) {
    return withTimeout(res.text(), ms);
  }).catch(function () { return ''; });
}

// HLS oynatma listesinin toplam süresi (sn). Ana liste ise ilk alt listeye inilir. Okunamazsa 0.
function hlsDuration(url, headers, depth) {
  return fetchPlain(url, headers, 4000).then(function (txt) {
    txt = String(txt || '');
    if (txt.indexOf('#EXTM3U') === -1) return 0;
    if (/#EXT-X-STREAM-INF/.test(txt)) {
      if (depth >= 1) return 0;
      var lines = txt.split(/\r?\n/), sub = '';
      for (var i = 0; i < lines.length; i++) {
        if (/#EXT-X-STREAM-INF/.test(lines[i])) {
          for (var j = i + 1; j < lines.length; j++) {
            if (lines[j].trim() && lines[j].charAt(0) !== '#') { sub = lines[j].trim(); break; }
          }
          if (sub) break;
        }
      }
      return sub ? hlsDuration(urlJoin(sub, url), headers, depth + 1) : 0;
    }
    var total = 0, re = /#EXTINF:\s*([0-9.]+)/g, m;
    while ((m = re.exec(txt)) !== null) total += parseFloat(m[1]) || 0;
    return total;
  });
}

// Akışın süresi film süresine uyuyor mu? { ok, dur, ratio }. Süre okunamazsa ok:true (akış korunur).
function verifyStream(r, runtimeMin, group) {
  var exp = (runtimeMin || 0) * 60;
  if (!SITE_AYARLARI.SURE_KONTROL || !exp) return Promise.resolve({ ok: true, dur: r.duration || 0, ratio: 0 });
  var p = r.duration ? Promise.resolve(r.duration)
        : (r.type === 'hls' ? hlsDuration(r.url, r.headers, 0) : Promise.resolve(0));
  return withTimeout(p, SITE_AYARLARI.SURE_BEKLEME).catch(function () { return 0; }).then(function (d) {
    d = Number(d) || 0;
    if (!d) return { ok: true, dur: 0, ratio: 0 };
    var ratio = d / exp;
    if (ratio > 6) { d = d / 1000; ratio = d / exp; }          // milisaniye gelmiş olabilir
    var lo = group === 'p' ? SITE_AYARLARI.PARCA_ALT : SITE_AYARLARI.SURE_ALT;
    var hi = group === 'p' ? 1.15 : SITE_AYARLARI.SURE_UST;
    return { ok: ratio >= lo && ratio <= hi, dur: Math.round(d), ratio: ratio };
  });
}

function fmtDur(sec) {
  if (!sec) return '';
  var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h + ':' + (m < 10 ? '0' : '') + m;
}

// ============================================================
//  NUVIO GİRİŞ NOKTASI
// ============================================================

function makeStream(label, r) {
  return {
    name: SITE_AYARLARI.EKLENTI_ADI,
    title: label,
    url: r.url,
    quality: r.quality || 'Auto',
    type: r.type,
    headers: r.headers || { 'User-Agent': ANDROID_UA },
    provider: PROVIDER_ID
  };
}

function debugStream(msg) {
  if (!SITE_AYARLARI.DEBUG_MODU) return [];
  var rows = [msg].concat(dbg.slice(0, 40));
  return rows.map(function (r) {
    return {
      name: 'DEBUG ' + r,
      title: 'DEBUG ' + r,
      url: 'https://debug.invalid/',
      quality: 'Auto',
      provider: PROVIDER_ID
    };
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (mediaType !== 'movie') return Promise.resolve([]);
  stage = 'tmdb';
  dbg = [];

  var tmdbBase = 'https://api.themoviedb.org/3/movie/' + tmdbId + '?api_key=' + TMDB_KEY;
  return Promise.all([
    withTimeout(fetch(tmdbBase + '&language=tr-TR&append_to_response=alternative_titles,translations'), 9000).then(function (res) { return res.json(); }),
    withTimeout(fetch(tmdbBase + '&language=en-US'), 9000).then(function (res) { return res.json(); }).catch(function () { return {}; })
  ])
    .then(function (both) {
      var info = both[0], en = both[1] || {};
      var extra = en.title ? [en.title] : [];
      var title = info.title;
      var origTitle = info.original_title;
      var year = (info.release_date || '').slice(0, 4);
      if (!title || !year) return debugStream('TMDB bilgisi eksik');
      stage = 'arama: ' + title + ' (' + year + ')';
      var runtime = info.runtime || en.runtime || 0;

      // Orijinal taraftaki adlar: sitenin gösterdiği orijinal ad bunlardan biriyle uyuşmalı (yanlış film koruması)
      var origWants = [];
      function addOrig(t) { if (t && norm(t).length >= 2 && origWants.indexOf(t) === -1) origWants.push(t); }
      addOrig(origTitle); addOrig(en.title);
      try { ((info.alternative_titles && info.alternative_titles.titles) || []).forEach(function (a) { if (a) addOrig(a.title); }); } catch (e) {}
      try { ((info.translations && info.translations.translations) || []).forEach(function (t) { if (t && t.data) addOrig(t.data.title); }); } catch (e) {}
      origWants = origWants.slice(0, 40);

      return findMoviePage(title, origTitle, year, info.imdb_id, extra, origWants).then(function (pagesFound) {
        pagesFound = pagesFound || [];
        if (!pagesFound.length) return debugStream('sayfa yok: ' + title + ' ' + year);

        // En iyi sayfadan başla. Akışların süresi filme uymuyorsa (yanlış sayfa belirtisi) sıradaki sayfayı dene.
        function attempt(pi, mismatchSeen) {
          if (pi >= pagesFound.length || pi >= 3) {
            return debugStream((mismatchSeen ? 'sure uyusmadi: ' : 'cozulemedi: ') + stage);
          }
          var found = pagesFound[pi];
          log('sayfa: ' + found.url);
          var sources = extractScxSources(found.html);
          if (!sources.length) sources = extractLegacySources(found.html);
          if (!sources.length) { dbg.push('scx kaynak yok ' + found.url); return attempt(pi + 1, mismatchSeen); }

          return Promise.all(sources.map(function (s) {
            return resolveSource(s.url, found.url).catch(function () { return null; });
          })).then(function (resolved) {
            return Promise.all(resolved.map(function (r, i) {
              return r ? verifyStream(r, runtime, sources[i].group) : Promise.resolve(null);
            })).then(function (checks) {
              var streams = [], seen = {}, rejected = 0;
              for (var i = 0; i < sources.length; i++) {
                var r = resolved[i], v = checks[i];
                if (!r || seen[r.url]) continue;
                if (v && !v.ok) {
                  rejected++;
                  dbg.push('RED sure ' + sources[i].label + ' ' + fmtDur(v.dur) + ' / ' + runtime + 'dk (x' + v.ratio.toFixed(2) + ')');
                  continue;
                }
                seen[r.url] = true;
                var label = /rapid/i.test(sources[i].url) ? 'RapidVid | ' + String(sources[i].label).toLowerCase() : sources[i].label;
                if (v && v.dur) label += ' | ' + fmtDur(v.dur);
                streams.push(makeStream(label, r));
              }
              if (streams.length) return streams;
              return attempt(pi + 1, mismatchSeen || rejected > 0);
            });
          });
        }
        return attempt(0, false);
      });
    })
    .catch(function (e) { return debugStream('hata ' + (e && e.message) + ' ' + stage); });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams, _t: { hlsDuration: hlsDuration, verifyStream: verifyStream, imdbIds: imdbIds, decodeToken: decodeToken, decodeSecret: decodeSecret, extractScxSources: extractScxSources, isRightMovie: isRightMovie, nameScore: nameScore, rankCandidate: rankCandidate, wantStrings: wantStrings, parseSearchCards: parseSearchCards, findStreamUrl: findStreamUrl, pageInfo: pageInfo } };
} else {
  global.getStreams = getStreams;
}
