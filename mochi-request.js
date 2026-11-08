/* =====================================================================
 * 私人三改 · 「XX 申请……」弹窗
 * ---------------------------------------------------------------------
 * TA 会主动向你申请，UI 是一个小弹窗：
 *   ① 申请打开 / 关掉某个 App、小游戏
 *   ② 申请把你刚说的某句话收进字卡（默认进「自定义字卡 → 未分组」）
 *   ③ 申请删掉一张字卡 / 换头像 / 改称呼
 * 你点「同意」才会执行；点「拒绝」就什么都不做（也不会跑去别处）。
 *
 * 概率与开关放在：设置 → 回复设置 → 其他 →「TA 的申请」。
 * 默认全关，和「主动邀请贴贴」一样，需要自己打开。
 * 存储：reply-req-en / reply-req-prob / reply-req-open / reply-req-close /
 *       reply-req-card / reply-req-delcard / reply-req-avatar / reply-req-name
 * ===================================================================== */
(function () {
  'use strict';
  if (window.__mochiRequestLoaded) return;
  window.__mochiRequestLoaded = true;

  function cfg(k, d) {
    try {
      if (window.replyCfg) { var v = window.replyCfg(k); if (v !== undefined && v !== null && v !== '') return v; }
    } catch (e) {}
    try { var raw = localStorage.getItem('reply-' + k); if (raw !== null) return raw; } catch (e2) {}
    return d;
  }
  function enabled() { return Number(cfg('req-en', 0)) === 1; }
  function prob() { return Math.max(0, Number(cfg('req-prob', 6)) || 0); }
  function kindOn(k) { return Number(cfg('req-' + k, 1)) === 1; }
  function who() {
    try { if (window.chatPartnerName) return window.chatPartnerName() || 'TA'; } catch (e) {}
    try { if (window.taWord) return window.taWord(); } catch (e2) {}
    return 'TA';
  }
  function store() { try { return window.activeStore ? window.activeStore() : null; } catch (e) { return null; } }

  /* ---------- 记录：今天申请过几次（别太吵） ---------- */
  var DAY_KEY = 'mochi-req-day';
  function todayCount() {
    try {
      var raw = localStorage.getItem(DAY_KEY);
      var o = raw ? JSON.parse(raw) : null;
      var d = new Date().toDateString();
      if (!o || o.d !== d) return 0;
      return Number(o.n) || 0;
    } catch (e) { return 0; }
  }
  function bumpToday() {
    try {
      var d = new Date().toDateString();
      localStorage.setItem(DAY_KEY, JSON.stringify({ d: d, n: todayCount() + 1 }));
    } catch (e) {}
  }

  /* ---------- 弹窗 ---------- */
  var busy = false;
  function ask(title, body, onYes, onNo) {
    if (!window.openModal) { return; }
    busy = true;
    try {
      window.openModal(title, '', function (v) {
        busy = false;
        if (v === '__yes') { try { onYes && onYes(); } catch (e) {} }
        else { try { onNo && onNo(); } catch (e2) {} }
      }, {
        noInput: true, pillSubmit: true, hideOk: true, pillGrid: true,
        staticText: body,
        pills: [
          { label: '同意', value: '__yes' },
          { label: '拒绝', value: '__no' }
        ]
      });
    } catch (e) { busy = false; }
  }

  /* ---------- ① App / 小游戏开关申请 ---------- */
  function reqApp(kind) {
    var all = [];
    try { all = (window.deskAppList ? window.deskAppList() : []).filter(function (a) { return a.kind === 'app' && window.deskAppReqAble(a.id); }); } catch (e) { return false; }
    if (!all.length) return false;
    /* 申请打开：挑一个「现在关着」的；申请关掉：挑一个「现在开着」的 */
    var wantOn = kind === 'open';
    var pool = all.filter(function (a) { return window.deskAppIsOn(a.id) !== wantOn; });
    if (!pool.length) return false;
    var pick = pool[Math.floor(Math.random() * pool.length)];
    var nm = pick.name;
    if (wantOn) {
      ask(who() + ' 申请打开「' + nm + '」',
        'TA 想把「' + nm + '」重新打开，问你可以吗？\n同意之后你们俩都能用了（之前的数据一直都在）。',
        function () { window.deskAppSet(pick.id, true); },
        function () { try { if (window.toast) window.toast('已经拒绝了，先保持关闭'); } catch (e) {} });
    } else {
      ask(who() + ' 申请关掉「' + nm + '」',
        'TA 想把「' + nm + '」先关掉，问你可以吗？\n关掉只是桌面上暂时不显示，数据都还在，随时可以在 设置 → 桌面 里打开。',
        function () { window.deskAppSet(pick.id, false); try { window.deskAppMarkReqOff && window.deskAppMarkReqOff(pick.id, true); } catch (e) {} },
        function () { try { if (window.toast) window.toast('已经拒绝了，「' + nm + '」保持打开'); } catch (e) {} });
    }
    return true;
  }

  /* ---------- ② 某句话收进字卡 ---------- */
  function myRecentText() {
    try {
      if (window.lastMineText && typeof window.lastMineText === 'string' && window.lastMineText.length < 120) return window.lastMineText;
    } catch (e) {}
    return '';
  }
  function reqCard() {
    var t = myRecentText();
    if (!t) return false;
    if (t.indexOf('data:') === 0) return false;
    ask(who() + ' 申请把这一句加入字卡',
      '「' + t + '」\n同意就收进「自定义字卡 → 未分组」，以后 TA 说话时会用到它。',
      function () {
        try {
          var ok = window.ccAppendCards ? window.ccAppendCards('text', '未分组', [t], 'own') : false;
          if (window.toast) window.toast(ok ? '已加入字卡（未分组）' : '这句已经在字卡里了');
        } catch (e) { try { window.toast && window.toast('加入失败'); } catch (e2) {} }
      },
      function () { try { if (window.toast) window.toast('好，这句就不收进字卡了'); } catch (e) {} });
    return true;
  }

  /* ---------- ③ 删字卡 / 换头像 / 改称呼 ---------- */
  /* 私人三改 2：头像 / 称呼 增加「删掉」与「加入」两类
     - 删掉：同意就清空该池（头像库 / 昵称池），并立刻随机换成一个新的
     - 加入：TA 提议一个头像 / 昵称，同意就加进池子里（以后可以随机到）；昵称加完可以直接改 */
  function avatarPool() {
    try { return JSON.parse((store() && store().get('avatar-lib')) || '[]').filter(function (x) { return typeof x === 'string' && x; }); } catch (e) { return []; }
  }
  function nickPool() {
    try { return JSON.parse((store() && store().get('nick-lib')) || '[]').map(function (x) { return String(x || '').trim(); }).filter(Boolean); } catch (e) { return []; }
  }
  function reqAvatarDel() {
    var pool = avatarPool();
    if (!pool.length) return false;
    var pick = pool[Math.floor(Math.random() * pool.length)];
    ask(who() + ' 申请删掉一个头像',
      'TA 想从「头像库」里删掉这一张：\n同意后就删掉它，并顺手换成库里另一个头像；不同意就保持不变。',
      function () {
        try {
          var st = store(); if (!st) return;
          var left = pool.filter(function (x) { return x !== pick; });
          st.set('avatar-lib', JSON.stringify(left));
          try { window.toast && window.toast('已删掉这个头像'); } catch (e0) {}
          /* 同意后随机换成一个别的头像（库里没有就换不成了，保留当前） */
          if (left.length) {
            var nv = left[Math.floor(Math.random() * left.length)];
            st.set('cs-avatar-partner', nv);
            try { if (window.refreshChatAvatars) window.refreshChatAvatars(); } catch (e1) {}
            try { if (window.fillAvatar) window.fillAvatar('chat-partner-av', 'cs-avatar-partner'); } catch (e2) {}
            try { window.toast && window.toast('顺手换成了库里的另一个头像'); } catch (e3) {}
          }
        } catch (e) { try { window.toast && window.toast('删除失败'); } catch (e4) {} }
      },
      function () { try { window.toast && window.toast('好，这个头像留着'); } catch (e) {} });
    return true;
  }
  function reqNickDel() {
    var pool = nickPool();
    if (!pool.length) return false;
    var pick = pool[Math.floor(Math.random() * pool.length)];
    ask(who() + ' 申请删掉一个称呼',
      'TA 想从「昵称库」里删掉这一个：\n「' + pick + '」\n同意就删掉它，并顺手换成库里另一个称呼；不同意就保持不变。',
      function () {
        try {
          var st = store(); if (!st) return;
          var left = pool.filter(function (x) { return x !== pick; });
          st.set('nick-lib', JSON.stringify(left));
          try { window.toast && window.toast('已删掉这个称呼'); } catch (e0) {}
          if (left.length) {
            var nv = left[Math.floor(Math.random() * left.length)];
            st.set('cs-lbl-partner', nv);
            try { if (window.renderChatHeader) window.renderChatHeader(); } catch (e1) {}
            try { window.toast && window.toast('顺手换成了「' + nv + '」'); } catch (e2) {}
          }
        } catch (e) { try { window.toast && window.toast('删除失败'); } catch (e4) {} }
      },
      function () { try { window.toast && window.toast('好，这个称呼留着'); } catch (e) {} });
    return true;
  }
  function reqAvatarAdd() {
    var pool = avatarPool();
    /* TA 提议：从它现有头像里拿一张，或者干脆用当前这张之外没库里的随机的——没有素材就退一步，不弹空窗 */
    var cand = '';
    try {
      var cur = (store() && store().get('cs-avatar-partner')) || '';
      var others = pool.filter(function (x) { return x !== cur; });
      cand = others.length ? others[Math.floor(Math.random() * others.length)] : '';
    } catch (e) {}
    if (!cand) return false; /* 没有别的头像可加，跳过这次申请 */
    ask(who() + ' 申请加入一个头像',
      'TA 想把这张加进「头像库」，以后随机换头像时能用到它：\n点「同意」就加入；不同意就不加。',
      function () {
        try {
          var p2 = avatarPool();
          if (p2.indexOf(cand) >= 0) { window.toast && window.toast('本来就在头像库里了'); return; }
          p2.push(cand);
          store().set('avatar-lib', JSON.stringify(p2));
          window.toast && window.toast('已加入头像库');
        } catch (e) {}
      },
      function () { try { window.toast && window.toast('好，不加了'); } catch (e) {} });
    return true;
  }
  function reqNickAdd() {
    /* TA 提议一个昵称：同库里已有的就不提了；用 TA 当前名字 + 常见后缀拼一个候选，太单薄就跳过 */
    var pool = nickPool();
    if (!pool.length) return false;
    var cur = '';
    try { cur = (window.chatPartnerName && window.chatPartnerName()) || ''; } catch (e) {}
    var cand = pool.filter(function (x) { return x !== cur; })[0] || '';
    if (!cand) return false;
    if (window.openModal) {
      /* 用带输入框的弹窗：TA 说「我想加这个称呼」，你可以先改再确定 */
      window.openModal(who() + ' 申请加入一个称呼',
        cand,
        function (v) {
          var val = String(v == null ? cand : v).trim();
          if (!val) return;
          try {
            var p2 = nickPool();
            if (p2.indexOf(val) < 0) p2.push(val);
            store().set('nick-lib', JSON.stringify(p2));
            window.toast && window.toast('已加入昵称库：「' + val + '」');
          } catch (e) { try { window.toast && window.toast('加入失败'); } catch (e2) {} }
        },
        { staticText: 'TA 想把这个称呼加进昵称库，以后会随机用到它。\n想改就直接在下面改掉再点确定。', okText: '加入' });
      return true;
    }
    return false;
  }
  function reqDelCard() {
    var card = '';
    try {
      var pool = window.getCustomCardsFor ? window.getCustomCardsFor(window.__activeCid || 'default') : [];
      pool = (pool || []).filter(function (c) { return typeof c === 'string' && c && c.indexOf('|||') < 0 && c.indexOf('data:') !== 0; });
      if (!pool.length) return false;
      card = pool[Math.floor(Math.random() * pool.length)];
    } catch (e) { return false; }
    ask(who() + ' 申请删掉这张字卡',
      '「' + card + '」\n同意就从「自定义字卡」里移除它。',
      function () {
        try {
          var found = window.ccFindCustomCard ? window.ccFindCustomCard('own', 'text', '未分组', card) : null;
          if (window.ccDeleteCustomCard && found) { window.ccDeleteCustomCard('own', 'text', '未分组', card); try { window.toast && window.toast('已删掉这张字卡'); } catch (e) {} return; }
          window.toast && window.toast('这张字卡不在「未分组」里，没有动它');
        } catch (e) {}
      },
      function () { try { window.toast && window.toast('好，这张字卡留着'); } catch (e) {} });
    return true;
  }
  function reqName() {
    var cur = '';
    try { cur = (window.chatPartnerName && window.chatPartnerName()) || ''; } catch (e) {}
    if (!cur) return false;
    if (!window.openModal) return false;
    /* openModal 默认带输入框：回调 v 就是用户输入的新称呼 */
    window.openModal(who() + ' 申请改称呼',
      '',
      function (v) {
        var val = (v || '').trim();
        if (!val || val === cur) return;
        try {
          var st = window.activeStore ? window.activeStore() : (window.store || null);
          if (st) st.set('cs-lbl-partner', val);
          try { if (window.renderChatHeader) window.renderChatHeader(); } catch (e2) {}
          try { window.toast && window.toast('已改称呼为「' + val + '」'); } catch (e3) {}
        } catch (e) { try { window.toast && window.toast('改称呼失败'); } catch (e4) {} }
      }, { staticText: 'TA 想让你决定「TA 在你这里叫什么」——现在叫「' + cur + '」。输入新称呼后点确定就改；不想改就点取消。' });
    return true;
  }

  /* ---------- 统一调度：接在一次正常回复之后 ---------- */
  function maybeFire() {
    if (busy) return;
    if (!enabled()) return;
    if (todayCount() >= 6) return;
    var r = Math.random() * 100;
    if (r >= prob()) return;
    var kinds = [];
    if (kindOn('open')) kinds.push('open', 'open');
    if (kindOn('close')) kinds.push('close');
    if (kindOn('card')) kinds.push('card', 'card', 'card');
    if (kindOn('delcard')) kinds.push('delcard');
    if (kindOn('avatar-del')) kinds.push('avatar-del');
    if (kindOn('avatar-add')) kinds.push('avatar-add');
    if (kindOn('nick-del')) kinds.push('nick-del');
    if (kindOn('nick-add')) kinds.push('nick-add');
    if (kinds.length) {
      var k = kinds[Math.floor(Math.random() * kinds.length)];
      var ok = false;
      if (k === 'open' || k === 'close') ok = reqApp(k);
      else if (k === 'card') ok = reqCard();
      else if (k === 'delcard') ok = reqDelCard();
      else if (k === 'avatar-del') ok = reqAvatarDel();
      else if (k === 'avatar-add') ok = reqAvatarAdd();
      else if (k === 'nick-del') ok = reqNickDel();
      else if (k === 'nick-add') ok = reqNickAdd();
      if (ok) { bumpToday(); return; }
    }
    /* 兜底：上面挑的类型没得申请，就试一次「加字卡」——最常见也最无害 */
    if (kindOn('card') && reqCard()) { bumpToday(); return; }
  }
  window.mochiRequestTry = maybeFire;

  /* 私人三改：TA 说完一句之后有机会申请一次 */
  var lastFire = 0;
  function hook() {
    try {
      if (window.chatAddInTyped && !window.chatAddInTyped.__reqWrapped) {
        var orig = window.chatAddInTyped;
        var wrapped = function () {
          var r = orig.apply(this, arguments);
          setTimeout(function () {
            if (Date.now() - lastFire < 60000) return;
            lastFire = Date.now();
            try { maybeFire(); } catch (e) {}
          }, 2200);
          return r;
        };
        wrapped.__reqWrapped = 1;
        window.chatAddInTyped = wrapped;
      }
    } catch (e) {}
    try {
      if (window.addRec && !window.addRec.__reqWrapped) {
        var o2 = window.addRec;
        var w2 = function () {
          var r = o2.apply(this, arguments);
          try {
            if (enabled() && Date.now() - lastFire > 60000) {
              lastFire = Date.now();
              setTimeout(function () { try { maybeFire(); } catch (e) {} }, 4000);
            }
          } catch (e) {}
          return r;
        };
        w2.__reqWrapped = 1;
        /* addRec 内部被大量调用，这里不替换，只留对话后的钩子 */
      }
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook);
  else hook();
  [400, 1500, 4000].forEach(function (ms) { setTimeout(hook, ms); });

  /* ---------- 对外 API ---------- */
  window.mochiRequest = {
    fire: function () { try { maybeFire(); } catch (e) {} },
    askApp: function (kind, id) {
      if (id && window.deskAppSet) {
        var nm = window.deskAppName ? window.deskAppName(id) : id;
        ask(who() + ' 申请' + (kind === 'open' ? '打开' : '关掉') + '「' + nm + '」',
          '同意就' + (kind === 'open' ? '打开' : '关掉') + '它（关掉只是桌面暂时隐藏，数据都还在）。',
          function () { window.deskAppSet(id, kind === 'open'); }, null);
        return true;
      }
      return kind === 'close' ? reqApp('close') : reqApp('open');
    },
    askCardAdd: reqCard,
    askCardDel: reqDelCard,
    askName: reqName,
    askAvatarDel: reqAvatarDel,
    askAvatarAdd: reqAvatarAdd,
    askNickDel: reqNickDel,
    askNickAdd: reqNickAdd
  };
})();
