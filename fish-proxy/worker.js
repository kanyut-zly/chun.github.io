/* Fish Audio 中转（Cloudflare Worker）
 *
 * 为什么需要它：api.fish.audio 在国内经常被 DNS 污染 / 直连超时，
 * 开了 VPN 也可能只代理了别的 App，浏览器这一路没走代理。
 * 这个 Worker 只做一件事：把 App 的请求原样转给 api.fish.audio，并补上跨域头。
 *
 * 怎么用（3 分钟）：
 *   1. 打开 https://dash.cloudflare.com → 注册 / 登录（免费）
 *   2. 左边 Workers & Pages → Create → Worker → 取个名字（比如 fish-proxy）→ Deploy
 *   3. 点 Edit code，把本文件的内容整个粘进去（覆盖原来的示例）→ Deploy
 *   4. 复制你的地址，形如 https://fish-proxy.你的名字.workers.dev
 *   5. 回到 App：设置 → 语音 → Fish Audio → 「接口地址」填这个地址（不要带 /v1/tts）
 *   6. 点「试听一句」，能出声就成了
 *
 * 安全说明：你的 Fish API Key 是 App 每次请求自己带在 Authorization 头里的，
 * 不存在这个 Worker 里，也不会被记下来。这个 Worker 只允许转发到 api.fish.audio。
 */

const UPSTREAM = 'https://api.fish.audio';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400'
};

export default {
  async fetch(req) {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(req.url);

    // 只转发 Fish 的接口路径，免得被当成万能代理乱用
    if (!/^\/(v1\/|model|wallet|openapi)/i.test(url.pathname)) {
      return new Response('fish-proxy: only /v1/* and /model are allowed', {
        status: 404,
        headers: Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, CORS)
      });
    }

    const headers = new Headers(req.headers);
    // 这几个是 Cloudflare 加的，转给上游可能引起签名/校验问题
    ['host', 'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor',
     'x-forwarded-proto', 'x-forwarded-for', 'x-real-ip'].forEach(function (h) {
      headers.delete(h);
    });

    const init = { method: req.method, headers: headers, redirect: 'follow' };
    if (req.method !== 'GET' && req.method !== 'HEAD') init.body = req.body;

    let res;
    try {
      res = await fetch(UPSTREAM + url.pathname + url.search, init);
    } catch (e) {
      return new Response('fish-proxy: cannot reach api.fish.audio (' + (e && e.message || e) + ')', {
        status: 502,
        headers: Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, CORS)
      });
    }

    const out = new Headers(res.headers);
    Object.keys(CORS).forEach(function (k) { out.set(k, CORS[k]); });
    out.delete('content-security-policy');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
  }
};
