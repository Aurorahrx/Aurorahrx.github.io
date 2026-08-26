/** 检查调仓明细视图 */
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

  // 切到调仓明细视图
  await evaljs(`(()=>{const r=document.querySelector('input[name=view][value=rebalance]'); r.checked=true; r.dispatchEvent(new Event('change')); return 'ok';})()`);
  await new Promise((r) => setTimeout(r, 300));
  const read = () => evaljs(`JSON.stringify({
    head: document.getElementById('rb-head').textContent,
    label: document.getElementById('label').textContent,
    buy: document.getElementById('rb-buy').innerText.replace(/\\n/g,' '),
    sell: document.getElementById('rb-sell').innerText.replace(/\\n/g,' '),
    hold: document.getElementById('rb-hold').innerText.replace(/\\n/g,' ').slice(0,120)
  })`);

  console.log("== 最新季度 ==");
  console.log(await read());

  // 找 2021-12-31（AVGO进/INTC出），季度 index ≈ 63
  await evaljs(`(()=>{const s=document.getElementById('range'); s.value=63; s.dispatchEvent(new Event('input')); return s.value;})()`);
  console.log("== 季度 index 63 ==");
  console.log(await read());

  ws.close();
})();
