// ============================================================
//  720izle — Nuvio Provider
// ============================================================

var PRIMARY_DOMAIN = 'https://720izle.net';
var TMDB_KEY = '000316508321ce461cf81e7c6815eec7';
var ANDROID_UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36';

var PAGE_HEADERS = {
  'User-Agent': ANDROID_UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'tr-TR,tr;q=0.9',
  'Referer': PRIMARY_DOMAIN + '/'
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

// Hotstream Oynatıcı Çözücü
async function resolveHotstream(embedUrl) {
  var html = await getText(embedUrl, {
    'User-Agent': ANDROID_UA,
    'Referer': PRIMARY_DOMAIN + '/'
  });
  if (!html) return null;

  var found = findStreamUrl(html);
  if (!found) {
    var unpacked = unpackPacked(html);
    if (unpacked) found = findStreamUrl(unpacked);
  }

  if (found) {
    found.headers = {
      'User-Agent': ANDROID_UA,
      'Referer': 'https://hotstream.club/'
    };
    return found;
  }
  return null;
}

// Vidmoly Oynatıcı Çözücü
async function resolveVidmoly(embedUrl) {
  var clean = embedUrl.split('?')[0];
  var html = await getText(clean, {
    'User-Agent': ANDROID_UA,
    'Referer': PRIMARY_DOMAIN + '/'
  });
  if (!html) return null;
  var found = findStreamUrl(html);
  if (!found) {
    var unpacked = unpackPacked(html);
    if (unpacked) found = findStreamUrl(unpacked);
  }
  if (found) {
    found.headers = { 'User-Agent': ANDROID_UA, 'Referer': 'https://vidmoly.biz/' };
    return found;
  }
  return null;
}

// Sayfa Doğrulama
function isRightMovie(html, title, origTitle, year) {
  if (!html) return false;
  var normHtml = norm(html);
  var nTitle = norm(title);
  var nOrig = norm(origTitle);
  var y = parseInt(year, 10);
  
  var yearOk = !y || html.indexOf(String(y)) > -1;
  var titleOk = (nTitle && normHtml.indexOf(nTitle) > -1) ||
                (nOrig && normHtml.indexOf(nOrig) > -1);

  return yearOk && titleOk;
}

// Arama Sonuçlarından Kartları Çekme
function parseSearchCards(html) {
  var cards = [];
  if (!html) return cards;
  var cardRegex = /href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  var m;
  while ((m = cardRegex.exec(html)) !== null) {
    var path = m[1];
    var inner = m[2];
    if (path.indexOf('facebook') > -1 || path.indexOf('twitter') > -1 || path.indexOf('kategori') > -1) continue;
    var title = (inner.match(/alt="([^"]*)"/) || inner.match(/title="([^"]*)"/) || [])[1] || '';
    if (path && title) {
      cards.push({ path: path, title: decodeHtml(title).trim() });
    }
  }
  return cards;
}

async function findMoviePage(title, origTitle, year) {
  var nTitle = norm(title);
  var nOrig = norm(origTitle);
  var paths = [];

  function add(p) { if (p && paths.indexOf(p) === -1) paths.push(p); }

  var queries = [origTitle, title].filter(function (q, i, a) { return q && a.indexOf(q) === i; });
  var results = await Promise.all(queries.map(function (q) {
    return getText(PRIMARY_DOMAIN + '/?s=' + encodeURIComponent(q));
  }));

  results.forEach(function (html) {
    parseSearchCards(html).forEach(function (c) {
      var n = norm(c.title);
      if (n && (n.indexOf(nTitle) > -1 || (nOrig && n.indexOf(nOrig) > -1))) {
        add(c.path);
      }
    });
  });

  // Alternatif Yönlendirmeler
  if (title) {
    add('/filmler11/' + slugify(title) + '-izle/');
    add('/' + slugify(title) + '-izle/');
  }

  var candidates = paths.slice(0, 5);
  var pages = await Promise.all(candidates.map(function (p) {
    var fullUrl = /^https?:\/\//.test(p) ? p : (PRIMARY_DOMAIN + (p.startsWith('/') ? '' : '/') + p);
    return getText(fullUrl);
  }));

  for (var i = 0; i < pages.length; i++) {
    if (pages[i] && isRightMovie(pages[i], title, origTitle, year)) {
      return { url: candidates[i], html: pages[i] };
    }
  }
  return null;
}

// Iframe / Video Linklerini Ayıklama
function extractSources(html) {
  var list = [];
  var iframeRegex = /<iframe[^>]+src="([^"]+)"/gi;
  var m;
  while ((m = iframeRegex.exec(html)) !== null) {
    var src = decodeHtml(m[1]);
    if (/youtube|facebook|twitter|google/.test(src)) continue;
    var label = 'Hotstream';
    if (/vidmoly/.test(src)) label = 'Vidmoly';
    else if (/ok\.ru/.test(src)) label = 'Ok.ru';
    list.push({ url: src, label: label });
  }
  return list;
}

async function resolveSource(url) {
  if (!url) return null;
  if (/hotstream/.test(url)) return resolveHotstream(url);
  if (/vidmoly/.test(url)) return resolveVidmoly(url);
  return null;
}

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
    if (!title) return [];

    var found = await findMoviePage(title, origTitle, year);
    if (!found) return [];

    var sources = extractSources(found.html);
    var resolved = await Promise.all(sources.map(function (s) { return resolveSource(s.url); }));
    var streams = [];

    for (var i = 0; i < sources.length; i++) {
      var r = resolved[i];
      if (!r) continue;
      streams.push({
        name: '720izle',
        title: '⌜ 720IZLE ⌟ | ' + sources[i].label,
        url: r.url,
        quality: r.quality,
        type: r.type,
        headers: r.headers || { 'User-Agent': ANDROID_UA, 'Referer': PRIMARY_DOMAIN + '/' }
      });
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
