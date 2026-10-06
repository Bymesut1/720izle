// Nuvio local scraper: video.mail.ru
// Not: TMDB_KEY alanına kendi TMDB API anahtarını yaz.
var TMDB_KEY = 'BURAYA_TMDB_API_KEY';
var UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';

function norm(u) {
  u = String(u).replace(/\\\//g, '/');
  if (u.indexOf('//') === 0) return 'https:' + u;
  return u;
}

function getTitles(tmdbId, mediaType) {
  var t = mediaType === 'tv' ? 'tv' : 'movie';
  var base = 'https://api.themoviedb.org/3/' + t + '/' + tmdbId + '?api_key=' + TMDB_KEY;
  return fetch(base + '&language=ru-RU').then(function (r) { return r.json(); }).then(function (d) {
    var out = [];
    var ru = d.title || d.name;
    var orig = d.original_title || d.original_name;
    if (ru) out.push(ru);
    if (orig && orig !== ru) out.push(orig);
    return out;
  }).catch(function () { return []; });
}

function search(q) {
  var url = 'https://my.mail.ru/video/search?q=' + encodeURIComponent(q);
  return fetch(url, { headers: { 'User-Agent': UA } })
    .then(function (r) { return r.text(); })
    .then(function (html) {
      html = html.replace(/\\\//g, '/');
      var re = /\/(?:mail|inbox|list|bk|corp|vk|ok)\/[^"'\s<>\\]+?\/video\/[^"'\s<>\\]+?\/\d+\.html/g;
      var seen = {}, res = [], m;
      while ((m = re.exec(html)) !== null) {
        if (!seen[m[0]]) { seen[m[0]] = 1; res.push('https://my.mail.ru' + m[0]); }
      }
      return res.slice(0, 3);
    })
    .catch(function () { return []; });
}

function extract(pageUrl) {
  return fetch(pageUrl, { headers: { 'User-Agent': UA } })
    .then(function (r) { return r.text(); })
    .then(function (html) {
      var m = html.match(/"(?:metadataUrl|metaUrl)"\s*:\s*"([^"]+)"/);
      if (!m) return [];
      return fetch(norm(m[1]), { headers: { 'User-Agent': UA, 'Referer': pageUrl } })
        .then(function (r) {
          var sc = (r.headers && r.headers.get && r.headers.get('set-cookie')) || '';
          var k = sc.match(/video_key=[^;]+/);
          return r.json().then(function (j) { return { j: j, cookie: k ? k[0] : '' }; });
        })
        .then(function (o) {
          var vids = (o.j && o.j.videos) || [];
          var title = (o.j && o.j.meta && o.j.meta.title) || 'Mail.ru';
          var headers = { 'User-Agent': UA, 'Referer': 'https://my.mail.ru/' };
          if (o.cookie) headers['Cookie'] = o.cookie;
          return vids.map(function (v) {
            return {
              name: 'Mail.ru',
              title: title + ' [' + v.key + ']',
              url: norm(v.url),
              quality: v.key,
              headers: headers,
              provider: 'mailru'
            };
          });
        });
    })
    .catch(function () { return []; });
}

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  return getTitles(tmdbId, mediaType).then(function (titles) {
    if (!titles.length) return [];
    var suffix = mediaType === 'tv' ? ' ' + seasonNum + ' сезон ' + episodeNum + ' серия' : '';
    var queries = titles.map(function (t) { return t + suffix; });
    return Promise.all(queries.map(search)).then(function (lists) {
      var pages = [], seen = {};
      lists.forEach(function (l) { l.forEach(function (p) { if (!seen[p]) { seen[p] = 1; pages.push(p); } }); });
      return Promise.all(pages.slice(0, 4).map(extract));
    }).then(function (all) {
      var flat = [];
      all.forEach(function (a) { flat = flat.concat(a); });
      flat.sort(function (a, b) { return parseInt(b.quality) - parseInt(a.quality); });
      return flat;
    });
  }).catch(function () { return []; });
}

module.exports = { getStreams: getStreams };
