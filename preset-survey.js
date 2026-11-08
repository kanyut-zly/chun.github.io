/* =====================================================================
 * 私人三改 · 预设问卷
 * ---------------------------------------------------------------------
 * 「问问TA」可以直接挑现成的问卷发出去，不用每次手打。
 *   入口①：聊天 → 更多 → 工具 → 问问TA →「预设问卷」（在「批量设置问卷」右边）
 *   入口②：字卡库 →「预设问卷」大分类（在「其他互动字卡」下面）
 *
 * 私人四改：页面先显示 3 个分类，点进去才是这一类的问题列表（长列表可上下滑，问题多了小窗也能滑）。
 * 三个分类：文字回复 / 单选题 / 多选题。一条一条加（一行问题 + 一行一个答案）。
 * 点按编辑、长按删除 / 移动。每次只能加一个问题，加完可以马上加下一条。
 * 时间限制 = TA 想几秒再答（每个问题可以单独设置，1~60 秒，默认 3 秒），存在 'preset-surveys-delay'。
 *
 * 存储（按桌面隔离）：当前联系人 store 里的 'preset-surveys'
 *   [{ t: 'text'|'single'|'multi', q: '问题', o: ['答案1', '答案2', ...] }]
 * ===================================================================== */
(function () {
  'use strict';
  if (window.__presetSurveyLoaded) return;
  window.__presetSurveyLoaded = true;

  var KEY = 'preset-surveys';
  var TYPE_NAME = { text: '文字回复', single: '单选题', multi: '多选题' };
  function st() { try { return window.activeStore ? window.activeStore() : null; } catch (e) { return null; } }
  function read() {
    try {
      var s = st();
      var v = JSON.parse((s && s.get(KEY)) || '[]');
      if (!Array.isArray(v)) return [];
      return v.filter(function (x) { return x && typeof x.q === 'string' && x.q; }).map(function (x) {
        return {
          t: (x.t === 'single' || x.t === 'multi') ? x.t : 'text',
          q: String(x.q),
          o: Array.isArray(x.o) ? x.o.map(String).filter(Boolean) : []
        };
      });
    } catch (e) { return []; }
  }
  function write(list) {
    try {
      var s = st();
      if (s) s.set(KEY, JSON.stringify(list));
      return true;
    } catch (e) { return false; }
  }
  function countAll() { return read().length; }
  /* 私人四改：每个问题「TA 想几秒再答」——按问题文字存，改名就重新算默认值 */
  var DELAY_KEY = 'preset-surveys-delay';
  var DEFAULT_DELAY = 3;
  function readDelay() {
    try { var v = JSON.parse((st() && st().get(DELAY_KEY)) || '{}'); return (v && typeof v === 'object') ? v : {}; } catch (e) { return {}; }
  }
  function getDelay(q) {
    var m = readDelay();
    var n = parseInt(m[q], 10);
    return (isFinite(n) && n >= 1 && n <= 60) ? n : DEFAULT_DELAY;
  }
  function setDelay(q, sec) {
    try {
      var m = readDelay();
      var n = Math.max(1, Math.min(60, parseInt(sec, 10) || DEFAULT_DELAY));
      m[q] = n;
      var s = st(); if (s) s.set(DELAY_KEY, JSON.stringify(m));
    } catch (e) {}
  }
  window.presetSurveyDelay = getDelay;

  /* ---------- 列表页 ---------- */
  var curType = 'text';
  var psView = 'cats'; /* 私人四改：cats = 先看 3 个分类；list = 某一类的问卷 */
  function pageEl() { return document.getElementById('page-preset-survey'); }
  function showList() {
    var list = read().filter(function (x) { return x.t === curType; });
    var box = document.getElementById('ps-list');
    if (!box) return;
    /* 私人四改：分类入口页 */
    if (psView === 'cats') { syncPsChrome(true); renderCats(box); return; }
    syncPsChrome(false);
    box.innerHTML = '';
    var backRow = document.createElement('div');
    backRow.className = 'ps-cat-back';
    backRow.innerHTML = '<span class="ps-cat-back-ico">‹</span> 返回分类';
    backRow.addEventListener('click', function () { psView = 'cats'; showList(); });
    box.appendChild(backRow);
    if (!list.length) {
      var empty = document.createElement('div');
      empty.style.cssText = 'padding:26px 10px;text-align:center;font-size:13px;color:var(--muted,#999);line-height:1.8';
      empty.textContent = '「' + TYPE_NAME[curType] + '」还没有问卷\n点下面「＋ 添加问卷」加第一条';
      empty.style.whiteSpace = 'pre-line';
      box.appendChild(empty);
    }
    /* 显示时要拿到在全部列表里的真实下标 */
    var all = read();
    var idxs = [];
    all.forEach(function (x, i) { if (x.t === curType) idxs.push(i); });
    list.forEach(function (x, k) {
      var realIdx = idxs[k];
      var card = document.createElement('div');
      card.className = 'chat-item glass ps-row';
      card.style.cssText = 'margin-bottom:8px;cursor:pointer';
      var ci = document.createElement('div');
      ci.className = 'ci';
      var n = document.createElement('div');
      n.className = 'n';
      n.textContent = x.q;
      var m = document.createElement('div');
      m.className = 'm';
      m.textContent = (x.t === 'text' ? 'TA 用字卡作答' : (x.o.length + ' 个选项：' + x.o.join(' / ')));
      m.textContent += ' · ' + getDelay(x.q) + ' 秒';
      m.style.whiteSpace = 'nowrap';
      m.style.overflow = 'hidden';
      m.style.textOverflow = 'ellipsis';
      ci.appendChild(n);
      ci.appendChild(m);
      card.appendChild(ci);
      var t = document.createElement('div');
      t.className = 't';
      t.textContent = x.o.length ? String(x.o.length) : '—';
      card.appendChild(t);
      /* 点按编辑 */
      card.addEventListener('click', function () {
        if (card.__psLong) { card.__psLong = false; return; }
        editItem(realIdx, function () { showList(); });
      });
      bindLong(card, function () {
        card.__psLong = true;
        longPressMenu(realIdx, function () { showList(); });
      });
      /* 私人四改：右侧可以直接改「几秒后答」 */
      var dl = document.createElement('input');
      dl.type = 'number';
      dl.className = 'ps-delay';
      dl.min = '1'; dl.max = '60'; dl.step = '1';
      dl.value = String(getDelay(x.q));
      dl.title = 'TA 想要几秒再答';
      dl.addEventListener('click', function (e) { e.stopPropagation(); });
      dl.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      dl.addEventListener('change', function (e) {
        e.stopPropagation();
        var v = Math.max(1, Math.min(60, parseInt(dl.value, 10) || DEFAULT_DELAY));
        dl.value = String(v);
        setDelay(x.q, v);
        try { window.toast && window.toast('这条改成 ' + v + ' 秒后答'); } catch (e2) {}
        showList();
      });
      card.appendChild(dl);
      box.appendChild(card);
    });
  }

  /* 私人四改：分类页时藏掉顶部 tab 和提示，点进分类再显示 */
  function syncPsChrome(catsView) {
    var tabs = document.getElementById('ps-tabs');
    if (tabs) tabs.style.display = catsView ? 'none' : '';
    var pg = pageEl();
    var hint = pg ? pg.querySelector('.sm-set-hint') : null;
    if (hint) hint.style.display = catsView ? 'none' : '';
  }

  /* 私人四改：点进页面先看到的 3 个分类 */
  function renderCats(box) {
    box.innerHTML = '';
    var all = read();
    var tips = {
      text: 'TA 用字卡回一句话',
      single: '给几个选项让 TA 挑一个',
      multi: '让 TA 可以多选几个'
    };
    ['text', 'single', 'multi'].forEach(function (t) {
      var n = all.filter(function (x) { return x.t === t; }).length;
      var row = document.createElement('div');
      row.className = 'chat-item glass ps-cat';
      row.innerHTML = '<div class="ci"><div class="n">' + TYPE_NAME[t] + '</div>' +
        '<div class="m">' + tips[t] + '</div></div>' +
        '<div class="t">' + n + '</div><div class="ps-cat-arrow">›</div>';
      row.addEventListener('click', function () {
        curType = t;
        psView = 'list';
        document.querySelectorAll('#ps-tabs .cc-tab').forEach(function (b) { b.classList.toggle('sel', b.dataset.pstype === t); });
        showList();
      });
      box.appendChild(row);
    });
  }

  function bindLong(el, cb) {
    if (window.ccBindLongPress) { window.ccBindLongPress(el, cb, 500); return; }
    var timer = null, sx = 0, sy = 0;
    el.addEventListener('pointerdown', function (e) {
      sx = e.clientX; sy = e.clientY;
      timer = setTimeout(function () { timer = null; try { if (navigator.vibrate) navigator.vibrate(15); } catch (e2) {} cb(); }, 500);
    });
    el.addEventListener('pointermove', function (e) {
      if (timer && (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10)) { clearTimeout(timer); timer = null; }
    });
    el.addEventListener('pointerup', function () { if (timer) { clearTimeout(timer); timer = null; } });
    el.addEventListener('pointercancel', function () { if (timer) { clearTimeout(timer); timer = null; } });
  }

  function longPressMenu(idx, done) {
    var all = read();
    var it = all[idx];
    if (!it) return;
    var sameType = all.filter(function (x) { return x.t === it.t; });
    var posInType = sameType.indexOf(it);
    var items = [
      { label: '编辑这条', fn: function () { editItem(idx, done); } },
      { label: '改回答时间（现在是 ' + getDelay(it.q) + ' 秒）', fn: function () { editDelay(it, done); } },
      { label: '上移', fn: function () { moveInType(idx, -1); done(); } },
      { label: '下移', fn: function () { moveInType(idx, 1); done(); } }
    ];
    if (posInType > 0) items = [items[0], items[1], items[2]];
    else items = [items[0], items[2]];
    items.push({ label: '删除这条', danger: true, fn: function () {
      window.openModal('删除这条问卷？', '', function (v) {
        if (v !== '__yes') return;
        var a2 = read();
        a2.splice(idx, 1);
        write(a2);
        try { window.toast && window.toast('已删除'); } catch (e) {}
        done();
      }, { noInput: true, pillSubmit: true, hideOk: true, warn: true, staticText: '「' + it.q + '」', pills: [{ label: '删除', value: '__yes' }, { label: '取消', value: '__no' }] });
    } });
    if (window.ccShowActionSheet) window.ccShowActionSheet('「' + it.q + '」', items, '点按卡片也能编辑。');
    else {
      /* 没有通用操作面板时退回到弹窗式菜单 */
      if (window.openModal) window.openModal('管理「' + it.q + '」', '', function (v) {
        var pick = items[parseInt(v, 10)];
        if (pick && pick.fn) pick.fn();
      }, { noInput: true, pillSubmit: true, hideOk: true, staticText: '长按菜单', pills: items.map(function (x, i) { return { label: x.label, value: String(i) }; }) });
    }
  }

  /* 私人四改：单独改「TA 几秒后答」——1~60 秒随便调 */
  function editDelay(it, done) {
    if (!it || !window.openModal) return;
    var cur = getDelay(it.q);
    window.openModal('「' + it.q + '」TA 几秒后答？', String(cur), function (v) {
      var n = parseInt(v, 10);
      if (!isFinite(n)) { try { window.toast && window.toast('请输入 1~60 的数字'); } catch (e) {} return; }
      n = Math.max(1, Math.min(60, n));
      setDelay(it.q, n);
      try { window.toast && window.toast('已改成 ' + n + ' 秒后答'); } catch (e) {}
      if (done) done(); else refreshList();
    }, { staticText: '想让 TA 想多久再回答？1~60 秒，随便改。', inputmode: 'numeric' });
  }

  function moveInType(idx, dir) {    var all = read();
    var it = all[idx];
    if (!it) return;
    var sameIdx = [];
    all.forEach(function (x, i) { if (x.t === it.t) sameIdx.push(i); });
    var pos = sameIdx.indexOf(idx);
    var target = sameIdx[pos + dir];
    if (target === undefined) { try { window.toast && window.toast('已经到头了'); } catch (e) {} return; }
    all[idx] = all[target];
    all[target] = it;
    write(all);
    try { window.toast && window.toast('已' + (dir < 0 ? '上' : '下') + '移'); } catch (e) {}
  }

  /* ---------- 添加 / 编辑：一行问题 + 一行一个答案 ---------- */
  function editItem(idx, done) {
    var all = read();
    var it = idx >= 0 ? all[idx] : null;
    var type = it ? it.t : curType;
    var isChoice = type === 'single' || type === 'multi';
    var init = it ? (it.q + '\n' + (it.o || []).join('\n')) : '';
    if (!window.openModal) return;
    window.openModal(it ? '编辑问卷' : ('添加' + TYPE_NAME[type] + '问卷'), init, function (txt) {
      var lines = String(txt == null ? '' : txt).split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
      if (!lines.length) { try { window.toast && window.toast('问题不能为空'); } catch (e) {} return; }
      var q = lines.shift();
      var opts = lines;
      if (isChoice && opts.length < 2) { try { window.toast && window.toast(TYPE_NAME[type] + '至少要 2 个答案（一行一个）'); } catch (e) {} return; }
      var item = { t: type, q: q, o: isChoice ? opts : [] };
      var a2 = read();
      if (idx >= 0 && a2[idx]) a2[idx] = item; else a2.push(item);
      if (!write(a2)) { try { window.toast && window.toast('保存失败'); } catch (e) {} return; }
      try { window.toast && window.toast(it ? '已保存' : '已加入「' + TYPE_NAME[type] + '」'); } catch (e) {}
      if (done) done(); else { showList(); renderCount(); }
      refreshList();
    }, {
      big: true,
      textarea: true,
      textareaRows: 8,
      textareaPlaceholder: isChoice
        ? '第一行是问题，下面一行一个答案，例如：\n今晚想吃什么？\n火锅\n烧烤\n寿司'
        : '第一行是问题，TA 会用字卡作答，例如：\n今天过得怎么样？',
      staticText: isChoice
        ? '第一行写问题，下面每行一个答案（至少 2 个）。'
        : '第一行写问题就行，TA 会用字卡作答。',
      okText: '确定加入'
    });
  }

  function addOne() {
    editItem(-1, function () { showList(); renderCount(); });
  }

  /* ---------- 给「问问TA」用：直接发出借用的数据格式 ---------- */
  function toAsk(it) {
    if (!it) return null;
    var dl = getDelay(it.q);
    if (it.t === 'text') return { text: it.q, type: 'text', options: null, delay: dl };
    var opts = (it.o || []).map(function (o) {
      /* 选项写「选项~回应」时带自定义回应，和「批量设置问卷」同一套写法 */
      var i = o.indexOf('~');
      return i >= 0 ? { t: o.slice(0, i).trim(), reply: o.slice(i + 1).trim() } : { t: o, reply: '' };
    });
    return { text: it.q, type: it.t, options: opts, delay: dl };
  }
  window.presetSurveyToAsk = function (it) { return toAsk(it); };

  /* ---------- 挑一条发出去（聊天里点「预设问卷」） ----------
     私人四改：先选 3 个分类 → 点分类 → 分类里的问题列表放小窗（可上下滑） */
  function pickToSend() {
    var all = read();
    if (!all.length) {
      if (window.openModal) window.openModal('预设问卷还是空的', '', function (v) {
        if (v === '__add') { openPagePage(); }
      }, {
        noInput: true, pillSubmit: true, hideOk: true,
        staticText: '先去「字卡库 → 预设问卷」里加几条吧，加好后这里点一下就能直接发。',
        pills: [{ label: '去添加', value: '__add' }, { label: '知道了', value: '__no' }]
      });
      else { try { window.toast && window.toast('还没有预设问卷'); } catch (e) {} }
      return;
    }
    /* 第一层：三个分类 */
    var pills = ['text', 'single', 'multi'].map(function (t) {
      var n = all.filter(function (x) { return x.t === t; }).length;
      return { label: TYPE_NAME[t] + '（' + n + '）', value: t, disabled: !n };
    });
    if (window.openModal) window.openModal('预设问卷 · 先选分类', '', function (v) {
      if (!v || v === '__no') return;
      pickInType(v);
    }, {
      noInput: true, pillSubmit: true, hideOk: true,
      staticText: '点一个分类，再看这一类里的问题。',
      pills: pills
    });
  }

  /* 第二层：分类里的问题——小窗里列表可上下滑 */
  function pickInType(t) {
    var list = read().filter(function (x) { return x.t === t; });
    if (!list.length) { try { window.toast && window.toast('这一类还没有问卷'); } catch (e) {} return; }
    if (!window.openModal) return;
    /* 用分类里的短标题做 pill，能放很多条；超过 30 条也只渲染这 30 条，多的靠滚动看 */
    var pills = list.map(function (x, i) { return { label: x.q, value: 'p' + i }; });
    window.openModal(TYPE_NAME[t] + ' · 选一条发给 TA', '', function (v) {
      var m = /^p(\d+)$/.exec(String(v || ''));
      if (!m) return;
      var it = list[parseInt(m[1], 10)];
      if (it) sendOne(it);
    }, {
      noInput: true, pillSubmit: true, hideOk: true,
      staticText: '共 ' + list.length + ' 条，点一条直接问 TA（TA 会想 ' + getDelay(list[0].q) + ' 秒左右再答）。',
      pills: pills,
      scrollPills: true
    });
  }

  function sendOne(it) {
    var a = toAsk(it);
    if (!a) return;
    if (window.mochiPresetSend) { try { window.mochiPresetSend(a); return; } catch (e) {} }
    /* 兜底：走聊天自己的「问问TA」发送通道 */
    try {
      var input = document.getElementById('chat-ask-input');
      var panel = document.getElementById('chat-ask-panel');
      if (!input || !panel) { try { window.toast && window.toast('请回到聊天页再试'); } catch (e) {} return; }
      input.value = a.text;
      var typeBtn = document.querySelector('#chat-ask-panel .chat-ask-type[data-atype="' + a.type + '"]');
      if (typeBtn) typeBtn.click();
      else {
        var typeSel = document.getElementById('chat-ask-type');
        if (typeSel) { typeSel.value = a.type; typeSel.dispatchEvent(new Event('change', { bubbles: true })); }
      }
      if (a.options && a.options.length) {
        var opts = document.getElementById('chat-ask-opts');
        if (opts) {
          opts.value = a.options.map(function (o) { return o.reply ? (o.t + '~' + o.reply) : o.t; }).join('\n');
          opts.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
      setTimeout(function () {
        var ok = document.getElementById('chat-ask-ok');
        if (ok) ok.click();
      }, 60);
    } catch (e) { try { window.toast && window.toast('发送失败'); } catch (e2) {} }
  }

  /* ---------- 页面开关 ---------- */
  function openPagePage() {
    var pg = pageEl();
    if (!pg) return;
    document.querySelectorAll('.page').forEach(function (p) { p.hidden = true; });
    pg.hidden = false;
    showList();
    renderCount();
  }
  function renderCount() {
    var el = document.getElementById('ps-lib-count');
    if (el) el.textContent = String(countAll());
    refreshList();
  }
  function refreshList() { try { if (pageEl() && !pageEl().hidden) showList(); } catch (e) {} }

  function bindPage() {
    var pg = pageEl();
    if (!pg || pg.dataset.psBound) return;
    pg.dataset.psBound = '1';
    var back = document.getElementById('ps-back');
    if (back) back.addEventListener('click', function () {
      /* 私人四改：在某一类的列表里，返回＝先回分类页 */
      if (psView === 'list') { psView = 'cats'; showList(); return; }
      document.querySelectorAll('.page').forEach(function (p) { p.hidden = true; });
      var home = document.getElementById('page-chatcard');
      if (home) home.hidden = false;
    });
    var tabs = document.getElementById('ps-tabs');
    if (tabs) tabs.addEventListener('click', function (e) {
      var t = e.target.closest('.cc-tab');
      if (!t || !t.dataset.pstype) return;
      curType = t.dataset.pstype;
      psView = 'list';
      tabs.querySelectorAll('.cc-tab').forEach(function (b) { b.classList.toggle('sel', b === t); });
      showList();
    });
    var add = document.getElementById('ps-add');
    if (add) add.addEventListener('click', addOne);
  }

  function bindEntry() {
    var li = document.getElementById('li-preset-survey');
    if (li && !li.dataset.psBound) {
      li.dataset.psBound = '1';
      li.addEventListener('click', openPagePage);
    }
    bindPage();
    document.querySelectorAll('#ps-tabs .cc-tab').forEach(function (b) {
      b.classList.toggle('sel', b.dataset.pstype === curType);
    });
    renderCount();
  }

  window.openPresetPick = pickToSend;
  window.openPresetPage = openPagePage;

  function boot() {
    bindEntry();
    [300, 1200, 3000].forEach(function (ms) { setTimeout(bindEntry, ms); });
    try { document.addEventListener('contact-switched', function () { setTimeout(function () { renderCount(); refreshList(); }, 200); }); } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
