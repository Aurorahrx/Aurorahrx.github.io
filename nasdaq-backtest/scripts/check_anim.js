/** 验证播放动画：点击 #play 后进度应前进 */
"use strict";
const base = "http://127.0.0.1:9222";

(async () => {
  const targets = await (await fetch(base + "/json")).json();
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = {};
  const send = (method, params = {}) => new Promise((res) => {
    const i = ++id; pending[i] = res; ws.send(JSON.stringify({ id: i, method, params }));
  });
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) { pending[m.id](m.result); delete pending[m.id]; } };
  await new Promise((r) => (ws.onopen = r));
  await new Promise((r) => setTimeout(r, 5000));

  const read = async () => (await send("Runtime.evaluate", {
    expression: `JSON.stringify({p: document.getElementById('progress').value, btn: document.getElementById('play').textContent, yr: document.getElementById('year-label').textContent})`,
    returnByValue: true,
  })).result.value;

  console.log("before:", await read());
  await send("Runtime.evaluate", { expression: `document.getElementById('play').click()` });
  await new Promise((r) => setTimeout(r, 2000));
  console.log("after 2s:", await read());
  await send("Runtime.evaluate", { expression: `document.getElementById('play').click()` }); // 暂停
  await new Promise((r) => setTimeout(r, 300));
  console.log("paused:", await read());
  ws.close();
})();
