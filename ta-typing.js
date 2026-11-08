/* ============================================================
 * 私人八改：拼音拼字（看 TA 打字 · 二代）
 * ------------------------------------------------------------
 * 灵感和交互参考：言字卡「拼音拼字」（https://github.com/yanxu233/jinzhierchuanyanzika）
 * 本文件为 mochi 自写实现，不复制其源码。
 *
 * 一句话流程：
 *   ① 命中是否进入「拼音模式」→ 进入后锁住回复机制，由本模块接管
 *   ② 从字卡库抽一个「半句」＋ 从拼音词池抽 1–2 个词
 *   ③ 用 pinyin-pro 把这些字转成拼音串
 *   ④ 小窗里先显示整串拼音，再一个字一个字变成汉字（打字机）
 *   ⑤ 拼完自己发到聊天；聊天里随时有「结束拼字」按钮
 *
 * 低耦合：不改 chat.js 里的回复本体，只在 chat.js 里加了 4 个很小的挂点
 *   （scheduleReply 开头 if(isPinyinMode) 接管 / replyOnce 开头 return /
 *     more-pytyping 按钮 / 设置行）。核心回复逻辑一行没动。
 *
 * 数据键（存 activeStore，即当前联系人桌面）：
 *   pyz-en      总开关，'1' / '0'（默认 '0'）
 *   pyz-chance  抽取概率：'0'-'100'，默认 25（「顺滑-随机」滑块只控这个）
 *   pyz-slide   '0'-'100'，默认 30（只影响抽取构成：字卡多还是拼音词多）
 *   pyz-pos     小窗位置
 *   pyz-custom  自定义拼音词池（JSON 数组）
 * ============================================================ */
(function () {
  'use strict';

  /* ---------------- 基础工具 ---------------- */
  var P = null;
  function lib() {
    if (P) return P;
    P = (window.pinyinPro && typeof window.pinyinPro.pinyin === 'function') ? window.pinyinPro : null;
    return P;
  }
  function store() { try { return window.activeStore(); } catch (e) { return null; } }
  function g(k, d) { var st = store(); var v = st ? st.get(k) : null; return (v === null || v === undefined || v === '') ? d : v; }
  function s(k, v) { var st = store(); if (st) st.set(k, String(v)); }
  function num(k, d) { var v = Number(g(k, d)); return isFinite(v) ? v : d; }
  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function toast(msg) {
    var t = document.getElementById('pyz-toast');
    if (!t) { t = document.createElement('div'); t.id = 'pyz-toast'; t.className = 'pyz-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._tm);
    t._tm = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function rnd(n) { return Math.floor(Math.random() * n); }
  function isHan(ch) { return /[\u4e00-\u9fff]/.test(ch); }
  function rng(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }

  /* ---------------- 拼音工具（全部走 pinyin-pro） ---------------- */
  // 整句 → 音节数组（无调）
  function sylls(text) {
    var p = lib(); if (!p) return [];
    try {
      return p.pinyin(String(text), { toneType: 'none', type: 'array', nonZh: 'consecutive' }).filter(function (x) { return x !== undefined && x !== null; });
    } catch (e) { return []; }
  }
  // 单字 → 音节
  function syllOf(ch) {
    var a = sylls(ch);
    return a.length ? String(a[0]).toLowerCase().replace(/[^a-z]/g, '') : '';
  }
  // 拼音串（空格分开）：句子显示用
  function pinyinLine(text) {
    return sylls(text).join(' ');
  }
  // 拼音缩写：首字母
  function initials(text) {
    return sylls(text).map(function (x) { return String(x).charAt(0); }).join('');
  }
  // 拼音匹配（候选字用）：比较首字母 + 完整音节
  function matchSyll(x, sy) {
    if (!x || !sy) return false;
    var a = String(x).toLowerCase().replace(/[^a-z]/g, '');
    var b = String(sy).toLowerCase().replace(/[^a-z]/g, '');
    if (!a || !b) return false;
    return a === b || a.charAt(0) === b.charAt(0);
  }

  /* ---------------- 模块一：拼音词池 + 字卡短句池 ---------------- */
  // 拼音词池：把「常用名词 / 动作 / 情绪 / 时间」拆成独立的词，供抽样补全
  var BUILTIN_WORDS = {
    time: ['今天', '明天', '昨天', '现在', '晚上', '早上', '中午', '半夜', '刚才', '等会儿', '以后', '以前', '周末', '这阵子', '最近', '一会儿', '下次', '改天'],
    act: ['吃饭', '睡觉', '发呆', '散步', '回家', '出门', '上班', '下班', '看书', '写字', '听歌', '唱歌', '喝水', '洗碗', '晒太阳', '吹风', '翻手机', '走神', '打哈欠', '伸懒腰', '熬夜', '赖床', '抱抱', '牵手'],
    mood: ['开心', '难过', '想你', '在意', '舍不得', '心疼', '安心', '踏实', '委屈', '别扭', '高兴', '无聊', '犯困', '有点累', '小别扭', '心软', '心慌', '紧张'],
    noun: ['天气', '外面', '屋里', '窗户', '月亮', '星星', '路灯', '晚风', '被子', '枕头', '手机', '消息', '照片', '影子', '街道', '地铁', '咖啡馆', '小院子']
  };
  var CUSTOM_WORDS = [];
  function customWords() {
    try { CUSTOM_WORDS = JSON.parse(g('pyz-custom', '[]')) || []; } catch (e) { CUSTOM_WORDS = []; }
    if (!Array.isArray(CUSTOM_WORDS)) CUSTOM_WORDS = [];
    return CUSTOM_WORDS.filter(function (w) { return typeof w === 'string' && w.trim() && /[\u4e00-\u9fff]/.test(w); });
  }
  function allWords() {
    var out = [];
    try {
      Object.keys(BUILTIN_WORDS).forEach(function (k) { BUILTIN_WORDS[k].forEach(function (w) { out.push(w); }); });
    } catch (e) {}
    customWords().forEach(function (w) { if (out.indexOf(w) < 0) out.push(w); });
    return out;
  }
  function pickWords(n) {
    var pool = allWords();
    if (!pool.length) return [];
    var res = [];
    for (var i = 0; i < n && pool.length; i++) {
      var j = rnd(pool.length);
      res.push(pool[j]);
      pool.splice(j, 1);
    }
    return res;
  }

  // 字卡短句池：从所有字卡里抽出 5–12 字的短句（含只有逗号前的一段）
  var SHORT_POOL = null;
  function pushCleaned(arr, raw) {
    var t = String(raw == null ? '' : raw).trim();
    if (!t) return;
    if (t.indexOf('data:') === 0 || t.indexOf('|||') >= 0) return;
    if (t.indexOf('@@m:') === 0) return;
    if (/\{[a-zA-Z_]+\}/.test(t)) return; // 模板占位
    if (!/[\u4e00-\u9fff]/.test(t)) return;
    var han = t.replace(/[^\u4e00-\u9fff，。！？、…~～·—\- ]/g, '');
    han = han.replace(/^\s+|\s+$/g, '');
    if (han.length < 5 || han.length > 12) return;
    if (arr.indexOf(han) < 0) arr.push(han);
  }
  function buildShortPool() {
    SHORT_POOL = [];
    var grab = function (cat) {
      try { (window.getDefaultCardGroups ? window.getDefaultCardGroups(cat) : []).forEach(function (gr) { (gr[1] || []).forEach(function (c) { pushCleaned(SHORT_POOL, c); }); }); } catch (e) {}
    };
    grab('chat'); grab('dict'); grab('main');
    try { (window.getCustomCards ? window.getCustomCards() : []).forEach(function (c) { pushCleaned(SHORT_POOL, c); }); } catch (e) {}
    return SHORT_POOL;
  }
  function shortPool() {
    if (!SHORT_POOL || !SHORT_POOL.length) buildShortPool();
    return SHORT_POOL || [];
  }
  function pickShort() {
    var p = shortPool();
    if (!p.length) return '';
    return p[rnd(p.length)];
  }

  // 抽「半句」：字卡短句优先按逗号切前一段，没有逗号就整句
  function pickHalf() {
    var s0 = pickShort();
    if (!s0) return '';
    var parts = s0.split(/[，。！？、]/).filter(function (x) { return x.trim(); });
    if (parts.length > 1 && Math.random() < 0.6) {
      var cands = parts.filter(function (x) { return x.length >= 4 && x.length <= 12; });
      if (cands.length) return cands[rnd(cands.length)];
    }
    return s0;
  }

  // 按「顺滑 ↔ 随机」组合一句话
  //   0  ＝ 80% 字卡半句 + 20% 词 / 20% 补词错字
  //   100 ＝ 30% 字卡半句 + 70% 词 / 60% 补词错字
  function composeSentence() {
    var slide = Math.max(0, Math.min(100, num('pyz-slide', 30)));
    var cardPct = 80 - slide * 0.5; // 80 → 30
    var useCard = Math.random() * 100 < cardPct;
    var half = useCard ? pickHalf() : '';
    var halves = half ? [half] : [];
    if (!half) {
      // 字卡抽不到半句（词池太小 / 没字卡）：用词拼
      var nn = 2 + (Math.random() < 0.5 ? 0 : 1);
      halves.push(pickWords(nn).join(''));
    }
    var wc = 1 + (Math.random() < 0.55 ? 1 : 0);
    var words = pickWords(wc);
    if (!halves.length && !words.length) return null;
    // 词有 20% 概率放到句首，更像「顺滑」时的自然口吻
    var sentenceParts = [];
    if (words.length && Math.random() < 0.2) { sentenceParts.push(words[0]); words = words.slice(1); }
    sentenceParts = sentenceParts.concat(halves, words);
    var text = sentenceParts.join('');
    if (!text || text.length < 3) return null;
    // 补词错字感：slide 越高，越可能把某几个字换成同音字
    var typoPct = 0 + slide * 0.6; // 0 → 60
    if (Math.random() * 100 < typoPct) text = applyTypos(text, slide);
    return text;
  }

  /* ---------------- 同音字池（错字感用） ---------------- */
  var HOMO = null;
  function homoIndex() {
    if (HOMO) return HOMO;
    HOMO = {};
    var chars = {};
    var collect = function (t) { String(t || '').split('').forEach(function (ch) { if (isHan(ch)) chars[ch] = 1; }); };
    try { (window.getDefaultCardGroups ? window.getDefaultCardGroups('dict') : []).forEach(function (gr) { (gr[1] || []).forEach(collect); }); } catch (e) {}
    try { (window.getDefaultCardGroups ? window.getDefaultCardGroups('chat') : []).forEach(function (gr) { (gr[1] || []).forEach(collect); }); } catch (e) {}
    allWords().forEach(collect);
    var p = lib();
    if (p) {
      Object.keys(chars).forEach(function (ch) {
        var sy = syllOf(ch);
        if (!sy) return;
        (HOMO[sy] = HOMO[sy] || []).push(ch);
      });
    }
    return HOMO;
  }
  function applyTypos(text, slide) {
    var h = homoIndex();
    var chars = text.split('');
    // 换 1 个字就够像"手滑"了，slide 高偶尔换 2 个
    var n = slide >= 70 ? (Math.random() < 0.45 ? 2 : 1) : 1;
    var tried = 0;
    while (n > 0 && tried < 12) {
      tried++;
      var i = rnd(chars.length);
      if (!isHan(chars[i])) continue;
      var sy = syllOf(chars[i]);
      var cand = (h[sy] || []).filter(function (c) { return c !== chars[i]; });
      if (!cand.length) continue;
      chars[i] = cand[rnd(cand.length)];
      n--;
    }
    return chars.join('');
  }

  /* ---------------- 候选：TA 拼音模式下逐字变汉字时的候选列表 ---------------- */
  function candidatesFor(ch, syll, slide) {
    var out = [ch];
    if (!syll) return out;
    var h = homoIndex();
    var others = (h[syll] || []).filter(function (c) { return c !== ch; });
    var maxN = slide < 30 ? 1 : (slide < 60 ? 2 : (slide < 85 ? 3 : 5));
    others.slice(0, maxN).forEach(function (c) { out.push(c); });
    if (slide >= 40) out.sort(function () { return Math.random() - 0.5; });
    return out.slice(0, 6);
  }

  /* ---------------- 拼音模式状态锁（供 chat.js 判断） ---------------- */
  // 锁在：等待用户发言 / 正在拼字时。一旦触发或关闭就解锁。
  var modeOn = false;
  var WAIT = false;
  function setMode(on, why) {
    on = !!on;
    if (on === modeOn) { paintStartBtn(); return; }
    modeOn = on;
    try { document.dispatchEvent(new CustomEvent('pyz:mode', { detail: { on: on, why: why || '' } })); } catch (e) {}
    paintChatBar();
    paintStartBtn();
  }
  // 公开：聊天那边的 scheduleReply / replyOnce 用
  window.isPinyinMode = function () { return modeOn; };
  window.pinyinSpellModeOn = function () { return modeOn; };

  /* ---------------- 小窗 ---------------- */
  var el = null, bodyEl = null, actsEl = null, stEl = null;
  var playing = false, playToken = 0;

  function ensureEl() {
    if (el && document.body.contains(el)) return el;
    el = document.createElement('div');
    el.id = 'pyz-panel';
    el.className = 'pyz-panel';
    el.hidden = true;
    document.body.appendChild(el);
    return el;
  }
  function openPanel() {
    var e = ensureEl();
    if (!e.querySelector('.pyz-head')) e.innerHTML = shellHtml();
    e.hidden = false;
    bodyEl = e.querySelector('#pyz-body');
    actsEl = e.querySelector('#pyz-acts');
    stEl = e.querySelector('#pyz-st');
    applySavedPos(e);
    bindHeads();
    requestAnimationFrame(function () { e.classList.add('open'); });
  }
  function closePanel() {
    if (!el) return;
    el.classList.remove('open');
    setTimeout(function () { if (el) el.hidden = true; }, 220);
  }
  function shutPanel(why) {
    playToken++;
    playing = false;
    stopWaitLoop();
    setMode(false, 'close');
    closePanel();
    paintStartBtn();
    if (why) toast(why);
  }
  function paintBody(pinyinStr, doneStr, cands, hl) {
    if (!bodyEl) bodyEl = el && el.querySelector('#pyz-body');
    if (!bodyEl) return;
    var cHtml = '';
    if (cands && cands.length) {
      cHtml = '<div class="pyz-cand">' + cands.map(function (c) {
        return '<button class="pyz-cand-w' + (c === hl ? ' hl' : '') + '" type="button">' + esc(c) + '</button>';
      }).join('') + '</div>';
    }
    bodyEl.innerHTML =
      '<div class="pyz-sy-input"><span class="pyz-badge">拼</span><span class="pyz-sy">' + esc(pinyinStr || '') + '</span></div>' +
      '<div class="pyz-done">' + (doneStr ? '<span class="pyz-done-t">' + esc(doneStr) + '</span><span class="pyz-caret"></span>' : '') + '</div>' +
      cHtml;
  }
  function paintActs(html) { if (actsEl) actsEl.innerHTML = html || ''; }
  function setStatus(t) { if (stEl) stEl.textContent = t || ''; }

  function shellHtml() {
    return '' +
      '<div class="pyz-head"><span class="pyz-dot"></span><b class="pyz-title">拼音拼字</b><span class="pyz-st" id="pyz-st"></span>' +
      '<span class="pyz-drag-hint" title="按住这里拖动小窗，双击复位">⣿</span>' +
      '<button class="pyz-x" id="pyz-x" type="button">×</button></div>' +
      '<div class="pyz-body" id="pyz-body"></div>' +
      '<div class="pyz-acts" id="pyz-acts"></div>';
  }

  function bindHeads() {
    if (!el) return;
    var x = el.querySelector('#pyz-x');
    if (x) x.onclick = function () { shutPanel(); };
    if (!el.__pyzDrag) {
      el.__pyzDrag = 1;
      bindDrag(el.querySelector('.pyz-head'));
    }
  }

  /* ---- 拖动 + 位置记忆 ---- */
  function applySavedPos(e) {
    var p = null;
    try { p = JSON.parse(g('pyz-pos', '')); } catch (e2) { p = null; }
    if (!p || !isFinite(p.x) || !isFinite(p.y)) {
      e.style.left = ''; e.style.top = ''; e.style.right = ''; e.style.bottom = '';
      return;
    }
    var vw = window.innerWidth, vh = window.innerHeight;
    var w = e.offsetWidth || 320, h = e.offsetHeight || 320;
    var x = Math.max(4, Math.min(vw - w - 4, Math.round(p.x * vw)));
    var y = Math.max(4, Math.min(vh - h - 4, Math.round(p.y * vh)));
    e.style.left = x + 'px'; e.style.top = y + 'px';
    e.style.right = 'auto'; e.style.bottom = 'auto';
  }
  function bindDrag(head) {
    if (!head || head.__pyzDragBound) return;
    head.__pyzDragBound = 1;
    var st = null;
    head.addEventListener('pointerdown', function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest('#pyz-x')) return;
      var r = el.getBoundingClientRect();
      st = { x0: ev.clientX, y0: ev.clientY, l: r.left, t: r.top, w: r.width, h: r.height, moved: false };
      el.style.left = r.left + 'px'; el.style.top = r.top + 'px';
      el.style.right = 'auto'; el.style.bottom = 'auto';
      el.classList.add('pyz-dragging');
      try { head.setPointerCapture(ev.pointerId); } catch (e) {}
      ev.preventDefault();
    });
    head.addEventListener('pointermove', function (ev) {
      if (!st) return;
      var dx = ev.clientX - st.x0, dy = ev.clientY - st.y0;
      if (Math.abs(dx) + Math.abs(dy) > 3) st.moved = true;
      var vw = window.innerWidth, vh = window.innerHeight;
      var nx = Math.max(4, Math.min(vw - st.w - 4, st.l + dx));
      var ny = Math.max(4, Math.min(vh - st.h - 4, st.t + dy));
      el.style.left = nx + 'px'; el.style.top = ny + 'px';
    });
    var end = function () {
      if (!st) return;
      var moved = st.moved;
      st = null;
      el.classList.remove('pyz-dragging');
      if (!moved) return;
      var r = el.getBoundingClientRect();
      s('pyz-pos', JSON.stringify({ x: r.left / window.innerWidth, y: r.top / window.innerHeight }));
    };
    head.addEventListener('pointerup', end);
    head.addEventListener('pointercancel', end);
    head.addEventListener('dblclick', function () {
      el.style.left = ''; el.style.top = ''; el.style.right = ''; el.style.bottom = '';
      s('pyz-pos', '');
    });
  }

  /* ---------------- 演出核心：先拼音串 → 逐字变汉字 ---------------- */
  function speedBase() { // 顺滑 90ms / 随机 230ms
    var v = Math.max(0, Math.min(100, num('pyz-slide', 30)));
    return Math.round(90 + v * 1.4);
  }
  function thinkBase() { // 每个字选字之前想一想
    var v = Math.max(0, Math.min(100, num('pyz-slide', 30)));
    return Math.round(120 + v * 2.4);
  }

  // sentence：最终汉字句；onSend(sentence) 返回 Promise / truthy 表示已处理
  function playSentence(sentence) {
    var p = lib();
    if (!p) { toast('拼音库没加载好（js/vendor/pinyin-pro.min.js）'); return Promise.resolve(false); }
    if (!sentence) { toast('没有可拼的内容'); return Promise.resolve(false); }
    var my = ++playToken;
    playing = true;
    openPanel();
    setStatus('正在拼字…');
    paintActs('');

    var chars = String(sentence).split('');
    var pyLine = pinyinLine(sentence); // 整句拼音串：一次性显示
    var done = '';
    var slide = Math.max(0, Math.min(100, num('pyz-slide', 30)));
    var i = 0;

    paintBody(pyLine, '', []);
    return (async function () {
      await sleep(420);
      if (my !== playToken) return false;
      while (i < chars.length) {
        if (my !== playToken) return false;
        var ch = chars[i];
        if (!isHan(ch)) {
          done += ch;
          paintBody(pyLine, done, []);
          i++;
          await sleep(90);
          continue;
        }
        var sy = syllOf(ch);
        var cands = candidatesFor(ch, sy, slide);
        // 候选高亮先把真正要选的字标红，然后 200ms 后点上去
        paintBody(pyLine, done, cands, null);
        await sleep(thinkBase() + rnd(120));
        if (my !== playToken) return false;
        // 随机度高时偶尔先"手滑"点错一下
        var slip = slide >= 55 && cands.length > 1 && Math.random() < (slide - 40) / 500;
        if (slip) {
          paintBody(pyLine, done, cands, cands.filter(function (c) { return c !== ch; })[0]);
          await sleep(220);
          if (my !== playToken) return false;
        }
        paintBody(pyLine, done, cands, ch);
        await sleep(140);
        if (my !== playToken) return false;
        done += ch;
        paintBody(pyLine, done, []);
        i++;
        await sleep(speedBase());
      }
      if (my !== playToken) return false;
      paintBody(pyLine, done, []);
      setStatus('拼好了');
      playing = false;
      return true;
    })();
  }

  /* ---------------- 发到聊天 ---------------- */
  function sendToChat(sentence, opt) {
    opt = opt || {};
    try {
      if (window.chatAddIn) {
        var o = { silent: false, dedupExempt: true, rateAllow: true, nightAllow: true, enter: true };
        if (opt.tag) { o.tag = opt.tag; o.tagNoDup = true; }
        window.chatAddIn(sentence, o);
      }
    } catch (e) { toast('发送失败：' + (e.message || '')); }
  }
  function saveFree(sentence) {
    try { if (window.dreamFreeSave && window.dreamFreeSave(sentence)) { toast('已存进「梦角自由造句」'); return true; } } catch (e) {}
    return false;
  }

  /* ---------------- 对话回复：等你说完，TA 拼一句回 ---------------- */
  var waitTimer = null;
  function stopWaitLoop() { if (waitTimer) { clearInterval(waitTimer); waitTimer = null; } }
  function startWaitLoop() {
    stopWaitLoop();
    if (!el || !modeOn) return;
    var secId = window.__activeCid || 'default';
    var tsOf = function (m) { return Number(m && (m.dAt || m.ts)) || 0; };
    var lastUserTs = 0;
    try {
      var list = (window.getChatMsgs && window.getChatMsgs()) || [];
      for (var i = list.length - 1; i >= 0; i--) {
        if (list[i] && list[i].side === 'out') { lastUserTs = tsOf(list[i]); break; }
      }
    } catch (e) {}
    waitTimer = setInterval(async function () {
      if ((window.__activeCid || 'default') !== secId) { stopWaitLoop(); return; }
      if (!modeOn || playing) return;
      var l2 = [];
      try { l2 = (window.getChatMsgs && window.getChatMsgs()) || []; } catch (e) { return; }
      var userMsg = null;
      for (var k = l2.length - 1; k >= 0; k--) { if (l2[k] && l2[k].side === 'out') { userMsg = l2[k]; break; } }
      if (!userMsg) return;
      if (tsOf(userMsg) <= lastUserTs) return;
      lastUserTs = tsOf(userMsg);
      if (userMsg.fail || userMsg.revoked) return;
      // 你在说话 → TA 拼一句
      var sentence = composeSentence();
      if (!sentence) { setStatus('字卡库是空的，去加几张字卡'); return; }
      setStatus('正在回你…');
      var ok = await playSentence(sentence);
      if (!ok) return;
      sendToChat(sentence, { tag: '拼音拼字' });
      setStatus('拼完了，等你再说…');
    }, 1200);
  }

  // 进入「等待你发言」状态：打开小窗，标出「随时会拼」
  function enterWaitMode(reason) {
    var e = ensureEl();
    e.__pyzLast = 'reply';
    openPanel();
    if (!el.querySelector('.pyz-head')) el.innerHTML = shellHtml();
    setMode(true, reason || 'on');
    playing = false;
    playToken++;
    setStatus('等你说话…');
    paintBody('', '', []);
    paintActs(
      '<button class="pyz-btn pyz-primary" id="pyz-play" type="button">现在就拼一句</button>' +
      '<button class="pyz-btn pyz-stop" id="pyz-stop" type="button">结束拼字</button>'
    );
    if (bodyEl) bodyEl.innerHTML = '<div class="pyz-hint-main">你正常聊天就行。你每说一句，TA 会先敲一串拼音，再一个字一个字选出来发给你。想停下就点「结束拼字」。</div>';
    var play = el.querySelector('#pyz-play');
    if (play) play.onclick = function () { manualOne(); };
    var stop = el.querySelector('#pyz-stop');
    if (stop) stop.onclick = function () { shutPanel('已结束拼字，回复恢复原来的样子'); };
    bindChatBar();
    startWaitLoop();
  }

  // 手动：进 WAIT，立刻拼一句
  async function manualOne() {
    if (playing) return;
    var sentence = composeSentence();
    if (!sentence) { toast('字卡库和拼音词池都是空的，先去加几张字卡'); return; }
    setStatus('正在拼一句…');
    var ok = await playSentence(sentence);
    if (!ok) return;
    sendToChat(sentence, { tag: '拼音拼字' });
    if (modeOn) { setStatus('拼完了，等你再说…'); paintActs('<button class="pyz-btn pyz-primary" id="pyz-play2" type="button">再拼一句</button><button class="pyz-btn pyz-stop" id="pyz-stop2" type="button">结束拼字</button>'); }
    var p2 = el && el.querySelector('#pyz-play2');
    if (p2) p2.onclick = function () { manualOne(); };
    var s2 = el && el.querySelector('#pyz-stop2');
    if (s2) s2.onclick = function () { shutPanel('已结束拼字，回复恢复原来的样子'); };
  }

  /* ---------------- 自由组句（用户视角外挂输入法） ---------------- */
  // 独立小窗：拼音输入 → 候选 → 上屏；搜索字卡短句 → 添加；拼完可选发送 / 清空 / 存
  var freeEl = null, freeState = null;

  function ensureFreeEl() {
    if (freeEl && document.body.contains(freeEl)) return freeEl;
    freeEl = document.createElement('div');
    freeEl.id = 'pyz-free';
    freeEl.className = 'pyz-panel pyz-free';
    document.body.appendChild(freeEl);
    freeEl.innerHTML =
      '<div class="pyz-head"><span class="pyz-dot pyz-dot-2"></span><b class="pyz-title">拼音拼字 · 自由造句</b><span class="pyz-st" id="pyz-f-st"></span>' +
      '<span class="pyz-drag-hint" title="按住这里拖动小窗，双击复位">⣿</span>' +
      '<button class="pyz-x" id="pyz-f-x" type="button">×</button></div>' +
      '<div class="pyz-f-search"><input type="text" id="pyz-f-q" placeholder="搜字卡短句：拼音首字母或关键词"><button class="pyz-btn pyz-f-go" id="pyz-f-go" type="button">搜</button></div>' +
      '<div class="pyz-f-res" id="pyz-f-res"></div>' +
      '<div class="pyz-f-screen" id="pyz-f-screen"></div>' +
      '<div class="pyz-f-cand" id="pyz-f-cand"></div>' +
      '<div class="pyz-f-ime"><span class="pyz-f-ime-lb">拼音</span><input type="text" id="pyz-f-ime" placeholder="n i h a o …" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="pyz-btn pyz-f-back" id="pyz-f-back" type="button">⌫</button></div>' +
      '<div class="pyz-f-acts">' +
        '<button class="pyz-btn pyz-primary" id="pyz-f-send" type="button">发送到聊天</button>' +
        '<button class="pyz-btn pyz-f-start" id="pyz-f-start" type="button">开始</button>' +
        '<button class="pyz-btn pyz-f-clr" id="pyz-f-clr" type="button">清空</button>' +
      '</div>' +
      '<div class="pyz-f-foot"><span class="pyz-f-space" id="pyz-f-space" role="button">空格</span><span class="pyz-f-hint">拼音用空格或直接连写；点候选字上屏</span></div>';
    freeEl.hidden = true;
    var x = freeEl.querySelector('#pyz-f-x'); if (x) x.onclick = function () { closeFree(); };
    var q = freeEl.querySelector('#pyz-f-q');
    var go = freeEl.querySelector('#pyz-f-go');
    if (go) go.onclick = function () { freeSearch(q ? q.value : ''); };
    if (q) q.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); freeSearch(q.value); } });
    var ime = freeEl.querySelector('#pyz-f-ime');
    if (ime) ime.addEventListener('input', freeRenderCand);
    if (ime) ime.addEventListener('keydown', function (ev) {
      if (ev.key === ' ') { ev.preventDefault(); freeCommitFirst(); }
      else if (ev.key === 'Enter') { ev.preventDefault(); freeCommitFirst(); }
      else if (ev.key === 'Backspace' && !ime.value) { ev.preventDefault(); freeBackspace(); }
    });
    var back = freeEl.querySelector('#pyz-f-back'); if (back) back.onclick = function () { freeBackspace(); };
    var sp = freeEl.querySelector('#pyz-f-space'); if (sp) sp.onclick = function () { freeBackspace(); };
    var send = freeEl.querySelector('#pyz-f-send'); if (send) send.onclick = function () { freeSend(); };
    var stBtn = freeEl.querySelector('#pyz-f-start'); if (stBtn) stBtn.onclick = function () { freeToggleStart(); };
    var clr = freeEl.querySelector('#pyz-f-clr'); if (clr) clr.onclick = function () { freeState = ''; freeRenderScreen(); };
    var head = freeEl.querySelector('.pyz-head');
    if (head) bindFreeDrag(head);
    paintStartBtn();
    return freeEl;
  }

  // 「开始 / 结束」按钮外观跟当前模式同步
  function paintStartBtn() {
    var b = freeEl && freeEl.querySelector('#pyz-f-start');
    if (!b) return;
    var on = modeOn;
    b.textContent = on ? '结束' : '开始';
    b.classList.toggle('pyz-on', on);
    b.title = on ? '点一下结束拼音拼字，回复恢复正常的字卡回复' : '点一下，接下来 TA 会用拼音拼字回你';
    var st = freeEl && freeEl.querySelector('#pyz-f-st');
    if (st) st.textContent = on ? '拼字回复中' : '';
  }
  // 自由小窗里的「开始 / 结束」
  function freeToggleStart() {
    if (modeOn) {
      shutPanel('已结束拼音拼字，回复恢复正常的字卡回复');
      paintStartBtn();
      return;
    }
    // enterWaitMode 已经把主拼字小窗摆好、开始等你说话
    enterWaitMode('free');
    paintStartBtn();
  }

  function bindFreeDrag(head) {
    if (!head || head.__pyzDragBound) return;
    head.__pyzDragBound = 1;
    var st = null;
    head.addEventListener('pointerdown', function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest('#pyz-f-x')) return;
      var r = freeEl.getBoundingClientRect();
      st = { x0: ev.clientX, y0: ev.clientY, l: r.left, t: r.top, w: r.width, h: r.height, moved: false };
      freeEl.style.left = r.left + 'px'; freeEl.style.top = r.top + 'px';
      freeEl.style.right = 'auto'; freeEl.style.bottom = 'auto';
      freeEl.classList.add('pyz-dragging');
      try { head.setPointerCapture(ev.pointerId); } catch (e) {}
      ev.preventDefault();
    });
    head.addEventListener('pointermove', function (ev) {
      if (!st) return;
      var dx = ev.clientX - st.x0, dy = ev.clientY - st.y0;
      if (Math.abs(dx) + Math.abs(dy) > 3) st.moved = true;
      var vw = window.innerWidth, vh = window.innerHeight;
      freeEl.style.left = Math.max(4, Math.min(vw - st.w - 4, st.l + dx)) + 'px';
      freeEl.style.top = Math.max(4, Math.min(vh - st.h - 4, st.t + dy)) + 'px';
    });
    var end = function () {
      if (!st) return;
      var moved = st.moved;
      st = null;
      freeEl.classList.remove('pyz-dragging');
      if (!moved) return;
      var r = freeEl.getBoundingClientRect();
      s('pyz-pos-free', JSON.stringify({ x: r.left / window.innerWidth, y: r.top / window.innerHeight }));
    };
    head.addEventListener('pointerup', end);
    head.addEventListener('pointercancel', end);
    head.addEventListener('dblclick', function () { freeEl.style.left = ''; freeEl.style.top = ''; freeEl.style.right = ''; freeEl.style.bottom = ''; s('pyz-pos-free', ''); });
  }

  function openFree() {
    ensureFreeEl();
    freeEl.hidden = false;
    freeState = freeState || '';
    try {
      var p = JSON.parse(g('pyz-pos-free', ''));
      if (p && isFinite(p.x) && isFinite(p.y)) {
        var vw = window.innerWidth, vh = window.innerHeight;
        var w = freeEl.offsetWidth || 340, h = freeEl.offsetHeight || 420;
        freeEl.style.left = Math.max(4, Math.min(vw - w - 4, Math.round(p.x * vw))) + 'px';
        freeEl.style.top = Math.max(4, Math.min(vh - h - 4, Math.round(p.y * vh))) + 'px';
        freeEl.style.right = 'auto'; freeEl.style.bottom = 'auto';
      }
    } catch (e) {}
    freeRenderScreen();
    freeRenderCand();
    paintStartBtn();
    var q = freeEl.querySelector('#pyz-f-q');
    if (q) q.value = '';
    freeSearch('');
    requestAnimationFrame(function () { freeEl.classList.add('open'); });
  }
  function closeFree() {
    if (!freeEl) return;
    freeEl.classList.remove('open');
    setTimeout(function () {
      if (!freeEl) return;
      freeEl.hidden = true;
      // 小窗关了但还在拼字模式里：把顶栏亮出来，别让人没处点「结束」
      paintChatBar();
    }, 220);
  }

  // 搜索字卡短句：拼音首字母 / 关键词 / 拼音全拼
  function freeSearch(q) {
    var res = freeEl && freeEl.querySelector('#pyz-f-res');
    if (!res) return;
    var k = String(q || '').trim().toLowerCase();
    var pool = shortPool();
    var hits = [];
    if (!k) {
      // 空搜索：随机给 8 条
      var idx = rng(pool.length).sort(function () { return Math.random() - 0.5; });
      for (var i = 0; i < Math.min(8, idx.length); i++) hits.push(pool[idx[i]]);
    } else {
      var isPy = /^[a-z]+$/.test(k);
      for (var j = 0; j < pool.length && hits.length < 30; j++) {
        var t = pool[j];
        if (!isPy) { if (t.indexOf(k) >= 0) hits.push(t); continue; }
        if (initials(t).indexOf(k) >= 0) { hits.push(t); continue; }
        var full = sylls(t).join('');
        if (full.indexOf(k) >= 0) hits.push(t);
      }
    }
    if (!hits.length) { res.innerHTML = '<div class="pyz-hint">没找到。换个关键词，或者直接把拼音打到下面用字卡里的字拼。</div>'; return; }
    res.innerHTML = hits.map(function (t, i2) {
      return '<button class="pyz-f-chip" type="button" data-i="' + i2 + '">' + esc(t) + '</button>';
    }).join('');
    res.querySelectorAll('.pyz-f-chip').forEach(function (b) {
      b.onclick = function () { freeState += hits[Number(b.dataset.i)]; freeRenderScreen(); };
    });
  }

  function freeRenderScreen() {
    var sc = freeEl && freeEl.querySelector('#pyz-f-screen');
    if (!sc) return;
    var t = freeState || '';
    sc.innerHTML = t ? '<span class="pyz-f-out">' + esc(t) + '</span>' : '<span class="pyz-f-ph">把字拼到这里…</span>';
  }

  function freeRenderCand() {
    var wrap = freeEl && freeEl.querySelector('#pyz-f-cand');
    if (!wrap) return;
    var ime = freeEl.querySelector('#pyz-f-ime');
    var q = (ime ? ime.value : '').toLowerCase().replace(/[^a-z]/g, '');
    if (!q) { wrap.innerHTML = ''; return; }
    var sy0 = q.charAt(0);
    if (!/^[a-z]/.test(sy0)) { wrap.innerHTML = ''; return; }
    // 先用首字母匹配，再从「字典 + 字卡」里找字
    var chars = '';
    var collect = function (t) { String(t || '').split('').forEach(function (ch) { if (isHan(ch)) chars += ch; }); };
    try { (window.getDefaultCardGroups ? window.getDefaultCardGroups('dict') : []).forEach(function (gr) { (gr[1] || []).forEach(collect); }); } catch (e) {}
    try { (window.getDefaultCardGroups ? window.getDefaultCardGroups('chat') : []).forEach(function (gr) { (gr[1] || []).forEach(collect); }); } catch (e) {}
    allWords().forEach(collect);
    var seen = {}, out = [];
    chars.split('').forEach(function (ch) {
      if (seen[ch]) return;
      var sy = syllOf(ch);
      if (!sy) return;
      if (!(sy.indexOf(q) === 0 || sy.charAt(0) === q.charAt(0))) return;
      seen[ch] = 1; out.push({ ch: ch, sy: sy });
    });
    out.sort(function (a, b) {
      var ea = a.sy === q ? 0 : 1, eb = b.sy === q ? 0 : 1;
      return ea - eb;
    });
    if (!out.length) { wrap.innerHTML = '<div class="pyz-hint" style="padding:4px 0">没有匹配的字，试试别的拼音</div>'; return; }
    wrap.innerHTML = out.slice(0, 24).map(function (o, i) {
      return '<button class="pyz-cand-w' + (o.sy === q ? ' hl' : '') + '" type="button" data-i="' + i + '">' + esc(o.ch) + '</button>';
    }).join('');
    wrap.querySelectorAll('.pyz-cand-w').forEach(function (b) {
      b.onclick = function () { freeState += out[Number(b.dataset.i)].ch; ime.value = ''; freeRenderScreen(); freeRenderCand(); };
    });
  }

  function freeCommitFirst() {
    var wrap = freeEl && freeEl.querySelector('#pyz-f-cand');
    if (!wrap) return;
    var b = wrap.querySelector('.pyz-cand-w');
    if (b) b.click();
  }
  function freeBackspace() { freeState = String(freeState || '').slice(0, -1); freeRenderScreen(); }

  function freeSend() {
    var t = String(freeState || '').trim();
    if (!t) { toast('还没拼字呢'); return; }
    sendToChat(t, { tag: '拼音拼字' });
    saveFree(t);
    freeState = '';
    freeRenderScreen();
    toast('已发送，也存进「梦角自由造句」了');
  }

  /* ---------------- 聊天界面里的「结束拼字」条 ---------------- */
  var BAR = null;
  function ensureBar() {
    if (BAR && document.body.contains(BAR)) return BAR;
    BAR = document.createElement('div');
    BAR.id = 'pyz-bar';
    BAR.className = 'pyz-bar';
    BAR.hidden = true;
    document.body.appendChild(BAR);
    return BAR;
  }
  function paintChatBar() {
    var b = ensureBar();
    if (!modeOn) { b.hidden = true; return; }
    b.hidden = false;
    b.innerHTML = '<span class="pyz-bar-dot"></span><span class="pyz-bar-txt">拼音拼字中</span><button class="pyz-bar-x" type="button">结束拼字</button>';
    b.querySelector('.pyz-bar-x').onclick = function () { shutPanel('已结束拼字，回复恢复原来的样子'); };
  }
  function bindChatBar() { paintChatBar(); }

  /* ---------------- 对外接口 ---------------- */
  window.pinyinSpell = {
    // 开关
    enabled: function () { return g('pyz-en', '0') === '1'; },
    setEnabled: function (v) { s('pyz-en', v ? '1' : '0'); },
    // 概率（抽取）
    chance: function () { return num('pyz-chance', 25); },
    setChance: function (v) { s('pyz-chance', String(Math.max(0, Math.min(100, Math.round(Number(v) || 0))))); },
    // 顺滑-随机滑块：只控抽取构成
    slide: function () { return num('pyz-slide', 30); },
    setSlide: function (v) { s('pyz-slide', String(Math.max(0, Math.min(100, Math.round(Number(v) || 0))))); },
    // 模式
    modeOn: function () { return modeOn; },
    enterWait: function (why) { enterWaitMode(why); },
    exit: function (why) { shutPanel(why); },
    // 手动
    manualOne: manualOne,
    openFree: openFree,
    closeFree: closeFree,
    composeSentence: composeSentence,
    // 数据池调试
    shortCount: function () { return shortPool().length; },
    wordCount: function () { return allWords().length; },
    rebuild: function () { SHORT_POOL = null; HOMO = null; buildShortPool(); return shortPool().length; }
  };
  // 兼容旧的 chat.js 挂点（window.taTyping*）——chat.js 里现有调用不动也能跑
  window.taTypingOpen = function () { openFree(); };
  window.taTypingDrawer = function () { openDrawer(); };
  window.taTypingReplyLooping = function () { return modeOn; };
  window.taTypingPaintRow = function () { paintRowVal(); };

  // 兼容旧的自动演出挂点：问 (should) → 演 (play)，现在改成 1 次
  window.taTypingPlay = {
    should: function () {
      if (g('pyz-en', '0') !== '1') return false;
      if (modeOn || playing) return false;
      return Math.random() * 100 < num('pyz-chance', 25);
    },
    play: async function () {
      var sentence = composeSentence();
      if (!sentence) return false;
      var ok = await playSentence(sentence);
      if (!ok) return false;
      sendToChat(sentence, { tag: '拼音拼字' });
      setTimeout(function () { if (!playing && modeOn) { /* 保持开启 */ } }, 0);
      return true;
    }
  };

  /* ---------------- 设置行 / 抽屉 ---------------- */
  function paintRowVal() {
    var v = document.getElementById('cs-py-typing-val');
    if (!v) return;
    var on = g('pyz-en', '0') === '1';
    v.textContent = on ? ('开启 · ' + num('pyz-chance', 25) + '%') : '关闭';
  }

  var drawer = null;
  function openDrawer() {
    if (!drawer || !document.body.contains(drawer)) {
      drawer = document.createElement('div');
      drawer.className = 'rs-drawer tv-drawer pyz-drawer';
      drawer.hidden = true;
      var hostEl = document.querySelector('.phone') || document.body;
      hostEl.appendChild(drawer);
    }
    var ch = num('pyz-chance', 25), sl = num('pyz-slide', 30);
    drawer.className = 'rs-drawer tv-drawer pyz-drawer';
    drawer.innerHTML =
      '<div class="rs-hd"><div class="rs-hd-t">拼音拼字</div><button class="rs-x" type="button">✕</button></div>' +
      '<div class="rs-body tv-body">' +
        '<div class="rs-sec" style="padding-top:10px"><div class="tv-toggle"><div class="tv-toggle-txt"><div class="tv-toggle-name">开启拼音拼字</div><div class="tv-toggle-sub">开了之后，TA 的回复按概率走「拼音拼字」：小窗里先出现一串拼音，再一个字一个字变成汉字拼成句子。不拼时回复照旧直接出气泡。</div></div>' +
        '<label class="toggle"><input type="checkbox" id="pyz-d-en"' + (g('pyz-en', '0') === '1' ? ' checked' : '') + '><span class="tk"></span></label></div>' +
        '<div class="sl-row" style="margin-top:10px"><span class="sl-row-t">抽取概率</span><input class="sl-range" id="pyz-d-chance" type="range" min="0" max="100" step="1" value="' + ch + '"><b class="sl-vnum" id="pyz-d-chance-v">' + ch + '%</b></div>' +
        '<div class="sm-set-hint">TA 每条文字回复有多少机会改走拼音拼字。0%＝只能手动开，100%＝每条都拼。</div>' +
        '</div>' +
        '<div class="rs-sec"><div class="rs-sec-t">拼字的样子</div>' +
        '<div class="sl-row"><span class="sl-row-t">顺滑 ↔ 随机</span><input class="sl-range" id="pyz-d-slide" type="range" min="0" max="100" step="1" value="' + sl + '"><b class="sl-vnum" id="pyz-d-slide-v">' + sl + '%</b></div>' +
        '<div class="sm-set-hint">只决定「抽到哪句话」：往左＝字卡里现成的话多一些、打得快、几乎不出错；往右＝更多新组合的词，偶尔夹个同音字（错别字感）、打得更慢。</div>' +
        '</div>' +
        '<div class="rs-sec"><div class="rs-sec-t">随时看一眼</div>' +
        '<button class="rs-act" id="pyz-d-open" type="button">现在就拼一句给 TA 看</button>' +
        '<button class="rs-act" id="pyz-d-free" type="button" style="margin-top:8px">用拼音自己造句</button>' +
        '<div class="sm-set-hint">句子从字卡短句 + 拼音词池里抽，拼完进入「等你说话」：你每说一句 TA 回拼一句，聊天里随时能点「结束拼字」。下面那个是给你用的输入法。</div>' +
        '</div>' +
      '</div>';
    drawer.hidden = false;
    drawer.style.display = '';

    drawer.querySelector('.rs-x').onclick = function () { drawer.hidden = true; };
    var en = drawer.querySelector('#pyz-d-en');
    en.addEventListener('change', function () {
      s('pyz-en', en.checked ? '1' : '0');
      paintRowVal();
      if (en.checked) toast('已开启：TA 会偶尔用拼音拼字回你'); else { toast('已关闭'); setMode(false, 'off'); }
    });
    var cr = drawer.querySelector('#pyz-d-chance'), crv = drawer.querySelector('#pyz-d-chance-v');
    cr.addEventListener('input', function () { s('pyz-chance', cr.value); crv.textContent = cr.value + '%'; paintRowVal(); });
    var sl2 = drawer.querySelector('#pyz-d-slide'), slv = drawer.querySelector('#pyz-d-slide-v');
    sl2.addEventListener('input', function () { s('pyz-slide', sl2.value); slv.textContent = sl2.value + '%'; });
    drawer.querySelector('#pyz-d-open').addEventListener('click', function () {
      drawer.hidden = true;
      enterWaitMode('manual');
      manualOne();
    });
    drawer.querySelector('#pyz-d-free').addEventListener('click', function () {
      drawer.hidden = true;
      openFree();
    });
    paintRowVal();
  }

  /* ---------------- 入口绑定 ---------------- */
  function bindManualBtn() {
    var b = document.getElementById('more-pytyping');
    if (!b || b.__pyzBound) return;
    b.__pyzBound = 1;
    b.addEventListener('click', function (ev) {
      ev.preventDefault();
      openFree();
    });
  }
  function init() {
    bindManualBtn();
    paintRowVal();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  document.addEventListener('click', function (ev) {
    var t = ev.target;
    if (t && t.closest && (t.closest('#chat-more-btn') || t.closest('.more-tab'))) setTimeout(bindManualBtn, 0);
  }, true);
})();
