/* 私人八改：意愿度打分（参考「言字卡」的话题意愿度十格打分尺）
   参考思路来自言序的「言字卡」（https://github.com/yanxu233/jinzhierchuanyanzika）：
   TA 回你话的时候偶尔附一个 1–10 分的十格尺，表示它「这次有多想说这个话题」。
   按 mochi 的结构重写（不照搬代码）：
     - 存法：某条 TA 消息上的 rec.will = { v: 1..10, ts, mine }，跟着消息一起走，
       刷新、跨桌面恢复、备份导出都还在；
     - 渲染：chat.js 渲染消息时调 window.willingHtml(rec) 生成那一小截 HTML；
     - 交互：点某一格＝立刻定分；按住拖＝连续跟着手指走，松手定分并锁住；
            已经锁定的不再改（想改就长按小标，清掉重新掷）。
     - 开关：桌面设置 → TA 的意愿度打分（默认关）

   存储（当前联系人命名空间）：
     will-en       '1' 开 / '0' 关
     will-prob     每条 TA 回复附带打分尺的概率（默认 25%）
*/
(function () {
  'use strict';

  function S() { try { return window.activeStore ? window.activeStore() : null; } catch (e) { return null; } }
  function get(k, d) { try { var s = S(); var v = s ? s.get(k) : null; return v === null || v === undefined ? d : v; } catch (e) { return d; } }
  function set(k, v) { try { var s = S(); if (s) s.set(k, String(v)); } catch (e) {} }
  function toast(msg) { try { if (window.toast) window.toast(msg); } catch (e) {} }

  function en() { return String(get('will-en', '0')) === '1'; }
  function prob() { var n = parseInt(get('will-prob', '25'), 10); return isFinite(n) ? Math.max(0, Math.min(100, n)) : 25; }

  var WORDS = {
    10: '非常想说', 9: '很想说', 8: '挺想说', 7: '有点想说', 6: '有兴趣',
    5: '一般', 4: '有点勉强', 3: '不太想说', 2: '不太想聊', 1: '不想聊'
  };
  function word(v) { return WORDS[Math.max(1, Math.min(10, Math.round(v)))] || ''; }

  /* 渲染：chat.js 里拼这条消息时调 */
  window.willingHtml = function (rec) {
    try {
      if (!en()) return '';
      var w = rec && rec.will;
      if (!w || !w.v) return '';
      var v = Math.max(1, Math.min(10, Math.round(Number(w.v) || 0)));
      var locked = !!w.locked;
      var bars = '';
      for (var i = 1; i <= 10; i++) {
        bars += '<i data-wf="' + i + '" class="' + (i <= v ? 'on' : '') + '"></i>';
      }
      return '<div class="msg-will' + (locked ? ' locked' : '') + '" data-will="' + v + '" title="' +
        (locked ? 'TA 对这次话题的意愿：' + v + ' 分（' + word(v) + '）· 长按可重掷' : '按一按 / 拖一拖来定这个分') + '">' +
        '<span class="mw-tag">意愿度</span>' +
        '<span class="mw-bars">' + bars + '</span>' +
        '<span class="mw-num">' + v + '</span>' +
        '<span class="mw-word">' + word(v) + '</span>' +
        '</div>';
    } catch (e) { return ''; }
  };

  /* 给某条 TA 消息掷一个初始分：跟这句话的长度/情绪相关（说得越多＝越想说） */
  function rollFor(rec) {
    var t = String((rec && rec.text) || '');
    var base = 5;
    if (t.length > 40) base += 2;
    else if (t.length > 16) base += 1;
    else if (t.length > 0 && t.length < 6) base -= 1;
    if (window.curfewActive && window.curfewActive()) base -= 1;
    var v = base + Math.round((Math.random() - 0.5) * 5);
    return Math.max(1, Math.min(10, v));
  }

  /* TA 发完一条回复后调：掷不掷由概率决定。返回 true 表示附了一个尺 */
  window.willingMaybe = function (rec) {
    try {
      if (!en() || !rec) return false;
      if (rec.will) return false;
      if (Math.random() * 100 >= prob()) return false;
      rec.will = { v: rollFor(rec), ts: Date.now(), locked: false };
      return true;
    } catch (e) { return false; }
  };

  /* 把改动存回消息（chat.js 的 msgs / saveMsgs 是私有的，走它暴露的接口） */
  function persist(rec, will) {
    try {
      if (rec) rec.will = will;
      if (window.willingSave) window.willingSave(rec);
    } catch (e) {}
  }

  /* 交互：点在容器上（document 级代理，避免每渲染一次绑一次） */
  var drag = null;
  function barsOf(el) { return Array.prototype.slice.call(el.querySelectorAll('.mw-bars i')); }
  function preview(el, v) {
    var bars = barsOf(el);
    bars.forEach(function (b, i) { b.classList.toggle('on', i < v); });
    var num = el.querySelector('.mw-num');
    if (num) num.textContent = String(v);
    var w = el.querySelector('.mw-word');
    if (w) w.textContent = word(v);
    el.setAttribute('data-will', String(v));
  }
  function valueAt(el, x) {
    var bars = barsOf(el);
    if (!bars.length) return 0;
    var v = 0;
    for (var i = 0; i < bars.length; i++) {
      var r = bars[i].getBoundingClientRect();
      if (x >= r.left) v = i + 1;
    }
    return Math.max(1, Math.min(10, v));
  }
  function findWill(e) { return e.target && e.target.closest ? e.target.closest('.msg-will') : null; }
  function recOf(el) {
    try {
      var msgEl = el.closest('.msg');
      if (!msgEl || msgEl.dataset.idx === undefined) return null;
      var idx = Number(msgEl.dataset.idx);
      var arr = window.getChatMsgs ? window.getChatMsgs() : [];
      return arr[idx] || null;
    } catch (e) { return null; }
  }
  function lockWill(el, v) {
    var rec = recOf(el);
    if (!rec) { el.classList.add('locked'); return; }
    var will = rec.will || { ts: Date.now() };
    will.v = v;
    will.locked = true;
    persist(rec, will);
    el.classList.add('locked');
    el.setAttribute('data-will', String(v));
    el.title = 'TA 对这次话题的意愿：' + v + ' 分（' + word(v) + '）';
  }
  document.addEventListener('pointerdown', function (e) {
    var el = findWill(e);
    if (!el || el.classList.contains('locked')) return;
    var v = valueAt(el, e.clientX);
    if (!v) return;
    drag = { el: el, v: v, moved: false, x0: e.clientX };
    preview(el, v);
    try { el.setPointerCapture && el.setPointerCapture(e.pointerId); } catch (e2) {}
  }, true);
  document.addEventListener('pointermove', function (e) {
    if (!drag) return;
    if (Math.abs(e.clientX - drag.x0) > 2) drag.moved = true;
    var v = valueAt(drag.el, e.clientX);
    if (v && v !== drag.v) { drag.v = v; preview(drag.el, v); }
  }, true);
  document.addEventListener('pointerup', function (e) {
    if (!drag) return;
    var d = drag; drag = null;
    lockWill(d.el, d.v);
  }, true);
  document.addEventListener('pointercancel', function () {
    if (!drag) return;
    var d = drag; drag = null;
    lockWill(d.el, d.v);
  }, true);
  /* 长按已锁定的尺＝重掷一个分（想改就重掷，跟人一样不能假装没说过） */
  var holdT = null;
  document.addEventListener('pointerdown', function (e) {
    var el = findWill(e);
    if (!el || !el.classList.contains('locked')) return;
    holdT = setTimeout(function () {
      holdT = null;
      var rec = recOf(el);
      if (!rec) return;
      var v = rollFor(rec);
      rec.will = { v: v, ts: Date.now(), locked: false };
      persist(rec, rec.will);
      el.classList.remove('locked');
      el.title = '按一按 / 拖一拖来定这个分';
      preview(el, v);
      toast('重新掷了一个分：' + v + '（' + word(v) + '）');
    }, 650);
  }, true);
  ['pointerup', 'pointercancel', 'pointermove'].forEach(function (ev) {
    document.addEventListener(ev, function () { if (holdT) { clearTimeout(holdT); holdT = null; } }, true);
  });

  /* ---------------- 设置页接线 ---------------- */
  function bindSettings() {
    var en2 = document.getElementById('will-score-en');
    if (en2 && !en2.__willBound) {
      en2.__willBound = 1;
      en2.checked = en();
      en2.addEventListener('change', function () {
        set('will-en', en2.checked ? '1' : '0');
        toast(en2.checked ? 'TA 回你话时会偶尔带一个 1–10 的意愿度打分尺' : '已关闭意愿度打分');
      });
    }
    var pr = document.getElementById('will-score-prob');
    if (pr && !pr.__willBound) {
      pr.__willBound = 1;
      pr.value = String(prob());
      var lab = document.getElementById('will-score-prob-val');
      if (lab) lab.textContent = prob() + '%';
      var sync = function () {
        var v = Math.max(0, Math.min(100, parseInt(pr.value, 10) || 0));
        set('will-prob', v);
        if (lab) lab.textContent = v + '%';
      };
      pr.addEventListener('input', sync);
      pr.addEventListener('change', sync);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindSettings);
  else bindSettings();
  try { if (window.mochiOnDataReady) window.mochiOnDataReady(bindSettings); } catch (e) {}
  try { if (window.mochiOnSettingsOpen) window.mochiOnSettingsOpen(bindSettings); } catch (e) {}
})();
