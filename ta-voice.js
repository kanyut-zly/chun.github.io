/* 私人七改 · TA 的声音（TTS）
 *
 * 用户要求：
 *   ①同时接 MiniMax 和 Fish Audio，自己选；
 *   ②说清楚「念的是不是字卡拼出来的碎片」「会不会断断续续」；
 *   ③接进语音通话 / 视频通话，让 TA 在通话里能自由说话。
 *
 * 对外接口：
 *   taVoiceOpen()            打开设置抽屉
 *   taVoiceOn()              总开关是否开着
 *   taVoiceSpeak(text, opt)  念一句（opt: {call:true}）
 *   taVoiceStop()            掐断当前正在念的
 *
 * 念什么：
 *   · 聊天自动朗读 = 聊天里新到来的「TA 的消息」（气泡里显示的那句正文，
 *     不是字卡库里的碎片，也不是「情绪 / 心意 / 交流意图」那些小标）。
 *   · 通话朗读 = 通话接通时的开场白 + 通话中 TA 自己说的一些话（字幕同步显示），
 *     选的句子来自 TA 的心情字卡库（都是完整的一句话，不是拼起来的碎片）。
 *   · 念之前会先把文字洗干净：括号里的动作说明只留文字（去壳）、颜文字 / emoji /
 *     表情符号不念、纯符号的消息直接跳过。
 *   · 连着来的几条 TA 消息会在 1.2 秒内合成一句再念，不会一条一条断断续续；
 *     回话也是一句念完再念下一句，不会叠在一起。
 *
 * 数据（全部存在当前联系人自己的桌面里）：
 *   tv-en            '1' / '0'         总开关，默认关
 *   tv-provider      'minimax' / 'fish' 后端
 *   tv-mm-key        MiniMax Key
 *   tv-mm-group      MiniMax GroupId（老版 Key 才需要）
 *   tv-mm-model      MiniMax 模型，默认 speech-2.8-turbo
 *   tv-mm-host       接口地址，默认 https://api.minimaxi.com
 *   tv-mm-voice      音色 ID
 *   tv-fish-key      Fish Audio Key
 *   tv-fish-model    Fish 模型，默认 speech-1.1
 *   tv-fish-voice    参考音色（reference_id）
 *   tv-speed         语速 0.5~2，默认 0.95
 *   tv-auto          '1' / '0'         聊天里自动念 TA 的新消息
 *   tv-call          '1' / '0'         通话里让 TA 说话
 */
(function () {
  try {
    (function () {
      'use strict';

      const DRAWER_ID = 'ta-voice-drawer';
      const KEY = {
        EN: 'tv-en', PROVIDER: 'tv-provider', SPEED: 'tv-speed',
        MM_KEY: 'tv-mm-key', MM_GROUP: 'tv-mm-group', MM_MODEL: 'tv-mm-model', MM_HOST: 'tv-mm-host', MM_VOICE: 'tv-mm-voice',
        FISH_KEY: 'tv-fish-key', FISH_MODEL: 'tv-fish-model', FISH_VOICE: 'tv-fish-voice',
        AUTO: 'tv-auto', CALL: 'tv-call'
      };
      // 跟联系人相关、但不该被「跨桌面同步设置」带走的键（contacts.js 的 EXCLUDE 里）
      const DEFAULT_MM_HOST = 'https://api.minimaxi.com';
      const MM_MODELS = ['speech-2.8-turbo', 'speech-2.8-hd', 'speech-2.6-turbo', 'speech-2.6-hd', 'speech-02-turbo', 'speech-02-hd'];
      const FISH_MODELS = ['speech-1.1', 'speech-1.2', 's1'];
      // MiniMax 的几个备选域名（新版开放平台 / 老版平台）
      const MM_HOSTS = [
        { host: 'https://api.minimaxi.com', legacy: false },
        { host: 'https://api.minimax.io', legacy: false },
        { host: 'https://api.minimaxi.chat', legacy: true },
        { host: 'https://api.minimax.chat', legacy: true }
      ];

      function curStore() {
        try { return window.activeStore ? window.activeStore() : (window.storeFor ? window.storeFor('default') : null); } catch (e) { return null; }
      }
      function g(k, def) {
        try { const st = curStore(); const v = st ? st.get(k) : null; return v === null || v === undefined || v === '' ? def : v; } catch (e) { return def; }
      }
      function s(k, v) { try { const st = curStore(); if (st) st.set(k, v); } catch (e) {} }
      function rm(k) { try { const st = curStore(); if (st) st.remove(k); } catch (e) {} }
      function toast(m) { try { if (window.toast) window.toast(m); else console.log('[ta-voice]', m); } catch (e) {} }
      function esc(x) {
        return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
      }
      function enabled() { return g(KEY.EN, '0') === '1'; }
      function provider() { return g(KEY.PROVIDER, 'minimax') === 'fish' ? 'fish' : 'minimax'; }
      function autoOn() { return g(KEY.AUTO, '1') !== '0'; }
      function callOn() { return g(KEY.CALL, '1') !== '0'; }
      function speedVal() {
        const v = parseFloat(g(KEY.SPEED, '0.95'));
        return isFinite(v) ? Math.max(0.5, Math.min(2, v)) : 0.95;
      }
      window.taVoiceOn = enabled;

      // ============================================================
      // 一、文字清洗：念之前把不该念的东西去掉
      // ============================================================
      function cleanText(raw) {
        let t = String(raw == null ? '' : raw);
        if (!t) return '';
        // 图片 / 表情 / 语音令牌（这些不是话）
        t = t.replace(/@@m:[0-9a-f]{32}/gi, ' ');
        t = t.replace(/data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, ' ');
        t = t.replace(/@@[a-z]+:[^\s@]+/gi, ' ');
        t = t.replace(/\[[^\]]{0,6}(图片|表情|表情包|语音|涂鸦|动画|视频)[^\]]{0,6}\]/g, ' ');
        // HTML 标签
        t = t.replace(/<[^>]*>/g, ' ');
        // 引用块只念正文（引用块一般是缩写，重念一遍太啰嗦）——这里整段去掉
        t = t.replace(/「[^」]{0,40}」/g, function (m) { return m.length > 44 ? '' : m; });
        // 括号动作：只留括号里的文字，去壳（“（笑）你终于来了”→“笑，你终于来了”）
        t = t.replace(/[（(\[【《<][^）)\]】》>]{1,24}[）)\]】》>]/g, function (m) {
          const inner = m.slice(1, -1).trim();
          // 纯符号 / 纯标点的括号内容（如“（…）”“(^^)”）直接丢
          if (!/[\u4e00-\u9fa5a-zA-Z0-9]/.test(inner)) return ' ';
          return '，' + inner + '，';
        });
        t = t.replace(/\*{1,2}([^*\n]{1,24})\*{1,2}/g, function (m, inner) {
          return /[\u4e00-\u9fa5a-zA-Z0-9]/.test(inner) ? '，' + inner + '，' : ' ';
        });
        // emoji / 颜文字 / 特殊符号
        t = t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{E000}-\u{F8FF}]+/gu, ' ');
        // 英文颜文字（=D :3 :) 之类）先整段掐掉，别留下一个孤零零的字母
        t = t.replace(/(^|[\s\u4e00-\u9fa5，,。!！?？])[:;=][\-^oO]?['"]?[dDpP3()]+/g, '$1');
        t = t.replace(/(?<=[\u4e00-\u9fa5])[:;=][\-^oO]?['"]?[dDpP3()]+/g, '');
        t = t.replace(/[:;=]['"]?[-^oO]['"]?(?=[\s，,。.!！？?]|$)/g, ' ');
        t = t.replace(/[~～^`|/\\★☆♪♡♥❤✿※◆●■□▲△▽▼〇◎⊙⊕⊗¤§¶†‡•·°±×÷=+_#@$%&<>{}[\]]/g, ' ');
        t = t.replace(/\b([a-z]{1,4})\^\b|orz|OTL|233+/gi, ' ');
        // 连续标点只留一个停顿
        t = t.replace(/[，,]{2,}/g, '，').replace(/[。.]{2,}/g, '。').replace(/[!！]{2,}/g, '！').replace(/[?？]{2,}/g, '？');
        t = t.replace(/[ \t\u00A0]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
        // 去掉首尾 / 连续的标点堆
        t = t.replace(/^[，,。.、；;：:！!？?\s]+/, '').replace(/[，,、；;：:\s]+$/, '');
        t = t.replace(/([，,。.、；;：:！!？?])\s*([，,。.、；;：:])+/g, '$1');
        // 纯标点 / 太短（一个符号）不念
        if (!/[\u4e00-\u9fa5a-zA-Z0-9]/.test(t)) return '';
        return t.slice(0, 600);
      }
      window.taVoiceCleanText = cleanText;

      // ============================================================
      // 二、两种后端合成
      // ============================================================
      function hexToAudio(hex, mime) {
        const h = String(hex || '').trim();
        if (!h) return '';
        const n = h.length >> 1;
        const bytes = new Uint8Array(n);
        for (let i = 0; i < n; i++) bytes[i] = parseInt(h.substr(i * 2, 2), 16);
        let bin = '';
        const CH = 0x8000;
        for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
        return 'data:' + (mime || 'audio/mpeg') + ';base64,' + btoa(bin);
      }
      function blobToUrl(blob) { return URL.createObjectURL(blob); }

      function abortAfter(ms) {
        const c = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        if (c) setTimeout(function () { try { c.abort(); } catch (e) {} }, ms);
        return c ? c.signal : undefined;
      }

      async function mmSynth(text, key, group, model, host, voice, spd) {
        const cand = (function () {
          const h = String(host || '').trim().replace(/\/+$/, '');
          if (h) {
            const known = MM_HOSTS.find(x => x.host === h);
            return { host: h, legacy: known ? known.legacy : false };
          }
          return MM_HOSTS[0];
        })();
        const q = cand.legacy && group ? '?GroupId=' + encodeURIComponent(group) : '';
        const voiceSetting = { voice_id: voice || 'male-qn-qingse', speed: spd, vol: 1, pitch: 0 };
        const body = {
          model: model || 'speech-2.8-turbo',
          text: text,
          stream: false,
          voice_setting: voiceSetting,
          audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 },
          language_boost: 'auto'
        };
        let res;
        try {
          res = await fetch(cand.host + '/v1/t2a_v2' + q, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
            body: JSON.stringify(body),
            signal: abortAfter(40000)
          });
        } catch (e) {
          const err = new Error('连不上 MiniMax（网络 / 域名不通），换一个接口地址或稍后再试');
          err.net = true; throw err;
        }
        const data = await res.json().catch(function () { return null; });
        if (!data) {
          const err = new Error('MiniMax HTTP ' + res.status + '：没拿到数据');
          err.auth = res.status === 401 || res.status === 403;
          throw err;
        }
        const br = data.base_resp || {};
        if (br.status_code !== undefined && br.status_code !== 0) {
          const err = new Error('MiniMax 说：' + (br.status_msg || ('错误码 ' + br.status_code)));
          err.auth = br.status_code === 1004 || br.status_code === 2049 || br.status_code === 1002;
          throw err;
        }
        const hex = data.data && data.data.audio;
        if (!hex) throw new Error('MiniMax 没返回音频（可能没有这个音色 / 模型权限）');
        return hexToAudio(hex, 'audio/mpeg');
      }

      async function fishSynth(text, key, model, voice) {
        const body = {
          text: text,
          reference_id: voice || undefined,
          format: 'mp3',
          mp3_bitrate: 128,
          chunk_length: 200,
          normalize: true,
          latency: 'normal'
        };
        if (!body.reference_id) delete body.reference_id;
        let res;
        try {
          res = await fetch('https://api.fish.audio/v1/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
            body: JSON.stringify(body),
            signal: abortAfter(40000)
          });
        } catch (e) {
          const err = new Error('连不上 Fish Audio（网络不通），稍后再试');
          err.net = true; throw err;
        }
        if (!res.ok) {
          let msg = 'Fish Audio HTTP ' + res.status;
          try {
            const j = await res.json();
            if (j && (j.message || j.detail)) msg += '：' + (j.message || j.detail);
          } catch (e) {}
          const err = new Error(msg);
          err.auth = res.status === 401 || res.status === 403;
          throw err;
        }
        const blob = await res.blob();
        if (!blob || !blob.size) throw new Error('Fish Audio 没返回音频');
        return blobToUrl(blob);
      }

      async function synth(text, opt) {
        const p = provider();
        if (p === 'fish') {
          const key = String(g(KEY.FISH_KEY, '')).trim();
          const voice = String(g(KEY.FISH_VOICE, '')).trim();
          if (!key) throw new Error('还没填 Fish Audio 的 Key（设置 → 语音 → 选 Fish Audio）');
          return fishSynth(text, key, String(g(KEY.FISH_MODEL, 'speech-1.1')).trim(), voice);
        }
        const key = String(g(KEY.MM_KEY, '')).trim();
        const voice = String(g(KEY.MM_VOICE, '')).trim();
        if (!key) throw new Error('还没填 MiniMax 的 Key（设置 → 语音 → 选 MiniMax）');
        if (!voice) throw new Error('还没选音色：点「拉取音色名单」挑一个，或直接填 voice_id');
        return mmSynth(text, key, String(g(KEY.MM_GROUP, '')).trim(),
          String(g(KEY.MM_MODEL, MM_MODELS[0])).trim(),
          String(g(KEY.MM_HOST, DEFAULT_MM_HOST)).trim(), voice, speedVal());
      }

      // ============================================================
      // 三、播放队列：一句念完再念下一句，不会叠在一起
      // ============================================================
      let audio = null;          // 当前（复用一个 Audio，省内存）
      let queue = [];            // [{text, call}]
      let playing = false;
      const cache = new Map();   // text → url（限 40 条，多的放出队列时 revoke）
      const CACHE_MAX = 40;
      let lastFailAt = 0;
      let failToastShown = 0;

      function cachePut(k, v) {
        cache.set(k, v);
        while (cache.size > CACHE_MAX) {
          const oldest = cache.keys().next().value;
          const old = cache.get(oldest);
          cache.delete(oldest);
          try { if (old && old.indexOf('blob:') === 0) URL.revokeObjectURL(old); } catch (e) {}
        }
      }

      function ensureAudio() {
        if (audio) return audio;
        audio = new Audio();
        audio.preload = 'auto';
        audio.addEventListener('ended', function () { pump(); });
        audio.addEventListener('error', function () { pump(); });
        return audio;
      }

      async function pump() {
        if (playing) return;
        if (!queue.length) { playing = false; return; }
        if (!enabled()) { queue = []; playing = false; return; }
        playing = true;
        const item = queue.shift();
        let url = cache.get(item.text);
        try {
          if (!url) {
            url = await synth(item.text);
            // 合成期间被掐了 / 关了：直接丢掉
            if (!enabled()) { queue = []; playing = false; return; }
            if (url) cachePut(item.text, url);
          }
          const a = ensureAudio();
          a.src = url;
          if (item.call) {
            const line = document.getElementById('call-voice-line');
            if (line) { line.textContent = item.text; line.hidden = false; }
          }
          try {
            await a.play();
          } catch (ePlay) {
            // 自动播放被浏览器拦：提示一次，不再打扰
            const now = Date.now();
            if (now - failToastShown > 60000) {
              failToastShown = now;
              toast('声音被浏览器拦下了：先点一下聊天框（或点设置里的试听）再让 TA 说');
            }
            playing = false;
            return;
          }
          // play() 成功后等 ended 再继续（事件里调 pump）
          return;
        } catch (e) {
          playing = false;
          const now = Date.now();
          if (now - lastFailAt > 30000) {
            lastFailAt = now;
            let msg = e && e.message ? e.message : '语音合成失败';
            if (e && e.auth) msg = '这个 Key 好像不对：' + msg;
            if (e && e.net) msg = '网络不通：' + msg;
            toast(msg);
          }
          setTimeout(pump, 120);
          return;
        }
      }

      function enqueue(text, opt) {
        const t = cleanText(text);
        if (!t) return;
        if (!enabled()) return;
        opt = opt || {};
        // 通话里同一条不重复排
        if (queue.some(q => q.text === t)) return;
        // 队列别越堆越长：超过 4 句就丢旧的通话句
        while (queue.length > 4) queue.shift();
        queue.push({ text: t, call: !!opt.call });
        pump();
      }

      // 私人七改：助眠读故事要「只合成、自己播」——把合成单独露出来，不要走聊天那套自动播放
      window.taVoiceSpeak = function (text, opt) { enqueue(text, opt); };
      window.taVoiceSynth = synth;
      window.taVoiceStop = function () {
        queue = [];
        playing = false;
        try { if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); } } catch (e) {}
        const line = document.getElementById('call-voice-line');
        if (line) line.hidden = true;
      };

      // ============================================================
      // 四、聊天自动朗读：监听 #chat-body 新增的 TA 消息
      // ============================================================
      let chatObs = null;
      let pendBuf = [];
      let pendTimer = null;
      let sawFirstBatch = false;

      function readMsgText(el) {
        const b = el.querySelector('.msg-bubble');
        if (!b) return '';
        // 图片 / 表情 / 语音 / 涂鸦这类不是话
        if (b.querySelector('.msg-voice, .msg-img, img.msg-img, .draw-card, .msg-draw')) return '';
        const clone = b.cloneNode(true);
        clone.querySelectorAll('.msg-moods, .msg-fav-tag, .msg-poke-seg, .msg-quote').forEach(function (n) { n.remove(); });
        return clone.textContent || '';
      }

      function onNewMsg(el) {
        if (!el || el.nodeType !== 1 || !el.classList || !el.classList.contains('msg')) return;
        if (!el.classList.contains('msg-in')) return;   // 只念 TA 说的，不念自己说的
        const t = readMsgText(el);
        const clean = cleanText(t);
        if (!clean) return;
        pendBuf.push(clean);
        if (pendTimer) clearTimeout(pendTimer);
        // 连着来的几条（连发 / 多字卡）在 1.3 秒内合成一句
        pendTimer = setTimeout(function () {
          const all = pendBuf.join('。');
          pendBuf = []; pendTimer = null;
          enqueue(all, { call: false });
        }, 1300);
      }

      function bootChatObs() {
        const bodyEl = document.getElementById('chat-body');
        if (!bodyEl || chatObs) return;
        chatObs = new MutationObserver(function (muts) {
          if (!enabled() || !autoOn()) return;
          for (let i = 0; i < muts.length; i++) {
            const added = muts[i].addedNodes;
            for (let j = 0; j < added.length; j++) {
              const n = added[j];
              if (n && n.nodeType === 1) onNewMsg(n);
            }
          }
        });
        chatObs.observe(bodyEl, { childList: true });
        // 刚打开页面时的历史消息不念（只念之后新来的）
        sawFirstBatch = true;
      }

      // ============================================================
      // 五、通话：接通说开场白，之后隔一阵说一句
      // ============================================================
      let callTimer = null;
      let callWasActive = false;
      let callTickAt = 0;
      let callSpoken = [];
      let callNextAt = 0;

      function pickFrom(field) {
        try {
          const d = window.TA_MOOD_DATA || {};
          if (Array.isArray(d.cards) && d.cards.length) {
            const pool = d.cards.filter(c => c && typeof c.content === 'string' && c.content.length >= 6 && c.content.length <= 26);
            if (pool.length) return pool[Math.floor(Math.random() * pool.length)].content;
          }
        } catch (e) {}
        return field === 'open' ? '喂，听得见吗？' : '嗯，我在听。';
      }

      function callOpeners() { return ['喂？', '嗯？怎么啦。', '我在呢。']; }

      function startCallTalk() {
        if (!enabled() || !callOn()) return;
        const st = window.getCallState ? window.getCallState() : null;
        if (!st || st.status !== 'connected') return;
        // 开场白：接通后 1.2 秒
        setTimeout(function () {
          if (!enabled() || !callOn()) return;
          const st2 = window.getCallState ? window.getCallState() : null;
          if (!st2 || st2.status !== 'connected') return;
          const op = callOpeners()[Math.floor(Math.random() * callOpeners().length)];
          enqueue(op, { call: true });
          callNextAt = Date.now() + 26000 + Math.random() * 24000;
        }, 1200);
      }

      function tickCall() {
        const st = window.getCallState ? window.getCallState() : null;
        const active = !!(st && st.status === 'connected');
        if (active && !callWasActive) {
          callWasActive = true;
          callSpoken = [];
          startCallTalk();
        } else if (!active) {
          if (callWasActive) {
            callWasActive = false;
            // 挂断：掐掉正在念的（通话里的声音只在通话中说话）
            try { queue = queue.filter(q => !q.call); } catch (e) {}
            try { if (audio && !audio.paused) { audio.pause(); } } catch (e) {}
            const line = document.getElementById('call-voice-line');
            if (line) line.hidden = true;
          }
          return;
        }
        if (!active) return;
        if (!enabled() || !callOn()) return;
        if (Date.now() < callNextAt) return;
        if (queue.length || playing) { callNextAt = Date.now() + 15000; return; }
        let txt = pickFrom('mid');
        let tries = 0;
        while (callSpoken.indexOf(txt) >= 0 && tries < 6) { txt = pickFrom('mid'); tries++; }
        callSpoken.push(txt);
        if (callSpoken.length > 12) callSpoken.shift();
        enqueue(txt, { call: true });
        callNextAt = Date.now() + 25000 + Math.random() * 30000;
      }

      function bootCallPoll() {
        if (callTimer) return;
        callTimer = setInterval(function () { try { tickCall(); } catch (e) {} }, 2500);
      }

      // ============================================================
      // 六、设置抽屉
      // ============================================================
      let drawer = null;
      function host() { return document.querySelector('.phone') || document.body; }

      function build() {
        if (drawer) return;
        drawer = document.createElement('div');
        drawer.id = DRAWER_ID;
        drawer.className = 'rs-drawer tv-drawer';
        drawer.hidden = true;
        drawer.innerHTML =
          '<div class="rs-hd"><div class="rs-hd-t">TA 的声音</div><button class="rs-x" type="button" title="关闭">✕</button></div>' +
          '<div class="rs-body tv-body"></div>';
        host().appendChild(drawer);
        drawer.querySelector('.rs-x').addEventListener('click', close);
        render();
      }
      function open() { build(); drawer.hidden = false; render(); }
      function close() { if (drawer) drawer.hidden = true; }
      window.taVoiceOpen = open;

      function field(label, key, placeholder, sub, opts) {
        opts = opts || {};
        const val = g(key, opts.def || '');
        return '<label class="tv-field' + (opts.wide ? ' wide' : '') + '">' +
          '<span class="tv-f-t">' + esc(label) + (sub ? '<i>' + esc(sub) + '</i>' : '') + '</span>' +
          '<input class="tv-in" type="' + (opts.pass ? 'password' : 'text') + '" data-key="' + key + '" ' +
          'value="' + esc(val) + '" placeholder="' + esc(placeholder) + '" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">' +
          '</label>';
      }
      function selectField(label, key, list, cur) {
        return '<label class="tv-field"><span class="tv-f-t">' + esc(label) + '</span>' +
          '<select class="tv-in" data-key="' + key + '">' +
          list.map(function (o) {
            return '<option value="' + esc(o.value) + '"' + (o.value === cur ? ' selected' : '') + '>' + esc(o.label) + '</option>';
          }).join('') +
          '</select></label>';
      }

      function render() {
        if (!drawer) return;
        const body = drawer.querySelector('.tv-body');
        const on = enabled();
        const p = provider();
        const pv = p === 'fish' ? 'fish' : 'minimax';
        body.innerHTML =
          '<div class="rs-sec"><div class="rs-sec-t">总开关</div>' +
            '<div class="tv-toggle glass">' +
              '<div class="tv-toggle-txt"><div class="tv-toggle-name">让 TA 出声</div>' +
                '<div class="tv-toggle-sub">关掉后聊天与通话都不出声，设置保留</div></div>' +
              '<label class="toggle"><input type="checkbox" id="tv-en-toggle"' + (on ? ' checked' : '') + '><span class="tk"></span></label>' +
            '</div>' +
            '<div class="rs-hint">念的是聊天里 TA 真正说出口的那句正文（气泡里看到的），不是字卡库里的碎片；' +
              '情绪 / 心意 / 交流意图那些小标不会念。括号里的动作只念文字（去壳），颜文字、emoji 不念；纯符号的消息直接跳过。' +
              '连着来的几条 TA 消息会合成一句念，不会断断续续；一句念完再念下一句，不会叠在一起。</div>' +
          '</div>' +
          '<div class="rs-sec"><div class="rs-sec-t">用哪家语音</div>' +
            '<div class="rs-modes">' +
              '<button class="rs-mode' + (pv === 'minimax' ? ' on' : '') + '" data-prov="minimax" type="button">MiniMax</button>' +
              '<button class="rs-mode' + (pv === 'fish' ? ' on' : '') + '" data-prov="fish" type="button">Fish Audio</button>' +
            '</div>' +
            '<div class="rs-hint">两家都用自己的 Key，谁便宜 / 谁音色喜欢就用谁；有 Key 才能用（不是本站收钱）。</div>' +
          '</div>' +
          (pv === 'minimax'
            ? '<div class="rs-sec"><div class="rs-sec-t">MiniMax</div>' +
                '<div class="tv-fields">' +
                  field('API Key', KEY.MM_KEY, '填开放平台的 Key', '必填', { pass: true }) +
                  field('GroupId', KEY.MM_GROUP, '老版 Key 才要填', '新版可留空') +
                  field('模型', KEY.MM_MODEL, '如 speech-2.8-turbo', '点下面「拉取模型」可选') +
                  field('接口地址', KEY.MM_HOST, DEFAULT_MM_HOST, '默认 api.minimaxi.com') +
                  field('音色 voice_id', KEY.MM_VOICE, '如 male-qn-qingse', '点下面「拉取音色名单」') +
                '</div>' +
                '<div class="tv-acts">' +
                  '<button class="rs-act tv-btn" data-act="mm-models" type="button">拉取模型</button>' +
                  '<button class="rs-act tv-btn" data-act="mm-voices" type="button">拉取音色名单</button>' +
                  '<button class="rs-act tv-btn tv-primary" data-act="preview" type="button">试听一句</button>' +
                '</div>' +
                '<div class="tv-list" id="tv-mm-model-list" hidden></div>' +
                '<div class="tv-list" id="tv-mm-voice-list" hidden></div>' +
              '</div>'
            : '<div class="rs-sec"><div class="rs-sec-t">Fish Audio</div>' +
                '<div class="tv-fields">' +
                  field('API Key', KEY.FISH_KEY, '填 Fish Audio 的 API Key', '必填', { pass: true }) +
                  field('模型', KEY.FISH_MODEL, '如 speech-1.1', '点下面「拉取模型」可选') +
                  field('音色 ID（reference_id）', KEY.FISH_VOICE, '填任意一个公开 / 自己的音色 ID', '点下面「拉取音色名单」') +
                '</div>' +
                '<div class="tv-acts">' +
                  '<button class="rs-act tv-btn" data-act="fish-models" type="button">拉取模型</button>' +
                  '<button class="rs-act tv-btn" data-act="fish-voices" type="button">拉取音色名单</button>' +
                  '<button class="rs-act tv-btn tv-primary" data-act="preview" type="button">试听一句</button>' +
                '</div>' +
                '<div class="tv-list" id="tv-fish-model-list" hidden></div>' +
                '<div class="tv-list" id="tv-fish-voice-list" hidden></div>' +
              '</div>') +
          '<div class="rs-sec"><div class="rs-sec-t">说话的样子</div>' +
            '<div class="rs-rows">' +
              '<div class="rs-row" data-act="speed"><div class="rs-r-t">语速</div><div class="rs-r-v">' + speedVal().toFixed(2) + '</div></div>' +
              '<div class="rs-row" data-act="auto"><div class="rs-r-t">聊天里自动念 TA 的消息</div><div class="rs-r-v">' + (autoOn() ? '开' : '关') + '</div></div>' +
              '<div class="rs-row" data-act="call"><div class="rs-r-t">通话 / 视频通话里让 TA 说话</div><div class="rs-r-v">' + (callOn() ? '开' : '关') + '</div></div>' +
            '</div>' +
            '<div class="rs-hint">通话里接通会先说一句开场白，之后隔一阵说一句（字幕显示在通话界面下方）。挂断即停。' +
              '声音只在「TA 说话」时出现，不会把你自己的话也念出来。</div>' +
          '</div>' +
          '<div class="rs-sec"><div class="rs-actions"><button class="rs-act tv-stop" type="button">停掉正在念的</button></div></div>';

        // 开关
        const tg = body.querySelector('#tv-en-toggle');
        tg.addEventListener('change', function () {
          s(KEY.EN, tg.checked ? '1' : '0');
          if (!tg.checked) window.taVoiceStop();
          render();
          toast(tg.checked ? 'TA 的声音已开启：聊天里 TA 的话会念出来' : 'TA 的声音已关闭');
        });
        // 后端
        body.querySelectorAll('[data-prov]').forEach(function (b) {
          b.addEventListener('click', function () {
            s(KEY.PROVIDER, b.dataset.prov);
            render();
          });
        });
        // 输入
        body.querySelectorAll('.tv-in').forEach(function (inp) {
          const k = inp.dataset.key;
          const ev = inp.tagName === 'SELECT' ? 'change' : 'blur';
          inp.addEventListener(ev, function () {
            let v = String(inp.value || '').trim();
            if (k === KEY.MM_HOST) v = v.replace(/\/+$/, '');
            s(k, v);
          });
          if (inp.tagName === 'SELECT') {
            inp.addEventListener('change', function () { s(k, inp.value); });
          }
        });
        // 操作
        const speedRow = body.querySelector('[data-act="speed"]');
        if (speedRow) speedRow.addEventListener('click', function () {
          if (!window.openModal) return;
          window.openModal('语速', '', function (v) {
            s(KEY.SPEED, String(Math.max(0.5, Math.min(2, parseInt(v, 10) / 100 || 95))));
            render();
          }, {
            noInput: true,
            slider: { min: 50, max: 200, step: 5, value: Math.round(speedVal() * 100), unit: '%', label: '95% 自然 · 越低越慢' },
            pills: [{ label: '慢', value: '80' }, { label: '正常', value: '95' }, { label: '快', value: '115' }]
          });
        });
        body.querySelector('[data-act="auto"]').addEventListener('click', function () {
          s(KEY.AUTO, autoOn() ? '0' : '1'); render();
          toast(autoOn() ? '聊天里会念 TA 的新消息' : '聊天里不再自动念（通话照样能说）');
        });
        body.querySelector('[data-act="call"]').addEventListener('click', function () {
          s(KEY.CALL, callOn() ? '0' : '1'); render();
          if (!callOn()) { try { queue = queue.filter(q => !q.call); } catch (e) {} }
          toast(callOn() ? '通话里会让 TA 说话' : '通话里 TA 不说话了');
        });
        const pvBtn = body.querySelector('[data-act="preview"]');
        if (pvBtn) pvBtn.addEventListener('click', function () {
          if (!enabled()) { toast('先把上面的总开关打开，再试听'); return; }
          const demo = '嗯，我在这儿呢，你刚才说的是这个意思吗？';
          try { if (audio) { audio.pause(); } } catch (e) {}
          queue = [];
          playing = false;
          // 试听不受「聊天自动念」影响
          Promise.resolve().then(function () {
            // 用同样的入队路径，但不进通话字幕
            enqueue(demo, { call: false });
          });
        });
        const vBtn = body.querySelector('[data-act="mm-voices"]');
        if (vBtn) vBtn.addEventListener('click', function () { pullMMVoices(vBtn); });
        const mBtn = body.querySelector('[data-act="mm-models"]');
        if (mBtn) mBtn.addEventListener('click', function () { pullMMModels(mBtn); });
        const fBtn = body.querySelector('[data-act="fish-voices"]');
        if (fBtn) fBtn.addEventListener('click', function () { pullFishVoices(fBtn); });
        const fMBtn = body.querySelector('[data-act="fish-models"]');
        if (fMBtn) fMBtn.addEventListener('click', function () { pullFishModels(fMBtn); });
        body.querySelector('.tv-stop').addEventListener('click', function () { window.taVoiceStop(); toast('已经停了'); });
      }

      // 拉取模型：问接口要账号能用的模型列表，点一个就用它；拉不到就退回内置推荐
      function modelListHtml(listEl, got, curKey, curVal, emptyHint) {
        listEl.hidden = false;
        listEl.innerHTML = got.map(function (m) {
          return '<button class="tv-voice' + (m.id === curVal ? ' on' : '') + '" type="button" data-id="' + esc(m.id) + '">' +
            '<b>' + esc(m.name || m.id) + '</b><small>' + esc(m.id) + '</small></button>';
        }).join('');
        listEl.querySelectorAll('.tv-voice').forEach(function (b) {
          b.addEventListener('click', function () {
            s(curKey, b.dataset.id);
            // 选完立刻写回上面的输入框，免得看着像没反应
            const inp = document.querySelector('.tv-drawer .tv-in[data-key="' + curKey + '"]');
            if (inp) inp.value = b.dataset.id;
            listEl.querySelectorAll('.tv-voice').forEach(function (x) { x.classList.remove('on'); });
            b.classList.add('on');
            toast('已换模型：' + b.dataset.id);
          });
        });
      }

      async function pullMMModels(btn) {
        const key = String(g(KEY.MM_KEY, '')).trim();
        if (!key) { toast('先填 MiniMax 的 Key'); return; }
        const group = String(g(KEY.MM_GROUP, '')).trim();
        const host = String(g(KEY.MM_HOST, DEFAULT_MM_HOST)).trim().replace(/\/+$/, '');
        const known = MM_HOSTS.find(x => x.host === host);
        const legacy = known ? known.legacy : false;
        const q = legacy && group ? '?GroupId=' + encodeURIComponent(group) : '';
        const listEl = document.getElementById('tv-mm-model-list');
        if (!listEl) return;
        btn.disabled = true; const old = btn.textContent; btn.textContent = '正在拉取…';
        let got = [];
        let why = '';
        try {
          // 新版开放平台有 /v1/models；老版平台没有这个接口
          for (const path of ['/v1/models', '/v1/model/list']) {
            try {
              const res = await fetch(host + path + q, {
                headers: { Authorization: 'Bearer ' + key },
                signal: abortAfter(20000)
              });
              const data = await res.json().catch(function () { return null; });
              if (!res.ok || !data) { why = 'HTTP ' + res.status; continue; }
              const br = data.base_resp || {};
              if (br.status_code !== undefined && br.status_code !== 0) { why = br.status_msg || ('错误码 ' + br.status_code); continue; }
              const arr = data.models || data.data || data.model_list || [];
              (Array.isArray(arr) ? arr : []).forEach(function (it) {
                if (!it) return;
                const id = typeof it === 'string' ? it : (it.model_id || it.model || it.id || it.name);
                if (!id) return;
                if (!got.some(x => x.id === id)) got.push({ id: String(id), name: String(it.model_name || it.name || id) });
              });
              if (got.length) break;
            } catch (e) { why = e && e.message || '连不上'; }
          }
        } finally { btn.disabled = false; btn.textContent = old; }
        // 只认能念字的模型：语音合成那一族
        const isSpeech = function (id) { return /^(minimax[-/\s]?)?(speech|t2a|audio|voice)/i.test(String(id || '')); };
        const speech = got.filter(x => isSpeech(x.id));
        if (speech.length) {
          modelListHtml(listEl, speech, KEY.MM_MODEL, String(g(KEY.MM_MODEL, '')).trim(), '');
          toast('拉到 ' + speech.length + ' 个语音模型，点一个就用它');
          return;
        }
        // 拉不到（老版没这接口 / 网络）：退回内置推荐，照样能点
        modelListHtml(listEl, MM_MODELS.map(function (m) { return { id: m, name: m }; }), KEY.MM_MODEL, String(g(KEY.MM_MODEL, '')).trim(), '');
        toast('没从接口拉到模型' + (why ? '（' + why + '）' : '') + '，先列内置的几个给你选');
      }

      async function pullFishModels(btn) {
        const key = String(g(KEY.FISH_KEY, '')).trim();
        if (!key) { toast('先填 Fish Audio 的 Key'); return; }
        const listEl = document.getElementById('tv-fish-model-list');
        if (!listEl) return;
        btn.disabled = true; const old = btn.textContent; btn.textContent = '正在拉取…';
        let got = [];
        let why = '';
        try {
          const res = await fetch('https://api.fish.audio/model?page_size=100&page_number=1', {
            headers: { Authorization: 'Bearer ' + key },
            signal: abortAfter(25000)
          });
          const data = await res.json().catch(function () { return null; });
          if (!res.ok || !data) why = 'HTTP ' + res.status;
          else {
            const items = Array.isArray(data) ? data : (data.items || data.data || []);
            items.forEach(function (it) {
              if (!it) return;
              const id = it._id || it.id;
              if (!id) return;
              const title = String(it.title || it.name || '');
              // Fish 的音色模型和 TTS 模型混在一起：带 tts / speech / s1 的才是能念字的
              if (!/tts|speech|^s1/i.test(id + ' ' + title)) return;
              if (!got.some(x => x.id === id)) got.push({ id: String(id), name: title || String(id) });
            });
          }
        } catch (e) { why = e && e.message || '连不上'; }
        finally { btn.disabled = false; btn.textContent = old; }
        if (got.length) {
          modelListHtml(listEl, got, KEY.FISH_MODEL, String(g(KEY.FISH_MODEL, 'speech-1.1')).trim(), '');
          toast('拉到 ' + got.length + ' 个模型，点一个就用它');
          return;
        }
        modelListHtml(listEl, FISH_MODELS.map(function (m) { return { id: m, name: m }; }), KEY.FISH_MODEL, String(g(KEY.FISH_MODEL, 'speech-1.1')).trim(), '');
        toast('没从接口拉到模型' + (why ? '（' + why + '）' : '') + '，先列内置的几个给你选');
      }

      async function pullMMVoices(btn) {
        const key = String(g(KEY.MM_KEY, '')).trim();
        if (!key) { toast('先填 MiniMax 的 Key'); return; }
        const group = String(g(KEY.MM_GROUP, '')).trim();
        const host = String(g(KEY.MM_HOST, DEFAULT_MM_HOST)).trim();
        const cand = (function () {
          const h = host.replace(/\/+$/, '');
          const known = MM_HOSTS.find(x => x.host === h);
          return { host: h, legacy: known ? known.legacy : false };
        })();
        btn.disabled = true; const old = btn.textContent; btn.textContent = '正在拉取…';
        let got = [];
        let lastErr = null;
        try {
          for (const ty of ['system', 'voice_cloning']) {
            try {
              const q = cand.legacy && group ? '?GroupId=' + encodeURIComponent(group) : '';
              const res = await fetch(cand.host + '/v1/get_voice' + q, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
                body: JSON.stringify({ voice_type: ty }),
                signal: abortAfter(25000)
              });
              const data = await res.json().catch(function () { return null; });
              if (!data) { lastErr = new Error('HTTP ' + res.status + '：没拿到数据'); continue; }
              const br = data.base_resp || {};
              if (br.status_code !== undefined && br.status_code !== 0) { lastErr = new Error(br.status_msg || ('错误码 ' + br.status_code)); continue; }
              const walk = function (o) {
                if (!o || typeof o !== 'object') return;
                if (Array.isArray(o)) { o.forEach(walk); return; }
                const id = o.voice_id || o.voiceId;
                if (typeof id === 'string' && id.trim() && !got.some(x => x.id === id.trim())) {
                  got.push({ id: id.trim(), name: String(o.voice_name || o.name || id).trim() });
                }
                Object.keys(o).forEach(function (k) { if (o[k] && typeof o[k] === 'object') walk(o[k]); });
              };
              walk(data);
            } catch (e) { lastErr = e; }
          }
        } finally {
          btn.disabled = false; btn.textContent = old;
        }
        const listEl = document.getElementById('tv-mm-voice-list');
        if (!listEl) return;
        if (!got.length) {
          toast(lastErr ? ('没拉到音色：' + (lastErr.message || lastErr)) : '没拉到音色（Key 或 GroupId 不对？）');
          return;
        }
        listEl.hidden = false;
        const cur = String(g(KEY.MM_VOICE, '')).trim();
        listEl.innerHTML = got.slice(0, 200).map(function (v) {
          return '<button class="tv-voice' + (v.id === cur ? ' on' : '') + '" type="button" data-id="' + esc(v.id) + '">' +
            '<b>' + esc(v.name) + '</b><small>' + esc(v.id) + '</small></button>';
        }).join('');
        listEl.querySelectorAll('.tv-voice').forEach(function (b) {
          b.addEventListener('click', function () {
            s(KEY.MM_VOICE, b.dataset.id);
            listEl.querySelectorAll('.tv-voice').forEach(function (x) { x.classList.remove('on'); });
            b.classList.add('on');
            toast('已选音色：' + b.dataset.id);
          });
        });
        toast('拉到 ' + got.length + ' 个音色，点一个就用它');
      }

      async function pullFishVoices(btn) {
        const key = String(g(KEY.FISH_KEY, '')).trim();
        if (!key) { toast('先填 Fish Audio 的 Key'); return; }
        btn.disabled = true; const old = btn.textContent; btn.textContent = '正在拉取…';
        let got = [];
        let lastErr = null;
        try {
          const res = await fetch('https://api.fish.audio/model?page_size=50&page_number=1', {
            headers: { Authorization: 'Bearer ' + key },
            signal: abortAfter(25000)
          });
          const data = await res.json().catch(function () { return null; });
          if (!res.ok || !data) {
            lastErr = new Error('HTTP ' + res.status + (data && data.message ? '：' + data.message : ''));
          } else {
            const items = Array.isArray(data) ? data : (data.items || data.data || []);
            items.forEach(function (it) {
              if (!it) return;
              const id = it._id || it.id;
              if (typeof id !== 'string') return;
              got.push({ id: id, name: String(it.title || it.name || id) });
            });
          }
        } catch (e) { lastErr = e; }
        finally { btn.disabled = false; btn.textContent = old; }
        const listEl = document.getElementById('tv-fish-voice-list');
        if (!listEl) return;
        if (!got.length) {
          toast(lastErr ? ('没拉到音色：' + (lastErr.message || lastErr)) : '没拉到音色（Key 不对？）');
          return;
        }
        listEl.hidden = false;
        const cur = String(g(KEY.FISH_VOICE, '')).trim();
        listEl.innerHTML = got.slice(0, 100).map(function (v) {
          return '<button class="tv-voice' + (v.id === cur ? ' on' : '') + '" type="button" data-id="' + esc(v.id) + '">' +
            '<b>' + esc(v.name) + '</b><small>' + esc(v.id) + '</small></button>';
        }).join('');
        listEl.querySelectorAll('.tv-voice').forEach(function (b) {
          b.addEventListener('click', function () {
            s(KEY.FISH_VOICE, b.dataset.id);
            listEl.querySelectorAll('.tv-voice').forEach(function (x) { x.classList.remove('on'); });
            b.classList.add('on');
            toast('已选音色：' + b.dataset.id);
          });
        });
        toast('拉到 ' + got.length + ' 个音色，点一个就用它');
      }

      // ============================================================
      // 七、启动
      // ============================================================
      function boot() {
        bootChatObs();
        bootCallPoll();
        const row = document.getElementById('cs-ta-voice-row');
        if (row && !row.__tvBound) {
          row.__tvBound = 1;
          row.addEventListener('click', function () {
            if (window.taVoiceOpen) window.taVoiceOpen();
            else toast('语音组件没加载上（缓存过旧或离线），请重新打开页面再试');
          });
        }
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
      else setTimeout(boot, 0);
      // 聊天页 / 通话弹层可能晚到：补几次
      setTimeout(bootChatObs, 600);
      setTimeout(bootChatObs, 2000);
      setTimeout(boot, 800);

      document.addEventListener('contact-switched', function () {
        // 切联系人：停掉正在念的，读新桌面的设置；观察器 / 轮询继续
        try { window.taVoiceStop(); } catch (e) {}
        if (drawer) close();
        setTimeout(boot, 60);
      });

      // 暴露给诊断
      window.taVoiceProvider = provider;

      if (window.__mochiLoaded) window.__mochiLoaded.push('ta-voice.js');
    })();
  } catch (__e) {
    if (window.__mochiErrLoaded) window.__mochiErrLoaded.push('ta-voice.js');
    try { console.error('[JS] ta-voice.js', __e && __e.message || __e); } catch (x) {}
    if (window.__jsErrors) window.__jsErrors.push('[ta-voice.js] ' + String(__e && __e.message || __e));
  }
})();
