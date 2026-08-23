/** 通过 CDP 检查页面运行时状态（需先启动 chrome --remote-debugging-port=9222） */
"use strict";
const base = "http://127.0.0.1:9222";

(async () => {
  try {
    const targets = await (await fetch(base + "/json")).json();
    const page = targets.find((t) => t.type === "page");
    if (!page) { console.error("无页面 target"); process.exit(2); }
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let id = 0;
    const pending = {};
    const send = (method, params = {}) =>
      new Promise((res, rej) => {
        const i = ++id; pending[i] = { res, rej };
        ws.send(JSON.stringify({ id: i, method, params }));
      });
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending[m.id]) { pending[m.id].res(m.result); delete pending[m.id]; }
    };
    await new Promise((r) => (ws.onopen = r));

    // 等页面 JS 执行
    await new Promise((r) => setTimeout(r, 8000));

    const expr = `JSON.stringify({
      status: document.getElementById('status')?.textContent,
      dca: document.getElementById('dca-metrics')?.textContent?.replace(/\\s+/g,' ').trim(),
      top10: document.getElementById('top10-metrics')?.textContent?.replace(/\\s+/g,' ').trim(),
      play: document.getElementById('play')?.textContent,
      canvas: (document.getElementById('chart')?.width||0)+'x'+(document.getElementById('chart')?.height||0)
    })`;
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
    const data = JSON.parse(r.result.value);
    console.log("status :", data.status);
    console.log("dca    :", data.dca);
    console.log("top10  :", data.top10);
    console.log("play   :", data.play);
    console.log("canvas :", data.canvas);
    ws.close();
  } catch (e) {
    console.error("检查失败:", e.message);
    process.exit(1);
  }
})();
