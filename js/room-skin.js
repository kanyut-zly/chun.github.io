/* 私人六改 · 一起看 / 一起读 的房间美化
 *
 * 用户要的「跟聊天设置里的美化差不多，就在那里调」：
 *   ①白天 / 黑夜模式（房间本来只有黑夜，现在多一个白天）
 *   ②房间底色（黑夜 / 白天各一套）
 *   ③字体颜色（正文 / 次要文字 / TA 气泡文字 / 我的气泡文字）
 *   ④背景图片（可上传，调整透明度、铺满方式；整块房间铺开，栏位和气泡都是半透明的）
 *
 * 设置入口：「聊天设置 → 功能 → 一起看 / 一起读」那一组里多两行
 *   「一起看美化」「一起读美化」→ 打开「房间美化」全屏抽屉（样式参考聊天美化抽屉）。
 *   两个房间共用同一套样式，改一次两边都生效。
 *
 * 数据（存 activeStore，每个联系人各自一份）：
 *   room-theme        'dark' / 'light'          （默认 dark）
 *   room-skin         JSON 颜色覆盖             {name:{dark,light}}，没设的项跟随预设
 *   room-bg           data:image/...            房间背景图（压缩过）
 *   room-bg-op        '0'..'100'               背景图不透明度（默认 100）
 *   room-bg-fit       'cover'|'contain'|'repeat'|'stretch'  （默认 cover）
 *
 * 对外接口：
 *   roomSkinOpen()      打开美化抽屉
 *   roomSkinApply()     重算并写入 CSS 变量（房间模块打开时也会调一次）
 */
(function () {
  try {
    (function () {
      'use strict';

      const DRAWER_ID = 'room-skin-drawer';
      // 不能加载时定死 store：切联系人后要跟着换桌面
      function curStore() {
        try { return window.activeStore ? window.activeStore() : (window.storeFor ? window.storeFor('default') : null); } catch (e) { return null; }
      }

      function g(k, def) {
        try { const st = curStore(); const v = st ? st.get(k) : null; return v === null || v === undefined || v === '' ? def : v; } catch (e) { return def; }
      }
      function s(k, v) { try { const st = curStore(); if (st) st.set(k, v); } catch (e) {} }
      function rm(k) { try { const st = curStore(); if (st) st.remove(k); } catch (e) {} }
      function skinGet() { try { const o = JSON.parse(g('room-skin', '{}') || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
      function skinSet(o) { s('room-skin', JSON.stringify(o || {})); }
      function toast(m) { try { if (window.toast) window.toast(m); } catch (e) {} }
      function theme() { return g('room-theme', 'dark') === 'light' ? 'light' : 'dark'; }

      // ---------- 预设 ----------
      // 每一项在黑夜 / 白天各有一个默认色，用户改过的记在 room-skin[name][theme]
      const PRESET = {
        dark: {
          bg: '#0e0d12', bg2: '#14121c', card: '#1b1926',
          ink: '#f5f3ff', ink2: '#c9c2ee', ink3: '#8d86a8', line: 'rgba(255,255,255,.08)',
          taBg: 'rgba(124,92,255,.2)', taInk: '#f0ecff',
          meBg: '#7c5cff', meInk: '#ffffff',
          sys: '#6f6889', field: 'rgba(255,255,255,.06)', fieldLine: 'rgba(255,255,255,.12)',
          accent: '#7c5cff', noteBg: 'rgba(124,92,255,.12)', hit: 'rgba(245,158,11,.22)',
          旁注: 'rgba(20,18,28,.96)', 空场: '#000000', 蒙层: 'rgba(10,9,14,.72)'
        },
        light: {
          bg: '#f6f4fb', bg2: '#efeaf8', card: '#ffffff',
          ink: '#221f2b', ink2: '#4b4560', ink3: '#8b8499', line: 'rgba(30,20,60,.09)',
          taBg: 'rgba(124,92,255,.13)', taInk: '#2b2450',
          meBg: '#7c5cff', meInk: '#ffffff',
          sys: '#9a93a8', field: '#ffffff', fieldLine: 'rgba(30,20,60,.14)',
          accent: '#6b4ce6', noteBg: 'rgba(124,92,255,.09)', hit: 'rgba(245,158,11,.3)',
          旁注: 'rgba(246,244,251,.97)', 空场: '#e8e3f2', 蒙层: 'rgba(30,24,45,.35)'
        }
      };
      const LABELS = {
        bg: '房间底色', bg2: '顶栏 / 输入栏底色', card: '弹层底色',
        ink: '正文文字', ink2: '标题 / 次要文字', ink3: '提示文字',
        taBg: 'TA 气泡底色', taInk: 'TA 气泡文字',
        meBg: '我的气泡底色', meInk: '我的气泡文字',
        accent: '强调色（按钮 / 进度）',
        旁注: '顶栏底色', 空场: '视频区留白', 蒙层: '遮罩'
      };
      const SWATCH_GROUPS = [
        { t: '底色', keys: ['bg', 'bg2', 'card', '旁注', '空场', '蒙层'] },
        { t: '文字', keys: ['ink', 'ink2', 'ink3'] },
        { t: '气泡', keys: ['taBg', 'taInk', 'meBg', 'meInk'] },
        { t: '强调', keys: ['accent'] }
      ];
      const SWATCHES = [
        { color: '#7c5cff', label: '主紫' }, { color: '#111111', label: '黑' }, { color: '#ffffff', label: '白' },
        { color: '#07c160', label: '绿' }, { color: '#fa5151', label: '红' }, { color: '#3a8ee6', label: '蓝' },
        { color: '#ff9500', label: '橙' }, { color: '#f6f4fb', label: '米白' }, { color: '#1b1926', label: '深灰紫' },
        { color: '#f5f3ff', label: '浅紫白' }
      ];

      function colorOf(k) {
        const sk = skinGet();
        const t = theme();
        const my = sk[k] && sk[k][t];
        return my || PRESET[t][k] || '#000';
      }
      function isCustom(k) { const sk = skinGet(); return !!(sk[k] && sk[k][theme()]); }

      // ---------- 应用 ----------
      function apply() {
        const t = theme();
        const root = document.documentElement;
        const bgUrl = g('room-bg', '');
        const bgOp = Math.max(0, Math.min(100, parseInt(g('room-bg-op', '100'), 10) || 100));
        const fit = g('room-bg-fit', 'cover');
        const size = fit === 'contain' ? 'contain' : fit === 'repeat' ? 'auto' : fit === 'stretch' ? '100% 100%' : 'cover';
        Object.keys(PRESET[t]).forEach(function (p) {
          root.style.setProperty('--rs-' + p, colorOf(p));
        });
        root.setAttribute('data-room-theme', t);
        if (bgUrl) {
          root.style.setProperty('--rs-img', 'url("' + bgUrl + '")');
          root.style.setProperty('--rs-img-op', String((bgOp / 100).toFixed(2)));
          root.style.setProperty('--rs-img-size', size);
          root.style.setProperty('--rs-img-repeat', fit === 'repeat' ? 'repeat' : 'no-repeat');
          root.setAttribute('data-room-has-bg', '1');
        } else {
          root.style.removeProperty('--rs-img');
          root.style.removeProperty('--rs-img-op');
          root.style.removeProperty('--rs-img-size');
          root.style.removeProperty('--rs-img-repeat');
          root.removeAttribute('data-room-has-bg');
        }
        // 大图（>200KB）会被 store 放进 IDB，刷新后首次读取可能还没回来：等它回来再算一遍
        try { const st = curStore(); if (st && st.awaitingBigKey && st.awaitingBigKey('room-bg')) setTimeout(apply, 400); } catch (e) {}
      }
      window.roomSkinApply = apply;
      window.roomSkinTheme = theme;

      // ---------- 抽屉 ----------
      let drawer = null;
      function host() { return document.querySelector('.phone') || document.body; }

      function build() {
        if (drawer) return;
        drawer = document.createElement('div');
        drawer.id = DRAWER_ID;
        drawer.className = 'rs-drawer';
        drawer.hidden = true;
        drawer.innerHTML =
          '<div class="rs-hd"><div class="rs-hd-t">房间美化</div><button class="rs-x" type="button" title="关闭">✕</button></div>' +
          '<div class="rs-body"></div>';
        host().appendChild(drawer);
        drawer.querySelector('.rs-x').addEventListener('click', close);
        drawer.addEventListener('click', function (e) { if (e.target === drawer) return; });
        render();
      }

      function open() {
        build();
        drawer.hidden = false;
        render();
      }
      function close() { if (drawer) drawer.hidden = true; }
      window.roomSkinOpen = open;

      function esc(x) {
        return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
      }

      function render() {
        if (!drawer) return;
        const body = drawer.querySelector('.rs-body');
        const t = theme();
        body.innerHTML =
          '<div class="rs-sec rs-pv-sec"><div class="rs-sec-t">预览</div>' +
            '<div class="rs-pv">' +
              '<div class="rs-pv-top">' +
                '<span class="rs-pv-back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>退出</span>' +
                '<div class="rs-pv-tt"><div class="rs-pv-title">一起看</div><div class="rs-pv-sub">第 3 集 · 1:24:07</div></div>' +
                '<span class="rs-pv-more"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></span>' +
              '</div>' +
              '<div class="rs-pv-stage">片源在这里</div>' +
              '<div class="rs-pv-bar">' +
                '<span class="rs-pv-play"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>' +
                '<span class="rs-pv-prog"><i></i></span>' +
                '<span class="rs-pv-time">32:15 / 1:24:07</span>' +
                '<span class="rs-pv-say">TA 说点什么</span>' +
              '</div>' +
              '<div class="rs-pv-chat">' +
                '<div class="rs-pv-m ta">这段配乐一响我就绷不住了。</div>' +
                '<div class="rs-pv-m me">我也，镜头一转直接破防。</div>' +
                '<div class="rs-pv-m sys">TA 把进度往回拖了 10 秒</div>' +
                '<div class="rs-pv-m ta">刚才那句台词，你听见了吗？</div>' +
              '</div>' +
              '<div class="rs-pv-in">' +
                '<span class="rs-pv-input"><span>说点什么…</span></span>' +
                '<span class="rs-pv-send">发送</span>' +
              '</div>' +
            '</div>' +
            '<div class="rs-pv-hint">改哪个颜色这里就跟着变；背景图、不透明度、铺满方式也是即时生效。</div>' +
          '</div>' +
          '<div class="rs-sec"><div class="rs-sec-t">模式</div>' +
            '<div class="rs-modes">' +
              '<button class="rs-mode' + (t === 'dark' ? ' on' : '') + '" data-mode="dark" type="button"><i>🌙</i>黑夜</button>' +
              '<button class="rs-mode' + (t === 'light' ? ' on' : '') + '" data-mode="light" type="button"><i>☀️</i>白天</button>' +
            '</div>' +
            '<div class="rs-hint">改的是下面「黑夜 / 白天」各自那一套颜色，切模式不会把另一套弄乱。</div>' +
          '</div>' +
          '<div class="rs-sec"><div class="rs-sec-t">背景图片</div>' +
            '<div class="rs-rows">' +
              '<div class="rs-row" data-act="bg-upload"><div class="rs-r-t">上传背景图</div><div class="rs-r-v">' + (g('room-bg', '') ? '已设置' : '未设置') + '</div></div>' +
              (g('room-bg', '') ? '<div class="rs-row" data-act="bg-remove"><div class="rs-r-t">移除背景图</div></div>' : '') +
              '<div class="rs-row" data-act="bg-op"><div class="rs-r-t">背景不透明度</div><div class="rs-r-v">' + g('room-bg-op', '100') + '%</div></div>' +
              '<div class="rs-row" data-act="bg-fit"><div class="rs-r-t">铺满方式</div><div class="rs-r-v">' + ({ cover: '铺满裁剪', contain: '完整显示', repeat: '平铺', stretch: '拉伸填满' }[g('room-bg-fit', 'cover')] || '铺满裁剪') + '</div></div>' +
            '</div>' +
            '<div class="rs-hint">图片会铺满整个房间（顶栏、对话、阅读区都半透明压在上面）。压得太花就调低不透明度。</div>' +
          '</div>' +
          SWATCH_GROUPS.map(function (grp) {
            return '<div class="rs-sec"><div class="rs-sec-t">' + grp.t + '颜色</div><div class="rs-rows">' +
              grp.keys.map(function (k) {
                const c = colorOf(k);
                return '<div class="rs-row" data-act="color" data-key="' + k + '"><div class="rs-r-t">' + esc(LABELS[k] || k) + (isCustom(k) ? '<span class="rs-cus">自定义</span>' : '') + '</div>' +
                  '<div class="rs-sw" style="background:' + esc(c) + '"></div></div>';
              }).join('') +
              '</div></div>';
          }).join('') +
          '<div class="rs-sec"><div class="rs-actions">' +
            '<button class="rs-act rs-reset" type="button">当前模式恢复默认</button>' +
            '<button class="rs-act rs-reset-all" type="button">两种模式全部恢复</button>' +
          '</div></div>';

        body.querySelectorAll('[data-mode]').forEach(function (b) {
          b.addEventListener('click', function () {
            s('room-theme', b.dataset.mode);
            apply();
            render();
            toast(b.dataset.mode === 'light' ? '已切到白天模式' : '已切到黑夜模式');
          });
        });
        body.querySelector('[data-act="bg-upload"]').addEventListener('click', pickBg);
        const rmBtn = body.querySelector('[data-act="bg-remove"]');
        if (rmBtn) rmBtn.addEventListener('click', function () { rm('room-bg'); apply(); render(); toast('已移除房间背景图'); });
        body.querySelector('[data-act="bg-op"]').addEventListener('click', function () {
          if (!window.openModal) return;
          window.openModal('背景不透明度', '', function (v) {
            s('room-bg-op', String(Math.max(0, Math.min(100, parseInt(v, 10) || 0))));
            apply(); render();
          }, {
            noInput: true,
            slider: { min: 0, max: 100, step: 5, value: parseInt(g('room-bg-op', '100'), 10) || 100, unit: '%', label: '100% 原图 · 越低字越清楚' },
            pills: [{ label: '30%', value: '30' }, { label: '60%', value: '60' }, { label: '100%', value: '100' }]
          });
        });
        body.querySelector('[data-act="bg-fit"]').addEventListener('click', function () {
          if (!window.openModal) return;
          window.openModal('铺满方式', '', function (v) {
            if (['cover', 'contain', 'repeat', 'stretch'].indexOf(v) < 0) return;
            s('room-bg-fit', v); apply(); render();
          }, {
            noInput: true, pill: g('room-bg-fit', 'cover'),
            pills: [{ label: '铺满裁剪', value: 'cover' }, { label: '完整显示', value: 'contain' }, { label: '平铺', value: 'repeat' }, { label: '拉伸填满', value: 'stretch' }]
          });
        });
        body.querySelectorAll('[data-act="color"]').forEach(function (rowEl) {
          rowEl.addEventListener('click', function () { openColor(rowEl.dataset.key); });
        });
        body.querySelector('.rs-reset').addEventListener('click', function () {
          const sk = skinGet();
          SWATCH_GROUPS.forEach(function (gr) { gr.keys.forEach(function (k) { if (sk[k]) delete sk[k][theme()]; }); });
          skinSet(sk); apply(); render(); toast('当前模式已恢复默认色');
        });
        body.querySelector('.rs-reset-all').addEventListener('click', function () {
          rm('room-skin'); apply(); render(); toast('两种模式的颜色都已恢复默认');
        });
      }

      function openColor(k) {
        if (!window.openModal) return;
        const cur = colorOf(k);
        window.openModal((LABELS[k] || k) + '（' + (theme() === 'light' ? '白天' : '黑夜') + '）', '', function (v) {
          const color = (typeof v === 'number' && SWATCHES[v]) ? SWATCHES[v].color : v;
          if (!color) return;
          const sk = skinGet();
          sk[k] = sk[k] || {};
          sk[k][theme()] = color;
          skinSet(sk);
          apply(); render();
        }, {
          colorPicker: true,
          color: cur,
          swatches: SWATCHES
        });
      }

      // ---------- 背景图上传 ----------
      let bgInput = null;
      function pickBg() {
        if (!bgInput) {
          bgInput = document.createElement('input');
          bgInput.type = 'file';
          bgInput.accept = 'image/*';
          bgInput.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
          document.body.appendChild(bgInput);
          bgInput.addEventListener('change', onBg);
        }
        bgInput.value = '';
        try { bgInput.click(); } catch (e) { toast('这台设备不支持选图片'); }
      }
      function onBg() {
        const f = bgInput && bgInput.files && bgInput.files[0];
        if (!f) return;
        if (!window.mochiImgIngest) { toast('图片处理组件没加载上，请重新打开页面再试'); return; }
        toast('正在处理图片…');
        window.mochiImgIngest(f, { maxSide: 1440, quality: 0.82, tag: 'room-bg' }).then(function (r) {
          if (!r || r.st !== 'ok' || !r.data) { toast((window.mochiImgIngestMiss ? window.mochiImgIngestMiss(r, '图片') : '图片读取失败')); return; }
          s('room-bg', r.data);
          apply(); render();
          toast('背景图已换上');
        });
      }

      // 切联系人 / 桌面恢复后重算一遍（样式是按桌面各自存的）
      ['contact-switched', 'mochi-restore-done', 'mochi-wrj-heal'].forEach(function (ev) {
        document.addEventListener(ev, function () { try { apply(); } catch (e) {} });
      });
      document.addEventListener('contact-switched', function () { if (drawer) close(); });

      function boot() { try { apply(); } catch (e) {} }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
      else boot();

      if (window.__mochiLoaded) window.__mochiLoaded.push('room-skin.js');
    })();
  } catch (__e) {
    if (window.__mochiErrLoaded) window.__mochiErrLoaded.push('room-skin.js');
    try { console.error('[JS] room-skin.js', __e && __e.message || __e); } catch (x) {}
    if (window.__jsErrors) window.__jsErrors.push('[room-skin.js] ' + String(__e && __e.message || __e));
  }
})();
