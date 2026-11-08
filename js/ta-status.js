/* 私人二改：聊天顶部「每日想你」入口 + TA 个人状态
   - 紫色小爱心 💜：= 设置 → 通用 里的「每日想你」卡片，点一下弹出、关掉，随时都能看
   - TA 状态：每个联系人各存各的；顶部只显示 TA 自己选的状态
   - 点状态 → 看到 TA 会随机用的所有状态（只展示、点不动），唯一能点的是「✏️ 自定义」
       自定义加进去的状态是「追加」，之后 TA 换状态时会随机选到它
   - 长按状态标签 → 编辑列表（改文字 / 换图标 / 排序 / 删除 / 恢复默认）
   - 自动随机：不设固定间隔，TA 自己不定时地换（可在列表里关掉）
   - 状态列表完全独立自管，不再和字卡库联动
   - 不改聊天抽卡、回复原有机制
*/
(function () {
  'use strict';
  var KEY = 'ta-status';          // 当前状态（每个联系人各存各的）
  var LIST_KEY = 'ta-status-list'; // 状态列表（每个联系人各存各的）
  var RAND_KEY = 'ta-status-rand'; // 随机开关 + 进度
  var SEP = '\u0001';              // 状态列表内部存储的分隔符（图标 + 文字）

  var DEFAULTS = [
    { k: '在线', e: '🟢' },
    { k: '离线中', e: '⚫' },
    { k: '工作中', e: '💼' },
    { k: '摸鱼中', e: '🐟' },
    { k: '吃饭中', e: '🍚' },
    { k: '定义中', e: '💭' }
  ];

  function store() {
    try { return window.activeStore ? window.activeStore() : null; } catch (e) { return null; }
  }
  function toast(t) {
    try {
      var el = document.getElementById('cc-toast');
      if (!el) { el = document.createElement('div'); el.id = 'cc-toast'; document.body.appendChild(el); }
      el.textContent = t;
      el.className = 'cc-toast show';
      clearTimeout(el.__taStatusTimer);
      el.__taStatusTimer = setTimeout(function () { el.className = 'cc-toast'; }, 1800);
    } catch (e) {}
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------- 当前状态 ---------- */
  function read() {
    var s = store();
    var def = { label: '在线', emoji: '🟢', ts: 0 };
    if (!s) return def;
    try {
      var v = JSON.parse(s.get(KEY) || 'null');
      if (v && typeof v === 'object' && v.label) {
        return { label: String(v.label), emoji: String(v.emoji || '🟢'), ts: Number(v.ts) || 0 };
      }
    } catch (e) {}
    return def;
  }
  function write(v) {
    var s = store();
    var label = String((v && v.label) || '在线').slice(0, 16);
    var emoji = String((v && v.emoji) || '🟢');
    if (s) {
      try { s.set(KEY, JSON.stringify({ label: label, emoji: emoji, ts: Date.now() })); } catch (e) {}
    }
    paint({ label: label, emoji: emoji });
  }

  /* ---------- 状态列表（独立存储，不再读写字卡库） ---------- */
  function parseItem(raw) {
    var s = String(raw == null ? '' : raw);
    var i = s.indexOf(SEP);
    if (i >= 0) return { e: s.slice(0, i) || '💬', k: s.slice(i + 1) };
    return { e: '💬', k: s };
  }
  function toRaw(it) { return String(it.e || '💬') + SEP + String(it.k || ''); }

  function list() {
    var s = store();
    if (s) {
      try {
        var v = JSON.parse(s.get(LIST_KEY) || 'null');
        if (Array.isArray(v) && v.length) {
          var out = [];
          v.forEach(function (raw) {
            var it = parseItem(raw);
            if (it && it.k) out.push(it);
          });
          if (out.length) return out;
        }
      } catch (e) {}
    }
    return DEFAULTS.map(function (x) { return { k: x.k, e: x.e }; });
  }
  function saveList(items) {
    var s = store();
    if (!s) return false;
    var arr = (items || []).filter(function (x) { return x && x.k; }).map(toRaw);
    try { s.set(LIST_KEY, JSON.stringify(arr)); return true; } catch (e) { return false; }
  }
  /* 追加一个状态（已存在就只换图标，不重复加） */
  function appendStatus(k, e) {
    var name = String(k == null ? '' : k).trim().slice(0, 16);
    if (!name) return { ok: false, why: 'empty' };
    var items = list();
    var hit = items.filter(function (x) { return x.k === name; })[0];
    if (hit) {
      hit.e = String(e || hit.e || '💬');
      saveList(items);
      return { ok: true, dup: true, item: hit };
    }
    var it = { k: name, e: String(e || '💬') };
    items.push(it);
    saveList(items);
    return { ok: true, dup: false, item: it };
  }

  /* ---------- 随机更换（1–8 小时一次，像头像昵称） ---------- */
  function randCfg() {
    var s = store();
    var def = { en: 1, last: 0, next: 0 };
    if (!s) return def;
    try {
      var v = JSON.parse(s.get(RAND_KEY) || 'null');
      if (v && typeof v === 'object') {
        return {
          en: v.en === 0 ? 0 : 1,
          last: Number(v.last) || 0,
          next: Number(v.next) || 0
        };
      }
    } catch (e) {}
    return def;
  }
  function randSet(o) {
    var s = store();
    if (!s) return;
    try { s.set(RAND_KEY, JSON.stringify({ en: o.en ? 1 : 0, last: Number(o.last) || 0, next: Number(o.next) || 0 })); } catch (e) {}
  }
  function nightQuiet() {
    try {
      if (typeof window.avNightQuiet === 'function') return !!window.avNightQuiet();
    } catch (e) {}
    try {
      if (window.cfgn && window.cfgn(null, 'dnd-en', 0) === 1) {
        var h = new Date().getHours();
        return h >= 22 || h < 7;
      }
    } catch (e) {}
    return false;
  }
  function pickDifferent(items, cur) {
    if (!items.length) return null;
    var pool = items.filter(function (x) { return x.k !== cur.label; });
    if (!pool.length) pool = items; // 只有一个状态时也照换（等于不变）
    return pool[Math.floor(Math.random() * pool.length)];
  }
  /* 私人二改：不设固定间隔 —— 每次换完就重新随机「下一次等多久」，
     短则一两分钟、长则半个多小时，就像真的在想事情一样一直变 */
  function nextGapMs() {
    var r = Math.random();
    if (r < 0.35) return (1 + Math.random() * 4) * 60000;        // 35%：1–5 分钟
    if (r < 0.75) return (5 + Math.random() * 10) * 60000;       // 40%：5–15 分钟
    if (r < 0.95) return (15 + Math.random() * 15) * 60000;      // 20%：15–30 分钟
    return (30 + Math.random() * 30) * 60000;                    // 5%：30–60 分钟
  }
  function randTick() {
    try {
      var cfg = randCfg();
      if (!cfg.en) return;
      /* 「自定义」要求：让 TA 自己随机换，夜里也照换（只是不打扰睡觉的就关掉打扰） */
      var now = Date.now();
      var last = cfg.last;
      var next = cfg.next;
      if (last > now || last < 0) { last = 0; next = 0; }
      if (!last) {
        randSet({ en: 1, last: now, next: nextGapMs() / 36e5 });
        return;
      }
      if ((now - last) < next * 36e5) return;
      var items = list();
      var cur = read();
      var it = pickDifferent(items, cur);
      if (!it) return;
      randSet({ en: 1, last: now, next: nextGapMs() / 36e5 });
      write({ label: it.k, emoji: it.e });
      try {
        if (window.taChimeShow) window.taChimeShow('（改了改状态：' + it.e + ' ' + it.k + '）', { miss: null });
      } catch (e) {}
    } catch (e) {}
  }
  /* 立刻随机换一次（测试 / 手动用） */
  function randNow() {
    var items = list();
    var cur = read();
    var it = pickDifferent(items, cur);
    if (!it) return false;
    write({ label: it.k, emoji: it.e });
    randSet({ en: randCfg().en, last: Date.now(), next: nextGapMs() / 36e5 });
    return true;
  }
  try { setInterval(randTick, 20000); } catch (e) {}
  setTimeout(randTick, 8000);

  /* ---------- 顶部小标签 ---------- */
  function paint(v) {
    var el = document.getElementById('ch-ta-status');
    if (!el) return;
    v = v || read();
    el.innerHTML = '<i>' + esc(v.emoji) + '</i><span>' + esc(v.label) + '</span>';
    el.title = 'TA 现在的状态（点一下看 TA 会用到的状态 · 长按管理）';
  }

  /* ---------- 点：只给「自定义」；其他状态只展示、不能点 ----------
     私人二改：点开看到两列 TA 自己会随机选的状态（灰的、点不动），
     唯一能点的就是「✏️ 自定义」——加进去的状态就成了 TA 的候选，让 TA 自己随机选 */
  function pickStatus() {
    if (!window.openModal) return;
    var items = list();
    var pills = items.map(function (x) {
      /* 只展示：灰掉、点不动；TA 自己会随机换到它们 */
      return { label: x.e + ' ' + x.k, value: '__shown', disabled: true };
    });
    pills.push({ label: '＋ 自定义…', value: '__custom' });
    window.openModal('TA 的个人状态', '', function (val) {
      if (val == null || val === '' || val === '__shown') return;
      if (val === '__custom') setTimeout(function () { addCustomDialog(); }, 80);
    }, {
      noInput: true, pillSubmit: true, hideOk: true, pillGrid: true, pills: pills,
      staticText: '上面这些是 TA 自己会换着用的状态，点不动——TA 会自己随机选一个。\n想加新的就点「＋ 自定义…」，加进去之后 TA 也会随机用到它。\n长按顶部这个状态标签，可以改文字 / 换图标 / 删除。'
    });
  }

  /* ---------- 自定义：追加一个新状态（不替换现有的） ---------- */
  function addCustomDialog(presetEmoji) {
    if (!window.openModal) return;
    window.openModal('加一个新状态', '', function (txt) {
      var t = String(txt == null ? '' : txt).trim();
      if (!t) { toast('状态不能为空'); return; }
      if (t.length > 16) t = t.slice(0, 16);
      var exist = list().filter(function (x) { return x.k === t; })[0];
      if (exist) {
        toast('已经有「' + t + '」了，没重复加');
        return;
      }
      setTimeout(function () {
        window.openModal('给「' + t + '」选个图标', '', function (icon) {
          var r = appendStatus(t, String(icon || presetEmoji || '💬'));
          if (!r.ok) { toast('添加失败'); return; }
          toast('已新增「' + r.item.e + ' ' + r.item.k + '」，TA 之后会自己选到它');
        }, {
          noInput: true, pillSubmit: true,
          staticText: '新状态会「追加」到列表里，不会覆盖现有的；加入后 TA 换状态时就会随机选到它。',
          pills: ['💼', '📚', '🍚', '☕', '🐟', '😴', '⏳', '💭', '🚶', '🟢', '⚫', '🎧', '💻', '📝', '🏃', '🚇', '🧘', '🎮', '🌙', '❤️'].map(function (e) { return { label: e, value: e }; })
        });
      }, 80);
    }, { placeholder: '例如：在发呆 / 在开会 / 在回家的路上', maxlength: 16 });
  }

  /* ---------- 长按：管理状态列表 ---------- */
  function editOne(items, i) {
    var cur = items[i];
    if (!cur) return;
    var pills = [
      { label: '改文字', value: 'text' },
      { label: '换图标', value: 'icon' },
      { label: '上移', value: 'up' },
      { label: '下移', value: 'down' },
      { label: '删除', value: 'del' }
    ];
    window.openModal('管理「' + cur.e + ' ' + cur.k + '」', '', function (v) {
      var arr = items.slice();
      if (v === 'text') {
        setTimeout(function () {
          window.openModal('改状态文字', cur.k, function (txt) {
            var t = String(txt == null ? '' : txt).trim();
            if (!t) { toast('状态不能为空'); return; }
            t = t.slice(0, 16);
            if (arr.some(function (x, xi) { return xi !== i && x.k === t; })) { toast('已经有这个状态了'); return; }
            var old = arr[i].k;
            arr[i] = { k: t, e: arr[i].e };
            if (!saveList(arr)) { toast('保存失败'); return; }
            var c = read();
            if (c.label === old) write({ label: t, emoji: arr[i].e });
            toast('已改成「' + t + '」');
          }, { maxlength: 16 });
        }, 80);
        return;
      }
      if (v === 'icon') {
        setTimeout(function () { pickIcon(arr, i); }, 80);
        return;
      }
      if (v === 'up' || v === 'down') {
        var j = v === 'up' ? i - 1 : i + 1;
        if (j < 0 || j >= arr.length) { toast('已经到头了'); return; }
        var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
        if (saveList(arr)) toast('已调整顺序'); else toast('保存失败');
        return;
      }
      if (v === 'del') {
        setTimeout(function () {
          window.openModal('删除「' + cur.k + '」？', '', function () {
            var a2 = items.filter(function (x, xi) { return xi !== i; });
            if (!saveList(a2)) { toast('保存失败'); return; }
            if (read().label === cur.k) {
              var first = a2[0];
              if (first) write({ label: first.k, emoji: first.e });
            }
            toast('已删除「' + cur.k + '」');
          }, { noInput: true, pillSubmit: true, warn: true, pills: [{ label: '删除', value: 'ok' }], staticText: '只从状态列表里去掉，不影响聊天。' });
        }, 80);
      }
    }, { noInput: true, pillSubmit: true, staticText: '现在显示为「' + cur.e + ' ' + cur.k + '」', pills: pills });
  }
  function pickIcon(items, i) {
    var cur = items[i];
    var ICONS = ['💼', '📚', '🍚', '☕', '🐟', '😴', '⏳', '💭', '🚶', '🟢', '⚫', '🎧', '💻', '📝', '🏃', '🚇', '🛏', '🧘', '🎮', '📱', '🌙', '☀️', '❤️', '✈️'];
    var pills = ICONS.map(function (e) { return { label: e, value: e }; });
    window.openModal('给「' + cur.k + '」选个图标', '', function (val) {
      if (!val) return;
      var arr = items.slice();
      arr[i] = { k: cur.k, e: String(val) };
      if (!saveList(arr)) { toast('保存失败'); return; }
      var c = read();
      if (c.label === cur.k) write({ label: cur.k, emoji: String(val) });
      toast('图标已换成 ' + val);
    }, { noInput: true, pillSubmit: true, staticText: '点一个图标直接换成它。', pills: pills });
  }
  function editList() {
    if (!window.openModal) return;
    var items = list();
    var pills = items.map(function (x, i) { return { label: x.e + ' ' + x.k, value: String(i) }; });
    pills.push({ label: '＋ 添加状态', value: '__add' });
    pills.push({ label: '🔀 现在随机换一个', value: '__rand' });
    pills.push({ label: (randCfg().en ? '⏹ 关闭自动随机' : '▶ 开启自动随机'), value: '__randen' });
    pills.push({ label: '↺ 恢复默认', value: '__reset' });
    window.openModal('编辑个人状态列表', '', function (v) {
      if (v === '__add') { setTimeout(function () { addCustomDialog(); }, 80); return; }
      if (v === '__rand') { if (randNow()) toast('已随机换了一个状态'); return; }
      if (v === '__randen') {
        var cfg = randCfg();
        randSet({ en: cfg.en ? 0 : 1, last: Date.now(), next: nextGapMs() / 36e5 });
        toast(cfg.en ? '已关闭自动随机换状态' : '已开启自动随机换状态（TA 自己不定时地换）');
        return;
      }
      if (v === '__reset') {
        setTimeout(function () {
          window.openModal('恢复默认状态列表？', '', function () {
            var defs = DEFAULTS.map(function (x) { return { k: x.k, e: x.e }; });
            if (!saveList(defs)) { toast('保存失败'); return; }
            write({ label: defs[0].k, emoji: defs[0].e });
            toast('已恢复默认状态');
          }, { noInput: true, pillSubmit: true, warn: true, pills: [{ label: '恢复', value: 'ok' }], staticText: '会把状态列表换回：在线 / 离线中 / 工作中 / 摸鱼中 / 吃饭中 / 定义中。' });
        }, 80);
        return;
      }
      var i = parseInt(v, 10);
      if (isFinite(i) && items[i]) setTimeout(function () { editOne(items, i); }, 80);
    }, {
      noInput: true, pillSubmit: true, pills: pills,
      staticText: '点一个状态可以改文字 / 换图标 / 删除，或调整顺序。自动随机＝TA 自己不定时地换一个（没有固定间隔）。'
    });
  }

  /* ---------- 心情 ---------- */
  function openMood() {
    /* 私人二改：紫色小爱心 = 「每日想你」卡片（设置 → 通用 里那张），点一下弹出、关掉，随时都能看 */
    try {
      if (typeof window.mochiShowDaily === 'function') { window.mochiShowDaily(); return; }
    } catch (e) {}
    try {
      if (window.openChatMoodPage) { window.openChatMoodPage(); return; }
    } catch (e) {}
    var page = document.getElementById('page-chat');
    if (page) page.hidden = true;
    var mp = document.getElementById('page-mood-diary') || document.getElementById('page-ta-mood');
    if (mp) {
      mp.hidden = false;
      mp.dataset.backToChat = '1';
      try { if (window.moodDiaryEnter) window.moodDiaryEnter(); } catch (e) {}
      return;
    }
    toast('每日心情还在加载，稍后再点一次');
  }

  /* ---------- 挂到聊天顶部 ---------- */
  function bindLongPress(el, cb, ms) {
    if (window.ccBindLongPress) { window.ccBindLongPress(el, cb, ms); return; }
    var timer = null, sx = 0, sy = 0, held = false;
    el.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      sx = e.clientX; sy = e.clientY; held = false;
      timer = setTimeout(function () { timer = null; held = true; try { if (navigator.vibrate) navigator.vibrate(15); } catch (err) {} el.classList.add('cc-long-holding'); }, ms || 450);
    });
    el.addEventListener('pointermove', function (e) {
      if (timer && (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10)) { clearTimeout(timer); timer = null; }
    });
    el.addEventListener('pointercancel', function () { if (timer) { clearTimeout(timer); timer = null; } held = false; el.classList.remove('cc-long-holding'); });
    el.addEventListener('pointerup', function () {
      if (timer) { clearTimeout(timer); timer = null; }
      el.classList.remove('cc-long-holding');
      if (!held) return;
      held = false;
      el.__ccSuppressClick = true;
      setTimeout(function () { el.__ccSuppressClick = false; }, 800);
      try { cb(); } catch (e) {}
    });
    el.addEventListener('click', function (e) {
      if (el.__ccSuppressClick) { e.preventDefault(); e.stopPropagation(); el.__ccSuppressClick = false; }
    }, true);
  }

  function build() {
    var head = document.querySelector('#page-chat > .chat-head');
    var name = document.getElementById('chat-partner-name');
    if (!head || !name) return false;
    if (!document.getElementById('chat-mood-btn')) {
      var mood = document.createElement('button');
      mood.type = 'button';
      mood.id = 'chat-mood-btn';
      mood.className = 'ch-mood-btn';
      mood.title = '每日想你 · 点一下看看';
      mood.textContent = '💜';
      mood.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openMood();
      });
      if (name.parentNode === head) head.insertBefore(mood, name.nextSibling);
      else head.appendChild(mood);
    }
    if (!document.getElementById('ch-ta-status')) {
      var st = document.createElement('button');
      st.type = 'button';
      st.id = 'ch-ta-status';
      st.className = 'ch-ta-status';
      st.addEventListener('click', function (e) {
        if (st.__ccSuppressClick) return;
        e.preventDefault();
        e.stopPropagation();
        pickStatus();
      });
      bindLongPress(st, function () { editList(); });
      var moodEl = document.getElementById('chat-mood-btn');
      if (moodEl && moodEl.parentNode === head) head.insertBefore(st, moodEl.nextSibling);
      else head.appendChild(st);
    }
    paint();
    return true;
  }
  var tries = 0;
  function init() {
    if (build()) {
      try {
        var page = document.getElementById('page-chat');
        if (page && !page.__taStatusObs) {
          page.__taStatusObs = true;
          new MutationObserver(function () {
            if (!page.hidden) { setTimeout(build, 30); }
          }).observe(page, { attributes: true, attributeFilter: ['hidden'] });
        }
        var nm = document.getElementById('chat-partner-name');
        if (nm && !nm.__taStatusObs) {
          nm.__taStatusObs = true;
          new MutationObserver(function () { paint(); }).observe(nm, { childList: true, characterData: true, subtree: true });
        }
        var body = document.getElementById('chat-body');
        if (body && !body.__taStatusObs) {
          body.__taStatusObs = true;
          new MutationObserver(function () {
            if (!page || page.hidden) paint();
          }).observe(body, { childList: true });
        }
      } catch (e) {}
      return;
    }
    if (tries++ < 60) setTimeout(init, 150);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.taStatusGet = read;
  window.taStatusSet = write;
  window.taStatusList = list;
  window.taStatusEditList = editList;
  window.taStatusAdd = addCustomDialog;
  window.taStatusRandNow = randNow;
  window.taStatusRandTick = randTick;
  window.taStatusRefresh = function () { paint(); };
  window.taStatusPick = pickStatus;
  window.openChatMood = openMood;
})();
