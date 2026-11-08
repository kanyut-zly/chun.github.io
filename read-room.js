/* 私人六改 · 一起读（全屏小房间）
 *
 * 形态（用户定的）：上传 txt → 自动按章节切分 → 全屏房间，右边（小屏下方）是正文，
 * 顶部一条可折叠的「TA 的批注」区，角落有退出键；退出回默认聊天界面，下次再点入口
 * 手动选「续上上次」还是「换一本」。房间里的对话只存在房间里，不同步到主聊天记录。
 *
 * 怎么读（用户定的）：
 *   · TA 跟着你读 —— 你滚到哪一段，TA 就在哪一段批注，不会剧透后面。
 *   · 节奏「两者都有」 —— 你往下读时按段落进度自动触发；也可以点「TA 说点什么」随时催。
 *   · 批注和提问混用 —— 从字卡库「阅读批注」分类（readquest）＋ 聊天通用池抽。
 *
 * 章节切分：优先认「第一章 / 第一回 / 第1章 / 序章 / 楔子 / Prologue」这类行首标题，
 * 没有标题时按空行切成大块，再没有就每 ~6000 字一块。全部在本地做，不上传任何地方。
 *
 * 数据（存 activeStore，每个联系人各自一份）：
 *   read-room-en     'on' / 'off'        入口开关（聊天设置 → 功能 → 一起看 / 一起读）
 *   read-room-state  JSON                上次读到哪：{title,ch,chars,msgs:[],notes:[],book:{...}}
 *   注意：整本书只在房间读过的那一份里（read-room-state.book），换一本会覆盖上一本。
 *
 * 对外接口：
 *   readRoomEnabled()     入口是否开着
 *   openReadRoom()        打开入口（有上次记录时先问「续上 / 换一本」）
 */
(function () {
  try {
    (function () {
      'use strict';

      const HOST_ID = 'read-room';
      const K_EN = 'read-room-en';
      const K_STATE = 'read-room-state';
      const MAX_MSGS = 200;
      const MAX_NOTES = 120;
      const NOTE_GAP_MIN = 900;       // 自动批注最少隔多少个字
      const NOTE_GAP_MAX = 2000;      // 最多隔多少个字

      const store = (function () {
        try { return window.activeStore ? window.activeStore() : window.storeFor('default'); } catch (e) { return null; }
      })();

      function optGet(k, def) {
        try { const v = store ? store.get(k) : null; return v === null || v === undefined || v === '' ? def : v; } catch (e) { return def; }
      }
      function optSet(k, v) { try { if (store) store.set(k, v); } catch (e) {} }
      function jget(k, def) {
        try { const raw = optGet(k, null); if (!raw) return def; const o = JSON.parse(raw); return o == null ? def : o; } catch (e) { return def; }
      }
      function jset(k, o) { try { optSet(k, JSON.stringify(o)); } catch (e) {} }

      function toast(msg) { try { if (window.toast) window.toast(msg); } catch (e) {} }
      function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
      }
      function pick(arr) { return arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : ''; }
      function taName() { try { return (window.chatPartnerName && window.chatPartnerName()) || 'TA'; } catch (e) { return 'TA'; } }
      function hostEl() {
        // 全屏房间要盖住整个手机（不只是聊天页）：挂 .phone（position:relative），
        // #page-chat 在桌面页时是 display:none，挂进去会量成 0×0。
        return document.querySelector('.phone') || document.querySelector('#page-chat') || document.body;
      }
      function enterChatPage() {
        try {
          const pc = document.getElementById('page-chat');
          if (!pc) return;
          if (pc.hidden) {
            document.querySelectorAll('.page').forEach(function (p) { p.hidden = p !== pc; });
            document.querySelectorAll('.desk-app').forEach(function (a) { if (a.classList.contains('open')) a.classList.remove('open'); });
          }
        } catch (e) {}
      }

      // ---------- 开关 ----------
      window.readRoomEnabled = function () { return optGet(K_EN, 'on') !== 'off'; };

      // ---------- 章节切分 ----------
      const CH_RE = /^\s*(?:第\s*[0-9０-９一二三四五六七八九十百千万两]+\s*[章回节卷部集篇]|(?:序章|楔子|引子|尾声|后记|番外|终章|前言|序言|大结局))[\s:：.、·—-]*(.{0,40})$/;
      function splitBook(rawText) {
        let t = String(rawText || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
        t = t.replace(/[ \t]+\n/g, '\n');
        const lines = t.split('\n');
        const chapters = [];
        let cur = null;
        lines.forEach(function (line) {
          const m = line.match(CH_RE);
          if (m && line.trim().length <= 60) {
            if (cur) chapters.push(cur);
            cur = { title: line.trim().slice(0, 60), lines: [] };
          } else {
            if (!cur) cur = { title: '开头', lines: [] };
            cur.lines.push(line);
          }
        });
        if (cur) chapters.push(cur);
        // 去掉空章节（标题紧挨着下一个标题）
        let out = chapters.filter(function (c) { return c.lines.join('').trim().length > 0; });
        if (out.length <= 1) {
          // 没有章节标题：按空行切成大块
          const paras = t.split(/\n\s*\n/).map(function (s) { return s.trim(); }).filter(Boolean);
          if (paras.length > 6) {
            out = [];
            let buf = [], n = 0, idx = 1;
            paras.forEach(function (p) {
              buf.push(p); n += p.length;
              if (n > 5000) { out.push({ title: '第 ' + idx + ' 段', lines: [buf.join('\n\n')] }); buf = []; n = 0; idx++; }
            });
            if (buf.length) out.push({ title: '第 ' + idx + ' 段', lines: [buf.join('\n\n')] });
          } else if (t.length > 9000) {
            out = [];
            let idx = 1;
            for (let i = 0; i < t.length; i += 6000) {
              out.push({ title: '第 ' + idx + ' 段', lines: [t.slice(i, i + 6000)] });
              idx++;
            }
          }
        }
        // 转成段落数组：每行一段（空行丢弃），太长的行再按句号切
        out = out.map(function (c) {
          const ps = [];
          c.lines.forEach(function (line) {
            const s = line.trim();
            if (!s) return;
            if (s.length <= 420) { ps.push(s); return; }
            let rest = s;
            while (rest.length > 420) {
              let cut = rest.lastIndexOf('。', 420);
              if (cut < 200) cut = rest.lastIndexOf('，', 420);
              if (cut < 100) cut = 420;
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

      // ---------- 批注话术：字卡库「阅读批注」＋ 聊天通用池混用 ----------
      const FB_NOTE = [
        '这句我划了下来。',
        '这里我停了一下。',
        '写得真好。',
        '我想把这句话念给你听。',
        '这一段值得慢慢读。',
        '嗯，这里有点东西。'
      ];
      const FB_ASK = [
        '这段你怎么看？',
        '你读到这儿，心里是什么感觉？',
        '如果换成是你，会怎么办？',
        '这里你觉得作者想说什么？',
        '你喜欢这个人物吗？',
        '这一句你怎么理解？'
      ];
      const FB_REPLY = [
        '嗯嗯，我听着。',
        '是这样啊。',
        '你说得对。',
        '那我们接着读？',
        '我记下了。',
        '有你在旁边读，真好。'
      ];
      function readPool() {
        try { return (window.getCustomFuncCards && window.getCustomFuncCards('readquest')) || []; } catch (e) { return []; }
      }
      function basePool() {
        try {
          const d = (window.DEFAULT_CARD_DATA && window.DEFAULT_CARD_DATA.main) || [];
          const out = [];
          d.forEach(function (g) { if (Array.isArray(g) && Array.isArray(g[1])) g[1].forEach(function (s) { if (typeof s === 'string') out.push(s); }); });
          return out;
        } catch (e) { return []; }
      }
      function looksLikeQuestion(s) { return /[？?]\s*$/.test(String(s || '')); }
      // kind: 'note' 感想 / 'ask' 提问 / 'end' 读完 / 'tired' 读累了
      function makeNoteText(kind) {
        const mine = readPool();
        if (kind === 'ask') {
          const mineAsk = mine.filter(looksLikeQuestion);
          if (mineAsk.length && Math.random() < 0.7) return pick(mineAsk);
          return pick(FB_ASK);
        }
        if (kind === 'end') {
          const mineEnd = mine.filter(function (s) { return /读完|结尾|这本|结局|合上/.test(s); });
          if (mineEnd.length && Math.random() < 0.6) return pick(mineEnd);
          return pick(['读完了。合上书的时候有点空。', '结尾我没想到。', '这一本，我记住的不是结局。', '读完陪我坐一会儿。']);
        }
        if (kind === 'tired') {
          const mineT = mine.filter(function (s) { return /累|歇|眼睛|喝|停/.test(s); });
          if (mineT.length) return pick(mineT);
          return pick(['看了这么久了，眼睛歇一下吧。', '读完了这一章，喘口气。', '累了就说，我们不赶进度。']);
        }
        // 感想：阅读批注里非问句优先，其次通用池，再次兜底
        const mineNote = mine.filter(function (s) { return !looksLikeQuestion(s) && String(s).length <= 40; });
        if (mineNote.length && Math.random() < 0.65) return pick(mineNote);
        const base = basePool();
        if (base.length && Math.random() < 0.35) return pick(base);
        return pick(FB_NOTE);
      }
      window.readRoomMakeNote = makeNoteText;

      // ---------- 状态 ----------
      const st = {
        open: false,
        book: null,         // {title, chapters:[{title,paras:[...]}]}
        ch: 0,              // 当前章
        chars: 0,           // 当前章读到第几个字（累计）
        msgs: [],           // 房间对话 [{who,text,ts}]
        notes: [],          // 批注 [{ch,para,text,ts}]
        nextAt: 1200,       // 下一句批注触发的位置（字数）
        fast: null,
        ticker: 0,
        pendingResume: null
      };

      function saveState() {
        if (!st.book) return;
        jset(K_STATE, {
          book: st.book,
          ch: st.ch,
          chars: st.chars,
          msgs: st.msgs.slice(-MAX_MSGS),
          notes: st.notes.slice(-MAX_NOTES),
          nextAt: st.nextAt,
          ts: Date.now()
        });
      }
      function clearState() { try { optSet(K_STATE, ''); } catch (e) {} }

      // ---------- DOM ----------
      let root = null, notesEl = null, bodyEl = null, chatEl = null, inputEl = null, titleEl = null, subEl = null, progEl = null;
      let fileInput = null;

      function build() {
        if (root) return;
        root = document.createElement('div');
        root.id = HOST_ID;
        root.className = 'rr-root';
        root.hidden = true;
        root.innerHTML =
          '<div class="rr-top">' +
            '<button class="rr-close" type="button" title="退出房间，回到聊天">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>退出' +
            '</button>' +
            '<div class="rr-tt"><div class="rr-title">一起读</div><div class="rr-sub">还没开始</div></div>' +
            '<button class="rr-more" type="button" title="换一本书 / 选章节">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>' +
            '</button>' +
          '</div>' +
          '<div class="rr-notes-wrap"><button class="rr-notes-tg" type="button"><b>TA 的批注</b><span class="rr-notes-n">0</span><i class="rr-ar">▴</i></button>' +
            '<div class="rr-notes"></div></div>' +
          '<div class="rr-body"><div class="rr-body-in"></div></div>' +
          '<div class="rr-empty">' +
            '<button class="rr-empty-x" type="button" title="退出房间，回到聊天">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>退出' +
            '</button>' +
            '<div class="rr-empty-t">想读点什么？</div>' +
            '<div class="rr-empty-s">上传一个 txt，我会按「第X章」自动切好，然后我们一起读。<br>文件只在这台设备上打开，不会传到任何地方。</div>' +
            '<button class="rr-pick" type="button">上传 txt</button>' +
            '<div class="rr-note">换一本会覆盖上一次那本，读到的进度也一起覆盖。</div>' +
          '</div>' +
          '<div class="rr-bar"><div class="rr-prog"><div class="rr-prog-fill"></div></div><span class="rr-prog-t">0%</span>' +
            '<button class="rr-say" type="button">TA 说点什么</button></div>' +
          '<div class="rr-chat"></div>' +
          '<div class="rr-in"><input class="rr-input" type="text" placeholder="说点什么…" autocomplete="off" maxlength="200"><button class="rr-send" type="button">发送</button></div>' +
          '<div class="rr-list" hidden><div class="rr-list-h">章节<span class="rr-list-x">收起</span></div><div class="rr-list-b"></div></div>' +
          '<div class="rr-ask" hidden><div class="rr-ask-b"><div class="rr-ask-t"></div><div class="rr-ask-s"></div>' +
            '<button class="rr-ask-res" type="button">续上</button><button class="rr-ask-new" type="button">换一本</button></div></div>';
        hostEl().appendChild(root);
        notesEl = root.querySelector('.rr-notes');
        bodyEl = root.querySelector('.rr-body-in');
        chatEl = root.querySelector('.rr-chat');
        inputEl = root.querySelector('.rr-input');
        titleEl = root.querySelector('.rr-title');
        subEl = root.querySelector('.rr-sub');
        progEl = root.querySelector('.rr-prog-fill');
        bindOnce();
      }

      function bindOnce() {
        if (root.__rrBound) return;
        root.__rrBound = true;
        root.querySelector('.rr-close').addEventListener('click', closeRoom);
        root.querySelector('.rr-empty-x').addEventListener('click', closeRoom);
        root.querySelector('.rr-more').addEventListener('click', openList);
        root.querySelector('.rr-pick').addEventListener('click', pickFile);
        root.querySelector('.rr-list-x').addEventListener('click', function () { root.querySelector('.rr-list').hidden = true; });
        root.querySelector('.rr-say').addEventListener('click', function () { doNote('manual'); });
        root.querySelector('.rr-send').addEventListener('click', sendMsg);
        inputEl.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); sendMsg(); } });
        root.querySelector('.rr-notes-tg').addEventListener('click', function () {
          const w = root.querySelector('.rr-notes-wrap');
          w.classList.toggle('closed');
          root.querySelector('.rr-ar').textContent = w.classList.contains('closed') ? '▾' : '▴';
        });
        root.querySelector('.rr-ask-res').addEventListener('click', function () {
          const s = st.pendingResume;
          root.querySelector('.rr-ask').hidden = true;
          st.pendingResume = null;
          if (s) resumeFrom(s); else openRoom();
        });
        root.querySelector('.rr-ask-new').addEventListener('click', function () {
          root.querySelector('.rr-ask').hidden = true;
          st.pendingResume = null;
          st.book = null; st.msgs = []; st.notes = []; st.ch = 0; st.chars = 0;
          clearState();
          openRoom();
          taSys('好，换一本。传个 txt 上来吧。');
        });
        bodyEl.addEventListener('scroll', function () { onScroll(); }, { passive: true });
        // 换章时把「下一句批注」的触发点抬到当前位置之后：新章开头不该一上来就连着冒话
        bodyEl.addEventListener('scroll', function () {
          if (st.lastCh !== st.ch) { st.lastCh = st.ch; st.nextAt = Math.max(st.nextAt, st.chars + NOTE_GAP_MIN); }
        }, { passive: true });
      }

      // ---------- 上传 ----------
      function pickFile() {
        if (!fileInput) {
          fileInput = document.createElement('input');
          fileInput.type = 'file';
          fileInput.accept = '.txt,text/plain,.md';
          fileInput.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
          document.body.appendChild(fileInput);
          fileInput.addEventListener('change', onFile);
        }
        fileInput.value = '';
        try { fileInput.click(); } catch (e) { toast('这台设备不支持选文件'); }
      }
      function decodeText(buf) {
        // 先试 UTF-8（严格模式），失败退回 GB18030（很多老 txt 是 GBK）
        try {
          const u = new TextDecoder('utf-8', { fatal: true }).decode(buf);
          if (u && u.replace(/\s/g, '').length) return u;
        } catch (e) {}
        try { return new TextDecoder('gb18030').decode(buf); } catch (e) {}
        try { return new TextDecoder('gbk').decode(buf); } catch (e) {}
        return '';
      }
      function onFile() {
        const f = fileInput && fileInput.files && fileInput.files[0];
        if (!f) return;
        if (f.size > 40 * 1024 * 1024) { toast('这个文件太大了（>40MB），先切成卷再传吧'); return; }
        const fr = new FileReader();
        fr.onload = function () {
          const text = decodeText(fr.result);
          if (!text || text.trim().length < 200) { toast('这个文件读不出内容（可能是二进制或太短）'); return; }
          const chapters = splitBook(text);
          if (!chapters.length) { toast('没切出章节，换个 txt 试试'); return; }
          st.book = { title: (f.name || '未命名').replace(/\.(txt|md)$/i, ''), chapters: chapters };
          st.ch = 0; st.chars = 0; st.msgs = []; st.notes = [];
          st.nextAt = NOTE_GAP_MIN + Math.random() * (NOTE_GAP_MAX - NOTE_GAP_MIN);
          renderBody();
          renderNotes();
          renderChat();
          paintHeader();
          paintProgress();
          saveState();
          taSay('这本叫《' + st.book.title + '》？共 ' + chapters.length + ' 节，我陪你读。');
        };
        fr.onerror = function () { toast('读文件失败'); };
        fr.readAsArrayBuffer(f);
      }

      // ---------- 渲染 ----------
      function curChapter() { return st.book && st.book.chapters[st.ch] || null; }
      function totalChars() {
        let n = 0;
        (st.book ? st.book.chapters : []).forEach(function (c) { c.paras.forEach(function (p) { n += p.length; }); });
        return n;
      }
      function charsBefore(ch) {
        let n = 0;
        const cs = st.book ? st.book.chapters : [];
        for (let i = 0; i < ch && i < cs.length; i++) cs[i].paras.forEach(function (p) { n += p.length; });
        return n;
      }
      function paintHeader() {
        if (!st.book) { titleEl.textContent = '一起读'; subEl.textContent = '还没开始'; return; }
        const c = curChapter();
        titleEl.textContent = '一起读';
        subEl.textContent = '《' + st.book.title + '》 · ' + (c ? c.title : '') + '（' + (st.ch + 1) + '/' + st.book.chapters.length + '）';
      }
      function paintProgress() {
        const tot = totalChars();
        const now = charsBefore(st.ch) + st.chars;
        const pct = tot ? Math.min(100, now / tot * 100) : 0;
        progEl.style.width = pct.toFixed(1) + '%';
        root.querySelector('.rr-prog-t').textContent = pct.toFixed(0) + '%';
      }
      function renderBody() {
        const c = curChapter();
        if (!c) { bodyEl.innerHTML = ''; return; }
        const html = ['<div class="rr-ch">' + esc(c.title) + '</div>'];
        c.paras.forEach(function (p, i) {
          html.push('<p class="rr-p" data-i="' + i + '">' + esc(p) + '</p>');
        });
        if (st.ch + 1 < st.book.chapters.length) {
          html.push('<button class="rr-next" type="button">下一章：' + esc(st.book.chapters[st.ch + 1].title) + '</button>');
        } else {
          html.push('<div class="rr-fin">— 全书完 —</div>');
        }
        bodyEl.innerHTML = html.join('');
        bodyEl.scrollTop = 0;
        root.querySelector('.rr-empty').hidden = true;
        const nx = bodyEl.querySelector('.rr-next');
        if (nx) nx.addEventListener('click', function () { gotoChapter(st.ch + 1, 0); doNote('end'); });
        // 把当前段落标出来
        markCurrentPara();
      }
      function markCurrentPara() {
        const c = curChapter();
        if (!c) return;
        const ps = bodyEl.querySelectorAll('.rr-p');
        let acc = 0, idx = 0;
        for (let i = 0; i < ps.length; i++) { acc += c.paras[i].length; if (acc >= st.chars) { idx = i; break; } idx = i; }
        ps.forEach(function (p, i) { p.classList.toggle('cur', i === idx); });
      }
      function renderNotes() {
        const mine = st.notes.filter(function (n) { return n.ch === st.ch; });
        root.querySelector('.rr-notes-n').textContent = String(mine.length);
        notesEl.innerHTML = '';
        if (!mine.length) {
          notesEl.innerHTML = '<div class="rr-notes-e">TA 还没在这节说话，你往下读读看。</div>';
          return;
        }
        mine.forEach(function (n) {
          const d = document.createElement('div');
          d.className = 'rr-note';
          d.innerHTML = '<div class="rr-note-p">¶ ' + esc(n.para >= 0 ? (curChapter() && curChapter().paras[n.para] || '').slice(0, 26) : '开头') + (n.para >= 0 ? '…' : '') + '</div><div class="rr-note-t">' + esc(n.text) + '</div>';
          d.addEventListener('click', function () {
            const ps = bodyEl.querySelectorAll('.rr-p');
            const p = ps[n.para];
            if (p) { p.scrollIntoView({ block: 'center', behavior: 'smooth' }); p.classList.add('hit'); setTimeout(function () { p.classList.remove('hit'); }, 1400); }
          });
          notesEl.appendChild(d);
        });
      }
      function renderChat() {
        chatEl.innerHTML = '';
        st.msgs.forEach(function (m) {
          const d = document.createElement('div');
          d.className = 'rr-m ' + (m.who || 'sys');
          d.textContent = m.text || '';
          chatEl.appendChild(d);
        });
        chatEl.scrollTop = chatEl.scrollHeight;
      }
      function addMsg(who, text) {
        if (!text) return;
        st.msgs.push({ who: who, text: String(text), ts: Date.now() });
        while (st.msgs.length > MAX_MSGS) st.msgs.shift();
        const d = document.createElement('div');
        d.className = 'rr-m ' + who;
        d.textContent = text;
        chatEl.appendChild(d);
        chatEl.scrollTop = chatEl.scrollHeight;
      }
      function taSys(t) { addMsg('sys', t); }
      function taSay(t) { addMsg('ta', t); }

      // ---------- 进度 / 批注 ----------
      function chapterCharAt(paraIdx) {
        const c = curChapter();
        if (!c) return 0;
        let n = 0;
        for (let i = 0; i <= paraIdx && i < c.paras.length; i++) n += c.paras[i].length;
        return n;
      }
      function currentParaIdx() {
        const c = curChapter();
        if (!c) return -1;
        let acc = 0;
        for (let i = 0; i < c.paras.length; i++) { acc += c.paras[i].length; if (acc >= st.chars) return i; }
        return c.paras.length - 1;
      }
      function onScroll() {
        const c = curChapter();
        if (!c) return;
        const ps = bodyEl.querySelectorAll('.rr-p');
        if (!ps.length) return;
        const top = bodyEl.getBoundingClientRect().top + 20;
        let idx = 0;
        for (let i = 0; i < ps.length; i++) {
          if (ps[i].getBoundingClientRect().bottom < top) idx = i + 1;
        }
        idx = Math.min(idx, ps.length - 1);
        const chars = chapterCharAt(idx);
        if (chars > st.chars) st.chars = chars;
        paintProgress();
        markCurrentPara();
        if (st.chars >= st.nextAt) doNote('auto');
      }

      function doNote(kind) {
        if (!st.book) { if (kind === 'manual') toast('还没开始读呢'); return; }
        if (kind === 'auto') {
          // 自动触发：受「阅读批注字卡概率」控制，0% 就不出声
          try {
            const p = window.dcfGet ? window.dcfGet('readquest') : 100;
            if (Math.random() * 100 >= p) {
              st.nextAt = st.chars + NOTE_GAP_MIN + Math.random() * (NOTE_GAP_MAX - NOTE_GAP_MIN);
              return;
            }
          } catch (e) {}
        }
        const para = currentParaIdx();
        let t;
        if (kind === 'end') t = makeNoteText('end');
        else if (kind === 'tired') t = makeNoteText('tired');
        else t = makeNoteText(Math.random() < 0.32 ? 'ask' : 'note');
        st.notes.push({ ch: st.ch, para: para, text: t, ts: Date.now() });
        while (st.notes.length > MAX_NOTES) st.notes.shift();
        renderNotes();
        // 批注也进房间对话流一句（像 TA 在群里贴了个便利贴）
        addMsg('ta', t);
        st.nextAt = st.chars + NOTE_GAP_MIN + Math.random() * (NOTE_GAP_MAX - NOTE_GAP_MIN);
        saveState();
        // 「读累了」偶尔插入
        if (kind === 'auto' && Math.random() < 0.12) {
          setTimeout(function () { if (st.open) doNote('tired'); }, 6000);
        }
      }

      function gotoChapter(ch, chars) {
        if (!st.book) return;
        if (ch < 0 || ch >= st.book.chapters.length) return;
        st.ch = ch;
        st.chars = chars || 0;
        st.nextAt = st.chars + NOTE_GAP_MIN + Math.random() * (NOTE_GAP_MAX - NOTE_GAP_MIN);
        renderBody();
        renderNotes();
        paintHeader();
        paintProgress();
        saveState();
      }

      // ---------- 消息 ----------
      function sendMsg() {
        const v = (inputEl.value || '').trim();
        if (!v) return;
        inputEl.value = '';
        addMsg('me', v);
        saveState();
        setTimeout(function () {
          if (!st.open) return;
          taSay(pick(FB_REPLY.concat(readPool().filter(function (s) { return !looksLikeQuestion(s) && String(s).length <= 30; }))));
        }, 900 + Math.random() * 1200);
      }

      // ---------- 章节面板 ----------
      function openList() {
        build();
        const box = root.querySelector('.rr-list');
        const b = box.querySelector('.rr-list-b');
        b.innerHTML = '';
        if (!st.book) { b.innerHTML = '<div class="rr-list-e">还没上传书。</div>'; }
        else {
          st.book.chapters.forEach(function (c, i) {
            const d = document.createElement('div');
            d.className = 'rr-li' + (i === st.ch ? ' on' : '');
            d.textContent = (i + 1) + '. ' + c.title;
            d.addEventListener('click', function () { box.hidden = true; gotoChapter(i, 0); });
            b.appendChild(d);
          });
        }
        box.hidden = false;
      }

      // ---------- 打开 / 关闭 ----------
      function openRoom() {
        build();
        root.querySelector('.rr-ask').hidden = true;
        enterChatPage();
        try { if (window.roomSkinApply) window.roomSkinApply(); } catch (e) {} // 房间美化：按当前桌面重算一遍 --rs-* 变量
        root.hidden = false;
        st.open = true;
        try { if (window.closeIme) window.closeIme(); const a = document.activeElement; if (a && a.blur) a.blur(); } catch (e) {}
        root.querySelector('.rr-empty').hidden = !!st.book;
        paintHeader();
        paintProgress();
      }
      function closeRoom() {
        if (!st.open) return;
        saveState();
        st.open = false;
        if (root) root.hidden = true;
        try {
          const pc = document.getElementById('page-chat');
          if (pc) pc.hidden = false;
          if (window.chatScrollBottom) window.chatScrollBottom();
        } catch (e) {}
      }

      function resumeFrom(s) {
        st.book = s.book;
        st.ch = s.ch || 0;
        st.chars = s.chars || 0;
        st.msgs = Array.isArray(s.msgs) ? s.msgs.slice(-MAX_MSGS) : [];
        st.notes = Array.isArray(s.notes) ? s.notes.slice(-MAX_NOTES) : [];
        st.nextAt = Number(s.nextAt) || (st.chars + NOTE_GAP_MIN);
        openRoom();
        renderBody();
        renderNotes();
        renderChat();
        paintHeader();
        paintProgress();
        taSys('续上了：《' + (st.book.title || '') + '》' + (curChapter() ? ' · ' + curChapter().title : ''));
      }

      window.openReadRoom = function () {
        if (!window.readRoomEnabled()) {
          toast('一起读入口已在 聊天设置 → 功能 → 一起看 / 一起读 里关闭');
          return;
        }
        build();
        if (st.open) { root.hidden = false; return; }
        enterChatPage();
        const saved = jget(K_STATE, null);
        if (saved && saved.book && saved.book.chapters && saved.book.chapters.length) {
          st.pendingResume = saved;
          root.hidden = false;
          st.open = true;
          enterChatPage();
          const ch = (saved.book.chapters[saved.ch || 0] || {}).title || '';
          root.querySelector('.rr-ask-t').textContent = '上次在读《' + (saved.book.title || '') + '》';
          root.querySelector('.rr-ask-s').textContent = (ch ? '读到「' + ch + '」' : '') + (saved.notes && saved.notes.length ? '，留了 ' + saved.notes.length + ' 条批注' : '');
          root.querySelector('.rr-ask').hidden = false;
          return;
        }
        openRoom();
      };

      document.addEventListener('contact-switched', function () { if (st.open) closeRoom(); });

      if (window.__mochiLoaded) window.__mochiLoaded.push('read-room.js');
    })();
  } catch (__e) {
    if (window.__mochiErrLoaded) window.__mochiErrLoaded.push('read-room.js');
    try { console.error('[JS] read-room.js', __e && __e.message || __e); } catch (x) {}
    if (window.__jsErrors) window.__jsErrors.push('[read-room.js] ' + String(__e && __e.message || __e));
  }
})();
