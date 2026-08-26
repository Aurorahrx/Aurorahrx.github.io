/** 动态前10成分追踪（每月）：
 *  读取 universe-marketcap.json + ndx100-history.csv，按月末市值排名动态选前10。
 */
(function () {
  "use strict";

  function parseCsv(text) {
    const lines = text.trim().split("\n");
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = [];
      let cur = "", inQ = false;
      for (const ch of lines[i]) {
        if (ch === '"') inQ = !inQ;
        else if (ch === "," && !inQ) { parts.push(cur); cur = ""; }
        else cur += ch;
      }
      parts.push(cur);
      if (parts.length < 4) continue;
      const d = (s) => (s && s.trim() ? new Date(s.trim() + "T00:00:00Z") : null);
      rows.push({
        symbol: parts[0].trim(),
        name: parts[1].replace(/^"|"$/g, "").trim(),
        optIn: d(parts[2]) || new Date("1900-01-01T00:00:00Z"),
        optOut: d(parts[3]),
      });
    }
    return rows;
  }

  function monthEnd(monthStr) {
    const [y, m] = monthStr.split("-").map(Number);
    return new Date(Date.UTC(y, m, 0)); // m 为 1-12，Date.UTC 月份 0 基 → 上个月最后一天=本月底
  }

  let months = [];
  let top10ByMonth = {};
  let members = [];
  let playTimer = null;

  async function init() {
    const [uResp, cResp] = await Promise.all([
      fetch("data/universe-marketcap.json"),
      fetch("data/ndx100-history.csv"),
    ]);
    const universe = await uResp.json();
    const csvText = await cResp.text();
    members = parseCsv(csvText);

    // 收集所有月份并排序
    const monthSet = new Set();
    for (const sym in universe) {
      for (const m in universe[sym].monthly) monthSet.add(m);
    }
    months = Array.from(monthSet).sort();

    // 预计算每月前10
    top10ByMonth = {};
    for (const m of months) {
      const end = monthEnd(m);
      const active = members.filter((x) => x.optIn <= end && (x.optOut == null || x.optOut >= end));
      const caps = [];
      for (const x of active) {
        const u = universe[x.symbol];
        if (!u || u.shares == null) continue;
        const p = u.monthly[m];
        if (p == null) continue;
        caps.push({ symbol: x.symbol, name: x.name, mcap: p * u.shares });
      }
      caps.sort((a, b) => b.mcap - a.mcap);
      top10ByMonth[m] = caps.slice(0, 10);
    }

    // UI
    const slider = document.getElementById("month-range");
    slider.max = months.length - 1;
    slider.value = months.length - 1; // 默认最新月
    slider.addEventListener("input", () => { stopPlay(); render(Number(slider.value)); });
    document.getElementById("prev").addEventListener("click", () => { stopPlay(); slider.value = Math.max(0, Number(slider.value) - 1); render(Number(slider.value)); });
    document.getElementById("next").addEventListener("click", () => { stopPlay(); slider.value = Math.min(months.length - 1, Number(slider.value) + 1); render(Number(slider.value)); });
    document.getElementById("play").addEventListener("click", togglePlay);

    render(months.length - 1);
  }

  function togglePlay() {
    const btn = document.getElementById("play");
    if (playTimer) { stopPlay(); return; }
    btn.textContent = "⏸ 暂停";
    const slider = document.getElementById("month-range");
    playTimer = setInterval(() => {
      if (Number(slider.value) >= months.length - 1) { stopPlay(); return; }
      slider.value = Number(slider.value) + 1;
      render(Number(slider.value));
    }, 600);
  }
  function stopPlay() {
    if (playTimer) clearInterval(playTimer);
    playTimer = null;
    document.getElementById("play").textContent = "▶ 播放";
  }

  function render(idx) {
    const m = months[idx];
    const list = top10ByMonth[m] || [];
    document.getElementById("month-label").textContent = m;
    document.getElementById("rank-note").textContent = `${idx + 1} / ${months.length} 月`;

    // 变化信息（对比上月）
    const prevList = idx > 0 ? top10ByMonth[months[idx - 1]] || [] : [];
    const prevSyms = new Set(prevList.map((x) => x.symbol));
    const curSyms = new Set(list.map((x) => x.symbol));
    const entered = list.filter((x) => !prevSyms.has(x.symbol));
    const exited = prevList.filter((x) => !curSyms.has(x.symbol));
    const info = [];
    if (entered.length) info.push(`🆕 新进：${entered.map((x) => x.symbol).join("、")}`);
    if (exited.length) info.push(`⬇ 退出：${exited.map((x) => x.symbol).join("、")}`);
    document.getElementById("change-info").textContent = info.join("　") || "本月与上月前10名单一致";

    // 排名变化箭头
    const prevRank = {};
    prevList.forEach((x, i) => { prevRank[x.symbol] = i; });

    const totalCap = list.reduce((s, x) => s + x.mcap, 0);
    const tbody = document.querySelector("#table tbody");
    tbody.innerHTML = list.map((x, i) => {
      const pr = prevRank[x.symbol];
      let arrow = "";
      if (pr == null) arrow = `<span class="tag-new">🆕</span>`;
      else if (pr > i) arrow = `<span class="tag-new">▲${pr - i}</span>`;
      else if (pr < i) arrow = `<span class="tag-out">▼${i - pr}</span>`;
      const wt = totalCap > 0 ? (x.mcap / totalCap * 100) : 0;
      return `<tr>
        <td class="rank">${i + 1}${arrow}</td>
        <td class="sym">${x.symbol}</td>
        <td>${x.name}</td>
        <td class="mcap">${(x.mcap / 1e9).toFixed(1)}</td>
        <td class="wt">${wt.toFixed(1)}%</td>
      </tr>`;
    }).join("");
  }

  window.addEventListener("DOMContentLoaded", init);
})();
