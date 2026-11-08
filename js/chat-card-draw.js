/* 私人六改 · TA 回涂鸦
 *
 * 你发一张涂鸦后，按概率（聊天设置 → 功能 → 互动设置 →「TA 回涂鸦概率」，默认 30%）
 * TA 会随机回一张小涂鸦 + 一句配文。
 *
 * 依赖：
 *   chat-draw.js   window.chatDrawIncomingMake()  生成随机涂鸦图（dataURL）
 *                  window.chatDrawReplyProb()     读回图概率
 *   chat.js        window.chatAddIn(text, opts)   以「收到」身份插入一条消息
 *                  window.getInteractPool(name, fallback) / window.pickAskCardReply(pool)
 *
 * 导出的接口：
 *   window.chatDrawTaReply()   立刻让 TA 回一张（涂鸦面板发送后自动按概率调用）
 */
(function () {
  try {
    (function () {
      'use strict';

      const captions = [
        '我也画了一张，有点丑别笑。',
        '看，还给你一张。',
        '画得没你好，但心意到了。',
        '喏，我也涂了一个。',
        '嘿嘿，比一下谁画得好。',
        '这张送你，收好。'
      ];

      function pickLine() {
        try {
          if (window.getInteractPool && window.pickAskCardReply) {
            const pool = window.getInteractPool('涂鸦·回应', captions);
            if (Array.isArray(pool) && pool.length) return window.pickAskCardReply(pool);
          }
        } catch (e) {}
        return captions[Math.floor(Math.random() * captions.length)];
      }

      window.chatDrawTaReply = function () {
        try {
          if (!window.chatDrawIncomingMake) return false;
          if (window.chatDrawEnabled && !window.chatDrawEnabled()) return false;
          const img = window.chatDrawIncomingMake();
          if (!img) return false;
          let name = '';
          try { name = window.chatPartnerName ? String(window.chatPartnerName() || '') : ''; } catch (e) {}
          const line = pickLine();
          const txt = name ? (name + ' 发来一张涂鸦：' + line) : ('TA 发来一张涂鸦：' + line);
          if (!window.chatAddIn) return false;
          const rec = window.chatAddIn(txt, {
            type: 'draw',
            draw: img,
            drawLetters: 0,
            initiative: true,
            silent: false,
            rateAllow: true,
            nightAllow: false
          });
          // chatAddIn 内部只透传白名单字段；draw 不在白名单里，这里补一刀（同一对象引用）
          if (rec) {
            if (!rec.draw) rec.draw = img;
            if (!rec.type) rec.type = 'draw';
            try { if (window.chatFlushSave) window.chatFlushSave(); } catch (e) {}
          }
          return !!rec;
        } catch (e) {
          return false;
        }
      };

      if (window.__mochiLoaded) window.__mochiLoaded.push('chat-card-draw.js');
    })();
  } catch (__e) {
    if (window.__mochiErrLoaded) window.__mochiErrLoaded.push('chat-card-draw.js');
    try { console.error('[JS] chat-card-draw.js', (__e && __e.message) || __e); } catch (x) {}
    if (window.__jsErrors) window.__jsErrors.push('[chat-card-draw.js] ' + String((__e && __e.message) || __e));
  }
})();
