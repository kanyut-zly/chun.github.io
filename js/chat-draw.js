/* 私人六改 · 涂鸦面板（移植自渡念 draw-panel，并加上「字母可拖动排序」）
 *
 * 与渡念的差别（用户要求）：
 *   ①字母不再用 fillText 烙进画布像素，而是以对象数组保存（{ch,x,y,size,color,rot}），
 *     先画笔画层再画字母层 —— 每个字母都能单独拖动、重新定位、删除；
 *   ②字母只用小写 a-z（用户选择「纯小写」）；
 *   ③画板里默认只有 a-z，中英文/数字输入是「更多」里的可开关项，默认关闭，
 *     字母键盘区右上角另有一枚「abc ⇄ 更多」即时切换按钮；
 *   ④背景 12 种色纸里随机或自选（渡念是每次随机）。
 *
 * 对外接口（挂在 window）：
 *   openChatDraw()              打开涂鸦面板（聊天「互动」分类入口调它）
 *   chatDrawEnabled()           涂鸦入口是否开启（默认开；设置里可关）
 *   chatDrawRenderBubble(b, rec) 消息气泡里渲染涂鸦图（聊天页 + 桌面通知共用展开逻辑）
 *   chatDrawExpand(val, onClose) 全屏看一张涂鸦（聊天记录 / 桌面通知点开）
 *   chatDrawIncomingMake()      生成 TA「随机回一张涂鸦」的数据（chat-card-draw.js 用）
 *
 * 消息字段（存在消息记录 rec 里，随聊天记录一起落盘）：
 *   type: 'draw'        固定
 *   draw: '@@m:<hash>'  或 data:image/png;base64,... —— 合成好的 PNG（背景+笔画+字母）
 *   drawLetters: n      字母个数，仅作统计/占位提示
 *   text: '[涂鸦]'      纯文本降级（老版本/导出/桌面通知兜底都靠它）
 */
(function () {
  try {
    (function () {
      'use strict';

      const store = (function () {
        try { return window.activeStore ? window.activeStore() : window.storeFor('default'); } catch (e) { return null; }
      })();

      const PANEL_ID = 'chat-draw-panel';
      const OPT_ID = 'chat-draw-opt-panel';
      const W = 720, H = 720;          // 合成画布边长（正方形，气泡里按 1:1 显示）
      const VIEW_DEFAULT = 300;        // 编辑区 CSS 尺寸上限（手机约屏宽-72）
      const UNDO_MAX = 20;
      const FONT_STACK = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,-apple-system,"Segoe UI",sans-serif';

      // 调色板：渡念 16 色 + 我们的紫色主色放在第一位
      const COLORS = ['#7c5cff', '#111111', '#ffffff', '#ef4444', '#f97316', '#f59e0b', '#eab308',
        '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#ec4899', '#db2777', '#a855f7'];
      const PAPERS = ['#ffffff', '#f3e8ff', '#ecfdf5', '#fef3c7', '#dbeafe', '#fce7f3',
        '#fee2e2', '#f0fdf4', '#fef9c3', '#e0e7ff', '#f1f5f9', '#fff7ed'];

      // ---------- 开关 ----------
      function optGet(key, def) {
        try { const v = store ? store.get(key) : null; return v === null || v === undefined ? def : v; } catch (e) { return def; }
      }
      function optSet(key, val) {
        try { if (store) store.set(key, val); } catch (e) {}
      }
      // 涂鸦入口（聊天「互动」里的画笔）——默认开，可在 聊天设置→功能→互动设置 里关
      window.chatDrawEnabled = function () { return optGet('draw-en', 'on') !== 'off'; };
      // 「更多」里的中英文/数字输入——默认关
      function textModeEnabled() { return optGet('draw-text-en', 'off') === 'on'; }
      // TA 回涂鸦概率（0-100，默认 30）
      window.chatDrawReplyProb = function () {
        const n = parseInt(optGet('draw-reply-prob', '30'), 10);
        return isNaN(n) ? 30 : Math.max(0, Math.min(100, n));
      };

      // ---------- 工具 ----------
      function toast(msg) { try { if (window.toast) window.toast(msg); } catch (e) {} }
      function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
      }
      function rnd(a, b) { return a + Math.random() * (b - a); }

      // 浮层宿主：必须挂 .phone（.app 是网格项，尺寸实测为 0，挂进去会缩成 0×0）
      function hostEl() {
        return document.querySelector('#page-chat') || document.querySelector('.phone') || document.body;
      }

      // ---------- 状态 ----------
      let open = false;
      let quiet = false;               // 复用面板时不清空
      let strokes = [];                // [{c, w, pts:[{x,y}...]}]  坐标空间 0..W / 0..H
      let letters = [];                // [{ch,x,y,size,color,rot}]  坐标为字母中心点
      let undoStack = [];              // [{t:'stroke'|'letter'|'clear', ...}]
      let paper = PAPERS[0];
      let curColor = COLORS[0];
      let curWidth = 6;
      let curLetterSize = 46;
      let mode = 'draw';               // 'draw' | 'letter'
      let letterBarOpen = false;       // 字母键盘是否展开
      let textMode = false;            // 键盘区是否显示「更多」（中文/数字）
      let selLetter = -1;
      let activePointer = null;

      // 布局探测 —— 画布实际可视尺寸（响应式）
      let viewSize = VIEW_DEFAULT;
      function measureView() {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        const stage = panel.querySelector('.cd-stage');
        if (!stage) return;
        const r = stage.getBoundingClientRect();
        const availW = r.width - 2;   // 去掉左右 1px 边框
        const availH = Math.max(140, window.innerHeight * 0.5);
        viewSize = Math.max(200, Math.min(availW > 0 ? availW : VIEW_DEFAULT, availH));
        stage.style.width = viewSize + 'px';
        stage.style.height = viewSize + 'px';
        const cvs = panel.querySelector('.cd-canvas');
        if (cvs) {
          cvs.style.width = viewSize + 'px';
          cvs.style.height = viewSize + 'px';
        }
        redraw();
      }
      function toCanvasX(clientX) {
        const panel = document.getElementById(PANEL_ID);
        const cvs = panel && panel.querySelector('.cd-canvas');
        if (!cvs) return 0;
        const r = cvs.getBoundingClientRect();
        return (clientX - r.left) * (W / Math.max(1, r.width));
      }
      function toCanvasY(clientY) {
        const panel = document.getElementById(PANEL_ID);
        const cvs = panel && panel.querySelector('.cd-canvas');
        if (!cvs) return 0;
        const r = cvs.getBoundingClientRect();
        return (clientY - r.top) * (H / Math.max(1, r.height));
      }
      function toCanvasScale() {
        return W / Math.max(1, viewSize);
      }

      // ---------- 绘制 ----------
      function paintInto(ctx, bg, strk, ltr) {
        ctx.fillStyle = bg || '#ffffff';
        ctx.fillRect(0, 0, W, H);
        // 笔画
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let i = 0; i < strk.length; i++) {
          const s = strk[i];
          const pts = s.pts || [];
          if (!pts.length) continue;
          ctx.strokeStyle = s.c || '#111111';
          ctx.fillStyle = s.c || '#111111';
          ctx.lineWidth = s.w || 4;
          if (pts.length === 1) {
            ctx.beginPath();
            ctx.arc(pts[0].x, pts[0].y, Math.max(1, (s.w || 4) / 2), 0, Math.PI * 2);
            ctx.fill();
            continue;
          }
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let j = 1; j < pts.length; j++) {
            const p = pts[j];
            const prev = pts[j - 1];
            // 中点二次曲线让手写更顺（渡念用 lineTo，硬转折）
            const mx = (prev.x + p.x) / 2, my = (prev.y + p.y) / 2;
            ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
          }
          const last = pts[pts.length - 1];
          ctx.lineTo(last.x, last.y);
          ctx.stroke();
        }
        // 字母
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let i = 0; i < ltr.length; i++) {
          const L = ltr[i];
          if (!L) continue;
          ctx.save();
          ctx.translate(L.x, L.y);
          if (L.rot) ctx.rotate((L.rot * Math.PI) / 180);
          ctx.font = '700 ' + (L.size || 46) + 'px ' + FONT_STACK;
          ctx.fillStyle = L.color || '#111111';
          ctx.fillText(L.ch, 0, 0);
          ctx.restore();
        }
      }

      function redraw() {
        if (!open) return;
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        const cvs = panel.querySelector('.cd-canvas');
        if (!cvs) return;
        // 画布内部分辨率按 devicePixelRatio 提升清晰度
        const dpr = Math.min(2.5, window.devicePixelRatio || 1);
        const px = Math.round(Math.max(viewSize, 200) * dpr);
        if (cvs.width !== px) { cvs.width = px; cvs.height = px; }
        const ctx = cvs.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, cvs.width, cvs.height);
        const k = px / W;
        ctx.scale(k, k);
        paintInto(ctx, paper, strokes, letters);
      }

      // ---------- 撤销 ----------
      function snap() {
        return {
          strokes: strokes.map(function (s) { return { c: s.c, w: s.w, pts: s.pts.map(function (p) { return { x: p.x, y: p.y }; }) }; }),
          letters: letters.map(function (L) { return Object.assign({}, L); })
        };
      }
      function pushUndo() {
        undoStack.push(snap());
        if (undoStack.length > UNDO_MAX) undoStack.shift();
        syncUndoBtn();
      }
      function syncUndoBtn() {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        const b = panel.querySelector('.cd-undo');
        if (b) b.disabled = !undoStack.length;
        const c = panel.querySelector('.cd-clear');
        if (c) {
          const empty = !strokes.length && !letters.length;
          c.disabled = empty;
        }
      }
      function undo() {
        if (!undoStack.length) { toast('没有可撤销的步骤了'); return; }
        const s = undoStack.pop();
        strokes = s.strokes;
        letters = s.letters;
        selLetter = -1;
        redraw();
        syncUndoBtn();
      }
      function clearAll() {
        if (!strokes.length && !letters.length) return;
        pushUndo();
        strokes = [];
        letters = [];
        selLetter = -1;
        redraw();
        syncUndoBtn();
      }

      // ---------- 合成 / 导出 ----------
      function composeDataUrl(isPreview) {
        const c = document.createElement('canvas');
        c.width = isPreview ? 240 : W;
        c.height = isPreview ? 240 : H;
        const ctx = c.getContext('2d');
        if (!ctx) return '';
        if (isPreview) ctx.scale(240 / W, 240 / W);
        paintInto(ctx, paper, strokes, letters);
        try { return c.toDataURL('image/png'); } catch (e) { return ''; }
      }

      function saveWorld() {
        try {
          optSet('draw-world', JSON.stringify({
            paper: paper, strokes: strokes, letters: letters,
            color: curColor, width: curWidth, letterSize: curLetterSize
          }));
        } catch (e) {}
      }
      function restoreWorld() {
        try {
          const raw = store ? store.get('draw-world') : null;
          if (!raw) return false;
          const o = JSON.parse(raw);
          if (!o || !Array.isArray(o.strokes)) return false;
          strokes = o.strokes;
          letters = Array.isArray(o.letters) ? o.letters : [];
          if (o.paper) paper = o.paper;
          if (o.color) curColor = o.color;
          if (typeof o.width === 'number' && o.width > 0) curWidth = o.width;
          if (typeof o.letterSize === 'number' && o.letterSize > 0) curLetterSize = o.letterSize;
          return true;
        } catch (e) { return false; }
      }

      // ---------- HTML ----------
      function paletteHtml() {
        return COLORS.map(function (c, i) {
          return '<button type="button" class="cd-sw' + (i === 0 ? ' on' : '') + '" data-c="' + c + '" style="background:' + c + '" title="' + c + '"></button>';
        }).join('');
      }

      function lettersGridHtml() {
        let h = '<div class="cd-letters-a">';
        for (let i = 0; i < 26; i++) {
          const ch = String.fromCharCode(97 + i);
          h += '<button type="button" class="cd-lk" data-ch="' + ch + '">' + ch + '</button>';
        }
        h += '</div>';
        h += '<div class="cd-letters-b" hidden>';
        const MORE = '1234567890.?!,;:\'()-+=*/#@%&';
        let chars = MORE.split('');
        for (let i = 0; i < chars.length; i++) {
          h += '<button type="button" class="cd-lk" data-ch="' + esc(chars[i]) + '">' + esc(chars[i]) + '</button>';
        }
        h += '</div>';
        return h;
      }

      function panelHtml() {
        return '' +
          '<div class="cd-panel">' +
            '<div class="cd-head">' +
              '<span class="cd-title">涂鸦</span>' +
              '<button type="button" class="cd-more" id="cd-head-more">更多</button>' +
              '<button type="button" class="cd-close" id="cd-close" title="关闭">✕</button>' +
            '</div>' +
            '<div class="cd-stage" style="background:' + paper + '">' +
              '<canvas class="cd-canvas" width="' + W + '" height="' + H + '"></canvas>' +
              '<div class="cd-sel" hidden></div>' +
            '</div>' +
            '<div class="cd-modes">' +
              '<button type="button" class="cd-mode cd-mode-draw on" data-m="draw">画笔</button>' +
              '<button type="button" class="cd-mode cd-mode-letter" data-m="letter">字母</button>' +
              '<button type="button" class="cd-undo" title="撤销" disabled>↶</button>' +
              '<button type="button" class="cd-clear" title="清空" disabled>清空</button>' +
            '</div>' +
            '<div class="cd-tools cd-tools-draw">' +
              '<div class="cd-palette">' + paletteHtml() + '</div>' +
              '<div class="cd-wrow">' +
                '<span class="cd-wlbl">粗细</span>' +
                '<input type="range" class="cd-width" id="cd-width" min="2" max="26" step="1" value="' + curWidth + '">' +
                '<span class="cd-wval" id="cd-width-val">' + curWidth + '</span>' +
              '</div>' +
            '</div>' +
            '<div class="cd-tools cd-tools-letter" hidden>' +
              '<div class="cd-palette">' + paletteHtml() + '</div>' +
              '<div class="cd-wrow">' +
                '<span class="cd-wlbl">字号</span>' +
                '<input type="range" class="cd-width" id="cd-lsize" min="18" max="96" step="2" value="' + curLetterSize + '">' +
                '<span class="cd-wval" id="cd-lsize-val">' + curLetterSize + '</span>' +
                '<button type="button" class="cd-rotdel" id="cd-lrot">旋转</button>' +
                '<button type="button" class="cd-rotdel" id="cd-ldel">删除</button>' +
              '</div>' +
            '</div>' +
            '<div class="cd-lbar" hidden>' +
              '<div class="cd-lbar-head">' +
                '<span class="cd-lbar-tip" id="cd-lbar-tip">点字母放上画布，按住可拖动排序</span>' +
                '<button type="button" class="cd-lbar-sw" id="cd-lbar-sw">更多</button>' +
              '</div>' +
              '<div class="cd-lgrid" id="cd-lgrid">' + lettersGridHtml() + '</div>' +
            '</div>' +
            '<div class="cd-foot">' +
              '<span class="cd-hint" id="cd-hint">画点什么吧</span>' +
              '<button type="button" class="cd-send" id="cd-send">发送</button>' +
            '</div>' +
          '</div>';
      }

      // 「更多」设置小窗（中文/数字开关 + 纸底色）
      function optPanelHtml() {
        const on = textModeEnabled();
        return '' +
          '<div class="cd-opt-panel">' +
            '<div class="cd-head">' +
              '<span class="cd-title">涂鸦设置</span>' +
              '<button type="button" class="cd-close" id="cd-opt-close" title="关闭">✕</button>' +
            '</div>' +
            '<div class="cd-opt-body">' +
              '<div class="cd-opt-row">' +
                '<div class="cd-opt-txt">字母键盘显示「更多」<span class="cd-opt-sub">打开后在字母键盘右上角可切换 中文 / 数字 / 符号</span></div>' +
                '<label class="toggle"><input type="checkbox" id="cd-opt-texten"' + (on ? ' checked' : '') + '><span class="tk"></span></label>' +
              '</div>' +
              '<div class="cd-opt-row cd-opt-row-col">' +
                '<div class="cd-opt-txt">纸底色</div>' +
                '<div class="cd-papers">' + PAPERS.map(function (c) {
                  return '<button type="button" class="cd-paper' + (c === paper ? ' on' : '') + '" data-c="' + c + '" style="background:' + c + '"></button>';
                }).join('') + '</div>' +
                '<button type="button" class="cd-opt-btn" id="cd-paper-rnd">随机换一张</button>' +
              '</div>' +
              '<div class="cd-opt-row">' +
                '<div class="cd-opt-txt">TA 回涂鸦概率<span class="cd-opt-sub">想改的话去 回复设置 → 其他 → 联系人主动邀请</span></div>' +
                '<span class="cd-opt-val" id="cd-opt-prob-val">' + window.chatDrawReplyProb() + '%</span>' +
              '</div>' +
            '</div>' +
          '</div>';
      }

      // ---------- 面板开 / 关 ----------
      function buildPanel() {
        if (document.getElementById(PANEL_ID)) return document.getElementById(PANEL_ID);
        const el = document.createElement('div');
        el.className = 'cd-mask';
        el.id = PANEL_ID;
        el.hidden = true;
        el.innerHTML = panelHtml();
        hostEl().appendChild(el);
        return el;
      }

      function applyModeUI() {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        panel.querySelectorAll('.cd-mode').forEach(function (b) {
          b.classList.toggle('on', b.getAttribute('data-m') === mode);
        });
        const td = panel.querySelector('.cd-tools-draw');
        const tl = panel.querySelector('.cd-tools-letter');
        if (td) td.hidden = mode !== 'draw';
        if (tl) tl.hidden = mode !== 'letter';
        const lbar = panel.querySelector('.cd-lbar');
        if (lbar) lbar.hidden = !(mode === 'letter' && letterBarOpen);
        const hint = panel.querySelector('#cd-hint');
        if (hint) {
          hint.textContent = mode === 'letter'
            ? (letterBarOpen ? '点字母放到画布上 · 按住拖动排序' : '点「字母」展开键盘')
            : '画点什么吧';
        }
        syncLetterTools();
      }

      function syncLetterTools() {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        const rot = panel.querySelector('#cd-lrot');
        const del = panel.querySelector('#cd-ldel');
        const has = selLetter >= 0 && !!letters[selLetter];
        if (rot) rot.disabled = !has;
        if (del) del.disabled = !has;
        const ls = panel.querySelector('#cd-lsize');
        const lsv = panel.querySelector('#cd-lsize-val');
        if (ls && has) {
          const v = Math.max(18, Math.min(96, Math.round(letters[selLetter].size || curLetterSize)));
          ls.value = v;
          if (lsv) lsv.textContent = v;
        }
        const sel = panel.querySelector('.cd-sel');
        if (sel) {
          if (!has) { sel.hidden = true; return; }
          const L = letters[selLetter];
          const k = viewSize / W;
          const size = (L.size || 46) * k;
          sel.hidden = false;
          sel.style.left = (L.x * k - size) + 'px';
          sel.style.top = (L.y * k - size) + 'px';
          sel.style.width = (size * 2) + 'px';
          sel.style.height = (size * 2) + 'px';
        }
      }

      function syncPalette() {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        panel.querySelectorAll('.cd-sw').forEach(function (b) {
          b.classList.toggle('on', b.getAttribute('data-c') === curColor);
        });
      }

      function setMode(m) {
        mode = m === 'letter' ? 'letter' : 'draw';
        if (mode === 'letter' && !letterBarOpen) letterBarOpen = true;
        if (mode === 'draw') selLetter = -1;
        applyModeUI();
        redraw();
      }

      function setPaper(c) {
        paper = c;
        const panel = document.getElementById(PANEL_ID);
        if (panel) {
          const stage = panel.querySelector('.cd-stage');
          if (stage) stage.style.background = c;
        }
        const opt = document.getElementById(OPT_ID);
        if (opt) opt.querySelectorAll('.cd-paper').forEach(function (b) {
          b.classList.toggle('on', b.getAttribute('data-c') === c);
        });
        redraw();
        saveWorld();
      }

      function addLetter(ch) {
        const c = ch != null ? String(ch) : '';
        if (!c) return;
        pushUndo();
        // 随机位置（避开边缘，保证完整显示）
        const size = curLetterSize;
        const L = {
          ch: c,
          x: rnd(size, W - size),
          y: rnd(size, H - size),
          size: size,
          color: curColor,
          rot: Math.round(rnd(-14, 14))
        };
        letters.push(L);
        selLetter = letters.length - 1;
        // 字母模式下先放到画面中央附近更符合直觉？——用户要求「点一下随机摆放」，保持随机
        redraw();
        syncLetterTools();
        syncUndoBtn();
        saveWorld();
      }

      function openPanel(force) {
        const panel = buildPanel();
        if (open) { return; }
        bindPanelOnce(panel);
        open = true;
        undoStack = [];
        selLetter = -1;
        if (!quiet && !force) {
          // 从聊天入口打进＝新画；关闭后重新打开才恢复上次的
          strokes = [];
          letters = [];
          paper = PAPERS[Math.floor(Math.random() * PAPERS.length)];
          curColor = COLORS[0];
          curWidth = 6;
          curLetterSize = 46;
          mode = 'draw';
          letterBarOpen = false;
          textMode = textModeEnabled();
        } else {
          mode = 'draw';
          letterBarOpen = false;
          textMode = textModeEnabled();
        }
        quiet = false;
        // 恢复/重置 UI
        const stage = panel.querySelector('.cd-stage');
        if (stage) stage.style.background = paper;
        const wv = panel.querySelector('#cd-width');
        if (wv) wv.value = curWidth;
        const wvl = panel.querySelector('#cd-width-val');
        if (wvl) wvl.textContent = curWidth;
        const ls = panel.querySelector('#cd-lsize');
        if (ls) ls.value = curLetterSize;
        const lsv = panel.querySelector('#cd-lsize-val');
        if (lsv) lsv.textContent = curLetterSize;
        const sw = panel.querySelector('#cd-lbar-sw');
        if (sw) sw.hidden = !textMode;
        const grid = panel.querySelector('#cd-lgrid');
        if (grid) {
          grid.querySelector('.cd-letters-a').hidden = false;
          grid.querySelector('.cd-letters-b').hidden = true;
        }
        syncPalette();
        applyModeUI();
        syncUndoBtn();
        measureView();
        panel.hidden = false;
        // 打开后下一帧再量一次（宿主刚显示时尺寸可能还没定）
        setTimeout(function () { try { measureView(); } catch (e) {} }, 30);
        setTimeout(function () { try { measureView(); } catch (e) {} }, 260);
      }

      function closePanel() {
        open = false;
        activePointer = null;
        const panel = document.getElementById(PANEL_ID);
        if (panel) panel.hidden = true;
        const opt = document.getElementById(OPT_ID);
        if (opt) opt.hidden = true;
        saveWorld();
      }

      // ---------- 单指操作（画笔 / 拖动字母） ----------
      function hitLetterAt(x, y) {
        const pad = 10;
        // 从后往前命中（后放的在上面）
        for (let i = letters.length - 1; i >= 0; i--) {
          const L = letters[i];
          if (!L) continue;
          const half = (L.size || 46) * 0.62;
          const dx = x - L.x, dy = y - L.y;
          // 允许轻微旋转：用外接方形近似即可
          if (Math.abs(dx) <= half + pad && Math.abs(dy) <= half + pad) return i;
        }
        return -1;
      }

      function bindCanvas(panel) {
        const cvs = panel.querySelector('.cd-canvas');
        if (!cvs || cvs.__cdBound) return;
        cvs.__cdBound = 1;

        cvs.addEventListener('pointerdown', function (e) {
          if (!open) return;
          if (activePointer !== null) return;      // 只认第一根手指
          const x = toCanvasX(e.clientX), y = toCanvasY(e.clientY);
          if (mode === 'letter') {
            const hit = hitLetterAt(x, y);
            if (hit >= 0) {
              selLetter = hit;
              pushUndo();
              activePointer = { kind: 'move', id: e.pointerId, dx: x - letters[hit].x, dy: y - letters[hit].y, moved: false };
              try { cvs.setPointerCapture(e.pointerId); } catch (er) {}
              e.preventDefault();
              syncLetterTools();
              return;
            }
            // 点到空白＝取消选中，不生新字母（字母靠键盘点）
            selLetter = -1;
            syncLetterTools();
            return;
          }
          // 画笔
          pushUndo();
          const s = { c: curColor, w: curWidth * (W / 300), pts: [{ x: x, y: y }] };
          strokes.push(s);
          activePointer = { kind: 'draw', id: e.pointerId, stroke: s };
          try { cvs.setPointerCapture(e.pointerId); } catch (er) {}
          e.preventDefault();
          redraw();
          syncUndoBtn();
        });

        cvs.addEventListener('pointermove', function (e) {
          if (!activePointer || activePointer.id !== e.pointerId) return;
          const x = toCanvasX(e.clientX), y = toCanvasY(e.clientY);
          if (activePointer.kind === 'draw') {
            const pts = activePointer.stroke.pts;
            const last = pts[pts.length - 1];
            // 抽稀：距离太近不记点（省内存、线条更顺）
            if (last && Math.abs(last.x - x) < 1.2 && Math.abs(last.y - y) < 1.2) return;
            pts.push({ x: x, y: y });
            redraw();
            e.preventDefault();
          } else if (activePointer.kind === 'move') {
            const L = letters[selLetter];
            if (!L) return;
            const nx = Math.max(0, Math.min(W, x - activePointer.dx));
            const ny = Math.max(0, Math.min(H, y - activePointer.dy));
            if (!activePointer.moved) {
              if (Math.abs(nx - L.x) < 0.6 && Math.abs(ny - L.y) < 0.6) return;
              activePointer.moved = true;
            }
            L.x = nx; L.y = ny;
            redraw();
            syncLetterTools();
            e.preventDefault();
          }
        });

        function endPointer(e) {
          if (!activePointer || activePointer.id !== e.pointerId) return;
          const kind = activePointer.kind;
          activePointer = null;
          if (kind === 'move' || kind === 'draw') saveWorld();
          if (kind === 'move') syncLetterTools();
        }
        cvs.addEventListener('pointerup', endPointer);
        cvs.addEventListener('pointercancel', endPointer);
        cvs.addEventListener('pointerleave', function (e) {
          // 鼠标移出画布但还按着：不结束（pointer capture 会继续送 move），松开才结束
        });
      }

      // 键盘点击（事件委托：静态绑一次）
      function bindPanelOnce(panel) {
        if (panel.__cdBound) return;
        panel.__cdBound = 1;

        // 调色板（画笔与字母各一份，共用一份事件）
        panel.addEventListener('click', function (e) {
          const sw = e.target.closest('.cd-sw');
          if (sw) {
            curColor = sw.getAttribute('data-c') || '#111111';
            syncPalette();
            // 选中字母时＝改这个字母的颜色
            if (mode === 'letter' && selLetter >= 0 && letters[selLetter]) {
              pushUndo();
              letters[selLetter].color = curColor;
              redraw();
              saveWorld();
            }
            return;
          }
          const lk = e.target.closest('.cd-lk');
          if (lk) {
            addLetter(lk.getAttribute('data-ch'));
            return;
          }
          const md = e.target.closest('.cd-mode');
          if (md) { setMode(md.getAttribute('data-m')); return; }
        });

        const closeB = panel.querySelector('#cd-close');
        if (closeB) closeB.addEventListener('click', closePanel);

        const undoB = panel.querySelector('.cd-undo');
        if (undoB) undoB.addEventListener('click', undo);
        const clearB = panel.querySelector('.cd-clear');
        if (clearB) clearB.addEventListener('click', function () {
          if (window.confirm) {
            try {
              if (!window.confirm('清空整张画布？')) return;
            } catch (e) {}
          }
          clearAll();
        });

        const width = panel.querySelector('#cd-width');
        if (width) {
          width.addEventListener('input', function () {
            curWidth = parseInt(width.value, 10) || 6;
            const v = panel.querySelector('#cd-width-val');
            if (v) v.textContent = curWidth;
            saveWorld();
          });
        }
        const lsize = panel.querySelector('#cd-lsize');
        if (lsize) {
          lsize.addEventListener('input', function () {
            const v = parseInt(lsize.value, 10) || 46;
            curLetterSize = v;
            const vv = panel.querySelector('#cd-lsize-val');
            if (vv) vv.textContent = v;
            // 选中某字母时改它的大小
            if (mode === 'letter' && selLetter >= 0 && letters[selLetter]) {
              letters[selLetter].size = v;
              redraw();
              syncLetterTools();
            }
            saveWorld();
          });
        }
        const lrot = panel.querySelector('#cd-lrot');
        if (lrot) lrot.addEventListener('click', function () {
          if (selLetter < 0 || !letters[selLetter]) return;
          pushUndo();
          letters[selLetter].rot = ((letters[selLetter].rot || 0) + 15) % 360;
          redraw();
          saveWorld();
        });
        const ldel = panel.querySelector('#cd-ldel');
        if (ldel) ldel.addEventListener('click', function () {
          if (selLetter < 0 || !letters[selLetter]) return;
          pushUndo();
          letters.splice(selLetter, 1);
          selLetter = -1;
          redraw();
          syncLetterTools();
          syncUndoBtn();
          saveWorld();
        });
        const lbarSw = panel.querySelector('#cd-lbar-sw');
        if (lbarSw) lbarSw.addEventListener('click', function () {
          const a = panel.querySelector('.cd-letters-a');
          const b = panel.querySelector('.cd-letters-b');
          if (!a || !b) return;
          const nowMore = b.hidden;   // 当前在 abc，点一下切到「更多」
          a.hidden = nowMore;
          b.hidden = !nowMore;
          lbarSw.textContent = nowMore ? 'abc' : '更多';
          lbarSw.classList.toggle('on', nowMore);
        });

        const headMore = panel.querySelector('#cd-head-more');
        if (headMore) headMore.addEventListener('click', function (e) {
          e.stopPropagation();
          openOptPanel();
        });

        const send = panel.querySelector('#cd-send');
        if (send) send.addEventListener('click', sendDraw);

        bindCanvas(panel);
      }
      // ---------- 「更多」设置小窗 ----------
      function openOptPanel() {
        let el = document.getElementById(OPT_ID);
        if (!el) {
          el = document.createElement('div');
          el.className = 'cd-opt-mask';
          el.id = OPT_ID;
          el.hidden = true;
          hostEl().appendChild(el);
          el.addEventListener('click', function (e) {
            if (e.target === el) { closeOptPanel(); return; }
            const p = e.target.closest('.cd-paper');
            if (p) { setPaper(p.getAttribute('data-c')); return; }
            const btn = e.target.closest('#cd-paper-rnd');
            if (btn) {
              setPaper(PAPERS[Math.floor(Math.random() * PAPERS.length)]);
              toast('已换一张纸底色');
              return;
            }
            if (e.target.closest('#cd-opt-close')) { closeOptPanel(); return; }
          });
          el.addEventListener('change', function (e) {
            if (!e.target || e.target.id !== 'cd-opt-texten') return;
            optSet('draw-text-en', e.target.checked ? 'on' : 'off');
            // 立即同步字母键盘上的切换按钮显隐
            const panel = document.getElementById(PANEL_ID);
            const sw = panel && panel.querySelector('#cd-lbar-sw');
            if (sw) {
              sw.hidden = !e.target.checked;
              if (!e.target.checked) {
                const a = panel.querySelector('.cd-letters-a');
                const b = panel.querySelector('.cd-letters-b');
                if (a) a.hidden = false;
                if (b) b.hidden = true;
                sw.textContent = '更多';
                sw.classList.remove('on');
              }
            }
            toast(e.target.checked ? '已开启：字母键盘可切「更多」（数字/符号）' : '已关闭「更多」输入');
          });
        }
        el.innerHTML = optPanelHtml();
        el.hidden = false;
      }
      function closeOptPanel() {
        const el = document.getElementById(OPT_ID);
        if (el) el.hidden = true;
      }

      // ---------- 发送 ----------
      function sendDraw() {
        if (!strokes.length && !letters.length) { toast('先画点什么再发送吧'); return; }
        const dataUrl = composeDataUrl(false);
        if (!dataUrl) { toast('生成图片失败，请重试'); return; }
        if (!window.chatAddGift) { toast('聊天暂不可用'); return; }
        const rec = {
          side: 'out',
          type: 'draw',
          text: '[涂鸦]',
          draw: dataUrl,
          drawLetters: letters.length,
          ts: Date.now(),
          dedupExempt: true
        };
        window.chatAddGift(rec);
        closePanel();
        try { closeMorePanel(); } catch (e) {}
        toast('涂鸦发出去啦');
        try { if (window.chatFlushSave) window.chatFlushSave(); } catch (e) {}
        // TA 回一张：按概率，稍等一下再回（避免和发送动画抢）
        scheduleTaReply();
      }

      function closeMorePanel() {
        const mp = document.getElementById('chat-more-panel');
        if (mp) mp.hidden = true;
      }

      // ---------- TA 回涂鸦 ----------
      function scheduleTaReply() {
        const prob = window.chatDrawReplyProb();
        if (prob <= 0) return;
        if (Math.random() * 100 >= prob) return;
        const delay = 1800 + Math.random() * 2600;
        setTimeout(function () {
          try {
            if (!window.chatDrawTaReply) return;
            if (window.chatDrawEnabled && !window.chatDrawEnabled()) return;
            window.chatDrawTaReply();
          } catch (e) {}
        }, delay);
      }

      // ---------- 气泡渲染 ----------
      function resolveSrc(src, cb) {
        const v = String(src || '');
        if (!v) { cb(''); return; }
        if (window.mochiMediaIsToken && window.mochiMediaIsToken(v)) {
          if (!window.mochiMediaResolve) { cb(''); return; }
          window.mochiMediaResolve(v).then(function (d) { cb(d || ''); }).catch(function () { cb(''); });
          return;
        }
        cb(v);
      }

      function drawBubbleHtml(rec) {
        const src = rec && rec.draw ? String(rec.draw) : '';
        return '<div class="msg-draw' + (src ? '' : ' empty') + '" data-draw-src="' + esc(src) + '">' +
          (src
            ? '<img class="msg-draw-img" alt="涂鸦" loading="lazy" decoding="async">'
            : '<span class="msg-draw-ph">[涂鸦]</span>') +
          '</div>';
      }

      function renderBubbleInto(container) {
        if (!container) return;
        container.querySelectorAll('.msg-draw').forEach(function (box) {
          const src = box.getAttribute('data-draw-src') || '';
          const img = box.querySelector('img.msg-draw-img');
          if (!img) return;
          resolveSrc(src, function (resolved) {
            if (!resolved) return;
            img.onerror = function () {
              box.classList.add('empty');
              img.remove();
            };
            img.src = resolved;
          });
          if (!box.__cdTap) {
            box.__cdTap = 1;
            box.addEventListener('click', function (e) {
              e.stopPropagation();
              const s = box.getAttribute('data-draw-src') || '';
              if (!s) return;
              try { window.chatDrawExpand(s); } catch (er) {}
            });
          }
        });
      }

      window.chatDrawRenderBubbleInto = renderBubbleInto;
      window.chatDrawBubbleHtml = drawBubbleHtml;

      // ---------- 大图查看 ----------
      window.chatDrawExpand = function (src) {
        let el = document.getElementById('chat-draw-viewer');
        if (!el) {
          el = document.createElement('div');
          el.className = 'cd-viewer';
          el.id = 'chat-draw-viewer';
          el.hidden = true;
          el.innerHTML = '<div class="cd-viewer-inner"><img class="cd-viewer-img" alt="涂鸦"><button type="button" class="cd-viewer-x">✕</button><a class="cd-viewer-save" download="mochi-draw.png">保存</a></div>';
          document.body.appendChild(el);
          el.addEventListener('click', function (e) {
            if (e.target === el || e.target.closest('.cd-viewer-x')) el.hidden = true;
          });
        }
        const img = el.querySelector('.cd-viewer-img');
        const save = el.querySelector('.cd-viewer-save');
        resolveSrc(src, function (resolved) {
          if (!resolved) { toast('这张涂鸦暂时打不开'); return; }
          img.src = resolved;
          if (save) save.href = resolved;
          el.hidden = false;
        });
      };

      // ---------- 供 TA 回涂鸦模块用的随机画 ----------
      let taTempCanvas = null;
      window.chatDrawIncomingMake = function () {
        if (!taTempCanvas) taTempCanvas = document.createElement('canvas');
        taTempCanvas.width = 240;
        taTempCanvas.height = 240;
        const ctx = taTempCanvas.getContext('2d');
        if (!ctx) return null;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, 240, 240);
        const bg = PAPERS[Math.floor(Math.random() * PAPERS.length)];
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, 240, 240);
        const lineColors = ['#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#6366f1', '#14b8a6', '#f97316', '#db2777', '#7c3aed'];
        const words = ['hi', 'hey', 'love', 'miss', 'hug', 'ya', 'ok', 'wow', 'hm', 'meow', 'boop', 'miss u'];
        const isAllLetter = Math.random() < 0.55;
        if (isAllLetter) {
          const n = Math.floor(rnd(14, 26));
          for (let i = 0; i < n; i++) {
            const L = {
              ch: words[Math.floor(Math.random() * words.length)].charAt(Math.floor(Math.random() * 4)) || 'a',
              x: rnd(30, 210),
              y: rnd(30, 210),
              size: rnd(14, 30),
              color: lineColors[Math.floor(Math.random() * lineColors.length)],
              rot: rnd(-30, 30)
            };
            ctx.save();
            ctx.translate(L.x, L.y);
            ctx.rotate(L.rot * Math.PI / 180);
            ctx.fillStyle = L.color;
            ctx.font = '700 ' + L.size + 'px ' + FONT_STACK;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(L.ch, 0, 0);
            ctx.restore();
          }
        } else {
          // 随机小涂鸦：几段折线 + 一个小心心
          const n = Math.floor(rnd(2, 4));
          for (let i = 0; i < n; i++) {
            ctx.beginPath();
            ctx.strokeStyle = lineColors[Math.floor(Math.random() * lineColors.length)];
            ctx.lineWidth = rnd(3, 6);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            let x = rnd(30, 210), y = rnd(50, 200);
            ctx.moveTo(x, y);
            const seg = Math.floor(rnd(3, 6));
            for (let j = 0; j < seg; j++) {
              x = Math.max(20, Math.min(220, x + rnd(-40, 40)));
              y = Math.max(20, Math.min(220, y + rnd(-35, 35)));
              ctx.lineTo(x, y);
            }
            ctx.stroke();
          }
          if (Math.random() < 0.6) {
            ctx.save();
            ctx.translate(rnd(90, 160), rnd(100, 170));
            const s = rnd(0.5, 0.9);
            ctx.scale(s, s);
            ctx.beginPath();
            ctx.fillStyle = lineColors[Math.floor(Math.random() * lineColors.length)];
            ctx.moveTo(0, 15);
            ctx.bezierCurveTo(-40, -10, -20, -45, 0, -20);
            ctx.bezierCurveTo(20, -45, 40, -10, 0, 15);
            ctx.fill();
            ctx.restore();
          }
        }
        // 边角偶尔标个名字
        if (Math.random() < 0.5) {
          ctx.save();
          ctx.fillStyle = 'rgba(0,0,0,.35)';
          ctx.font = '600 13px ' + FONT_STACK;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'top';
          let nm = 'me';
          try { if (window.chatPartnerName) nm = String(window.chatPartnerName() || 'me').slice(0, 8); } catch (e) {}
          ctx.fillText(nm, 230, 226);
          ctx.restore();
        }
        let url = '';
        try { url = taTempCanvas.toDataURL('image/png'); } catch (e) { url = ''; }
        return url || null;
      };

      // ---------- 对外 ----------
      window.openChatDraw = function (opts) {
        quiet = !!(opts && opts.keep);
        if (!window.chatDrawEnabled()) {
          toast('涂鸦入口已在设置里关闭，可在 聊天设置 → 功能 → 互动设置 里重新打开');
          return;
        }
        if (!open && quiet) restoreWorld();
        openPanel(quiet);
      };

      // 关闭整页/切换联系人时收起
      document.addEventListener('contact-switched', function () {
        if (open) closePanel();
        const opt = document.getElementById(OPT_ID);
        if (opt) opt.hidden = true;
      });

      window.chatDrawInit = function () {
        buildPanel();
        // 尺寸变化（旋转屏幕 / 键盘弹出）时重新量
        window.addEventListener('resize', function () {
          if (!open) return;
          try { measureView(); } catch (e) {}
        });
        document.addEventListener('keyboard-show', function () {
          if (!open) return;
          setTimeout(function () { try { measureView(); } catch (e) {} }, 220);
        });
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { try { window.chatDrawInit(); } catch (e) {} });
      } else {
        try { window.chatDrawInit(); } catch (e) {}
      }

      if (window.__mochiLoaded) window.__mochiLoaded.push('chat-draw.js');
    })();
  } catch (__e) {
    if (window.__mochiErrLoaded) window.__mochiErrLoaded.push('chat-draw.js');
    try { console.error('[JS] chat-draw.js', (__e && __e.message) || __e); } catch (x) {}
    if (window.__jsErrors) window.__jsErrors.push('[chat-draw.js] ' + String((__e && __e.message) || __e));
  }
})();
