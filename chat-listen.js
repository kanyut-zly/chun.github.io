/* 私人六改 · 「一起听」聊天卡片
 *
 * 用户选择：一起看 / 一起读先不做，只做「一起听」，形态＝聊天里的卡片。
 *
 * 做法：复用 music-player.js 已有的 inviteTaToListen(trackId)——它已经实现了
 * 「我邀请 TA → TA 按 60% 同意 / 25% 拒绝 / 15% 换一首 回应 → 开始播放」整套逻辑。
 * 我们只补两件事：
 *   ① 把「邀请」做成聊天里的一张卡片（而不是藏在音乐库的歌曲菜单里）；
 *   ② 卡片上带「一起听 / 换一首」按钮，并显示 TA 的回应结果。
 *
 * 消息字段：
 *   type: 'listen'
 *   listenTrackId / listenName / listenArtist
 *   listenStatus: 'pending' | 'accepted' | 'refused' | 'switched'
 *   listenReply: TA 的回应文字（接受/拒绝后回填）
 *
 * 对外：
 *   window.chatListenOpenPicker()   打开歌曲选择 → 发送邀请卡片
 *   window.chatListenCardHtml(rec)  卡片 HTML（chat.js 渲染用）
 *   window.chatListenCardBind(el, rec)
 *   window.chatListenMark(trackId, status, reply)  写回卡片状态（music-player 调用）
 */
(function () {
  try {
    (function () {
      'use strict';

      const store = (function () {
        try { return window.activeStore ? window.activeStore() : window.storeFor('default'); } catch (e) { return null; }
      })();

      function toast(m) { try { if (window.toast) window.toast(m); } catch (e) {} }
      function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
      }
      function songIcon() {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
      }

      // ---------- 读歌曲库（优先走 music-player 导出的 musicListTracks；老版本从存储兜底） ----------
      function readLibrary() {
        try {
          if (window.musicListTracks) {
            const arr = window.musicListTracks();
            if (Array.isArray(arr) && arr.length) return arr;
          }
        } catch (e) {}
        const keys = ['music-library', 'music-lib', 'music-tracks'];
        for (let i = 0; i < keys.length; i++) {
          try {
            const raw = store ? store.get(keys[i]) : null;
            if (!raw) continue;
            const arr = JSON.parse(raw);
            if (Array.isArray(arr) && arr.length) return arr.filter(function (m) { return m && m.id && m.name; });
          } catch (e) {}
        }
        return [];
      }

      // ---------- 卡片 ----------
      const stateLabel = {
        pending: '等待 TA 回应…',
        accepted: '一起在听了',
        refused: 'TA 这次没答应',
        switched: 'TA 想换一首'
      };

      window.chatListenCardHtml = function (rec) {
        if (!rec) return '';
        const name = rec.listenName || '';
        const artist = rec.listenArtist || '';
        const st = rec.listenStatus || 'pending';
        const reply = rec.listenReply || '';
        const done = st === 'accepted' || st === 'refused';
        return '' +
          '<div class="msg-listen' + (st === 'accepted' ? ' ok' : '') + (st === 'refused' ? ' no' : '') + '">' +
            '<div class="ml-ico">' + songIcon() + '</div>' +
            '<div class="ml-main">' +
              '<div class="ml-kicker">一起听</div>' +
              '<div class="ml-name">' + esc(name || '—') + '</div>' +
              (artist ? '<div class="ml-artist">' + esc(artist) + '</div>' : '') +
              '<div class="ml-state">' + esc(reply || stateLabel[st] || '') + '</div>' +
            '</div>' +
            (done ? '' :
              '<div class="ml-acts">' +
                '<button type="button" class="ml-btn ml-join" data-act="join">' + (st === 'switched' ? '听这首' : '一起听') + '</button>' +
                '<button type="button" class="ml-btn ml-swap" data-act="swap">换一首</button>' +
              '</div>') +
          '</div>';
      };

      window.chatListenCardBind = function (el, rec) {
        if (!el || !rec) return;
        el.querySelectorAll('.ml-btn').forEach(function (btn) {
          if (btn.__mlBound) return;
          btn.__mlBound = 1;
          btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const act = btn.getAttribute('data-act');
            if (act === 'join') {
              // 接受邀请＝直接开始听
              try {
                let ok = false;
                if (window.musicPlayById) ok = window.musicPlayById(rec.listenTrackId);
                if (!ok && window.inviteTaToListen) { window.inviteTaToListen(rec.listenTrackId); return; }
                if (!ok) { toast('音乐模块还没就绪'); return; }
                setTimeout(function () {
                  mark(rec.listenTrackId, 'accepted', '好呀，一起听。');
                }, 2200);
              } catch (er) { toast('播放失败'); }
            } else if (act === 'swap') {
              openPicker();
            }
          });
        });
      };

      // ---------- 选歌并发送邀请卡片 ----------
      function openPicker() {
        if (!window.openModal) { toast('弹窗还没准备好'); return; }
        const lib = readLibrary();
        if (!lib.length) {
          toast('音乐库里还没有歌，先去「音乐」里导入一首吧');
          return;
        }
        const pills = lib.slice(0, 40).map(function (m) {
          return { label: (m.name || '未命名') + (m.artist ? ' · ' + m.artist : ''), value: String(m.id) };
        });
        window.openModal('和 TA 一起听哪首？', '', function (v) {
          const id = String(v || '');
          const m = lib.find(function (x) { return String(x.id) === id; });
          if (!m) { toast('请先选一首歌'); return; }
          sendInvite(m);
        }, {
          noInput: true,
          pills: pills,
          scrollPills: true,
          pillSubmit: true,
          big: true
        });
      }

      let invitePending = false;
      function sendInvite(m) {
        if (invitePending) { toast('刚才那条还在等 TA 回'); return; }
        if (!window.chatAddGift) { toast('聊天暂不可用'); return; }
        invitePending = true;
        const rec = {
          side: 'out',
          type: 'listen',
          text: '[一起听] ' + (m.name || '') + (m.artist ? ' - ' + m.artist : ''),
          listenTrackId: m.id,
          listenName: m.name || '',
          listenArtist: m.artist || '',
          listenStatus: 'pending',
          listenReply: '',
          ts: Date.now(),
          dedupExempt: true
        };
        window.chatAddGift(rec);
        try { if (window.chatFlushSave) window.chatFlushSave(); } catch (e) {}
        // 把 TA 的回应挂到 music-player 的 inviteTaToListen 上：它会自己弹「TA 想邀请你…」
        // 面板并写系统消息；我们只负责在面板之后把卡片状态写回。
        try {
          if (window.inviteTaToListen) {
            window.inviteTaToListen(m.id);
            // 观察 TA 的回应：music-player 会在 4s 内给出结果，这里拉一段时间看系统消息
            watchOutcome(m);
          } else {
            setTimeout(function () {
              const ok = Math.random() < 0.6;
              mark(m.id, ok ? 'accepted' : 'refused', ok ? '好呀，一起听。' : '这首现在不想听嘛，待会儿再听好不好？');
              invitePending = false;
            }, 1600);
          }
        } catch (e) {}
        setTimeout(function () { invitePending = false; }, 6000);
      }

      // 轮询最近消息，找到 TA 对这次邀请的回应（同意 / 没答应 / 想换一首）
      let watchTimer = null;
      function watchOutcome(m) {
        if (watchTimer) clearTimeout(watchTimer);
        const startedAt = Date.now();
        const tick = function () {
          let done = false;
          try {
            const arr = (window.getChatMsgs && window.getChatMsgs()) || [];
            for (let i = arr.length - 1; i >= Math.max(0, arr.length - 40); i--) {
              const r = arr[i];
              if (!r || (r.ts || 0) < startedAt - 1500) break;
              const t = String(r.text || '');
              if (r.side !== 'in') continue;
              if (t.indexOf('没答应') >= 0 || t.indexOf('拒绝了') === 0) {
                mark(m.id, 'refused', '这首现在不想听嘛，待会儿再听好不好？');
                done = true; break;
              }
              if (t.indexOf('想换') >= 0 || t.indexOf('换一首') >= 0) {
                mark(m.id, 'switched', '这首听腻啦，换一首嘛～');
                done = true; break;
              }
              if (t.indexOf('一起听') >= 0 || t.indexOf('同意了') >= 0 || t.indexOf('接受了') >= 0) {
                mark(m.id, 'accepted', '好呀，一起听。');
                done = true; break;
              }
            }
          } catch (e) {}
          if (done) return;
          if (Date.now() - startedAt > 8000) { watchTimer = null; return; }
          watchTimer = setTimeout(tick, 900);
        };
        watchTimer = setTimeout(tick, 1200);
      }

      // 写回卡片（同首同状态的最近一条）
      function mark(trackId, status, reply) {
        try {
          if (!window.getChatMsgs) return;
          const arr = window.getChatMsgs() || [];
          for (let i = arr.length - 1; i >= 0; i--) {
            const r = arr[i];
            if (!r || r.type !== 'listen') continue;
            if (String(r.listenTrackId) !== String(trackId)) continue;
            if (r.listenStatus === 'accepted' || r.listenStatus === 'refused') break;
            r.listenStatus = status;
            r.listenReply = reply || '';
            try { if (window.chatFlushSave) window.chatFlushSave(); } catch (e) {}
            try { if (window.chatRepaintOne) window.chatRepaintOne(arr.indexOf(r)); } catch (e) {}
            break;
          }
        } catch (e) {}
      }
      window.chatListenMark = mark;

      window.chatListenOpenPicker = openPicker;

      if (window.__mochiLoaded) window.__mochiLoaded.push('chat-listen.js');
    })();
  } catch (__e) {
    if (window.__mochiErrLoaded) window.__mochiErrLoaded.push('chat-listen.js');
    try { console.error('[JS] chat-listen.js', (__e && __e.message) || __e); } catch (x) {}
    if (window.__jsErrors) window.__jsErrors.push('[chat-listen.js] ' + String((__e && __e.message) || __e));
  }
})();
