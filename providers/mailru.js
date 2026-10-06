// Nuvio local scraper: video.mail.ru
// Not: TMDB_KEY alanına kendi TMDB API anahtarını yaz.
var TMDB_KEY = '000316508321ce461cf81e7c6815eec7';
var UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';

var DEBUG = true;
var DBG = [];
function dbg(m) { DBG.push(m); try { console.log('[mailru] ' + m); } catch (e) {} }

function norm(u) {
  u = String(u).replace(/\\\//g, '/');
  if (u.indexOf('//') === 0) return 'https:' + u;
  return u;
}

function getTitles(tmdbId, mediaType) {
  dbg('getTitles ' + tmdbId);
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
  return fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ru-RU,ru;q=0.9' } })
    .then(function (r) { dbg('search status ' + r.status + ' q=' + q); return r.text(); })
    .then(function (html) {
      html = html.replace(/\\\//g, '/').replace(/&amp;/g, '&');
      dbg('search html length ' + html.length);
      var re = /(?:https?:)?(?:\/\/(?:my|video)\.mail\.ru)?\/(?:mail|inbox|list|bk|corp|v|vk|ok)\/[^"'\s<>\\]+?\/\d+\.html/g;
      var seen = {}, res = [], m;
      while ((m = re.exec(html)) !== null) {
        var u = m[0];
        if (u.indexOf('//') === 0) u = 'https:' + u;
        else if (u.indexOf('/') === 0) u = 'https://my.mail.ru' + u;
        if (!seen[u]) { seen[u] = 1; res.push(u); }
      }
      dbg('search links ' + res.length);
      return res.slice(0, 3);
    })
    .catch(function (e) { dbg('search error ' + e); return []; });
}

function extract(pageUrl) {
  return fetch(pageUrl, { headers: { 'User-Agent': UA } })
    .then(function (r) { return r.text(); })
    .then(function (html) {
      html = html.replace(/\\\//g, '/');
      var m = html.match(/"(?:metadataUrl|metaUrl)"\s*:\s*"([^"]+)"/);
      var metaUrl = m ? norm(m[1]) : null;
      if (!metaUrl) {
        var idm = pageUrl.match(/\/(\d+)\.html/);
        if (idm) metaUrl = 'https://my.mail.ru/+/video/meta/' + idm[1];
      }
      dbg('meta url ' + metaUrl);
      if (!metaUrl) return [];
      return fetch(metaUrl, { headers: { 'User-Agent': UA, 'Referer': pageUrl } })
        .then(function (r) {
          var sc = (r.headers && r.headers.get && r.headers.get('set-cookie')) || '';
          var k = sc.match(/video_key=[^;]+/);
          dbg('meta status ' + r.status + ' cookie ' + (k ? 'yes' : 'no'));
          return r.json().then(function (j) { return { j: j, cookie: k ? k[0] : '' }; });
        })
        .then(function (o) {
          var vids = (o.j && o.j.videos) || [];
          dbg('videos ' + vids.length);
          var title = (o.j && o.j.meta && o.j.meta.title) || 'Mail.ru';
          var headers = { 'User-Agent': UA, 'Referer': 'https://my.mail.ru/' };
          if (o.cookie) headers['Cookie'] = o.cookie;
          return vids.map(function (v) {
            return { name: 'Mail.ru', title: title + ' [' + v.key + ']', url: norm(v.url),
                     quality: v.key, headers: headers, provider: 'mailru' };
          });
        });
    })
    .catch(function (e) { dbg('extract error ' + e); return []; });
}

function debugStream() {
  return [{ name: 'Mail.ru DEBUG', title: DBG.join(' | ').slice(0, 300),
            url: 'https://example.com/debug.mp4', quality: 'debug', provider: 'mailru' }];
}

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  DBG = [];
  if (TMDB_KEY.indexOf('BURAYA') === 0) { dbg('TMDB_KEY girilmemis'); return Promise.resolve(DEBUG ? debugStream() : []); }
  return getTitles(tmdbId, mediaType).then(function (titles) {
    dbg('titles ' + titles.join(', '));
    if (!titles.length) return DEBUG ? debugStream() : [];
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
      if (!flat.length && DEBUG) return debugStream();
      return flat;
    });
  }).catch(function (e) { dbg('fatal ' + e); return DEBUG ? debugStream() : []; });
}

module.exports = { getStreams: getStreams };
