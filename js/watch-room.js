/* 私人六改 · 一起看（全屏小房间）
 *
 * 形态（用户定的）：全屏房间，视频在上、对话在下，角落有退出键；退出回默认聊天界面，
 * 下次再点入口时手动选「续上上次」还是「换一个重来」。房间里的对话只存在房间里，
 * 不同步到主聊天记录。
 *
 * 能看的来源（用户选方案 A + 本地上传）：
 *   · B站视频页  https://www.bilibili.com/video/BVxxxx / av123  / b23.tv/xxxx 短链（自动展开）
 *   · YouTube    https://www.youtube.com/watch?v=xxx / youtu.be/xxx / shorts/xxx
 *   · 直链视频    xxx.mp4 / xxx.webm / xxx.ogv
 *   · 本地上传   选本机视频文件（只播放不存，刷新后要重新选）
 *   其他站点一律明确提示「这个站不允许嵌入」，不白屏。
 *
 * TA 的陪看（三样都要）：
 *   ① 同步进度：本地视频能真读进度；B站/YouTube 是别人家的播放器，跨域读不到，
 *      用「房间开着的时长」估算 —— 不假装精确，界面里写明「估算」。
 *   ② TA 挑片：从片单（自动记住的链接 + 本地上传记录）里挑一部并说一句推荐。
 *   ③ 陪看说话：正经看的时候隔一阵冒一句，暂停 / 拖进度 / 看完时另有话。
 *
 * 数据（存 activeStore，每个联系人各自一份）：
 *   watch-room-en     'on' / 'off'   入口开关（聊天设置 → 功能 → 一起看 / 一起读）
 *   watch-room-list   JSON 数组     片单：[{url,name,kind,ts}]
 *   watch-room-state  JSON 对象     上次看到哪：{url,name,kind,cur,dur,msgs:[],ts}
 *
 * 对外接口：
 *   watchRoomEnabled()      入口是否开着
 *   openWatchRoom()         打开入口（有上次记录时先问「续上 / 重来」）
 *   watchRoomTaLine(kind)   从「一起看」相关池抽一句话（挑了/没挑到时兜底）
 */
(function () {
  try {
    (function () {
      'use strict';

      const HOST_ID = 'watch-room';
      const K_EN = 'watch-room-en';
      const K_LIST = 'watch-room-list';
      const K_STATE = 'watch-room-state';
      const MAX_LIST = 60;
      const MAX_MSGS = 300;

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
      // 打开房间前先回到聊天页，退出时才是「默认聊天界面」
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
      function fmtTime(sec) {
        sec = Math.max(0, Math.floor(Number(sec) || 0));
        const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
        const mm = h ? String(m).padStart(2, '0') : String(m);
        return (h ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0');
      }

      // ---------- 开关 ----------
      window.watchRoomEnabled = function () { return optGet(K_EN, 'on') !== 'off'; };

      // ---------- 链接识别 ----------
      // 返回 {kind:'bili'|'yt'|'file', url, embed, page, name} 或 {kind:'bad', reason}
      function parseLink(raw) {
        let u = String(raw || '').trim();
        if (!u) return { kind: 'bad', reason: '先把链接粘进来' };
        if (!/^https?:\/\//i.test(u)) {
          // 允许直接粘 b23.tv/xxx 这种省略协议的
          if (/^(b23\.tv|bilibili\.com|www\.bilibili\.com|youtu\.be|m\.youtube\.com|www\.youtube\.com)\//i.test(u)) u = 'https://' + u;
          else return { kind: 'bad', reason: '这不像一个网址，要以 http:// 或 https:// 开头' };
        }
        let U;
        try { U = new URL(u); } catch (e) { return { kind: 'bad', reason: '网址格式不对' }; }
        const host = U.hostname.toLowerCase();
        // B站
        if (host === 'b23.tv') return { kind: 'b23', url: u, page: u, name: 'B站短链' };
        if (/(^|\.)bilibili\.com$/.test(host)) {
          const bv = u.match(/\/video\/(BV[0-9A-Za-z]+)/i);
          const av = u.match(/\/video\/av(\d+)/i);
          if (!bv && !av) {
            if (/\/bangumi\/play\//i.test(u)) return { kind: 'bili-bangumi', url: u, page: u, name: 'B站番剧' };
            return { kind: 'bad', reason: '这是 B站 页面但不是单个视频页，请粘「video/BV…」那一条' };
          }
          const p = u.match(/[?&]p=(\d+)/);
          const id = bv ? bv[1] : ('av' + av[1]);
          const sp = 'page=' + (p ? p[1] : '1') + '&high_quality=1&danmaku=0&autoplay=1';
          const embed = 'https://player.bilibili.com/player.html?' + (bv ? 'bvid=' + bv[1] : 'aid=' + av[1]) + '&' + sp;
          return { kind: 'bili', url: u, page: u, embed: embed, name: 'B站 ' + id + (p ? ' P' + p[1] : '') };
        }
        // YouTube
        if (host === 'youtu.be' || /(^|\.)youtube\.com$/.test(host)) {
          let vid = '';
          if (host === 'youtu.be') { vid = U.pathname.replace(/^\/+/, '').split('/')[0]; }
          else vid = U.searchParams.get('v') || (u.match(/\/shorts\/([\w-]+)/) || [])[1] || (u.match(/\/embed\/([\w-]+)/) || [])[1] || '';
          if (!vid) return { kind: 'bad', reason: '这是 YouTube 页面但不是单个视频，请粘「watch?v=…」那一条' };
          const t = parseInt(U.searchParams.get('t') || U.searchParams.get('start') || '0', 10) || 0;
          const embed = 'https://www.youtube.com/embed/' + vid + '?autoplay=1&rel=0' + (t ? '&start=' + t : '');
          return { kind: 'yt', url: u, page: u, embed: embed, name: 'YouTube ' + vid };
        }
        // 直链视频
        if (/\.(mp4|webm|ogv|m4v)(\?|#|$)/i.test(U.pathname + U.search)) {
          return { kind: 'file', url: u, page: u, embed: u, name: decodeURIComponent(U.pathname.split('/').pop() || '视频') };
        }
        return { kind: 'bad', reason: '这个站不允许嵌入（' + host + '）。只支持 B站 / YouTube / 视频直链，或者用「本地上传」' };
      }
      window.watchRoomParseLink = parseLink;

      // ---------- 陪看话术（「一起看」相关池：互动回应里含看/片/剧情等词的字卡 + 兜底） ----------
      const FB_START = [
        '开始了开始了，坐好。',
        '灯关一下，我这边也黑下来了。',
        '看看你挑的这部怎么样。',
        '一起看，别偷跑进度啊。',
        '我坐你旁边了，开始吧。'
      ];
      const FB_IDLE = [
        '这段挺有意思的。',
        '你看到这儿什么感觉？',
        '我盯着画面呢，别看我。',
        '这里的光打得真好。',
        '暂停了记得说一声。',
        '要不要说点什么给我听？',
        '刚才那个镜头，我记住了。',
        '看你的片子，好像也在看你。'
      ];
      const FB_PAUSE = [
        '暂停了？那我等你。',
        '去倒杯水吧，我盯着进度条。',
        '休息一下也好，眼睛别太累。',
        '停这儿正好，我刚好想说句话。'
      ];
      const FB_RESUME = [
        '回来了？继续。',
        '好，接着看。',
        '去吧皮卡，别拖太久哦。'
      ];
      const FB_SEEK = [
        '哎，你动了进度条。',
        '跳了？那刚才那段你就没陪我看。',
        '倒回去看也好，我也补一下。'
      ];
      const FB_END = [
        '看完了。有点没缓过来。',
        '结尾我没想到。',
        '这一部，值了。',
        '看完了，陪我坐一会儿。',
        '下次我们看什么？'
      ];
      function poolOr(fb) {
        return fb;
      }
      // 从「互动回应」池里挑含关键词的句子，挑不到就用兜底
      function relatedSay(kw, fb) {
        try {
          const pool = window.getInteractPool ? window.getInteractPool('邀请TA·接受', []) : [];
          const hit = (pool || []).filter(function (s) { return s && kw.some(function (k) { return String(s).indexOf(k) >= 0; }); });
          if (hit.length) return pick(hit);
        } catch (e) {}
        return poolOr(pick(fb));
      }
      function say(kind) {
        switch (kind) {
          case 'start': return pick(FB_START);
          case 'pause': return pick(FB_PAUSE);
          case 'resume': return pick(FB_RESUME);
          case 'seek': return pick(FB_SEEK);
          case 'end': return pick(FB_END);
          default: return relatedSay(['看', '片', '剧情', '电影', '视频', '镜头'], FB_IDLE);
        }
      }
      window.watchRoomTaLine = say;

      // ---------- 片单（自动记住粘过的链接） ----------
      function listGet() {
        const a = jget(K_LIST, []);
        return Array.isArray(a) ? a.filter(function (x) { return x && x.url; }) : [];
      }
      function listAdd(item) {
        if (!item || !item.url) return;
        const a = listGet().filter(function (x) { return x.url !== item.url; });
        a.unshift({ url: item.url, name: item.name || item.url, kind: item.kind || 'file', ts: Date.now() });
        while (a.length > MAX_LIST) a.pop();
        jset(K_LIST, a);
      }
      function listRemove(url) {
        jset(K_LIST, listGet().filter(function (x) { return x.url !== url; }));
      }

      // ---------- 房间状态 ----------
      const st = {
        open: false,
        inited: false,
        src: null,          // {kind,url,embed,page,name}
        mediaUrl: '',       // 本地视频的 blob: URL（只在本次页面生命周期内有效）
        msgs: [],           // [{who:'me'|'ta'|'sys', text, ts}]
        cur: 0, dur: 0,
        playing: false,
        elapsed: 0,         // 房间开着的秒数（估算进度用）
        lastTick: 0,
        ticker: 0,
        lastSayAt: 0,
        sayGap: 0,
        hadPause: false,
        ended: false,
        dirtySave: 0
      };

      function saveState() {
        if (!st.src) return;
        const keep = st.msgs.slice(-MAX_MSGS);
        jset(K_STATE, {
          url: st.src.page || st.src.url,
          name: st.src.name,
          kind: st.src.kind,
          embed: st.src.embed || '',
          cur: st.cur,
          dur: st.dur,
          msgs: keep,
          ts: Date.now()
        });
      }
      function loadState() {
        const s = jget(K_STATE, null);
        if (!s || !s.url) return null;
        return s;
      }
      function clearState() { try { optSet(K_STATE, ''); } catch (e) {} }

      // ---------- DOM ----------
      let root = null, vid = null, stageEl = null, listEl = null, chatEl = null, inputEl = null;
      let barTime = null, barFill = null, titleEl = null, subEl = null, playBtn = null;

      function build() {
        if (root) return;
        root = document.createElement('div');
        root.id = HOST_ID;
        root.className = 'wr-root';
        root.hidden = true;
        root.innerHTML =
          '<div class="wr-top">' +
            '<button class="wr-close" type="button" title="退出房间，回到聊天">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>退出' +
            '</button>' +
            '<div class="wr-tt"><div class="wr-title">一起看</div><div class="wr-sub">还没开始</div></div>' +
            '<button class="wr-more" type="button" title="换一个片">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>' +
            '</button>' +
          '</div>' +
          '<div class="wr-stage">' +
            '<video class="wr-video" playsinline controls preload="metadata" hidden></video>' +
            '<iframe class="wr-frame" allow="autoplay; fullscreen; encrypted-media; picture-in-picture; web-share" allowfullscreen frameborder="0" scrolling="no" hidden></iframe>' +
            '<div class="wr-empty">' +
              '<button class="wr-empty-x" type="button" title="退出房间，回到聊天">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>退出' +
              '</button>' +
              '<div class="wr-empty-t">想看点什么？</div>' +
              '<div class="wr-empty-s">粘 B站 / YouTube / b23.tv 视频链接，或选一个本机视频。<br>别的站大多不让嵌入，会直接告诉你。</div>' +
              '<div class="wr-link-row"><input class="wr-link" type="url" placeholder="粘链接…" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"><button class="wr-go" type="button">去看</button></div>' +
              '<div class="wr-empty-acts"><button class="wr-pickfile" type="button">本地上传</button><button class="wr-tapick" type="button">让 TA 挑一部</button></div>' +
              '<div class="wr-note">本机视频只播放不存，刷新页面后要重新选。</div>' +
            '</div>' +
            '<div class="wr-list" hidden><div class="wr-list-h">片单<span class="wr-list-x">收起</span></div><div class="wr-list-b"></div></div>' +
          '</div>' +
          '<div class="wr-bar">' +
            '<button class="wr-play" type="button" title="播放 / 暂停">' +
              '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>' +
            '</button>' +
            '<div class="wr-prog"><div class="wr-prog-fill"></div></div>' +
            '<div class="wr-time">--:-- / --:--</div>' +
            '<button class="wr-say" type="button" title="催 TA 说点什么">TA 说点什么</button>' +
          '</div>' +
          '<div class="wr-chat"></div>' +
          '<div class="wr-in">' +
            '<input class="wr-input" type="text" placeholder="说点什么…" autocomplete="off" maxlength="200">' +
            '<button class="wr-send" type="button">发送</button>' +
          '</div>' +
          '<div class="wr-ask" hidden>' +
            '<div class="wr-ask-b"><div class="wr-ask-t"></div><div class="wr-ask-s"></div>' +
              '<button class="wr-ask-res" type="button">续上</button>' +
              '<button class="wr-ask-new" type="button">换一个重来</button>' +
            '</div>' +
          '</div>';
        hostEl().appendChild(root);
        vid = root.querySelector('.wr-video');
        stageEl = root.querySelector('.wr-stage');
        listEl = root.querySelector('.wr-list');
        chatEl = root.querySelector('.wr-chat');
        inputEl = root.querySelector('.wr-input');
        barTime = root.querySelector('.wr-time');
        barFill = root.querySelector('.wr-prog-fill');
        titleEl = root.querySelector('.wr-title');
        subEl = root.querySelector('.wr-sub');
        playBtn = root.querySelector('.wr-play');
        bindOnce();
      }

      function bindOnce() {
        if (root.__wrBound) return;
        root.__wrBound = true;
        root.querySelector('.wr-close').addEventListener('click', function () { closeRoom(); });
        root.querySelector('.wr-empty-x').addEventListener('click', function () { closeRoom(); });
        root.querySelector('.wr-more').addEventListener('click', function () { openList(); });
        const empty = root.querySelector('.wr-empty');
        root.querySelector('.wr-go').addEventListener('click', function () {
          const inp = root.querySelector('.wr-link');
          const v = (inp && inp.value || '').trim();
          if (!v) { toast('先把链接粘进来'); return; }
          const r = parseLink(v);
          if (r.kind === 'bad') { toast(r.reason); return; }
          if (r.kind === 'b23' || r.kind === 'bili-bangumi') { expandShort(r); return; }
          startWatch(r, true);
          if (inp) inp.value = '';
        });
        root.querySelector('.wr-link').addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); root.querySelector('.wr-go').click(); }
        });
        root.querySelector('.wr-pickfile').addEventListener('click', pickFile);
        root.querySelector('.wr-tapick').addEventListener('click', taPick);
        root.querySelector('.wr-list-x').addEventListener('click', function () { listEl.hidden = true; });
        root.querySelector('.wr-say').addEventListener('click', function () { nudgeTa(true); });
        playBtn.addEventListener('click', togglePlay);
        root.querySelector('.wr-prog').addEventListener('click', onSeekClick);
        root.querySelector('.wr-send').addEventListener('click', sendMsg);
        root.querySelector('.wr-ask-res').addEventListener('click', function () {
          const s = st.pendingResume;
          root.querySelector('.wr-ask').hidden = true;
          st.pendingResume = null;
          if (s) resumeFrom(s); else openRoom();
        });
        root.querySelector('.wr-ask-new').addEventListener('click', function () {
          root.querySelector('.wr-ask').hidden = true;
          st.pendingResume = null;
          st.src = null; st.msgs = []; clearState();
          renderChat();
          openRoom();
          showEmpty(true);
          paintHeader();
          taSay('行，换一个。你想看什么？');
        });
        inputEl.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); sendMsg(); }
        });
        // 本地视频事件
        vid.addEventListener('timeupdate', function () {
          if (!st.src || st.src.kind !== 'file') return;
          st.cur = vid.currentTime || 0;
          st.dur = isFinite(vid.duration) ? vid.duration : 0;
          paintProgress();
          st.dirtySave++;
        });
        vid.addEventListener('loadedmetadata', function () {
          st.dur = isFinite(vid.duration) ? vid.duration : 0;
          st.cur = vid.currentTime || 0;
          paintProgress();
        });
        vid.addEventListener('play', function () {
          if (st.hadPause && !st.ended) taSay(say('resume'));
          st.hadPause = false;
          st.playing = true;
          paintPlayBtn();
        });
        vid.addEventListener('pause', function () {
          if (st.ended) return;
          st.hadPause = true;
          st.playing = false;
          paintPlayBtn();
          taSay(say('pause'));
        });
        vid.addEventListener('ended', function () {
          st.ended = true;
          st.playing = false;
          paintPlayBtn();
          taSay(say('end'));
          saveState();
        });
        vid.addEventListener('error', function () {
          if (!st.src || st.src.kind !== 'file') return;
          taSys('这个视频放不出来（格式不支持，或者链接已经失效了）');
        });
      }

      // ---------- 渲染 ----------
      function paintHeader() {
        const n = st.src ? (st.src.name || '') : '';
        titleEl.textContent = '一起看';
        subEl.textContent = n || '还没开始';
      }
      function paintProgress() {
        let cur = st.cur, dur = st.dur;
        const localMedia = st.src && (st.src.kind === 'file' || st.src.kind === 'local');
        if (st.src && !localMedia) { dur = 0; cur = st.elapsed; }
        if (!dur) {
          barFill.style.width = '0%';
          barTime.textContent = (cur ? fmtTime(cur) : '--:--') + (localMedia ? ' / --:--' : ' / 估算中');
          return;
        }
        const pct = Math.max(0, Math.min(100, cur / dur * 100));
        barFill.style.width = pct.toFixed(1) + '%';
        barTime.textContent = fmtTime(cur) + ' / ' + fmtTime(dur);
      }
      function paintPlayBtn() {
        const svg = playBtn.querySelector('svg');
        if (!svg) return;
        if (st.playing) svg.innerHTML = '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>';
        else svg.innerHTML = '<path d="M8 5v14l11-7z"/>';
        playBtn.classList.toggle('on', !!st.playing);
      }
      function scrollChat() { try { chatEl.scrollTop = chatEl.scrollHeight; } catch (e) {} }
      function addMsg(who, text) {
        if (!text) return;
        st.msgs.push({ who: who, text: String(text), ts: Date.now() });
        while (st.msgs.length > MAX_MSGS) st.msgs.shift();
        const d = document.createElement('div');
        d.className = 'wr-m ' + who;
        d.textContent = text;
        chatEl.appendChild(d);
        scrollChat();
        st.dirtySave++;
      }
      function renderChat() {
        chatEl.innerHTML = '';
        st.msgs.forEach(function (m) {
          const d = document.createElement('div');
          d.className = 'wr-m ' + (m.who || 'sys');
          d.textContent = m.text || '';
          chatEl.appendChild(d);
        });
        scrollChat();
      }
      function taSay(text) {
        if (!text) return;
        const who = taName();
        addMsg('ta', text);
        st.lastSayAt = Date.now();
        st.sayGap = 45000 + Math.random() * 90000;
      }
      function taSys(text) { addMsg('sys', text); }

      function showEmpty(on) {
        const e = root.querySelector('.wr-empty');
        if (e) e.hidden = !on;
        if (on) {
          vid.hidden = true;
          const f = root.querySelector('.wr-frame');
          if (f) { f.hidden = true; f.removeAttribute('src'); }
        }
      }

      // ---------- 开始看 ----------
      function startWatch(src, fromUser) {
        if (!src || !src.embed) return;
        build();
        // 换片：先把旧的收干净（本机视频的 blob 地址也一起放掉；
        // 注意本次要播的就是 st.mediaUrl 时不能撤，否则视频 src 立刻失效）
        try { if (vid) { vid.pause(); vid.removeAttribute('src'); if (vid.load) vid.load(); } } catch (e) {}
        if (st.mediaUrl && st.mediaUrl !== src.embed) { try { URL.revokeObjectURL(st.mediaUrl); } catch (e) {} st.mediaUrl = ''; }
        st.src = src;
        st.cur = 0; st.dur = 0; st.elapsed = 0; st.lastTick = Date.now();
        st.ended = false; st.hadPause = false; st.playing = true;
        st.lastSayAt = Date.now();
        st.sayGap = 60000 + Math.random() * 120000;
        showEmpty(false);
        const frame = root.querySelector('.wr-frame');
        if (src.kind === 'file' || src.kind === 'local') {
          frame.hidden = true;
          frame.removeAttribute('src');
          vid.hidden = false;
          vid.src = src.kind === 'local' ? st.mediaUrl : src.embed;
          try { const p = vid.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
        } else {
          vid.hidden = true;
          vid.removeAttribute('src');
          frame.hidden = false;
          frame.src = src.embed;
        }
        paintHeader();
        paintProgress();
        paintPlayBtn();
        listEl.hidden = true;
        if (fromUser) {
          listAdd(src);
          addMsg('me', '看这个：' + (src.name || src.url));
          taSay(say('start'));
        }
        saveState();
        startTicker();
      }

      // B站短链 / 番剧：先在页面里展开成真实地址（短链会跳转，同源 iframe 读得到最终地址）
      function expandShort(src) {
        build();
        listEl.hidden = true;
        showEmpty(false);
        vid.hidden = true;
        const frame = root.querySelector('.wr-frame');
        frame.hidden = false;
        // 用 b23.tv 原生跳转会跳到 www.bilibili.com，读不到（跨域）；改走 bili 的 API 接口展开
        if (src.kind === 'b23') {
          taSys('正在展开短链…');
          fetchB23(src.url).then(function (real) {
            if (!real) { taSys('短链打不开，可能是网络不通或者链接失效了'); return; }
            const r = parseLink(real);
            if (r.kind === 'bad') { taSys(r.reason); return; }
            if (r.kind === 'bili' || r.kind === 'yt' || r.kind === 'file') startWatch(r, true);
            else taSys('这个链接展开后还是不能直接嵌着看，换个视频页试试');
          });
          return;
        }
        // 番剧：官方播放器支持 ep/season
        taSys('番剧页目前只能用 B站 官方播放器打开，可能不完整');
        const m = src.url.match(/\/(ep|ss)(\d+)/);
        if (m) {
          const embed = 'https://player.bilibili.com/player.html?' + (m[1] === 'ep' ? 'episode_id=' : 'season_id=') + m[2] + '&autoplay=1&danmaku=0';
          startWatch({ kind: 'bili', url: src.url, page: src.url, embed: embed, name: 'B站番剧 ' + m[1] + m[2] }, false);
        } else {
          taSys('这条番剧链接没能识别出集数');
        }
      }
      function fetchB23(u) {
        const id = (u.match(/b23\.tv\/([0-9A-Za-z]+)/) || [])[1];
        if (!id) return Promise.resolve('');
        const urls = [
          'https://b23.tv/' + id,
          'https://api.bilibili.com/x/share/click?build=1&buvid=x&platform=android&share_id=main.ugc-video-detail.0.0&share_origin=android&oid=' + id
        ];
        // 短链带 CORS 的概率不高，先短链 POST form（b23 接受 POST 并返回真实地址）
        return fetch(urls[0], { method: 'POST', body: 'x=1', mode: 'cors' }).then(function (r) {
          if (!r.ok) throw new Error('bad');
          return r.url || urls[0];
        }).catch(function () {
          return fetch('https://b23.tv/' + id, { redirect: 'follow' }).then(function (r) {
            return r.url && r.url.indexOf('bilibili.com/video/') >= 0 ? r.url : '';
          });
        }).catch(function () { return ''; });
      }

      // ---------- 本地上传（只播放不存） ----------
      let fileInput = null;
      function pickFile() {
        if (!fileInput) {
          fileInput = document.createElement('input');
          fileInput.type = 'file';
          fileInput.accept = 'video/*,.mp4,.webm,.ogv,.m4v';
          fileInput.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
          document.body.appendChild(fileInput);
          fileInput.addEventListener('change', onFilePicked);
        }
        fileInput.value = '';
        try { fileInput.click(); } catch (e) { toast('这台设备不支持选文件'); }
      }
      function onFilePicked() {
        const f = fileInput && fileInput.files && fileInput.files[0];
        if (!f) return;
        if (st.mediaUrl) { try { URL.revokeObjectURL(st.mediaUrl); } catch (e) {} }
        st.mediaUrl = URL.createObjectURL(f);
        const name = f.name || '本地视频';
        const src = { kind: 'local', url: 'local:' + name, page: 'local:' + name, embed: st.mediaUrl, name: name };
        startWatch(src, true);
      }

      // ---------- TA 挑片 ----------
      function taPick() {
        const lib = listGet();
        if (!lib.length) { toast('片单还是空的，先粘个链接或选个本地视频'); return; }
        const m = lib[Math.floor(Math.random() * lib.length)];
        addMsg('ta', '要不看这个？' + (m.name || m.url));
        if (m.url.indexOf('local:') === 0) {
          addMsg('ta', '本地的那个得你重新选一下文件，浏览器不让我替你打开。');
          return;
        }
        const r = parseLink(m.url);
        if (r.kind === 'b23' || r.kind === 'bili-bangumi') { expandShort(r); }
        else if (r.kind !== 'bad') { startWatch(r, false); }
        else { toast(r.reason); }
      }

      // ---------- 片单面板 ----------
      function openList() {
        build();
        const lib = listGet();
        const b = listEl.querySelector('.wr-list-b');
        b.innerHTML = '';
        if (!lib.length) {
          b.innerHTML = '<div class="wr-list-empty">片单是空的。粘过的链接会自动记在这里。</div>';
        } else {
          lib.forEach(function (m) {
            const row = document.createElement('div');
            row.className = 'wr-li';
            row.innerHTML = '<div class="wr-li-m"><div class="wr-li-n">' + esc(m.name || m.url) + '</div><div class="wr-li-u">' + esc((m.url || '').slice(0, 60)) + '</div></div>' +
              '<button class="wr-li-x" type="button" title="从片单删掉">✕</button>';
            row.querySelector('.wr-li-m').addEventListener('click', function () {
              if (m.url.indexOf('local:') === 0) { toast('本地视频不存，需要重新选文件'); pickFile(); return; }
              const r = parseLink(m.url);
              if (r.kind === 'bad') { toast(r.reason); return; }
              if (r.kind === 'b23' || r.kind === 'bili-bangumi') { expandShort(r); return; }
              startWatch(r, false);
            });
            row.querySelector('.wr-li-x').addEventListener('click', function (e) {
              e.stopPropagation();
              listRemove(m.url);
              openList();
            });
            b.appendChild(row);
          });
        }
        listEl.hidden = false;
      }

      // ---------- 播放控制 ----------
      function togglePlay() {
        if (!st.src) { showEmpty(true); return; }
        if (st.src.kind !== 'file') {
          // 嵌在里面的播放器不归我们管：把 iframe 关掉再开＝暂停（进度会重来，会说明白）
          toast('外部播放器的播放键在里面，得点视频本身；我这里只负责陪你聊');
          return;
        }
        try { if (vid.paused) vid.play(); else vid.pause(); } catch (e) {}
      }
      function onSeekClick(e) {
        if (!st.src || st.src.kind !== 'file' || !st.dur) return;
        const r = barFill.parentNode.getBoundingClientRect();
        const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
        try { vid.currentTime = p * st.dur; } catch (err) {}
        st.cur = p * st.dur;
        paintProgress();
        taSay(say('seek'));
      }

      // ---------- 消息 ----------
      function sendMsg() {
        const v = (inputEl.value || '').trim();
        if (!v) return;
        inputEl.value = '';
        addMsg('me', v);
        saveState();
        // TA 回一句：先「嗯」一下，再从池里挑一句相关或兜底
        setTimeout(function () {
          if (!st.open) return;
          const pool = [say('idle'), '嗯嗯，我也觉得。', '那你怎么想？', '我听到了，继续看。', '你说话的时候我就分心了。'];
          taSay(pick(pool));
        }, 900 + Math.random() * 1200);
      }

      function nudgeTa(manual) {
        if (!st.src && manual) { toast('还没开始看呢'); return; }
        if (!manual) {
          // 自动触发看「阅读批注」之外的概率：一起看用自己的一套（聊天设置里没有单独概率，
          // 这里跟随字卡库「互动回应」的使用概率，若被关成 0 就静默）
          try {
            const p = window.dcfGet ? window.dcfGet('interact') : 100;
            if (Math.random() * 100 >= p) return;
          } catch (e) {}
        }
        taSay(say('idle'));
      }

      // ---------- 计时器（估算进度 + 定期冒话） ----------
      function startTicker() {
        if (st.ticker) return;
        st.lastTick = Date.now();
        st.ticker = setInterval(tick, 1000);
      }
      function stopTicker() {
        if (st.ticker) { clearInterval(st.ticker); st.ticker = 0; }
      }
      function tick() {
        const now = Date.now();
        const dt = Math.max(0, Math.min(5, (now - st.lastTick) / 1000));
        st.lastTick = now;
        if (!st.src) return;
        if (st.src.kind !== 'file' && !vid.paused) {
          st.elapsed += dt;
          st.cur = st.elapsed;
          paintProgress();
        }
        // 定期冒一句话（只在「正经在看」的时候；房间开着小差也照常说）
        if (now - st.lastSayAt >= st.sayGap) {
          nudgeTa(false);
        }
        // 每 20 秒落一次盘（进度 + 对话）
        st.dirtySave++;
        if (st.dirtySave >= 20) { st.dirtySave = 0; saveState(); }
      }

      // ---------- 打开 / 关闭 ----------
      function openRoom() {
        build();
        if (!st.inited) {
          st.inited = true;
          renderChat();
        }
        enterChatPage();
        try { if (window.roomSkinApply) window.roomSkinApply(); } catch (e) {} // 房间美化：按当前桌面重算一遍 --rs-* 变量
        root.querySelector('.wr-ask').hidden = true;
        root.hidden = false;
        st.open = true;
        try {
          if (window.closeIme) window.closeIme();
          const kb = document.activeElement;
          if (kb && kb.blur) kb.blur();
        } catch (e) {}
        if (st.src) {
          // 外部播放器退出时被清掉了 src，重新打开要装回去（进度会从头，界面上已写明）
          if (st.src.kind !== 'file' && st.src.kind !== 'local') {
            const f = root.querySelector('.wr-frame');
            if (f && !f.getAttribute('src')) { f.hidden = false; f.src = st.src.embed; st.elapsed = 0; st.cur = 0; }
            vid.hidden = true;
          } else {
            try { vid.hidden = false; if (!vid.getAttribute('src') && st.src.embed) vid.src = st.src.embed; } catch (e) {}
          }
          paintHeader(); paintProgress(); paintPlayBtn(); startTicker();
        }
        else { showEmpty(true); }
      }

      function closeRoom() {
        if (!st.open) return;
        saveState();
        // 本地视频：退出就暂停（不存，刷新后要重新选）
        try { if (st.src && (st.src.kind === 'file' || st.src.kind === 'local') && vid) vid.pause(); } catch (e) {}
        stopTicker();
        st.open = false;
        if (root) root.hidden = true;
        // 外部播放器暂停不了，退出后就别在后台接着放：把 iframe 的 src 清掉，回来重载（进度会丢，已在界面说明）
        try {
          const f = root && root.querySelector('.wr-frame');
          if (f && st.src && st.src.kind !== 'file' && st.src.kind !== 'local') {
            f.removeAttribute('src');
            f.hidden = true;
          }
        } catch (e) {}
        // 回到默认聊天界面（房间是挂在聊天页里的浮层，退出时先收起键盘再交给聊天页自己定位）
        try {
          const pc = document.getElementById('page-chat');
          if (pc) pc.hidden = false;
          if (window.chatScrollBottom) window.chatScrollBottom();
        } catch (e) {}
      }

      // 从上次的状态续上
      function resumeFrom(saved) {
        const r = saved.kind === 'file' || saved.kind === 'local'
          ? { kind: 'file', url: saved.url, page: saved.url, embed: saved.embed || saved.url, name: saved.name }
          : { kind: saved.kind, url: saved.url, page: saved.url, embed: saved.embed, name: saved.name };
        // 本机视频：blob 地址跨刷新就失效了 —— 先把对话和书签恢复出来，再让用户重选文件
        if (r.kind === 'file' && (/^blob:/.test(String(r.embed || '')) || /^local:/.test(String(r.url || '')) || /^local:/.test(String(r.page || '')))) {
          st.msgs = Array.isArray(saved.msgs) ? saved.msgs.slice(-MAX_MSGS) : [];
          st.src = null;
          st.cur = 0; st.dur = 0;
          openRoom();
          renderChat();
          showEmpty(true);
          paintHeader();
          addMsg('sys', '上次是本地视频「' + (saved.name || '') + '」，浏览器不存它，需要你重新选一次文件；聊天和片单都替你留着。');
          return;
        }
        if (!r.embed) { toast('这条链接的信息不全，得重新粘一次'); return; }
        st.msgs = Array.isArray(saved.msgs) ? saved.msgs.slice(-MAX_MSGS) : [];
        renderChat();
        startWatch(r, false);
        st.cur = Number(saved.cur) || 0;
        st.dur = Number(saved.dur) || 0;
        st.elapsed = st.cur;
        if (st.src.kind === 'file' || st.src.kind === 'local') {
          try { vid.currentTime = st.cur; } catch (e) {}
        }
        paintProgress();
        addMsg('sys', '续上了：' + (r.name || r.url) + (st.cur ? '（上次看到 ' + fmtTime(st.cur) + '）' : ''));
        taSay('好，接着看。');
      }

      window.openWatchRoom = function () {
        if (!window.watchRoomEnabled()) {
          toast('一起看入口已在 聊天设置 → 功能 → 一起看 / 一起读 里关闭');
          return;
        }
        build();
        if (st.open) { root.hidden = false; return; }
        enterChatPage();
        const saved = loadState();
        if (saved && (saved.url || (saved.msgs && saved.msgs.length))) {
          // 手动选：续上还是重来（房间里的面板，不弹通用弹窗，免得关了房间还留着）
          st.pendingResume = saved;
          root.hidden = false;
          st.open = true;
          enterChatPage();
          root.querySelector('.wr-ask-t').textContent = '上次看的还没完：' + (saved.name || saved.url);
          root.querySelector('.wr-ask-s').textContent = (saved.cur ? '上次看到 ' + fmtTime(saved.cur) + '（B站/YouTube 是按时间估的）' : '上次刚开个头') +
            (saved.msgs && saved.msgs.length ? ' · 聊了 ' + saved.msgs.length + ' 句' : '');
          root.querySelector('.wr-ask').hidden = false;
          return;
        }
        st.src = null;
        openRoom();
        showEmpty(true);
        paintHeader();
      };

      // 切桌面时把房间收起来（房间里的一切是给这个联系人的）
      document.addEventListener('contact-switched', function () {
        if (st.open) closeRoom();
      });

      if (window.__mochiLoaded) window.__mochiLoaded.push('watch-room.js');
    })();
  } catch (__e) {
    if (window.__mochiErrLoaded) window.__mochiErrLoaded.push('watch-room.js');
    try { console.error('[JS] watch-room.js', __e && __e.message || __e); } catch (x) {}
    if (window.__jsErrors) window.__jsErrors.push('[watch-room.js] ' + String(__e && __e.message || __e));
  }
})();
