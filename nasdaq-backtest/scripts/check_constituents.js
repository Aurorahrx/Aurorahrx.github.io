/** 检查 constituents.html 每月动态前10 */
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
  await new Promise((r) => setTimeout(r, 7000));

  const evaljs = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true })).result.value;
  const read = () => evaljs(`JSON.stringify({
    month: document.getElementById('month-label').textContent,
    note: document.getElementById('rank-note').textContent,
    change: document.getElementById('change-info').textContent,
    rows: document.querySelector('#table tbody').innerText.replace(/\\n/g,' | ').slice(0,200)
  })`);

  console.log("latest month:", await read());
  // 切到 2015 年左右
  await evaljs(`(()=>{const s=document.getElementById('month-range'); const idx=[...s.parentNode.querySelectorAll('*')]; s.value=110; s.dispatchEvent(new Event('input')); return s.value;})()`);
  console.log("month 110:", await read());
  ws.close();
})();
