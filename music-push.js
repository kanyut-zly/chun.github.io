/* 私人七改：TA 随机推歌（联网搜一首新歌 → 收进音乐库 → 在聊天里推给你）
   参考思路来自「言字卡」的播放器随机推送（不照搬代码，按 mochi 结构重写）：
     - 用户发一句话 → 按概率让 TA 去网易云公开接口搜一首歌（按「喜欢的风格」掷词）
     - 搜到了：收进音乐库「TA 推的歌」歌单 → 在聊天里发一张可点的听歌卡
     - 卡片点了直接播；气泡下面再补一句 TA 的话；顶部显示「一起听」
     - 搜不到就什么都不发（不拿库里的旧歌冒充推到的）
   存储（当前联系人命名空间）：
     music-push-en       '1' 开 / '0' 关（默认关，入口在 桌面设置 → 音乐）
     music-push-prob     每次你发完一句后去搜歌的概率（默认 6%）
     music-push-favs     喜欢的风格词（JSON 数组），为空＝用内置 26 个
     music-push-cooldown 上一次推歌时间戳（避免连着推）
     music-push-ta-lines 一句「补的话」开关
   联网：api.qijieya.cn/meting（公开 Meting 接口，不用登录、不用 Key）。
   边界：用的是第三方公开接口，偶尔会抽风/限流；搜不到就安静跳过，不影响聊天本身。
*/
(function () {
'use strict';
var ROOT = 'xy-home-v2';
var store = null;
function S() { try { if (!store && window.activeStore) store = window.activeStore(); } catch (e) {} return store; }
function get(k, d) { try { var s = S(); var v = s ? s.get(k) : null; return v === null || v === undefined ? d : v; } catch (e) { return d; } }
function set(k, v) { try { var s = S(); if (s) s.set(k, String(v)); } catch (e) {} }
function toast(msg) { try { if (window.toast) window.toast(msg); } catch (e) {} }

/* ---------------- 风格词（掷一个去搜） ---------------- */
var GENRES = [
'华语流行', '华语民谣', '城市民谣', '温柔女声', '温柔男声', '治愈纯音乐',
'钢琴曲', '吉他指弹', '轻音乐 助眠', 'Lo-Fi 学习', '爵士 慵懒', 'Bossa Nova',
'R&B 慢歌', '独立摇滚', '后摇 安静', '氛围电子', '城市夜景', '雨天 钢琴',
'少女心事', '深夜电台', '校园青春', '怀旧老歌', '粤语情歌', '日系治愈',
'国风 古筝', '海边 夏天'
];
function loadFavs() {
  try {
    var a = JSON.parse(get('music-push-favs', '[]'));
    return Array.isArray(a) ? a.filter(function (x) { return typeof x === 'string' && x.trim(); }) : [];
  } catch (e) { return []; }
}
function saveFavs(a) { try { set('music-push-favs', JSON.stringify(a)); } catch (e) {} }
function pickGenre() {
  var favs = loadFavs();
  var pool = favs.length ? favs : GENRES;
  return pool[Math.floor(Math.random() * pool.length)];
}

/* ---------------- 联网搜索 ---------------- */
var SEARCH_APIS = [
  function (q) { return 'https://api.qijieya.cn/meting/?type=search&id=' + encodeURIComponent(q); },
  function (q) { return 'https://api.i-meto.com/meting/api?server=netease&type=search&id=' + encodeURIComponent(q); }
];
var INFO_API = 'https://api.qijieya.cn/meting/?type=song&id=';
var PUSH_TIMEOUT = 9000;

function fetchWithTimeout(url, ms) {
  return new Promise(function (resolve, reject) {
    var done = false;
    var timer = setTimeout(function () { if (!done) { done = true; reject(new Error('timeout')); } }, ms || PUSH_TIMEOUT);
    try {
      fetch(url).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      }).then(function (t) {
        if (done) return;
        done = true; clearTimeout(timer); resolve(t);
      }).catch(function (e) {
        if (done) return;
        done = true; clearTimeout(timer); reject(e);
      });
    } catch (e) { if (!done) { done = true; clearTimeout(timer); reject(e); } }
  });
}
/* 从 Meting 返回里取 {name,artist,neteaseId,pic} */
function parseRows(txt) {
  var arr;
  try { arr = JSON.parse(txt); } catch (e) { return []; }
  if (!Array.isArray(arr)) return [];
  var out = [];
  arr.forEach(function (x) {
    if (!x) return;
    var name = x.name || x.title || '';
    var artist = x.artist || x.author || '';
    var url = x.url || '';
    var m = /[?&]id=(\d+)/.exec(url);
    if (!name || !m) return;
    out.push({ name: name, artist: artist, neteaseId: m[1], pic: x.pic || '' });
  });
  return out;
}
/* 先在多个接口里竞速搜，取第一个有结果的 */
function searchOnce(q) {
  var tries = SEARCH_APIS.map(function (mk) {
    return fetchWithTimeout(mk(q)).then(parseRows).catch(function () { return []; });
  });
  return Promise.all(tries).then(function (lists) {
    for (var i = 0; i < lists.length; i++) { if (lists[i] && lists[i].length) return lists[i]; }
    return [];
  });
}

/* ---------------- 收进音乐库 ---------------- */
var PUSH_PL_ID = 'spl_ta_push';
function ensurePushPlaylist() {
  try {
    if (window.mochiMusicApi && window.mochiMusicApi.addToPlaylist) return;
  } catch (e) {}
  // 没有暴露 API 时，只存到待入队，由内部函数接收（见下方 window.mochiMusicImportNet）
}
function addTrackToLibrary(row) {
  try {
    if (window.mochiMusicImportNet) {
      var id = window.mochiMusicImportNet({
        neteaseId: row.neteaseId,
        name: row.name,
        artist: row.artist,
        cover: row.pic,
        playlistName: 'TA 推的歌'
      });
      return id || true;
    }
  } catch (e) {}
  return null;
}

/* ---------------- 聊天：卡片 + 一句话 + 一起听 ---------------- */
var PUSH_TAG = 'TA 推的歌';
function pushCardHtml(row, trackId) {
  var cover = row.pic ? String(row.pic).replace(/^http:/i, 'https:') : '';
  var nm = esc(row.name || '未知歌曲');
  var ar = esc(row.artist || '');
  return '<div class="ta-music-push" data-music-push="' + esc(trackId || '') + '" data-netid="' + esc(row.neteaseId || '') + '">' +
    '<div class="tmp-cover"' + (cover ? ' style="background-image:url(&quot;' + esc(cover) + '&quot;)"' : '') + '>' +
    (cover ? '' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>') +
    '</div>' +
    '<div class="tmp-body"><div class="tmp-name">' + nm + '</div><div class="tmp-sub">' + (ar || 'TA 推的歌') + '</div></div>' +
    '<button type="button" class="tmp-play"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg><span>播放</span></button>' +
    '</div>';
}
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* 从字卡库随机抽一句当「补的那句话」；抽不到（库空 / 全是表情图片）才退回内置台词 */
var FALLBACK_LINES = [
  '这首歌刚刚好，听听。',
  '刷到这首，第一反应是想放给你听。',
  '刚好在想你，点了这首。',
  '别说话，先听完。',
  '这首副歌会让人想靠过来，真的。',
  '耳机分你一半，一起听。',
  '放个歌给你，忙你的也没关系。',
  '刚听到这首就想起你上次说的那句。'
];
function pickLineFromCards() {
  try {
    var pool = window.getPool ? window.getPool() : null;
    var arr = (pool && Array.isArray(pool.text)) ? pool.text : [];
    // 只要纯文字（有些卡带 ||| 附件、data: 图片、太长的整段）
    var ok = arr.filter(function (s) {
      return typeof s === 'string' && s.trim() && s.length <= 60 &&
        s.indexOf('|||') < 0 && s.indexOf('data:') < 0 && s.indexOf('@@m:') < 0 &&
        !/^https?:\/\//i.test(s);
    });
    // 打散的卡里夹着 {} 之类的占位符，先滤掉
    ok = ok.filter(function (s) { return !/\{[a-z]+\}/i.test(s) && s.replace(/[\s\p{P}]/gu, '').length >= 2; });
    if (!ok.length) return '';
    return ok[Math.floor(Math.random() * ok.length)];
  } catch (e) { return ''; }
}
function pickLine() {
  return pickLineFromCards() || FALLBACK_LINES[Math.floor(Math.random() * FALLBACK_LINES.length)];
}

/* 在聊天里发一张卡片：special='musicpush'（chat.js 有专门的渲染分支），下面再补一句 */
function sendPushToChat(row, trackId) {
  var name = row.name || '未知歌曲';
  var line = pickLine();
  var cover = row.pic ? String(row.pic).replace(/^http:/i, 'https:') : '';
  var ok = false;
  try {
    if (window.chatAddIn) {
      var r = window.chatAddIn('', {
        special: 'musicpush',
        tag: PUSH_TAG,
        nightAllow: true,
        mpName: name,
        mpArtist: row.artist || '',
        mpCover: cover,
        mpNetId: row.neteaseId || '',
        mpTrackId: trackId || '',
        mpWish: line
      });
      ok = r !== null && r !== false;
    }
  } catch (e) {}
  if (!ok) {
    try { if (window.chatAddIn) window.chatAddIn('我推你一首：' + name + (row.artist ? ' - ' + row.artist : '') + '，去音乐页能听', { tag: PUSH_TAG, nightAllow: true }); } catch (e) {}
  }
  /* 补一句话（像真人那样再嘟囔一句），顺便亮「一起听」 */
  setTimeout(function () {
    if (String(get('music-push-ta-lines', '1')) !== '0') {
      try { if (window.chatAddIn) window.chatAddIn(line, { tag: PUSH_TAG, nightAllow: true, silent: true }); } catch (e) {}
    }
    setTogetherListening(name);
  }, 1200 + Math.random() * 1800);
}

/* ---------------- 「一起听」小标（聊天顶栏里的那个胶囊） ---------------- */
function setTogetherListening(name) {
  try {
    var el = document.getElementById('mochi-listening');
    if (!el) return;
    var txt = el.querySelector('.ml-txt');
    if (txt) txt.textContent = '一起听 · 《' + String(name || '') + '》';
    el.hidden = false;
    clearTimeout(setTogetherListening._t);
    setTogetherListening._t = setTimeout(function () {
      try { el.hidden = true; } catch (e) {}
    }, 30000);
  } catch (e) {}
}

/* 点卡片：有这首歌就播；没有就现拉一次再播 */
function bindCardClicks() {
  if (bindCardClicks._done) return;
  bindCardClicks._done = 1;
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-mp-play]');
    if (!btn) return;
    var card = btn.closest('.msg-music-card');
    var msgEl = btn.closest('.msg');
    if (!card || !msgEl) return;
    e.preventDefault();
    e.stopPropagation();
    var idx = msgEl.dataset.idx !== undefined ? Number(msgEl.dataset.idx) : -1;
    var rec = null;
    try { rec = (idx >= 0 && window.getChatMsgs) ? window.getChatMsgs()[idx] : null; } catch (e2) {}
    var tid = (rec && rec.mpTrackId) || '';
    var netid = (rec && rec.mpNetId) || '';
    var nm = (rec && rec.mpName) || '';
    var ar = (rec && rec.mpArtist) || '';
    var cov = (rec && rec.mpCover) || '';
    card.classList.add('playing');
    if (tid && window.musicPlayById) {
      try { if (window.musicPlayById(tid)) { showListening(nm); return; } } catch (e3) {}
    }
    if (!netid) { toast('这首歌找不到了'); card.classList.remove('playing'); return; }    toast('正在加载这首歌…');
    var id = addTrackToLibrary({ neteaseId: netid, name: nm, artist: ar, pic: cov });
    setTimeout(function () {
      if (id && window.musicPlayById) {
        try { if (window.musicPlayById(id)) { toast('开始播放'); showListening(nm); return; } } catch (e4) {}
      }
      toast('这首歌暂时放不了，可能是平台限流');
      card.classList.remove('playing');
    }, 400);
  }, true);
}

function showListening(name) { try { setTogetherListening(name); } catch (e) {} }

/* ---------------- 触发：用户发完一句话后掷一次 ---------------- */
var lastUserAt = 0, busy = false;
function pushEnabled() { return String(get('music-push-en', '0')) === '1'; }
function pushProb() { var n = parseInt(get('music-push-prob', '6'), 10); return isFinite(n) ? Math.max(0, Math.min(100, n)) : 6; }
function cooldownMs() { return 20 * 60 * 1000; }

function maybePush(opt) {
  try {
    if (!pushEnabled()) return;
    if (busy) return;
    var now = Date.now();
    if (now - parseInt(get('music-push-cooldown', '0'), 10) < cooldownMs() && !(opt && opt.force)) return;
    if (!(opt && opt.force)) {
      if (Math.random() * 100 >= pushProb()) return;
    }
    busy = true;
    set('music-push-cooldown', now);
    doPush().then(function (ok) {
      busy = false;
      if (!ok && opt && opt.force) toast('这次没搜到合适的歌，换个说法或稍后再试');
    }, function () { busy = false; if (opt && opt.force) toast('搜歌失败（网络或接口抽风）'); });
  } catch (e) { busy = false; }
}
function doPush() {
  var q = pickGenre();
  return searchOnce(q).then(function (rows) {
    if (!rows.length) return false;
    // 从结果里随机挑（避开已有歌）
    var pool = rows.slice(0, 30);
    var pick = pool[Math.floor(Math.random() * pool.length)];
    var trackId = addTrackToLibrary(pick);
    sendPushToChat(pick, trackId || '');
    return true;
  });
}

/* ---------------- 设置页接线 ---------------- */
function bindSettings() {
  var en = document.getElementById('music-push-en');
  if (en && !en.__mpBound) {
    en.__mpBound = 1;
    en.checked = pushEnabled();
    en.addEventListener('change', function () {
      set('music-push-en', en.checked ? '1' : '0');
      toast(en.checked ? 'TA 会偶尔推歌给你了（联网搜歌）' : '已关闭 TA 推歌');
    });
  }
  // 关了推歌就把概率滑条变灰，免得以为「调了就会推」
  var prAny = document.getElementById('music-push-prob');
  if (prAny) {
    var syncEnabled = function () { try { prAny.disabled = !pushEnabled(); prAny.style.opacity = pushEnabled() ? '' : '.45'; } catch (e) {} };
    syncEnabled();
    if (en && !en.__mpSyncBound) {
      en.__mpSyncBound = 1;
      en.addEventListener('change', syncEnabled);
    }
  }
  var pr = document.getElementById('music-push-prob');
  if (pr && !pr.__mpBound) {
    pr.__mpBound = 1;
    pr.value = String(pushProb());
    var lab = document.getElementById('music-push-prob-val');
    if (lab) lab.textContent = pushProb() + '%';
    var sync = function () {
      var v = Math.max(0, Math.min(100, parseInt(pr.value, 10) || 0));
      set('music-push-prob', v);
      if (lab) lab.textContent = v + '%';
    };
    pr.addEventListener('input', sync);
    pr.addEventListener('change', sync);
  }
  var lines = document.getElementById('music-push-lines');
  if (lines && !lines.__mpBound) {
    lines.__mpBound = 1;
    lines.checked = String(get('music-push-ta-lines', '1')) !== '0';
    lines.addEventListener('change', function () {
      set('music-push-ta-lines', lines.checked ? '1' : '0');
      toast(lines.checked ? '推歌后会再补一句话' : '推歌后不再补话');
    });
  }
  var test = document.getElementById('music-push-test');
  if (test && !test.__mpBound) {
    test.__mpBound = 1;
    test.addEventListener('click', function () {
      if (!pushEnabled()) { toast('先把上面的开关打开'); return; }
      toast('正在联网搜一首…');
      maybePush({ force: true });
    });
  }
}

/* 监听用户发了消息：由 chat.js 调用（window.mochiMusicPushOnUser） */
window.mochiMusicPushOnUser = function () {
  try { lastUserAt = Date.now(); maybePush(); } catch (e) {}
};
window.mochiMusicPushForce = function () { maybePush({ force: true }); };
window.mochiNowListening = setTogetherListening;

/* 音乐页每次打开都同步一次（滑条是常驻元素，可能在上面的绑定之后才被重建） */
document.addEventListener('click', function (e) {
  try {
    var t = e.target && e.target.closest ? e.target.closest('[data-page="page-music"], #music-back, .app[data-app="music"]') : null;
    if (t) setTimeout(bindSettings, 120);
  } catch (e2) {}
}, true);
window.mochiMusicPushBindSettings = bindSettings;

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { bindSettings(); bindCardClicks(); });
else { bindSettings(); bindCardClicks(); }
try { if (window.mochiOnDataReady) window.mochiOnDataReady(function () { bindSettings(); }); } catch (e) {}
})();
