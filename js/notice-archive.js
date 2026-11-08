(function () { try {
/* 私人二改（基于言序 mochi 二改）
   功能：开屏公告存档
   1) 首次进入后开屏不再显示，开屏里的公告节点（#splash-mustread / #splash-notice，不含年龄确认）
      不删除，而是搬进「设置 → 通用 → 开屏公告 · 使用说明」页面，随时可以重看。
   2) 入口行 id=row-notice-archive，页面 id=page-notice，返回按钮 id=notice-back。
   不改动公告正文与免责声明，只改变展示位置。 */
(function () {
'use strict';
const PAGE_ID = 'page-notice';
const BODY_ID = 'notice-archive-body';
const EMPTY_ID = 'notice-archive-empty';

function bodyEl() { return document.getElementById(BODY_ID); }
function emptyEl() { return document.getElementById(EMPTY_ID); }

function moveNoticeToArchive() {
const body = bodyEl();
if (!body) return false;
let moved = false;
const big = document.querySelector('.splash-bigwarn');
if (big) {
if (big.parentNode !== body) body.insertBefore(big, body.firstChild);
moved = true;
}
['splash-mustread', 'splash-notice'].forEach(function (id) {
const el = document.getElementById(id);
if (!el) return;
if (el.parentNode !== body) body.appendChild(el);
moved = true;
});
return moved || !!body.firstElementChild;
}

function refreshEmpty() {
const body = bodyEl(), tip = emptyEl();
if (!body || !tip) return;
tip.hidden = !!body.firstElementChild;
}

function showPage() {
moveNoticeToArchive();
refreshEmpty();
document.querySelectorAll('.page').forEach(function (p) { p.hidden = true; });
const page = document.getElementById(PAGE_ID);
if (!page) return;
page.hidden = false;
try { const sc = page.querySelector('.cal-scroll'); if (sc) sc.scrollTop = 0; } catch (e) {}
}

function goBack() {
document.querySelectorAll('.page').forEach(function (p) { p.hidden = true; });
const setPage = document.getElementById('page-setting');
if (setPage) setPage.hidden = false;
}

window.mochiArchiveSplashNotice = moveNoticeToArchive;

/* clock.js 在移除开屏前调用/派发；两路都接，避免脚本加载时序漏掉 */
document.addEventListener('mochi-splash-hide', function () { moveNoticeToArchive(); });

function bind() {
const row = document.getElementById('row-notice-archive');
if (row) row.addEventListener('click', showPage);
const back = document.getElementById('notice-back');
if (back) back.addEventListener('click', goBack);
/* 开屏已隐藏/已跳过时，把遗留的公告节点收回存档（正常流程由 hide() 搬） */
try {
const splash = document.getElementById('splash');
const skip = document.documentElement.classList.contains('mochi-splash-skip');
if (!splash || splash.classList.contains('hide') || skip) moveNoticeToArchive();
} catch (e) {}
refreshEmpty();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
else bind();
})();
if (window.__mochiLoaded) window.__mochiLoaded.push("notice-archive.js");
} catch (__e) { if (window.__mochiErrLoaded) window.__mochiErrLoaded.push("notice-archive.js"); try { console.error("[JS] notice-archive.js", __e && __e.message || __e); } catch (x) {} if (window.__jsErrors) window.__jsErrors.push("[notice-archive.js] " + String(__e && __e.message || __e)); } })();
