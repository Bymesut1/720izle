const BASE_URL = 'https://www.hdfilmcehennemi.nl';
const TMDB_API_KEY = '000316508321ce461cf81e7c6815eec7';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Referer': BASE_URL + '/',
  'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
};

async function getHtml(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}

function absolute(url) {
  if (!url) return null;
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('/')) return BASE_URL + url;
  return url;
}

async function getTitle(tmdbId, mediaType) {
  const type = mediaType === 'tv' ? 'tv' : 'movie';
  const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&language=tr-TR`;
  const data = await (await fetch(url)).json();
  return { title: data.title || data.name, year: (data.release_date || data.first_air_date || '').slice(0, 4) };
}

// 1) Güncellenmiş arama fonksiyonu (Genel linkleri yakalar)
async function search(query) {
  const searchUrl = `${BASE_URL}/arama?s=${encodeURIComponent(query)}`;
  let html = '';
  try {
    html = await getHtml(searchUrl);
  } catch (e) {
    html = await getHtml(`${BASE_URL}/?s=${encodeURIComponent(query)}`);
  }

  const results = [];
  // Film detay sayfalarına giden bağlantıları ve başlıkları yakala
  const re = /<a[^>]+href="([^"]+)"[^>]*title="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const link = absolute(m[1]);
    const title = m[2].trim();
    if (link && (link.includes('/filmler/') || link.includes('/dizi/') || link.includes('-izle')) ) {
      if (!results.some(r => r.url === link)) {
        results.push({ url: link, title: title });
      }
    }
  }
  return results;
}

// 2) Detay sayfasından video kaynaklarını çekme
async function extractPlayers(pageUrl) {
  const html = await getHtml(pageUrl);
  const streams = [];

  // Sayfa içerisindeki iframe kaynaklarını bul
  const iframeRe = /<iframe[^>]+src="([^"]+)"/g;
  let m;
  while ((m = iframeRe.exec(html)) !== null) {
    const src = absolute(m[1]);
    if (src && !src.includes('google') && !src.includes('disqus')) {
      streams.push(src);
    }
  }

  return streams;
}

// 3) Ana akış fonksiyonu
async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    const info = await getTitle(tmdbId, mediaType);
    const found = await search(info.title);
    if (!found.length) return [];

    const best = found[0];
    const pageUrl = mediaType === 'tv' ? `${best.url}?sezon=${season}&bolum=${episode}` : best.url;

    const playerUrls = await extractPlayers(pageUrl);
    const streams = [];

    for (let i = 0; i < playerUrls.length; i++) {
      const pUrl = playerUrls[i];
      
      // Eğer doğrudan m3u8 veya desteklenen kaynak ise
      streams.push({
        name: 'Hdfilmcehennemi',
        title: `${info.title} (Kaynak ${i + 1})`,
        url: pUrl,
        quality: '1080p',
        headers: { Referer: pageUrl, 'User-Agent': HEADERS['User-Agent'] }
      });
    }

    return streams;
  } catch (e) {
    console.log('Hata: ' + e.message);
    return [];
  }
}

module.exports = { getStreams };
