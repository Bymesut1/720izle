const BASE_URL = 'https://www.hdfilmcehennemi.nl';
const TMDB_API_KEY = '000316508321ce461cf81e7c6815eec7';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Referer': BASE_URL + '/',
  'Accept-Language': 'tr-TR,tr;q=0.9',
};

// ---------- Yardımcılar ----------
async function getHtml(url, extraHeaders) {
  const res = await fetch(url, { headers: Object.assign({}, HEADERS, extraHeaders || {}) });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
  return res.text();
}

function absolute(url) {
  if (!url) return null;
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('/')) return BASE_URL + url;
  return url;
}

// TMDB ID -> başlık + yıl (arama için)
async function getTitle(tmdbId, mediaType) {
  const type = mediaType === 'tv' ? 'tv' : 'movie';
  const url =
    'https://api.themoviedb.org/3/' + type + '/' + tmdbId +
    '?api_key=' + TMDB_API_KEY + '&language=tr-TR';
  const data = await (await fetch(url)).json();
  const title = data.title || data.name;
  const date = data.release_date || data.first_air_date || '';
  return { title: title, year: date.slice(0, 4) };
}

// ---------- 1) Arama sonuçlarını HTML'den çek ----------
async function search(query) {
  // Hdfilmcehennemi benzeri yapılar için arama endpoint'i veya query yapısı
  const html = await getHtml(BASE_URL + '/?s=' + encodeURIComponent(query));
  
  const results = [];
  // Poster/film kartlarındaki bağlantı ve başlık yapılarına göre regex
  const re = /<a href="([^"]+)"[^>]*class="poster[^"]*"[^>]*title="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    results.push({ url: absolute(m[1]), title: m[2].trim() });
  }

  // Alternatif genel arama yakalama regex'i (bulamazsa yedek)
  if (!results.length) {
    const altRe = /<a href="(https:\/\/[^"]+)"[^>]*title="([^"]+)"/g;
    while ((m = altRe.exec(html)) !== null) {
      if (m[1].includes('/film/') || m[1].includes('-')) {
        results.push({ url: m[1], title: m[2].trim() });
      }
    }
  }

  return results;
}

// ---------- 2) Detay sayfasından oynatıcı linkini çek ----------
async function extractPlayers(pageUrl) {
  const html = await getHtml(pageUrl);
  const players = [];

  // Örnek sayfadaki iframe / data-src yapıları (örn: rapidrame)
  const iframeRe = /<iframe[^>]+(?:data-src|src)="([^"]+)"/g;
  let m;
  while ((m = iframeRe.exec(html)) !== null) {
    players.push(absolute(m[1]));
  }

  // Doğrudan .m3u8 veya .mp4 bağlantıları
  const directRe = /https?:\/\/[^"'\s]+\.(?:m3u8|mp4)[^"'\s]*/g;
  const direct = html.match(directRe) || [];

  return { iframes: players, direct: direct };
}

// İsteğe bağlı: Rapidrame gibi iframe kaynaklarını çözme fonksiyonu
async function resolveRapidrame(iframeUrl) {
  try {
    const html = await getHtml(iframeUrl);
    // İçerideki video source m3u8 adresini yakala
    const sourceRe = /<source[^>]+src="([^"]+\.m3u8[^"]*)"/g;
    const m = sourceRe.exec(html);
    if (m) return m[1].replace(/&amp;/g, '&');
    
    const generalRe = /https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/g;
    const match = html.match(generalRe);
    return match ? match[0] : null;
  } catch (e) {
    return null;
  }
}

// ---------- 3) Nuvio giriş noktası ----------
async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    const info = await getTitle(tmdbId, mediaType);
    const found = await search(info.title);
    if (!found.length) return [];

    const best =
      found.find(function (r) {
        return r.title.toLowerCase().indexOf(info.title.toLowerCase()) !== -1;
      }) || found[0];

    const pageUrl =
      mediaType === 'tv' ? best.url + '?sezon=' + season + '&bolum=' + episode : best.url;

    const players = await extractPlayers(pageUrl);
    const streams = [];

    // Doğrudan bulunan linkleri ekle
    players.direct.forEach(function (link, i) {
      streams.push({
        name: 'Hdfilmcehennemi',
        title: info.title + ' (Direkt ' + (i + 1) + ')',
        url: link,
        quality: link.indexOf('.m3u8') !== -1 ? '1080p' : 'HD',
        headers: { Referer: pageUrl, 'User-Agent': HEADERS['User-Agent'] },
      });
    });

    // İframe'leri (örneğin Rapidrame) çözerek akışlara ekle
    for (let i = 0; i < players.iframes.length; i++) {
      const iframeUrl = players.iframes[i];
      if (iframeUrl.includes('rapidrame') || iframeUrl.includes('rplayer')) {
        const streamUrl = await resolveRapidrame(iframeUrl);
        if (streamUrl) {
          streams.push({
            name: 'Rapidrame',
            title: info.title + ' (Rapidrame Kaynağı)',
            url: streamUrl,
            quality: '1080p',
            headers: { Referer: iframeUrl, 'User-Agent': HEADERS['User-Agent'] },
          });
        }
      }
    }

    return streams;
  } catch (e) {
    console.log('[hdfilmcehennemi] hata: ' + e.message);
    return [];
  }
}

module.exports = { getStreams };
