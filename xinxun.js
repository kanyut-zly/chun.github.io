/* 私人七改 · 心讯（只用字卡说话的另一个房间）
 *
 * 灵感来源：言字卡（小红书 / 抖音 @言序）的「心讯」——见 README「借鉴」段。
 * 这里按 mochi 的既有结构重写，不照搬人家代码与文案。
 *
 * 是什么（用户定的）：
 *   · 聊天页之外另开一页，你跟 TA 只用字卡说话，一句一句往上叠。
 *   · 你推几张、TA 回几张 —— 两档：一人一张（你推一张，TA 回一张）
 *     或随意张数（你推到爽，TA 按 1~3 张回）。
 *   · 不说话的时候，TA 也可能不请你，直接从自己的那叠里推一张过来。
 *   · 每一场进了哪些牌，整场攒成「卡册」一页；卡册按场次 / 按时间两种看法。
 *   · 跟主聊天完全分开：心讯的记录不进聊天、不进搜索、不占聊天统计。
 *
 * 页面上怎么认（用户要的「翻开才读到」没做，改成直接看到内容＋留白卡背）：
 *   · 每张牌是一个卡面：一句字 + 情绪色。卡片的颜色跟着「来源」走。
 *   · 新落下来的牌有一个小小的入场动效（减弱动效时直接出现）。
 *
 * 数据（存 activeStore，每个联系人各自一份；「卡册」按联系人各一本）：
 *   xinxun-en       'on' / 'off'        入口开关（桌面设置 → 功能开关）
 *   xinxun-room     JSON                当前这一场：{msgs:[{side,text,color,ts,src}], startedAt}
 *   xinxun-book     JSON                卡册：{sessions:[{id,title,ts,cards:[{text,color,src,ts}],n}]}
 *   xinxun-mode     'each' / 'free'     你推几张、TA 回几张：一人一张 / 随意张数
 *   xinxun-src      JSON                来源四枚开关 {main:1, mood:1, func:1, divine:0}
 *   xinxun-theme    'paper'/'gray'/'warm'/'night'   心讯这一页自己的底色
 *   xinxun-ta-auto  '1' / '0'           TA 不请看也会自己推一张（默认开）
 *
 * 对外接口：
 *   xinxunEnabled()  入口是否开着
 *   xinxunOpen()     打开心讯页
 *   xinxunClose()    回桌面
 */

(function () {
  try {
    (function () {
      'use strict';

      const KEY_EN = 'xinxun-en';
      const KEY_ROOM = 'xinxun-room';
      const KEY_BOOK = 'xinxun-book';
      const KEY_MODE = 'xinxun-mode';
      const KEY_SRC = 'xinxun-src';
      const KEY_THEME = 'xinxun-theme';
      const KEY_TA = 'xinxun-ta-auto';

      const MAX_ROOM = 200;        // 一场最多留多少张（再多把最早的挤到卡册）
      const MAX_SESSIONS = 80;      // 卡册最多留多少场
      const SRC_ALL = { main: 1, mood: 1, func: 1, divine: 0 };
      const SRC_LABEL = { main: '字卡库', mood: '聊天情绪', func: '功能字卡', divine: '占卜牌面' };
      const MODE_ALL = ['each', 'free'];
      const THEME_ALL = ['paper', 'gray', 'warm', 'night'];

      // 卡面色：按来源分几套，字卡本身的「情绪色」从这里取
      const PALETTE = {
        main: ['#f6f1e8', '#efe7d8', '#f3eee6', '#eef1e6'],
        mood: ['#fdecec', '#fbf0e2', '#f2ecfb', '#e8f4f0'],
        func: ['#eef3fb', '#f1f4ee', '#fbf2e8', '#f3eef7'],
        divine: ['#f0edf8', '#f7f1e6', '#eaf0f8', '#f5ecef']
      };
      const INK = { paper: '#2f2a24', gray: '#23252a', warm: '#3a2f24', night: '#ece9f2' };
      const BG = { paper: '#f7f4ee', gray: '#f2f3f5', warm: '#faf4ea', night: '#14131a' };

      let pendingBound = false;

      function curStore() {
        try { return window.activeStore ? window.activeStore() : (window.storeFor ? window.storeFor('default') : null); }
        catch (e) { return null; }
      }
      function g(k, def) {
        try { const st = curStore(); const v = st ? st.get(k) : null; return v === null || v === undefined || v === '' ? def : v; }
        catch (e) { return def; }
      }
      function s(k, v) { try { const st = curStore(); if (st) st.set(k, v); } catch (e) {} }
      function rm(k) { try { const st = curStore(); if (st) st.remove(k); } catch (e) {} }
      function jget(k, def) {
        try { const raw = g(k, null); if (!raw) return def; const o = JSON.parse(raw); return o == null ? def : o; }
        catch (e) { return def; }
      }
      function jset(k, o) { try { s(k, JSON.stringify(o)); } catch (e) {} }

      function toast(msg) { try { if (window.toast) window.toast(msg); } catch (e) {} }
      function esc(x) {
        return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
      }
      function pick(arr) { return arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : ''; }
      function taName() {
        try { return (window.chatPartnerName && window.chatPartnerName()) || 'TA'; } catch (e) { return 'TA'; }
      }
      function myName() { try { return g('lbl-user', '我') || '我'; } catch (e) { return '我'; } }
      // 显示前过一遍称呼（他 / 她 / TA），跟聊天一致
      function show(x) { try { return window.taFit ? window.taFit(String(x), window.__activeCid || 'default') : String(x); } catch (e) { return String(x); } }
      // 心讯里一张牌就一句短话：带颜文字的括号「说明」（(抱抱嘛) / (脸红)）换成不带括号的说法；
      // 纯符号的颜文字本身好看，原样留着。
      function cardText(c) {
        let t = String(c == null ? '' : c).trim();
        if (!t) return t;
        if (/^[（(][^（）()]{1,10}[）)]$/.test(t) && /[\u4e00-\u9fa5]/.test(t)) t = t.slice(1, -1);
        return t;
      }
      function nowTs() { return Date.now(); }
      function fmtClock(ts) {
        const d = new Date(ts || Date.now());
        const p = function (n) { return String(n).padStart(2, '0'); };
        return p(d.getHours()) + ':' + p(d.getMinutes());
      }
      function dayLabel(ts) {
        const d = new Date(ts), t = new Date();
        const d0 = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
        const x0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const diff = Math.round((d0 - x0) / 86400000);
        if (diff === 0) return '今天';
        if (diff === 1) return '昨天';
        return (d.getMonth() + 1) + '月' + d.getDate() + '日';
      }

      // ---------- 开关 ----------
      window.xinxunEnabled = function () { return g(KEY_EN, 'off') === 'on'; };

      function srcOn() {
        const raw = jget(KEY_SRC, null);
        const o = {};
        Object.keys(SRC_ALL).forEach(function (k) { o[k] = raw && raw[k] != null ? (raw[k] ? 1 : 0) : SRC_ALL[k]; });
        return o;
      }
      function mode() { const v = g(KEY_MODE, 'each'); return MODE_ALL.indexOf(v) >= 0 ? v : 'each'; }
      function theme() { const v = g(KEY_THEME, 'paper'); return THEME_ALL.indexOf(v) >= 0 ? v : 'paper'; }
      function taAuto() { return g(KEY_TA, '1') === '1'; }

      // ---------- 抽词：从字卡库里拿 ----------
      function normCard(c) {
        if (c == null) return '';
        if (typeof c === 'string') return c.trim();
        if (typeof c === 'object') {
          const t = c.text || c.t || c.body || c.v || '';
          return typeof t === 'string' ? t.trim() : '';
        }
        return '';
      }
      // 系统预设：getDefaultCards() 一次只掷一张（还带总开关与概率），拿不来整池；
      // 这里直接读内置那本分组表，只取「话」这一类，跳过挨打 / 状态 / 摸鱼这类专用池。
      const PRESET_SKIP = { touch: 1, interact: 1, fish: 1, status: 1, garden: 1, sync: 1, reach: 1, water: 1, piggy: 1, eat: 1, period: 1, room: 1, cjian: 1, drift: 1, deskcheck: 1, music: 1, dict: 1, dict_ext: 1 };
      function pushPreset() {
        const D = window.DEFAULT_CARD_DATA;
        if (!D) return [];
        const keys = ['main', 'kaomoji', 'emoji'];
        const out = [];
        keys.forEach(function (k) {
          if (PRESET_SKIP[k]) return;
          (D[k] || []).forEach(function (grp) {
            if (!Array.isArray(grp) || !Array.isArray(grp[1])) return;
            grp[1].forEach(function (c) { out.push(c); });
          });
        });
        return out;
      }
      function collectPool() {
        const on = srcOn();
        const out = [];
        function push(list, src) {
          if (!list) return;
          list.forEach(function (raw) {
            const t = normCard(raw);
            if (!t) return;
            // 太长的、带图的、占位符都别进心讯——心讯就是一句一句短话
            if (t.length > 60) return;
            if (/^data:/.test(t) || t.indexOf('<') >= 0) return;
            if (/\{[a-z]+\}/i.test(t)) return;
            const tx = cardText(t);
            if (!tx) return;
            out.push({ text: tx, src: src });
          });
        }
        try {
          if (on.main && window.getCustomCards) push(window.getCustomCards(), 'main');
        } catch (e) {}
        try {
          if (on.main) push(pushPreset(), 'main');
        } catch (e) {}
        try {
          if (on.func && window.getCustomFuncCards) {
            const cats = ['readquest'];
            cats.forEach(function (cat) { push(window.getCustomFuncCards(cat), 'func'); });
          }
        } catch (e) {}
        try {
          // 聊天情绪：字卡库里「聊天情绪」那一本，按组整本抽
          if (on.mood && window.getLibPool) {
            ['chatMood', 'moodReply', 'mood'].forEach(function (cat) {
              let arr = [];
              try { arr = window.getLibPool(cat, '', []) || []; } catch (e) {}
              push(arr, 'mood');
            });
          }
        } catch (e) {}
        try {
          // 聊天情绪自设：你自己填的那几组
          if (on.mood && window.getCustomFuncCards) {
            ['chatMood', 'mood'].forEach(function (cat) {
              let arr = [];
              try { arr = window.getCustomFuncCards(cat) || []; } catch (e) {}
              push(arr, 'mood');
            });
          }
        } catch (e) {}
        try {
          if (on.divine && window.getLibPool) {
            let arr = [];
            try { arr = window.getLibPool('divine', '', []) || []; } catch (e) {}
            push(arr, 'divine');
          }
        } catch (e) {}
        // 去重
        const seen = {}, uniq = [];
        out.forEach(function (c) { const k = c.text; if (!seen[k]) { seen[k] = 1; uniq.push(c); } });
        return uniq;
      }
      // 从池子里不重复地抽 n 张；池子不够时允许重抽
      function drawCards(n, avoid) {
        const pool = collectPool();
        const out = [];
        if (!pool.length) return out;
        const used = {};
        (avoid || []).forEach(function (t) { used[String(t)] = 1; });
        for (let i = 0; i < n; i++) {
          // 先挑没用过的；都用过了就从整池里随机
          let cand = pool.filter(function (c) { return !used[c.text]; });
          if (!cand.length) cand = pool;
          const c = cand[Math.floor(Math.random() * cand.length)];
          used[c.text] = 1;
          out.push(c);
        }
        return out;
      }
      function colorFor(src) {
        const arr = PALETTE[src] || PALETTE.main;
        return arr[Math.floor(Math.random() * arr.length)];
      }

      // ---------- 当前这一场 ----------
      function room() {
        const raw = jget(KEY_ROOM, null);
        if (!raw || !Array.isArray(raw.msgs)) return { msgs: [], startedAt: nowTs() };
        return { msgs: raw.msgs, startedAt: raw.startedAt || nowTs() };
      }
      function saveRoom(r) { jset(KEY_ROOM, r); }

      function roomCard(c, side) {
        return {
          side: side,
          text: c.text,
          src: c.src || 'main',
          color: colorFor(c.src || 'main'),
          ts: nowTs()
        };
      }
      function pushToRoom(cards, side) {
        const r = room();
        cards.forEach(function (c) { r.msgs.push(roomCard(c, side)); });
        // 超上限：把最早的几张并进卡册再挤掉
        if (r.msgs.length > MAX_ROOM) {
          const over = r.msgs.length - MAX_ROOM;
          const drop = r.msgs.splice(0, over);
          if (over > 0) {
            // 卡册保留一份
            const book = jget(KEY_BOOK, { sessions: [] });
            book.sessions = Array.isArray(book.sessions) ? book.sessions : [];
            book.sessions.unshift({ id: 's' + nowTs().toString(36), title: '接续（' + over + ' 张）', ts: nowTs(), cards: drop.map(function (m) { return { text: m.text, color: m.color, src: m.src, ts: m.ts, side: m.side }; }), n: drop.length });
            if (book.sessions.length > MAX_SESSIONS) book.sessions.length = MAX_SESSIONS;
            jset(KEY_BOOK, book);
          }
        }
        saveRoom(r);
        return r;
      }

      // ---------- 卡册 ----------
      function sessionTitle(cards) {
        const first = cards.find(function (c) { return c && c.text; });
        if (!first) return '一场';
        const t = String(first.text);
        return t.length > 14 ? t.slice(0, 14) + '…' : t;
      }
      function bookOut() {
        const r = room();
        if (!r.msgs.length) { toast('这一场还一张牌都没有'); return; }
        const book = jget(KEY_BOOK, { sessions: [] });
        book.sessions = Array.isArray(book.sessions) ? book.sessions : [];
        book.sessions.unshift({
          id: 's' + nowTs().toString(36),
          title: sessionTitle(r.msgs),
          ts: r.startedAt || nowTs(),
          cards: r.msgs.map(function (m) { return { text: m.text, color: m.color, src: m.src, ts: m.ts, side: m.side }; }),
          n: r.msgs.length
        });
        if (book.sessions.length > MAX_SESSIONS) book.sessions.length = MAX_SESSIONS;
        jset(KEY_BOOK, book);
        saveRoom({ msgs: [], startedAt: nowTs() });
        toast('收进卡册了：' + r.msgs.length + ' 张，这一场重新开始');
        renderRoom();
      }
      function newSession() {
        const r = room();
        if (!r.msgs.length) { toast('这一场还是空的，直接说吧'); return; }
        const ok = function () {
          const book = jget(KEY_BOOK, { sessions: [] });
          book.sessions = Array.isArray(book.sessions) ? book.sessions : [];
          book.sessions.unshift({
            id: 's' + nowTs().toString(36),
            title: sessionTitle(r.msgs), ts: r.startedAt || nowTs(),
            cards: r.msgs.map(function (m) { return { text: m.text, color: m.color, src: m.src, ts: m.ts, side: m.side }; }),
            n: r.msgs.length
          });
          if (book.sessions.length > MAX_SESSIONS) book.sessions.length = MAX_SESSIONS;
          jset(KEY_BOOK, book);
          saveRoom({ msgs: [], startedAt: nowTs() });
          renderRoom();
          toast('新开场了，上一场已经收进卡册');
        };
        if (window.openModal) {
          window.openModal('这一场换新的？（上一场会自动收进卡册）', '', function () { try { ok(); } catch (e) {} });
        } else { ok(); }
      }

      // ---------- TA 那边 ----------
      let taTimer = null;
      function taPickCount() {
        if (mode() === 'each') return 1;
        const r = Math.random();
        if (r < 0.55) return 1;
        if (r < 0.88) return 2;
        return 3;
      }
      function taReply(myTexts) {
        const n = taPickCount();
        const cards = drawCards(n, myTexts);
        if (!cards.length) return false;
        pushToRoom(cards, 'ta');
        return true;
      }
      function scheduleTaReply(myTexts) {
        const wait = 900 + Math.random() * 1800;
        const myPrefix = window.activePrefix ? window.activePrefix() : '';
        clearTimeout(taTimer);
        // 人可能在这 1~3 秒里切走 / 关掉这一页：到点再确认一次当前还在不在心讯
        taTimer = setTimeout(function () {
          try {
            if (window.activePrefix && window.activePrefix() !== myPrefix) return;
            if (!taReply(myTexts)) return;
            const p = page();
            if (!p || p.hidden) return;     // 已经切去别的页面：牌已经落进这一场，回来就看得到
            renderRoom(true);
          } catch (e) {}
        }, wait);
      }
      // TA 自己开口：不请也会来
      let idleTimer = null;
      function armIdle() {
        clearTimeout(idleTimer);
        if (!taAuto()) return;
        const wait = 45000 + Math.random() * 75000; // 45~120 秒
        idleTimer = setTimeout(function () {
          try {
            const p = page();
            if (!p || p.hidden) { armIdle(); return; }
            if (!taAuto()) return;
            const cards = drawCards(1 + (Math.random() < 0.3 ? 1 : 0), []);
            if (cards.length) { pushToRoom(cards, 'ta'); renderRoom(true); }
            armIdle();
          } catch (e) { armIdle(); }
        }, wait);
      }

      // ---------- 页面 ----------
      const PAGE_ID = 'page-xinxun';
      function page() { return document.getElementById(PAGE_ID); }
      function bodyEl() { const p = page(); return p ? p.querySelector('.xx-body') : null; }

      function skelHTML() {
        const th = theme();
        const on = srcOn();
        return '' +
          '<div class="xx-page" data-xx-theme="' + th + '" id="xx-shell">' +
            '<div class="xx-head">' +
              '<span class="ch-back xx-back" id="xx-back" title="回桌面"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></span>' +
              '<div class="xx-tt">' +
                '<div class="xx-name" id="xx-ta-name">' + esc(show(taName())) + '</div>' +
                '<div class="xx-sub">只用字卡说话 · <span id="xx-count">0</span> 张</div>' +
              '</div>' +
              '<span class="xx-hbtn" id="xx-book-btn" title="卡册"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4.5h6a2 2 0 012 2V20a2 2 0 00-2-2H4z"/><path d="M20 4.5h-6a2 2 0 00-2 2V20a2 2 0 012-2h6z"/></svg></span>' +
              '<span class="xx-hbtn" id="xx-more-btn" title="收进卡册 / 换新一场"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg></span>' +
              '<span class="xx-hbtn" id="xx-set-btn" title="心讯设置"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7"/></svg></span>' +
            '</div>' +
            '<div class="xx-body" id="xx-body"></div>' +
            '<div class="xx-foot" id="xx-foot">' +
              '<button class="xx-fbtn" id="xx-back-tip" title="从卡册里拿一张我喜欢的"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="12" height="15" rx="1.6"/><path d="M8 9h4M8 12h3"/><rect x="15.5" y="3" width="5" height="19" rx="1.6" opacity=".5"/></svg>我要推牌</button>' +
              '<button class="xx-fsend" id="xx-send">推 1 张</button>' +
            '</div>' +
          '</div>';
      }

      function mountPage() {
        let p = page();
        if (!p) {
          p = document.createElement('div');
          p.className = 'page';
          p.id = PAGE_ID;
          p.hidden = true;
          // 放在 page-chat 后面，跟别的页面同一层
          const anchor = document.getElementById('page-chat') || document.querySelector('.phone');
          if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(p, anchor.nextSibling);
          else document.body.appendChild(p);
        }
        p.innerHTML = skelHTML();
        bindPage();
      }

      function bindPage() {
        const p = page();
        if (!p) return;
        const back = p.querySelector('#xx-back');
        if (back) back.addEventListener('click', function () { closePage(); });
        const out = p.querySelector('#xx-back-tip');
        if (out) out.addEventListener('click', function () { drawMine(1); });
        const send = p.querySelector('#xx-send');
        if (send) {
          send.addEventListener('click', function () {
            const c = drawMine(mode() === 'each' ? 1 : (1 + Math.floor(Math.random() * 2)));
            if (c) { armIdle(); }
          });
        }
        const bk = p.querySelector('#xx-book-btn');
        if (bk) bk.addEventListener('click', function () { openBook(); });
        // 「⋯」：这一场说完了就收进卡册 / 直接换新的一场
        const more = p.querySelector('#xx-more-btn');
        if (more) more.addEventListener('click', function () { openMore(); });
        const st = p.querySelector('#xx-set-btn');
        if (st) st.addEventListener('click', function () { openSettings(); });
        syncSendLabel();
      }

      function syncSendLabel() {
        const p = page(); if (!p) return;
        const b = p.querySelector('#xx-send');
        if (b) b.textContent = mode() === 'each' ? '推 1 张' : '推到尽兴';
        const sub = p.querySelector('.xx-sub');
        if (sub) sub.innerHTML = '只用字卡说话 · <span id="xx-count">' + room().msgs.length + '</span> 张';
        const nm = p.querySelector('.xx-name');
        if (nm) nm.textContent = show(taName());
      }

      // 我推几张
      function drawMine(n) {
        const cards = drawCards(n, []);
        if (!cards.length) {
          toast('字卡库里还没词：先去「字卡库」加几张，或在设置 → 功能 → 心讯里把来源打开');
          return false;
        }
        pushToRoom(cards, 'me');
        renderRoom(true);
        syncSendLabel();
        scheduleTaReply(cards.map(function (c) { return c.text; }));
        return true;
      }

      // ---------- 渲染 ----------
      function renderRoom(scroll) {
        const b = bodyEl();
        if (!b) return;
        const r = room();
        if (!r.msgs.length) {
          b.innerHTML = '' +
            '<div class="xx-empty">' +
              '<div class="xx-empty-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M7.5 9h9M7.5 12.5h6"/><path d="M8 16.5h4"/></svg></div>' +
              '<div class="xx-empty-t">这一场还空着</div>' +
              '<div class="xx-empty-s">按下面「推 1 张」，从字卡库抽一张推过去。<br>TA 也会自己推回来——你们只用字卡说话。</div>' +
            '</div>';
          syncSendLabel();
          return;
        }
        // 按日子分组，左侧留一条时间竖线
        let html = '<div class="xx-flow">';
        let lastDay = '';
        r.msgs.forEach(function (m, i) {
          const d = dayLabel(m.ts);
          if (d !== lastDay) {
            lastDay = d;
            html += '<div class="xx-day"><span>' + esc(d) + '</span></div>';
          }
          const mine = m.side === 'me';
          html += '<div class="xx-row ' + (mine ? 'me' : 'ta') + '" data-i="' + i + '">' +
            '<div class="xx-card" style="background:' + esc(m.color || '#f6f1e8') + '">' +
              '<div class="xx-card-t">' + esc(show(m.text)) + '</div>' +
              '<div class="xx-card-m"><span class="xx-card-who">' + esc(mine ? myName() : taName()) + '</span><span class="xx-card-time">' + fmtClock(m.ts) + '</span></div>' +
            '</div>' +
          '</div>';
        });
        html += '</div>';
        b.innerHTML = html;
        syncSendLabel();
        if (scroll) {
          try { b.scrollTop = b.scrollHeight; } catch (e) {}
        }
      }

      // ---------- 「⋯」小面板：收进卡册 / 换新一场 ----------
      function openMore() {
        const mask = ensureMask();
        const r = room();
        mask.innerHTML = '<div class="xx-sheet xx-more">' +
          '<div class="xx-sheet-h"><span class="xx-sheet-t">这一场</span><button class="xx-sheet-x" id="xx-more-x">✕</button></div>' +
          '<div class="xx-sheet-b">' +
            '<button class="xx-rowbtn" id="xx-more-out"><b>收进卡册</b><span>整场存一页（' + r.msgs.length + ' 张），这一场从头再来</span></button>' +
            '<button class="xx-rowbtn" id="xx-more-new"><b>换新一场</b><span>上一场自动收进卡册，直接重新开一场</span></button>' +
          '</div>' +
        '</div>';
        mask.hidden = false;
        mask.querySelector('#xx-more-x').addEventListener('click', function () { mask.hidden = true; });
        mask.querySelector('#xx-more-out').addEventListener('click', function () { mask.hidden = true; bookOut(); });
        mask.querySelector('#xx-more-new').addEventListener('click', function () { mask.hidden = true; newSession(); });
      }

      // ---------- 卡册 ----------
      let bookMode = 'session';
      function openBook() {
        const book = jget(KEY_BOOK, { sessions: [] });
        const list = Array.isArray(book.sessions) ? book.sessions : [];
        const mask = document.getElementById('xx-mask');
        if (!mask) return;
        let html = '' +
          '<div class="xx-sheet xx-book">' +
            '<div class="xx-sheet-h">' +
              '<span class="xx-sheet-t">卡册</span>' +
              '<span class="xx-book-pill">' +
                '<button class="xx-pill' + (bookMode === 'session' ? ' on' : '') + '" data-bm="session">每一场</button>' +
                '<button class="xx-pill' + (bookMode === 'time' ? ' on' : '') + '" data-bm="time">按时间</button>' +
              '</span>' +
              '<button class="xx-sheet-x" id="xx-book-x">✕</button>' +
            '</div>' +
            '<div class="xx-sheet-b" id="xx-book-list">';
        if (!list.length) {
          html += '<div class="xx-book-empty">还没收过场子。<br>在上方点「收进卡册」，这一场就整场存一页。</div>';
        } else if (bookMode === 'session') {
          list.forEach(function (sess, si) {
            const cnt = {};
            (sess.cards || []).forEach(function (c) { cnt[c.text] = (cnt[c.text] || 0) + 1; });
            const uniq = Object.keys(cnt).length;
            html += '<div class="xx-sess" data-si="' + si + '">' +
              '<div class="xx-sess-h"><b>' + esc(sess.title || '一场') + '</b><span>' + dayLabel(sess.ts) + ' · ' + (sess.n || (sess.cards || []).length) + ' 张 / ' + uniq + ' 种</span></div>' +
              '<div class="xx-sess-row">';
            (sess.cards || []).slice(0, 30).forEach(function (c) {
              html += '<span class="xx-mini" style="background:' + esc(c.color || '#f6f1e8') + '" title="' + esc(c.text) + '">' + esc(String(c.text).slice(0, 12)) + (cnt[c.text] > 1 ? '<i>×' + cnt[c.text] + '</i>' : '') + '</span>';
            });
            html += '</div></div>';
          });
        } else {
          // 按时间：把所有场次里的牌摊平成一条时间线
          const flat = [];
          list.forEach(function (sess) { (sess.cards || []).forEach(function (c) { flat.push(c); }); });
          flat.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
          let day = '';
          flat.slice(0, 300).forEach(function (c) {
            const d = dayLabel(c.ts);
            if (d !== day) { day = d; html += '<div class="xx-day"><span>' + esc(d) + '</span></div>'; }
            html += '<div class="xx-tl"><span class="xx-tl-dot" style="background:' + esc(c.color || '#f6f1e8') + '"></span><span class="xx-tl-t">' + esc(show(c.text)) + '</span><span class="xx-tl-time">' + fmtClock(c.ts) + '</span></div>';
          });
          if (!flat.length) html += '<div class="xx-book-empty">卡册里还是空的。</div>';
        }
        html += '</div>';
        if (list.length) {
          html += '<div class="xx-sheet-f"><button class="xx-fbtn" id="xx-book-clear">清空卡册</button></div>';
        }
        html += '</div>';
        mask.innerHTML = html;
        mask.hidden = false;
        const x = mask.querySelector('#xx-book-x');
        if (x) x.addEventListener('click', function () { mask.hidden = true; });
        mask.querySelectorAll('[data-bm]').forEach(function (btn) {
          btn.addEventListener('click', function () { bookMode = btn.getAttribute('data-bm'); openBook(); });
        });
        // 点一场 → 展开整场
        mask.querySelectorAll('.xx-sess').forEach(function (row) {
          row.addEventListener('click', function () {
            const si = +row.getAttribute('data-si');
            const sess = list[si];
            if (!sess) return;
            const mask2 = document.getElementById('xx-mask');
            const items = (sess.cards || []).map(function (c) {
              return '<div class="xx-tl"><span class="xx-tl-dot" style="background:' + esc(c.color || '#f6f1e8') + '"></span><span class="xx-tl-t">' + esc(show(c.text)) + '</span><span class="xx-tl-time">' + fmtClock(c.ts) + '</span></div>';
            }).join('');
            mask2.innerHTML = '<div class="xx-sheet xx-book">' +
              '<div class="xx-sheet-h"><span class="xx-sheet-t">' + esc(sess.title || '一场') + '</span>' +
              '<button class="xx-sheet-x" id="xx-book-x2">✕</button></div>' +
              '<div class="xx-sheet-b">' + items + '</div>' +
              '<div class="xx-sheet-f"><button class="xx-fbtn" id="xx-book-back2">返回卡册</button></div></div>';
            mask2.hidden = false;
            mask2.querySelector('#xx-book-x2').addEventListener('click', function () { mask2.hidden = true; });
            mask2.querySelector('#xx-book-back2').addEventListener('click', function () { openBook(); });
          });
        });
        const clr = mask.querySelector('#xx-book-clear');
        if (clr) clr.addEventListener('click', function () {
          if (window.openModal) {
            window.openModal('清空整本卡册？心讯里正在说话的这一场不动。', '', function () {
              jset(KEY_BOOK, { sessions: [] });
              toast('卡册清空了');
              mask.hidden = true;
            });
          }
        });
      }

      // ---------- 设置 ----------
      function openSettings() {
        const mask = document.getElementById('xx-mask');
        if (!mask) return;
        const m = mode(), th = theme(), on = srcOn(), auto = taAuto();
        function sw(id, label, desc, checked) {
          return '<div class="xx-set-row"><div class="xx-set-tx"><b>' + label + '</b><span>' + desc + '</span></div>' +
            '<label class="toggle"><input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + '><span class="tk"></span></label></div>';
        }
        let html = '<div class="xx-sheet xx-set">' +
          '<div class="xx-sheet-h"><span class="xx-sheet-t">心讯设置</span><button class="xx-sheet-x" id="xx-set-x">✕</button></div>' +
          '<div class="xx-sheet-b">' +
            '<div class="xx-set-g">' +
              '<div class="xx-set-ttl">回牌</div>' +
              '<div class="xx-set-row"><div class="xx-set-tx"><b>你推几张、TA 回几张</b><span>' + (m === 'each' ? '现在：一人一张，你推几张 TA 就回几张' : '现在：你推到尽兴，TA 按 1~3 张回') + '</span></div></div>' +
              '<div class="xx-pillrow">' +
                '<button class="xx-pill' + (m === 'each' ? ' on' : '') + '" data-mode="each">一人一张</button>' +
                '<button class="xx-pill' + (m === 'free' ? ' on' : '') + '" data-mode="free">随意张数</button>' +
              '</div>' +
              sw('xx-ta-auto', 'TA 不请自己来', '隔一会儿 TA 也会往这一场里自己推一两张（45~120 秒掷一次）', auto) +
            '</div>' +
            '<div class="xx-set-g">' +
              '<div class="xx-set-ttl">牌从哪儿来</div>' +
              Object.keys(SRC_LABEL).map(function (k) {
                return sw('xx-src-' + k, SRC_LABEL[k], k === 'divine' ? '牌面卡（默认关，开了会多一层牌意）' : (k === 'func' ? '字卡库 → 功能字卡（含阅读批注）' : (k === 'mood' ? '聊天情绪词库' : '自建字卡 + 系统预设字卡')), !!on[k]);
              }).join('') +
            '</div>' +
            '<div class="xx-set-g">' +
              '<div class="xx-set-ttl">这一面的样式</div>' +
              '<div class="xx-pillrow">' +
                ['paper', 'gray', 'warm', 'night'].map(function (t) {
                  return '<button class="xx-pill xx-th xx-th-' + t + (th === t ? ' on' : '') + '" data-theme="' + t + '">' +
                    ({ paper: '素纸', gray: '雾灰', warm: '暖米', night: '夜色' })[t] + '</button>';
                }).join('') +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="xx-sheet-f">' +
            '<button class="xx-fbtn" id="xx-set-clear">清空这一场</button>' +
            '<button class="xx-fbtn xx-danger" id="xx-set-reset">恢复默认</button>' +
          '</div>' +
        '</div>';
        mask.innerHTML = html;
        mask.hidden = false;
        const x = mask.querySelector('#xx-set-x');
        if (x) x.addEventListener('click', function () { mask.hidden = true; });
        mask.querySelectorAll('[data-mode]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            s(KEY_MODE, btn.getAttribute('data-mode'));
            syncSendLabel();
            renderRoom(false);
            mask.querySelectorAll('[data-mode]').forEach(function (o) { o.classList.toggle('on', o === btn); });
            openSettings(); // 重画说明文字
          });
        });
        mask.querySelectorAll('[data-theme]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            s(KEY_THEME, btn.getAttribute('data-theme'));
            applyTheme();
            mask.querySelectorAll('[data-theme]').forEach(function (o) { o.classList.toggle('on', o === btn); });
          });
        });
        const autoCb = mask.querySelector('#xx-ta-auto');
        if (autoCb) autoCb.addEventListener('change', function () {
          s(KEY_TA, autoCb.checked ? '1' : '0');
          toast(autoCb.checked ? 'TA 会自己来' : 'TA 不请就不来');
          if (autoCb.checked) armIdle();
        });
        Object.keys(SRC_LABEL).forEach(function (k) {
          const cb = mask.querySelector('#xx-src-' + k);
          if (cb) cb.addEventListener('change', function () {
            const o = srcOn(); o[k] = cb.checked ? 1 : 0;
            jset(KEY_SRC, o);
          });
        });
        const c1 = mask.querySelector('#xx-set-clear');
        if (c1) c1.addEventListener('click', function () {
          saveRoom({ msgs: [], startedAt: nowTs() });
          renderRoom(false);
          mask.hidden = true;
          toast('这一场清空了');
        });
        const c2 = mask.querySelector('#xx-set-reset');
        if (c2) c2.addEventListener('click', function () {
          [KEY_MODE, KEY_SRC, KEY_THEME, KEY_TA].forEach(function (k) { rm(k); });
          applyTheme();
          renderRoom(false);
          syncSendLabel();
          mask.hidden = true;
          toast('心讯设置已恢复默认');
        });
      }

      function applyTheme() {
        const p = page();
        if (!p) return;
        const th = theme();
        const sh = p.querySelector('#xx-shell');
        if (sh) sh.setAttribute('data-xx-theme', th);
        p.style.setProperty('--xx-bg', BG[th] || BG.paper);
        p.style.setProperty('--xx-ink', INK[th] || INK.paper);
      }

      // ---------- 开 / 关 ----------
      function showPage() {
        const p = page();
        if (!p) return null;
        document.querySelectorAll('.page').forEach(function (x) { x.hidden = x !== p; });
        document.querySelectorAll('.desk-app').forEach(function (a) { if (a.classList.contains('open')) a.classList.remove('open'); });
        p.hidden = false;
        return p;
      }
      function closePage() {
        const p = page();
        if (p) p.hidden = true;
        const ph = document.getElementById('page-phone');
        if (ph) ph.hidden = false;
        document.querySelectorAll('.desk-app').forEach(function (a) { if (a.classList.contains('open')) a.classList.remove('open'); });
        // 离开时把「TA 自己来」的定时器停掉，回来再开
        clearTimeout(idleTimer);
        clearTimeout(taTimer);
      }

      function ensureMask() {
        let mask = document.getElementById('xx-mask');
        if (!mask) {
          mask = document.createElement('div');
          mask.className = 'xx-mask';
          mask.id = 'xx-mask';
          mask.hidden = true;
          const p = page();
          (p ? p : document.body).appendChild(mask);
          mask.addEventListener('click', function (e) { if (e.target === mask) mask.hidden = true; });
        }
        return mask;
      }

      function bindOnce() {
        if (pendingBound) return;
        pendingBound = true;
        bindSetting();
        // 切联系人：这一页属于某个联系人，换了人就按新的那一场重画（顺手开好「TA 自己来」）
        document.addEventListener('contact-switched', function () {
          try {
            const p = page();
            if (p && !p.hidden) { clearTimeout(idleTimer); clearTimeout(taTimer); renderRoom(false); armIdle(); syncSendLabel(); }
          } catch (e) {}
        });
      }

      window.xinxunOpen = function () {
        try {
          if (!window.xinxunEnabled()) { toast('心讯还没开：设置 → 桌面 → 心讯'); return; }
          bindOnce();
          mountPage();
          ensureMask();
          applyTheme();
          renderRoom(true);
          showPage();
          armIdle();
        } catch (e) { try { console.warn('心讯打开失败', e); } catch (e2) {} }
      };
      window.xinxunClose = closePage;

      // 桌面图标：开关关着就不显示（数据留着，开了原样回来）
      function applyDeskIcon() {
        const on = window.xinxunEnabled();
        document.querySelectorAll('.app[data-app="xinxun"]').forEach(function (app) {
          app.hidden = !on;
          if (!on) { try { app.style.display = 'none'; } catch (e) {} }
          else { try { app.style.display = ''; } catch (e) {} }
        });
      }
      applyDeskIcon();

      // 桌面设置里那一行
      function bindSetting() {
        const cb = document.getElementById('xinxun-en');
        if (!cb || cb.__xxBound) return;
        cb.__xxBound = 1;
        try { cb.checked = window.xinxunEnabled(); } catch (e) {}
        cb.addEventListener('change', function () {
          const on = cb.checked;
          s(KEY_EN, on ? 'on' : 'off');
          applyDeskIcon();
          toast(on ? '心讯已开启：桌面多了一枚「心讯」图标' : '心讯已关闭：图标收起，记录都还在');
        });
      }

      // 桌面图标
      function bindDeskIcon() {
        bindSetting();
        const apps = document.querySelectorAll('.app[data-app="xinxun"]');
        if (!apps.length) return;
        apps.forEach(function (app) {
          if (app.__xxBound) return;
          app.__xxBound = 1;
          app.addEventListener('click', function (e) {
            const editing = Array.from(document.querySelectorAll('.app-grid')).some(function (g) { return g.classList.contains('editing'); });
            if (editing) return;
            window.xinxunOpen();
          });
        });
        applyDeskIcon();
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindDeskIcon);
      else setTimeout(bindDeskIcon, 0);
      setTimeout(bindDeskIcon, 600);

      // 切联系人：开关与图标跟着这一个桌面走
      document.addEventListener('contact-switched', function () {
        try {
          const cb = document.getElementById('xinxun-en');
          if (cb) cb.checked = window.xinxunEnabled();
          applyDeskIcon();
        } catch (e) {}
      });

      try { console.log('[心讯] ready'); } catch (e) {}
    })();
  } catch (e) {
    try { window.__mochiExtFail = (window.__mochiExtFail || []).concat('xinxun.js: ' + (e && e.message)); } catch (e2) {}
  }
})();
