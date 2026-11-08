/* =====================================================================
 * 私人三改 · 桌面（App 中心）
 * ---------------------------------------------------------------------
 * 1) 原先「设置 → 通用」里的「开启群聊」开关位置，换成「桌面」入口，
 *    点进去是一个 App 中心：聊天室 / 组 / 信箱 / 朋友圈 / 主页 / 日历 /
 *    纪念 / 占卜 / 收藏 / 同频 / 此间 / 寻踪 / 伸手 / 聊天统计 / 提问记录 /
 *    梦角档案 / 我的档案 / 心意集市 / 心意柜 / 小游戏 / 花园 … 全部列出来，
 *    每个都有「开 / 关」开关。
 * 2) 关掉 ≠ 删除：数据原样留在本地，只是桌面上不再显示该图标，
 *    而且**不能使用**——点了会提示「TA 把 XX 关掉了」。
 *    开关是「桌面级」的（全局），所以你关掉之后 TA（对面）也用不了。
 * 3) 聊天「更多 → 小游戏」里的每个小游戏也都在这里开关：
 *    关掉后在更多面板里就不出现（不显示、不能用）。
 * 4) 申请弹窗（由 mochi-request.js 负责投递）里「同意/拒绝」走的也是这里的存储。
 *
 * 存储：xy-home-v2 → 'desk-app-off'，JSON 数组，存**被关掉**的 id。
 *       没记录 = 默认开启（与原来行为一致，升级不影响任何人）。
 * ===================================================================== */
(function () {
  'use strict';
  if (window.__deskAppsLoaded) return;
  window.__deskAppsLoaded = true;

  var GNS = 'xy-home-v2';
  var OFF_KEY = 'desk-app-off';
  var REQ_OFF_KEY = 'desk-app-req-off'; // 单独记「TA 主动申请关掉」的（申请弹窗开关用）
  var app = null;
  try { app = window.xyStore ? window.xyStore(GNS) : null; } catch (e) { app = null; }

  /* ---------- 存储 ---------- */
  function readArr(key) {
    try {
      var raw = app ? app.get(key) : null;
      if (raw === null || raw === undefined) {
        try { raw = localStorage.getItem(GNS + ':' + key); } catch (e2) {}
      }
      var v = JSON.parse(raw || '[]');
      return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string'; }) : [];
    } catch (e) { return []; }
  }
  function writeArr(key, arr) {
    var uniq = [];
    (arr || []).forEach(function (x) { if (uniq.indexOf(x) < 0) uniq.push(x); });
    var json = JSON.stringify(uniq);
    try { if (app) app.set(key, json); } catch (e) {}
    try { localStorage.setItem(GNS + ':' + key, json); } catch (e2) {}
    return uniq;
  }

  var offList = readArr(OFF_KEY);
  var offSet = {};
  offList.forEach(function (x) { offSet[x] = 1; });

  /* ---------- 清单 ---------- */
  // sec：分组（聊天 / 社交 / 陪伴 / 记录 / 生活 / 其他 / 小游戏）
  // w：桌面组件 id（有就顺便控制桌面图标的显隐）
  // wait：桌面图标是 JS 后注入的，晚一点再补处理
  var APPS = [
    { id: 'chat', name: '聊天', ico: '💬', sec: '聊天', w: 'app-chat', page: 'page-chat', core: 1 },
    { id: 'group-chat', name: '群聊', ico: '👥', sec: '聊天', w: 'app-group-chat', page: 'page-group-chat', core: 1 },
    { id: 'mail', name: '信箱', ico: '✉️', sec: '社交', w: 'app-mail', page: 'page-mail' },
    { id: 'feed', name: '朋友圈', ico: '🌐', sec: '社交', w: 'app-feed', page: 'page-feed' },
    { id: 'home', name: '主页', ico: '🏠', sec: '社交', w: 'app-home', page: 'page-home' },
    { id: 'market', name: '心意集市', ico: '🎁', sec: '社交', w: 'app-market', wait: 1 },
    { id: 'giftbox', name: '心意柜', ico: '💝', sec: '社交', w: 'app-giftbox', wait: 1 },
    { id: 'calendar', name: '日历', ico: '📅', sec: '记录', w: 'app-calendar', page: 'page-calendar' },
    { id: 'memory', name: '纪念', ico: '🕯️', sec: '记录', w: 'app-memory', page: 'page-memory' },
    { id: 'divination', name: '占卜', ico: '🔮', sec: '陪伴', w: 'app-divination', page: 'page-divination' },
    { id: 'note', name: '收藏', ico: '🔖', sec: '记录', w: 'app-note', page: 'page-favs' },
    { id: 'tongpin', name: '同频', ico: '📶', sec: '陪伴', w: 'app-tongpin', page: 'page-tongpin', wait: 1 },
    { id: 'cjian', name: '此间', ico: '⏳', sec: '陪伴', w: 'app-cjian', page: 'page-cjian' },
    { id: 'checkin', name: '寻踪', ico: '👣', sec: '陪伴', w: 'app-checkin', page: 'page-checkin' },
    { id: 'shenshou', name: '伸手', ico: '🤲', sec: '陪伴', w: 'app-shenshou', page: 'page-shenshou', wait: 1 },
    { id: 'stats', name: '聊天统计', ico: '📊', sec: '记录', w: 'app-stats', page: 'page-stats' },
    { id: 'interact', name: '提问记录', ico: '❓', sec: '记录', w: 'app-interact', page: 'page-interact' },
    { id: 'memo-arc', name: '梦角档案', ico: '📒', sec: '记录', w: 'app-memo-arc', page: 'page-memo-arc' },
    { id: 'my-arc', name: '我的档案', ico: '📗', sec: '记录', w: 'app-my-arc', page: 'page-my-arc' },
    { id: 'garden', name: '花园', ico: '🌱', sec: '生活', w: 'app-garden', page: 'page-garden' },
    { id: 'water', name: '喝水提醒', ico: '💧', sec: '生活', w: 'app-water', page: 'page-water', wait: 1 },
    { id: 'eat', name: '吃什么', ico: '🍚', sec: '生活', w: 'app-eat', page: 'page-eat', wait: 1 },
    { id: 'piggy', name: '存钱罐', ico: '🐷', sec: '生活', w: 'app-piggy', page: 'page-piggy', wait: 1 },
    { id: 'pomo', name: '番茄钟', ico: '🍅', sec: '生活', w: 'app-pomo', page: 'page-pomo', wait: 1 },
    { id: 'music', name: '音乐', ico: '🎵', sec: '其他', w: 'app-music', page: 'page-music' },
    { id: 'sleep', name: '助眠', ico: '🌙', sec: '其他', w: 'app-sleep', page: 'page-sleep' },
    { id: 'period', name: '经期记录', ico: '🌸', sec: '其他', w: 'app-period', page: 'page-period' },
    { id: 'accounting', name: '记账', ico: '🧾', sec: '其他', w: 'app-accounting', page: 'page-accounting' },
    { id: 'room', name: '房间', ico: '🏡', sec: '其他', w: 'app-room', page: 'page-room' },
    { id: 'memo', name: '备忘录', ico: '📝', sec: '其他', w: 'app-memo', wait: 1 },
    { id: 'arcade', name: '游乐室', ico: '🕹️', sec: '小游戏', page: 'page-arcade' }
  ];
  var GAMES = [
    { id: 'game-rps', name: '猜拳' },
    { id: 'game-pong', name: '双人 Pong' },
    { id: 'game-snake', name: '双人贪吃蛇' },
    { id: 'game-brick', name: '打砖块' },
    { id: 'game-fish', name: '双人钓鱼' },
    { id: 'game-c4', name: '四子棋' },
    { id: 'game-ms', name: '合作扫雷' },
    { id: 'game-memory', name: '记忆翻牌' },
    { id: 'game-gomoku', name: '五子棋' },
    { id: 'game-linkup', name: '连连看' },
    { id: 'game-match3', name: '消消乐' },
    { id: 'game-auction', name: '心意币拍卖会' }
  ];
  // 有桌面组件 id 的，只要那节点在页面上就算「有桌面入口」
  var ALL = APPS.map(function (a) { return { id: a.id, name: a.name, ico: a.ico, sec: a.sec, kind: 'app' }; })
    .concat(GAMES.map(function (g) { return { id: g.id, name: g.name, ico: '🎮', sec: '小游戏', kind: 'game' }; }));
  // 可以由 TA「申请关掉」的只有 App（游戏申请关掉太吵）
  var REQ_ABLE = {};
  APPS.forEach(function (a) { if (!a.core) REQ_ABLE[a.id] = 1; });

  function appOf(id) {
    for (var i = 0; i < APPS.length; i++) if (APPS[i].id === id) return APPS[i];
    return null;
  }
  function nameOf(id) {
    for (var i = 0; i < ALL.length; i++) if (ALL[i].id === id) return ALL[i].name;
    return '这个功能';
  }

  /* ---------- 开关 ---------- */
  function isOn(id) { return !offSet[id]; }
  function isOff(id) { return !!offSet[id]; }

  function setOn(id, on, silent) {
    var was = isOn(id);
    if (on) delete offSet[id]; else offSet[id] = 1;
    var arr = [];
    for (var k in offSet) if (offSet[k]) arr.push(k);
    writeArr(OFF_KEY, arr);
    if (was !== !!on) {
      apply();
      try { document.dispatchEvent(new CustomEvent('desk-app-changed', { detail: { id: id, on: !!on } })); } catch (e) {}
      if (!silent) {
        try {
          if (window.toast) window.toast(on ? ('「' + nameOf(id) + '」已打开') : ('「' + nameOf(id) + '」已关闭：桌面暂时隐藏，数据都还在'));
        } catch (e2) {}
      }
    }
    return true;
  }

  /* ---------- 桌面上隐藏图标 ---------- */
  function nodeOf(w) {
    try { return document.querySelector('[data-desk-widget="' + w + '"]'); } catch (e) { return null; }
  }
  function ensurePool() {
    var pool = document.getElementById('desk-widget-pool');
    if (!pool) {
      pool = document.createElement('div');
      pool.id = 'desk-widget-pool';
      pool.style.display = 'none';
      document.body.appendChild(pool);
    }
    return pool;
  }
  function applyIcons() {
    APPS.forEach(function (a) {
      if (!a.w) return;
      var n = nodeOf(a.w);
      if (!n) return;
      if (isOff(a.id)) {
        /* 关掉：从桌面挪进隐藏池（跟「装修模式」同一套隐藏机制，位置随布局走） */
        if (!n.hasAttribute('data-da-hidden')) {
          try { n.setAttribute('data-da-hidden', '1'); } catch (e) {}
          try { ensurePool().appendChild(n); } catch (e2) {}
        }
      } else {
        if (n.hasAttribute('data-da-hidden')) {
          try { n.removeAttribute('data-da-hidden'); } catch (e) {}
          var w = a.w;
          setTimeout(function () {
            try {
              if (window.deskRebuild) window.deskRebuild();
              else if (window.applyDeskLayout) window.applyDeskLayout();
            } catch (e3) {}
            /* 布局里没有它的兜底：放回第一页图标区 */
            var nn = nodeOf(w);
            if (nn && !nn.closest('.page-slide') && nn.closest('#desk-widget-pool')) {
              var mainGrid = document.querySelector('.app-grid[data-app="main"]');
              if (mainGrid) mainGrid.appendChild(nn);
            }
          }, 30);
        }
      }
    });
  }

  /* ---------- 私人三改 2：长按桌面 App 换位置 ---------- */
  var ORDER_KEY = 'desk-app-order';
  function readOrder() {
    try {
      var v = JSON.parse((app ? app.get(ORDER_KEY) : null) || '[]');
      return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string'; }) : [];
    } catch (e) { return []; }
  }
  function writeOrder(arr) {
    try { if (app) app.set(ORDER_KEY, JSON.stringify(arr)); } catch (e) {}
  }
  /* 按「存的顺序」把 App 图标排回各自的父容器（只排同父级的，跨页/跨组不动） */
  function applyAppOrder() {
    try {
      var order = readOrder();
      if (!order.length) return;
      var byParent = {};
      order.forEach(function (id, i) {
        var n = document.querySelector('.app[data-app="' + id + '"]');
        if (!n || !n.parentNode) return;
        var pk = n.parentNode.__daKey || (n.parentNode.__daKey = 'p' + Math.random().toString(36).slice(2));
        (byParent[pk] = byParent[pk] || []).push({ n: n, i: i });
      });
      Object.keys(byParent).forEach(function (pk) {
        var list = byParent[pk];
        var parent = list[0].n.parentNode;
        list.sort(function (a, b) { return a.i - b.i; });
        list.forEach(function (x) { try { parent.appendChild(x.n); } catch (e) {} });
      });
    } catch (e) {}
  }
  window.deskAppOrderApply = applyAppOrder;
  function saveOrderFromDom() {
    var arr = [];
    document.querySelectorAll('.app[data-app]').forEach(function (n) {
      var id = n.getAttribute('data-app');
      if (id && arr.indexOf(id) < 0) arr.push(id);
    });
    writeOrder(arr);
  }

  function bindAppLongPress() {
    document.addEventListener('pointerdown', function (e) {
      var ic = e.target && e.target.closest ? e.target.closest('.app[data-app]') : null;
      if (!ic) return;
      if (document.getElementById('page-phone') && document.getElementById('page-phone').hidden) return;
      if (document.documentElement.classList.contains('decor-on')) return; // 装修模式另有长按逻辑
      var sx = e.clientX, sy = e.clientY, timer = 0, fired = false;
      var pid = e.pointerId;
      timer = setTimeout(function () {
        timer = 0;
        fired = true;
        try { if (navigator.vibrate) navigator.vibrate(18); } catch (e2) {}
        ic.classList.add('da-wiggle');
        appMoveMode(ic);
      }, 520);
      var cancel = function () { if (timer) { clearTimeout(timer); timer = 0; } };
      var mv = function (ev) { if (timer && (Math.abs(ev.clientX - sx) > 10 || Math.abs(ev.clientY - sy) > 10)) cancel(); };
      var up = function () { cancel(); document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up); };
      document.addEventListener('pointermove', mv);
      document.addEventListener('pointerup', up);
      document.addEventListener('pointercancel', up);
      /* 长按触发后吞掉紧随的 click，免得顺手把 App 打开了 */
      if (!ic.__daSwallow) {
        ic.__daSwallow = 1;
        ic.addEventListener('click', function (ev) {
          if (fired) { fired = false; ev.preventDefault(); ev.stopPropagation(); }
        }, true);
      }
    }, true);
  }

  /* 长按后进入「换位置」：点另一个 App 就交换，点空白退出 */
  var moveIc = null;
  function appMoveMode(ic) {
    moveIc = ic;
    var name = ic.querySelector('.app-name');
    var nm = name ? name.textContent : 'App';
    try { if (window.toast) window.toast('点另一个 App 就能和「' + nm + '」换位置；点空白处退出'); } catch (e) {}
    document.documentElement.classList.add('da-moving');
    var onTap = function (e) {
      var t = e.target.closest ? e.target.closest('.app[data-app]') : null;
      if (!t || t === moveIc) { endMove(); return; }
      if (t.parentNode !== moveIc.parentNode) {
        try { if (window.toast) window.toast('只能在同一页里换位置'); } catch (e2) {}
        return;
      }
      /* 交换 DOM 位置 */
      var p = moveIc.parentNode;
      var a = document.createComment('');
      p.insertBefore(a, moveIc);
      p.insertBefore(moveIc, t);
      p.insertBefore(t, a);
      a.remove();
      saveOrderFromDom();
      try { if (window.toast) window.toast('已换位置'); } catch (e3) {}
      endMove();
    };
    var onBg = function (e) {
      if (!moveIc) return;
      if (e.target.closest && e.target.closest('.app[data-app]')) return;
      endMove();
    };
    function endMove() {
      document.removeEventListener('click', onTap, true);
      document.removeEventListener('click', onBg, true);
      document.documentElement.classList.remove('da-moving');
      if (moveIc) moveIc.classList.remove('da-wiggle');
      moveIc = null;
    }
    /* 用微延时挂上，避免这次长按自己的 pointerup→click 直接走 onTap */
    setTimeout(function () {
      document.addEventListener('click', onTap, true);
      document.addEventListener('click', onBg, true);
    }, 60);
  }

  /* ---------- 拦截「关掉还用」 ---------- */
  function blockTap(id, el) {
    try { if (el.__daSuppress) { el.__daSuppress = false; return true; } } catch (e) {}
    try { if (window.toast) window.toast('TA 把「' + nameOf(id) + '」关掉了，你这边暂时用不了（去 设置 → 桌面 里可以打开）'); } catch (e2) {}
    try { if (el && el.dataset) el.dataset.daSuppress = '1'; } catch (e3) {}
    var ev = null;
    try { ev = window.event; } catch (e4) {}
    if (ev && ev.stopImmediatePropagation) { try { ev.stopImmediatePropagation(); ev.preventDefault(); } catch (e5) {} }
    return true;
  }
  function guardClicks() {
    /* 桌面图标 */
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var node = t.closest('.app[data-app]');
      if (!node) return;
      var id = node.getAttribute('data-app');
      if (isOn(id)) return;
      e.preventDefault();
      e.stopPropagation();
      try { if (window.toast) window.toast('TA 把「' + nameOf(id) + '」关掉了，你这边暂时用不了（去 设置 → 桌面 里可以打开）'); } catch (e2) {}
    }, true);

    /* 聊天「更多」面板里的小游戏 / 已关掉的工具 */
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var item = t.closest('#chat-more-panel .more-item');
      if (!item) return;
      var mid = item.id || '';
      var m = {
        'more-rps': 'game-rps', 'more-pong': 'game-pong', 'more-snake': 'game-snake', 'more-brick': 'game-brick',
        'more-fish': 'game-fish', 'more-c4': 'game-c4', 'more-ms': 'game-ms', 'more-memory': 'game-memory',
        'more-gomoku': 'game-gomoku', 'more-linkup': 'game-linkup', 'more-match3': 'game-match3', 'more-auction': 'game-auction',
        'more-gift': 'market', 'more-giftbox': 'giftbox', 'more-ck': 'checkin', 'more-cjian': 'cjian',
        'more-room': 'room', 'more-divine': 'divination'
      };
      var id = m[mid];
      if (!id || isOn(id)) return;
      e.preventDefault();
      e.stopPropagation();
      try { if (window.toast) window.toast('「' + nameOf(id) + '」已被关掉，先到 设置 → 桌面 打开才能用'); } catch (e2) {}
    }, true);

    /* 私人三改：小游戏分类不再隐藏整格，改成置灰、点不动，
       「小游戏」tab 也就算在关闭状态下提醒一句「TA 把玩游戏关掉了」 */
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var tab = t.closest('#more-tabs .more-tab[data-mcat="game"]');
      if (!tab) return;
      /* 「小游戏」页签本身不受影响，但整组被关了就跟用户说一声 */
      var anyOn = false;
      for (var i = 0; i < GAMES.length; i++) if (isOn(GAMES[i].id)) { anyOn = true; break; }
      if (anyOn) return;
      e.preventDefault();
      e.stopPropagation();
      try { if (window.toast) window.toast('TA 把「小游戏」都关掉了，你这边暂时玩不了（设置 → 桌面 里可以打开）'); } catch (e2) {}
    }, true);
  }

  /* ---------- 聊天更多面板：小游戏分类过滤 ---------- */
  var MORE_GAME_MAP = {
    'more-rps': 'game-rps', 'more-pong': 'game-pong', 'more-snake': 'game-snake', 'more-brick': 'game-brick',
    'more-fish': 'game-fish', 'more-c4': 'game-c4', 'more-ms': 'game-ms', 'more-memory': 'game-memory',
    'more-gomoku': 'game-gomoku', 'more-linkup': 'game-linkup', 'more-match3': 'game-match3', 'more-auction': 'game-auction'
  };
  function filterMoreItems() {
    try {
      var box = document.getElementById('more-grid-fun');
      if (!box) return;
      box.querySelectorAll('.more-item').forEach(function (it) {
        var id = MORE_GAME_MAP[it.id];
        if (!id) return;
        var off = isOff(id);
        it.dataset.daOff = off ? '1' : '';
        it.style.opacity = off ? '.4' : '';
        it.style.filter = off ? 'grayscale(1)' : '';
        it.title = off ? ('「' + nameOf(id) + '」已被关掉（设置 → 桌面 里可以打开）') : (it.dataset.daTitle || it.title || '');
        if (!it.dataset.daTitle) it.dataset.daTitle = it.title;
      });
      /* 注意：这里不改 applyMoreCat 的 hidden 逻辑，只加标记，面板自己的过滤照旧 */
    } catch (e) {}
  }

  function apply() {
    applyIcons();
    filterMoreItems();
    try { document.dispatchEvent(new CustomEvent('desk-apps-applied')); } catch (e) {}
  }

  /* ---------- 桌面 App 中心界面（私人三改 2：整页长列表，可上下滑，不用小窗） ---------- */
  var SEC_ORDER = ['聊天', '社交', '陪伴', '记录', '生活', '其他', '小游戏'];
  function buildPanel() {
    var p = document.getElementById('desk-apps-panel');
    if (p) return p;
    p = document.createElement('div');
    p.id = 'desk-apps-panel';
    p.className = 'page desk-apps-page';
    p.hidden = true;
    p.innerHTML =
      '<div class="chat-head">' +
        '<span class="ch-back" id="dap-close" role="button" tabindex="0" aria-label="返回">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>' +
        '</span>' +
        '<span class="ch-name">桌面</span>' +
        '<span class="ch-settings" id="dap-all-toggle" title="全部打开 / 关掉全部">⚙</span>' +
      '</div>' +
      '<div class="dap-intro">这里的每一项都能单独开关。关掉＝桌面上暂时不显示、也点不进去，数据都还在；关了之后你和他都用不了，随时回来打开就行。</div>' +
      '<div class="dap-body" id="dap-body"></div>';
    var anchor = document.getElementById('page-chatcard');
    if (anchor && anchor.parentElement) anchor.parentElement.insertBefore(p, anchor);
    else document.body.appendChild(p);
    var close = function () { p.hidden = true; };
    p.querySelector('#dap-close').addEventListener('click', close);
    var tg = p.querySelector('#dap-all-toggle');
    if (tg) tg.addEventListener('click', function () {
      var allOn = ALL.every(function (a) { return isOn(a.id); });
      APPS.concat(GAMES).forEach(function (a) { setOn(a.id, !allOn, true); });
      apply();
      renderPanel();
      try { if (window.toast) window.toast(allOn ? '已全部关掉（东西都还在）' : '已全部打开'); } catch (e) {}
    });
    return p;
  }
  function renderPanel() {
    var p = buildPanel();
    if (!p) return;
    var body = p.querySelector('#dap-body');
    var scrollTop = body.scrollTop;
    body.innerHTML = '';
    SEC_ORDER.forEach(function (sec) {
      var list = ALL.filter(function (a) { return a.sec === sec; });
      if (!list.length) return;
      var onN = list.filter(function (a) { return isOn(a.id); }).length;
      var box = document.createElement('div');
      box.className = 'set-group glass dap-sec';
      var h = document.createElement('div');
      h.className = 'gs-title';
      h.textContent = sec + '（' + onN + '/' + list.length + ' 开）';
      box.appendChild(h);
      list.forEach(function (a) {
        var on = isOn(a.id);
        var row = document.createElement('div');
        row.className = 'set-row dap-row' + (on ? '' : ' off');
        row.innerHTML =
          '<span class="dap-ico">' + (a.ico || '•') + '</span>' +
          '<div class="txt"><div class="dap-name">' + a.name + '</div>' +
          '<div class="dap-desc">' + (on ? '开启中' : '已关掉 · 桌面不显示，数据还在') + '</div></div>' +
          '<label class="toggle"><input type="checkbox"' + (on ? ' checked' : '') + '><span class="tk"></span></label>';
        var ck = row.querySelector('input');
        ck.addEventListener('change', function () {
          setOn(a.id, ck.checked);
          renderPanel();
        });
        box.appendChild(row);
      });
      body.appendChild(box);
    });
    body.scrollTop = scrollTop;
  }
  function openPanel() {
    document.querySelectorAll('.page').forEach(function (q) { q.hidden = true; });
    renderPanel();
    var p = buildPanel();
    if (p) { p.hidden = false; p.querySelector('#dap-body').scrollTop = 0; }
    try {
      var btn = document.getElementById('desk-entry-btn');
      if (btn) btn.checked = false;
    } catch (e) {}
  }
  window.openDeskApps = openPanel;

  /* ---------- 原来的「开启群聊」那行 → 改成「桌面」入口 ---------- */
  function hookSettingRow() {
    var row = document.getElementById('sf-group-chat-row');
    if (!row || row.dataset.daHooked) return;
    row.dataset.daHooked = '1';
    var txt = row.querySelector('.txt');
    if (txt) txt.textContent = '桌面';
    var old = row.querySelector('#sf-group-chat');
    if (old) {
      try { old.id = 'desk-entry-btn'; } catch (e) {}
      try { old.checked = false; } catch (e2) {}
      try {
        var lb = old.closest('label');
        if (lb) { lb.classList.add('da-entry'); lb.title = '打开桌面 App 中心'; }
      } catch (e3) {}
      /* 换成「打开」按钮的样子：不保留真正的 toggle 语义 */
      try { old.setAttribute('type', 'button'); } catch (e4) {}
      try { old.setAttribute('aria-label', '打开桌面'); } catch (e5) {}
      old.addEventListener('change', function () { try { old.checked = false; } catch (e6) {} openPanel(); });
    }
    row.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      openPanel();
    }, true);
    /* 去掉群聊开关原来那条 toast 文案里可能的残留 */
    try { document.dispatchEvent(new CustomEvent('desk-entry-installed')); } catch (e7) {}
  }

  /* ---------- 初始化 ---------- */
  function boot() {
    hookSettingRow();
    guardClicks();
    apply();
    try { bindAppLongPress(); } catch (e0) {} // 私人三改 2：长按桌面 App 换位置
    [300, 1200, 3000].forEach(function (ms) { setTimeout(function () { try { applyAppOrder(); } catch (e) {} }, ms); });
    /* 桌面图标是各模块自己的脚本注入的，晚一点再补几轮 */
    [200, 800, 1600, 3000].forEach(function (ms) { setTimeout(function () { try { applyIcons(); } catch (e) {} }, ms); });
    try {
      document.addEventListener('contact-switched', function () { setTimeout(apply, 120); });
      document.addEventListener('decor-exited', function () { setTimeout(apply, 120); });
      document.addEventListener('mochi-restore-done', function () { setTimeout(apply, 120); });
      document.addEventListener('group-chat-mode-changed', function () { setTimeout(apply, 120); });
    } catch (e) {}
    try {
      var obs = new MutationObserver(function () { filterMoreItems(); });
      var panel = document.getElementById('chat-more-panel');
      if (panel) obs.observe(panel, { attributes: true, attributeFilter: ['hidden'], subtree: false });
      var grid = document.getElementById('more-grid-fun');
      if (grid) obs.observe(grid, { attributes: true, attributeFilter: ['hidden'] });
    } catch (e) {}
    /* 设置页每次打开都重新挂一次（DOM 可能被重建） */
    setInterval(function () { try { hookSettingRow(); } catch (e) {} }, 4000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* ---------- 对外 API ---------- */
  window.deskAppIsOn = isOn;
  window.deskAppIsOff = isOff;
  window.deskAppSet = function (id, on) { return setOn(id, on); };
  window.deskAppName = nameOf;
  window.deskAppList = function () { return ALL.slice(); };
  window.deskAppReqAble = function (id) { return !!REQ_ABLE[id]; };
  /* 申请弹窗「同意关掉某 App」时用：记一下是 TA 申请的，方便统计 */
  window.deskAppMarkReqOff = function (id, on) {
    var a = readArr(REQ_OFF_KEY);
    var i = a.indexOf(id);
    if (on && i < 0) a.push(id);
    if (!on && i >= 0) a.splice(i, 1);
    writeArr(REQ_OFF_KEY, a);
  };
  window.deskAppIsReqOff = function (id) { return readArr(REQ_OFF_KEY).indexOf(id) >= 0; };
  window.deskAppRefresh = apply;
})();
