/*!
 * github-sync.js —— 私人五改：GitHub 仓库云备份（设置 → 数据管理 → 云备份）
 *
 * 做什么：
 *   - 把本机全部数据（和「导出数据 · 完整备份」同一口径）打包成 JSON，上传到你自己的 GitHub 仓库
 *   - 随时从仓库拉回来覆盖本机（会先弹窗确认，与「导入数据」共用同一套恢复流程）
 *
 * 为什么走 Git Data API 而不是 Contents API：
 *   本机数据带图片/语音常常十几 MB，Contents API 单文件 ≤ 50MB 且要 base64 塞进一次 PUT；
 *   走 blobs → tree → commit → ref 可以分块上传、单文件上限 100MB，浏览器端分片转码也不会一次性爆内存。
 *
 * 配置（本机 localStorage 键 xy-home-v2:gh-sync-cfg，只在你这台设备上）：
 *   owner/repo · branch · dir · token(PAT，需 Contents: Read and write) · 自动备份开关
 *
 * 接口：window.mochiGitHubSync = {
 *   cfg / saveCfg / clearCfg / fullCfg / hasToken
 *   test() · backup(opts) · list() · restore(sha, onProgress) · openPanel()
 * }
 */
(function () {
  'use strict';
  /* 注意：本项目的本机存储统一带 xy-home-v2: 前缀，键名必须一致才读得到 */
  const CFG_KEY = 'xy-home-v2:gh-sync-cfg';
  /* 私钥类配置独立成键：不进备份/上传，避免自己的 Token 被传到仓库里 */
  const SECRET_KEY = 'xy-home-v2:gh-sync-token';
  const API = 'https://api.github.com';
  const LABEL = 'mochi-zika-cloud';
  const FILE_PREFIX = 'mochi-backup-';
  const LS_SMALL_LIMIT = 20 * 1024;
  const SNAPSHOT_KEY = 'xy-home-v2:__auto-backup-snapshot';
  const IMPORT_LOG_KEY = 'xy-home-v2:__import-log';
  const MUSIC_KEY_RE = /:music-file:/;
  const MEDIA_POOL_KEY_RE = /^xy-home-v2:media:[0-9a-f]{32}$/;
  const CHAT_KEY_RE = /(?:^|:)(?:chat-msgs|chat-blk-idx|chat-blk-[0-9]+)$/;
  const GROUP_CHAT_KEY_RE = /^xy-home-v2:(?:group-chat-msgs|gc-msgs-.+)$/;
  const MEDIA_TOKEN_RE = /@@m:([0-9a-f]{32})/g;
  const AUTO_CHECK_MS = 30 * 60 * 1000;
  const AUTO_MIN_GAP = 6 * 60 * 60 * 1000;

  function toast(t) { try { if (window.toast) window.toast(t); } catch (e) {} }
  function modal(t, text, opts) {
    opts = opts || {};
    try {
      if (window.openModal) {
        window.openModal(t, '', function () {}, Object.assign({ noInput: true, okText: '知道了', big: true, staticText: text }, opts));
        return;
      }
    } catch (e) {}
    try { alert(t + '\n' + text); } catch (e2) {}
  }
  function ls(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch (e) {}
    return null;
  }
  function fmtSize(n) {
    if (!n) return '0 KB';
    if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
    if (n >= 1024) return (n / 1024).toFixed(1) + ' KB';
    return n + ' B';
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function localStamp(d) {
    d = d || new Date();
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes());
  }
  function parseRepo(v) {
    const s = String(v == null ? '' : v).trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\s+/g, '');
    const parts = s.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1] };
  }
  function cfg() {
    let o = null;
    try { o = JSON.parse(ls(CFG_KEY) || 'null'); } catch (e) {}
    o = (o && typeof o === 'object') ? o : {};
    const p = parseRepo(o.repo);
    return {
      owner: p ? p.owner : '',
      repo: p ? p.repo : '',
      branch: String(o.branch || 'main').trim() || 'main',
      dir: String(o.dir || 'mochi-backup/').replace(/^\/+/, '').replace(/\/+$/, '') + '/',
      token: String(ls(SECRET_KEY) || o.token || ''),
      auto: o.auto === true,
      range: (o.range === 'no-music' || o.range === 'text') ? o.range : 'full',
      lastAt: Number(o.lastAt) || 0,
      lastSha: String(o.lastSha || '')
    };
  }
  function saveCfg(patch) {
    const cur = cfg();
    const next = Object.assign({}, cur, patch || {});
    try {
      ls(SECRET_KEY, next.token || null);
      localStorage.setItem(CFG_KEY, JSON.stringify({
        repo: (next.owner || '') && (next.repo || '') ? next.owner + '/' + next.repo : '',
        branch: next.branch,
        dir: next.dir,
        auto: next.auto,
        range: next.range || cur.range || 'full',
        lastAt: next.lastAt,
        lastSha: next.lastSha
      }));
    } catch (e) {}
    return cfg();
  }
  function clearCfg() { ls(CFG_KEY, null); ls(SECRET_KEY, null); }
  function fullCfg() { return cfg().owner && cfg().repo; }
  function ready() { const c = cfg(); return !!(c.owner && c.repo && c.token); }
  function pathOf(c, name) { return (c.dir || '') + name; }

  /* ===== 存储遍历（与 data-backup 导出同一口径：先 IDB 权威，再 localStorage 兜底） ===== */
  function isChatKey(k) { return CHAT_KEY_RE.test(k) || GROUP_CHAT_KEY_RE.test(k); }
  function isAuthKey(k) { return /:chat-msgs$/.test(k) || /:chat-blk-(?:idx|[0-9]+)$/.test(k) || GROUP_CHAT_KEY_RE.test(k) || /:feed-posts$/.test(k); }
  function collectMediaHashes(v, out) {
    if (typeof v !== 'string') return;
    if (v.indexOf('@@m:') < 0) return;
    MEDIA_TOKEN_RE.lastIndex = 0;
    let m;
    while ((m = MEDIA_TOKEN_RE.exec(v))) out.add(m[1]);
  }
  function blobToBase64(blob) {
    return new Promise(function (res) {
      try {
        const r = new FileReader();
        r.onload = function () { res(String(r.result || '')); };
        r.onerror = function () { res(''); };
        r.readAsDataURL(blob);
      } catch (e) { res(''); }
    });
  }
  /* range: 'full' | 'no-music' | 'text'
     返回 Promise<{ payload, small, meta }>，payload 为可 JSON.stringify 的对象 */
  async function collectAll(range, onProgress) {
    range = range || 'full';
    const skipMedia = range === 'text';
    const skipMusic = range !== 'full';
    const small = {};
    const big = {};
    const mediaRefs = new Set();
    const missing = [];
    const lsBig = {};
    let total = 0, done = 0;
    const tick = function (label) { if (onProgress) { try { onProgress(done, total, label || ''); } catch (e) {} } };

    /* 1) localStorage 小键 + 记下大键 */
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || k.indexOf('xy-home-v2:') !== 0) continue;
        if (k === SNAPSHOT_KEY || k === IMPORT_LOG_KEY || k === CFG_KEY) continue;
        if (skipMusic && MUSIC_KEY_RE.test(k)) continue;
        if (skipMedia && MEDIA_POOL_KEY_RE.test(k)) continue;
        const v = localStorage.getItem(k) || '';
        if (v.length > LS_SMALL_LIMIT || MEDIA_POOL_KEY_RE.test(k)) { lsBig[k] = 1; continue; }
        small[k] = v;
      }
    } catch (e) {}

    /* 2) IDB 清单 */
    tick('读取存储清单');
    let keys = [];
    try { keys = (await window.idbListKeys()) || []; } catch (e) { keys = []; }
    const idbKeys = keys.filter(function (k) {
      const s = String(k || '');
      if (s.indexOf('xy-home-v2:') !== 0) return false;
      if (s === SNAPSHOT_KEY || s === IMPORT_LOG_KEY || s === CFG_KEY) return false;
      if (skipMusic && MUSIC_KEY_RE.test(s)) return false;
      if (skipMedia && MEDIA_POOL_KEY_RE.test(s)) return false;
      return true;
    });
    const realBig = Object.keys(lsBig);
    total = idbKeys.length + realBig.length + 1;
    tick('准备中');

    /* 3) 逐个读（大键值过大时只保留 IDB 权威值） */
    for (let i = 0; i < idbKeys.length; i++) {
      const k = idbKeys[i];
      if (k in small && !isAuthKey(k)) continue;
      let v;
      try { v = await window.idbGet(k); } catch (e) { v = null; }
      if (v === undefined || v === null) {
        try { const lv = localStorage.getItem(k); if (lv !== null) v = lv; } catch (e) {}
      }
      done++;
      if (v === undefined || v === null) { missing.push(k); tick(k); continue; }
      if (typeof Blob !== 'undefined' && v instanceof Blob) {
        const b64 = await blobToBase64(v);
        if (!b64) { missing.push(k); tick(k); continue; }
        v = b64;
      }
      if (typeof v !== 'string') { try { v = JSON.stringify(v); } catch (e) { missing.push(k); tick(k); continue; } }
      if (v.length <= LS_SMALL_LIMIT && !MEDIA_POOL_KEY_RE.test(k) && !isAuthKey(k) && !(k in small)) {
        small[k] = v;
      } else {
        big[k] = v;
        collectMediaHashes(v, mediaRefs);
      }
      tick(k);
    }
    for (let i = 0; i < realBig.length; i++) {
      const k = realBig[i];
      done++;
      if (k in big) { tick(k); continue; }
      let v = null;
      try { v = await window.idbGet(k); } catch (e) {}
      if (v === undefined || v === null) { try { v = localStorage.getItem(k); } catch (e) {} }
      if (v === undefined || v === null) { missing.push(k); tick(k); continue; }
      if (typeof Blob !== 'undefined' && v instanceof Blob) v = await blobToBase64(v);
      if (typeof v !== 'string') { try { v = JSON.stringify(v); } catch (e) { missing.push(k); tick(k); continue; } }
      big[k] = v;
      collectMediaHashes(v, mediaRefs);
      tick(k);
    }
    /* 4) 聊天引用的媒体池条目（完整备份时通常已经在 big 里） */
    {
      const list = Array.from(mediaRefs);
      for (let i = 0; i < list.length; i++) {
        const k = 'xy-home-v2:media:' + list[i];
        if (k in big) continue;
        if (k in small) { big[k] = small[k]; delete small[k]; continue; }
        let v = null;
        try { v = await window.idbGet(k); } catch (e) {}
        if (v === undefined || v === null) continue;
        if (typeof Blob !== 'undefined' && v instanceof Blob) v = await blobToBase64(v);
        if (typeof v === 'string') big[k] = v;
      }
    }
    done++;
    tick('打包');

    const payload = {
      version: '1.0',
      app: LABEL,
      exportTime: new Date().toISOString(),
      range: range,
      idb: big,
      ls: small
    };
    if (missing.length) payload.missing = missing.slice(0, 500);
    return { payload: payload, small: small, missing: missing, range: range };
  }

  /* ===== GitHub REST ===== */
  async function gh(c, path, opt) {
    opt = opt || {};
    const url = API + '/repos/' + c.owner + '/' + c.repo + path;
    const headers = Object.assign({
      'Authorization': 'Bearer ' + c.token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }, opt.headers || {});
    let body;
    if (opt.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opt.json);
    }
    const res = await fetch(url, { method: opt.method || 'GET', headers: headers, body: body, cache: 'no-store' });
    let data = null;
    const txt = await res.text();
    try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = { raw: txt.slice(0, 300) }; }
    if (!res.ok) {
      const msg = (data && (data.message || data.raw)) || ('HTTP ' + res.status);
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }
  function ghMsg(e) {
    if (!e) return '未知错误';
    if (e.status === 401) return 'Token 不对或已过期（401）：重新生成一个有 Contents 读写权限的 Token';
    if (e.status === 403) return '没有权限或被限流（403）：确认 Token 对该仓库有 Contents 读写权限';
    if (e.status === 404) return '找不到仓库或分支（404）：检查「用户名/仓库名」、分支名，以及 Token 是否有该仓库的权限';
    if (e.status === 409) return '仓库内容刚变过（409）：再点一次就好';
    if (e.status === 422) return '提交被拒绝（422）：分支名或路径可能不合法';
    if (e.status >= 500) return 'GitHub 那边暂时出错（' + e.status + '），过会儿再试';
    return (e.message || '未知错误') + (e.status ? '（' + e.status + '）' : '');
  }

  /* ===== 测试连接 ===== */
  async function test(c0) {
    const c = c0 || cfg();
    if (!c.owner || !c.repo) throw new Error('先填「用户名/仓库名」');
    if (!c.token) throw new Error('先填 Token');
    const repo = await gh(c, '');
    if (repo && repo.full_name && repo.full_name.toLowerCase() !== (c.owner + '/' + c.repo).toLowerCase()) {
      /* 301 跳转时 GitHub 会返回真实全名，提示一下但不阻断 */
    }
    if (repo && (repo.permissions && repo.permissions.push === false)) {
      throw new Error('这个 Token 对仓库「' + repo.full_name + '」只有读权限，需要 Contents: Read and write');
    }
    const ref = await gh(c, '/git/ref/heads/' + encodeURIComponent(c.branch));
    return { repo: repo && repo.full_name, branch: c.branch, commit: ref && ref.object && ref.object.sha };
  }

  /* ===== 备份（上传） ===== */
  async function backup(opts) {
    opts = opts || {};
    const c = cfg();
    if (!c.owner || !c.repo) throw new Error('还没有设置仓库');
    if (!c.token) throw new Error('还没有填 Token');
    const range = opts.range || 'full';
    if (opts.progress) opts.progress(0, 0, '读取本机数据');
    const got = await collectAll(range, function (d, t, label) {
      if (opts.progress) {
        const p = t ? Math.round(d / t * 55) : 0;
        opts.progress(p, 0, label ? ('读取 ' + label.replace('xy-home-v2:', '').slice(0, 22)) : ('读取第 ' + d + ' 项'));
      }
    });
    const json = JSON.stringify(got.payload);
    const bytes = new Blob([json]).size;
    if (opts.progress) opts.progress(58, 0, '上传到 GitHub（' + fmtSize(bytes) + '）');

    /* 1) blob（GitHub 会压缩，base64 体积约为 1.33 倍，上限 100MB 原始） */
    let blobSha;
    try {
      const b = await gh(c, '/git/blobs', { method: 'POST', json: { content: json, encoding: 'utf-8' } });
      blobSha = b && b.sha;
    } catch (e) {
      if (bytes > 90 * 1024 * 1024) throw new Error('这份备份约 ' + fmtSize(bytes) + '，超过 GitHub 单个文件上限。请在下面的「备份范围」里选「不含音乐文件」或「只备份文字」再传');
      throw e;
    }
    if (!blobSha) throw new Error('上传内容失败：GitHub 没有返回 sha');
    if (opts.progress) opts.progress(76, 0, '写入提交');

    /* 2) 当前分支头 */
    let headSha = '';
    try {
      const ref = await gh(c, '/git/ref/heads/' + encodeURIComponent(c.branch));
      headSha = (ref && ref.object && ref.object.sha) || '';
    } catch (e) {
      if (e.status !== 404) throw e;
      headSha = '';
    }
    if (!headSha) {
      /* 分支不存在：要求仓库至少有一个提交（用户在 GitHub 上 Initialize 过） */
      throw new Error('分支「' + c.branch + '」不存在。请先在 GitHub 上给仓库建好这个分支（新建仓库时勾选 Add a README 就会自动有 main），或在配置里改成正确的分支名');
    }
    const name = FILE_PREFIX + localStamp() + '.json';
    const tree = await gh(c, '/git/trees', {
      method: 'POST',
      json: {
        base_tree: headSha ? (await gh(c, '/git/commits/' + headSha)).tree.sha : undefined,
        tree: [{ path: pathOf(c, name), mode: '100644', type: 'blob', sha: blobSha }]
      }
    });
    const commit = await gh(c, '/git/commits', {
      method: 'POST',
      json: { message: 'mochi 云备份 ' + new Date().toLocaleString(), tree: tree.sha, parents: [headSha] }
    });
    await gh(c, '/git/refs/heads/' + encodeURIComponent(c.branch), { method: 'PATCH', json: { sha: commit.sha, force: false } });
    if (opts.progress) opts.progress(100, 0, '完成');
    const res = { sha: commit.sha, name: name, path: pathOf(c, name), size: bytes, missing: got.missing.length };
    saveCfg({ lastAt: Date.now(), lastSha: commit.sha });
    return res;
  }

  /* ===== 列表 ===== */
  async function list(c0) {
    const c = c0 || cfg();
    if (!c.owner || !c.repo) throw new Error('还没有设置仓库');
    if (!c.token) throw new Error('还没有填 Token');
    let data = null;
    try {
      data = await gh(c, '/contents/' + encodeURI(c.dir) + '?ref=' + encodeURIComponent(c.branch));
    } catch (e) {
      if (e.status === 404) return [];
      throw e;
    }
    if (!Array.isArray(data)) return [];
    return data
      .filter(function (f) { return f && f.type === 'file' && f.name.indexOf(FILE_PREFIX) === 0; })
      .sort(function (a, b) { return String(b.name).localeCompare(String(a.name)); })
      .map(function (f) { return { name: f.name, sha: f.sha, size: f.size, path: f.path }; });
  }
  async function download(sha, c0) {
    const c = c0 || cfg();
    const blob = await gh(c, '/git/blobs/' + sha);
    if (!blob || blob.encoding !== 'base64') throw new Error('云端文件格式不认识');
    const bin = atob(String(blob.content || '').replace(/\s+/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { blob: new Blob([bytes], { type: 'application/json' }), size: blob.size || bytes.length };
  }

  /* ===== 还原（交给 data-backup 的确认 + 写入流程） ===== */
  async function restore(sha, onProgress) {
    if (onProgress) onProgress(5, '下载云端备份');
    const d = await download(sha);
    if (onProgress) onProgress(40, '下载完成（' + fmtSize(d.size) + '）');
    const file = new File([d.blob], 'mochi-cloud-' + String(sha).slice(0, 7) + '.json', { type: 'application/json' });
    if (typeof window.mochiCloudImport !== 'function') throw new Error('本机版本缺导入组件（data-backup.js 没加载），刷新页面再试');
    if (onProgress) onProgress(60, '确认并写入本机');
    await window.mochiCloudImport(file);
    if (onProgress) onProgress(100, '完成');
    return d.size;
  }

  /* ===== 设置面板 ===== */
  function section(title) { return '<div class="ghs-sec"><div class="ghs-lab">' + title + '</div>'; }
  function panelHTML() {
    const c = cfg();
    const last = c.lastAt ? new Date(c.lastAt).toLocaleString() : '还没备份过';
    return '' +
      '<div class="ghs" id="ghs">' +
      '<div class="ghs-sec"><div class="ghs-lab">仓库（用户名/仓库名）</div>' +
      '<input class="ghs-in" id="ghs-repo" placeholder="yourname/mochi-data" value="' + (c.owner ? (c.owner + '/' + c.repo) : '') + '" autocomplete="off" spellcheck="false"></div>' +
      '<div class="ghs-row2">' +
      '<div class="ghs-sec"><div class="ghs-lab">分支</div>' +
      '<input class="ghs-in" id="ghs-branch" placeholder="main" value="' + c.branch + '" autocomplete="off" spellcheck="false"></div>' +
      '<div class="ghs-sec"><div class="ghs-lab">目录</div>' +
      '<input class="ghs-in" id="ghs-dir" placeholder="mochi-backup" value="' + String(c.dir || '').replace(/\/$/, '') + '" autocomplete="off" spellcheck="false"></div>' +
      '</div>' +
      '<div class="ghs-sec"><div class="ghs-lab">访问令牌（PAT）</div>' +
      '<input type="password" class="ghs-in" id="ghs-token" placeholder="github_pat_… 或 ghp_…" value="' + (c.token || '') + '" autocomplete="off" spellcheck="false">' +
      '<div class="ghs-tip">在 GitHub → Settings → Developer settings → Personal access tokens 新建 <b>Fine-grained token</b>，' +
      '仓库权限里只勾选这个仓库的 <b>Contents: Read and write</b> 就够了。令牌只存在这台设备的浏览器里，不会上传到别处。</div></div>' +
      '<div class="ghs-sec"><div class="ghs-lab">备份范围</div>' +
      '<div class="ghs-pills" id="ghs-range">' +
      '<button type="button" class="ghs-pill' + (c.range === 'full' ? ' on' : '') + '" data-r="full">完整备份</button>' +
      '<button type="button" class="ghs-pill" data-r="no-music"' + (c.range === 'no-music' ? ' on' : '') + '>不含音乐文件</button>' +
      '<button type="button" class="ghs-pill" data-r="text"' + (c.range === 'text' ? ' on' : '') + '>只备份文字</button>' +
      '</div></div>' +
      '<div class="ghs-sec ghs-auto"><label class="ghs-check"><input type="checkbox" id="ghs-auto"' + (c.auto ? ' checked' : '') + '> <span>自动备份（打开应用时，距上次超过 6 小时就静默传一次）</span></label></div>' +
      '<div class="ghs-state" id="ghs-state">上次备份：' + last + '</div>' +
      '<div class="ghs-btns">' +
      '<button type="button" class="ghs-btn" id="ghs-test">测试连接</button>' +
      '<button type="button" class="ghs-btn main" id="ghs-up">备份到云端</button>' +
      '<button type="button" class="ghs-btn" id="ghs-list">从云端恢复</button>' +
      '</div>' +
      '<div class="ghs-prog" id="ghs-prog" hidden><div class="ghs-prog-fill" id="ghs-prog-fill"></div></div>' +
      '<div class="ghs-state" id="ghs-msg"></div>' +
      '</div>';
  }
  function readForm() {
    const $ = function (i) { return document.getElementById(i); };
    const p = parseRepo(($('ghs-repo') || {}).value || '');
    if (!p) throw new Error('「用户名/仓库名」要写成 owner/repo，比如 yourname/mochi-data');
    const dir = String(($('ghs-dir') || {}).value || 'mochi-backup').trim().replace(/^\/+/, '').replace(/\/+$/, '');
    const rangeEl = document.querySelector('#ghs-range .ghs-pill.on');
    return saveCfg({
      owner: p.owner,
      repo: p.repo,
      token: String(($('ghs-token') || {}).value || '').trim(),
      branch: String(($('ghs-branch') || {}).value || 'main').trim() || 'main',
      dir: dir || 'mochi-backup',
      auto: !!($('ghs-auto') && $('ghs-auto').checked),
      range: rangeEl ? rangeEl.dataset.r : 'full'
    });
  }
  let busy = false;
  function setBusy(v) { busy = !!v; }
  function showProg(pct, label) {
    const bar = document.getElementById('ghs-prog');
    const fill = document.getElementById('ghs-prog-fill');
    const msg = document.getElementById('ghs-msg');
    if (bar) bar.hidden = false;
    if (fill) fill.style.width = Math.max(0, Math.min(100, pct || 0)) + '%';
    if (msg && label) msg.textContent = label;
  }
  function hideProg() {
    const bar = document.getElementById('ghs-prog');
    if (bar) bar.hidden = true;
  }
  function setMsg(t, bad) {
    const msg = document.getElementById('ghs-msg');
    if (!msg) return;
    msg.textContent = t || '';
    msg.style.color = bad ? '#c0392b' : '';
  }
  function currentRange() {
    const el = document.querySelector('#ghs-range .ghs-pill.on');
    return el ? el.dataset.r : 'full';
  }
  async function doBackup() {
    if (busy) return;
    setBusy(true);
    try {
      showProg(0, '准备中…');
      const c = cfg();
      const r = await backup({
        range: currentRange(),
        progress: function (p, n, label) { showProg(p, label); }
      });
      hideProg();
      setMsg('✓ 已备份：' + r.path + '（' + fmtSize(r.size) + '）');
      const st = document.getElementById('ghs-state');
      if (st) st.textContent = '上次备份：' + new Date().toLocaleString();
      toast('云备份完成（' + fmtSize(r.size) + '）');
      if (r.missing) modal('备份已完成，但有数据没读到', '有 ' + r.missing + ' 项本机数据这次没读出来（通常是存储正忙）。\n云端文件已经生成，不影响其他数据；保险起见可以过几分钟再备份一次。');
    } catch (e) {
      hideProg();
      setMsg('✗ ' + ghMsg(e), true);
      modal('云备份没成功', ghMsg(e) + '\n\n可以点「测试连接」先看是仓库、分支还是令牌的问题。');
    } finally { setBusy(false); }
  }
  async function doTest() {
    if (busy) return;
    setBusy(true);
    try {
      const c = readForm();
      setMsg('测试中…');
      const r = await test(c);
      setMsg('✓ 连上了：' + r.repo + ' · ' + r.branch);
      toast('连接正常');
    } catch (e) {
      setMsg('✗ ' + ghMsg(e), true);
    } finally { setBusy(false); }
  }
  function doList() {
    if (busy) return;
    setBusy(true);
    setMsg('正在读取云端列表…');
    list(readForm()).then(function (arr) {
      setBusy(false);
      setMsg('');
      if (!arr.length) { modal('云端还没有备份', '这个目录下还没有 mochi 的备份文件。先点「备份到云端」传一份。'); return; }
      const pills = arr.slice(0, 12).map(function (f) {
        const t = f.name.replace(FILE_PREFIX, '').replace('.json', '');
        const tt = t.replace(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/, '$1/$2/$3 $4:$5');
        return { label: tt + ' · ' + fmtSize(f.size), value: f.sha };
      });
      window.openModal('从云端恢复', '', function (sha) {
        if (!sha) return;
        const f = arr.find(function (x) { return x.sha === sha; });
        if (!f) return;
        setTimeout(function () {
          window.openModal('用云端这份覆盖本机数据？', '', function (v) {
            if (v !== '__yes') return;
            setTimeout(function () { doRestore(f); }, 0);
          }, {
            noInput: true, pillSubmit: true, hideOk: true, warn: true,
            staticText: f.name + '（' + fmtSize(f.size) + '）\n导入后本机现有数据会被这份取代，无法撤销。',
            pills: [{ label: '覆盖本机', value: '__yes' }, { label: '再想想', value: '__no' }]
          });
        }, 0);
      }, { noInput: true, pills: pills, staticText: '选一份要拉回来的备份。恢复后会覆盖本机全部数据，和「导入数据」一样。' });
    }).catch(function (e) {
      setBusy(false);
      setMsg('✗ ' + ghMsg(e), true);
    });
  }
  async function doRestore(f) {
    if (busy) return;
    setBusy(true);
    try {
      showProg(0, '正在下载…');
      await restore(f.sha, function (p, label) { showProg(p, label); });
      hideProg();
      setMsg('✓ 已从云端恢复：' + f.name);
    } catch (e) {
      hideProg();
      setMsg('✗ ' + (e && e.message ? e.message : '恢复失败'), true);
    } finally { setBusy(false); }
  }
  function openPanel() {
    const html = panelHTML();
    try {
      window.openModal('云备份 · GitHub', '', function () {}, { noInput: true, okText: '关闭', big: true, staticHtml: html });
    } catch (e) { modal('云备份 · GitHub', '设置面板打不开：' + (e && e.message || e)); return; }
    setTimeout(function () {
      const $ = function (i) { return document.getElementById(i); };
      if (!$('ghs')) return;
      const range = $('ghs-range');
      if (range) {
        range.addEventListener('click', function (e) {
          const b = e.target && e.target.closest ? e.target.closest('.ghs-pill') : null;
          if (!b) return;
          Array.prototype.forEach.call(range.children, function (x) { x.classList.remove('on'); });
          b.classList.add('on');
        });
      }
      ['ghs-repo', 'ghs-branch', 'ghs-dir', 'ghs-token'].forEach(function (id) {
        const el = $(id);
        if (el) el.addEventListener('change', function () { try { readForm(); } catch (e) {} });
      });
      if ($('ghs-auto')) $('ghs-auto').addEventListener('change', function () { try { readForm(); } catch (e) {} });
      if ($('ghs-test')) $('ghs-test').onclick = doTest;
      $('ghs-up').onclick = doBackup;
      $('ghs-list').onclick = doList;
    }, 80);
  }

  /* ===== 自动备份：打开应用时检查，超过 6 小时且开着开关就静默传一次 ===== */
  function autoTick() {
    if (autoTick._t) return;
    autoTick._t = 1;
    setTimeout(async function () {
      try {
        let o = null;
        try { o = JSON.parse(ls(CFG_KEY) || 'null'); } catch (e) {}
        if (!o || o.auto !== true) return;
        const c = cfg();
        if (!c.owner || !c.repo || !c.token) return;
        if (Date.now() - c.lastAt < AUTO_MIN_GAP) return;
        if (!document.getElementById('page-settings') || document.getElementById('page-settings').hidden) return;
        const r = await backup({ range: o.range || 'full' });
        try {
          localStorage.setItem('gh-sync-last-auto', JSON.stringify({ at: Date.now(), name: r.name }));
        } catch (e) {}
      } catch (e) {
        try { localStorage.setItem('gh-sync-last-err', JSON.stringify({ at: Date.now(), msg: ghMsg(e) })); } catch (e2) {}
      }
    }, 6000);
  }

  window.mochiGitHubSync = {
    cfg: cfg, saveCfg: saveCfg, clearCfg: clearCfg, fullCfg: fullCfg,
    hasToken: function () { return !!cfg().token; },
    ready: ready,
    test: test,
    backup: backup,
    list: list,
    download: download,
    restore: restore,
    collectAll: collectAll,
    ghMsg: ghMsg,
    openPanel: openPanel,
    autoTick: autoTick
  };
  document.addEventListener('DOMContentLoaded', function () {
    try { window.mochiGitHubSync._t = setInterval(autoTick, AUTO_CHECK_MS); } catch (e) {}
    setTimeout(autoTick, 8000);
  });
})();
if (window.__mochiLoaded) window.__mochiLoaded.push("github-sync.js");
