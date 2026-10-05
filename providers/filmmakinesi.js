// ============================================================
//  FilmMakinesi — Nuvio Provider
//  Repo yolu: providers/filmmakinesi.js
// ============================================================

var PRIMARY_DOMAIN = 'https://filmmakinesi.to';
var TMDB_KEY = '000316508321ce461cf81e7c6815eec7';
var ANDROID_UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36';

var DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

var PAGE_HEADERS = {
  'User-Agent': ANDROID_UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
  'Referer': PRIMARY_DOMAIN + '/',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'same-origin',
  'Sec-Fetch-User': '?1',
  'sec-ch-ua-mobile': '?1',
  'sec-ch-ua-platform': '"Android"'
};

// Site 403 verirse sırayla bu başlık setleri denenir
var HEADER_SETS = [
  PAGE_HEADERS,
  {
    'User-Agent': DESKTOP_UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8'
  },
  { 'User-Agent': ANDROID_UA }
];
var blockInfoShown = false;

// Geçici hata ayıklama: true iken akış çıkmazsa, hatanın nerede olduğunu
// akış listesinde "DEBUG:" satırları olarak gösterir. Çalışınca false yap.
var DEBUG_MODE = true;
var DEBUG = [];
function dbg(msg) {
  DEBUG.push(String(msg));
  console.log('[FilmMakinesi] ' + msg);
}
function debugStreams() {
  if (!DEBUG_MODE) return [];
  return DEBUG.slice(0, 10).map(function (line, i) {
    return {
      name: 'FilmMakinesi',
      title: 'DEBUG: ' + line,
      url: 'https://debug.invalid/' + i + '.m3u8',
      quality: 'Auto',
      type: 'hls'
    };
  });
}

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

function stripTags(s) {
  return decodeHtml(String(s || '').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

function norm(s) {
  return String(s || '').replace(/İ/g, 'i').toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function getText(url, headers) {
  var short = String(url).replace(/^https?:\/\//, '').slice(0, 40);
  var sets = headers ? [headers] : HEADER_SETS;
  var codes = [];
  for (var i = 0; i < sets.length; i++) {
    try {
      var res = await withTimeout(fetch(url, { headers: sets[i] }), 8000);
      if (res.ok) {
        var text = await withTimeout(res.text(), 8000);
        dbg('OK ' + text.length + ' kar. ' + (i ? '(set ' + (i + 1) + ') ' : '') + short);
        return text;
      }
      codes.push(res.status);
      // İlk engelde sunucu ve sayfa içeriğinden ipucu al (örn. Cloudflare)
      if (!blockInfoShown) {
        blockInfoShown = true;
        var server = '?';
        try { server = res.headers.get('server') || '?'; } catch (e1) {}
        var snippet = '';
        try { snippet = stripTags(await withTimeout(res.text(), 5000)).slice(0, 60); } catch (e2) {}
        dbg('Engel: server=' + server + ' içerik="' + snippet + '"');
      }
    } catch (e) {
      codes.push('hata');
    }
  }
  dbg('HTTP ' + codes.join('/') + ' ' + short);
  return '';
}

// ------------------------------------------------------------
//  1) Arama ve doğru film sayfasını bulma
// ------------------------------------------------------------

// Arama sonucundaki kartlardan { path, title, year } çıkarır (sadece /film/)
function parseSearchCards(html) {
  var cards = [];
  var chunks = String(html || '').split('<div class="item-relative">');
  for (var i = 1; i < chunks.length; i++) {
    var c = chunks[i];
    var href = (c.match(/href="(\/film\/[^"]+)"/) || [])[1];
    if (!href) continue;
    var t = (c.match(/data-title="([^"]*)"/) || [])[1] ||
            (c.match(/<div class="title">([^<]*)</) || [])[1] || '';
    var y = (c.match(/<div class="info"><span>\s*(\d{4})\s*<\/span>/) || [])[1] || '';
    cards.push({ path: href, title: decodeHtml(t).trim(), year: parseInt(y, 10) || 0 });
  }
  return cards;
}

// Film sayfasının doğru film olup olmadığını kontrol eder (önce IMDb ID, sonra yıl + başlık)
function isRightMovie(html, imdbId, title, origTitle, year) {
  if (imdbId) {
    var id = (html.match(/class="imdb imdb-link"[^>]*data-id="(tt\d+)"/) || [])[1];
    if (id) return id === imdbId;
  }
  var h1 = stripTags((html.match(/<h1 class="title">([\s\S]*?)<\/h1>/) || [])[1] || '');
  var y = parseInt(year, 10);
  var yearOk = false;
  for (var d = -1; d <= 1; d++) {
    if (h1.indexOf('(' + (y + d) + ')') > -1) yearOk = true;
  }
  var nh = norm(h1);
  var titleOk = (title && nh.indexOf(norm(title)) > -1) ||
                (origTitle && nh.indexOf(norm(origTitle)) > -1);
  return yearOk && !!titleOk;
}

async function findMoviePage(imdbId, title, origTitle, year) {
  var y = parseInt(year, 10);
  var nTitle = norm(title);
  var nOrig = norm(origTitle);

  var queries = [imdbId, origTitle, title].filter(function (q, i, a) {
    return q && a.indexOf(q) === i;
  });
  var results = await Promise.all(queries.map(function (q) {
    return getText(PRIMARY_DOMAIN + '/arama/?s=' + encodeURIComponent(q));
  }));

  var paths = [];
  function add(p) { if (p && paths.indexOf(p) === -1) paths.push(p); }

  // IMDb ID ile arama sonuçları en güvenilir olanı
  var perQuery = results.map(parseSearchCards);
  if (imdbId && perQuery[0]) perQuery[0].forEach(function (c) { add(c.path); });

  var all = [];
  perQuery.forEach(function (list) { list.forEach(function (c) { all.push(c); }); });

  function yearOk(c) { return c.year && Math.abs(c.year - y) <= 1; }
  function titleOk(c) {
    var n = norm(c.title);
    return n && (n === nTitle || n === nOrig);
  }

  all.filter(function (c) { return yearOk(c) && titleOk(c); }).forEach(function (c) { add(c.path); });
  all.filter(function (c) { return yearOk(c); }).forEach(function (c) { add(c.path); });
  all.filter(function (c) { return titleOk(c); }).forEach(function (c) { add(c.path); });

  var candidates = paths.slice(0, 6);
  var pages = await Promise.all(candidates.map(function (p) {
    return getText(PRIMARY_DOMAIN + p);
  }));
  for (var i = 0; i < pages.length; i++) {
    if (pages[i] && isRightMovie(pages[i], imdbId, title, origTitle, year)) {
      return { url: PRIMARY_DOMAIN + candidates[i], html: pages[i] };
    }
  }
  return null;
}

// ------------------------------------------------------------
//  2) Film sayfasından kaynak butonlarını alma
// ------------------------------------------------------------

// <a ... data-video_url="https://closeload...">DUAL Close</a>
function extractSources(html) {
  var list = [];
  var re = /<a[^>]*data-video_url="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, m;
  while ((m = re.exec(html)) !== null) {
    var url = decodeHtml(m[1]);
    var label = stripTags(m[2]);
    if (/youtube\.com|youtu\.be/.test(url)) continue;
    if (!/^https?:\/\//.test(url)) continue;
    if (list.some(function (x) { return x.url === url; })) continue;
    list.push({ url: url, label: label || 'Kaynak' });
  }
  if (!list.length) {
    var d = html.match(/<iframe[^>]*data-src="([^"]+)"/);
    if (d && !/youtube/.test(d[1])) list.push({ url: decodeHtml(d[1]), label: 'Varsayılan' });
  }
  return list;
}

// ------------------------------------------------------------
//  3) Oynatıcı sayfasından gerçek yayın adresini çıkarma
// ------------------------------------------------------------

function cleanUrl(u) {
  return String(u || '')
    .replace(/\\u0026/gi, '&').replace(/\\u002F/gi, '/').replace(/\\x2F/gi, '/')
    .replace(/\\\//g, '/').replace(/&amp;/g, '&');
}

function isMediaUrl(u) {
  if (!/^https?:\/\//.test(u)) return false;
  if (/\.(jpg|jpeg|png|webp|gif|vtt|srt|css|js)(\?|$)/i.test(u)) return false;
  return /\.(m3u8|mp4)(\?|$)/i.test(u) || /\/hls\/|sublist|master|playlist/i.test(u);
}

function pickMediaUrl(text) {
  var patterns = [
    /["']?file["']?\s*:\s*["']([^"']+)["']/g,
    /<source[^>]+src=["']([^"']+)["']/g,
    /(https?:\/\/[^"'\s<>\\]+\.(?:m3u8|txt)(?:\?[^"'\s<>\\]*)?)/g,
    /(https?:\/\/[^"'\s<>\\]+\/hls\/[^"'\s<>\\]+)/g
  ];
  for (var i = 0; i < patterns.length; i++) {
    var re = patterns[i], m;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      var u = cleanUrl(m[1]);
      if (isMediaUrl(u)) return u;
    }
  }
  return null;
}

// eval(function(p,a,c,k,e,d){...}('...',a,c,'...'.split('|'))) açıcı
function unpackPacked(src) {
  var m = src.match(/\}\('([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)/);
  if (!m) return null;
  try {
    var payload = m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    var radix = parseInt(m[2], 10);
    var words = m[4].split('|');
    function enc(c) {
      return (c < radix ? '' : enc(parseInt(c / radix, 10))) +
             ((c = c % radix) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
    }
    return payload.replace(/\b\w+\b/g, function (w) {
      var idx = parseInt(w, radix);
      if (isNaN(idx) || enc(idx) !== w) return w;
      return words[idx] || w;
    });
  } catch (e) {
    return null;
  }
}

function collectTexts(html) {
  var texts = [html];
  var packed = unpackPacked(html);
  if (packed) texts.push(packed);
  if (typeof atob === 'function') {
    var re = /atob\(\s*["']([A-Za-z0-9+\/=]{20,})["']\s*\)/g, m;
    while ((m = re.exec(html)) !== null) {
      try { texts.push(atob(m[1])); } catch (e) {}
    }
  }
  return texts;
}

async function resolveEmbed(embedUrl) {
  var clean = decodeHtml(embedUrl);
  var origin = (clean.match(/^https?:\/\/[^\/]+/) || [PRIMARY_DOMAIN])[0];

  var html = await getText(clean, {
    'User-Agent': ANDROID_UA,
    'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
    'Accept-Language': 'tr-TR,tr;q=0.9',
    'Referer': PRIMARY_DOMAIN + '/'
  });
  if (!html) return null;

  var texts = collectTexts(html);
  for (var i = 0; i < texts.length; i++) {
    var u = pickMediaUrl(texts[i]);
    if (u) {
      var isHls = /\.m3u8|sublist|master|playlist|\/hls\//i.test(u);
      return { url: u, type: isHls ? 'hls' : 'mp4', quality: 'Auto', referer: origin + '/' };
    }
  }

  dbg('oynatıcıda m3u8/hls adresi yok: ' + clean.replace(/^https?:\/\//, '').slice(0, 40));
  return null;
}

// ------------------------------------------------------------
//  4) Nuvio giriş noktası
// ------------------------------------------------------------

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    DEBUG.length = 0;
    blockInfoShown = false;
    dbg('tür=' + mediaType + ' tmdb=' + tmdbId);

    // Şimdilik sadece film
    if (mediaType !== 'movie') return [];

    // 1) TMDB'den başlık, yıl ve IMDb ID
    var tmdbRes = await withTimeout(fetch(
      'https://api.themoviedb.org/3/movie/' + tmdbId + '?language=tr-TR&api_key=' + TMDB_KEY
    ), 8000);
    var info = await tmdbRes.json();
    var title = info.title;
    var origTitle = info.original_title;
    var imdbId = info.imdb_id || '';
    var year = (info.release_date || '').slice(0, 4);
    dbg('TMDB: ' + title + ' ' + year + ' ' + (imdbId || 'imdb yok'));
    if (!title || !year) return debugStreams();

    // 2) Doğru film sayfasını bul
    var found = await findMoviePage(imdbId, title, origTitle, year);
    if (!found) {
      dbg('film sayfası bulunamadı');
      return debugStreams();
    }
    dbg('film sayfası: ' + found.url.replace(/^https?:\/\//, '').slice(0, 45));

    // 3) Sayfadaki kaynakları al, hepsini aynı anda çöz
    var sources = extractSources(found.html);
    dbg('kaynak sayısı: ' + sources.length);
    var resolved = await Promise.all(sources.map(function (s) {
      return resolveEmbed(s.url).catch(function () { return null; });
    }));

    var streams = [];
    for (var i = 0; i < sources.length; i++) {
      var r = resolved[i];
      dbg(sources[i].label + ': ' + (r ? 'adres bulundu' : 'adres YOK'));
      if (!r) continue;
      streams.push({
        name: 'FilmMakinesi',
        title: '⌜ FILMMAKINESI ⌟ | ' + sources[i].label,
        url: r.url,
        quality: r.quality,
        type: r.type,
        headers: { 'User-Agent': ANDROID_UA, 'Referer': r.referer }
      });
    }
    if (!streams.length) return debugStreams();
    return streams;
  } catch (e) {
    dbg('hata: ' + e);
    return debugStreams();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.getStreams = getStreams;
}
