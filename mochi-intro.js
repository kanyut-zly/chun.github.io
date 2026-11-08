(function () { try {
/* 私人二改 · 每日想你卡
   参考 Milk「传讯」的今日公告卡，按 Mochi 的结构、存储和主题重写。
   开屏动画已按用户要求移除，只保留每天首次出现的每日卡。
   主色 #D1C2D3（淡牵牛紫）。不读取、不上传任何远程数据。 */
(function () {
'use strict';
if (window.__mochiIntroDailyLoaded) return;
window.__mochiIntroDailyLoaded = true;

var CFG_KEY = 'xy-home-v2:daily-mochi';
var SHOWN_KEY = 'xy-home-v2:daily-mochi-shown';
var DEFAULTS = {
  enabled: true,
  title: '今天也在想你',
  titleMode: 'random',   // random＝字卡随机拼（默认）；fixed＝用下面手写的标题
  titleSeed: 0,
  note: '今天也要好好吃饭，忙完记得来见我。',
  weather: true,
  color: '#D1C2D3',      // 淡牵牛紫
  bgImage: ''            // 顶部背景图（本地 dataURL）
};

function byId(id) { return document.getElementById(id); }
function pad(n) { return (n < 10 ? '0' : '') + n; }
function dayKey(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function readCfg() {
  var out = {};
  for (var k in DEFAULTS) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) out[k] = DEFAULTS[k];
  try {
    var raw = localStorage.getItem(CFG_KEY);
    var obj = raw ? JSON.parse(raw) : null;
    if (obj && typeof obj === 'object') {
      if (typeof obj.enabled === 'boolean') out.enabled = obj.enabled;
      if (typeof obj.weather === 'boolean') out.weather = obj.weather;
      if (typeof obj.title === 'string' && obj.title.trim()) out.title = obj.title.trim();
      if (typeof obj.note === 'string' && obj.note.trim()) out.note = obj.note;
      if (obj.titleMode === 'fixed' || obj.titleMode === 'random') out.titleMode = obj.titleMode;
      if (typeof obj.titleSeed === 'number' && isFinite(obj.titleSeed)) out.titleSeed = obj.titleSeed;
      if (typeof obj.color === 'string' && /^#[0-9a-f]{6}$/i.test(obj.color.trim())) out.color = obj.color.trim().toUpperCase();
      if (typeof obj.bgImage === 'string') out.bgImage = obj.bgImage;
    }
  } catch (e) {}
  return out;
}
function writeCfg(patch) {
  var cfg = readCfg();
  for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) cfg[k] = patch[k];
  try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); return cfg; } catch (e) { return null; }
}
function safeStoreGet(key) {
  try {
    if (window.activeStore) return window.activeStore().get(key) || '';
  } catch (e) {}
  return '';
}
function partnerName() {
  try {
    if (typeof window.chatPartnerName === 'function') {
      var n = window.chatPartnerName();
      if (n && n !== '默认' && n !== '联系人') return n;
    }
  } catch (e) {}
  try {
    if (typeof window.taWord === 'function') {
      var w = window.taWord();
      if (w) return w;
    }
  } catch (e) {}
  return safeStoreGet('cs-lbl-partner') || safeStoreGet('lbl-partner') || 'TA';
}
function myName() {
  return safeStoreGet('cs-lbl-me') || safeStoreGet('lbl-me') || '我';
}
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function hashStr(s) {
  var h = 5381;
  for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}
function pick(arr, seed) { return arr[seed % arr.length]; }

/* ---------- 颜色：把一枚主色拆成深浅四档 ---------- */
function clamp255(n) { return Math.max(0, Math.min(255, Math.round(n))); }
function hexToRgb(hex) {
  var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  var v = parseInt(m[1], 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}
function shadeHex(hex, f) {
  var c = hexToRgb(hex) || { r: 209, g: 194, b: 211 };
  var t = f < 0 ? 0 : 255;
  var a = Math.abs(f);
  return '#' + [c.r, c.g, c.b].map(function (v) {
    var n = clamp255(v + (t - v) * a).toString(16);
    return n.length < 2 ? '0' + n : n;
  }).join('');
}
function normHex(v) {
  var s = String(v || '').trim();
  if (s.charAt(0) !== '#') s = '#' + s;
  return /^#[0-9a-f]{6}$/i.test(s) ? s.toUpperCase() : '';
}
var COLOR_NAMES = {
  '#D1C2D3': '淡牵牛紫', '#A9C1D9': '雾蓝', '#E4B7C4': '藕粉',
  '#B7D1B3': '苔绿', '#E8C9A0': '暖杏', '#B8B4C8': '灰紫'
};
function colorLabel(hex) {
  var h = normHex(hex) || DEFAULTS.color;
  return COLOR_NAMES[h] || h;
}

/* ---------- 标题：字卡随机拼（按「联系人 + 日期」选一句，当天稳定） ---------- */
var TITLE_T = ['今天', '此刻', '这一秒', '现在', '今夜', '醒来的这一刻', '这一整天'];
var TITLE_PATTERNS = [
  '{t}也在想你',
  '{t}又想起你了',
  '{t}想和你说说话',
  '{t}也在等你出现',
  '{t}把想念藏不住了',
  '{t}想被你抱一下',
  '{t}的心事全是你',
  '把{t}的想念都留给你',
  '{t}的风替我去抱你',
  '有你的{t}才算完整',
  '{t}也想赖着你',
  '今天的第 N 次想你'
];
function dailyTitle(cfg) {
  if (cfg.titleMode === 'fixed') return (cfg.title || DEFAULTS.title);
  var seed = (Number(cfg.titleSeed) || 0) + hashStr('daily-title|' + (window.__activeCid || 'default') + '|' + dayKey());
  seed = seed >>> 0;
  var p = TITLE_PATTERNS[seed % TITLE_PATTERNS.length];
  var t = TITLE_T[Math.floor(seed / 7) % TITLE_T.length];
  var out = p.replace(/\{t\}/g, t);
  if (out.indexOf('第 N 次') >= 0) out = out.replace('N', String(1 + (seed % 4)));
  if (out.length > 18) out = out.slice(0, 18);
  return out;
}

/* ---------- 把外观（主色 / 顶部图片）套到卡片上 ---------- */
function applyLook(cfg) {
  cfg = cfg || readCfg();
  var ov = byId('mochi-daily');
  if (!ov) return;
  var color = normHex(cfg.color) || DEFAULTS.color;
  ov.style.setProperty('--mday-a', shadeHex(color, -0.42));
  ov.style.setProperty('--mday-b', shadeHex(color, -0.20));
  ov.style.setProperty('--mday-c', shadeHex(color, 0.12));
  ov.style.setProperty('--mday-d', color);
  ov.style.setProperty('--mday-card-1', shadeHex(color, 0.93));
  ov.style.setProperty('--mday-card-2', shadeHex(color, 0.86));
  ov.style.setProperty('--mday-card-3', shadeHex(color, 0.74));
  var img = String(cfg.bgImage || '');
  if (/^data:image\//i.test(img)) {
    ov.style.setProperty('--mday-hero-img', 'url("' + img + '")');
    ov.style.setProperty('--mday-hero-scrim', 'linear-gradient(180deg, rgba(26,16,32,.34) 0%, rgba(26,16,32,.16) 40%, rgba(26,16,32,.48) 100%)');
  } else {
    ov.style.removeProperty('--mday-hero-img');
    ov.style.removeProperty('--mday-hero-scrim');
  }
}

/* ============================================================
   每日想你卡
   ============================================================ */
var dailyOpen = false;
var dailyCloseTimer = null;
var dailyPrevOverflow = '';
var splashWatch = null;
var readyWatch = null;

var WEATHERS = {
  spring: [
    { e: '🌸', n: '晴', t: '18°', s: '花瓣落在窗边' },
    { e: '🌤️', n: '晴间多云', t: '20°', s: '风里有青草味' },
    { e: '🌦️', n: '阵雨', t: '15°', s: '雨后会放晴' },
    { e: '☁️', n: '多云', t: '17°', s: '云走得很慢' }
  ],
  summer: [
    { e: '☀️', n: '晴', t: '29°', s: '阳光很亮' },
    { e: '⛅', n: '多云', t: '27°', s: '适合吃冰' },
    { e: '🌦️', n: '雷阵雨', t: '24°', s: '记得带伞' },
    { e: '🌙', n: '晴夜', t: '23°', s: '晚风刚刚好' }
  ],
  autumn: [
    { e: '☀️', n: '晴', t: '21°', s: '落叶很轻' },
    { e: '🌤️', n: '晴间多云', t: '19°', s: '天很高' },
    { e: '🌧️', n: '小雨', t: '16°', s: '适合窝在一起' },
    { e: '☁️', n: '阴', t: '17°', s: '云层软软的' }
  ],
  winter: [
    { e: '☀️', n: '晴冷', t: '6°', s: '阳光没有温度' },
    { e: '☁️', n: '阴', t: '3°', s: '要穿暖一点' },
    { e: '🌨️', n: '小雪', t: '0°', s: '手要放进我口袋' },
    { e: '🌙', n: '晴夜', t: '-2°', s: '月色很清' }
  ]
};
var STATUS_BY_MOOD = {
  '😊': ['轻轻哼着歌', '心情很好，想和你分享'],
  '🥰': ['满脑子都是你', '想被你抱一下'],
  '😄': ['笑得很开心', '今天的快乐想分你一半'],
  '😌': ['安静地想你', '在等你出现'],
  '🤒': ['有点没精神', '想被你照顾'],
  '😔': ['情绪低低的', '需要你陪一会儿'],
  '😢': ['有点想哭', '想听你说没事'],
  '😡': ['有点烦躁', '先别惹我，抱一下就好'],
  '😴': ['困困的', '想靠着你睡一会儿']
};
var STATUS_FALLBACK = [
  ['安静地想你', '在等你出现'],
  ['偷偷开心', '因为今天也有你'],
  ['在忙一点点事', '忙完就来找你'],
  ['望着窗外发呆', '想和你虚度时间']
];
var YI_LIST = [
  ['说想你', '大声一点'],
  ['早点睡', '梦里见'],
  ['一起发呆', '什么都不做'],
  ['好好吃饭', '别让我担心'],
  ['拍一拍 TA', '现在就去'],
  ['分享一首歌', '歌词会替我说'],
  ['存一张合照', '以后慢慢看']
];

function partnerMoodStatus(ta) {
  if (ta && STATUS_BY_MOOD[ta.e]) return STATUS_BY_MOOD[ta.e];
  var seed = hashStr(dayKey() + '|status|' + partnerName());
  return pick(STATUS_FALLBACK, seed);
}
function weatherForToday() {
  var d = new Date();
  var m = d.getMonth() + 1;
  var season = (m >= 3 && m <= 5) ? 'spring' : (m >= 6 && m <= 8) ? 'summer' : (m >= 9 && m <= 11) ? 'autumn' : 'winter';
  var seed = hashStr(dayKey() + '|weather|' + (window.__activeCid || 'default'));
  return pick(WEATHERS[season], seed);
}
function dayOfYear() {
  var d = new Date();
  var start = new Date(d.getFullYear(), 0, 1);
  return Math.floor((d - start) / 86400000) + 1;
}
function greeting() {
  var h = new Date().getHours();
  if (h < 5) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 13) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}
function dateStamp() {
  var d = new Date();
  var wd = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  return d.getFullYear() + ' · ' + pad(d.getMonth() + 1) + ' · ' + pad(d.getDate()) + ' 周' + wd;
}
function fillDailyCard() {
  var cfg = readCfg();
  applyLook(cfg);
  var mood = null;
  try { if (typeof window.moodDiaryToday === 'function') mood = window.moodDiaryToday(); } catch (e) {}
  var ta = partnerName();

  var face = byId('mday-face');
  var hi = byId('mday-hi');
  var title = byId('mday-title');
  var subject = byId('mday-subject');
  var stamp = byId('mday-stamp');
  var meEmoji = byId('mday-me-emoji');
  var meName = byId('mday-me-name');
  var meNote = byId('mday-me-note');
  var taLabel = byId('mday-ta-label');
  var taEmoji = byId('mday-ta-emoji');
  var taName = byId('mday-ta-name');
  var taNote = byId('mday-ta-note');
  var wIco = byId('mday-weather-ico');
  var wVal = byId('mday-weather');
  var wSub = byId('mday-weather-s');
  var sIco = byId('mday-status-ico');
  var sVal = byId('mday-status');
  var sSub = byId('mday-status-s');
  var yIco = byId('mday-yi-ico');
  var yVal = byId('mday-yi');
  var ySub = byId('mday-yi-s');
  var noteEl = byId('mday-note');
  var grid = document.querySelector('#mochi-daily .mday-grid');

  var mine = (mood && mood.mine) || null;
  var tm = (mood && mood.ta) || null;

  if (hi) hi.textContent = greeting();
  if (title) title.textContent = dailyTitle(cfg);
  if (stamp) stamp.textContent = dateStamp();
  if (subject) subject.textContent = '写给你的第 ' + dayOfYear() + ' 张每日卡';
  if (face) face.textContent = tm && tm.e ? tm.e : '💜';

  if (meEmoji) meEmoji.textContent = mine && mine.e ? mine.e : '🫧';
  if (meName) meName.textContent = mine ? (mine.n || '有心情') : '还没记录';
  if (meNote) meNote.textContent = (mine && mine.note) ? mine.note : '今天的心情，等你来写。';

  if (taLabel) taLabel.textContent = ta + '的心情';
  if (tm) {
    if (taEmoji) taEmoji.textContent = tm.e || '🌙';
    if (taName) taName.textContent = tm.n || '有心情';
    var ago = mood && typeof mood.taSinceMin === 'number' ? mood.taSinceMin : null;
    var agoTxt = '';
    if (ago !== null && ago >= 0 && ago < 720) {
      agoTxt = ago < 2 ? '刚刚变的' : (ago < 60 ? (Math.round(ago) + ' 分钟前变的') : (Math.round(ago / 60) + ' 小时前变的'));
    }
    if (taNote) taNote.textContent = (tm.n ? ('今天的心情：' + tm.n + (agoTxt ? '（' + agoTxt + '）' : '')) : '今天也在想你。');
  } else {
    if (taEmoji) taEmoji.textContent = '🌙';
    if (taName) taName.textContent = '还在等你';
    if (taNote) taNote.textContent = (mood && mood.taUnknown) ? '今天还没有互动。' : '今天还没有心情记录。';
  }

  var w = weatherForToday();
  if (wIco) wIco.textContent = w.e;
  if (wVal) wVal.textContent = w.n + ' ' + w.t;
  if (wSub) wSub.textContent = w.s;

  var st = partnerMoodStatus(tm);
  if (sIco) sIco.textContent = tm && tm.e ? tm.e : '☕';
  if (sVal) sVal.textContent = st[0];
  if (sSub) sSub.textContent = st[1];

  var yi = pick(YI_LIST, hashStr(dayKey() + '|yi|' + ta));
  if (yIco) yIco.textContent = '✨';
  if (yVal) yVal.textContent = yi[0];
  if (ySub) ySub.textContent = yi[1];

  if (grid) grid.style.display = cfg.weather ? '' : 'none';

  var note = (cfg.note || DEFAULTS.note)
    .replace(/\{ta\}/g, ta)
    .replace(/\{me\}/g, myName())
    .replace(/\{date\}/g, dayKey());
  if (noteEl) noteEl.innerHTML = esc(note).replace(/\n/g, '<br>');
}

function shouldShowDaily(force) {
  if (force) return true;
  var cfg = readCfg();
  if (!cfg.enabled) return false;
  try { return localStorage.getItem(SHOWN_KEY) !== dayKey(); } catch (e) { return true; }
}
function markDailyShown() {
  try { localStorage.setItem(SHOWN_KEY, dayKey()); } catch (e) {}
}
function applockBusy() {
  try {
    var m = byId('applock-mask');
    if (!m) return false;
    var cs = getComputedStyle(m);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && !m.hidden && !m.classList.contains('hide');
  } catch (e) { return false; }
}
function showDaily(force, preview) {
  if (dailyOpen || !shouldShowDaily(force)) return;
  if (applockBusy()) return;
  var ov = byId('mochi-daily');
  if (!ov) return;
  if (dailyCloseTimer) { clearTimeout(dailyCloseTimer); dailyCloseTimer = null; }
  fillDailyCard();
  dailyOpen = true;
  // 设置里的「立即预览」不算今天已经看过，否则预览一次当天的自动卡就不弹了
  if (!preview) markDailyShown();
  ov.hidden = false;
  ov.classList.remove('mday-leaving');
  void ov.offsetWidth;
  requestAnimationFrame(function () { ov.classList.add('mday-open'); });
  try { dailyPrevOverflow = document.body.style.overflow || ''; document.body.style.overflow = 'hidden'; } catch (e) {}
  var closeBtn = byId('mday-close');
  if (closeBtn && !closeBtn.getAttribute('data-bound')) {
    closeBtn.setAttribute('data-bound', '1');
    closeBtn.addEventListener('click', function (e) { e.stopPropagation(); closeDaily(); });
  }
  var go = byId('mday-go');
  if (go && !go.getAttribute('data-bound')) {
    go.setAttribute('data-bound', '1');
    go.addEventListener('click', function (e) { e.stopPropagation(); closeDaily(); });
  }
  if (!ov.getAttribute('data-bound')) {
    ov.setAttribute('data-bound', '1');
    ov.addEventListener('click', function (e) { if (e.target === ov) closeDaily(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && dailyOpen) closeDaily(); });
  }
  setTimeout(function () { if (dailyOpen) ov.classList.add('mday-visible'); }, 20);
}
function closeDaily() {
  if (!dailyOpen) return;
  dailyOpen = false;
  var ov = byId('mochi-daily');
  if (!ov) return;
  ov.classList.remove('mday-open');
  ov.classList.add('mday-leaving');
  if (dailyCloseTimer) clearTimeout(dailyCloseTimer);
  dailyCloseTimer = setTimeout(function () {
    dailyCloseTimer = null;
    ov.hidden = true;
    ov.classList.remove('mday-leaving', 'mday-visible');
    try { document.body.style.overflow = dailyPrevOverflow || ''; } catch (e) {}
  }, 330);
}
window.mochiShowDaily = function () { showDaily(true); };

/* 开屏公告关闭 / 数据就绪后再弹，避免盖住声明页 */
function whenSplashGone(cb) {
  var splash = byId('splash');
  var skip = document.documentElement && document.documentElement.classList.contains('mochi-splash-skip');
  if (!splash || splash.classList.contains('hide') || skip) { cb(); return; }
  var done = false;
  var finish = function () {
    if (done) return;
    done = true;
    if (splashWatch) { clearInterval(splashWatch); splashWatch = null; }
    document.removeEventListener('mochi-splash-hide', finish);
    cb();
  };
  document.addEventListener('mochi-splash-hide', finish);
  splashWatch = setInterval(function () {
    if (!document.getElementById('splash')) finish();
  }, 300);
  setTimeout(finish, 20000);
}
function whenDataReady(cb) {
  if (window.__mochiDataReady) { cb(); return; }
  var done = false;
  var finish = function () {
    if (done) return;
    done = true;
    if (readyWatch) { clearTimeout(readyWatch); readyWatch = null; }
    cb();
  };
  document.addEventListener('mochi-restore-done', finish, { once: true });
  readyWatch = setTimeout(finish, 9000);
}
function tryShowDaily() {
  if (window.__mochiDailyQueued) return;
  window.__mochiDailyQueued = true;
  whenSplashGone(function () {
    setTimeout(function () {
      whenDataReady(function () {
        setTimeout(function () {
          if (!applockBusy()) showDaily(false);
        }, 420);
      });
    }, 550);
  });
}

/* ============================================================
   设置面板与开关
   ============================================================ */
var panelDraft = null;
function syncSwatches(hex) {
  var h = normHex(hex) || DEFAULTS.color;
  var box = byId('mday-cfg-swatches');
  if (!box) return;
  Array.prototype.forEach.call(box.querySelectorAll('.mday-swatch'), function (b) {
    b.classList.toggle('sel', normHex(b.getAttribute('data-color')) === h);
  });
}
function syncImgPreview(src) {
  var wrap = byId('mday-cfg-img-preview');
  var img = byId('mday-cfg-img-thumb');
  var has = /^data:image\//i.test(String(src || ''));
  if (wrap) wrap.hidden = !has;
  if (img) img.src = has ? src : '';
}
function refreshTitlePreview() {
  if (!panelDraft) return;
  var t = byId('mday-cfg-title-input');
  var tr = byId('mday-cfg-title-random');
  var random = !!(tr && tr.checked);
  panelDraft.titleMode = random ? 'random' : 'fixed';
  if (!t) return;
  t.readOnly = random;
  t.classList.toggle('mday-readonly', random);
  if (random) {
    t.value = dailyTitle({ titleMode: 'random', titleSeed: panelDraft.titleSeed, title: panelDraft.title });
  } else {
    t.value = panelDraft.title || DEFAULTS.title;
  }
}
function openCfg() {
  var cfg = readCfg();
  panelDraft = {
    title: cfg.title,
    titleMode: cfg.titleMode,
    titleSeed: Number(cfg.titleSeed) || 0,
    note: cfg.note,
    weather: cfg.weather,
    color: normHex(cfg.color) || DEFAULTS.color,
    bgImage: /^data:image\//i.test(String(cfg.bgImage || '')) ? cfg.bgImage : ''
  };
  var box = byId('mochi-daily-cfg');
  if (!box) return;
  var tr = byId('mday-cfg-title-random');
  if (tr) tr.checked = panelDraft.titleMode !== 'fixed';
  var n = byId('mday-cfg-note-input');
  if (n) n.value = panelDraft.note;
  var w = byId('mday-cfg-weather');
  if (w) w.checked = !!panelDraft.weather;
  var col = byId('mday-cfg-color');
  if (col) col.value = panelDraft.color.toLowerCase();
  var hx = byId('mday-cfg-color-hex');
  if (hx) hx.value = panelDraft.color;
  syncSwatches(panelDraft.color);
  syncImgPreview(panelDraft.bgImage);
  refreshTitlePreview();
  box.hidden = false;
}
function closeCfg() {
  var box = byId('mochi-daily-cfg');
  if (box) box.hidden = true;
  panelDraft = null;
}
function compressDailyImage(file, cb) {
  var reader = new FileReader();
  reader.onerror = function () { cb(''); };
  reader.onload = function () {
    var img = new Image();
    img.onerror = function () { cb(''); };
    img.onload = function () {
      try {
        var maxSide = 1100;
        var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        var w = Math.max(1, Math.round(img.width * scale));
        var h = Math.max(1, Math.round(img.height * scale));
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        var out = c.toDataURL('image/jpeg', 0.82);
        if (out.length > 1400000) out = c.toDataURL('image/jpeg', 0.62);
        cb(out && out.indexOf('data:image/') === 0 ? out : '');
      } catch (e) { cb(''); }
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}
function saveCfgFromPanel() {
  var n = byId('mday-cfg-note-input');
  var w = byId('mday-cfg-weather');
  var tr = byId('mday-cfg-title-random');
  var t = byId('mday-cfg-title-input');
  var random = !!(tr && tr.checked);
  if (!panelDraft) panelDraft = { title: DEFAULTS.title, titleSeed: 0, color: DEFAULTS.color, bgImage: '' };
  var patch = {
    titleMode: random ? 'random' : 'fixed',
    titleSeed: Number(panelDraft.titleSeed) || 0,
    note: (n && n.value.trim()) || DEFAULTS.note,
    weather: !!(w && w.checked),
    color: normHex(panelDraft.color) || DEFAULTS.color,
    bgImage: panelDraft.bgImage || ''
  };
  if (!random && t && t.value.trim()) patch.title = t.value.trim();
  var saved = writeCfg(patch);
  if (!saved && patch.bgImage) {
    patch.bgImage = '';
    saved = writeCfg(patch);
    try { if (window.toast) window.toast('这张图太大，本机存不下，已只保存颜色和其他设置'); } catch (e) {}
  }
  var cfg = readCfg();
  applyLook(cfg);
  syncSettings();
  closeCfg();
}
function syncSettings() {
  var cfg = readCfg();
  var en = byId('daily-mochi-en');
  var sub = byId('daily-mochi-sub');
  if (en) en.checked = !!cfg.enabled;
  if (sub) sub.textContent = cfg.enabled
    ? '每天第一次打开时，给你一张心情 · 天气 · 留言卡'
    : '已关闭，不会在打开时自动出现（仍可在这里预览）';
  var en2 = byId('desk-daily-en');
  if (en2) en2.checked = !!cfg.enabled;
  var val = byId('desk-daily-mood-val');
  if (val) val.textContent = colorLabel(cfg.color) + (cfg.bgImage ? ' · 有图' : '');
}
function bindSettings() {
  syncSettings();
  var en = byId('daily-mochi-en');
  if (en) en.addEventListener('change', function () {
    writeCfg({ enabled: !!en.checked });
    syncSettings();
  });
  var en2 = byId('desk-daily-en');
  if (en2) en2.addEventListener('change', function () {
    writeCfg({ enabled: !!en2.checked });
    syncSettings();
  });
  var edit = byId('row-daily-mochi-edit');
  if (edit) edit.addEventListener('click', openCfg);
  var edit2 = byId('row-desk-daily-mood');
  if (edit2) edit2.addEventListener('click', openCfg);
  var close = byId('mday-cfg-cancel');
  if (close) close.addEventListener('click', closeCfg);
  var save = byId('mday-cfg-save');
  if (save) save.addEventListener('click', saveCfgFromPanel);
  var prev = byId('mday-cfg-preview');
  if (prev) prev.addEventListener('click', function () {
    saveCfgFromPanel();
    setTimeout(function () { showDaily(true, true); }, 30);
  });
  var tr = byId('mday-cfg-title-random');
  if (tr) tr.addEventListener('change', refreshTitlePreview);
  var reroll = byId('mday-cfg-title-reroll');
  if (reroll) reroll.addEventListener('click', function () {
    if (!panelDraft) return;
    panelDraft.titleSeed = Math.floor(Math.random() * 999999) + 1;
    refreshTitlePreview();
    try { if (window.toast) window.toast('换了一张标题'); } catch (e) {}
  });
  var sw = byId('mday-cfg-swatches');
  if (sw) sw.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('.mday-swatch') : null;
    if (!b || !panelDraft) return;
    var hex = normHex(b.getAttribute('data-color'));
    if (!hex) return;
    panelDraft.color = hex;
    var col = byId('mday-cfg-color'); if (col) col.value = hex.toLowerCase();
    var hx = byId('mday-cfg-color-hex'); if (hx) hx.value = hex;
    syncSwatches(hex);
  });
  var col = byId('mday-cfg-color');
  if (col) col.addEventListener('input', function () {
    if (!panelDraft) return;
    panelDraft.color = normHex(col.value) || panelDraft.color;
    var hx = byId('mday-cfg-color-hex'); if (hx) hx.value = panelDraft.color;
    syncSwatches(panelDraft.color);
  });
  var hx = byId('mday-cfg-color-hex');
  if (hx) {
    hx.addEventListener('input', function () {
      if (!panelDraft) return;
      var v = normHex(hx.value);
      if (!v) return;
      panelDraft.color = v;
      var c2 = byId('mday-cfg-color'); if (c2) c2.value = v.toLowerCase();
      syncSwatches(v);
    });
    hx.addEventListener('blur', function () {
      if (!panelDraft) return;
      hx.value = panelDraft.color;
    });
  }
  var fileInput = byId('mday-cfg-img-file');
  var pickBtn = byId('mday-cfg-img-pick');
  if (pickBtn && fileInput) pickBtn.addEventListener('click', function () {
    fileInput.value = '';
    try { fileInput.click(); } catch (e) {}
  });
  if (fileInput) fileInput.addEventListener('change', function () {
    var f = fileInput.files && fileInput.files[0];
    if (!f) return;
    try { if (window.toast) window.toast('正在处理图片…'); } catch (e) {}
    compressDailyImage(f, function (data) {
      if (!data) { try { if (window.toast) window.toast('这张图片读不出来，换一张试试'); } catch (e) {} return; }
      if (panelDraft) panelDraft.bgImage = data;
      syncImgPreview(data);
    });
  });
  var clearBtn = byId('mday-cfg-img-clear');
  if (clearBtn) clearBtn.addEventListener('click', function () {
    if (panelDraft) panelDraft.bgImage = '';
    syncImgPreview('');
  });
  var box = byId('mochi-daily-cfg');
  if (box) box.addEventListener('click', function (e) { if (e.target === box) closeCfg(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && box && !box.hidden) closeCfg();
  });
}

/* ============================================================
   启动
   ============================================================ */
function boot() {
  bindSettings();
  try { applyLook(readCfg()); } catch (e) {}
  tryShowDaily();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

/* 数据没赶上首屏就绪时，由 clock.js 的自动进入再兜一次 */
document.addEventListener('mochi-contact-entry', function () { tryShowDaily(); });

/* TA 的心情在后台自己变了：卡片开着就顺手刷新（关闭状态不用管，下次打开自然是最新） */
document.addEventListener('ta-mood-changed', function () {
  if (dailyOpen) { try { fillDailyCard(); } catch (e) {} }
});

})();
if (window.__mochiLoaded) window.__mochiLoaded.push("mochi-intro.js");
} catch (__e) {
  if (window.__mochiErrLoaded) window.__mochiErrLoaded.push("mochi-intro.js");
  try { console.error("[JS] mochi-intro.js", __e && __e.message || __e); } catch (x) {}
  if (window.__jsErrors) window.__jsErrors.push("[mochi-intro.js] " + String(__e && __e.message || __e));
} })();
