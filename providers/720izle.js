// ============================================================
//  720izle — Nuvio Provider (Seyret2 / Hotstream Desteği)
// ============================================================

var PRIMARY_DOMAIN = 'https://720izle.net';
var TMDB_KEY = '000316508321ce461cf81e7c6815eec7';
var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

var HEADERS = {
  'User-Agent': USER_AGENT,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
};

function slugify(text) {
  if (!text) return '';
  var trMap = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'Ç': 'c', 'Ğ': 'g', 'İ': 'i', 'Ö': 'o', 'Ş': 's', 'Ü': 'u' };
  var str = String(text).replace(/[çğıöşüÇĞİÖŞÜ]/g, function (m) { return trMap[m]; });
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function fetchText(url, reqHeaders) {
  try {
    var res = await fetch(url, { headers: reqHeaders || HEADERS });
    if (!res.ok) return '';
    return await res.text();
  } catch (e) {
    return '';
  }
}

// Embed / Iframe İçindeki Gizli Seyret2 / Hotstream Yayın Linkini Çözme
async function resolveEmbed(embedUrl) {
  if (!embedUrl) return null;
  if (embedUrl.startsWith('//')) embedUrl = 'https:' + embedUrl;

  var html = await fetchText(embedUrl, {
    'User-Agent': USER_AGENT,
    'Referer': PRIMARY_DOMAIN + '/'
  });
  if (!html) return null;

  var streamUrl = '';

  // 1. Seyret2.top / process gizli yayın adresi yakalama
  var processMatch = html.match(/https?:\/\/[^"'\s\\]*seyret[^"'\s\\]*\/process\/[^"'\s\\]+/i) ||
                     html.match(/https?:\/\/[^"'\s\\]+\/process\/[^"'\s\\]+/i);

  if (processMatch) {
    streamUrl = processMatch[0].replace(/\\\//g, '/').replace(/&amp;/g, '&');
  } else {
    // 2. Standart m3u8 adresi yakalama (Yedek)
    var m3u8Match = html.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/i);
    if (m3u8Match) {
      streamUrl = m3u8Match[0].replace(/\\\//g, '/').replace(/&amp;/g, '&');
    }
  }

  if (streamUrl) {
    return {
      url: streamUrl,
      type: 'hls',
      quality: 'Auto',
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': 'https://hotstream.club/',
        'Origin': 'https://hotstream.club'
      }
    };
  }

  return null;
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    if (mediaType !== 'movie') return [];

    // TMDB Bilgisini Çek
    var tmdbRes = await fetch('https://api.themoviedb.org/3/movie/' + tmdbId + '?language=tr-TR&api_key=' + TMDB_KEY);
    if (!tmdbRes.ok) return [];
    var info = await tmdbRes.json();

    var title = info.title;
    var origTitle = info.original_title;
    if (!title && !origTitle) return [];

    var candidateUrls = [];

    // Doğrudan URL Tahminleri
    if (origTitle) {
      var origSlug = slugify(origTitle);
      candidateUrls.push(PRIMARY_DOMAIN + '/filmler11/' + origSlug + '-izle/');
      candidateUrls.push(PRIMARY_DOMAIN + '/' + origSlug + '-izle/');
    }
    if (title) {
      var titleSlug = slugify(title);
      candidateUrls.push(PRIMARY_DOMAIN + '/filmler11/' + titleSlug + '-izle/');
      candidateUrls.push(PRIMARY_DOMAIN + '/' + titleSlug + '-izle/');
    }

    // Site İçi Arama Sonuçları
    var searchQueries = [origTitle, title].filter(Boolean);
    for (var i = 0; i < searchQueries.length; i++) {
      var searchHtml = await fetchText(PRIMARY_DOMAIN + '/?s=' + encodeURIComponent(searchQueries[i]));
      if (searchHtml) {
        var hrefMatches = searchHtml.match(/href="([^"]+)"/gi) || [];
        for (var j = 0; j < hrefMatches.length; j++) {
          var link = hrefMatches[j].replace(/href="|"/g, '');
          if (link.indexOf('facebook') === -1 && link.indexOf('twitter') === -1 && link.indexOf('/kategori/') === -1) {
            if (candidateUrls.indexOf(link) === -1) candidateUrls.push(link);
          }
        }
      }
    }

    // Aday sayfaları tara ve iframe adreslerini yakala
    var iframeSrcs = [];
    for (var k = 0; k < candidateUrls.length && k < 5; k++) {
      var pageUrl = candidateUrls[k];
      if (!pageUrl.startsWith('http')) pageUrl = PRIMARY_DOMAIN + (pageUrl.startsWith('/') ? '' : '/') + pageUrl;

      var pageHtml = await fetchText(pageUrl);
      if (pageHtml && (pageHtml.indexOf('iframe') > -1 || pageHtml.indexOf('embed') > -1)) {
        var iframeMatches = pageHtml.match(/<iframe[^>]+src="([^"]+)"/gi) || [];
        for (var m = 0; m < iframeMatches.length; m++) {
          var match = iframeMatches[m].match(/src="([^"]+)"/i);
          if (match && match[1]) {
            var src = match[1];
            if (src.indexOf('youtube') === -1 && src.indexOf('facebook') === -1) {
              if (iframeSrcs.indexOf(src) === -1) iframeSrcs.push(src);
            }
          }
        }
        if (iframeSrcs.length > 0) break;
      }
    }

    if (iframeSrcs.length === 0) return [];

    // Bulunan iframe adreslerini çöz ve Nuvio'ya aktar
    var streams = [];
    for (var n = 0; n < iframeSrcs.length; n++) {
      var embedUrl = iframeSrcs[n];
      var streamObj = await resolveEmbed(embedUrl);
      if (streamObj) {
        var serverName = embedUrl.indexOf('hotstream') > -1 ? 'Hotstream' : (embedUrl.indexOf('vidmoly') > -1 ? 'Vidmoly' : 'Server');
        streams.push({
          name: '720izle',
          title: '⌜ 720IZLE ⌟ | ' + serverName,
          url: streamObj.url,
          quality: streamObj.quality || 'Auto',
          type: streamObj.type || 'hls',
          headers: streamObj.headers
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
