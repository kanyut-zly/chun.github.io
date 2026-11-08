/* 私人七改 · 世界感知（并进「此间」，不单开一页）
 *
 * 想法来自言字卡（小红书 / 抖音 @言序）的「世界感知」：看 TA 那边此刻的样子。
 * 这里不照搬人家那一套页面，只留我们缺的那几样，接到 mochi 既有的「此间」详情页里——
 *
 * 为什么并进此间：
 *   · 此间已经在管「TA 那边几点、哪一段天、在做什么」；
 *   · 寻踪管的是「TA 在你这个世界里的位置」（我们身边的查岗/打卡）；
 *   · 单开一页会跟这两处三头重复，所以只补缺的：天气、远近、方位、这条线通不通。
 *
 * 放在哪：此间 → 点某位梦角 → 详情页，就在「在做什么 / 在哪」那排小标下面。
 *   下面原本那条「TA的今日」十二时辰照旧，一点不动。
 *
 * 数据（xy-home-v2 根库，全局一份；各梦角按「名字+所属桌面」各自滚一份）：
 *   ws-en            '1' / '0'   开关（设置 → 桌面 → 世界感知），默认开
 *   ws-roll-<hash>   JSON        { day, wx, dist, dir, t } 当天的读数（再感知改 dir）
 *
 * 全是本机算出来的模糊感觉，不联网、不定位、不读任何真实天气接口。
 */
(function () {
  try {
    (function () {
      'use strict';

      const GNS = 'xy-home-v2';
      const K_EN = 'ws-en';
      const CARD_ID = 'ws-card';
      const BODY_ID = 'cj-detail-body';

      const WX = [
        { k: '晴', p: 22, w: 1, say: '那边应该是晴天', sayNight: '今晚的星星大概看得很清楚' },
        { k: '多云', p: 22, w: 0, say: '那边的云应该不少' },
        { k: '阴', p: 14, w: -1, say: '那边天有点阴' },
        { k: '小雨', p: 16, w: -2, say: '那边大概在下小雨' },
        { k: '阵雨', p: 10, w: -1, say: '那边可能一阵一阵地下' },
        { k: '雷阵雨', p: 6, w: 0, say: '那边说不定在打雷' },
        { k: '雾', p: 5, w: -2, say: '那边起了雾' },
        { k: '雪', p: 5, w: -7, say: '那边在下雪', winterOnly: true }
      ];
      const DIST = [
        { km: '不到 1 公里', label: '就在身边', p: 14 },
        { km: '几公里', label: '同一个城市', p: 24 },
        { km: '几十公里', label: '一小时车程', p: 25 },
        { km: '几百公里', label: '隔着一片山', p: 18 },
        { km: '上千公里', label: '隔着一片海', p: 13 },
        { km: '', label: '远得算不清', p: 6 }
      ];
      const DIRS = ['正东', '东北', '正北', '西北', '正西', '西南', '正南', '东南'];
      // 北半球的大致月均温，只用来给一个说得过去的体感
      const BASE_T = [2, 4, 9, 15, 21, 25, 28, 28, 24, 18, 10, 4];

      function root() { try { return window.xyStore ? window.xyStore(GNS) : null; } catch (e) { return null; } }
      function g(k, def) {
        try { const s = root(); const v = s ? s.get(k) : null; return v === null || v === undefined || v === '' ? def : v; }
        catch (e) { return def; }
      }
      function s(k, v) { try { const st = root(); if (st) st.set(k, v); } catch (e) {} }

      window.worldSenseEnabled = function () { return g(K_EN, '1') !== '0'; };

      // ---------- 小工具 ----------
      function h32(str) {
        let h = 2166136261;
        for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
        return h >>> 0;
      }
      function rng(seed) {
        let a = seed >>> 0;
        return function () {
          a = (a + 0x6D2B79F5) >>> 0;
          let t = a;
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      }
      function dayKey(d) {
        d = d || new Date();
        return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
      }
      function toast(msg) { try { if (window.toast) window.toast(msg); } catch (e) {} }
      function esc(x) {
        return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
      }
      function taFit(txt) {
        try { return window.taFit ? window.taFit(String(txt), window.__activeCid || 'default') : String(txt); }
        catch (e) { return String(txt); }
      }

      // ---------- 今天这一份读数 ----------
      function rollFor(seedStr) {
        const h = 'ws-roll-' + h32(seedStr).toString(36);
        const day = dayKey();
        let saved = null;
        try { saved = JSON.parse(g(h, 'null') || 'null'); } catch (e) { saved = null; }
        if (saved && saved.day === day && typeof saved.wx === 'number') return { key: h, data: saved };

        // 没有就滚一份：同一个种子同一天只滚一次，之后一直稳定
        const r = rng(h32(seedStr + '|' + day));
        const month = new Date().getMonth();
        const winter = month === 11 || month === 0 || month === 1;
        const wxList = WX.map(function (w) { return { p: w.winterOnly && !winter ? 0 : w.p }; });
        let wx = 0, roll = r() * wxList.reduce(function (a, x) { return a + x.p; }, 0);
        for (let i = 0; i < wxList.length; i++) { roll -= wxList[i].p; if (roll < 0) { wx = i; break; } }
        // 远近也要走同一个种子，不然清掉缓存再滚一次会换一个地方
        let dist = 0, droll = r() * DIST.reduce(function (a, x) { return a + x.p; }, 0);
        for (let i = 0; i < DIST.length; i++) { droll -= DIST[i].p; if (droll < 0) { dist = i; break; } }
        const data = { day: day, wx: wx, dist: dist, dir: Math.floor(r() * 8), t: Date.now() };
        try { s(h, JSON.stringify(data)); } catch (e) {}
        return { key: h, data: data };
      }
      function saveRoll(key, data) { try { s(key, JSON.stringify(data)); } catch (e) {} }

      // ---------- 连接：读一眼最近说话的尾巴（只读，不写聊天） ----------
      function tailOf(cid) {
        try {
          const st = window.storeForCid ? window.storeForCid(cid || 'default') : window.activeStore();
          return JSON.parse((st && st.get('chat-tail')) || '[]');
        } catch (e) { return []; }
      }
      function connection(cid) {
        const arr = (tailOf(cid) || []).filter(function (m) { return m && m.ts; });
        if (!arr.length) return { text: '这边还没说过话', tone: 'quiet' };
        const d = new Date();
        const day0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        let mine = 0, ta = 0;
        arr.forEach(function (m) { if ((m.ts || 0) >= day0) { if (m.side === 'out') mine++; else ta++; } });
        const last = arr[arr.length - 1];
        const mins = Math.max(0, Math.round((Date.now() - (last.ts || 0)) / 60000));
        let when;
        if (mins < 5) when = '刚刚还在说';
        else if (mins < 60) when = mins + ' 分钟前说过话';
        else if (mins < 60 * 12) when = Math.round(mins / 60) + ' 小时前说过话';
        else when = '已经隔了一天多';
        const who = last.side === 'out' ? '最后是你说' : '最后是 TA 说';
        const today = (mine || ta) ? '今天你 ' + mine + ' 句 / TA ' + ta + ' 句 · ' : '';
        return { text: today + who + ' · ' + when, tone: mins < 10 ? 'live' : (mins > 60 * 12 ? 'quiet' : '') };
      }

      // ---------- 卡片 ----------
      function detailCid() {
        try {
          const src = document.querySelector('#cj-detail .cj-d-src');
          const m = src && /来自「(.+?)」的此间/.exec(src.textContent || '');
          if (m && window.getContacts) {
            const hit = (window.getContacts() || []).find(function (c) { return c && c.name === m[1]; });
            if (hit) return hit.id;
          }
        } catch (e) {}
        return window.__activeCid || 'default';
      }
      function detailName() {
        try {
          const n = document.querySelector('#cj-detail .cj-d-name');
          return (n && n.textContent || '').trim();
        } catch (e) { return ''; }
      }

      function cardHTML(d, cid) {
        const wx = WX[d.wx] || WX[0];
        const dist = DIST[d.dist] || DIST[0];
        const hour = new Date().getHours();
        const night = hour >= 21 || hour < 6;
        // 距离越远，方位越容易读不清；同一天同一读数只看同一个结果（重画不会变）
        const blind = Math.min(0.62, 0.08 + (d.dist || 0) * 0.11);
        const dirSeed = h32(String(d.day) + '|' + String(d.wx) + '|' + String(d.dist) + '|' + String(d.dir)) % 1000;
        const dirTxt = (dirSeed / 1000) < blind ? '读不太清' : '在你' + DIRS[d.dir];
        const base = BASE_T[new Date().getMonth()] || 20;
        const lo = base - 5 + wx.w;
        const hi = base + 1 + wx.w;
        const conn = connection(cid);
        const say = night && wx.sayNight ? wx.sayNight : wx.say;
        return '' +
          '<div class="ws-card" id="' + CARD_ID + '">' +
            '<div class="ws-head">' +
              '<span class="ws-title">世界感知</span>' +
              '<button type="button" class="ws-refresh" id="ws-refresh">再感知一次</button>' +
            '</div>' +
            '<div class="ws-row"><span class="ws-k">那边天气</span><span class="ws-v"><b>' + esc(wx.k) + '</b> · ' + lo + '~' + hi + '° <i>' + esc(say) + '</i></span></div>' +
            '<div class="ws-row"><span class="ws-k">离你</span><span class="ws-v">' + esc(dist.label) + (dist.km ? ' · 大约 ' + esc(dist.km) : '') + '</span></div>' +
            '<div class="ws-row"><span class="ws-k">方位</span><span class="ws-v">' + esc(dirTxt) + '</span></div>' +
            '<div class="ws-row"><span class="ws-k">连接</span><span class="ws-v' + (conn.tone ? ' ws-' + conn.tone : '') + '">' + esc(taFit(conn.text)) + '</span></div>' +
            '<div class="ws-foot">这些只是模糊的感觉，不是定位，也不来自真实天气。</div>' +
          '</div>';
      }

      let injecting = false;
      function inject() {
        if (injecting) return;
        if (!window.worldSenseEnabled()) { removeCard(); return; }
        const det = document.getElementById('cj-detail');
        const body = document.getElementById(BODY_ID);
        if (!det || det.hidden || !body) return;
        if (body.querySelector('#' + CARD_ID)) return;

        const name = detailName();
        if (!name) return;
        const cid = detailCid();
        const seed = cid + '|' + name;
        const rolled = rollFor(seed);
        const d = rolled.data;

        injecting = true;
        try {
          const wrap = document.createElement('div');
          wrap.innerHTML = cardHTML(d, cid);
          const card = wrap.firstChild;
          // 插在「在做什么」那排小标下面；找不到就放在大时间下面
          const tags = body.querySelector('.cj-card-tags');
          const anchor = tags || body.querySelector('.cj-d-range');
          if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(card, anchor.nextSibling);
          else body.insertBefore(card, body.firstChild);

          const btn = card.querySelector('#ws-refresh');
          if (btn) btn.addEventListener('click', function (ev) {
            ev.stopPropagation();
            reroll(cid, seed, card);
          });
        } finally { injecting = false; }
      }
      function reroll(cid, seed, cardEl) {
        const rolled = rollFor(seed);
        const d = rolled.data;
        d.dir = Math.floor(Math.random() * 8);
        d.t = Date.now();
        saveRoll(rolled.key, d);
        const wrap = document.createElement('div');
        wrap.innerHTML = cardHTML(d, cid);
        const fresh = wrap.firstChild;
        if (cardEl && cardEl.parentNode) cardEl.parentNode.replaceChild(fresh, cardEl);
        const btn = fresh.querySelector('#ws-refresh');
        if (btn) btn.addEventListener('click', function (ev) {
          ev.stopPropagation();
          reroll(cid, seed, fresh);
        });
        toast('又感知了一下');
      }
      function removeCard() {
        try { const c = document.getElementById(CARD_ID); if (c) c.remove(); } catch (e) {}
      }

      // ---------- 观察此间详情：每次重画都补回去 ----------
      let obs = null;
      function boot() {
        // 开关那一行
        const cb = document.getElementById('ws-en');
        if (cb && !cb.__wsBound) {
          cb.__wsBound = 1;
          cb.checked = window.worldSenseEnabled();
          cb.addEventListener('change', function () {
            s(K_EN, cb.checked ? '1' : '0');
            if (cb.checked) { inject(); toast('世界感知已开启：此间里能看到那边的天气和远近'); }
            else { removeCard(); toast('世界感知已关闭：此间只剩原本的那些'); }
          });
        }
        const host = document.getElementById('cj-detail');
        if (!host) return;
        if (obs) return;
        obs = new MutationObserver(function () { inject(); });
        obs.observe(host, { childList: true, subtree: true });
        inject();
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
      else setTimeout(boot, 0);
      setTimeout(boot, 800);
      setTimeout(boot, 2000);

      // 切联系人：开关状态跟着当前桌面走（读数本身按梦角各滚各的）
      document.addEventListener('contact-switched', function () {
        try {
          const cb = document.getElementById('ws-en');
          if (cb) cb.checked = window.worldSenseEnabled();
          removeCard();
          setTimeout(inject, 60);
        } catch (e) {}
      });

      try { console.log('[世界感知] ready'); } catch (e) {}
    })();
  } catch (e) {
    try { window.__mochiExtFail = (window.__mochiExtFail || []).concat('world-sense.js: ' + (e && e.message)); } catch (e2) {}
  }
})();
