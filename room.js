(function () { try {
(function () {
/* 私人四改：多房间 —— room-list 存房间 id 列表，每间房自己的数据在 room-data-<id> */
const LIST_KEY = 'room-list';
const KEY = 'room-data'; /* 旧版单房间键，仅用于迁移 */
const page = document.getElementById('page-room');
if (!page) return;
const COLS = 6, ROWS = 4;
function S() { try { return window.activeStore(); } catch (e) { return null; } }
function pn() {
try { const s = S(); return (s && (s.get('lbl-partner') || s.get('cs-lbl-partner'))) || 'TA'; } catch (e) { return 'TA'; }
}
function rnd(a) { return a[Math.floor(Math.random() * a.length)]; }
function ri(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function vib(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }
function todayKey() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
function lum() {
let v = 1;
d.fx.forEach(it => { if (d.lit[it.i]) v += 0.12; });
return Math.min(1.3, v);
}
let toastT = null;
function toast(t) {
let el = document.getElementById('cc-toast');
if (!el) { el = document.createElement('div'); el.id = 'cc-toast'; document.body.appendChild(el); }
el.textContent = t; el.className = 'cc-toast'; void el.offsetWidth; el.className = 'cc-toast show';
clearTimeout(toastT); toastT = setTimeout(() => { el.className = 'cc-toast'; }, 2000);
}
const FB = {
enter: ['你来了。', '欢迎回来。', '……（好像有谁轻轻应了一声）', '回来啦。'],
greet: ['嗯。', '来了。', '……嗯。（TA回应了一声）', '在呢。', '今天也一起待着吧。'],
near: ['过来了？', '再近一点也可以。', '（TA没有躲开）', '嗯，这边。'],
beside: ['坐吧。', '这里留给你了。', '（往旁边挪了一点）', '肩并肩坐着，不说话也很好。'],
look: ['看什么？', '……被你看到了。', '（TA没有回头）', '我在看你。一直都在。'],
occupied: ['这里有人了。', '……被占用了。', '等一下，马上好。', '这个位置，是留给你的。'],
comeover: ['过来。', '一起吗？', '你也来。', '（TA轻轻拍了拍旁边）'],
furnuse: ['这个？偶尔用用。', '……还不错吧。', '（房间里多了一点声音）', '家正在一点点变成样子。'],
windowl: ['外面没什么。', '天色还行。', '……在看云。', '下次一起出去走走吧。'],
night: ['夜深了。', '还不睡吗？', '灯留着也行。', '晚安之前，再多待一会儿。'],
lamp: ['灯亮了。', '……是暖的。', '把灯留着吧。', '你一来，灯就亮了。'],
water: ['它今天精神不错。', '刚浇过水了。', '……谢谢。'],
wish: ['许完了。', '……愿望不能告诉你。', '（星光闪了一下，像是回应）'],
music: ['这首？可以。', '声音调小了一点。', '（跟着节奏轻轻晃）'],
tea: ['给你倒了一杯。', '小心烫。', '……趁热喝。'],
senseNear: [pn() + ' 在。', '就在这附近。', '很近。近得能听见呼吸。', '「TA似乎在这里。」'],
senseFar: ['好像有一点熟悉的感觉。', '说不上来。……但在。', '很远。但没有离开。'],
senseNone: ['没有人。', '感觉不到。', '……很安静。']
};
const GRP = {
enter: '进门', greet: '打招呼', near: '靠近', beside: '坐到旁边', look: '看TA',
occupied: 'TA的反应', comeover: 'TA的反应', lamp: '家具互动', furnuse: '家具互动',
windowl: '窗边', night: '夜晚', water: '浇水', wish: '许愿', music: '音乐', tea: '热茶',
senseNear: '方位感知', senseFar: '方位感知', senseNone: '方位感知'
};
function sayLine(group, fallbackKey, noFit) {
try { if (window.dcfGet && !(Math.random() * 100 < window.dcfGet('room'))) return ''; } catch (e) {}
let arr = null;
try { arr = window.getLibPool ? window.getLibPool('room', GRP[group] || group, FB[fallbackKey] || []) : null; } catch (e) {}
if (!arr || !arr.length) arr = (window.gateCardFallback ? window.gateCardFallback('room', FB[fallbackKey] || []) : (FB[fallbackKey] || []));
try { if (window.isDefaultCardOff) arr = arr.filter(c => !window.isDefaultCardOff('room', c)); } catch (e) {}
if (!arr.length) return '';
let t = String(rnd(arr)).replace(/\{n\}/g, pn());
if (!noFit) { try { if (window.taFit) t = window.taFit(t); } catch (e) {} }
return t;
}
const CAT = {
bed:        { n: '木质小床', e: '🛏️', cf: 4, lv: 1, cost: 40, act: '躺一下', grp: 'beside' },
sofa:       { n: '布艺沙发', e: '🛋️', cf: 3, lv: 1, cost: 36, act: '坐下',   grp: 'beside' },
chair:      { n: '木椅',     e: '🪑', cf: 1, lv: 1, cost: 12, act: '坐下',   grp: 'beside' },
rug:        { n: '圆地毯',   e: '🟫', cf: 1, lv: 2, cost: 15, act: '坐一会', grp: 'beside' },
shelf:      { n: '书架',     e: '📚', cf: 2, lv: 1, cost: 30, act: '抽本书', grp: 'furnuse' },
cabinet:    { n: '小柜子',   e: '🗄️', cf: 1, lv: 2, cost: 20, act: '整理',   grp: 'furnuse' },
desklamp:   { n: '台灯',     e: '💡', cf: 1, lv: 1, cost: 18, act: '开灯',   grp: 'furnuse', lamp: true },
clock:      { n: '老座钟',   e: '⏰', cf: 1, lv: 2, cost: 22, act: '听一听', grp: 'furnuse' },
plant:      { n: '小绿植',   e: '🌱', cf: 1, lv: 1, cost: 10, act: '浇水',   grp: 'water' },
pot:        { n: '盆栽',     e: '🪴', cf: 1, lv: 1, cost: 14, act: '看看它', grp: 'water' },
painting:   { n: '挂画',     e: '🖼️', cf: 1, lv: 2, cost: 20, act: '看看画', grp: 'furnuse' },
doll:       { n: '玩偶熊',   e: '🧸', cf: 1, lv: 1, cost: 16, act: '抱一抱', grp: 'furnuse' },
vase:       { n: '花瓶',     e: '🏺', cf: 1, lv: 3, cost: 24, act: '插花',   grp: 'water' },
candle:     { n: '香薰蜡烛', e: '🕯️', cf: 2, lv: 2, cost: 20, act: '点上',   grp: 'night', lamp: true, flk: true },
nightlight: { n: '小夜灯',   e: '🪔', cf: 1, lv: 1, cost: 15, act: '打开',   grp: 'night', lamp: true },
starlight:  { n: '星星灯',   e: '✨', cf: 2, lv: 3, cost: 28, act: '许愿',   grp: 'wish', lamp: true, flk: true },
radio:      { n: '收音机',   e: '📻', cf: 2, lv: 2, cost: 26, act: '放音乐', grp: 'music' },
mirror:     { n: '穿衣镜',   e: '🪞', cf: 1, lv: 2, cost: 18, act: '照镜子', grp: 'furnuse' },
kettle:     { n: '热茶壶',   e: '☕', cf: 1, lv: 1, cost: 14, act: '泡杯热茶', grp: 'tea' },
speaker:    { n: '小音箱',   e: '🎵', cf: 2, lv: 3, cost: 30, act: '放首歌', grp: 'music' },
gamepad:    { n: '游戏机',   e: '🎮', cf: 2, lv: 3, cost: 32, act: '玩一会儿', grp: 'furnuse' }
};
Object.keys(CAT).forEach(k => { CAT[k].id = k; });
const SEATS = ['bed', 'sofa', 'chair', 'rug'];
const LAMPABLE = Object.keys(CAT).filter(k => CAT[k].lamp);
const WALLS = [
{ id: 'cream', n: '米白', lv: 1 }, { id: 'cloud', n: '云朵', lv: 1 }, { id: 'stripe', n: '奶油条纹', lv: 2 },
{ id: 'cabin', n: '木屋', lv: 2 }, { id: 'gardenw', n: '花园', lv: 3 }, { id: 'dusk', n: '暮色', lv: 3 },
{ id: 'starw', n: '星空', lv: 4 }, { id: 'checkerw', n: '棋盘砖', lv: 4 }, { id: 'nightw', n: '夜色', lv: 5 }
];
const FLOORS = [
{ id: 'wood', n: '木地板', lv: 1 }, { id: 'light', n: '浅色地板', lv: 1 }, { id: 'carpet', n: '软地毯', lv: 2 }, { id: 'stone', n: '石板', lv: 3 }
];
const LV_TH = [0, 8, 16, 26, 38];
const LV_CAP = [0, 9, 13, 17, 21, 26];
const MAX_PER_TYPE = 2;
function fresh() {
return {
fx: [
{ i: 'a1', t: 'bed', x: 4, y: 0, r: 0 },
{ i: 'a2', t: 'shelf', x: 0, y: 0, r: 0 },
{ i: 'a3', t: 'plant', x: 1, y: 1, r: 0 },
{ i: 'a4', t: 'chair', x: 3, y: 2, r: 0 }
],
inv: {}, pts: 6, lv: 1,
wall: 'cream', floor: 'wood',
day: '', lit: {},
earn: { day: '', n: 0, ta: 0 },
ta: { x: 2, y: 1, act: 'idle', tx: 2, ty: 1, faint: false, nextAt: Date.now() + 15000 }
};
}
let d = null;
let rooms = [], curId = null; /* 私人四改：房间列表 + 当前房间 */
function rKey(id) { return 'room-data-' + id; }
function readList() {
  try {
    const v = JSON.parse(S().get(LIST_KEY) || 'null');
    return (Array.isArray(v) && v.length) ? v.filter(x => typeof x === 'string' && x) : null;
  } catch (e) { return null; }
}
function writeList(l) { try { S().set(LIST_KEY, JSON.stringify(l)); } catch (e) {} }
function migrateRooms() {
  let l = readList();
  if (l) { rooms = l; return; }
  /* 旧版：把 room-data 变成第一间房 */
  let first = null;
  try { const v = S().get(KEY); if (v) first = JSON.parse(v); } catch (e) {}
  if (!first || typeof first !== 'object') first = fresh();
  if (!first.name) first.name = '卧室';
  curId = 'r' + Date.now().toString(36);
  try { S().set(rKey(curId), JSON.stringify(first)); } catch (e) {}
  rooms = [curId];
  writeList(rooms);
  try { S().remove(KEY); } catch (e) {}
}
function loadCur() {
  let o = null;
  try { const v = S().get(rKey(curId)); if (v) o = JSON.parse(v); } catch (e) {}
  if (!o || typeof o !== 'object') o = fresh();
  if (!o.name) o.name = '卧室';
  fix(o);
  d = o;
}
function saveRooms() { writeList(rooms); }
/* TA 今天待在哪间房（每天随机一间，默认进屋就落在 TA 那间） */
function taRoomId() {
  const s = S(), tk = todayKey();
  let v = null;
  try { v = JSON.parse(s.get('room-ta-in') || 'null'); } catch (e) {}
  if (v && v.day === tk && rooms.indexOf(v.id) >= 0) return v.id;
  const id = rooms[Math.floor(Math.random() * rooms.length)];
  try { s.set('room-ta-in', JSON.stringify({ day: tk, id: id })); } catch (e) {}
  return id;
}
function taHereNow() { return curId === taRoomId(); }
/* 自定义家具（全局共用，带照片） */
function customList() {
  try { const v = JSON.parse(S().get('room-custom-furn') || '[]'); return Array.isArray(v) ? v.filter(x => x && x.id && x.img) : []; } catch (e) { return []; }
}
function saveCustom(l) { try { S().set('room-custom-furn', JSON.stringify(l)); } catch (e) {} }
/* 私人五改：一件家具可以有多个互动（acts 数组）；旧数据只有单个 act，读的时候补成数组 */
function actsOf(o) {
  if (!o || typeof o !== 'object') return ['看看'];
  if (Array.isArray(o.acts)) {
    const a = o.acts.map(x => String(x == null ? '' : x).trim()).filter(Boolean);
    if (a.length) return a.slice(0, 12);
  }
  const one = String(o.act == null ? '' : o.act).trim();
  return [one || '看看'];
}
const _cusMapCache = { t: 0, m: null };
function customMap() {
  const now = Date.now();
  if (_cusMapCache.m && now - _cusMapCache.t < 1500) return _cusMapCache.m;
  const m = {};
  customList().forEach(c => {
    const acts = actsOf(c);
    m[c.id] = { n: c.n || '自定义家具', e: '', img: c.img, cf: 1, lv: 1, cost: (typeof c.cost === 'number' ? c.cost : 0), act: acts[0], acts: acts, grp: c.grp || 'furnuse', id: c.id, custom: true };
  });
  _cusMapCache.t = now; _cusMapCache.m = m;
  return m;
}
function C(t) { return CAT[t] || customMap()[t] || null; }
/* 商品可改：价格 / 互动名（room-cat-over 存覆盖值，内置和自定义都适用） */
function catOver() {
  try { const v = JSON.parse(S().get('room-cat-over') || '{}'); return (v && typeof v === 'object') ? v : {}; } catch (e) { return {}; }
}
function saveCatOver(o) { try { S().set('room-cat-over', JSON.stringify(o)); } catch (e) {} }
function C2(t) {
  const base = C(t); if (!base) return null;
  const ov = catOver()[t];
  if (!ov) return base;
  const extra = Array.isArray(ov.acts) ? ov.acts.map(x => String(x == null ? '' : x).trim()).filter(Boolean) : [];
  const acts = extra.length ? extra : (base.acts || actsOf(base));
  return Object.assign({}, base, ov, { act: acts[0], acts: acts.slice(0, 12) });
}
function fix(o) {
if (!Array.isArray(o.fx)) o.fx = [];
if (!o.inv || typeof o.inv !== 'object') o.inv = {};
if (typeof o.pts !== 'number') o.pts = 0;
if (!o.lv || o.lv < 1) o.lv = 1;
if (!o.wall) o.wall = 'cream';
if (!o.floor) o.floor = 'wood';
if (!o.lit || typeof o.lit !== 'object') o.lit = {};
if (!o.earn || typeof o.earn !== 'object') o.earn = { day: '', n: 0, ta: 0 };
if (!o.ta || typeof o.ta !== 'object') o.ta = { x: 2, y: 1, act: 'idle', tx: 2, ty: 1, faint: false, nextAt: Date.now() + 15000 };
if (!o.name || typeof o.name !== 'string') o.name = '卧室';
o.fx = o.fx.filter(it => it && it.i && C(it.t) && it.x >= 0 && it.x < COLS && it.y >= 0 && it.y < ROWS);
const seen = {};
o.fx = o.fx.filter(it => { if (seen[it.i]) return false; seen[it.i] = 1; return true; });
Object.keys(o.lit).forEach(k => {
if (o.fx.some(f => f.i === k)) return;
const wasOn = o.lit[k];
delete o.lit[k];
const first = wasOn && o.fx.find(f => f.t === k);
if (first) o.lit[first.i] = true;
});
}
function save() {
try { S().set(rKey(curId), JSON.stringify(d)); } catch (e) {}
try { if (window.idbSet) window.idbSet(window.activePrefix() + ':' + rKey(curId), JSON.stringify(d)); } catch (e) {}
}
let booted = false;
(function restoreIdb() {
try {
const s = S(); if (!s || !window.idbGet || s.get(rKey(curId))) return;
const pf = window.activePrefix();
window.idbGet(pf + ':' + rKey(curId)).then(v => {
if (!v || window.activePrefix() !== pf || s.get(rKey(curId))) return;
try {
const o = typeof v === 'string' ? JSON.parse(v) : v;
if (!o || typeof o !== 'object') return;
fix(o);
s.set(rKey(curId), JSON.stringify(o));
const cur = d ? JSON.parse(JSON.stringify(d)) : null;
const curFresh = !cur || (!cur.day && placedCountOf(cur) <= 4 && cur.pts <= 6);
if (!booted || curFresh) {
d = o;
if (!page.hidden) { updHud(); buildCells(); renderScene(); }
}
} catch (e) {}
});
} catch (e) {}
function placedCountOf(o) { return Array.isArray(o.fx) ? o.fx.length : 0; }
})();
function placedCount() { return d.fx.length; }
function comfortSum() { return d.fx.reduce((a, it) => a + (C(it.t) ? C(it.t).cf : 0), 0); }
function starsOf() {
const c = comfortSum();
const th = [1, 8, 16, 26, 38];
let k = 1; th.forEach((t, i) => { if (c >= t) k = i + 1; });
return Math.min(5, k);
}
function capOf() { return LV_CAP[Math.min(d.lv, LV_CAP.length - 1)]; }
function itemAt(x, y) { return d.fx.find(f => f.x === x && f.y === y) || null; }
function ownedCount(t) { return (d.inv[t] || 0) + d.fx.filter(x => x.t === t).length; }
function isSeatT(t) { const c = C(t); return !!(c && c.grp === 'beside'); }
const EARN_CAP = { ta: { cap: 5, name: '陪 TA 互动' }, n: { cap: 10, name: '家具互动' } };
function gainPts(n, kind) {
const tk = todayKey();
if (d.earn.day !== tk) d.earn = { day: tk, n: 0, ta: 0 };
const lim = EARN_CAP[kind];
if (lim) {
if (d.earn[kind] >= lim.cap) { toast('今天「' + lim.name + '」的小屋点数到上限啦（' + lim.cap + '/' + lim.cap + '），明天再来'); return false; }
d.earn[kind]++;
}
d.pts += n; updHud(); floatPts('+' + n + '🏠'); return true;
}
function checkLevel() {
const c = comfortSum(); let nl = 1;
for (let i = 0; i < LV_TH.length; i++) if (c >= LV_TH[i]) nl = i + 1;
if (nl > d.lv) {
d.lv = nl; fete(nl);
setTimeout(() => {
toast('🏡 小屋升到 Lv.' + nl + '！解锁了新家具和装扮');
vib([40, 60, 40]);
}, 300);
}
}
function isNight() { const h = new Date().getHours(); return h >= 19 || h < 6; }
const WEATHERS = [{ i: '☀️', t: '晴' }, { i: '⛅', t: '多云' }, { i: '🌧️', t: '小雨' }, { i: '🌨️', t: '雪' }];
function weather() {
const s = todayKey(); // YYYY-M-D，天然每天一变
let h = 0;
for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
return WEATHERS[h % WEATHERS.length];
}
const $id = (i) => document.getElementById(i);
const sceneEl = $id('room-scene'), wallEl = $id('room-wall'), floorEl = $id('room-floor');
const taEl = $id('room-ta'), bubbleEl = $id('room-bubble'), statusEl = $id('room-status');
function manualBrightness() {
const s = S(), raw = s && s.get('room-brightness');
if (raw == null || raw === '') return null;
const n = Number(raw);
return Number.isFinite(n) ? Math.max(50, Math.min(150, n)) : null;
}
function applyBrightness(value) {
if (value === undefined) value = manualBrightness();
sceneEl.classList.toggle('r-manual-light', value !== null);
sceneEl.style.setProperty('--room-bright', String(value === null ? lum() : value / 100));
const slider = $id('room-brightness');
if (slider) {
slider.value = String(value === null ? 100 : value);
$id('room-brightness-value').textContent = value === null ? '自动' : value + '%';
$id('room-brightness-auto').disabled = value === null;
}
}
let brightWriteT = null, brightLastAt = 0;
function writeBright(v) {
const s = S(); if (!s) return;
if (brightWriteT) { clearTimeout(brightWriteT); brightWriteT = null; }
const now = Date.now();
if (now - brightLastAt >= 300) { brightLastAt = now; s.set('room-brightness', v); return; }
brightWriteT = setTimeout(function () {
brightWriteT = null; brightLastAt = Date.now();
s.set('room-brightness', v);
}, 320);
}
function flushBright(v) {
if (brightWriteT) { clearTimeout(brightWriteT); brightWriteT = null; }
brightLastAt = 0;
writeBright(v);
}
function bindBrightness() {
const controls = document.createElement('div');
controls.className = 'r-brightness';
controls.innerHTML = '<label for="room-brightness">亮度 <output id="room-brightness-value" for="room-brightness">自动</output></label>' +
'<input id="room-brightness" type="range" min="50" max="150" step="5" value="100" aria-label="房间亮度">' +
'<button id="room-brightness-auto" type="button">自动</button>';
sceneEl.parentNode.insertBefore(controls, sceneEl);
$id('room-brightness').addEventListener('input', function () {
const v = Number(this.value);
applyBrightness(v); // 即时生效不回读存储（存储此刻可能还压在合并窗口里）
writeBright(v);
});
$id('room-brightness').addEventListener('change', function () {
flushBright(Number(this.value));
});
$id('room-brightness-auto').addEventListener('click', function () {
const s = S(); if (!s) return;
if (brightWriteT) { clearTimeout(brightWriteT); brightWriteT = null; } // 迟到写回会复活刚删的键
s.remove('room-brightness');
applyBrightness();
});
document.addEventListener('visibilitychange', function () {
if (!document.hidden || !brightWriteT) return;
flushBright(Number($id('room-brightness').value));
});
}
function buildCells() {
if (!floorEl || floorEl.dataset.cells) return;
floorEl.dataset.cells = '1';
for (let y = 0; y < ROWS; y++) {
for (let x = 0; x < COLS; x++) {
const c = document.createElement('div');
c.className = 'r-cell';
c.style.left = (x * 100 / COLS) + '%';
c.style.top = (y * 100 / ROWS) + '%';
c.style.width = (100 / COLS) + '%';
c.style.height = (100 / ROWS) + '%';
c.dataset.x = x; c.dataset.y = y;
floorEl.appendChild(c);
}
}
}
function pctPos(x, y) {
return { l: ((x + 0.5) * 100 / COLS), t: ((y + 0.86) * 100 / ROWS) };
}
function renderScene() {
const night = isNight(), w = weather();
sceneEl.classList.toggle('night', night);
sceneEl.classList.toggle('raining', !night && w.t === '小雨');
applyBrightness();
wallEl.className = 'r-wall wall-' + d.wall;
floorEl.className = 'r-floor floor-' + d.floor;
wallEl.classList.toggle('wall-img', !!d.wallImg);
wallEl.style.backgroundImage = d.wallImg ? ('url("' + d.wallImg + '")') : '';
wallEl.style.backgroundSize = d.wallImg ? 'cover' : '';
wallEl.style.backgroundPosition = d.wallImg ? 'center' : '';
floorEl.classList.toggle('floor-img', !!d.floorImg);
floorEl.style.backgroundImage = d.floorImg ? ('url("' + d.floorImg + '")') : '';
floorEl.style.backgroundSize = d.floorImg ? 'cover' : '';
$id('room-win-a').className = 'r-window wa' + (night ? ' nw' : '');
$id('room-win-b').className = 'r-window wb' + (night ? ' nw' : '');
$id('room-sky-a').textContent = night ? '🌙' : w.i;
$id('room-sky-b').textContent = night ? '🌙' : w.i;
Array.prototype.slice.call(floorEl.querySelectorAll('.r-furn,.r-pool')).forEach(n => n.remove());
d.fx.forEach(it => {
const c = C(it.t); if (!c) return;
const el = document.createElement('div');
el.className = 'r-furn' + (it.r ? ' r-flip' : '') + (d.lit[it.i] ? ' r-lit' : '') + (c.flk ? ' r-flkc' : '');
const p = pctPos(it.x, it.y);
el.style.left = p.l + '%'; el.style.top = p.t + '%';
if (c.img) {
const im = document.createElement('img');
im.className = 'r-furn-img';
im.src = c.img; im.alt = '';
im.draggable = false;
el.appendChild(im);
}
else if (it.t === 'vase' && d.vaseFlower) el.innerHTML = c.e + '<u class="r-bloom">🌸</u>';
else el.textContent = c.e;
el.dataset.i = it.i;
floorEl.appendChild(el);
if (d.lit[it.i]) {
const pool = document.createElement('div');
pool.className = 'r-pool' + (c.flk ? ' r-pool-f' : '');
pool.style.left = p.l + '%'; pool.style.top = (p.t + 4.2) + '%';
floorEl.appendChild(pool);
}
});
renderTa();
renderStatus();
refreshCells();
}
function taAvatarNode() {
let av = taEl.querySelector('.r-ta-av');
if (!av) {
av = document.createElement('i');
taEl.appendChild(av);
}
let url = '', spr = '';
try { const s = S(); spr = (s && s.get('room-ta-sprite')) || ''; url = (s && (s.get('cs-avatar-partner') || s.get('avatar-partner'))) || ''; } catch (e) {}
const useImg = spr || url;
const hasImg = !!(useImg && useImg.length > 30);
av.className = 'r-ta-av' + (spr && hasImg ? ' r-ta-spr' : (hasImg ? '' : ' r-ta-sil'));
av.style.backgroundRepeat = (spr && hasImg) ? 'no-repeat' : '';
av.style.backgroundSize = (spr && hasImg) ? 'contain' : '';
av.style.backgroundColor = (spr && hasImg) ? 'transparent' : '';
av.style.backgroundImage = hasImg ? 'url("' + (spr || url).replace(/"/g, '&quot;') + '")' : '';
}
function renderTa() {
taAvatarNode();
taEl.hidden = !taHereNow();
const p = pctPos(d.ta.x, d.ta.y);
taEl.style.left = p.l + '%'; taEl.style.top = p.t + '%';
taEl.classList.toggle('r-faint', !!d.ta.faint);
const moving = d.ta.x !== d.ta.tx || d.ta.y !== d.ta.ty;
const seated = !moving && ['sit', 'lie', 'read', 'plant', 'use', 'winwatch'].indexOf(d.ta.act) >= 0;
taEl.classList.toggle('walking', moving);
taEl.classList.toggle('seated', seated);
}
function actLabel() {
switch (d.ta.act) {
case 'walk': return '走动着';
case 'sit': return '坐着';
case 'lie': return '躺着';
case 'read': return '看书';
case 'plant': return '侍弄植物';
case 'winwatch': return '望着窗外';
case 'near': return '待在你附近';
case 'use': return '摆弄着什么';
default: return '站着发呆';
}
}
function renderStatus() {
if (!taHereNow()) { statusEl.textContent = 'TA 不在这个房间。去别的房间看看吧。'; return; }
statusEl.textContent = d.ta.faint
? '「你感觉到旁边有人。」'
: (pn() + ' 正在' + actLabel() + '。');
}
let bubT = null;
const BUB_SHORT = 2100, BUB_AGAIN = 2250;
function bubble(t, ms) {
if (!t) return; // v3.32.x #132：sayLine 概率门控关断时返回空串，不出空气泡
bubbleEl.textContent = t;
bubbleEl.hidden = false;
bubbleEl.classList.remove('pop'); void bubbleEl.offsetWidth; bubbleEl.classList.add('pop');
clearTimeout(bubT); bubT = setTimeout(() => { bubbleEl.hidden = true; }, ms || 3800);
}
function updHud() {
$id('room-chip-lv').textContent = '🏡 Lv.' + d.lv;
$id('room-chip-cf').textContent = '舒适度 ' + '★'.repeat(starsOf()) + '☆'.repeat(5 - starsOf());
$id('room-chip-pt').textContent = '🏠 ' + d.pts;
$id('room-chip-cap').textContent = '家具 ' + placedCount() + '/' + capOf();
}
function floatPts(txt) {
const chip = $id('room-chip-pt'); if (!chip) return;
const s = document.createElement('span');
s.className = 'r-fly'; s.textContent = txt;
s.style.right = ri(0, 16) + 'px';
chip.appendChild(s);
setTimeout(() => s.remove(), 850);
}
function fete(lv) {
if (!sceneEl) return;
const ov = document.createElement('div');
ov.className = 'r-fete';
let html = '<div class="r-fete-t">🏡 小屋 Lv.' + lv + '！</div>';
for (let i = 0; i < 14; i++) {
html += '<i style="left:' + ri(4, 96) + '%;animation-delay:' + (Math.random() * 1.2).toFixed(2) + 's;font-size:' + ri(12, 22) + 'px">' + rnd(['✨', '⭐', '🌟']) + '</i>';
}
ov.innerHTML = html;
sceneEl.appendChild(ov);
setTimeout(() => ov.remove(), 2600);
}
function refreshCells() {
if (!floorEl || !floorEl.dataset.cells) return;
const occ = {};
d.fx.forEach(f => { occ[f.x + ',' + f.y] = 1; });
const active = !!mode || !!(drag && drag.on);
Array.prototype.forEach.call(floorEl.querySelectorAll('.r-cell'), c => {
const k = c.dataset.x + ',' + c.dataset.y;
c.classList.toggle('ok', active && !occ[k]);
c.classList.toggle('bad', active && !!occ[k]);
});
}
function pickAction() {
const night = isNight();
const seats = d.fx.filter(f => isSeatT(f.t));
const shelfs = d.fx.filter(f => f.t === 'shelf');
const plants = d.fx.filter(f => f.t === 'plant' || f.t === 'pot');
const others = d.fx.filter(f => SEATS.indexOf(f.t) < 0 && f.t !== 'shelf');
const W = [
['idle', 10],
['walk', 22],
['sit', seats.length ? (night ? 24 : 18) : 0],
['lie', d.fx.some(f => f.t === 'bed') ? (night ? 12 : 5) : 0],
['read', shelfs.length ? 9 : 0],
['plant', plants.length ? 9 : 0],
['winwatch', 10],
['near', night ? 10 : 15],
['use', others.length ? 10 : 0]
];
let total = W.reduce((a, x) => a + x[1], 0), roll = Math.random() * total, act = 'walk';
for (let i = 0; i < W.length; i++) { roll -= W[i][1]; if (roll < 0) { act = W[i][0]; break; } }
const ta = d.ta;
ta.faint = Math.random() < 0.14;
let dur = ri(24, 55);
if (act === 'sit') { const f = rnd(seats); ta.tx = f.x; ta.ty = f.y; dur = ri(28, 60); }
else if (act === 'lie') { const f = d.fx.find(x => x.t === 'bed'); ta.tx = f.x; ta.ty = f.y; dur = ri(35, 75); }
else if (act === 'read') { const f = rnd(shelfs); ta.tx = f.x; ta.ty = Math.min(ROWS - 1, f.y + 1); dur = ri(25, 55); }
else if (act === 'plant') { const f = rnd(plants); ta.tx = f.x; ta.ty = Math.min(ROWS - 1, f.y + 1); dur = ri(16, 34); }
else if (act === 'winwatch') { ta.tx = Math.random() < 0.5 ? 1 : 4; ta.ty = 0; dur = ri(20, 42); }
else if (act === 'near') { ta.tx = ri(1, 4); ta.ty = ri(ROWS - 2, ROWS - 1); dur = ri(22, 44); }
else if (act === 'use') { const f = rnd(others); ta.tx = f.x; ta.ty = Math.min(ROWS - 1, f.y + 1); dur = ri(16, 36); }
else if (act === 'walk') {
for (let k = 0; k < 12; k++) {
const x = ri(0, COLS - 1), y = ri(0, ROWS - 1);
if (!(x === ta.x && y === ta.y)) { ta.tx = x; ta.ty = y; break; }
}
dur = ri(10, 22);
} else { ta.tx = ta.x; ta.ty = ta.y; }
ta.act = act;
ta.nextAt = Date.now() + dur * 1000;
save(); renderStatus();
}
let stepTimer = null;
function stepOnce() {
const ta = d.ta;
if (ta.x === ta.tx && ta.y === ta.ty) return;
const dx = ta.tx - ta.x, dy = ta.ty - ta.y;
if (dx && (Math.abs(dx) > Math.abs(dy) || !dy || Math.random() < 0.55)) ta.x += dx > 0 ? 1 : -1;
else if (dy) ta.y += dy > 0 ? 1 : -1;
renderTa();
}
function tick() {
if (page.hidden || document.hidden) {
if (stepTimer) { clearInterval(stepTimer); stepTimer = null; }
return;
}
if (!taHereNow()) { if (stepTimer) { clearInterval(stepTimer); stepTimer = null; } return; }
const moving = d.ta.x !== d.ta.tx || d.ta.y !== d.ta.ty;
if (moving && !stepTimer) stepTimer = setInterval(stepOnce, 780);
if (!moving && stepTimer) { clearInterval(stepTimer); stepTimer = null; }
if (!moving && Date.now() >= (d.ta.nextAt || 0)) pickAction();
}
let mode = null; // {kind:'place'|'move', t, i}
function banner(txt) {
const b = $id('room-banner'), tx = $id('room-banner-txt');
if (!b) return;
if (txt == null) { b.hidden = true; sceneEl.classList.remove('placing'); mode = null; }
else { b.hidden = false; tx.textContent = txt; sceneEl.classList.add('placing'); }
refreshCells();
}
function gardenBloom() {
try {
const raw = S().get('garden-data'); if (!raw) return false;
const g = JSON.parse(raw);
if (g && g.st && (g.st.h | 0) > 0) return true;
if (Array.isArray(g.p)) {
const now = Date.now() / 1000;
return g.p.some(pl => pl && pl.planted && (now - pl.planted) > 259200);
}
} catch (e) {}
return false;
}
function useFurniture(inst, actName) {
const c = C2(inst.t); if (!c) return;
if (c.lamp) {
const on = !d.lit[inst.i];
if (on) d.lit[inst.i] = true; else delete d.lit[inst.i]; // 关灯即删键：lit 表里只留在场且亮着的灯
save(); renderScene();
bubble(on ? (isNight() ? '灯亮起来了，房间一下子软了。' : '亮着也很好看。') : '关掉灯，安静了一会儿。', BUB_SHORT);
gainPts(1, 'n'); vib(15);
if (on) lampFeedback(inst, on); else lampOffFeedback(inst);
return;
}
if (inst.t === 'vase' && gardenBloom() && !d.vaseFlower) {
d.vaseFlower = true; save(); renderScene();
bubble('把花园带回来的花，插进了瓶子里。🌸');
gainPts(1, 'n'); vib([15, 40, 15]);
return;
}
const taHere = d.ta.x === inst.x && d.ta.y === inst.y;
bubble(actName ? actName : sayLine(c.grp, c.grp), actName ? 3800 : BUB_SHORT);
if (taHere && !d.ta.faint) setTimeout(() => { if (!bubbleEl.hidden) return; bubble(sayLine('occupied', 'occupied')); }, BUB_AGAIN);
else if (Math.hypot(d.ta.x - inst.x, d.ta.y - inst.y) <= 1.6 && Math.random() < 0.45) setTimeout(() => { if (!bubbleEl.hidden) return; bubble(sayLine('comeover', 'comeover')); }, BUB_AGAIN);
if (inst.t === 'kettle' && Math.random() < 0.5) { d.ta.tx = inst.x; d.ta.ty = Math.min(ROWS - 1, inst.y + 1); }
gainPts(1, 'n'); vib(12);
}
function lampFeedback(inst, on) {
if (!on) return;
const c = C(inst.t);
const g = c.grp === 'night' ? 'night' : (c.grp === 'wish' ? 'wish' : 'lamp');
const line = sayLine(g, g);
const dist = Math.hypot(d.ta.x - inst.x, d.ta.y - inst.y);
const near = dist <= 1.6, chance = near ? 0.8 : 0.45;
if (Math.random() < chance && line) {
const tx = Math.max(0, Math.min(COLS - 1, inst.x)), ty = Math.max(0, Math.min(ROWS - 1, inst.y + 1));
if (d.ta.x !== tx || d.ta.y !== ty) {
d.ta.tx = tx; d.ta.ty = ty; d.ta.act = 'use'; d.ta.faint = false;
d.ta.nextAt = Date.now() + ri(22, 40) * 1000;
save(); renderTa(); renderStatus();
}
setTimeout(() => { if (!bubbleEl.hidden) return; bubble(line); }, near ? BUB_AGAIN : BUB_AGAIN + 400);
}
}
function lampOffFeedback(inst) {
const c = C(inst.t);
if (c.grp === 'wish' || isNight() || Math.random() >= 0.35) return;
const line = sayLine('lamp', 'lamp');
if (line) setTimeout(() => { if (!bubbleEl.hidden) return; bubble(line); }, BUB_AGAIN);
}
function furnMenu(inst) {
const c = C2(inst.t); if (!c) return;
const acts = c.acts && c.acts.length ? c.acts : [c.act];
const pills = acts.map((a, i) => ({ label: a || c.act || '看看', value: 'use' + i }));
pills.push({ label: '移动', value: 'move' });
pills.push({ label: '翻转', value: 'flip' });
pills.push({ label: '收回仓库', value: 'back' });
if (c.custom) pills.push({ label: '编辑 / 删除这件家具', value: 'edit' });
window.openModal((c.img ? '🪑 ' : (c.e + ' ')) + c.n, '', function (v) {
if (!v) return;
if (v.indexOf('use') === 0) { useFurniture(inst, acts[parseInt(v.slice(3), 10)] || undefined); return; }
else if (v === 'edit') { setTimeout(function () { customEditMenu(inst.t); }, 0); return; }
else if (v === 'move') { mode = { kind: 'move', i: inst.i }; banner('移动到哪一点？（点地板空格）'); }
else if (v === 'flip') { inst.r = inst.r ? 0 : 1; save(); renderScene(); }
else if (v === 'back') {
d.fx = d.fx.filter(x => x.i !== inst.i);
d.inv[inst.t] = (d.inv[inst.t] || 0) + 1;
delete d.lit[inst.i]; // 收回即清灯光态：残键会让 lum() 按「不存在的灯」继续增亮
if (d.ta.x === inst.x && d.ta.y === inst.y) { d.ta.tx = ri(0, COLS - 1); d.ta.ty = ri(0, ROWS - 1); }
checkLevel(); save(); renderScene(); updHud();
toast('已收回仓库：' + c.n);
}
}, { noInput: true, pills: pills });
}
function taMenu() {
if (!taHereNow()) { toast('TA 不在这个房间'); return; }
const pills = [
{ label: '靠近', value: 'near' },
{ label: '坐到旁边', value: 'beside' },
{ label: '看看TA', value: 'look' },
{ label: '打招呼', value: 'greet' }
];
window.openModal(d.ta.faint ? '……这里好像有人' : pn(), '', function (v) {
if (!v) return;
const ta = d.ta;
if (v === 'near') {
ta.faint = false;
ta.tx = Math.max(0, Math.min(COLS - 1, ta.x + (ta.x > 2 ? -1 : 1)));
ta.ty = Math.max(0, Math.min(ROWS - 1, ta.y + (Math.random() < 0.5 ? -1 : 1)));
ta.nextAt = Date.now() + ri(20, 40) * 1000;
bubble(sayLine('靠近', 'near')); renderStatus(); gainPts(1, 'ta'); vib(18);
} else if (v === 'beside') {
bubble(sayLine('坐到旁边', 'beside')); gainPts(1, 'ta'); vib(15);
} else if (v === 'look') {
bubble(d.ta.faint ? '……' : sayLine('看TA', 'look')); gainPts(1, 'ta');
} else if (v === 'greet') {
ta.faint = false;
bubble(sayLine('打招呼', 'greet')); renderStatus(); gainPts(1, 'ta'); vib(12);
}
save();
}, { noInput: true, pills: pills });
}
/* 私人四改：长按 TA → 上传 / 恢复立绘 */
function taSpriteMenu() {
const s = S();
const has = !!(s && s.get('room-ta-sprite'));
window.openModal(pn() + ' · 立绘', '', function (v) {
if (v === 'up') {
window.mochiFilePick({
id: 'room-ta-sprite-pick', accept: 'image/*', onFiles: function (files) {
const f = files && files[0];
if (!f) { toast('没有取到图片，请再选一次'); return; }
if (!window.mochiImgCompressTo) { toast('图片处理组件没加载上，请刷新页面再试'); return; }
window.mochiImgCompressTo(f, { maxSide: 512, quality: 0.86, tag: 'room-sprite' }).then(function (out) {
if (!out) { toast('这张图处理不了，换一张试试'); return; }
s.set('room-ta-sprite', out);
renderTa();
toast('立绘已换上');
});
}
});
} else if (v === 'rm') {
s.remove('room-ta-sprite');
renderTa();
toast('已恢复成头像');
}
}, {
noInput: true, pillSubmit: true, hideOk: true,
staticText: has ? 'TA 在房间里的样子。可以换成一张完整立绘，也可以换回头像。' : 'TA 在房间里的样子。长按 TA 就能换这里。',
pills: [{ label: '上传立绘', value: 'up' }].concat(has ? [{ label: '恢复头像', value: 'rm' }] : [])
});
}
let senseCd = 0;
function sense() {
const now = Date.now();
if (now < senseCd) { toast('感应太频繁了，稍等一下'); return; }
senseCd = now + 4000;
if (!taHereNow()) {
const out2 = $id('room-sense-out');
if (out2) { out2.textContent = '房间里很安静。\n「TA 好像不在这间。」'; out2.hidden = false; clearTimeout(out2._t); out2._t = setTimeout(() => { out2.hidden = true; }, 4000); }
vib([12, 40, 12]);
return;
}
const cx = (COLS - 1) / 2, cy = (ROWS - 1) / 2;
const dx = d.ta.x - cx, dy = d.ta.y - cy;
const dist = Math.hypot(dx, dy);
const sideOf = () => {
if (dist < 1.2) return 'here';
if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right';
return dy < 0 ? 'front' : 'back';
};
const side = sideOf();
let line;
if (side === 'here') line = '你现在在房间中央。\nTA就在身边。';
else {
const nameMap = { left: '左边', right: '右边', front: '前面（窗边）', back: '身后' };
const other = ['left', 'right', 'front', 'back'].filter(k => k !== side);
let txt = '你现在在房间中央。';
txt += '\n' + nameMap[side] + '：' + (d.ta.faint ? sayLine('方位感知', 'senseNear', true) : (dist <= 2.2 ? 'TA在。' : sayLine('方位感知', 'senseFar', true)));
other.forEach((k, ix) => { if (ix < 2) txt += '\n' + nameMap[k] + '：' + sayLine('方位感知', 'senseNone', true); });
line = txt;
}
const out = $id('room-sense-out');
if (out) {
out.textContent = line;
out.hidden = false;
clearTimeout(out._t); out._t = setTimeout(() => { out.hidden = true; }, 6500);
}
vib([12, 40, 12]);
}
function invMenu() {
const have = Object.keys(d.inv).filter(t => d.inv[t] > 0 && C(t));
const pills = [
{ label: '🛒 兑换新家具', value: 'shop' },
{ label: '📷 自定义家具（上传照片）', value: 'newc' },
{ label: '⚙ 管理自定义家具', value: 'mge' }
];
have.forEach(t => {
const c = C(t);
pills.push({ label: (c.img ? '🖼️ ' : (c.e + ' ')) + c.n + ' ×' + d.inv[t], value: 'p:' + t });
});
window.openModal('家具仓（已摆 ' + placedCount() + '/' + capOf() + '）', '', function (v) {
if (!v) return;
if (v === 'shop') { setTimeout(shopMenu, 0); return; }
if (v === 'newc') { setTimeout(customNew, 0); return; }
if (v === 'mge') { setTimeout(customManage, 0); return; }
const t = v.slice(2);
if (placedCount() >= capOf()) { toast('小屋快满啦，先收回一件吧'); return; }
mode = { kind: 'place', t: t };
banner('放置：' + CAT[t].e + ' ' + CAT[t].n + ' —— 点一块地板');
}, { noInput: true, pills: pills, staticText: have.length ? '选一件开始摆放，或去兑换新的' : '仓库空空的。每天进屋会收到小礼物，也可以用点数兑换' });
}
function shopMenu() {
const pills = [];
Object.keys(CAT).forEach(t => {
const c = C2(t);
if (ownedCount(t) >= MAX_PER_TYPE) return;
const lock = c.lv > d.lv;
pills.push({ label: c.e + ' ' + c.n + ' · ' + c.cost + '🏠' + (lock ? ' 🔒Lv' + c.lv : (d.pts < c.cost ? '（还差 ' + (c.cost - d.pts) + '）' : '')), value: lock ? 'lock:' + t : 'b:' + t });
});
customList().forEach(cu => {
const c = C2(cu.id);
if (!c || ownedCount(cu.id) >= MAX_PER_TYPE) return;
pills.push({ label: '🖼️ ' + c.n + ' · ' + c.cost + '🏠' + (d.pts < c.cost ? '（还差 ' + (c.cost - d.pts) + '）' : ''), value: 'b:' + cu.id });
});
pills.push({ label: '✏️ 调整价格 / 互动', value: 'edit' });
window.openModal('兑换家具（有 🏠' + d.pts + '）', '', function (v) {
if (!v) return;
if (v === 'edit') { setTimeout(itemEditPick, 0); return; }
if (v.indexOf('lock:') === 0) {
const lc = C2(v.slice(5));
if (lc) toast('🔒 ' + lc.n + '：小屋 Lv.' + lc.lv + ' 解锁（现在 Lv.' + d.lv + '），多互动攒舒适度就会升');
return;
}
const t = v.slice(2), c = C2(t);
if (d.pts < c.cost) { toast('点数还不够，多进来待一会儿就有了'); return; }
d.pts -= c.cost; d.inv[t] = (d.inv[t] || 0) + 1;
save(); updHud();
toast('已放进仓库：' + c.e + ' ' + c.n);
setTimeout(shopMenu, 0); // 同上：等本层 close 完成再重开列表
}, { noInput: true, pills: pills, staticText: '互动和每日进屋都会攒点数' });
}
function decoLockTxt(o) { return '🔒 ' + o.n + '：小屋 Lv.' + o.lv + ' 解锁（现在 Lv.' + d.lv + '）'; }
/* 私人五改：墙纸 / 地板先压一遍原图，再进裁剪窗；不裁剪就直接用整张 */
function pickRoomImg(tag, cb) {
window.mochiFilePick({
id: 'room-deco-pick-' + tag, accept: 'image/*', onFiles: function (files) {
const f = files && files[0];
if (!f) { toast('没有取到图片，请再选一次'); return; }
if (!window.mochiImgCompressTo) { toast('图片处理组件没加载上，请刷新页面再试'); return; }
window.mochiImgCompressTo(f, { maxSide: 1024, quality: 0.88, tag: 'room-deco' }).then(function (out) {
if (!out) { toast('这张图处理不了，换一张试试'); return; }
if (!window.mochiImgCrop) { cb(out); return; }
window.mochiImgCrop({
src: out,
tag: tag,
onDone: function (cropped) {
if (!cropped) { toast('这张图处理不了，换一张试试'); return; }
cb(cropped);
}
});
});
}
});
}
function decoFlow() {
const wp = WALLS.map(w => ({ label: (d.wall === w.id && !d.wallImg ? '✅ ' : '') + w.n + (w.lv > d.lv ? ' 🔒Lv' + w.lv : ''), value: w.lv <= d.lv ? 'w:' + w.id : 'lockw:' + w.id }));
wp.unshift({ label: '🖼️ 上传自定义墙纸', value: 'upw' });
if (d.wallImg) wp.push({ label: '✕ 撤掉自定义墙纸', value: 'rmw' });
window.openModal('装扮 · 墙纸', '', function (v) {
if (v && v.indexOf('lockw:') === 0) {
const lw = WALLS.filter(function (x) { return x.id === v.slice(6); })[0];
if (lw) toast(decoLockTxt(lw));
} else if (v === 'upw') {
pickRoomImg('wall', function (out) { d.wallImg = out; save(); renderScene(); toast('墙纸已换上'); });
return;
} else if (v === 'rmw') { delete d.wallImg; save(); renderScene(); }
else if (v && v.indexOf('w:') === 0) { d.wall = v.slice(2); delete d.wallImg; save(); renderScene(); }
setTimeout(floorPick, 0); // 嵌套 openModal 延后到外层 close 之后
}, { noInput: true, pills: wp, staticText: '可以选预设花色，也可以直接传一张自己的图当墙纸。' });
}
function floorPick() {
const fp = FLOORS.map(f => ({ label: (d.floor === f.id && !d.floorImg ? '✅ ' : '') + f.n + (f.lv > d.lv ? ' 🔒Lv' + f.lv : ''), value: f.lv <= d.lv ? 'f:' + f.id : 'lockf:' + f.id }));
fp.unshift({ label: '🖼️ 上传自定义地板', value: 'upf' });
if (d.floorImg) fp.push({ label: '✕ 撤掉自定义地板', value: 'rmf' });
window.openModal('装扮 · 地板', '', function (v) {
if (v && v.indexOf('lockf:') === 0) {
const lf = FLOORS.filter(function (x) { return x.id === v.slice(6); })[0];
if (lf) toast(decoLockTxt(lf));
} else if (v === 'upf') {
pickRoomImg('floor', function (out) { d.floorImg = out; save(); renderScene(); toast('地板已换上'); });
return;
} else if (v === 'rmf') { delete d.floorImg; save(); renderScene(); }
else if (v && v.indexOf('f:') === 0) { d.floor = v.slice(2); delete d.floorImg; save(); renderScene(); }
}, { noInput: true, pills: fp });
}

/* 私人五改：浮层统一挂到「手机屏幕」上。.app 是网格项、宽高由内容撑开（实测 0），
   挂进去 absolute inset:0 会缩成 0×0 看不见，所以固定用 .phone。 */
function roomOverlayHost() {
return document.querySelector('.phone') || document.querySelector('.app') || document.body;
}
/* ===== 私人五改：墙纸 / 地板的裁剪窗（拖动平移 + 滑杆缩放，按目标宽高比裁） ===== */
let _crop = null;
function cropOverlayHTML() {
return '<div id="room-crop-ov" hidden><div class="r-crop-card"><div class="r-crop-ttl" id="r-crop-ttl">裁剪墙纸</div><div class="r-crop-stage" id="r-crop-stage"><canvas id="r-crop-canvas"></canvas></div><div class="r-crop-tip" id="r-crop-tip"></div><div class="r-crop-zoom"><span>小</span><input type="range" id="r-crop-zoom" min="1" max="3" step="0.01" value="1"><span>大</span></div><div class="r-crop-btns"><button type="button" class="r-edit-btn ghost" id="r-crop-cancel">取消</button><button type="button" class="r-edit-btn ghost" id="r-crop-full">用整张</button><button type="button" class="r-edit-btn main" id="r-crop-ok">用这块</button></div></div></div>';
}
function cropClose() {
const st = _crop;
if (!st) return;
_crop = null;
if (st.cleanup) st.cleanup();
st.ov.hidden = true;
if (st.ov.parentNode) st.ov.parentNode.removeChild(st.ov);
}
window.mochiImgCrop = function (o) {
o = o || {};
const src = o.src, onDone = o.onDone;
if (!src) { if (onDone) onDone(null); return; }
const tag = o.tag === 'floor' ? 'floor' : 'wall';
const frameAR = tag === 'floor' ? 1.6 : (1 / 0.62);
cropClose();
const host = roomOverlayHost();
if (!document.getElementById('room-crop-ov')) {
const box = document.createElement('div');
box.innerHTML = cropOverlayHTML();
host.appendChild(box.firstChild);
}
const $ = (i) => document.getElementById(i);
const ov = $('room-crop-ov'), stage = $('r-crop-stage'), cv = $('r-crop-canvas');
const zoomEl = $('r-crop-zoom');
const tipOk = '拖动图片调整位置，下面的滑杆放大或缩小。框里看到的就是贴到房间里的样子。';
const tipFail = '这张图在这台设备上裁不了（可能是格式不支持）。可以点「用整张」直接拿来用，或者换一张。';
$('r-crop-ttl').textContent = tag === 'floor' ? '裁剪地板' : '裁剪墙纸';
$('r-crop-tip').textContent = tipOk;
zoomEl.value = '1';
const img = new Image();
const st0 = { ov: ov };
let st = null, drag = null, settled = false;
_crop = st0;
function finish(v) {
if (settled) return;
settled = true;
cropClose();
if (onDone) onDone(v);
}
function layout() {
const W = Math.max(160, Math.round(stage.clientWidth || 280));
const H = Math.round(W / frameAR);
stage.style.height = H + 'px';
const dpr = Math.min(3, window.devicePixelRatio || 1);
cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
cv.style.width = W + 'px'; cv.style.height = H + 'px';
return { W: W, H: H };
}
function calc(frame, ext) {
const base = Math.max(frame.W / img.width, frame.H / img.height);
const scale = base * ext;
const vw = frame.W / scale, vh = frame.H / scale;
let maxX = img.width - vw, maxY = img.height - vh;
if (maxX < 0.001) maxX = 0;
if (maxY < 0.001) maxY = 0;
st = {
W: frame.W, H: frame.H, scale: scale, vw: vw, vh: vh, maxX: maxX, maxY: maxY,
ox: Math.max(0, Math.min(maxX, st ? st.ox : maxX / 2)),
oy: Math.max(0, Math.min(maxY, st ? st.oy : maxY / 2))
};
}
function redraw() {
if (!st) return;
const x = cv.getContext('2d');
if (!x) return;
const CW = cv.width, CH = cv.height;
x.setTransform(1, 0, 0, 1, 0, 0);
x.clearRect(0, 0, CW, CH);
try {
x.imageSmoothingQuality = 'high';
x.drawImage(img, st.ox, st.oy, st.vw, st.vh, 0, 0, CW, CH);
} catch (e) { return; }
const s = CW / st.W;
x.strokeStyle = 'rgba(255,255,255,.85)';
x.lineWidth = 1.5 * s;
x.strokeRect(x.lineWidth / 2, x.lineWidth / 2, CW - x.lineWidth, CH - x.lineWidth);
x.strokeStyle = 'rgba(255,255,255,.32)';
x.lineWidth = 1 * s;
for (let i = 1; i < 3; i++) {
const px = CW * i / 3, py = CH * i / 3;
x.beginPath(); x.moveTo(px, 0); x.lineTo(px, CH); x.stroke();
x.beginPath(); x.moveTo(0, py); x.lineTo(CW, py); x.stroke();
}
}
$('r-crop-cancel').onclick = function () { finish(null); };
$('r-crop-full').onclick = function () { finish(src); };
$('r-crop-ok').onclick = function () {
if (!st) { finish(src); return; }
const OUT_W = tag === 'floor' ? 960 : 640;
const OUT_H = Math.max(1, Math.round(OUT_W / frameAR));
const c = document.createElement('canvas');
c.width = OUT_W; c.height = OUT_H;
const x = c.getContext('2d');
if (!x) { finish(src); return; }
try {
x.fillStyle = '#e8ddc8';
x.fillRect(0, 0, OUT_W, OUT_H);
x.imageSmoothingQuality = 'high';
x.drawImage(img, st.ox, st.oy, st.vw, st.vh, 0, 0, OUT_W, OUT_H);
const out = c.toDataURL('image/jpeg', 0.85);
c.width = c.height = 0;
finish(out && out.length > 32 ? out : src);
} catch (e) { finish(src); }
};
zoomEl.addEventListener('input', function () {
if (!st) return;
calc({ W: st.W, H: st.H }, Math.max(1, Math.min(3, parseFloat(zoomEl.value) || 1)));
redraw();
});
function pt(e) {
const r = cv.getBoundingClientRect();
return { x: e.clientX - r.left, y: e.clientY - r.top, W: r.width, H: r.height };
}
cv.style.touchAction = 'none';
cv.addEventListener('pointerdown', function (e) {
if (!st) return;
const p = pt(e);
drag = { x: p.x, y: p.y, ox: st.ox, oy: st.oy };
try { cv.setPointerCapture(e.pointerId); } catch (e2) {}
e.preventDefault();
});
cv.addEventListener('pointermove', function (e) {
if (!st || !drag) return;
const p = pt(e);
const k = st.vw / Math.max(1, p.W);
st.ox = Math.max(0, Math.min(st.maxX, drag.ox - (p.x - drag.x) * k));
st.oy = Math.max(0, Math.min(st.maxY, drag.oy - (p.y - drag.y) * k));
e.preventDefault();
redraw();
});
cv.addEventListener('pointerup', function () { drag = null; });
cv.addEventListener('pointercancel', function () { drag = null; });
cv.addEventListener('pointerleave', function () { drag = null; });
stage.addEventListener('wheel', function (e) {
if (!st) return;
const ext = Math.max(1, Math.min(3, (parseFloat(zoomEl.value) || 1) + (e.deltaY > 0 ? -0.08 : 0.08)));
zoomEl.value = String(ext);
zoomEl.dispatchEvent(new Event('input'));
e.preventDefault();
}, { passive: false });
const adaptEv = function () {
if (_crop !== st0 || !st) return;
if (!img.complete || !img.naturalWidth) return;
try { const frame = layout(); calc(frame, parseFloat(zoomEl.value) || 1); redraw(); } catch (e) {}
};
window.addEventListener('resize', adaptEv);
st0.cleanup = function () { window.removeEventListener('resize', adaptEv); };
img.onload = function () {
if (_crop !== st0) return;
const frame = layout();
calc(frame, 1);
redraw();
};
img.onerror = function () {
$('r-crop-tip').textContent = tipFail;
};
ov.hidden = false;
img.src = src;
setTimeout(function () {
if (_crop !== st0 || st) return;
if (!img.complete || !img.naturalWidth) return;
try { const frame = layout(); calc(frame, 1); redraw(); } catch (e) {}
}, 60);
};

/* ===== 私人四改：自定义家具 —— 新建 / 管理 / 编辑 ===== */
/* 私人五改：新建 / 编辑都走「竖屏小窗」表单（图片 → 名字 → 价格 → 多个互动） */
function customNew() {
window.mochiFilePick({
id: 'room-furn-new-pick', accept: 'image/*', onFiles: function (files) {
const f = files && files[0];
if (!f) { toast('没有取到图片，请再选一次'); return; }
if (!window.mochiImgCompressTo) { toast('图片处理组件没加载上，请刷新页面再试'); return; }
window.mochiImgCompressTo(f, { maxSide: 256, quality: 0.85, tag: 'room-furn' }).then(function (out) {
if (!out) { toast('这张图处理不了，换一张试试'); return; }
customFurnSheet({ img: out }, function (res) {
if (!res || !res.img) return;
const id = 'c' + Date.now().toString(36);
const l = customList();
l.push({ id: id, n: res.n, img: res.img, act: res.acts[0], acts: res.acts, cost: res.cost, grp: 'furnuse' });
saveCustom(l);
d.inv[id] = (d.inv[id] || 0) + 1;
save(); updHud();
toast('已放进仓库：' + res.n);
});
});
}
});
}
function customManage() {
const l = customList();
if (!l.length) { toast('还没有自定义家具，先「📷 自定义家具」传一张'); return; }
const pills = l.map(c => ({ label: c.n, value: c.id }));
window.openModal('管理自定义家具', '', function (v) {
if (!v) return;
setTimeout(function () { customEditMenu(v); }, 0);
}, { noInput: true, pills: pills, staticText: '点一件可以改名字、换图、设互动，或删掉它。' });
}
function customEditMenu(id) {
const l = customList();
const it = l.find(x => x.id === id);
if (!it) { toast('这件家具已经不在了'); return; }
customFurnSheet(it, function (res) {
if (!res) return;
if (res.del) {
const l2 = customList().filter(x => x.id !== id);
saveCustom(l2);
/* 场上和仓库里的实例一并清掉 */
d.fx = d.fx.filter(x => x.t !== id);
delete d.inv[id];
delete d.lit[id];
save(); renderScene(); updHud();
toast('已删掉「' + it.n + '」');
return;
}
const cur = customList();
const t = cur.find(x => x.id === id);
if (!t) { toast('这件家具已经不在了'); return; }
t.n = res.n;
t.img = res.img;
t.act = res.acts[0];
t.acts = res.acts;
t.cost = res.cost;
saveCustom(cur);
renderScene(); updHud();
toast('已保存「' + res.n + '」');
});
}
/* 私人五改：家具编辑竖屏小窗——像商品详情那样一整张可上下滑动的表单：
   上传图片 → 名字 → 兑换价格 → 互动（可以多加几个不同的）。取消有改动会先问一句。 */
let _furnSheet = null;
function furnOverlayHTML() {
return '<div class="r-edit-ov" id="room-furn-edit-ov" hidden>' +
'<div class="r-edit-card" role="dialog" aria-label="家具编辑">' +
'<div class="r-edit-head"><span class="r-edit-ttl" id="rfu-title">编辑家具</span>' +
'<button type="button" class="r-edit-x" id="rfu-close" aria-label="关闭">✕</button></div>' +
'<div class="r-edit-body" id="rfu-body">' +
'<div class="r-edit-sec"><div class="r-edit-lab">图片</div>' +
'<div class="r-edit-imgrow"><div class="r-edit-thumb" id="rfu-thumb"></div>' +
'<div class="r-edit-imgbtns"><button type="button" class="r-edit-mini" id="rfu-pick">上传图片</button>' +
'<span class="r-edit-hint">方形或透明底的小图最好看</span></div></div></div>' +
'<div class="r-edit-sec"><div class="r-edit-lab">名字</div>' +
'<input type="text" class="r-edit-in" id="rfu-name" placeholder="给这件家具起个名字" maxlength="24"></div>' +
'<div class="r-edit-sec"><div class="r-edit-lab">兑换价格 <span class="r-edit-hint">🏠 小屋点数，0 就是免费</span></div>' +
'<input type="number" class="r-edit-in" id="rfu-cost" min="0" step="1" inputmode="numeric" placeholder="0"></div>' +
'<div class="r-edit-sec"><div class="r-edit-lab">互动 <span class="r-edit-hint">点这件家具时，TA 可以做的事（可以加几个）</span></div>' +
'<div class="r-edit-acts" id="rfu-acts"></div>' +
'<button type="button" class="r-edit-mini r-edit-add" id="rfu-add">＋ 再加一个互动</button></div>' +
'<button type="button" class="r-edit-del" id="rfu-del">删掉这件家具</button>' +
'<div class="r-edit-pad"></div>' +
'</div>' +
'<div class="r-edit-foot"><button type="button" class="r-edit-btn ghost" id="rfu-cancel">取消</button>' +
'<button type="button" class="r-edit-btn main" id="rfu-save">保存</button></div>' +
'</div></div>';
}
function furnSheetClose() {
const st = _furnSheet;
if (!st) return;
_furnSheet = null;
try {
  const ae = document.activeElement;
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA') && st.ov.contains(ae)) ae.blur();
  if (window.mochiKbDismiss) window.mochiKbDismiss();
} catch (e) {}
try { st.ov.hidden = true; } catch (e) {}
try { st.ov.parentNode && st.ov.parentNode.removeChild(st.ov); } catch (e) {}
}
function customFurnSheet(it, done) {
if (_furnSheet) furnSheetClose();
const host = roomOverlayHost();
if (!document.getElementById('room-furn-edit-ov')) {
const box = document.createElement('div');
box.innerHTML = furnOverlayHTML();
host.appendChild(box.firstChild);
}
const $ = (i) => document.getElementById(i);
const ov = $('room-furn-edit-ov');
const isNew = !it || !it.id;
const st = {
ov: ov, done: done, dirty: false, img: (it && it.img) || '',
acts: (it ? actsOf(it) : ['看看']).slice(),
id: (it && it.id) || ''
};
_furnSheet = st;
$('rfu-title').textContent = isNew ? '新的自定义家具' : '编辑家具';
$('rfu-name').value = (it && it.n) || '';
$('rfu-cost').value = String((it && typeof it.cost === 'number') ? it.cost : 0);
$('rfu-del').hidden = isNew;
const thumb = $('rfu-thumb');
thumb.style.backgroundImage = st.img ? ('url("' + st.img.replace(/"/g, '&quot;') + '")') : '';
thumb.textContent = st.img ? '' : '还没图';
function renderActs() {
const box = $('rfu-acts');
box.innerHTML = '';
st.acts.forEach((a, i) => {
const row = document.createElement('div');
row.className = 'r-edit-actrow';
const n = document.createElement('span');
n.className = 'r-edit-actno';
n.textContent = String(i + 1);
const inp = document.createElement('input');
inp.type = 'text';
inp.className = 'r-edit-in';
inp.maxLength = 24;
inp.value = a;
inp.placeholder = i === 0 ? '看看' : '再加一个互动';
inp.addEventListener('input', function () { st.acts[i] = inp.value; st.dirty = true; });
inp.addEventListener('change', function () { st.acts[i] = inp.value; st.dirty = true; });
inp.addEventListener('blur', function () { st.acts[i] = inp.value; st.dirty = true; });
const rm = document.createElement('button');
rm.type = 'button';
rm.className = 'r-edit-actdel';
rm.textContent = '✕';
rm.setAttribute('aria-label', '删掉这个互动');
rm.hidden = st.acts.length <= 1;
rm.addEventListener('click', function () {
st.acts.splice(i, 1);
if (!st.acts.length) st.acts.push('');
st.dirty = true;
renderActs();
/* 重绘会丢掉焦点：把焦点还给被删位置的上一条（或第一条），免得手机键盘直接收起 */
const ins = $('rfu-acts').querySelectorAll('input');
const back = ins[Math.min(i, ins.length - 1)];
if (back) { try { back.focus(); } catch (e) {} }
});
row.appendChild(n); row.appendChild(inp); row.appendChild(rm);
box.appendChild(row);
});
$('rfu-add').hidden = st.acts.length >= 12;
}
renderActs();
$('rfu-name').oninput = function () { st.dirty = true; };
$('rfu-cost').oninput = function () { st.dirty = true; };
$('rfu-pick').onclick = function () {
window.mochiFilePick({
id: 'room-furn-sheet-pick', accept: 'image/*', onFiles: function (files) {
const f = files && files[0];
if (!f) return;
if (!window.mochiImgCompressTo) { toast('图片处理组件没加载上，请刷新页面再试'); return; }
window.mochiImgCompressTo(f, { maxSide: 256, quality: 0.85, tag: 'room-furn' }).then(function (out) {
if (!out) { toast('这张图处理不了，换一张试试'); return; }
if (!_furnSheet || _furnSheet !== st) return;
st.img = out; st.dirty = true;
thumb.style.backgroundImage = 'url("' + out.replace(/"/g, '&quot;') + '")';
thumb.textContent = '';
});
}
});
};
$('rfu-add').onclick = function () {
if (st.acts.length >= 12) { toast('最多 12 个互动'); return; }
st.acts.push('');
st.dirty = true;
renderActs();
const ins = $('rfu-acts').querySelectorAll('input');
if (ins.length) { try { ins[ins.length - 1].focus(); } catch (e) {} }
};
$('rfu-del').onclick = function () {
furnSheetClose();
window.openModal('删掉「' + ((it && it.n) || '这件家具') + '」？', '', function (vv) {
if (vv !== '__yes') return;
done({ del: true });
}, { noInput: true, pillSubmit: true, hideOk: true, warn: true, staticText: '场上摆着的和仓库里的也会一起消失。', pills: [{ label: '删掉', value: '__yes' }, { label: '先留着', value: '__no' }] });
};
function tryClose() {
if (!st.dirty) { furnSheetClose(); return; }
window.openModal('还没保存', '', function (v) {
if (v === '__discard') { furnSheetClose(); }
}, { noInput: true, pillSubmit: true, hideOk: true, staticText: '上面的改动会丢掉。', pills: [{ label: '丢掉改动', value: '__discard' }, { label: '继续编辑', value: '__stay' }] });
}
$('rfu-close').onclick = tryClose;
$('rfu-cancel').onclick = tryClose;
$('rfu-save').onclick = function () {
const name = String($('rfu-name').value || '').trim() || '自定义家具';
const acts = st.acts.map(x => String(x == null ? '' : x).trim()).filter(Boolean).slice(0, 12);
if (!acts.length) { toast('至少留一个互动'); return; }
const cn = parseInt($('rfu-cost').value, 10);
const cost = (isFinite(cn) && cn >= 0) ? cn : 0;
if (!st.img) { toast('先传一张图片'); return; }
st.dirty = false;
furnSheetClose();
done({ n: name, img: st.img, acts: acts, cost: cost });
};
ov.hidden = false;
try { $('rfu-body').scrollTop = 0; } catch (e) {}
if (isNew) setTimeout(function () { try { $('rfu-name').focus(); } catch (e) {} }, 120);
}
/* 商品编辑：内置 + 自定义都能改价格 / 互动（内置也可改名字） */
function itemEditPick() {
const ids = Object.keys(CAT).concat(customList().map(c => c.id));
const pills = ids.map(t => {
const c = C2(t);
return c ? { label: (c.img ? '🖼️ ' : (c.e + ' ')) + c.n + ' · ' + c.cost + '🏠 · ' + (c.acts || [c.act]).join(' / '), value: t } : null;
}).filter(Boolean);
window.openModal('调整价格 / 互动', '', function (v) {
if (!v) return;
setTimeout(function () { itemEditForm(v); }, 0);
}, { noInput: true, pills: pills, staticText: '改完马上生效，商店和已摆的家具都用新值。' });
}
function itemEditForm(t) {
const base = C(t);
if (!base) return;
const ov = catOver();
const o = ov[t] || {};
const curActs = (o.acts && o.acts.length) ? o.acts : (base.acts || actsOf(base));
window.openModal((base.img ? '🖼️ ' : (base.e + ' ')) + (o.n || base.n), '', function (v) {
if (v === 'cost') {
window.openModal('兑换价格（🏠）', String(o.cost != null ? o.cost : base.cost), function (a) {
const n = parseInt(a, 10);
if (!isFinite(n) || n < 0) { toast('要填一个不小于 0 的数字'); return; }
o.cost = n; ov[t] = o; saveCatOver(ov);
toast('价格已改成 ' + n + '🏠');
}, { inputmode: 'numeric' });
} else if (v === 'act') {
const pills = curActs.map((a, i) => ({ label: a || ('互动 ' + (i + 1)), value: 'ed:' + i }));
pills.push({ label: '＋ 再加一个互动', value: 'add' });
if (curActs.length > 1) pills.push({ label: '✕ 减掉最后一个', value: 'pop' });
pills.push({ label: '恢复默认互动', value: 'def' });
window.openModal('点它的时候 TA 会做什么', '', function (a) {
if (!a) return;
const ov2 = catOver();
const o2 = ov2[t] || {};
if (a === 'add') {
if (curActs.length >= 12) { toast('最多 12 个互动'); return; }
setTimeout(function () { askActIn(t, curActs, curActs.length); }, 0);
return;
}
if (a === 'pop') {
const next = curActs.slice(0, -1);
o2.acts = next; ov2[t] = o2; saveCatOver(ov2);
toast('互动减到 ' + next.length + ' 个');
setTimeout(function () { itemEditForm(t); }, 0);
return;
}
if (a === 'def') {
delete o2.acts; delete o2.act;
if (!Object.keys(o2).length) delete ov2[t]; else ov2[t] = o2;
saveCatOver(ov2);
toast('互动已恢复默认');
setTimeout(function () { itemEditForm(t); }, 0);
return;
}
const idx = parseInt(a.slice(3), 10);
window.openModal('改这个互动', curActs[idx] || '', function (txt) {
const s = String(txt == null ? '' : txt).trim();
if (!s) return;
const ov3 = catOver();
const o3 = ov3[t] || {};
const next = curActs.slice(); next[idx] = s;
o3.acts = next; o3.act = next[0]; ov3[t] = o3; saveCatOver(ov3);
toast('互动已改成「' + s + '」');
}, {});
}, { noInput: true, pills: pills, staticText: '现在有 ' + curActs.length + ' 个互动：' + curActs.join(' / ') });
} else if (v === 'name' && base.custom) {
setTimeout(function () { customEditMenu(t); }, 0);
} else if (v === 'reset') {
delete ov[t]; saveCatOver(ov);
toast('已恢复默认');
}
}, {
noInput: true, pillSubmit: true, hideOk: true,
staticText: '现在：价格 ' + (o.cost != null ? o.cost : base.cost) + '🏠 · 互动「' + curActs.join(' / ') + '」',
pills: [
{ label: '改价格', value: 'cost' },
{ label: '改互动（' + curActs.length + ' 个）', value: 'act' }
].concat(base.custom ? [{ label: '改名 / 换图 / 删除', value: 'name' }] : [])
.concat((o.cost != null || o.act || o.acts) ? [{ label: '恢复默认', value: 'reset' }] : [])
});
}
/* 追加互动时直接问一句文案（列表已经先加了一个空位） */
function askActIn(t, cur, idx) {
window.openModal('再加一个互动', '', function (txt) {
const s = String(txt == null ? '' : txt).trim();
if (!s) return;
const ov = catOver();
const o = ov[t] || {};
const arr = cur.slice(); arr[idx] = s;
const clean = arr.filter(Boolean).slice(0, 12);
o.acts = clean; o.act = clean[0]; ov[t] = o; saveCatOver(ov);
toast('已加上互动「' + s + '」');
}, { staticText: '比如「摸摸它」「打开看看」，点这件家具时 TA 就会做这件事。' });
}
function infoModal() {
const c = comfortSum();
const invN = Object.keys(d.inv).reduce((a, k) => a + (d.inv[k] || 0), 0);
const nextTxt = d.lv >= 5 ? '已经是 Lv.5 了。这里就是你们的样子。' : '下一级：舒适度达到 ' + LV_TH[d.lv] + '（现在 ' + c + '）';
window.openModal('我们的小屋', '', function () {}, {
noInput: true, okText: '好',
staticText:
'🏡 小屋 Lv.' + d.lv + ' · 舒适度 ' + '★'.repeat(starsOf()) + '☆'.repeat(5 - starsOf()) + '\n' +
'摆着的家具：' + placedCount() + '/' + capOf() + ' · 仓库还有 ' + invN + ' 件\n' +
'小屋点数：🏠 ' + d.pts + '\n' +
nextTxt + '\n\n' +
'场景上方可调亮度（50%–150%），按联系人桌面保存；手动模式不再叠加夜间压暗，点「自动」恢复昼夜和灯光。只影响屋内画面，不改变设备屏幕亮度。\n\n' +
'这不是一个任务游戏。想进来的时候进来看看，\n摸摸植物，看看窗外，坐一会儿，就好了。'
});
}
let drag = null, suppressClick = false;
function cellFromPoint(cx, cy) {
const r = floorEl.getBoundingClientRect();
const x = Math.max(0, Math.min(COLS - 1, Math.floor((cx - r.left) / r.width * COLS)));
const y = Math.max(0, Math.min(ROWS - 1, Math.floor((cy - r.top) / r.height * ROWS)));
return { x: x, y: y };
}
function clearTgt() {
Array.prototype.forEach.call(floorEl.querySelectorAll('.r-cell.tgt'), c => c.classList.remove('tgt'));
}
function bindDrag() {
if (!floorEl) return;
floorEl.addEventListener('pointerdown', function (e) {
if (mode || page.hidden || document.hidden) return;
const fu = e.target.closest('.r-furn'); if (!fu) return;
const inst = d.fx.find(z => z.i === fu.dataset.i); if (!inst) return;
drag = {
i: inst.i, el: fu, inst: inst, sx: e.clientX, sy: e.clientY, on: false,
timer: setTimeout(function () {
if (!drag) return;
drag.on = true; suppressClick = true;
drag.el.classList.add('dragging');
sceneEl.classList.add('placing');
refreshCells(); vib(18);
}, 330)
};
try { fu.setPointerCapture(e.pointerId); } catch (err) {}
});
floorEl.addEventListener('pointermove', function (e) {
if (!drag) return;
if (!drag.on) {
if (Math.abs(e.clientX - drag.sx) > 10 || Math.abs(e.clientY - drag.sy) > 10) { clearTimeout(drag.timer); drag = null; }
return;
}
e.preventDefault();
const c = cellFromPoint(e.clientX, e.clientY);
drag.el.style.left = ((c.x + 0.5) * 100 / COLS) + '%';
drag.el.style.top = ((c.y + 0.86) * 100 / ROWS) + '%';
clearTgt();
if (!itemAt(c.x, c.y)) {
const cell = floorEl.querySelector('.r-cell[data-x="' + c.x + '"][data-y="' + c.y + '"]');
if (cell) cell.classList.add('tgt');
}
});
floorEl.addEventListener('pointerup', up);
floorEl.addEventListener('pointercancel', up);
function up(e) {
if (!drag) return;
clearTimeout(drag.timer);
const wasOn = drag.on;
if (!wasOn) { drag = null; return; }
const inst = drag.inst;
const c = cellFromPoint(e.clientX, e.clientY);
const same = c.x === inst.x && c.y === inst.y;
if (!same && !itemAt(c.x, c.y)) {
inst.x = c.x; inst.y = c.y;
save(); checkLevel(); updHud(); vib(20);
}
drag.el.classList.remove('dragging');
if (!mode) sceneEl.classList.remove('placing');
clearTgt();
drag = null;
renderScene(); // 内部 refreshCells 会按当前状态清掉格子高亮
setTimeout(function () { suppressClick = false; }, 400);
}
}
function bindScene() {
sceneEl.addEventListener('click', function (e) {
if (suppressClick) { suppressClick = false; return; } // 拖拽刚结束：吃掉这次误触 click
if (e.target.closest('#room-banner-cancel')) { banner(null); return; }
if (mode) {
const cell = e.target.closest('.r-cell');
if (!cell) return;
const x = Number(cell.dataset.x), y = Number(cell.dataset.y);
if (itemAt(x, y)) { toast('这一格已经有家具了'); return; }
if (mode.kind === 'place') {
const t = mode.t;
d.fx.push({ i: 'f' + Date.now().toString(36) + ri(100, 999), t: t, x: x, y: y, r: 0 });
d.inv[t]--;
checkLevel(); save(); renderScene(); updHud(); vib(15);
if ((d.inv[t] || 0) > 0) banner('放置：' + CAT[t].e + ' ' + CAT[t].n + '（还剩 ' + d.inv[t] + ' 件）');
else banner(null);
} else if (mode.kind === 'move') {
const inst = d.fx.find(z => z.i === mode.i);
if (inst) { inst.x = x; inst.y = y; save(); renderScene(); vib(12); }
banner(null);
}
return;
}
const fu = e.target.closest('.r-furn');
if (fu) {
const inst = d.fx.find(z => z.i === fu.dataset.i);
if (inst) furnMenu(inst);
return;
}
if (e.target.closest('#room-ta')) { taMenu(); return; }
if (e.target.closest('.r-window')) {
const w = weather();
const wl = sayLine('窗边', 'windowl');
if (wl) bubble((isNight() ? '🌙 ' : w.i + ' ') + wl, BUB_SHORT);
if (isNight()) setTimeout(() => { if (!bubbleEl.hidden) return; bubble(sayLine('夜晚', 'night')); }, BUB_AGAIN);
gainPts(1, 'n'); vib(10);
return;
}
if (e.target.closest('.r-door')) {
bubble('门外是走廊。今天先待在屋里吧。');
return;
}
});
$id('room-banner-cancel').addEventListener('click', function (e) { e.stopPropagation(); banner(null); });
}
function dailyVisit() {
const s = S(), tk = todayKey();
if (s.get('room-gift-day') === tk) return;
s.set('room-gift-day', tk);
d.day = tk;
d.pts += 3;
const poolCands = Object.keys(CAT).filter(t => C(t) && C(t).lv <= d.lv && ownedCount(t) < MAX_PER_TYPE)
.sort((a, b) => CAT[a].cost - CAT[b].cost);
if (poolCands.length) {
const gift = poolCands[ri(0, Math.min(poolCands.length - 1, 3))];
d.inv[gift] = (d.inv[gift] || 0) + 1;
setTimeout(() => toast('🎁 今日获得：' + C(gift).e + ' ' + C(gift).n + '（＋3🏠）'), 500);
}
save();
}
function updRoomBar() {
const nm = $id('room-name');
if (nm) nm.textContent = (d && d.name) || '房间';
}
function afterRoomLoad() {
banner(null);
updRoomBar();
if (!taHereNow()) { if (stepTimer) { clearInterval(stepTimer); stepTimer = null; } }
if (taHereNow() && Date.now() >= (d.ta.nextAt || 0)) pickAction();
updHud(); buildCells(); renderScene();
}
function switchRoom(dir) {
if (rooms.length <= 1) { toast('就这一间房。长按房间名可以新建'); return; }
save();
const i = rooms.indexOf(curId);
curId = rooms[(i + dir + rooms.length) % rooms.length];
try { S().set('room-cur', curId); } catch (e) {}
loadCur();
afterRoomLoad();
vib(12);
toast('来到「' + (d.name || '房间') + '」');
}
function roomManageMenu() {
window.openModal((d.name || '房间') + ' · 房间管理', '', function (v) {
if (v === 'rename') {
window.openModal('给这间房起名字', d.name || '', function (nm) {
const name = String(nm == null ? '' : nm).trim();
if (!name) return;
d.name = name; save(); updRoomBar();
toast('这间房现在叫「' + name + '」');
}, {});
} else if (v === 'add') {
if (rooms.length >= 10) { toast('最多 10 间房啦'); return; }
window.openModal('新房间叫什么', '', function (nm) {
const name = String(nm == null ? '' : nm).trim() || ('房间' + (rooms.length + 1));
const id = 'r' + Date.now().toString(36);
const nd = fresh();
nd.name = name;
try { S().set(rKey(id), JSON.stringify(nd)); } catch (e) {}
rooms.push(id); saveRooms();
toast('已建好「' + name + '」，用左右箭头过去看看');
}, { staticText: '新房间是空房，家具要重新攒或兑换。' });
} else if (v === 'del') {
if (rooms.length <= 1) { toast('至少要留一间房'); return; }
window.openModal('拆掉「' + (d.name || '房间') + '」？', '', function (vv) {
if (vv !== '__yes') return;
const gone = curId;
rooms = rooms.filter(x => x !== gone);
try { S().remove(rKey(gone)); } catch (e) {}
saveRooms();
curId = taRoomId();
loadCur(); afterRoomLoad();
toast('已拆掉，现在在「' + (d.name || '房间') + '」');
}, { noInput: true, pillSubmit: true, hideOk: true, warn: true, staticText: '这间房里的家具和装扮都会一起消失（自定义家具库和商品改动不受影响）。', pills: [{ label: '拆掉', value: '__yes' }, { label: '先留着', value: '__no' }] });
}
}, {
noInput: true, pillSubmit: true, hideOk: true,
staticText: '改名字、建新房间（最多 10 间）、或拆掉这一间。左右箭头切房间。',
pills: [
{ label: '给这间房改名', value: 'rename' },
{ label: '新建一间房', value: 'add' },
{ label: '拆掉这一间房', value: 'del', danger: true }
]
});
}
function openRoom() {
migrateRooms();
/* 默认进 TA 所在的房间 */
curId = taRoomId();
loadCur();
banner(null); // v3.23.x：进屋先清残留横幅/放置态——上次异常离场（未走 closeRoom）会留下点不动的「取消」标
document.querySelectorAll('.page').forEach(p => p.hidden = true);
page.hidden = false;
dailyVisit();
afterRoomLoad();
sceneEl.classList.remove('room-in'); void sceneEl.offsetWidth; sceneEl.classList.add('room-in');
setTimeout(() => { if (!page.hidden && taHereNow()) bubble(isNight() ? sayLine('夜晚', 'night') : sayLine('进门', 'enter')); }, 700);
}
function closeRoom(toChat) {
save();
banner(null);
page.hidden = true;
document.querySelectorAll('.page').forEach(p => p.hidden = true);
const target = toChat ? document.getElementById('page-chat') : document.getElementById('page-phone');
if (target) target.hidden = false;
}
function guardEditing() {
try {
return Array.prototype.some.call(document.querySelectorAll('.app-grid'), g => g.classList.contains('editing'));
} catch (e) { return false; }
}
function boot() {
migrateRooms();
curId = taRoomId();
loadCur();
const back = $id('room-back');
if (back) back.addEventListener('click', function (e) {
e.stopPropagation();
closeRoom(window.__roomFrom === 'chat');
window.__roomFrom = '';
});
const icon = document.querySelector('.app[data-app="room"]');
if (icon) icon.addEventListener('click', function (e) {
if (guardEditing()) return; // 装修模式：不拦截，让 .app-grid 监听器弹「更换图标」菜单
e.stopPropagation();
window.__roomFrom = '';
openRoom();
});
const moreBtn = $id('more-room');
if (moreBtn) moreBtn.addEventListener('click', function (e) {
e.stopPropagation();
const mp = $id('chat-more-panel');
if (mp) mp.hidden = true;
window.__roomFrom = 'chat';
openRoom();
});
const bInv = $id('room-btn-inv'); if (bInv) bInv.addEventListener('click', function (e) { e.stopPropagation(); invMenu(); });
const bSense = $id('room-btn-sense'); if (bSense) bSense.addEventListener('click', function (e) { e.stopPropagation(); sense(); });
const bDeco = $id('room-btn-deco'); if (bDeco) bDeco.addEventListener('click', function (e) { e.stopPropagation(); decoFlow(); });
const bInfo = $id('room-info-btn'); if (bInfo) bInfo.addEventListener('click', function (e) { e.stopPropagation(); infoModal(); });
const bPrev = $id('room-prev'); if (bPrev) bPrev.addEventListener('click', function (e) { e.stopPropagation(); switchRoom(-1); });
const bNext = $id('room-next'); if (bNext) bNext.addEventListener('click', function (e) { e.stopPropagation(); switchRoom(1); });
const bName = $id('room-name'); if (bName) bName.addEventListener('click', function (e) { e.stopPropagation(); roomManageMenu(); });
try {
const nmEl = $id('room-name');
if (nmEl && window.ccBindLongPress) window.ccBindLongPress(nmEl, function () { roomManageMenu(); }, 520);
const taElLp = $id('room-ta');
if (taElLp && window.ccBindLongPress) window.ccBindLongPress(taElLp, function () { taSpriteMenu(); }, 520);
} catch (e) {}
document.addEventListener('click', function (e) {
if (page.hidden) return;
if (e.target && e.target.closest && e.target.closest('#room-banner-cancel')) { try { banner(null); } catch (er) {} }
}, true);
bindBrightness();
bindScene();
bindDrag();
document.addEventListener('mochi-restore-done', function () {
if (!page.hidden) applyBrightness();
});
setInterval(tick, 1000);
document.addEventListener('visibilitychange', function () {
if (!document.hidden && !page.hidden) { renderScene(); renderStatus(); }
});
document.addEventListener('contact-switched', function () {
migrateRooms();
curId = taRoomId();
loadCur();
if (!page.hidden) { afterRoomLoad(); }
});
window.openRoom = openRoom;
window.closeRoom = closeRoom;
window.__roomState = function () { return JSON.parse(JSON.stringify(d)); };
/* 私人五改：GitHub 云储存还原后让房间重新读一遍 */
window.mochiRoomReload = function () {
try { _cusMapCache.t = 0; _cusMapCache.m = null; } catch (e) {}
try { migrateRooms(); curId = taRoomId(); loadCur(); if (!page.hidden) afterRoomLoad(); } catch (e) {}
};
booted = true;
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
})();
if (window.__mochiLoaded) window.__mochiLoaded.push("room.js");
} catch (__e) { if (window.__mochiErrLoaded) window.__mochiErrLoaded.push("room.js"); try { console.error("[JS] room.js", __e && __e.message || __e); } catch (x) {} if (window.__jsErrors) window.__jsErrors.push("[room.js] " + String(__e && __e.message || __e)); } })();