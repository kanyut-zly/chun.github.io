/* 私人七改：开屏密码（部署到公网时的第一道门）
   位置：开屏公告 / 问卷都过了、真正进桌面之前，弹一个「请问?」，
        答对才继续；答对后本机记住，下次不再问（换设备 / 清数据才会再问）。
   密码：只存 SHA-256 摘要（DEFAULT_HASH），源码里没有明文。
   存储（根键，不做跨桌面同步）：
        xy-home-v2:lock-ok     '1' = 这台设备已答对过
        xy-home-v2:lock-en     '0' = 这台设备关掉这道门（默认开）
        xy-home-v2:lock-hash   可选：本机改过密码时存新摘要
   安全边界：纯前端门，挡的是「随手点开网址的人」；会看源码 / 控制台的人
        仍然能绕过（静态站没有服务端）。真正的隐私靠数据只存本机。
*/
(function () {
  'use strict';
  var G = 'xy-home-v2';
  var K_OK = 'lock-ok';
  var K_EN = 'lock-en';
  var K_HASH = 'lock-hash';
  /* sha256('0824') */
  var DEFAULT_HASH = '284d9a101beeb8fbf979d029b25fa49f859739904bfc3a918ecba1c00001b0af';

  /* ---------------- SHA-256（同步，纯 JS，不依赖 https / crypto.subtle） ---------------- */
  var K256 = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  function utf8(s) {
    var out = '', i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c < 0x80) out += String.fromCharCode(c);
      else if (c < 0x800) out += String.fromCharCode(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
      else if (c < 0xD800 || c >= 0xE000) {
        out += String.fromCharCode(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
      } else {
        i++;
        c = 0x10000 + (((c & 0x3FF) << 10) | (s.charCodeAt(i) & 0x3FF));
        out += String.fromCharCode(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 0x3F), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
      }
    }
    return out;
  }
  function sha256(str) {
    var msg = utf8(String(str));
    var bitLen = msg.length * 8;
    msg += '\x80';
    while (msg.length % 64 !== 56) msg += '\x00';
    var hi = Math.floor(bitLen / 0x100000000), lo = bitLen >>> 0;
    msg += String.fromCharCode((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255,
      (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    function rrot(x, n) { return (x >>> n) | (x << (32 - n)); }
    var w = new Array(64), i, j, off;
    for (off = 0; off < msg.length; off += 64) {
      for (i = 0; i < 16; i++) {
        j = off + i * 4;
        w[i] = ((msg.charCodeAt(j) & 255) << 24) | ((msg.charCodeAt(j + 1) & 255) << 16) |
          ((msg.charCodeAt(j + 2) & 255) << 8) | (msg.charCodeAt(j + 3) & 255);
      }
      for (i = 16; i < 64; i++) {
        var s0 = rrot(w[i - 15], 7) ^ rrot(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        var s1 = rrot(w[i - 2], 17) ^ rrot(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = rrot(e, 6) ^ rrot(e, 11) ^ rrot(e, 25);
        var ch = (e & f) ^ ((~e) & g);
        var t1 = (h + S1 + ch + K256[i] + w[i]) | 0;
        var S0 = rrot(a, 2) ^ rrot(a, 13) ^ rrot(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0;
        d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    var out = '';
    for (i = 0; i < 8; i++) out += ('00000000' + (H[i] >>> 0).toString(16)).slice(-8);
    return out;
  }
  window.mochiLockHash = sha256; // 调试/自测用

  /* ---------------- 存储（根键，直接 localStorage，避开联系人迁移） ---------------- */
  function gGet(k) {
    try { return localStorage.getItem(G + ':' + k); } catch (e) { return null; }
  }
  function gSet(k, v) {
    try { localStorage.setItem(G + ':' + k, v); } catch (e) {}
  }
  function enabled() {
    var v = gGet(K_EN);
    return v === null || v === undefined ? true : v === '1';
  }
  function curHash() { return gGet(K_HASH) || DEFAULT_HASH; }
  var memOK = false;
  function isPassed() { return memOK || gGet(K_OK) === '1'; }

  window.mochiLockEnabled = enabled;
  window.mochiLockPassed = function () { return !enabled() || isPassed(); };

  /* ---------------- 锁屏 UI ---------------- */
  var pending = null, shown = false, cooldown = 0, fails = 0;
  function injectStyle() {
    if (document.getElementById('mochi-lock-style')) return;
    var st = document.createElement('style');
    st.id = 'mochi-lock-style';
    st.textContent =
      '#mochi-lock{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;' +
      'background:linear-gradient(160deg,#f7f5fb,#efeaf7 60%,#f9f6f3);font-family:inherit;-webkit-tap-highlight-color:transparent}' +
      '#mochi-lock .ml-card{width:min(86vw,340px);background:#fff;border-radius:22px;padding:28px 22px 20px;' +
      'box-shadow:0 18px 50px rgba(72,52,112,.16);text-align:center;box-sizing:border-box}' +
      '#mochi-lock .ml-card.ml-shake{animation:ml-shake .36s ease}' +
      '@keyframes ml-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(7px)}60%{transform:translateX(-5px)}80%{transform:translateX(3px)}}' +
      '#mochi-lock .ml-title{font-size:24px;font-weight:800;color:#2b2438;letter-spacing:3px}' +
      '#mochi-lock .ml-sub{font-size:12px;color:#9a93a8;margin-top:8px;line-height:1.5}' +
      '#mochi-lock .ml-input{width:100%;margin-top:18px;padding:12px 14px;border:1px solid #e6e2ee;border-radius:13px;' +
      'font-size:17px;letter-spacing:5px;text-align:center;outline:none;box-sizing:border-box;background:#faf9fc;color:#2b2438}' +
      '#mochi-lock .ml-input:focus{border-color:#b9a7ec;background:#fff;box-shadow:0 0 0 3px rgba(150,120,230,.13)}' +
      '#mochi-lock .ml-ok{width:100%;margin-top:12px;padding:12px;border:0;border-radius:13px;background:#8a6fe0;' +
      'color:#fff;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit}' +
      '#mochi-lock .ml-ok:active{transform:scale(.985)}' +
      '#mochi-lock .ml-ok:disabled{opacity:.55}' +
      '#mochi-lock .ml-err{min-height:17px;margin-top:9px;font-size:12px;color:#e0546e}' +
      '#mochi-lock .ml-tip{margin-top:14px;font-size:11px;color:#b3adc0;line-height:1.5}';
    document.head.appendChild(st);
  }
  function show(cb) {
    pending = cb || pending;
    if (shown) return;
    shown = true;
    injectStyle();
    var mask = document.createElement('div');
    mask.id = 'mochi-lock';
    mask.innerHTML =
      '<div class="ml-card">' +
      '<div class="ml-title">请问?</div>' +
      '<div class="ml-sub">答对了才让进</div>' +
      '<input class="ml-input" type="password" inputmode="numeric" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="24" placeholder="密码">' +
      '<button class="ml-ok" type="button">确认</button>' +
      '<div class="ml-err"></div>' +
      '<div class="ml-tip">这台设备答对一次就记住，下次不用再输</div>' +
      '</div>';
    document.body.appendChild(mask);
    document.body.classList.add('scroll-lock');
    var card = mask.querySelector('.ml-card');
    var inp = mask.querySelector('.ml-input');
    var btn = mask.querySelector('.ml-ok');
    var err = mask.querySelector('.ml-err');
    setTimeout(function () { try { inp.focus(); } catch (e) {} }, 60);
    function fail(msg) {
      fails++;
      err.textContent = msg || '不对，再想想';
      card.classList.remove('ml-shake');
      void card.offsetWidth;
      card.classList.add('ml-shake');
      inp.select();
      if (fails >= 5) {
        var left = 3;
        btn.disabled = true; inp.disabled = true;
        err.textContent = '错太多次了，等 ' + left + ' 秒';
        var iv = setInterval(function () {
          left--;
          if (left <= 0) {
            clearInterval(iv);
            btn.disabled = false; inp.disabled = false;
            err.textContent = '';
            try { inp.focus(); } catch (e) {}
          } else {
            err.textContent = '错太多次了，等 ' + left + ' 秒';
          }
        }, 1000);
      }
    }
    function submit() {
      if (cooldown) return;
      var v = inp.value || '';
      if (!v) { fail('先输入密码'); return; }
      if (sha256(v) === curHash()) {
        memOK = true;
        gSet(K_OK, '1');
        try { inp.value = ''; } catch (e) {}
        mask.style.transition = 'opacity .18s ease';
        mask.style.opacity = '0';
        setTimeout(function () {
          try { mask.parentNode && mask.parentNode.removeChild(mask); } catch (e) {}
          try { document.body.classList.remove('scroll-lock'); } catch (e) {}
          shown = false;
          var cb2 = pending; pending = null;
          try { if (cb2) cb2(); } catch (e) {}
        }, 190);
      } else {
        fail();
      }
    }
    btn.addEventListener('click', submit);
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.keyCode === 13) { e.preventDefault(); submit(); }
    });
  }

  /* 由 clock.js 的 finishEnter 调用：答对后才继续进入 */
  window.mochiLockGate = function (cb) {
    if (window.mochiLockPassed()) { try { cb && cb(); } catch (e) {} return; }
    show(cb);
  };
  /* 重新锁上（设置里「重新验证」、或调试） */
  window.mochiLockReset = function () {
    memOK = false;
    gSet(K_OK, '');
    if (enabled()) show(null);
  };

  /* ---------------- 设置页接线（开屏密码锁开关 / 重新验证） ---------------- */
  function bindSettings() {
    var en = document.getElementById('lock-en');
    if (en && !en.__lockBound) {
      en.__lockBound = 1;
      en.checked = enabled();
      en.addEventListener('change', function () {
        gSet(K_EN, en.checked ? '1' : '0');
        try { if (window.toast) window.toast(en.checked ? '开屏密码锁已开启：下次打开要输密码' : '开屏密码锁已关闭（只影响这台设备）'); } catch (e) {}
      });
    }
    var re = document.getElementById('lock-reauth');
    if (re && !re.__lockBound) {
      re.__lockBound = 1;
      re.addEventListener('click', function () {
        window.mochiLockReset();
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindSettings);
  else bindSettings();
})();
