/* 私人八改 · 一起读 2.0（书架 + 全屏翻页阅读器）
 *
 * 形态（用户定的）：
 *   · 点「一起读」先进【书架】：所有书竖着排在书架上，没书就是空书架。
 *   · 上传键做得隐蔽，放在书架上方（不在书架里）。
 *   · 支持 txt / md / docx（Word）；docx 在本地解压解析，不上传任何地方。
 *   · 点开一本书 = 全屏翻页，铺满屏幕；点中间出工具栏，点左右翻页。
 *   · 聊天是悬浮小窗：右下角圆钮 → 弹出小窗；关掉就是正常阅读。
 *   · 有批注的段落带下划线，点一下看批注；批注可以从字卡库抽。
 *   · 可自定义：左右翻页 / 上下滑动、字号、行距、主题（纸白 / 米黄 / 夜间）。
 *   · 能朗读：优先用 TA 的声音（ta-voice.js），没配 Key 就用浏览器自带语音。
 *   · 与【助眠 → 读故事】共用同一个书库（sl-story-lib），传一次两边都能用。
 *
 * 数据（都存在 activeStore，每个联系人各一份）：
 *   sl-story-lib      JSON[] {id,title,text,addedAt}   ← 与 sleep-channel.js 共用
 *   read-room-prog    JSON{} {bookId: {ch, page, lastAt}}
 *   read-room-notes   JSON{} {bookId: [{ch,para,text,ts}]}
 *   read-room-chat    JSON{} {bookId: [{who,text,ts}]}
 *   read-room-cfg     JSON {mode,fs,lh,theme}
 *   read-room-en      'on' / 'off'   入口开关
 *
 * 对外接口：readRoomEnabled() / openReadRoom() / readRoomSplitBook() / readRoomMakeNote()
 */
(function () {
  try {
    (function () {
      'use strict';

      var HOST_ID = 'read-room';
      var K_EN = 'read-room-en';
      var K_LIB = 'sl-story-lib';          // 与助眠频道共用的书库
      var K_PROG = 'read-room-prog';
      var K_NOTES = 'read-room-notes';
      var K_CHAT = 'read-room-chat';
      var K_CFG = 'read-room-cfg';
      var K_OLD = 'read-room-state';       // 旧的单本记录，开机时迁移掉
      var MAX_CHAT = 120;
      var MAX_NOTES = 260;
      var NOTE_GAP_MIN = 900;
      var NOTE_GAP_MAX = 2000;

      var store = (function () {
        try { return window.activeStore ? window.activeStore() : window.storeFor('default'); } catch (e) { return null; }
      })();

      function get(k) { try { var v = store ? store.get(k) : null; return v === null || v === undefined ? null : v; } catch (e) { return null; } }
      function put(k, v) { try { if (store) store.set(k, v); } catch (e) {} }
      function jget(k, def) { try { var raw = get(k); if (!raw) return def; var o = JSON.parse(raw); return o == null ? def : o; } catch (e) { return def; } }
      function jset(k, o) { try { put(k, JSON.stringify(o)); } catch (e) {} }

      function toast(m) { try { if (window.toast) window.toast(m); } catch (e) {} }
      function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
      }
      function pick(a) { return a && a.length ? a[Math.floor(Math.random() * a.length)] : ''; }
      function taName() { try { return (window.chatPartnerName && window.chatPartnerName()) || 'TA'; } catch (e) { return 'TA'; } }
      function hostEl() {
        return document.querySelector('.phone') || document.querySelector('#page-chat') || document.body;
      }
      function enterChatPage() {
        try {
          var pc = document.getElementById('page-chat');
          if (!pc) return;
          if (pc.hidden) {
            document.querySelectorAll('.page').forEach(function (p) { p.hidden = p !== pc; });
            document.querySelectorAll('.desk-app').forEach(function (a) { if (a.classList.contains('open')) a.classList.remove('open'); });
          }
        } catch (e) {}
      }
      function hashHue(s) {
        var h = 0;
        s = String(s || '');
        for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
        return h;
      }

      // ============================================================
      // 一、书库（与助眠频道共用 sl-story-lib）
      // ============================================================
      function libLoad() {
        try {
          var a = JSON.parse(get(K_LIB) || '[]');
          if (!Array.isArray(a)) return [];
          return a.filter(function (x) { return x && x.id && typeof x.text === 'string' && x.text.trim(); });
        } catch (e) { return []; }
      }
      function libSave(a) { put(K_LIB, JSON.stringify(a)); }
      function libFind(id) { return libLoad().filter(function (x) { return x.id === id; })[0] || null; }
      function libAdd(title, text) {
        var lib = libLoad();
        var id = 'rr' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        lib.unshift({ id: id, title: title || '未命名', text: text, addedAt: Date.now() });
        libSave(lib);
        return id;
      }
      function libDel(id) {
        libSave(libLoad().filter(function (x) { return x.id !== id; }));
        var p = jget(K_PROG, {}); delete p[id]; jset(K_PROG, p);
        var n = jget(K_NOTES, {}); delete n[id]; jset(K_NOTES, n);
        var c = jget(K_CHAT, {}); delete c[id]; jset(K_CHAT, c);
      }

      // ============================================================
      // 二、章节切分
      // ============================================================
      var CH_RE = /^\s*(?:第\s*[0-9０-９一二三四五六七八九十百千万两]+\s*[章回节卷部集篇]|(?:序章|楔子|引子|尾声|后记|番外|终章|前言|序言|大结局))[\s:：.、·—-]*(.{0,40})$/;

      function splitBook(rawText) {
        var t = String(rawText || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
        t = t.replace(/[ \t]+\n/g, '\n');
        var lines = t.split('\n');
        var chapters = [];
        var cur = null;
        lines.forEach(function (line) {
          var m = line.match(CH_RE);
          if (m && line.trim().length <= 60) {
            if (cur) chapters.push(cur);
            cur = { title: line.trim().slice(0, 60), lines: [] };
          } else {
            if (!cur) cur = { title: '开头', lines: [] };
            cur.lines.push(line);
          }
        });
        if (cur) chapters.push(cur);
        var out = chapters.filter(function (c) { return c.lines.join('').trim().length > 0; });
        if (out.length <= 1) {
          var paras = t.split(/\n\s*\n/).map(function (s) { return s.trim(); }).filter(Boolean);
          if (paras.length > 6) {
            out = [];
            var buf = [], n = 0, idx = 1;
            paras.forEach(function (p) {
              buf.push(p); n += p.length;
              if (n > 5000) { out.push({ title: '第 ' + idx + ' 段', lines: [buf.join('\n\n')] }); buf = []; n = 0; idx++; }
            });
            if (buf.length) out.push({ title: '第 ' + idx + ' 段', lines: [buf.join('\n\n')] });
          } else if (t.length > 9000) {
            out = [];
            var k = 1;
            for (var i = 0; i < t.length; i += 6000) {
              out.push({ title: '第 ' + k + ' 段', lines: [t.slice(i, i + 6000)] });
              k++;
            }
          }
        }
        out = out.map(function (c) {
          var ps = [];
          c.lines.forEach(function (line) {
            var s = line.trim();
            if (!s) return;
            if (s.length <= 480) { ps.push(s); return; }
            var rest = s;
            while (rest.length > 480) {
              var cut = rest.lastIndexOf('。', 480);
              if (cut < 240) cut = rest.lastIndexOf('，', 480);
              if (cut < 120) cut = 480;
              ps.push(rest.slice(0, cut + 1));
              rest = rest.slice(cut + 1);
            }
            if (rest.trim()) ps.push(rest.trim());
          });
          return { title: c.title, paras: ps };
        }).filter(function (c) { return c.paras.length; });
        return out;
      }
      window.readRoomSplitBook = splitBook;

      // 切分结果缓存（同一本书反复打开不用重切）
      var splitCache = {};

      // ============================================================
      // 三、批注话术（字卡库「阅读批注」＋ 通用池）
      // ============================================================
      var FB_NOTE = ['这句我划了下来。', '这里我停了一下。', '写得真好。', '我想把这句话念给你听。', '这一段值得慢慢读。', '嗯，这里有点东西。'];
      var FB_ASK = ['这段你怎么看？', '你读到这儿，心里是什么感觉？', '如果换成是你，会怎么办？', '这里你觉得作者想说什么？', '你喜欢这个人物吗？', '这一句你怎么理解？'];
      var FB_REPLY = ['嗯嗯，我听着。', '是这样啊。', '你说得对。', '那我们接着读？', '我记下了。', '有你在旁边读，真好。'];

      function readPool() {
        try { return (window.getCustomFuncCards && window.getCustomFuncCards('readquest')) || []; } catch (e) { return []; }
      }
      function basePool() {
        try {
          var d = (window.DEFAULT_CARD_DATA && window.DEFAULT_CARD_DATA.main) || [];
          var out = [];
          d.forEach(function (g) { if (Array.isArray(g) && Array.isArray(g[1])) g[1].forEach(function (s) { if (typeof s === 'string') out.push(s); }); });
          return out;
        } catch (e) { return []; }
      }
      function looksLikeQuestion(s) { return /[？?]\s*$/.test(String(s || '')); }

      function makeNoteText(kind) {
        var mine = readPool();
        if (kind === 'ask') {
          var mineAsk = mine.filter(looksLikeQuestion);
          if (mineAsk.length && Math.random() < 0.7) return pick(mineAsk);
          return pick(FB_ASK);
        }
        if (kind === 'end') {
          var mineEnd = mine.filter(function (s) { return /读完|结尾|这本|结局|合上/.test(s); });
          if (mineEnd.length && Math.random() < 0.6) return pick(mineEnd);
          return pick(['读完了。合上书的时候有点空。', '结尾我没想到。', '这一本，我记住的不是结局。', '读完陪我坐一会儿。']);
        }
        if (kind === 'tired') {
          var mineT = mine.filter(function (s) { return /累|歇|眼睛|喝|停/.test(s); });
          if (mineT.length) return pick(mineT);
          return pick(['看了这么久了，眼睛歇一下吧。', '读完了这一章，喘口气。', '累了就说，我们不赶进度。']);
        }
        var mineNote = mine.filter(function (s) { return !looksLikeQuestion(s) && String(s).length <= 40; });
        if (mineNote.length && Math.random() < 0.65) return pick(mineNote);
        var base = basePool();
        if (base.length && Math.random() < 0.35) return pick(base);
        return pick(FB_NOTE);
      }
      window.readRoomMakeNote = makeNoteText;

      // ============================================================
      // 四、设置 / 进度 / 批注 / 聊天 读写
      // ============================================================
      function cfg() {
        var c = jget(K_CFG, {}) || {};
        return {
          mode: c.mode === 'scroll' ? 'scroll' : 'page',
          fs: Math.max(13, Math.min(26, Number(c.fs) || 17)),
          lh: Math.max(1.4, Math.min(2.6, Number(c.lh) || 1.95)),
          theme: (c.theme === 'day' || c.theme === 'sepia') ? c.theme : 'night'
        };
      }
      function saveCfg(patch) { var c = cfg(); Object.keys(patch || {}).forEach(function (k) { c[k] = patch[k]; }); jset(K_CFG, c); return c; }

      function progAll() { var o = jget(K_PROG, {}); return (o && typeof o === 'object') ? o : {}; }
      function progOf(id) { var p = progAll()[id]; return p && typeof p === 'object' ? p : { ch: 0, page: 0, lastAt: 0 }; }
      function saveProg(id, ch, page, top) { var o = progAll(); o[id] = { ch: ch, page: page, top: top || 0, lastAt: Date.now() }; jset(K_PROG, o); }

      function notesAll() { var o = jget(K_NOTES, {}); return (o && typeof o === 'object') ? o : {}; }
      function notesOf(id) { var a = notesAll()[id]; return Array.isArray(a) ? a : []; }
      function notesSave(id, arr) { var o = notesAll(); o[id] = arr.slice(-MAX_NOTES); jset(K_NOTES, o); }

      function chatAll() { var o = jget(K_CHAT, {}); return (o && typeof o === 'object') ? o : {}; }
      function chatOf(id) { var a = chatAll()[id]; return Array.isArray(a) ? a : []; }
      function chatSave(id, arr) { var o = chatAll(); o[id] = arr.slice(-MAX_CHAT); jset(K_CHAT, o); }

      // ============================================================
      // 五、运行时状态
      // ============================================================
      var S = {
        open: false, view: 'shelf',
        book: null, chapters: null,
        ch: 0, page: 0, pages: 1, step: 0, top: 0,
        notes: [], chat: [],
        nextAt: 1200, readChars: 0,
        bars: false, chatOpen: false,
        pendingDel: null
      };

      var root = null, flowEl = null, viewEl = null;
      var resizeTimer = null, shelfTimer = null, tts = { on: false, token: 0, idx: 0, dead: false };
      var fileInput = null;

      // ============================================================
      // 六、DOM
      // ============================================================
      function build() {
        if (root) return;
        root = document.createElement('div');
        root.id = HOST_ID;
        root.className = 'rr-root';
        root.hidden = true;
        root.innerHTML = [
          // ---- 书架 ----
          '<div class="rr-shelf">',
            '<div class="rr-sh-hd">',
              '<button class="rr-sh-back" type="button" title="退出">',
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
              '</button>',
              '<div class="rr-sh-tt">书架</div>',
              '<button class="rr-sh-add" type="button" title="添加书籍">',
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
              '</button>',
            '</div>',
            '<div class="rr-sh-sub"><span class="rr-sh-n">0 本</span><span class="rr-sh-tip">长按书籍可删除</span></div>',
            '<div class="rr-sh-body"></div>',
            '<div class="rr-sh-empty" hidden>',
              '<div class="rr-empty-shelf"><i></i><i></i><i></i><b></b><b></b></div>',
              '<div class="rr-sh-et">书架还是空的</div>',
              '<div class="rr-sh-es">点右上角的「+」把 txt 或 Word 文档放上来。<br>书只存在这台设备上，不会传到任何地方。</div>',
            '</div>',
          '</div>',

          // ---- 阅读器 ----
          '<div class="rr-rd" hidden>',
            '<div class="rr-rd-view"><div class="rr-rd-flow"></div></div>',

            '<div class="rr-rd-top">',
              '<button class="rr-rd-back" type="button" title="回到书架">',
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
              '</button>',
              '<div class="rr-rd-title"></div>',
              '<button class="rr-rd-menu" type="button" title="目录">',
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
              '</button>',
            '</div>',

            '<div class="rr-rd-bot">',
              '<div class="rr-rd-pg"><span class="rr-rd-pg-t">1 / 1</span><span class="rr-rd-pct">0%</span></div>',
              '<div class="rr-rd-prog"><i></i></div>',
              '<div class="rr-rd-tools">',
                '<button class="rr-t-prev" type="button" title="上一页">',
                  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
                '</button>',
                '<button class="rr-t-toc" type="button">目录</button>',
                '<button class="rr-t-note" type="button">批注</button>',
                '<button class="rr-t-tts" type="button">朗读</button>',
                '<button class="rr-t-set" type="button">设置</button>',
                '<button class="rr-t-next" type="button" title="下一页">',
                  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
                '</button>',
              '</div>',
            '</div>',

            '<button class="rr-fab" type="button" title="和 TA 聊天">',
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
            '</button>',

            '<div class="rr-chat-pop" hidden>',
              '<div class="rr-cp-hd"><b>' + esc(taName()) + ' 在旁边</b><button class="rr-cp-x" type="button">✕</button></div>',
              '<div class="rr-cp-body"></div>',
              '<div class="rr-cp-in"><input class="rr-cp-t" type="text" placeholder="说点什么…" maxlength="200" autocomplete="off"><button class="rr-cp-send" type="button">发送</button></div>',
            '</div>',

            '<div class="rr-note-pop" hidden>',
              '<div class="rr-np-q"></div>',
              '<div class="rr-np-t"></div>',
              '<div class="rr-np-b"><button class="rr-np-card" type="button">用字卡回一句</button><button class="rr-np-x" type="button">知道了</button></div>',
            '</div>',

            '<div class="rr-toc" hidden>',
              '<div class="rr-toc-hd"><b>目录</b><button class="rr-toc-x" type="button">✕</button></div>',
              '<div class="rr-toc-b"></div>',
            '</div>',

            '<div class="rr-set" hidden>',
              '<div class="rr-set-b">',
                '<div class="rr-set-hd"><b>阅读设置</b><button class="rr-set-x" type="button">✕</button></div>',
                '<div class="rr-set-row"><span>翻页方式</span><div class="rr-seg" data-k="mode"><button data-v="page">左右翻页</button><button data-v="scroll">上下滑动</button></div></div>',
                '<div class="rr-set-row"><span>字号</span><div class="rr-seg" data-k="fs"><button data-v="-1">A－</button><span class="rr-fsv">17</span><button data-v="1">A＋</button></div></div>',
                '<div class="rr-set-row"><span>行距</span><div class="rr-seg" data-k="lh"><button data-v="-1">紧</button><span class="rr-lhv">1.95</span><button data-v="1">松</button></div></div>',
                '<div class="rr-set-row"><span>主题</span><div class="rr-seg rr-themes" data-k="theme"><button data-v="day">纸白</button><button data-v="sepia">米黄</button><button data-v="night">夜间</button></div></div>',
              '</div>',
            '</div>',
          '</div>'
        ].join('');
        hostEl().appendChild(root);
        flowEl = root.querySelector('.rr-rd-flow');
        viewEl = root.querySelector('.rr-rd-view');
        bind();
      }

      function $(sel) { return root ? root.querySelector(sel) : null; }

      function bind() {
        if (root.__rrBound) return;
        root.__rrBound = true;

        // 书架
        $('.rr-sh-back').addEventListener('click', closeAll);
        $('.rr-sh-add').addEventListener('click', pickFile);
        $('.rr-sh-body').addEventListener('click', function (e) {
          var card = e.target.closest ? e.target.closest('.rr-bk') : null;
          if (!card) return;
          if (card.__delPressed) { card.__delPressed = false; return; }
          openBook(card.getAttribute('data-id'));
        });
        bindLongPress($('.rr-sh-body'));

        // 阅读器
        $('.rr-rd-back').addEventListener('click', backToShelf);
        $('.rr-rd-menu').addEventListener('click', openToc);
        $('.rr-toc-x').addEventListener('click', function () { $('.rr-toc').hidden = true; });
        $('.rr-t-prev').addEventListener('click', function () { turnPage(-1); });
        $('.rr-t-next').addEventListener('click', function () { turnPage(1); });
        $('.rr-t-toc').addEventListener('click', openToc);
        $('.rr-t-note').addEventListener('click', function () { addNote('manual'); });
        $('.rr-t-tts').addEventListener('click', function () { ttsToggle(); });
        $('.rr-t-set').addEventListener('click', function () { $('.rr-set').hidden = false; paintSet(); });
        $('.rr-set-x').addEventListener('click', function () { $('.rr-set').hidden = true; });

        // 设置面板
        $('.rr-set').addEventListener('click', function (e) {
          var seg = e.target.closest ? e.target.closest('.rr-seg') : null;
          if (!seg) return;
          var b = e.target.closest('button');
          if (!b) return;
          var k = seg.getAttribute('data-k');
          var v = b.getAttribute('data-v');
          var c = cfg();
          if (k === 'mode') { saveCfg({ mode: v }); applyMode(true, currentParaIdx()); }
          else if (k === 'theme') { saveCfg({ theme: v }); applyTheme(); }
          else if (k === 'fs') { var ap = currentParaIdx(); saveCfg({ fs: Math.max(13, Math.min(26, c.fs + Number(v))) }); applyText(); applyMode(true, ap); }
          else if (k === 'lh') { var ap2 = currentParaIdx(); saveCfg({ lh: Math.round((c.lh + Number(v) * 0.1) * 100) / 100 }); applyText(); applyMode(true, ap2); }
          paintSet();
        });

        // 翻页：点屏幕
        viewEl.addEventListener('click', onViewClick);
        // 滚动模式：滚到哪，进度就走到哪
        viewEl.addEventListener('scroll', function () {
          if (!S.open || S.view !== 'reader') return;
          if (cfg().mode !== 'scroll') return;
          paintProgress();
          maybeAutoNote();
        }, { passive: true });

        // 聊天小窗
        $('.rr-fab').addEventListener('click', function () { toggleChat(true); });
        $('.rr-cp-x').addEventListener('click', function () { toggleChat(false); });
        $('.rr-cp-send').addEventListener('click', sendChat);
        $('.rr-cp-t').addEventListener('keydown', function (e) {
          if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); sendChat(); }
        });

        // 批注弹窗
        $('.rr-np-x').addEventListener('click', function () { $('.rr-note-pop').hidden = true; });
        $('.rr-np-card').addEventListener('click', function () {
          var p = currentParaIdx();
          var t = makeNoteText(Math.random() < 0.5 ? 'ask' : 'note');
          addNoteAt(p, t);
          $('.rr-np-t').textContent = t;
        });

        // 目录
        $('.rr-toc-b').addEventListener('click', function (e) {
          var li = e.target.closest ? e.target.closest('.rr-toc-i') : null;
          if (!li) return;
          $('.rr-toc').hidden = true;
          gotoChapter(Number(li.getAttribute('data-ch')), 0);
        });

        // 书架宽度变了（转屏 / 桌面窗口缩放 / 从 800 的桌面切到手机宽）就重排每行本数
        try {
          if (window.ResizeObserver) {
            var lastShelfW = 0;
            var ro = new ResizeObserver(function () {
              var w = $('.rr-sh-body') ? $('.rr-sh-body').clientWidth : 0;
              if (!w || Math.abs(w - lastShelfW) < 8) return;
              lastShelfW = w;
              if (!S.open || S.view !== 'shelf') return;
              clearTimeout(shelfTimer);
              shelfTimer = setTimeout(function () { if (S.open && S.view === 'shelf') renderShelf(); }, 120);
            });
            ro.observe(root);
          }
        } catch (e) {}

        // 窗口尺寸变化：翻页模式下要重算列宽
        window.addEventListener('resize', function () {
          if (resizeTimer) clearTimeout(resizeTimer);
          resizeTimer = setTimeout(function () {
            if (!S.open) return;
            if (S.view === 'shelf') renderShelf();
            else if (cfg().mode === 'page') rebuildPages();
          }, 200);
        });

        // 滚轮 / 键盘（电脑上也能翻）
        viewEl.addEventListener('wheel', function (e) {
          if (cfg().mode !== 'page') return;
          if (Math.abs(e.deltaY) < 12) return;
          e.preventDefault();
          turnPage(e.deltaY > 0 ? 1 : -1);
        }, { passive: false });
        document.addEventListener('keydown', function (e) {
          if (!S.open || S.view !== 'reader') return;
          // 正在小窗里打字就别翻页
          var a = document.activeElement;
          if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return;
          if (S.chatOpen) return;
          if (e.key === 'ArrowRight' || e.key === 'PageDown') { turnPage(1); }
          else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { turnPage(-1); }
        });
      }

      function bindLongPress(box) {
        var timer = null, card = null;
        function down(e) {
          var c = e.target.closest ? e.target.closest('.rr-bk') : null;
          if (!c) return;
          card = c;
          timer = setTimeout(function () {
            timer = null;
            if (card) { card.__delPressed = true; askDelete(card.getAttribute('data-id')); }
          }, 620);
        }
        function up() { if (timer) { clearTimeout(timer); timer = null; } card = null; }
        box.addEventListener('pointerdown', down);
        box.addEventListener('pointerup', up);
        box.addEventListener('pointercancel', up);
        box.addEventListener('pointermove', function (e) {
          if (timer && (Math.abs(e.movementX) > 6 || Math.abs(e.movementY) > 6)) {
            clearTimeout(timer); timer = null;
          }
        });
      }

      function askDelete(id) {
        var b = libFind(id);
        if (!b) return;
        // openModal 的回调只在点「确定」时触发（点取消 / 点遮罩只是关掉），
        // 所以这里必须自己再判一次 v === 'ok'，以后别人改 openModal 也不会误删。
        try {
          if (window.openModal) {
            var ctl = window.openModal('删除《' + (b.title || '') + '》？', '', function (v) {
              if (v !== 'ok') return;
              libDel(id); renderShelf(); toast('删掉了');
            }, { noInput: true, staticText: '这本书连同阅读进度、批注都会一起删掉；助眠「读故事」那边也看不到了。' });
            try { if (ctl && ctl.okText) ctl.okText('删除'); } catch (e2) {}
            return;
          }
        } catch (e) {}
        libDel(id); renderShelf();
        toast('删掉了');
      }

      // ============================================================
      // 七、书架渲染
      // ============================================================
      function renderShelf() {
        var lib = libLoad();
        var body = $('.rr-sh-body');
        var empty = $('.rr-sh-empty');
        $('.rr-sh-n').textContent = lib.length + ' 本';
        body.innerHTML = '';
        if (!lib.length) {
          empty.hidden = false;
          body.hidden = true;
          return;
        }
        empty.hidden = true;
        body.hidden = false;
        // 按屏宽算每行放几本（书宽 92 + 间距 16）
        var avail = (body.clientWidth || 360) - 12;
        var cols = Math.max(2, Math.floor((avail + 16) / (92 + 16)));
        var i = 0;
        while (i < lib.length) {
          var row = document.createElement('div');
          row.className = 'rr-srow';
          var bks = document.createElement('div');
          bks.className = 'rr-bks';
          for (var k = 0; k < cols && i < lib.length; k++, i++) {
            bks.appendChild(bookCard(lib[i]));
          }
          row.appendChild(bks);
          var plank = document.createElement('div');
          plank.className = 'rr-plank';
          row.appendChild(plank);
          body.appendChild(row);
        }
      }

      function bookCard(b) {
        var p = progOf(b.id);
        var chs = splitCache[b.id] || (splitCache[b.id] = splitBook(b.text));
        var total = chs.length || 1;
        var pct = Math.round(Math.min(1, ((p.ch || 0) / total)) * 100);
        if (pct >= 100) pct = 100;
        var d = document.createElement('button');
        d.type = 'button';
        d.className = 'rr-bk';
        d.setAttribute('data-id', b.id);
        d.style.setProperty('--h', String(hashHue(b.title)));
        var lastTxt = p.lastAt ? timeAgo(p.lastAt) : '还没读';
        d.innerHTML =
          '<span class="rr-bk-c">' +
            '<span class="rr-bk-sp"></span>' +
            '<span class="rr-bk-t">' + esc(b.title || '未命名') + '</span>' +
            '<span class="rr-bk-w">' + total + ' 节</span>' +
          '</span>' +
          '<span class="rr-bk-m"><span class="rr-bk-p"><i style="width:' + pct + '%"></i></span>' +
            '<span class="rr-bk-x">' + (pct > 0 ? pct + '%' : lastTxt) + '</span></span>';
        return d;
      }

      function timeAgo(ts) {
        var d = Date.now() - ts;
        if (d < 60000) return '刚刚';
        if (d < 3600000) return Math.floor(d / 60000) + ' 分钟前';
        if (d < 86400000) return Math.floor(d / 3600000) + ' 小时前';
        return Math.floor(d / 86400000) + ' 天前';
      }

      // ============================================================
      // 八、上传（txt / md / docx）
      // ============================================================
      function pickFile() {
        if (!fileInput) {
          fileInput = document.createElement('input');
          fileInput.type = 'file';
          fileInput.accept = '.txt,.md,.docx,.doc,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          fileInput.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
          document.body.appendChild(fileInput);
          fileInput.addEventListener('change', onFile);
        }
        fileInput.value = '';
        try { fileInput.click(); } catch (e) { toast('这台设备不支持选文件'); }
      }

      function decodeText(buf) {
        try {
          var u = new TextDecoder('utf-8', { fatal: true }).decode(buf);
          if (u && u.replace(/\s/g, '').length) return u;
        } catch (e) {}
        try { return new TextDecoder('gb18030').decode(buf); } catch (e) {}
        try { return new TextDecoder('gbk').decode(buf); } catch (e) {}
        return '';
      }

      async function inflateRaw(u8) {
        if (typeof DecompressionStream === 'undefined') {
          throw new Error('这台设备的浏览器不支持解压 Word，请在电脑上把它另存为 txt 再传');
        }
        var ds = new DecompressionStream('deflate-raw');
        var stream = new Blob([u8]).stream().pipeThrough(ds);
        return new Uint8Array(await new Response(stream).arrayBuffer());
      }

      function docxXmlToText(xml) {
        var s = String(xml || '');
        s = s.replace(/<w:tab[^>]*\/>/g, '\t');
        s = s.replace(/<w:br[^>]*\/>/g, '\n');
        s = s.replace(/<\/w:p>/g, '\n');
        s = s.replace(/<[^>]+>/g, '');
        s = s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
        s = s.replace(/\u00a0/g, ' ');
        s = s.replace(/[ \t]+\n/g, '\n');
        s = s.replace(/\n{3,}/g, '\n\n');
        return s.trim();
      }

      // 极简 zip 读取：只取 word/document.xml
      async function parseDocx(buf) {
        var u8 = new Uint8Array(buf);
        var len = u8.length;
        var eocd = -1;
        for (var i = len - 22; i >= Math.max(0, len - 66000); i--) {
          if (u8[i] === 0x50 && u8[i + 1] === 0x4b && u8[i + 2] === 0x05 && u8[i + 3] === 0x06) { eocd = i; break; }
        }
        if (eocd < 0) throw new Error('这不是一个有效的 Word(.docx) 文件');
        var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
        var cdCount = dv.getUint16(eocd + 10, true);
        var cdOff = dv.getUint32(eocd + 16, true);
        var p = cdOff;
        for (var n = 0; n < cdCount; n++) {
          if (p + 46 > len || dv.getUint32(p, true) !== 0x02014b50) break;
          var method = dv.getUint16(p + 10, true);
          var compSize = dv.getUint32(p + 20, true);
          var nameLen = dv.getUint16(p + 28, true);
          var extraLen = dv.getUint16(p + 30, true);
          var cmtLen = dv.getUint16(p + 32, true);
          var localOff = dv.getUint32(p + 42, true);
          var name = '';
          try { name = new TextDecoder('utf-8').decode(u8.subarray(p + 46, p + 46 + nameLen)); } catch (e) {}
          if (name === 'word/document.xml') {
            if (localOff + 30 > len) break;
            var lnameLen = dv.getUint16(localOff + 26, true);
            var lextraLen = dv.getUint16(localOff + 28, true);
            var dataStart = localOff + 30 + lnameLen + lextraLen;
            var dataEnd = compSize ? (dataStart + compSize) : len;
            var data = u8.subarray(dataStart, Math.min(dataEnd, len));
            var xmlBytes = data;
            if (method !== 0) xmlBytes = await inflateRaw(data);
            return docxXmlToText(new TextDecoder('utf-8').decode(xmlBytes));
          }
          p += 46 + nameLen + extraLen + cmtLen;
        }
        throw new Error('这个 Word 文件里没找到正文（可能是 .doc 老格式，请另存为 .docx 或 txt）');
      }

      function onFile() {
        var f = fileInput && fileInput.files && fileInput.files[0];
        if (!f) return;
        if (f.size > 40 * 1024 * 1024) { toast('这个文件太大了（>40MB），先切成几份再传'); return; }
        var name = f.name || '未命名';
        var title = name.replace(/\.[^.]+$/, '');
        var fr = new FileReader();
        fr.onload = async function () {
          var text = '';
          try {
            if (/\.docx$/i.test(name)) text = await parseDocx(fr.result);
            else if (/\.doc$/i.test(name)) {
              toast('老版 .doc 读不了，请在 Word 里「另存为」.docx 或 .txt 再传');
              return;
            } else text = decodeText(fr.result);
          } catch (e) {
            toast(e && e.message ? e.message : '这个文件读不出来');
            return;
          }
          if (!text || text.trim().length < 60) { toast('这个文件里没读到正文（可能只有图，或者文件太短）'); return; }
          var chs = splitBook(text);
          if (!chs.length) { toast('没切出章节，换个文件试试'); return; }
          var id = libAdd(title, text);
          splitCache[id] = chs;
          renderShelf();
          toast('加好了：《' + title + '》共 ' + chs.length + ' 节');
          openBook(id);
        };
        fr.onerror = function () { toast('读文件失败'); };
        fr.readAsArrayBuffer(f);
      }

      // ============================================================
      // 九、打开 / 关闭
      // ============================================================
      function openShelf() {
        build();
        S.view = 'shelf';
        S.open = true;
        root.hidden = false;
        $('.rr-shelf').hidden = false;
        $('.rr-rd').hidden = true;
        stopTts();
        renderShelf();
      }

      function backToShelf() {
        stopTts();
        saveNow();
        closeChatAndPop();
        $('.rr-rd').hidden = true;
        $('.rr-shelf').hidden = false;
        S.view = 'shelf';
        renderShelf();
      }

      function closeAll() {
        stopTts();
        saveNow();
        S.open = false;
        S.view = 'shelf';
        if (root) root.hidden = true;
        try {
          var pc = document.getElementById('page-chat');
          if (pc) pc.hidden = false;
          if (window.chatScrollBottom) window.chatScrollBottom();
        } catch (e) {}
      }

      function openBook(id) {
        var b = libFind(id);
        if (!b) { toast('这本书不见了'); renderShelf(); return; }
        var chs = splitCache[id] || (splitCache[id] = splitBook(b.text));
        if (!chs.length) { toast('这本书里没读到字'); return; }
        S.book = b;
        S.chapters = chs;
        S.notes = notesOf(id);
        S.chat = chatOf(id);
        var p = progOf(id);
        S.ch = Math.max(0, Math.min(chs.length - 1, Number(p.ch) || 0));
        S.page = Math.max(0, Number(p.page) || 0);
        S.top = Math.max(0, Number(p.top) || 0);
        S.nextAt = NOTE_GAP_MIN + Math.random() * (NOTE_GAP_MAX - NOTE_GAP_MIN);
        S.readChars = 0;
        S.bars = false;
        closeChatAndPop();

        $('.rr-shelf').hidden = true;
        $('.rr-rd').hidden = false;
        S.view = 'reader';
        applyTheme();
        applyText();
        renderChapter(true);
        if (cfg().mode === 'scroll') { try { viewEl.scrollTop = S.top || 0; } catch (e) {} }
        paintBars(false);
        paintChat();
        paintTitle();
      }

      function saveNow() {
        if (!S.book) return;
        try {
          var top = (cfg().mode === 'scroll') ? (viewEl ? viewEl.scrollTop : 0) : (S.top || 0);
          saveProg(S.book.id, S.ch, S.page, top);
        } catch (e) {}
      }

      // ============================================================
      // 十、渲染正文（翻页 / 滚动）
      // ============================================================
      function chapter() { return S.chapters && S.chapters[S.ch] || null; }
      function paras() { var c = chapter(); return c ? c.paras : []; }
      function currentParaIdx() {
        if (cfg().mode === 'scroll') {
          var ps = flowEl.querySelectorAll('.rr-p');
          var mid = viewEl.scrollTop + viewEl.clientHeight * 0.35;
          for (var i = 0; i < ps.length; i++) {
            if (ps[i].offsetTop + ps[i].offsetHeight >= mid) return i;
          }
          return ps.length ? ps.length - 1 : 0;
        }
        // 翻页模式：取当前页第一段
        var ps2 = flowEl.querySelectorAll('.rr-p');
        var step = pageStep();
        if (!ps2.length || !step) return 0;
        var x = S.page * step + 4;
        for (var j = 0; j < ps2.length; j++) {
          if (ps2[j].offsetLeft + ps2[j].offsetWidth > x) return j;
        }
        return ps2.length - 1;
      }

      function renderChapter(keepPage) {
        var c = chapter();
        if (!c) { flowEl.innerHTML = ''; return; }
        var html = ['<div class="rr-ch">' + esc(c.title) + '</div>'];
        var noteMap = {};
        S.notes.forEach(function (n) { if (n.ch === S.ch && !noteMap[n.para]) noteMap[n.para] = n; });
        c.paras.forEach(function (p, i) {
          var has = noteMap[i] ? ' rr-ul' : '';
          html.push('<p class="rr-p' + has + '" data-p="' + i + '">' + esc(p) + '</p>');
        });
        if (S.ch + 1 < S.chapters.length) {
          html.push('<button class="rr-next" type="button">下一章：' + esc(S.chapters[S.ch + 1].title) + '</button>');
        } else {
          html.push('<div class="rr-fin">— 全书完 —</div>');
        }
        flowEl.innerHTML = html.join('');
        var nx = flowEl.querySelector('.rr-next');
        if (nx) nx.addEventListener('click', function () { gotoChapter(S.ch + 1, 0); doNote('end'); });
        if (cfg().mode === 'page') {
          rebuildPages(keepPage === false ? 0 : null);
        } else {
          viewEl.scrollTop = 0;
        }
        paintProgress();
      }

      function applyTheme() {
        if (!root) return;
        var c = cfg();
        root.setAttribute('data-theme', c.theme);
      }

      function applyText() {
        if (!root) return;
        var c = cfg();
        root.style.setProperty('--rr-fs', c.fs + 'px');
        root.style.setProperty('--rr-lh', String(c.lh));
      }

      function applyMode(rebuild, anchorPara) {
        if (!root) return;
        var mode = cfg().mode;
        viewEl.classList.toggle('mode-page', mode === 'page');
        viewEl.classList.toggle('mode-scroll', mode === 'scroll');
        if (rebuild) {
          S.reanchor = (anchorPara == null ? null : anchorPara);
          renderChapter(false);
        } else paintProgress();
      }

      function pageStep() {
        var c = cfg();
        if (c.mode !== 'page') return viewEl.clientWidth || 1;
        if (S.step > 0) return S.step;
        var w = flowEl.clientWidth || viewEl.clientWidth || 1;
        var cs = getComputedStyle(flowEl);
        var padL = parseFloat(cs.paddingLeft) || 0;
        var padR = parseFloat(cs.paddingRight) || 0;
        var gap = parseFloat(cs.columnGap) || 0;
        return Math.max(1, (w - padL - padR) + gap);
      }

      function rebuildPages(forcePage) {
        // 先按当前尺寸把列宽设好
        var wrapW = viewEl.clientWidth;
        if (!wrapW) return;
        S.step = 0;
        var padL = 26, padR = 26;
        try {
          var cs = getComputedStyle(flowEl);
          padL = parseFloat(cs.paddingLeft) || 0;
          padR = parseFloat(cs.paddingRight) || 0;
        } catch (e) {}
        var colw = Math.max(120, wrapW - padL - padR);
        flowEl.style.setProperty('--rr-colw', colw + 'px');
        // 强制一页一列
        flowEl.style.columnWidth = colw + 'px';
        var gap = parseFloat(getComputedStyle(flowEl).columnGap) || 0;
        var step = colw + gap;
        S.step = step;
        var total = Math.max(1, Math.round((flowEl.scrollWidth + step * 0.15) / step));
        S.pages = total;
        if (S.reanchor != null) {
          var el = flowEl.querySelector('.rr-p[data-p="' + S.reanchor + '"]');
          if (el) S.page = Math.max(0, Math.min(total - 1, Math.floor((el.offsetLeft + 2) / step)));
          S.reanchor = null;
        } else if (forcePage != null) S.page = forcePage;
        S.page = Math.max(0, Math.min(total - 1, S.page || 0));
        paintPage();
        paintProgress();
      }

      function paintPage() {
        var step = pageStep();
        var x = -(S.page * step);
        flowEl.style.transform = 'translateX(' + x + 'px)';
        var t = $('.rr-rd-pg-t');
        if (t) t.textContent = (S.page + 1) + ' / ' + S.pages;
      }

      function turnPage(dir) {
        if (cfg().mode !== 'page') {
          // 滚动模式：滚一屏
          viewEl.scrollBy({ top: dir * viewEl.clientHeight * 0.86, behavior: 'smooth' });
          return;
        }
        var next = S.page + dir;
        if (next < 0) {
          if (S.ch > 0) { gotoChapter(S.ch - 1, 9999); return; }
          next = 0;
        }
        if (next >= S.pages) {
          if (S.ch + 1 < S.chapters.length) { gotoChapter(S.ch + 1, 0); doNote('end'); return; }
          next = S.pages - 1;
        }
        S.page = next;
        paintPage();
        paintProgress();
        saveNow();
        maybeAutoNote();
      }

      function gotoChapter(ch, page) {
        if (!S.chapters || ch < 0 || ch >= S.chapters.length) return;
        S.ch = ch;
        S.page = Math.max(0, page || 0);
        renderChapter(true);
        paintTitle();
        saveNow();
      }

      function paintTitle() {
        var c = chapter();
        var el = $('.rr-rd-title');
        if (el) el.textContent = S.book ? (c ? c.title : (S.book.title || '')) : '';
      }

      function totalChars() {
        var n = 0;
        (S.chapters || []).forEach(function (c) { c.paras.forEach(function (p) { n += p.length; }); });
        return n;
      }
      function charsBefore(ch) {
        var n = 0;
        var cs = S.chapters || [];
        for (var i = 0; i < ch && i < cs.length; i++) cs[i].paras.forEach(function (p) { n += p.length; });
        return n;
      }
      function chChars() {
        var c = chapter();
        if (!c) return 0;
        var n = 0;
        c.paras.forEach(function (p) { n += p.length; });
        return n;
      }

      function paintProgress() {
        var tot = totalChars() || 1;
        var frac = cfg().mode === 'page' ? (S.pages > 1 ? S.page / (S.pages - 1) : 0) : Math.min(1, viewEl.scrollTop / Math.max(1, viewEl.scrollHeight - viewEl.clientHeight));
        var now = charsBefore(S.ch) + chChars() * frac;
        var pct = Math.max(0, Math.min(100, now / tot * 100));
        var bar = $('.rr-rd-prog i');
        if (bar) bar.style.width = pct.toFixed(1) + '%';
        var t = $('.rr-rd-pct');
        if (t) t.textContent = pct.toFixed(0) + '%';
      }

      function paintBars(show) {
        S.bars = !!show;
        var top = $('.rr-rd-top'), bot = $('.rr-rd-bot');
        if (top) top.classList.toggle('on', S.bars);
        if (bot) bot.classList.toggle('on', S.bars);
        if (root) root.classList.toggle('rr-bars', S.bars);
      }

      function onViewClick(e) {
        // 批注弹窗开着时，点正文先把它收起来（不然会误翻页）
        var np = $('.rr-note-pop');
        if (np && !np.hidden) { np.hidden = true; return; }
        var p = e.target.closest ? e.target.closest('.rr-p') : null;
        if (p && p.classList.contains('rr-ul')) {
          showNote(Number(p.getAttribute('data-p')), p);
          return;
        }
        if (e.target.closest && e.target.closest('button')) return;
        var x = e.clientX;
        var w = viewEl.clientWidth;
        if (x < w * 0.24) { turnPage(-1); return; }
        if (x > w * 0.76) { turnPage(1); return; }
        paintBars(!S.bars);
        if (!S.bars) { $('.rr-set').hidden = true; $('.rr-toc').hidden = true; }
      }

      // ============================================================
      // 十一、批注
      // ============================================================
      function showNote(para, el) {
        var n = null;
        S.notes.forEach(function (x) { if (x.ch === S.ch && x.para === para && !n) n = x; });
        var pop = $('.rr-note-pop');
        if (!n) { pop.hidden = true; return; }
        $('.rr-np-q').textContent = '¶ ' + (paras()[para] || '').slice(0, 28) + '…';
        $('.rr-np-t').textContent = n.text;
        pop.hidden = false;
        pop.__para = para;
      }

      function addNoteAt(para, text) {
        var item = { ch: S.ch, para: para, text: text || makeNoteText('note'), ts: Date.now() };
        S.notes.push(item);
        if (S.notes.length > MAX_NOTES) S.notes.shift();
        notesSave(S.book.id, S.notes);
        // 重新渲染让下划线出现，并停在这一段所在的页
        S.reanchor = para;
        renderChapter(true);
        pushChat('ta', item.text);
        return item;
      }

      function addNote(kind) {
        if (!S.book) return;
        var para = currentParaIdx();
        var t = (kind === 'manual') ? makeNoteText(Math.random() < 0.32 ? 'ask' : 'note') : makeNoteText(kind);
        addNoteAt(para, t);
        showNote(para);
      }

      function maybeAutoNote() {
        // 按「阅读批注概率」控制；0% 就不出声
        var prob = 100;
        try { if (window.dcfGet) prob = Number(window.dcfGet('readquest')); } catch (e) { prob = 100; }
        if (!isFinite(prob)) prob = 100;
        var readSoFar = charsBefore(S.ch) + chChars() * (S.pages > 1 ? S.page / (S.pages - 1) : 0);
        if (readSoFar < S.nextAt) return;
        S.nextAt = readSoFar + NOTE_GAP_MIN + Math.random() * (NOTE_GAP_MAX - NOTE_GAP_MIN);
        if (Math.random() * 100 >= prob) return;
        addNoteAt(currentParaIdx(), makeNoteText(Math.random() < 0.32 ? 'ask' : 'note'));
      }

      function doNote(kind) {
        if (!S.book) return;
        addNoteAt(currentParaIdx(), makeNoteText(kind));
      }

      // ============================================================
      // 十二、悬浮聊天
      // ============================================================
      function paintChat() {
        var b = $('.rr-cp-body');
        if (!b) return;
        b.innerHTML = '';
        if (!S.chat.length) {
          b.innerHTML = '<div class="rr-cp-e">' + esc(taName()) + ' 就坐在旁边，你想说什么都行。</div>';
          return;
        }
        S.chat.forEach(function (m) {
          var d = document.createElement('div');
          d.className = 'rr-cp-m ' + (m.who || 'sys');
          d.textContent = m.text || '';
          b.appendChild(d);
        });
        b.scrollTop = b.scrollHeight;
      }

      function pushChat(who, text) {
        if (!text) return;
        S.chat.push({ who: who, text: String(text), ts: Date.now() });
        if (S.chat.length > MAX_CHAT) S.chat.shift();
        if (S.book) chatSave(S.book.id, S.chat);
        if (S.chatOpen) paintChat();
      }

      function toggleChat(open) {
        S.chatOpen = !!open;
        var pop = $('.rr-chat-pop');
        if (!pop) return;
        pop.hidden = !open;
        if (root) root.classList.toggle('rr-chatting', !!open);
        if (open) {
          paintChat();
          paintBars(false);
          $('.rr-set').hidden = true;
          $('.rr-toc').hidden = true;
          setTimeout(function () { var i = $('.rr-cp-t'); if (i) { try { i.focus(); } catch (e) {} } }, 60);
        }
      }

      function closeChatAndPop() {
        toggleChat(false);
        var np = $('.rr-note-pop');
        if (np) np.hidden = true;
        var st = $('.rr-set'), tc = $('.rr-toc');
        if (st) st.hidden = true;
        if (tc) tc.hidden = true;
      }

      function sendChat() {
        var input = $('.rr-cp-t');
        var v = (input.value || '').trim();
        if (!v) return;
        input.value = '';
        pushChat('me', v);
        var tok = ++tts.token;
        setTimeout(function () {
          if (!S.open || S.view !== 'reader' || tok !== tts.token) return;
          var pool = FB_REPLY.concat(readPool().filter(function (s) { return !looksLikeQuestion(s) && String(s).length <= 30; }));
          pushChat('ta', pick(pool));
        }, 700 + Math.random() * 1200);
      }

      // ============================================================
      // 十三、目录
      // ============================================================
      function openToc() {
        if (!S.chapters) return;
        var b = $('.rr-toc-b');
        b.innerHTML = '';
        S.chapters.forEach(function (c, i) {
          var d = document.createElement('div');
          d.className = 'rr-toc-i' + (i === S.ch ? ' on' : '');
          d.setAttribute('data-ch', String(i));
          d.textContent = (i + 1) + '. ' + c.title;
          b.appendChild(d);
        });
        $('.rr-toc').hidden = false;
        var on = b.querySelector('.rr-toc-i.on');
        if (on) on.scrollIntoView({ block: 'center' });
        paintBars(false);
      }

      // ============================================================
      // 十四、朗读
      // ============================================================
      function paintSet() {
        var c = cfg();
        var segs = root.querySelectorAll('.rr-seg');
        Array.prototype.forEach.call(segs, function (seg) {
          var k = seg.getAttribute('data-k');
          Array.prototype.forEach.call(seg.querySelectorAll('button'), function (b) {
            b.classList.toggle('on', String(b.getAttribute('data-v')) === String(c[k]));
          });
        });
        var fsv = $('.rr-fsv'); if (fsv) fsv.textContent = String(c.fs);
        var lhv = $('.rr-lhv'); if (lhv) lhv.textContent = String(c.lh);
      }

      function paintTts() {
        var b = $('.rr-t-tts');
        if (b) { b.classList.toggle('on', tts.on); b.textContent = tts.on ? '停止' : '朗读'; }
      }

      function stopTts() {
        tts.on = false;
        tts.token++;
        try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
        try { if (window.taVoiceStop) window.taVoiceStop(); } catch (e) {}
        root.querySelectorAll('.rr-p.speaking').forEach(function (p) { p.classList.remove('speaking'); });
        paintTts();
      }

      function ttsToggle() {
        if (tts.on) { stopTts(); return; }
        startTts();
      }

      function speakOne(text) {
        return new Promise(function (res) {
          var done = false;
          function fin() { if (done) return; done = true; res(); }
          var t = String(text || '').slice(0, 380);
          if (!t) { fin(); return; }
          // 没配 Key / 合成失败过就把整段朗读切成浏览器自带语音，避免每段都白试一次
          if (window.taVoiceSynth && !tts.dead) {
            Promise.resolve().then(function () { return window.taVoiceSynth(t); }).then(function (url) {
              if (!url) { tts.dead = true; fallbackSpeak(t, fin); return; }
              var a = new Audio(url);
              a.onended = fin;
              a.onerror = fin;
              a.play().catch(function () { tts.dead = true; fallbackSpeak(t, fin); });
            }).catch(function () { tts.dead = true; fallbackSpeak(t, fin); });
          } else {
            fallbackSpeak(t, fin);
          }
        });
      }

      function fallbackSpeak(text, done) {
        try {
          if (!window.speechSynthesis) { done(); return; }
          var u = new SpeechSynthesisUtterance(String(text).slice(0, 380));
          u.lang = 'zh-CN';
          u.rate = 0.95;
          u.onend = done;
          u.onerror = done;
          window.speechSynthesis.speak(u);
        } catch (e) { done(); }
      }

      async function startTts() {
        var ps = paras();
        if (!ps.length) return;
        tts.on = true;
        var tok = ++tts.token;
        paintTts();
        tts.idx = currentParaIdx();
        while (tts.on && tok === tts.token && tts.idx < ps.length) {
          var i = tts.idx;
          var el = flowEl.querySelector('.rr-p[data-p="' + i + '"]');
          root.querySelectorAll('.rr-p.speaking').forEach(function (p) { p.classList.remove('speaking'); });
          if (el) {
            el.classList.add('speaking');
            goToPara(el);
          }
          await speakOne(ps[i]);
          if (!(tts.on && tok === tts.token)) break;
          tts.idx++;
        }
        if (tok === tts.token) {
          tts.on = false;
          root.querySelectorAll('.rr-p.speaking').forEach(function (p) { p.classList.remove('speaking'); });
          paintTts();
          if (S.ch + 1 < S.chapters.length) { /* 停在章末，等用户继续 */ }
        }
      }

      function goToPara(el) {
        if (cfg().mode === 'scroll') {
          var top = el.offsetTop - viewEl.clientHeight * 0.3;
          viewEl.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        } else {
          var step = pageStep();
          if (!step) return;
          var pg = Math.floor((el.offsetLeft + 2) / step);
          if (pg !== S.page) { S.page = Math.max(0, Math.min(S.pages - 1, pg)); paintPage(); paintProgress(); }
        }
      }

      // ============================================================
      // 十五、对外接口
      // ============================================================
      window.readRoomEnabled = function () { return (function () { var v = get(K_EN); return v === null ? 'on' : v; })() !== 'off'; };

      window.openReadRoom = function () {
        if (!window.readRoomEnabled()) {
          toast('一起读入口已在 聊天设置 → 功能 → 一起看 / 一起读 里关闭');
          return;
        }
        build();
        // 旧版单本记录：把书并进共用书库，避免用户丢书
        try {
          var old = jget(K_OLD, null);
          if (old && old.book && old.book.chapters && old.book.chapters.length && !libLoad().length) {
            var txt = old.book.chapters.map(function (c) {
              return (c.title || '') + '\n' + (c.paras || []).join('\n');
            }).join('\n\n');
            var nid = libAdd(old.book.title || '上次那本', txt);
            saveProg(nid, old.ch || 0, 0);
            put(K_OLD, '');
          }
        } catch (e) {}
        if (S.open && S.view === 'shelf') { root.hidden = false; renderShelf(); return; }
        if (S.open && S.view === 'reader') { root.hidden = false; return; }
        enterChatPage();
        try { if (window.roomSkinApply) window.roomSkinApply(); } catch (e) {}
        root.hidden = false;
        S.open = true;
        applyTheme();
        applyText();
        viewEl.classList.toggle('mode-page', cfg().mode === 'page');
        viewEl.classList.toggle('mode-scroll', cfg().mode === 'scroll');
        openShelf();
      };

      /* 内部调试/自检用（也方便以后别的模块复用 docx 解析） */
      window.mochiReadRoom = {
        parseDocx: parseDocx,
        splitBook: splitBook,
        lib: libLoad
      };

      document.addEventListener('contact-switched', function () { if (S.open) closeAll(); });
      document.addEventListener('visibilitychange', function () { if (document.hidden) stopTts(); });

      if (window.__mochiLoaded) window.__mochiLoaded.push('read-room.js');
    })();
  } catch (__e) {
    if (window.__mochiErrLoaded) window.__mochiErrLoaded.push('read-room.js');
    try { console.error('[JS] read-room.js', __e && __e.message || __e); } catch (x) {}
    if (window.__jsErrors) window.__jsErrors.push('[read-room.js] ' + String(__e && __e.message || __e));
  }
})();
