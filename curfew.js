/* 私人二改：宵禁（夜间免打扰模式里的附加开关）
   - 可开关，可设开始 / 结束时间（几点几分）
   - 期间用户随便发消息，TA「不自动回复」（不显示正在输入、不掷骰子、不发任何时间链上的卡）
   - 宵禁结束那一刻，从「用户在宵禁期间发的第一条消息」开始，
     按原本的概率一条一条往下回（连着的同一条轮次走原有的多气泡 / 拼卡机制）
   - 不影响：抽卡、心情、周报、红包余额等；只是把「自动回复」挪到宵禁后
   - 存储：宵禁开关 / 时间 = 全局键（root 级，不做备份也不会丢）
          宵禁期间的待回消息 = 每个联系人各存各的（qx-ban-pending） */
(function () {
  'use strict';
  try {
    var ROOT = 'xy-home-v2';
    var KEY_EN = 'curfew-en';     // '1' 开 / '0' 关
    var KEY_FROM = 'curfew-from'; // 分钟（0–1439）
    var KEY_TO = 'curfew-to';
    var KEY_QUEUE = 'curfew-pending'; // 每联系人各自的待回队列
    var DEF_FROM = 22 * 60;
    var DEF_TO = 8 * 60;
    var TICK_MS = 20000;
    var STOP_KEY = '__curfewClock';   // 防重复挂时钟

    function rootStore() {
      try { return window.xyStore ? window.xyStore(ROOT) : null; } catch (e) { return null; }
    }
    function num(v, def) {
      var n = parseInt(v, 10);
      return isFinite(n) && n >= 0 && n < 1440 ? n : def;
    }
    function cfg() {
      var s = rootStore();
      var en = false, from = DEF_FROM, to = DEF_TO;
      try {
        if (s) {
          en = s.get(KEY_EN) === '1';
          from = num(s.get(KEY_FROM), DEF_FROM);
          to = num(s.get(KEY_TO), DEF_TO);
        }
      } catch (e) {}
      return { en: en, from: from, to: to };
    }
    function setCfg(o) {
      var s = rootStore();
      if (!s) return false;
      try {
        if (o && o.en !== undefined) s.set(KEY_EN, o.en ? '1' : '0');
        if (o && o.from !== undefined) s.set(KEY_FROM, String(num(o.from, DEF_FROM)));
        if (o && o.to !== undefined) s.set(KEY_TO, String(num(o.to, DEF_TO)));
        return true;
      } catch (e) { return false; }
    }
    function nowMin() {
      var d = new Date();
      return d.getHours() * 60 + d.getMinutes();
    }
    /* 现在是否在宵禁里：支持「22:00 → 次日 8:00」这种跨零点 */
    function active() {
      try {
        var c = cfg();
        if (!c.en) return false;
        var n = nowMin();
        if (c.from === c.to) return false;
        if (c.from < c.to) return n >= c.from && n < c.to;
        return n >= c.from || n < c.to;
      } catch (e) { return false; }
    }
    function fmtMin(m) {
      m = num(m, 0);
      var h = Math.floor(m / 60), mi = m % 60;
      return (h < 10 ? '0' : '') + h + ':' + (mi < 10 ? '0' : '') + mi;
    }
    function statusText() {
      var c = cfg();
      if (!c.en) return '关闭 · 开启后 ' + fmtMin(c.from) + '–' + fmtMin(c.to) + ' 不自动回消息';
      return active()
        ? ('宵禁中（' + fmtMin(c.from) + '–' + fmtMin(c.to) + '）· 结束前不自动回复')
        : ('开启 · ' + fmtMin(c.from) + '–' + fmtMin(c.to) + ' 不自动回复');
    }

    /* ---------- 待回队列（每个联系人各自一份） ---------- */
    function qStore() {
      try { return window.activeStore ? window.activeStore() : null; } catch (e) { return null; }
    }
    function qLoad() {
      var s = qStore();
      if (!s) return [];
      try {
        var a = JSON.parse(s.get(KEY_QUEUE) || '[]');
        return Array.isArray(a) ? a : [];
      } catch (e) { return []; }
    }
    function qSave(a) {
      var s = qStore();
      if (!s) return;
      try { s.set(KEY_QUEUE, JSON.stringify(a || [])); } catch (e) {}
    }
    /* 用户发了一条消息 → 塞进队尾（同一条避免重复塞） */
    function pushItem(it) {
      if (!it || !it.text) return false;
      var a = qLoad();
      var last = a[a.length - 1];
      if (last && last.text === it.text && last.ts === it.ts) return false;
      a.push({ text: it.text, type: it.type || 'text', ts: it.ts || Date.now(), n: a.length });
      if (a.length > 200) a = a.slice(-200);
      qSave(a);
      return true;
    }
    function qLen() { return qLoad().length; }
    function qClear() { qSave([]); }

    /* ---------- 计划：把宵禁期间的若干条消息，按「轮」切成一串待回 ----------
       连续几条之间间隔 ≤ 5 分钟＝同一轮（TA 一起回），否则各算一轮。
       每一轮按原有概率：先掷「不回」；不回＝只显示已读；要回＝记下要回几条。
       真正生成回复仍然走 chat.js 原来的回复引擎（文本 / 表情包 / 语音 / 拼卡都一样） */
    var ROUND_GAP_MS = 5 * 60 * 1000;
    function buildPlan(items) {
      var rounds = [];
      (items || []).forEach(function (it) {
        if (!it || !it.text) return;
        var last = rounds[rounds.length - 1];
        if (last && (it.ts - last.endTs) <= ROUND_GAP_MS) {
          last.items.push(it);
          last.endTs = it.ts;
        } else {
          rounds.push({ items: [it], startTs: it.ts, endTs: it.ts });
        }
      });
      var c = {};
      try { c = (window.replyCfg && window.replyCfg()) || {}; } catch (e) { c = {}; }
      function hit(prob) { return Math.random() * 100 < (Number(prob) || 0); }
      var plan = [];
      rounds.forEach(function (r) {
        if (hit(c['rn-prob'])) {
          plan.push({ kind: 'read', items: r.items, ts: r.endTs });
          return;
        }
        var rpMin = Math.max(1, Number(c['reply-min']) || 1);
        var rpMax = Math.max(rpMin, Number(c['reply-max']) || 2);
        var count = (c['py-en'] === 1) ? Math.max(1, Math.min(rpMax, rpMin + Math.floor(Math.random() * (rpMax - rpMin + 1)))) : 1;
        plan.push({ kind: 'reply', items: r.items, ts: r.endTs, count: count });
      });
      return plan;
    }

    /* ---------- 宵禁结束时的补回 ---------- */
    var resumeRunning = false;
    var RESUME_GAP_MS = 45000;
    function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
    function wait(ms) { return new Promise(function (r) { try { setTimeout(r, ms); } catch (e) { r(); } }); }

    async function runResume(cidAtStart) {
      if (resumeRunning) return;
      var items = qLoad();
      if (!items.length) {
        try { if (window.__curfewSettledFor) {} } catch (e) {}
        return;
      }
      if (active()) return; // 又进宵禁了，等下一次
      resumeRunning = true;
      try {
        var plan = buildPlan(items);
        /* 先清队列，避免中途又进来被重复消费；执行期间用户新发消息自然进新队列 */
        qClear();
        try { if (window.toast) window.toast('宵禁结束：开始把夜里 ' + items.length + ' 条消息一条条回你'); } catch (e) {}
        for (var i = 0; i < plan.length; i++) {
          var st = plan[i];
          var sameCid = function () { return (window.__activeCid || 'default') === cidAtStart; };
          /* 宵禁又开始了 / 切走了：剩下的留着，下一次再说 */
          if (active()) return;
          if (!sameCid()) {
            /* 不是当前桌面：把还没处理的塞回该联系人的队列里，等切回去再说 */
            try {
              var rest = [];
              for (var j = i; j < plan.length; j++) rest = rest.concat(plan[j].items);
              var s = window.storeFor ? window.storeFor(cidAtStart) : null;
              if (s) s.set(KEY_QUEUE, JSON.stringify(rest));
            } catch (e2) {}
            return;
          }
          /* 用这一轮的最后一条当「TA 回的是哪句」的上下文 */
          try {
            var lastIt = st.items[st.items.length - 1];
            var idx = -1;
            try {
              var ms = (window.chatMsgs && window.chatMsgs()) || null;
              /* 尽量在内存里找到那条消息，找不到也没关系 */
            } catch (e3) {}
            if (window.curfewPrimeContext) {
              try { window.curfewPrimeContext(lastIt); } catch (e4) {}
            }
          } catch (e5) {}
          if (st.kind === 'read') {
            try { if (window.curfewShowRead) window.curfewShowRead(); } catch (e6) {}
          } else {
            try {
              if (window.curfewReplyN) await window.curfewReplyN(st.count);
            } catch (e7) {}
          }
          if (i < plan.length - 1) await wait(RESUME_GAP_MS);
        }
        try { if (window.toast) window.toast('夜里攒的消息都回完了'); } catch (e) {}
      } finally {
        resumeRunning = false;
      }
    }

    /* ---------- 时钟：宵禁结束那一刻自己接上 ---------- */
    var lastTickActive = null;
    function tick() {
      try {
        var a = active();
        if (lastTickActive === true && a === false) {
          var cid = window.__activeCid || 'default';
          setTimeout(function () { runResume(cid); }, 1200);
        }
        lastTickActive = a;
        try { if (window.curfewSyncRow) window.curfewSyncRow(); } catch (e) {}
      } catch (e) {}
    }
    if (!window[STOP_KEY]) {
      window[STOP_KEY] = true;
      try { setInterval(tick, TICK_MS); } catch (e) {}
      setTimeout(tick, 5000);
      /* 切桌面／数据恢复完也检查一次 */
      try {
        document.addEventListener('contact-switched', function () {
          try { if (!active()) setTimeout(function () { runResume(window.__activeCid || 'default'); }, 1500); } catch (e) {}
        });
      } catch (e) {}
      try {
        if (window.mochiOnDataReady) window.mochiOnDataReady(function () { try { tick(); } catch (e) {} });
      } catch (e) {}
    }

    /* ---------- 设置界面 ---------- */
    function rowInjected() { return !!document.getElementById('sf-curfew-row'); }
    /* 私人二改：宵禁要待在「夜间免打扰模式」下面、「喝水 / 吃饭提醒」上面
       两行可能谁先建出来，所以每次同步时都检查一次顺序，不对就挪 */
    function reanchor() {
      try {
        var night = document.getElementById('sf-night-mode-row');
        var row = document.getElementById('sf-curfew-row');
        var times = document.getElementById('sf-curfew-time-row');
        if (!night || !row || !times || !night.parentNode) return;
        if (night.nextSibling !== row) night.parentNode.insertBefore(row, night.nextSibling);
        var remind = document.getElementById('rp-remind-schedule');
        var target = remind && remind.parentNode === row.parentNode ? remind : row.nextSibling;
        if (target !== times) row.parentNode.insertBefore(times, target);
      } catch (e) {}
    }
    window.curfewReanchor = reanchor;
    function injectRow() {
      try {
        if (rowInjected()) { syncRow(); return true; }
        var anchor = document.getElementById('sf-night-mode-row');
        if (!anchor) return false;
        var row = document.createElement('div');
        row.className = 'set-row';
        row.id = 'sf-curfew-row';
        row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 6px 12px 2px;';
        row.innerHTML =
          '<div class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/><path d="M3 21l18-18" opacity=".55"/></svg></div>' +
          '<div class="txt"><div class="curfew-title">宵禁<span class="curfew-pill" id="sf-curfew-live">关闭</span></div><div class="curfew-sub" id="sf-curfew-sub"></div></div>' +
          '<label class="toggle"><input type="checkbox" id="sf-curfew"><span class="tk"></span></label>';
        anchor.parentNode.insertBefore(row, anchor.nextSibling);

        /* 下方：开始 / 结束时间 */
        var times = document.createElement('div');
        times.className = 'set-row';
        times.id = 'sf-curfew-time-row';
        times.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 8px;';
        times.innerHTML =
          '<span class="curfew-time-label">从</span>' +
          '<input type="time" id="sf-curfew-from" class="curfew-time">' +
          '<span class="curfew-time-label">到</span>' +
          '<input type="time" id="sf-curfew-to" class="curfew-time">' +
          '<span class="curfew-time-hint" id="sf-curfew-hint">期间随便发，结束后从第一条按概率回</span>';
        row.parentNode.insertBefore(times, row.nextSibling);

        var cb = row.querySelector('#sf-curfew');
        if (cb) cb.addEventListener('change', function () {
          var on = !!cb.checked;
          setCfg({ en: on });
          syncRow();
          try {
            if (window.toast) window.toast(on ? ('宵禁已开启：' + fmtMin(cfg().from) + '–' + fmtMin(cfg().to) + ' 期间 TA 不自动回复') : '宵禁已关闭：恢复即时自动回复');
          } catch (e) {}
        });
        var fromEl = document.getElementById('sf-curfew-from');
        var toEl = document.getElementById('sf-curfew-to');
        function onTimeChange() {
          var f = fromEl && fromEl.value ? fromEl.value.split(':') : null;
          var t = toEl && toEl.value ? toEl.value.split(':') : null;
          var fm = f ? (parseInt(f[0], 10) * 60 + parseInt(f[1], 10)) : cfg().from;
          var tm = t ? (parseInt(t[0], 10) * 60 + parseInt(t[1], 10)) : cfg().to;
          if (fm === tm) { try { window.toast('开始和结束不能是同一个时间'); } catch (e) {} }
          setCfg({ from: fm, to: tm });
          syncRow();
        }
        if (fromEl) fromEl.addEventListener('change', onTimeChange);
        if (toEl) toEl.addEventListener('change', onTimeChange);
        document.addEventListener('contact-switched', syncRow);
        document.addEventListener('mochi-restore-done', syncRow);
        try { setInterval(syncRow, 60000); } catch (e) {}
        reanchor();
        syncRow();
        return true;
      } catch (e) { return false; }
    }
    function syncRow() {
      try {
        if (!rowInjected()) return;
        reanchor();
        var c = cfg();
        var cb = document.getElementById('sf-curfew');
        if (cb) cb.checked = c.en;
        var fromEl = document.getElementById('sf-curfew-from');
        var toEl = document.getElementById('sf-curfew-to');
        if (fromEl && document.activeElement !== fromEl) fromEl.value = fmtMin(c.from);
        if (toEl && document.activeElement !== toEl) toEl.value = fmtMin(c.to);
        var sub = document.getElementById('sf-curfew-sub');
        var live = document.getElementById('sf-curfew-live');
        var n = qLen();
        if (sub) {
          var txt = statusText();
          if (c.en && n) txt += ' · 攒了 ' + n + ' 条待回';
          sub.textContent = txt;
        }
        if (live) {
          live.textContent = !c.en ? '关闭' : (active() ? '宵禁中' : '待生效');
          live.className = 'curfew-pill' + (!c.en ? '' : (active() ? ' on' : ' wait'));
        }
        var times = document.getElementById('sf-curfew-time-row');
        if (times) times.style.opacity = c.en ? '1' : '.5';
        var fromEl2 = document.getElementById('sf-curfew-from');
        var toEl2 = document.getElementById('sf-curfew-to');
        if (fromEl2) fromEl2.disabled = !c.en;
        if (toEl2) toEl2.disabled = !c.en;
      } catch (e) {}
    }
    /* 设置页可能是异步搭起来的：多试几次 */
    var tries = 0;
    function boot() {
      if (injectRow()) return;
      if (tries++ < 80) setTimeout(boot, 250);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
    try {
      var mo = new MutationObserver(function () {
        try {
          if (document.getElementById('sf-curfew-row')) return; // 已挂好，别再回调（避免自激）
          if (!document.getElementById('sf-night-mode-row')) return;
          injectRow();
        } catch (e) {}
      });
      mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
    } catch (e) {}

    /* ---------- 样式 ---------- */
    try {
      if (!document.getElementById('curfew-style')) {
        var st = document.createElement('style');
        st.id = 'curfew-style';
        st.textContent =
          '#sf-curfew-row .curfew-title{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;}' +
          '#sf-curfew-row .curfew-sub{font-size:11.5px;opacity:.6;margin-top:3px;line-height:1.35;}' +
          '.curfew-pill{font-size:10.5px;padding:1px 7px;border-radius:999px;background:rgba(128,128,128,.16);color:inherit;opacity:.8;font-weight:500;}' +
          '.curfew-pill.on{background:rgba(96,120,255,.18);color:#4a5cff;opacity:1;}' +
          '.curfew-pill.wait{background:rgba(240,170,60,.18);color:#c8871a;opacity:1;}' +
          '.curfew-time{padding:6px 8px;border-radius:10px;border:1px solid rgba(128,128,128,.28);background:transparent;color:inherit;font-size:13px;}' +
          '.curfew-time-label{font-size:12.5px;opacity:.7;}' +
          '.curfew-time-hint{font-size:11px;opacity:.55;flex-basis:100%;margin-top:2px;}';
        (document.head || document.documentElement).appendChild(st);
      }
    } catch (e) {}

    /* ---------- 对外接口（chat.js 用） ---------- */
    window.curfewCfg = cfg;
    window.curfewSetCfg = setCfg;
    window.curfewActive = active;
    window.curfewStatusText = statusText;
    window.curfewQueueLen = qLen;
    window.curfewQueueClear = qClear;
    window.curfewPush = pushItem;
    window.curfewBuildPlan = buildPlan;
    window.curfewRunResume = function () { runResume(window.__activeCid || 'default'); };
    window.curfewSyncRow = syncRow;
    window.curfewFmt = fmtMin;
  } catch (e) {
    try { console.error('[curfew] init', e); } catch (x) {}
  }
})();
