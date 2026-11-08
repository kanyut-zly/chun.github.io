/* ============================================================
 * 私人七改：助眠频道（挂在 音乐 页的「助眠」子页里）
 * ------------------------------------------------------------
 * 三路各放各的，互不干扰，音量独立：
 *   1) 白噪音  —— 用 WebAudio 现生成，不占文件；可多选几层叠着放（雨 + 雷 + 火）
 *   2) 读故事  —— 上传 txt，用 TA 的声音（ta-voice.js）念；一章一章念下去
 *   3) 音乐    —— 就用音乐页自己那套播放，这里只调它的音量，不另开一路
 *
 * 停止方式：
 *   · 读完当前章停
 *   · N 分钟后停（10 / 20 / 30 / 45 / 60 / 自己填）
 *   · 读到我睡着（手机静置一段时间没动静就停，省得忘了设）
 *   · 不自动停
 *
 * 数据键：
 *   sl-noise-on / sl-noise-kinds(JSON[]) / sl-noise-vol(0-100)
 *   sl-story-vol(0-100) / sl-music-vol(0-100)
 *   sl-stop-mode('chapter'|'timer'|'sleep'|'none') / sl-stop-min / sl-sleep-min / sl-idle-min
 *   sl-story-lib(JSON[]：{id,title,text,addedAt}) / sl-story-cur(id) / sl-story-pos(id → 章序号)
 * ============================================================ */
(function () {
  'use strict';

  const store = { get(k) { try { const st = window.activeStore && window.activeStore(); return st ? st.get(k) : null; } catch (e) { return null; } }, set(k, v) { try { const st = window.activeStore && window.activeStore(); if (st) st.set(k, v); } catch (e) {} } };
  const g = (k, d) => { const v = store.get(k); return v === null || v === undefined || v === '' ? d : v; };
  const num = (k, d) => { const v = Number(g(k, d)); return isFinite(v) ? v : d; };

  // ---------------- 白噪音的「现生成」 ----------------
  // 全部用 WebAudio 现场合成，不下载、不带文件体积；每种给一组「听着像」的滤波噪声
  const NOISE_KINDS = [
    { id: 'rain', name: '雨声', emoji: '🌧' },
    { id: 'thunder', name: '雷雨', emoji: '⛈' },
    { id: 'fire', name: '炉火', emoji: '🔥' },
    { id: 'wind', name: '风', emoji: '🌬' },
    { id: 'wave', name: '海浪', emoji: '🌊' },
    { id: 'cafe', name: '咖啡厅', emoji: '☕' },
    { id: 'stream', name: '溪水', emoji: '💧' },
    { id: 'pink', name: '粉噪音', emoji: '〰️' },
    { id: 'brown', name: '棕噪音', emoji: '🟤' },
    { id: 'fan', name: '风扇', emoji: '🌀' }
  ];
  const noiseKinds = () => {
    try { const a = JSON.parse(g('sl-noise-kinds', '[]')); return Array.isArray(a) ? a.filter(x => NOISE_KINDS.some(k => k.id === x)) : []; } catch (e) { return []; }
  };
  const noiseOn = () => g('sl-noise-on', '0') === '1';

  let actx = null;
  let noiseMaster = null;
  let noiseNodes = []; // {kind, nodes:[...]}
  let lastThunder = 0;

  function ensureCtx() {
    if (actx) return actx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { actx = new AC(); } catch (e) { actx = null; }
    return actx;
  }
  function makeNoiseBuffer(seconds) {
    const len = Math.floor(actx.sampleRate * seconds);
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      // 棕噪音：积分噪声，低频重，像远处风/水
      b0 = 0.99765 * b0 + w * 0.0990460;
      b1 = 0.96300 * b1 + w * 0.2965164;
      b2 = 0.57000 * b2 + w * 1.0526913;
      last = (b0 + b1 + b2 + w * 0.1848) * 0.18;
      d[i] = Math.max(-1, Math.min(1, last));
    }
    return buf;
  }
  function makePinkBuffer(seconds) {
    const len = Math.floor(actx.sampleRate * seconds);
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    return buf;
  }
  function noiseSource(kind) {
    // 每种噪音的「味」：滤波频段 + 起伏
    const cfg = {
      rain: { type: 'bandpass', f: 2600, q: 0.7, gain: 0.5, pink: true },
      thunder: { type: 'lowpass', f: 900, q: 0.5, gain: 0.5, pink: true, thunder: true },
      fire: { type: 'lowpass', f: 700, q: 0.6, gain: 0.42, brown: true, crackle: true },
      wind: { type: 'bandpass', f: 520, q: 0.35, gain: 0.45, brown: true, sway: true },
      wave: { type: 'lowpass', f: 1100, q: 0.4, gain: 0.48, brown: true, sway: 9 },
      cafe: { type: 'bandpass', f: 1000, q: 0.4, gain: 0.32, pink: true, sway: 3 },
      stream: { type: 'bandpass', f: 3200, q: 0.5, gain: 0.4, pink: true },
      pink: { type: 'none', gain: 0.35, pink: true },
      brown: { type: 'none', gain: 0.42, brown: true },
      fan: { type: 'lowpass', f: 1400, q: 0.8, gain: 0.4, pink: true }
    }[kind] || { gain: 0.4, pink: true };
    const src = actx.createBufferSource();
    src.buffer = cfg.brown ? makeNoiseBuffer(6) : makePinkBuffer(6);
    src.loop = true;
    let node = src;
    if (cfg.type && cfg.type !== 'none') {
      const fl = actx.createBiquadFilter();
      fl.type = cfg.type;
      fl.frequency.value = cfg.f || 1000;
      fl.Q.value = cfg.q || 0.7;
      node.connect(fl);
      node = fl;
    }
    const gn = actx.createGain();
    gn.gain.value = cfg.gain;
    node.connect(gn);
    gn.connect(noiseMaster);
    src.start(0);
    const made = { kind, src, gn, nodes: [src, gn], cfg };
    // 起伏：风/浪/咖啡厅用 LFO 慢慢推音量，听着不死板
    if (cfg.sway) {
      const lfo = actx.createOscillator();
      const lg = actx.createGain();
      lfo.frequency.value = kind === 'wave' ? 0.09 : (kind === 'wind' ? 0.05 : 0.12);
      lg.gain.value = cfg.gain * (kind === 'wave' ? 0.5 : 0.25);
      lfo.connect(lg); lg.connect(gn.gain);
      lfo.start(0);
      made.nodes.push(lfo, lg);
    }
    return made;
  }
  function startNoise() {
    const ctx = ensureCtx();
    if (!ctx) return false;
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    stopNoiseNodesOnly();
    noiseMaster = ctx.createGain();
    noiseMaster.gain.value = num('sl-noise-vol', 45) / 100;
    noiseMaster.connect(ctx.destination);
    noiseKinds().forEach(k => { try { noiseNodes.push(noiseSource(k)); } catch (e) {} });
    startThunderTimer();
    return noiseNodes.length > 0;
  }
  function stopNoiseNodesOnly() {
    stopThunderTimer();
    noiseNodes.forEach(n => { n.nodes.forEach(x => { try { x.stop && x.stop(); } catch (e) {} try { x.disconnect(); } catch (e) {} }); });
    noiseNodes = [];
    if (noiseMaster) { try { noiseMaster.disconnect(); } catch (e) {} noiseMaster = null; }
  }
  function stopNoise() { stopNoiseNodesOnly(); }

  // 雷雨：时不时滚一声闷雷，才有那味儿
  let thunderTimer = null;
  function startThunderTimer() {
    stopThunderTimer();
    if (!noiseNodes.some(n => n.cfg && n.cfg.thunder)) return;
    thunderTimer = setInterval(() => {
      if (!noiseNodes.some(n => n.cfg && n.cfg.thunder)) return;
      const now = Date.now();
      if (now - lastThunder < 12000) return;
      lastThunder = now;
      try { boom(); } catch (e) {}
    }, 4000);
  }
  function stopThunderTimer() { if (thunderTimer) { clearInterval(thunderTimer); thunderTimer = null; } }
  function boom() {
    const ctx = ensureCtx();
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * 3.2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / ctx.sampleRate;
      // 先脆后闷：噪声乘一条慢慢衰减的包络
      const env = Math.exp(-t * 1.1) * (1 - Math.exp(-t * 40));
      d[i] = (Math.random() * 2 - 1) * env;
    }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 420;
    const gn = ctx.createGain(); gn.gain.value = 0.55;
    src.connect(fl); fl.connect(gn); gn.connect(noiseMaster || ctx.destination);
    src.start(0);
  }

  function paintNoiseVol() {
    if (noiseMaster) noiseMaster.gain.value = num('sl-noise-vol', 45) / 100;
  }

  // ---------------- 音乐音量（共用音乐页那一路） ----------------
  function musicEl() {
    try { return (window.__mochiMusic && window.__mochiMusic.el) || null; } catch (e) { return null; }
  }
  function applyMusicVol() {
    const el = musicEl();
    if (el) { try { el.volume = Math.max(0, Math.min(1, num('sl-music-vol', 80) / 100)); } catch (e) {} }
  }
  // 音乐页每次换曲都会新建 Audio，音量要重新压上去
  setInterval(applyMusicVol, 2000);

  // ---------------- 故事：txt → 章节 ----------------
  function storyLib() {
    try { const a = JSON.parse(g('sl-story-lib', '[]')); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  function saveStoryLib(a) { store.set('sl-story-lib', JSON.stringify(a)); }
  function curStory() {
    const id = g('sl-story-cur', '');
    return storyLib().find(s => s.id === id) || null;
  }
  // 分章规则：优先按「第X章 / 第X节 / Chapter N」，没找到就按长度切
  function splitChapters(text) {
    const t = String(text || '').replace(/\r\n?/g, '\n').trim();
    if (!t) return [];
    const re = /^(?:\s*)(第[一二三四五六七八九十百零〇两\d]+[章节回卷]|Chapter\s*\d+|CHAPTER\s*\d+)(.*)$/gm;
    const marks = [];
    let m;
    while ((m = re.exec(t)) !== null) marks.push(m.index);
    if (marks.length >= 2) {
      const out = [];
      for (let i = 0; i < marks.length; i++) {
        const seg = t.slice(marks[i], i + 1 < marks.length ? marks[i + 1] : t.length).trim();
        if (seg) out.push(seg);
      }
      return out;
    }
    // 没有章节标记：按 1200 字左右切，尽量断在句号后
    const N = 1200;
    if (t.length <= N * 1.4) return [t];
    const out = [];
    let p = 0;
    while (p < t.length) {
      let end = Math.min(t.length, p + N);
      if (end < t.length) {
        const cut = t.lastIndexOf('。', end);
        if (cut > p + N * 0.5) end = cut + 1;
      }
      out.push(t.slice(p, end).trim());
      p = end;
    }
    return out.filter(Boolean);
  }
  // 章节里再切「段」，一次合成一段，避免单次 TTS 太长
  function splitParts(ch) {
    const t = String(ch || '').trim();
    if (!t) return [];
    const paras = t.split(/\n+/).map(s => s.trim()).filter(Boolean);
    const out = [];
    let cur = '';
    paras.forEach(p => {
      if ((cur + p).length > 220 && cur) { out.push(cur); cur = p; }
      else cur += (cur ? '\n' : '') + p;
    });
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  let speakToken = 0;
  let speaking = false;
  let curChapterIdx = 0;
  let curParts = [];
  let curPartIdx = 0;
  let storyEl = null;
  let stopTimer = null;
  let idleTimer = null;
  let lastActivity = Date.now();

  function storyVol() { return Math.max(0, Math.min(1, num('sl-story-vol', 100) / 100)); }

  function stopStory(why) {
    speakToken++;
    speaking = false;
    if (storyEl) { try { storyEl.onended = null; storyEl.pause(); storyEl.src = ''; } catch (e) {} storyEl = null; }
    clearStopTimer();
    armIdle(false);
    paintPlaying();
    if (why) toast('读故事已停：' + why);
  }
  function clearStopTimer() { if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; } }

  async function speakPart(text) {
    if (!window.taVoiceSynth) throw new Error('语音还没接好（先去 设置 → 语音 填 Key）');
    const url = await window.taVoiceSynth(text);
    return url;
  }

  async function playChapter(idx) {
    const s = curStory();
    if (!s) return;
    const chs = splitChapters(s.text);
    if (!chs.length) { toast('这本书里没读到字'); return; }
    if (idx >= chs.length) { stopStory('整本都念完了'); toast('整本书念完了，辛苦你了'); return; }
    curChapterIdx = idx;
    store.set('sl-story-pos', String(idx));
    curParts = splitParts(chs[idx]);
    curPartIdx = 0;
    speaking = true;
    paintPlaying();
    const myToken = ++speakToken;
    const go = async () => {
      while (curPartIdx < curParts.length) {
        if (myToken !== speakToken) return;
        const part = curParts[curPartIdx];
        let url = null;
        paintStoryLine('正在念：' + part.slice(0, 40) + (part.length > 40 ? '…' : ''));
        try { url = await speakPart(part); } catch (e) {
          if (myToken !== speakToken) return;
          speaking = false; paintPlaying();
          toast('这一句没念出来：' + (e && e.message || '合成失败'));
          return;
        }
        if (myToken !== speakToken) return;
        await new Promise((resolve) => {
          const a = new Audio(url);
          storyEl = a;
          a.volume = storyVol();
          a.onended = () => resolve();
          a.onerror = () => resolve();
          a.play().catch(() => resolve());
        });
        if (myToken !== speakToken) return;
        curPartIdx++;
        touch();
      }
      // 一章念完
      if (myToken !== speakToken) return;
      storyEl = null;
      const mode = g('sl-stop-mode', 'none');
      if (mode === 'chapter') { stopStory('这一章读完了'); return; }
      await new Promise(r => setTimeout(r, 900));
      if (myToken !== speakToken) return;
      playChapter(idx + 1);
    };
    go();
  }

  function touch() { lastActivity = Date.now(); armIdle(true); }
  function armIdle(silent) {
    // 读到我睡着：静置一段时间没动静就停（手机触摸/按键算动静）
    if (idleTimer) { clearInterval(idleTimer); idleTimer = null; }
    const mode = g('sl-stop-mode', 'none');
    if (mode !== 'sleep') return;
    if (!silent) return;
    const lim = Math.max(1, num('sl-idle-min', 8)) * 60000;
    idleTimer = setInterval(() => {
      if (!speaking) { clearInterval(idleTimer); idleTimer = null; return; }
      if (Date.now() - lastActivity >= lim) {
        stopStory('好久没动静了，当你睡着啦');
        if (noiseOn()) toggleNoise(false);
        try { const el = musicEl(); if (el && !el.paused) el.pause(); } catch (e) {}
      }
    }, 20000);
  }

  function startStopTimerIfNeeded() {
    clearStopTimer();
    if (g('sl-stop-mode', 'none') !== 'timer') return;
    const min = Math.max(1, num('sl-stop-min', 30));
    const at = Date.now() + min * 60000;
    stopTimer = setInterval(() => {
      if (Date.now() < at) return;
      clearStopTimer();
      if (speaking) stopStory(min + ' 分钟到了'); else toast(min + ' 分钟到了');
      // 时间一到三路都收：白噪音停、音乐停，留个安静
      if (noiseOn()) toggleNoise(false);
      try { const el = musicEl(); if (el && !el.paused) el.pause(); } catch (e) {}
    }, 5000);
  }

  // ---------------- 界面 ----------------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function toast(msg) {
    let t = document.getElementById('sl-toast');
    if (!t) { t = document.createElement('div'); t.id = 'sl-toast'; t.className = 'sl-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._tm);
    t._tm = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function volRow(label, key, def, hint) {
    const v = num(key, def);
    return '<div class="sl-row">' +
      '<span class="sl-row-t">' + label + '</span>' +
      '<input class="sl-range" type="range" min="0" max="100" step="1" value="' + v + '" data-vkey="' + key + '">' +
      '<b class="sl-vnum" data-vnum="' + key + '">' + v + '%</b>' +
      (hint ? '<i class="sl-hint">' + hint + '</i>' : '') +
      '</div>';
  }

  function panelHtml() {
    const kinds = noiseKinds();
    const mode = g('sl-stop-mode', 'none');
    const story = curStory();
    const chs = story ? splitChapters(story.text) : [];
    const pos = Number(g('sl-story-pos', '0')) || 0;
    const lib = storyLib();
    return '' +
      '<div class="sl-wrap">' +
      // 白噪音
      '<div class="sl-card glass">' +
      '<div class="sl-head"><span class="sl-t">白噪音</span>' +
      '<button class="sl-play' + (noiseOn() ? ' on' : '') + '" id="sl-noise-btn" type="button">' + (noiseOn() ? '停' : '放') + '</button></div>' +
      '<div class="sl-kinds">' + NOISE_KINDS.map(k => '<button class="sl-kind' + (kinds.includes(k.id) ? ' sel' : '') + '" data-kind="' + k.id + '" type="button">' + k.emoji + ' ' + k.name + '</button>').join('') + '</div>' +
      volRow('音量', 'sl-noise-vol', 45) +
      '<div class="sl-note">可以同时选几种叠着放（比如雨 + 炉火）。这些声音是手机现算出来的，不占空间。</div>' +
      '</div>' +
      // 读故事
      '<div class="sl-card glass">' +
      '<div class="sl-head"><span class="sl-t">读故事</span>' +
      '<button class="sl-mini" id="sl-story-upload" type="button">上传 txt</button></div>' +
      (lib.length
        ? '<div class="sl-story-pick"><select class="sl-sel" id="sl-story-sel">' + lib.map(s => '<option value="' + esc(s.id) + '"' + (story && story.id === s.id ? ' selected' : '') + '>' + esc(s.title) + '</option>').join('') + '</select><button class="sl-mini sl-del" id="sl-story-del" type="button">删</button></div>'
        : '<div class="sl-note">还没有故事。上传一个 txt 就行，TA 用他在设置里配的那个声音念。</div>') +
      (story
        ? '<div class="sl-chap"><div class="sl-chap-info">共 ' + chs.length + ' 章' + (chs.length ? '，停在第 ' + (Math.min(pos, chs.length - 1) + 1) + ' 章' : '') + '</div>' +
          '<div class="sl-chap-acts">' +
          '<button class="sl-mini" id="sl-ch-prev" type="button">上一章</button>' +
          '<button class="sl-play' + (speaking ? ' on' : '') + '" id="sl-story-btn" type="button">' + (speaking ? '停' : '念') + '</button>' +
          '<button class="sl-mini" id="sl-ch-next" type="button">下一章</button>' +
          '</div></div>' +
          '<div class="sl-story-line" id="sl-story-line"></div>'
        : '') +
      volRow('音量', 'sl-story-vol', 100) +
      '<div class="sl-note">一章念完会自动接下一章；下次回来从上次停的那章接着念。</div>' +
      '</div>' +
      // 什么时候停
      '<div class="sl-card glass">' +
      '<div class="sl-t" style="margin-bottom:8px">什么时候停</div>' +
      '<div class="sl-stop">' +
      [['none', '不自动停'], ['chapter', '读完这章停'], ['timer', '过一阵停'], ['sleep', '读到我睡着']].map(x =>
        '<button class="sl-stop-b' + (mode === x[0] ? ' sel' : '') + '" data-stop="' + x[0] + '" type="button">' + x[1] + '</button>').join('') +
      '</div>' +
      (mode === 'timer' ? '<div class="sl-row"><span class="sl-row-t">停的时间</span><input class="sl-num" id="sl-stop-min" type="number" min="1" max="240" value="' + num('sl-stop-min', 30) + '"><span class="sl-unit">分钟后</span></div>' : '') +
      (mode === 'sleep' ? '<div class="sl-row"><span class="sl-row-t">静置多久算睡着</span><input class="sl-num" id="sl-idle-min" type="number" min="1" max="120" value="' + num('sl-idle-min', 8) + '"><span class="sl-unit">分钟没动静</span></div>' : '') +
      '<div class="sl-note">「读到我睡着」不用你记着设：手不动、屏不碰满这么久，就当你睡了，自己慢慢停下来。</div>' +
      '</div>' +
      // 音乐
      '<div class="sl-card glass">' +
      '<div class="sl-head"><span class="sl-t">听点音乐</span><button class="sl-mini" id="sl-go-music" type="button">去音乐页</button></div>' +
      volRow('音乐音量', 'sl-music-vol', 80) +
      '<div class="sl-note">音乐和上面两路是分开的：这里放白噪音、念故事，音乐 App 照常能后台放歌，三路一起响互不打断。在这里拉小的是音乐那一路的音量。</div>' +
      '</div>' +
      '</div>';
  }

  function paintPlaying() {
    const b = document.getElementById('sl-story-btn');
    if (b) { b.textContent = speaking ? '停' : '念'; b.classList.toggle('on', speaking); }
  }
  function paintStoryLine(txt) { const e = document.getElementById('sl-story-line'); if (e) e.textContent = txt || ''; }

  function renderPanel() {
    const host = document.getElementById('sl-panel');
    if (!host) return;
    host.innerHTML = panelHtml();
    bindPanel(host);
  }

  function bindPanel(host) {
    // 音量条
    host.querySelectorAll('.sl-range').forEach(inp => {
      inp.addEventListener('input', () => {
        const k = inp.dataset.vkey;
        store.set(k, String(inp.value));
        const n = host.querySelector('[data-vnum="' + k + '"]');
        if (n) n.textContent = inp.value + '%';
        if (k === 'sl-noise-vol') paintNoiseVol();
        if (k === 'sl-story-vol' && storyEl) { try { storyEl.volume = storyVol(); } catch (e) {} }
        if (k === 'sl-music-vol') applyMusicVol();
      });
    });
    // 白噪音种类
    host.querySelectorAll('.sl-kind').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.dataset.kind;
        const cur = noiseKinds();
        const i = cur.indexOf(id);
        if (i >= 0) cur.splice(i, 1); else cur.push(id);
        store.set('sl-noise-kinds', JSON.stringify(cur));
        b.classList.toggle('sel');
        if (noiseOn()) { startNoise(); }
        if (!cur.length && noiseOn()) toggleNoise(false);
      });
    });
    // 白噪音开关
    const nb = host.querySelector('#sl-noise-btn');
    if (nb) nb.addEventListener('click', () => {
      if (!noiseKinds().length) { store.set('sl-noise-kinds', JSON.stringify(['rain'])); }
      toggleNoise(!noiseOn());
    });
    // 故事：上传
    const up = host.querySelector('#sl-story-upload');
    if (up) up.addEventListener('click', pickStoryFile);
    const sel = host.querySelector('#sl-story-sel');
    if (sel) sel.addEventListener('change', () => {
      stopStory();
      store.set('sl-story-cur', sel.value);
      store.set('sl-story-pos', '0');
      renderPanel();
    });
    const del = host.querySelector('#sl-story-del');
    if (del && window.openModal) del.addEventListener('click', () => {
      const s = curStory();
      if (!s) return;
      window.openModal('删掉这本书？', '', (v) => {
        if (v !== 'ok') return;
        stopStory();
        const lib = storyLib().filter(x => x.id !== s.id);
        saveStoryLib(lib);
        store.set('sl-story-cur', lib[0] ? lib[0].id : '');
        store.set('sl-story-pos', '0');
        renderPanel();
        toast('删掉了');
      }, { noInput: true, staticText: '「' + s.title + '」', pills: [{ label: '删掉', value: 'ok' }] });
    });
    // 念 / 停
    const sb = host.querySelector('#sl-story-btn');
    if (sb) sb.addEventListener('click', () => {
      if (speaking) { stopStory('你自己喊停的'); return; }
      touch();
      startStopTimerIfNeeded();
      playChapter(Number(g('sl-story-pos', '0')) || 0);
    });
    const prev = host.querySelector('#sl-ch-prev');
    if (prev) prev.addEventListener('click', () => { touch(); playChapter(Math.max(0, curChapterIdx - 1)); });
    const next = host.querySelector('#sl-ch-next');
    if (next) next.addEventListener('click', () => { touch(); playChapter(curChapterIdx + 1); });
    // 停止方式
    host.querySelectorAll('.sl-stop-b').forEach(b => {
      b.addEventListener('click', () => {
        store.set('sl-stop-mode', b.dataset.stop);
        renderPanel();
      });
    });
    const tm = host.querySelector('#sl-stop-min');
    if (tm) tm.addEventListener('change', () => { store.set('sl-stop-min', String(Math.max(1, Math.min(240, Number(tm.value) || 30)))); });
    const im = host.querySelector('#sl-idle-min');
    if (im) im.addEventListener('change', () => { store.set('sl-idle-min', String(Math.max(1, Math.min(120, Number(im.value) || 8)))); touch(); });
    const gm = host.querySelector('#sl-go-music');
    if (gm) gm.addEventListener('click', () => {
      const app = document.querySelector('.app[data-app="music"]');
      if (app) app.click();
    });
  }

  function toggleNoise(on) {
    store.set('sl-noise-on', on ? '1' : '0');
    if (on) {
      const ok = startNoise();
      if (!ok) { store.set('sl-noise-on', '0'); toast('这个浏览器放不了白噪音'); }
    } else stopNoise();
    const b = document.getElementById('sl-noise-btn');
    if (b) { b.textContent = on ? '停' : '放'; b.classList.toggle('on', on); }
  }

  // 读故事上次没念完：进页时把状态补回来
  function restoreState() {
    const s = curStory();
    if (s) curChapterIdx = Number(g('sl-story-pos', '0')) || 0;
    if (noiseOn() && noiseKinds().length) { store.set('sl-noise-on', '0'); }
  }

  function pickStoryFile() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.txt,text/plain';
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        const text = String(rd.result || '');
        if (!text.trim()) { toast('这个文件里没读到字'); return; }
        const title = f.name.replace(/\.[^.]+$/, '');
        const lib = storyLib();
        const id = 'sl' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        lib.unshift({ id, title, text, addedAt: Date.now() });
        saveStoryLib(lib);
        store.set('sl-story-cur', id);
        store.set('sl-story-pos', '0');
        renderPanel();
        toast('加好了：' + title + '（' + splitChapters(text).length + ' 章）');
      };
      rd.onerror = () => toast('这个文件读不了，换一个 txt 试试');
      rd.readAsText(f, 'UTF-8');
    });
    inp.click();
  }

  // ---------------- 挂进独立页面 #page-sleep ----------------
  function mount() {
    const page = document.getElementById('page-sleep');
    if (!page) return;
    const host = document.getElementById('sl-panel');
    if (!host) return;
    if (!host.dataset.ready) { host.dataset.ready = '1'; }
    renderPanel();
  }

  function ensureMounted() {
    const page = document.getElementById('page-sleep');
    if (!page || page.hidden) return;
    mount();
  }
  const bootObserver = function () {
    const page = document.getElementById('page-sleep');
    if (!page) { setTimeout(bootObserver, 300); return; }
    new MutationObserver(ensureMounted).observe(page, { attributes: true, attributeFilter: ['hidden'] });
    ensureMounted();
  };
  bootObserver();
  // 返回桌面
  const backBtn = document.getElementById('sleep-back');
  if (backBtn) backBtn.addEventListener('click', () => {
    document.querySelectorAll('.page').forEach(p => { p.hidden = true; });
    const home = document.getElementById('page-phone');
    if (home) home.hidden = false;
  });
  // 桌面图标点进助眠页（照音乐页那套写法：每个 App 自己接管点击）
  const sleepApp = document.querySelector('.app[data-app="sleep"]');
  const sleepPageEl = document.getElementById('page-sleep');
  if (sleepApp && sleepPageEl) {
    sleepApp.addEventListener('click', () => {
      const editing = Array.from(document.querySelectorAll('.app-grid')).some(g => g.classList.contains('editing'));
      if (editing) return;
      document.querySelectorAll('.page').forEach(p => { p.hidden = true; });
      sleepPageEl.hidden = false;
      mount();
    });
  }
  // 桌面图标点进助眠页（tabs.js 管 .app → .page，这里只补数据回填）
  document.addEventListener('click', (e) => {
    if (e.target.closest('.app[data-app="sleep"]')) setTimeout(ensureMounted, 80);
  }, true);

  // 任何触摸/按键都算「还有动静」，给「读到我睡着」用
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, () => { lastActivity = Date.now(); }, { passive: true }));

  window.sleepChannel = {
    mount, toggleNoise, startNoise, stopNoise,
    speakStory: (chapterIdx) => playChapter(chapterIdx || 0),
    stopStory,
    splitChapters,
    state: () => ({ noiseOn: noiseOn(), kinds: noiseKinds(), speaking, chapter: curChapterIdx, mode: g('sl-stop-mode', 'none') })
  };
})();
