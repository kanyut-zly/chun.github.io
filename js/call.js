(function () { try {
(function () {
const uid = window.activePrefix();
const store = window.activeStore();
const CALL = { incoming: 15, pickup: 70, busy: 15, reject: 15, hangup: 2, videoProb: 40, camReq: 15, micReq: 10, ringWait: 30, reqGap: 60 };
function callCfg(cid) {
const own = cid && cid !== (window.__activeCid || 'default');
const c = (own && window.replyCfgFor ? window.replyCfgFor(cid) : (window.replyCfg && window.replyCfg())) || {};
return {
incoming: c['call-incoming'] !== undefined ? c['call-incoming'] : CALL.incoming,
pickup: c['call-pickup'] !== undefined ? c['call-pickup'] : CALL.pickup,
busy: c['call-busy'] !== undefined ? c['call-busy'] : CALL.busy,
reject: c['call-reject'] !== undefined ? c['call-reject'] : CALL.reject,
hangup: c['call-hangup'] !== undefined ? c['call-hangup'] : CALL.hangup,
nohangup: c['call-no-hangup'] === 1 || c['call-no-hangup'] === '1',
resume: c['call-resume'] !== undefined ? c['call-resume'] : 1,
videoProb: c['call-video-prob'] !== undefined ? c['call-video-prob'] : CALL.videoProb,
camReq: c['call-cam-req'] !== undefined ? c['call-cam-req'] : CALL.camReq,
micReq: c['call-mic-req'] !== undefined ? c['call-mic-req'] : CALL.micReq,
ringWait: c['call-ring-wait'] !== undefined ? c['call-ring-wait'] : CALL.ringWait,
reqGap: c['call-req-interval'] !== undefined ? c['call-req-interval'] : CALL.reqGap
};
}
const CALL_BG_KEY = 'call-bg';
const CALL_ICON_PHONE = '<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>';
const CALL_ICON_VIDEO = '<svg class="st-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="13" height="12" rx="3"/><path d="M15.5 10.5l5-2.5v8l-5-2.5z"/></svg>';
function callIconHtml(type) { return type === 'video' ? CALL_ICON_VIDEO : CALL_ICON_PHONE; }
function callTypeText(type) { return type === 'video' ? '视频通话' : '语音通话'; }

function paintCallBg(el, bg) {
if (!el) return;
if (bg) {
el.style.backgroundImage = 'url("' + bg + '")';
el.style.backgroundSize = 'cover';
el.style.backgroundPosition = 'center';
el.classList.add('has-bg');
} else {
el.style.backgroundImage = '';
el.classList.remove('has-bg');
}
}
function applyCallBgs() {
const cbg = store.get(CALL_BG_KEY) || '';
const hbg = store.get(CALL_HALF_BG_KEY) || '';
paintCallBg(document.querySelector('.call-panel'), hbg || cbg);
paintCallBg(document.getElementById('call-mini'), cbg);
const val = document.getElementById('call-bg-val');
if (val) val.textContent = cbg ? '已设置' : '默认';
const rm = document.getElementById('call-bg-remove');
if (rm) rm.hidden = !cbg;
const evalVal = document.getElementById('call-bg-edit-val');
if (evalVal) evalVal.textContent = cbg ? '已设置' : '默认';
const rmEdit = document.getElementById('call-bg-edit-remove');
if (rmEdit) rmEdit.hidden = !cbg;
const hval = document.getElementById('call-half-bg-val');
if (hval) hval.textContent = hbg ? '已设置' : '默认';
const hrm = document.getElementById('call-half-bg-remove');
if (hrm) hrm.hidden = !hbg;
const hEditVal = document.getElementById('call-half-bg-edit-val');
if (hEditVal) hEditVal.textContent = hbg ? '已设置' : '默认';
const hEditRm = document.getElementById('call-half-bg-edit-remove');
if (hEditRm) hEditRm.hidden = !hbg;
}
function applyCallBg() { applyCallBgs(); }
function pickCallBg(key, msg) {
const bgKey = key || CALL_BG_KEY;
return window.mochiFilePick({
id: 'mochi-call-bg-pick', accept: 'image/*',
onFiles: (files) => {
const f = files && files[0];
if (!f) { toast('没有取到图片，请再选一次'); return; }
if (!window.mochiImgIngest) { toast('图片处理组件没加载上（缓存过旧或离线），请重新打开页面再试'); return; }
window.mochiImgIngest(f, { maxSide: 1920, quality: 0.85, tag: 'call-bg' }).then((r) => {
if (!r || r.st !== 'ok' || !r.data) { toast(window.mochiImgIngestMiss(r, '通话背景')); return; }
const data = r.data;
store.set(bgKey, data);
if (bgKey === CALL_HALF_BG_KEY) applyCallHalfBg(); else applyCallBg();
toast(msg || '通话背景已设置');
});
}
});
}
const callBgRow = document.getElementById('call-bg-row');
if (callBgRow) callBgRow.addEventListener('click', () => pickCallBg(CALL_BG_KEY));
if (window.mochiFilePickDoor) {
['call-bg-row', 'call-bg-edit-row', 'call-half-bg-row', 'call-half-bg-edit-row'].forEach(function (rid) {
const door = document.getElementById(rid);
if (door) window.mochiFilePickDoor(door, { owner: 'mochi-call-bg-pick', accept: 'image/*' });
});
}
const callAvEditRow = document.getElementById('call-av-edit-row');
if (callAvEditRow) {
callAvEditRow.addEventListener('click', () => {
const cp = document.getElementById('chat-call-panel');
if (cp) cp.hidden = true;
if (window.openAvlib) window.openAvlib();
else toast('头像库暂不可用');
});
}
const callBgEditRow = document.getElementById('call-bg-edit-row');
if (callBgEditRow) callBgEditRow.addEventListener('click', () => pickCallBg(CALL_BG_KEY));
const callBgEditRm = document.getElementById('call-bg-edit-remove');
if (callBgEditRm) {
callBgEditRm.addEventListener('click', () => {
store.remove(CALL_BG_KEY);
applyCallBg();
toast('已恢复默认通话背景');
});
}
const callBgRm = document.getElementById('call-bg-remove');
if (callBgRm) {
callBgRm.addEventListener('click', () => {
store.remove(CALL_BG_KEY);
applyCallBg();
toast('已恢复默认通话背景');
});
}
const CALL_HALF_BG_KEY = 'call-half-bg';
function applyCallHalfBg() { applyCallBgs(); }
const callHalfBgRow = document.getElementById('call-half-bg-row');
if (callHalfBgRow) callHalfBgRow.addEventListener('click', () => pickCallBg(CALL_HALF_BG_KEY, '通话半框背景已设置'));
const callHalfBgRm = document.getElementById('call-half-bg-remove');
if (callHalfBgRm) {
callHalfBgRm.addEventListener('click', () => {
store.remove(CALL_HALF_BG_KEY);
applyCallHalfBg();
toast('已恢复默认通话半框背景');
});
}
const callHalfOpenRow = document.getElementById('call-half-open');
if (callHalfOpenRow) {
callHalfOpenRow.addEventListener('click', () => {
if (!window.enterChat || !window.openChatCallPanel) { toast('通话半框暂不可用'); return; }
window.enterChat();
window.openChatCallPanel();
});
}
const callHalfBgEditRow = document.getElementById('call-half-bg-edit-row');
if (callHalfBgEditRow) callHalfBgEditRow.addEventListener('click', () => pickCallBg(CALL_HALF_BG_KEY, '通话半框背景已设置'));
const callHalfBgEditRm = document.getElementById('call-half-bg-edit-remove');
if (callHalfBgEditRm) {
callHalfBgEditRm.addEventListener('click', () => {
store.remove(CALL_HALF_BG_KEY);
applyCallHalfBg();
toast('已恢复默认通话半框背景');
});
}
let callPreviewOn = false;
function closeCallPreview() {
if (!callPreviewOn) return;
callPreviewOn = false;
const m = document.getElementById('call-mask');
const title = m && m.querySelector('.call-title');
if (title) title.textContent = '语音通话';
if (m) m.hidden = true;
const catcher = document.getElementById('call-preview-catcher');
if (catcher && catcher.parentNode) catcher.parentNode.removeChild(catcher);
setMaskBtns('none');
}
function previewCallPopup() {
if (callPreviewOn) { closeCallPreview(); return; }
if (currentCall) {
if (mask && mask.hidden) {
mask.hidden = false;
if (mini) mini.hidden = true;
syncCallTypeUI();
toast('通话中·已展开通话面板');
} else {
toast('通话中·通话面板已打开');
}
return;
}
const m = document.getElementById('call-mask');
if (!m) { toast('通话弹窗暂不可用'); return; }
if (avEl) avEl.hidden = false;
if (videoStage) videoStage.hidden = true;
if (typeTag) typeTag.hidden = true;
if (ctlsEl) ctlsEl.hidden = true;
fillAv(document.getElementById('call-av'), partnerAv());
const nm = document.getElementById('call-name');
if (nm) nm.textContent = partnerName();
const st = document.getElementById('call-status');
if (st) st.textContent = '对方来电...';
const du = document.getElementById('call-duration');
if (du) du.textContent = '00:00';
const cd = document.getElementById('call-countdown');
if (cd) cd.hidden = true;
const title = m.querySelector('.call-title');
if (title) title.textContent = '语音通话 · 预览';
setMaskBtns('ringing');
m.hidden = false;
const catcher = document.createElement('div');
catcher.id = 'call-preview-catcher';
catcher.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;';
catcher.addEventListener('click', closeCallPreview);
m.appendChild(catcher);
callPreviewOn = true;
toast('预览模式：点击任意处退出');
}
const callViewRow = document.getElementById('call-view-row');
if (callViewRow) callViewRow.addEventListener('click', previewCallPopup);
document.addEventListener('contact-switched', closeCallPreview);
try {
if (window.idbGet) {
const myPrefix = window.activePrefix();
window.idbGet(myPrefix + ':' + CALL_BG_KEY).then(v => {
if (window.activePrefix() !== myPrefix) return;
if (v && typeof v === 'string' && v.length > 2 && !store.get(CALL_BG_KEY)) {
store.set(CALL_BG_KEY, v);
applyCallBg();
}
});
window.idbGet(myPrefix + ':' + CALL_HALF_BG_KEY).then(v => {
if (window.activePrefix() !== myPrefix) return;
if (v && typeof v === 'string' && v.length > 2 && !store.get(CALL_HALF_BG_KEY)) {
store.set(CALL_HALF_BG_KEY, v);
applyCallHalfBg();
}
});
}
} catch (e) {}
applyCallBg();
applyCallHalfBg();
document.addEventListener('contact-switched', applyCallBg);
document.addEventListener('contact-switched', applyCallHalfBg);
const CALL_MINI_KEY = 'call-mini-enabled';
function callMiniEnabled() {
try { return store.get(CALL_MINI_KEY) !== '0'; } catch (e) { return true; }
}
window.getCallMiniEnabled = function () { return callMiniEnabled(); };
window.setCallMiniEnabled = function (v) {
try { store.set(CALL_MINI_KEY, v ? '1' : '0'); } catch (e) {}
applyCallMiniNow(!!v);
};
function applyCallMiniNow(enabled) {
if (!currentCall || !mini) return;
if (enabled) {
if (currentCall.status === 'connected' && mask && mask.hidden) {
syncCallName();
syncCallAv();
mini.hidden = false;
liftMiniIntoSafeArea(); // v3.26.x #137：显示时校正，防旧坐标落进系统状态栏区
}
} else {
mini.hidden = true;
}
}
let currentCall = null; // { direction, status, startTime, connectedTime, timer }
let durationTimer = null;
const mask = document.getElementById('call-mask');
const mini = document.getElementById('call-mini');
const avEl = document.getElementById('call-av');
const nameEl = document.getElementById('call-name');
const statusEl = document.getElementById('call-status');
const durEl = document.getElementById('call-duration');
const cdEl = document.getElementById('call-countdown');
const hangBtn = document.getElementById('call-hang-btn');
const rejectBtn = document.getElementById('call-reject-btn');
const answerBtn = document.getElementById('call-answer-btn');
const miniBtn = document.getElementById('call-minimize-btn');
const miniAv = document.getElementById('call-mini-av');
const miniName = document.getElementById('call-mini-name');
const miniTime = document.getElementById('call-mini-time');
const titleEl = mask ? mask.querySelector('.call-title') : null;
const typeTag = document.getElementById('call-type-tag');
const videoStage = document.getElementById('call-video-stage');
const videoFeed = document.getElementById('call-video-feed');
const videoSelf = document.getElementById('call-video-self');
const videoSelfInner = document.getElementById('call-video-self-inner');
const micBtn = document.getElementById('call-mic-btn');
const camBtn = document.getElementById('call-cam-btn');
const ctlsEl = document.getElementById('call-ctls');
const typeMask = document.getElementById('call-type-mask');
const typeName = document.getElementById('call-type-name');
const reqMask = document.getElementById('call-req-mask');
const reqTitle = document.getElementById('call-req-title');
const reqText = document.getElementById('call-req-text');
const reqAv = document.getElementById('call-req-av');
let _miniSafeTopCache = -1;
function miniSafeTop() {
try {
if (!document.documentElement.classList.contains('ios-pwa-standalone')) return 0;
if (_miniSafeTopCache >= 0) return _miniSafeTopCache;
let top = 0;
try {
const probe = document.createElement('div');
probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;padding-top:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none;';
document.body.appendChild(probe);
const v = parseFloat(getComputedStyle(probe).paddingTop);
document.body.removeChild(probe);
if (!isNaN(v) && v >= 20 && v <= 160) top = v;
} catch (e1) {}
if (!top) {
const sh = (window.screen && window.screen.height) || 0;
const ih = window.innerHeight || 0;
if (sh > 0 && ih > 0) {
const diff = sh - ih;
if (diff >= 20 && diff <= 160) top = diff;
}
}
if (!top) top = 59;
_miniSafeTopCache = top;
return top;
} catch (e) {}
return 0;
}
function liftMiniIntoSafeArea() {
try {
if (!mini || mini.hidden) return;
const st = miniSafeTop();
if (st <= 0) return;
const m = String(mini.style.top || '').match(/^(-?\d+(\.\d+)?)px$/);
if (!m) return; // 无内联 top（默认底部居中），无需处理
const y = parseFloat(m[1]);
if (y < st) {
mini.style.top = st + 'px';
if (mini.style.bottom && mini.style.bottom !== 'auto') mini.style.bottom = 'auto';
if (!miniPos) miniPos = { left: mini.style.left, top: mini.style.top };
else miniPos.top = mini.style.top;
try { store.set('call-mini-pos', JSON.stringify(miniPos)); } catch (e2) {}
}
} catch (e) {}
}
let miniPos = null;
try { miniPos = JSON.parse(store.get('call-mini-pos') || 'null'); } catch (e) {}
function miniPosValid(p) {
if (!p || typeof p !== 'object') return false;
const lm = String(p.left || '').match(/^(-?\d+(\.\d+)?)px$/);
const tm = String(p.top || '').match(/^(-?\d+(\.\d+)?)px$/);
if (!lm || !tm) return false;
const x = parseFloat(lm[1]), y = parseFloat(tm[1]);
if (isNaN(x) || isNaN(y)) return false;
if (x < 0 || x > window.innerWidth - 30) return false;
if (y < 0 || y > window.innerHeight - 30) return false;
return true;
}
if (miniPos && mini && miniPosValid(miniPos)) {
const _st = miniSafeTop();
let _y = parseFloat(String(miniPos.top).match(/(-?\d+(\.\d+)?)px/)[1]);
if (_st > 0 && _y < _st) {
miniPos.top = _st + 'px';
try { store.set('call-mini-pos', JSON.stringify(miniPos)); } catch (e) {}
}
mini.style.left = miniPos.left;
mini.style.top = miniPos.top;
mini.style.bottom = 'auto';
mini.style.transform = 'none';
} else if (miniPos) {
try { store.remove('call-mini-pos'); } catch (e) {}
miniPos = null;
}
function partnerName() {
const nick = store.get('lbl-partner') || store.get('cs-lbl-partner')
|| (window.contactNameFor ? window.contactNameFor(window.__activeCid || 'default') : '');
return nick || (window.taWord ? window.taWord() : 'TA');
}
function partnerAv() { return store.get('cs-avatar-partner') || store.get('avatar-partner') || ''; }
function userAv() {
try {
const s = (window.storeFor && currentCall && window.storeFor(currentCall.cid)) || store;
return s.get('cs-avatar-user') || s.get('avatar-user') || '';
} catch (e) { return ''; }
}
let shownUserAv = null;
function syncCallVideo() {
const show = !!(currentCall && (currentCall.type === 'video' || currentCall.cam));
if (videoStage) videoStage.hidden = !show;
if (avEl) avEl.hidden = show;
if (!show) return;
let av = '';
try {
const s = (window.storeFor && currentCall && window.storeFor(currentCall.cid)) || store;
av = s.get('cs-avatar-partner') || s.get('avatar-partner') || '';
} catch (e) { av = ''; }
if (videoFeed) {
if (av) {
videoFeed.style.backgroundImage = 'url("' + av + '")';
videoFeed.classList.add('has-img');
} else {
videoFeed.style.backgroundImage = '';
videoFeed.classList.remove('has-img');
}
}
if (videoSelfInner) {
const ua = userAv();
if (ua !== shownUserAv) {
shownUserAv = ua;
fillAv(videoSelfInner, ua);
}
}
if (videoSelf) videoSelf.classList.toggle('cam-off', !currentCall.cam);
}
function syncCallDevices() {
if (!currentCall) return;
const micOn = !!currentCall.mic, camOn = !!currentCall.cam;
if (micBtn) {
micBtn.classList.toggle('off', !micOn);
micBtn.setAttribute('aria-pressed', micOn ? 'true' : 'false');
const lb = micBtn.querySelector('span');
if (lb) lb.textContent = micOn ? '麦克风' : '已静音';
}
if (camBtn) {
camBtn.classList.toggle('off', !camOn);
camBtn.setAttribute('aria-pressed', camOn ? 'true' : 'false');
const lb = camBtn.querySelector('span');
if (lb) lb.textContent = camOn ? '摄像头' : '已关闭';
}
if (videoSelf) videoSelf.classList.toggle('cam-off', !camOn);
}
function syncCallTypeUI() {
if (!currentCall) {
if (typeTag) typeTag.hidden = true;
if (ctlsEl) ctlsEl.hidden = true;
return;
}
const t = currentCall.type === 'video' ? 'video' : 'voice';
if (titleEl) titleEl.textContent = callTypeText(t) + (callPreviewOn ? ' · 预览' : '');
if (typeTag) {
typeTag.hidden = false;
typeTag.className = 'call-type-tag' + (t === 'video' ? ' is-video' : '');
const ring = currentCall.status === 'ringing';
typeTag.innerHTML = callIconHtml(t) + '<span>' + (ring ? (t === 'video' ? '视频通话邀请' : '语音通话邀请') : callTypeText(t)) + '</span>';
}
if (ctlsEl) ctlsEl.hidden = !(currentCall.status === 'connected');
syncCallVideo();
syncCallDevices();
}
function setCallMic(on, silent) {
if (!currentCall) return;
currentCall.mic = !!on;
syncCallDevices();
saveCallActive();
if (!silent) toast(on ? '麦克风已打开' : '麦克风已关闭');
}
function setCallCam(on, silent) {
if (!currentCall) return;
currentCall.cam = !!on;
if (on && currentCall.type !== 'video') currentCall.type = 'video';
syncCallTypeUI();
saveCallActive();
if (!silent) toast(on ? '摄像头已打开' : '摄像头已关闭');
}
let reqKind = null;
function callReqClearTimer() {
try { clearTimeout(callReqTimer); } catch (e) {}
callReqTimer = 0;
}
function hideCallRequest() {
if (reqMask) reqMask.hidden = true;
try { clearTimeout(callReqAutoTimer); } catch (e) {}
callReqAutoTimer = 0;
reqKind = null;
}
function scheduleCallReq(delay) {
callReqClearTimer();
if (!currentCall || currentCall.status !== 'connected') return;
const wait = (typeof delay === 'number') ? delay : Math.max(5, Number(callCfg(currentCall && currentCall.cid).reqGap) || 60) * 1000;
callReqTimer = setTimeout(callReqTick, wait);
}
function callReqTick() {
callReqTimer = 0;
if (!currentCall || currentCall.status !== 'connected') return;
if (reqKind) { scheduleCallReq(); return; }
const cc = callCfg(currentCall.cid);
const canCam = !currentCall.cam && cc.camReq > 0;
const canMic = !currentCall.mic && cc.micReq > 0;
const rollCam = canCam && Math.random() * 100 < cc.camReq;
const rollMic = canMic && Math.random() * 100 < cc.micReq;
let kind = '';
if (rollCam && rollMic) kind = Math.random() < 0.5 ? 'cam' : 'mic';
else if (rollCam) kind = 'cam';
else if (rollMic) kind = 'mic';
if (kind) showCallRequest(kind);
scheduleCallReq();
}
function showCallRequest(kind) {
if (!currentCall || currentCall.status !== 'connected' || reqKind) return;
reqKind = kind;
if (reqTitle) reqTitle.textContent = kind === 'cam' ? '想看看你' : '想听听你的声音';
if (reqText) reqText.textContent = kind === 'cam'
? (currentCall.type === 'video' ? 'TA 想让你打开摄像头，一起视频一会儿。' : 'TA 想让你打开摄像头看看你。')
: 'TA 想让你打开麦克风，和 TA 说说话。';
if (reqAv) fillAv(reqAv, (currentCall && currentCall.av) || partnerAv());
if (reqMask) reqMask.hidden = false;
try { clearTimeout(callReqAutoTimer); } catch (e) {}
const shownKind = kind;
callReqAutoTimer = setTimeout(function () {
if (reqKind === shownKind) {
hideCallRequest();
toast('TA：没关系，下次再说～');
}
}, 25000);
}
function resolveCallRequest(accept) {
const kind = reqKind;
if (!kind) return;
hideCallRequest();
if (!accept) { toast('TA：好吧，不想开也没关系'); return; }
if (kind === 'cam') setCallCam(true, true);
else setCallMic(true, true);
toast(kind === 'cam' ? '已为 TA 打开摄像头' : '已为 TA 打开麦克风');
}
let callReqTimer = 0, callReqAutoTimer = 0;
function openCallPanelFromMini() {
if (!currentCall || !mask) return;
if (mini) mini.hidden = true;
mask.hidden = false;
if (cdEl) cdEl.hidden = true;
syncCallName();
syncCallAv();
syncCallTypeUI();
if (statusEl) statusEl.textContent = currentCall.type === 'video' ? '视频通话中...' : '正在通话...';
setMaskBtns('active');
try { updateDur(); } catch (e) {}
}

function bindCall(callObj) {
callObj.cid = window.__activeCid || 'default';
callObj.name = partnerName();
callObj.av = partnerAv();
if (!callObj.type) callObj.type = 'voice';
if (callObj.mic === undefined) callObj.mic = true;
if (callObj.cam === undefined) callObj.cam = false;
saveCallActive();
return callObj;
}
const CALL_ACTIVE_KEY = 'xy-home-v2:call-active';
function callActivePayload() {
return JSON.stringify({
cid: currentCall.cid, direction: currentCall.direction, status: currentCall.status,
startTime: currentCall.startTime, connectedTime: currentCall.connectedTime || 0,
hangupAt: currentCall.hangupAt || 0,
type: currentCall.type || 'voice', mic: !!currentCall.mic, cam: !!currentCall.cam,
name: currentCall.name || '', av: '', ts: Date.now()
});
}
function saveCallActive() {
if (!currentCall) return;
const payload = callActivePayload();
try { sessionStorage.setItem(CALL_ACTIVE_KEY, payload); } catch (e) {}
try { localStorage.setItem(CALL_ACTIVE_KEY, payload); } catch (e) {}
try { if (window.idbSet) window.idbSet(CALL_ACTIVE_KEY, JSON.parse(payload)); } catch (e) {}
}
const CALL_RESUME_WINDOW = 6 * 3600 * 1000; // #757：SS/LS 墙钟窗（锁屏/后台整场通话都算）
const CALL_IDB_WINDOW = 600000;             // #120/#705：IDB 兜底副本的新鲜度窗，原样不变
function flushCallActive() {
if (!currentCall || currentCall.status !== 'connected') return;
saveCallActive();
}
function clearCallActive() {
try { sessionStorage.setItem(CALL_ACTIVE_KEY, '{"ts":0}'); } catch (e) {}
try { localStorage.setItem(CALL_ACTIVE_KEY, '{"ts":0}'); } catch (e) {}
try { if (window.idbSet) window.idbSet(CALL_ACTIVE_KEY, { ts: 0 }); } catch (e) {}
}
function fillAv(el, data) {
if (!el) return;
el.innerHTML = '';
if (data) {
const img = document.createElement('img');
img.src = data;
img.alt = '头像';
el.appendChild(img);
} else {
el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.5-6 8-6s8 2 8 6"/></svg>';
}
}
let shownAv = null;
let shownName = null;
function syncCallAv() {
if (!currentCall) return;
let av = '';
try {
const s = (window.storeFor && window.storeFor(currentCall.cid)) || store;
av = s.get('cs-avatar-partner') || s.get('avatar-partner') || '';
} catch (e) { av = currentCall.av || partnerAv(); }
if (av === shownAv) return;
shownAv = av;
fillAv(avEl, av);
fillAv(miniAv, av);
}
function syncCallName() {
if (!currentCall) return;
let name = '';
try {
const s = (window.storeFor && window.storeFor(currentCall.cid)) || store;
name = s.get('lbl-partner') || s.get('cs-lbl-partner')
|| (window.contactNameFor ? window.contactNameFor(currentCall.cid) : '')
|| (window.taWordFor ? window.taWordFor(currentCall.cid) : (window.taWord ? window.taWord() : 'TA'));
} catch (e) { name = currentCall.name || partnerName(); }
if (name === shownName) return;
shownName = name;
if (nameEl) nameEl.textContent = name;
if (miniName) miniName.textContent = name;
}
function fmtDur(sec) {
if (isNaN(sec) || sec < 0) return '00:00';
const m = Math.floor(sec / 60), s = sec % 60;
return (m < 10 ? '0' + m : '' + m) + ':' + (s < 10 ? '0' + s : '' + s);
}
function setMaskBtns(mode) {
if (hangBtn) hangBtn.hidden = !(mode === 'calling' || mode === 'active');
if (rejectBtn) rejectBtn.hidden = !(mode === 'ringing');
if (answerBtn) answerBtn.hidden = !(mode === 'ringing');
if (miniBtn) miniBtn.hidden = !(mode === 'calling' || mode === 'active');
}
function minimizeCall() {
if (!currentCall) return;
if (mask) mask.hidden = true;
if (cdEl) cdEl.hidden = true;
if (mini) {
if (callMiniEnabled()) {
syncCallName();
syncCallAv();
syncCallTypeUI();
mini.hidden = false;
liftMiniIntoSafeArea(); // v3.26.x #137：显示时校正，防旧坐标落进系统状态栏区
} else {
mini.hidden = true;
}
}
}
function stopTimers() {
if (durationTimer) { clearInterval(durationTimer); durationTimer = null; }
}
function updateDur() {
if (!currentCall) return;
const base = currentCall.connectedTime || currentCall.startTime;
const sec = Math.floor((Date.now() - base) / 1000);
if (durEl) durEl.textContent = fmtDur(sec);
if (miniTime) miniTime.textContent = fmtDur(sec);
}
function startCallDuration() {
stopTimers();
if (!currentCall.connectedTime) currentCall.connectedTime = Date.now(); // v3.26.x：恢复通话时已有 connectedTime 不覆盖，计时从接通时刻继续
updateDur(); // v3.13.x：接通立即刷新显示，避免接通瞬间仍停留「00:00」卡一下
if (!currentCall.hangupAt) currentCall.hangupAt = Math.max(currentCall.connectedTime + 180000, Date.now());
let hbCount = 0;
durationTimer = setInterval(() => {
updateDur();
syncCallAv();
syncCallName();
syncCallVideo();
if (++hbCount >= 20) { hbCount = 0; saveCallActive(); }
if (currentCall && currentCall.status === 'connected' && Date.now() >= currentCall.hangupAt) {
currentCall.hangupAt = Date.now() + 60000;
const hp = callCfg(currentCall.cid);
if (!(hp.nohangup || hp.hangup <= 0) && Math.random() * 100 < hp.hangup) {
endCall('对方挂断了电话');
}
}
}, 1000);
}
function notifyCallEnd(cid, sysHtml, recType, recText, recMeta) {
const cur = window.__activeCid || 'default';
if (cid === cur) {
if (window.chatAddSystem) window.chatAddSystem(sysHtml);
if (window.addCallRecord) window.addCallRecord(recType, recText, recMeta);
return;
}
if (window.chatAppendToDeskMsg) { window.chatAppendToDeskMsg(cid, sysHtml); }
try {
const s = (window.storeFor && window.storeFor(cid)) || store;
let list = [];
try { list = JSON.parse(s.get('records-call') || '[]'); } catch (e) { list = []; }
if (!Array.isArray(list)) list = [];
const entry = { type: recType, text: recText, ts: Date.now() };
if (recMeta && typeof recMeta === 'object') { for (const k in recMeta) { if (Object.prototype.hasOwnProperty.call(recMeta, k)) entry[k] = recMeta[k]; } }
list.unshift(entry);
s.set('records-call', JSON.stringify(list.slice(0, 50)));
} catch (e) {}
}
function endCall(text, holdSilent) {
clearCallActive(); // v3.26.x：正常结束清除进行中标记（中断恢复靠残留检测）
hideCallRequest();
callReqClearTimer();
try { store.set('records-call-last', String(Date.now())); } catch (e) {}
if (window.stopSfx) window.stopSfx('ring');
if (window.musicHoldForCall) window.musicHoldForCall(false);
stopTimers();
if (mask) mask.hidden = true;
if (mini) mini.hidden = true;
if (cdEl) cdEl.hidden = true;
if (currentCall && !holdSilent) {
const dur = currentCall.durationSec || (currentCall.connectedTime ? Math.max(0, Math.floor((Date.now() - currentCall.connectedTime) / 1000)) : 0);
const dir = currentCall.direction;
const name = currentCall.name || partnerName();
const ctype = currentCall.type === 'video' ? 'video' : 'voice';
const isVideo = ctype === 'video';
const durTxt = dur > 0 ? ' · 时长 ' + fmtDur(dur) : '';
let resText = text;
if (dur > 0 && currentCall.connectedTime) {
if (text === '对方挂断了电话') resText = '对方已挂断';
else if (text === '已挂断') resText = '通话已挂断';
else resText = '通话已结束'; // 不明原因中断等
resText += durTxt;
}
const head = dir === 'in' ? name + (isVideo ? ' 视频来电' : ' 来电') : '我拨打 ' + name;
notifyCallEnd(currentCall.cid || 'default', callIconHtml(ctype) + head + ' · ' + resText, dir, (isVideo ? '视频通话 · ' : '') + text + (dur ? '（' + fmtDur(dur) + '）' : ''), { video: isVideo });
}
currentCall = null;
shownAv = null;
shownName = null;
shownUserAv = null;
if (videoStage) videoStage.hidden = true;
if (avEl) avEl.hidden = false;
if (typeTag) typeTag.hidden = true;
if (ctlsEl) ctlsEl.hidden = true;
}
function bgCallNotify(name, hint, avOverride) {
try {
if (window.bgNotifyCheck) window.bgNotifyCheck(name + ' 来电了' + (hint ? '，' + hint : ''), Date.now(), { name: name + '来电', av: avOverride || partnerAv(), avFixed: true, force: true, callAlert: true, callTag: name, kind: 'call' });
} catch (e) {}
}
const CALL_HOLD_KEY = 'xy-home-v2:call-hold';
const HOLD_SID = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
function callHoldMs(cid) {
const rw = Number(callCfg(cid).ringWait);
const sec = isFinite(rw) && rw > 0 ? rw : 30;
return Math.max(3 * 60 * 1000, (sec + 30) * 1000);
}
function heldMissedHtml(nm, callType) {
const v = callType === 'video';
return callIconHtml(v ? 'video' : 'voice') + nm + (v ? ' 视频来电' : ' 来电') + ' · 未接听';
}
const CALL_REPEAT_MS = 30000;
const CALL_REPEAT_MAX = 5;
let callRepeatTimer = 0;
let callRepeatCount = 0;
function stopCallRepeat() {
if (callRepeatTimer) { clearTimeout(callRepeatTimer); callRepeatTimer = 0; }
callRepeatCount = 0;
}
function startCallRepeat(name, cid, avOverride) {
stopCallRepeat();
const wantCid = cid || (window.__activeCid || 'default');
const tick = function () {
callRepeatTimer = 0;
if (currentCall) { stopCallRepeat(); return; } // 已接通/前台响铃中/通话已结束
if (document.visibilityState === 'visible') { stopCallRepeat(); return; }
let h = null;
try { h = readCallHold(); } catch (e) {}
if (!h || h.name !== name || h.cid !== wantCid || Date.now() - h.ts > callHoldMs(wantCid)) { stopCallRepeat(); return; }
if (callRepeatCount >= CALL_REPEAT_MAX) { stopCallRepeat(); return; }
callRepeatCount++;
bgCallNotify(name, '快回来接听，对方会等你几分钟', avOverride);
callRepeatTimer = setTimeout(tick, CALL_REPEAT_MS);
};
callRepeatTimer = setTimeout(tick, CALL_REPEAT_MS);
}
function holdIncomingCall(name, cid, avOverride, msgWritten, callType) {
let prev = null;
try { prev = readCallHold(); } catch (e) {}
const justNotified = prev && prev.name === name && Date.now() - prev.ts < 6000;
if (prev && prev.cid && prev.sid === HOLD_SID && Date.now() - prev.ts > callHoldMs(prev.cid)) {
notifyCallEnd(prev.cid, heldMissedHtml(prev.name || partnerName(), prev.type), 'in', '未接听', { video: prev.type === 'video' });
}
const h = { ts: Date.now(), name: name, cid: cid || (window.__activeCid || 'default'), msg: !!msgWritten, sid: HOLD_SID, type: callType === 'video' ? 'video' : 'voice' };
try { localStorage.setItem(CALL_HOLD_KEY, JSON.stringify(h)); } catch (e) {}
if (window.idbSet) { try { window.idbSet(CALL_HOLD_KEY, h); } catch (e) {} }
if (!justNotified) bgCallNotify(name, '快回来接听，对方会等你几分钟', avOverride);
startCallRepeat(name, cid, avOverride);
}
window.callHoldIncoming = holdIncomingCall;
window.callRecordMissed = function (cid, name) {
try { notifyCallEnd(cid || 'default', heldMissedHtml(name || partnerName()), 'in', '未接听'); } catch (e) {}
};
function readCallHold() {
try {
const h = JSON.parse(localStorage.getItem(CALL_HOLD_KEY) || 'null');
return (h && h.ts) ? h : null;
} catch (e) { return null; }
}
function clearCallHold() {
stopCallRepeat();
try { localStorage.setItem(CALL_HOLD_KEY, '{"ts":0}'); } catch (e) {}
if (window.idbSet) { try { window.idbSet(CALL_HOLD_KEY, { ts: 0 }); } catch (e) {} }
}
let holdBusy = false;
function resumeHeldCall() {
if (holdBusy) return;
const h = readCallHold();
if (h) { clearCallHold(); resumeProcessHold(h, h.sid !== HOLD_SID); return; }
if (window.idbGet) {
holdBusy = true;
window.idbGet(CALL_HOLD_KEY).then(function (ih) {
holdBusy = false;
if (!ih || !ih.ts) return;
if (Date.now() - ih.ts > callHoldMs(ih.cid)) { clearCallHold(); return; }
clearCallHold();
resumeProcessHold(ih, true);
}).catch(function () { holdBusy = false; });
}
}
function resumeProcessHold(h, crossRun) {
const cur = window.__activeCid || 'default';
if (Date.now() - h.ts <= callHoldMs(h.cid) && !currentCall) {
if (h.cid === cur) { incomingCall(true, !!h.msg, h.type); return; }
if (h.cid && window.setActiveContact) {
let known = (h.cid === 'default');
try { if (window.getContacts) known = window.getContacts().some(c => c && c.id === h.cid); } catch (e) {}
if (known) {
try { window.setActiveContact(h.cid); } catch (e) {}
if ((window.__activeCid || 'default') === h.cid) { incomingCall(true, !!h.msg, h.type); return; }
}
}
}
if (!crossRun && !currentCall) notifyCallEnd(h.cid || cur, heldMissedHtml(h.name || partnerName(), h.type), 'in', '未接听', { video: h.type === 'video' });
}
document.addEventListener('contact-renamed', (e) => {
if (currentCall && e.detail && e.detail.id === currentCall.cid) {
syncCallName();
}
});
document.addEventListener('visibilitychange', () => {
if (document.visibilityState === 'hidden' && currentCall && currentCall.status === 'ringing') {
const cid = currentCall.cid || (window.__activeCid || 'default');
const nm = currentCall.name || partnerName();
const msgOk = !!(currentCall.sysMsg); // FIX 2026-09-13 #406：续传「打来了语音通话」已写标记
const ringType = currentCall.type;
endCall('', true);
holdIncomingCall(nm, cid, undefined, msgOk, ringType);
} else if (document.visibilityState === 'visible') {
resumeHeldCall();
}
});
document.addEventListener('visibilitychange', function () {
try { if (document.visibilityState === 'hidden') flushCallActive(); } catch (e) {}
});
window.addEventListener('pagehide', function () { try { flushCallActive(); } catch (e) {} });
document.addEventListener('freeze', function () { try { flushCallActive(); } catch (e) {} });
function closeImageOverlay() {
try {
const iv = document.getElementById('img-view-mask');
if (iv) iv.hidden = true;
} catch (e) {}
}
function incomingCall(isReplay, msgWritten, typeOverride) {
if (currentCall) return;
if (window.nightModeActive && window.nightModeActive()) return;
closeCallPreview();
closeImageOverlay();
if (window.playSfx) window.playSfx('ring');
if (window.musicHoldForCall) window.musicHoldForCall(true);
try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) {}
const name = partnerName();
const ctype = typeOverride === 'video' ? 'video' : typeOverride === 'voice' ? 'voice' : (Math.random() * 100 < callCfg().videoProb ? 'video' : 'voice');
currentCall = bindCall({ direction: 'in', status: 'ringing', startTime: Date.now(), durationSec: 0, type: ctype, mic: true, cam: false });
shownAv = null;
shownName = null;
shownUserAv = null;
syncCallAv();
syncCallName();
if (nameEl) nameEl.textContent = name;
if (statusEl) statusEl.textContent = ctype === 'video' ? '对方发来视频通话…' : '对方来电...';
if (durEl) durEl.textContent = '00:00';
if (mask) mask.hidden = false;
setMaskBtns('ringing');
syncCallTypeUI();
let wroteSysMsg = false;
if ((!isReplay || !msgWritten) && window.chatAddSystem) {
window.chatAddSystem(callIconHtml(ctype) +  name + ' 给你打来了' + callTypeText(ctype));
wroteSysMsg = true;
}
if (currentCall) currentCall.sysMsg = !!msgWritten || wroteSysMsg;
let count = Math.max(3, Math.round(Number(callCfg().ringWait) || 30));
if (cdEl) { cdEl.hidden = false; cdEl.textContent = count + ' 秒后未接听'; }
const t = setInterval(() => {
if (!currentCall || currentCall.status !== 'ringing') { clearInterval(t); return; }
syncCallAv();
count--;
if (count <= 0) {
clearInterval(t);
if (cdEl) cdEl.hidden = true;
currentCall.status = 'ended';
endCall('未接听');
} else if (cdEl) {
cdEl.textContent = count + ' 秒后未接听';
}
}, 1000);
}
function answerCall() {
if (!currentCall || currentCall.status !== 'ringing') return;
if (window.stopSfx) window.stopSfx('ring');
currentCall.status = 'connected';
if (!currentCall.type) currentCall.type = 'voice';
if (currentCall.mic === undefined) currentCall.mic = true;
if (currentCall.cam === undefined) currentCall.cam = false;
if (window.musicHoldForCall) window.musicHoldForCall(false);
if (cdEl) cdEl.hidden = true;
if (nameEl) nameEl.textContent = partnerName();
if (statusEl) statusEl.textContent = currentCall.type === 'video' ? '视频通话中...' : '正在通话...';
setMaskBtns('active');
syncCallTypeUI();
if (window.chatAddSystem) window.chatAddSystem(callIconHtml(currentCall.type) + ' 通话已接通');
startCallDuration();
saveCallActive(); // v3.26.x：接通后更新持久化（记下 connectedTime 供中断恢复算时长）
scheduleCallReq();
setTimeout(() => {
if (currentCall && currentCall.status === 'connected') {
if (callMiniEnabled()) {
if (mask) mask.hidden = true;
if (mini) {
syncCallName();
syncCallAv();
syncCallTypeUI();
mini.hidden = false;
liftMiniIntoSafeArea(); // v3.26.x #137：显示时校正，防旧坐标落进系统状态栏区
}
}
}
}, 2000);
}
function rejectCall() {
if (!currentCall || currentCall.status !== 'ringing') return;
currentCall.status = 'ended';
endCall('已拒绝');
}
function userHangup() {
if (!currentCall) return;
if (currentCall.status === 'ringing') { currentCall.status = 'ended'; endCall('已取消'); return; }
if (currentCall.connectedTime) currentCall.durationSec = Math.floor((Date.now() - currentCall.connectedTime) / 1000);
currentCall.status = 'ended';
endCall('已挂断');
}
window.placeCall = function (callType) {
if (currentCall) { toast('已有通话中'); return; }
closeCallPreview();
closeCallTypePicker();
const ctype = callType === 'video' ? 'video' : 'voice';
const name = partnerName();
currentCall = bindCall({ direction: 'out', status: 'calling', startTime: Date.now(), durationSec: 0, type: ctype, mic: true, cam: ctype === 'video' });
const callRef = currentCall;
closeImageOverlay();
if (window.musicHoldForCall) window.musicHoldForCall(true);
shownAv = null;
shownName = null;
shownUserAv = null;
syncCallAv();
syncCallName();
if (nameEl) nameEl.textContent = name;
if (statusEl) statusEl.textContent = ctype === 'video' ? '正在发起视频通话...' : '正在呼叫...';
if (durEl) durEl.textContent = '00:00';
if (mask) mask.hidden = false;
setMaskBtns('calling');
syncCallTypeUI();
if (window.chatAddSystem) window.chatAddSystem(callIconHtml(ctype) + ' 我向 ' + name + ' 发起了' + callTypeText(ctype));
const r = Math.random() * 100;
const cc = callCfg();
setTimeout(() => {
if (currentCall !== callRef || callRef.status !== 'calling') return;
if (r < cc.busy) {
callRef.status = 'ended'; toast('对方忙线中'); endCall('忙线中');
} else if (r < cc.busy + cc.reject) {
callRef.status = 'ended'; toast('对方已拒绝'); endCall('对方已拒绝');
} else if (r < cc.busy + cc.reject + cc.pickup) {
callRef.status = 'connected';
if (window.musicHoldForCall) window.musicHoldForCall(false);
toast(ctype === 'video' ? '视频通话已接通' : '通话已接通');
if (statusEl) statusEl.textContent = ctype === 'video' ? '视频通话中...' : '正在通话...';
syncCallTypeUI();
startCallDuration();
saveCallActive(); // v3.26.x：去电接通后更新持久化
scheduleCallReq();
setTimeout(() => {
if (currentCall === callRef && callRef.status === 'connected') {
if (callMiniEnabled()) {
if (mask) mask.hidden = true;
if (mini) { syncCallName(); syncCallAv(); syncCallTypeUI(); mini.hidden = false; liftMiniIntoSafeArea(); /* v3.26.x #137 显示时校正 */ }
}
}
}, 2000);
} else {
callRef.status = 'ended'; toast('对方未接通'); endCall('未接通');
}
}, 1800 + Math.random() * 1500);
};
if (answerBtn) answerBtn.addEventListener('click', answerCall);
if (rejectBtn) rejectBtn.addEventListener('click', rejectCall);
if (hangBtn) hangBtn.addEventListener('click', userHangup);
if (miniBtn) miniBtn.addEventListener('click', minimizeCall);
if (document.getElementById('call-mini-hang')) document.getElementById('call-mini-hang').addEventListener('click', userHangup);
if (micBtn) micBtn.addEventListener('click', () => setCallMic(!(currentCall && currentCall.mic)));
if (camBtn) camBtn.addEventListener('click', () => setCallCam(!(currentCall && currentCall.cam)));
const reqOk = document.getElementById('call-req-ok');
const reqNo = document.getElementById('call-req-no');
if (reqOk) reqOk.addEventListener('click', () => resolveCallRequest(true));
if (reqNo) reqNo.addEventListener('click', () => resolveCallRequest(false));
function closeCallTypePicker() { if (typeMask) typeMask.hidden = true; }
window.openCallTypePicker = function () {
if (currentCall) { toast('已有通话中'); return; }
closeCallPreview();
if (typeName) typeName.textContent = partnerName();
if (typeMask) typeMask.hidden = false;
};
const typeVoiceBtn = document.getElementById('call-type-voice');
const typeVideoBtn = document.getElementById('call-type-video');
const typeCancelBtn = document.getElementById('call-type-cancel');
if (typeVoiceBtn) typeVoiceBtn.addEventListener('click', () => { closeCallTypePicker(); window.placeCall('voice'); });
if (typeVideoBtn) typeVideoBtn.addEventListener('click', () => { closeCallTypePicker(); window.placeCall('video'); });
if (typeCancelBtn) typeCancelBtn.addEventListener('click', closeCallTypePicker);
if (typeMask) typeMask.addEventListener('click', (e) => { if (e.target === typeMask) closeCallTypePicker(); });
document.addEventListener('contact-switched', closeCallTypePicker);
if (mask) mask.addEventListener('click', (e) => { if (e.target === mask && currentCall && currentCall.status === 'connected') minimizeCall(); });
if (mini) {
let dragging = false, moved = false, pressOnHang = false, pressLX = 0, pressLY = 0, startLeft = 0, startTop = 0;
function vpX(e) { const vv = window.visualViewport; return e.clientX + ((vv && vv.offsetLeft) || 0); }
function vpY(e) { const vv = window.visualViewport; return e.clientY + ((vv && vv.offsetTop) || 0); }
const stopPan = (ev) => { if (dragging && ev.cancelable) ev.preventDefault(); };
const stopPanOn = () => document.addEventListener('touchmove', stopPan, { passive: false });
const stopPanOff = () => document.removeEventListener('touchmove', stopPan);
mini.addEventListener('pointerdown', (e) => {
if (e.target.closest('#call-mini-hang')) { pressOnHang = true; return; } // 挂断按钮不触发拖动
pressOnHang = false;
dragging = true;
moved = false;
const r = mini.getBoundingClientRect();
pressLX = vpX(e); pressLY = vpY(e);
startLeft = r.left; startTop = r.top; // 按下瞬间小框左上角的屏幕（布局）位
try { mini.setPointerCapture && mini.setPointerCapture(e.pointerId); } catch (err) {}
stopPanOn();
e.preventDefault();
});
document.addEventListener('pointermove', (e) => {
if (!dragging) return;
if (!moved) {
mini.style.bottom = 'auto';
mini.style.transform = 'none';
moved = true;
}
const mw = mini.offsetWidth, mh = mini.offsetHeight;
const vv = window.visualViewport;
const vw = (vv && vv.width) || window.innerWidth;
const vh = (vv && vv.height) || window.innerHeight;
const voL = (vv && vv.offsetLeft) || 0, voT = (vv && vv.offsetTop) || 0;
let tx = startLeft + (vpX(e) - pressLX);
let ty = startTop + (vpY(e) - pressLY);
tx = Math.max(Math.max(4, voL), Math.min(voL + vw - mw - 4, tx));
ty = Math.max(Math.max(miniSafeTop(), voT), Math.min(voT + vh - mh - 4, ty));
const c = mini.getBoundingClientRect();
mini.style.left = ((mini.offsetLeft || 0) + (tx - c.left)) + 'px';
mini.style.top = ((mini.offsetTop || 0) + (ty - c.top)) + 'px';
}, { passive: false });
const persistPos = () => {
if (moved && mini.style.left && mini.style.top) {
if (miniPos) { miniPos.left = mini.style.left; miniPos.top = mini.style.top; }
else miniPos = { left: mini.style.left, top: mini.style.top };
store.set('call-mini-pos', JSON.stringify(miniPos));
}
};
document.addEventListener('pointerup', () => {
if (!dragging) return;
persistPos();
const tap = !moved && !pressOnHang;
pressOnHang = false;
dragging = false;
stopPanOff();
if (tap) openCallPanelFromMini();
});
document.addEventListener('pointercancel', () => {
if (!dragging) return;
persistPos();
pressOnHang = false;
dragging = false;
stopPanOff();
});
}
function toast(msg) {
let t = document.getElementById('cc-toast');
if (!t) { t = document.createElement('div'); t.id = 'cc-toast'; document.body.appendChild(t); }
t.textContent = msg;
t.className = 'cc-toast'; void t.offsetWidth; t.className = 'cc-toast show';
clearTimeout(t._timer);
t._timer = setTimeout(() => { t.className = 'cc-toast'; }, 2000);
}
window.triggerIncomingCall = incomingCall;
function callLast() { const v = parseInt(store.get('records-call-last'), 10); return isNaN(v) ? 0 : v; }
function maybeIncoming() {
try {
if (window.nightModeActive && window.nightModeActive()) return;
if (currentCall) return;
const now = Date.now();
const last = Math.min(callLast(), now);
if (now - last < 300000) return; // 5 分钟冷却
if (Math.random() * 100 >= callCfg().incoming) return;
store.set('records-call-last', String(now));
const ctype = Math.random() * 100 < callCfg().videoProb ? 'video' : 'voice';
if (document.hidden) {
holdIncomingCall(partnerName(), window.__activeCid || 'default', undefined, false, ctype);
return;
}
incomingCall(false, false, ctype);
} catch (e) {}
}
window.callMaybeTrigger = maybeIncoming;
window.getCallState = function () {
if (!currentCall) return null;
const start = currentCall.connectedTime || currentCall.startTime;
return {
status: currentCall.status,           // ringing(来电) | calling(呼出中) | connected(通话中)
direction: currentCall.direction,     // in | out
name: currentCall.name || partnerName(),
type: currentCall.type || 'voice',    // voice | video
mic: !!currentCall.mic,
cam: !!currentCall.cam,
durationSec: Math.max(0, Math.floor((Date.now() - start) / 1000))
};
};
window.hangupCall = function () { userHangup(); };
window.callRequestNow = function (kind) { showCallRequest(kind === 'mic' ? 'mic' : 'cam'); };
window.callInProgress = function () {
if (currentCall) return true;
try {
const raw = sessionStorage.getItem(CALL_ACTIVE_KEY) || localStorage.getItem(CALL_ACTIVE_KEY);
const info = raw ? JSON.parse(raw) : null;
if (info && info.connectedTime && Date.now() - (info.ts || 0) <= 600000) return true;
} catch (e) {}
return false;
};
function recoverCall() {
let info = null;
try { info = JSON.parse(sessionStorage.getItem(CALL_ACTIVE_KEY) || 'null'); } catch (e) { info = null; }
if (info) { recoverProcess(info, 'ss'); return; }
try { info = JSON.parse(localStorage.getItem(CALL_ACTIVE_KEY) || 'null'); } catch (e) { info = null; }
if (info) { recoverProcess(info, 'ls'); return; }
if (window.idbGet) {
window.idbGet(CALL_ACTIVE_KEY).then(function (ih) {
if (ih && ih.ts) recoverProcess(ih, 'idb');
}).catch(function () {});
}
}
function recoverProcess(info, src) {
if (!info.connectedTime) { clearCallActive(); return; } // 未接通就中断（响铃/呼叫中刷新），不恢复不记
const age = Date.now() - (info.ts || 0);
const windowMs = src === 'idb' ? CALL_IDB_WINDOW : CALL_RESUME_WINDOW;
if (age > windowMs) {
clearCallActive();
if (src !== 'idb') writeInterruptRecord(info);
return;
}
const cid = info.cid || 'default';
const dir = info.direction || 'out';
const name = info.name || 'TA';
if (callCfg().resume !== 0) {
try {
currentCall = { cid: cid, direction: dir, status: 'connected', startTime: info.startTime || info.connectedTime, connectedTime: info.connectedTime, hangupAt: info.hangupAt || 0, durationSec: 0, name: name, av: info.av || '', type: info.type === 'video' ? 'video' : 'voice', mic: info.mic !== false && info.mic !== 0 && info.mic !== '0', cam: info.cam === true || info.cam === 1 || info.cam === '1' };
shownAv = null; shownName = null; shownUserAv = null;
if (callMiniEnabled()) {
if (mask) mask.hidden = true;
if (cdEl) cdEl.hidden = true;
if (mini) { syncCallName(); syncCallAv(); syncCallTypeUI(); mini.hidden = false; liftMiniIntoSafeArea(); /* v3.26.x #137 显示时校正 */ }
} else {
if (mask) mask.hidden = false;
if (cdEl) cdEl.hidden = true;
if (nameEl) nameEl.textContent = name;
if (statusEl) statusEl.textContent = currentCall.type === 'video' ? '视频通话中...' : '正在通话...';
setMaskBtns('active');
syncCallAv(); syncCallName(); syncCallTypeUI();
}
startCallDuration();
saveCallActive(); // #120 回写 sessionStorage（后续刷新优先走 sessionStorage 快路径）+ 刷新 ts
scheduleCallReq();
} catch (e) {
currentCall = null; shownAv = null; shownName = null;
if (mini) mini.hidden = true;
if (mask) mask.hidden = true;
if (cdEl) cdEl.hidden = true;
clearCallActive();
writeInterruptRecord(info);
}
return;
}
clearCallActive();
writeInterruptRecord(info);
}
function writeInterruptRecord(info) {
const cid = info.cid || 'default';
const dir = info.direction || 'out';
const name = info.name || 'TA';
const isVideo = info.type === 'video';
const dur = Math.max(0, Math.floor((info.ts - info.connectedTime) / 1000));
const durTxt = dur > 0 ? ' · 时长 ' + fmtDur(dur) : '';
const recText = (isVideo ? '视频通话 · ' : '') + '通话中断（页面刷新或异常退出）' + durTxt;
const sysHtml = callIconHtml(isVideo ? 'video' : 'voice') + (dir === 'in' ? name + (isVideo ? ' 视频来电' : ' 来电') : '我拨打 ' + name) + ' · 通话中断' + durTxt;
try {
const s = (window.storeFor && window.storeFor(cid)) || store;
let list = [];
try { list = JSON.parse(s.get('records-call') || '[]'); } catch (e) { list = []; }
if (!Array.isArray(list)) list = [];
list.unshift({ type: dir, text: recText, ts: Date.now(), ended: 'interrupt', video: isVideo });
s.set('records-call', JSON.stringify(list.slice(0, 50)));
if (window.idbSet) { try { window.idbSet('xy-home-v2:' + cid + ':records-call', list.slice(0, 50)); } catch (e) {} }
} catch (e) {}
try {
const cur = window.__activeCid || 'default';
if (cid === cur) { if (window.chatAddSystem) window.chatAddSystem(sysHtml); }
else if (window.chatAppendToDeskMsg) { window.chatAppendToDeskMsg(cid, sysHtml); }
} catch (e) {}
try { if (!document.getElementById('page-home').hidden && window.__renderHomeCall) window.__renderHomeCall(); } catch (e) {}
}
function bootCallResume() {
try { recoverCall(); } catch (e) {}
setTimeout(function () { try { resumeHeldCall(); } catch (e) {} }, 1200);
}
if (window.__mochiDataReady) { try { bootCallResume(); } catch (e) {} }
else { try { document.addEventListener('mochi-restore-done', function () { try { bootCallResume(); } catch (e) {} }); } catch (e) {} }
setTimeout(function () { try { resumeHeldCall(); } catch (e) {} }, 20000); // 回填挂起设备兜底（幂等）
setTimeout(() => {
function scheduleCallCheck() {
maybeIncoming();
setTimeout(scheduleCallCheck, (60 + Math.random() * 60) * 1000);
}
scheduleCallCheck();
}, (45 + Math.random() * 75) * 1000);
})();
if (window.__mochiLoaded) window.__mochiLoaded.push("call.js");
} catch (__e) { if (window.__mochiErrLoaded) window.__mochiErrLoaded.push("call.js"); try { console.error("[JS] call.js", __e && __e.message || __e); } catch (x) {} if (window.__jsErrors) window.__jsErrors.push("[call.js] " + String(__e && __e.message || __e)); } })();