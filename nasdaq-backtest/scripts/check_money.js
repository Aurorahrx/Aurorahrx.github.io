/** 检查主页面：盈亏浮层 + 资金曲线视图切换 */
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
  const readOverlay = () => evaljs(`JSON.stringify({label: document.getElementById('ov-label').textContent, v: document.getElementById('ov-value').textContent, p: document.getElementById('ov-pnl').textContent, pc: document.getElementById('ov-pnl').style.color})`);

  console.log("== 默认(定投QQQ, 对比视图) ==");
  console.log("overlay:", await readOverlay());

  console.log("== 切到 资金曲线 视图 ==");
  await evaljs(`(()=>{const s=document.getElementById('view'); s.value='money'; s.dispatchEvent(new Event('change')); return s.value;})()`);
  console.log("overlay:", await readOverlay());

  console.log("== 切到 前10跟踪 ==");
  await evaljs(`(()=>{const s=document.getElementById('strategy'); s.value='top10'; s.dispatchEvent(new Event('change')); return s.value;})()`);
  console.log("overlay:", await readOverlay());

  ws.close();
})();
