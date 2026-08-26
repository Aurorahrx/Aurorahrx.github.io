/** 动态前10成分追踪：
 *  视图1「月度排名」：universe-marketcap.json + ndx100-history.csv，按月市值排名。
 *  视图2「调仓明细」：top10-schedule.json，按季度显示买入/卖出/持有。
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
    return new Date(Date.UTC(y, m, 0));
  }

  let months = [];
  let top10ByMonth = {};
  let quarters = [];
  let rebalance = []; // {date, entered[], exited[], kept[]}
  let nameMap = {};
  let view = "monthly";
  let playTimer = null;

  async function init() {
    const [uResp, cResp, sResp] = await Promise.all([
      fetch("data/universe-marketcap.json"),
      fetch("data/ndx100-history.csv"),
      fetch("data/top10-schedule.json"),
    ]);
    const universe = await uResp.json();
    const csvText = await cResp.text();
    const members = parseCsv(csvText);
    nameMap = {};
    members.forEach((x) => { nameMap[x.symbol] = x.name; });
    const schedule = await sResp.json();

    // 月度排名数据
    const monthSet = new Set();
    for (const sym in universe) for (const m in universe[sym].monthly) monthSet.add(m);
    months = Array.from(monthSet).sort();
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

    // 调仓明细数据（季度，与回测一致）
    quarters = schedule.map((e) => e.date);
    rebalance = [];
    let prevSet = null;
    for (const e of schedule) {
      const cur = e.symbols;
      const curSet = new Set(cur);
      let entered, exited, kept;
      if (prevSet === null) {
        entered = cur.slice(); exited = []; kept = [];
      } else {
        entered = cur.filter((s) => !prevSet.has(s));
        exited = Array.from(prevSet).filter((s) => !curSet.has(s));
        kept = cur.filter((s) => prevSet.has(s));
      }
      rebalance.push({ date: e.date, entered, exited, kept });
      prevSet = curSet;
    }

    // UI
    const slider = document.getElementById("range");
    const setRange = () => {
      slider.max = dataLen() - 1;
      slider.value = dataLen() - 1;
    };
    slider.addEventListener("input", () => { stopPlay(); render(Number(slider.value)); });
    document.getElementById("prev").addEventListener("click", () => { stopPlay(); slider.value = Math.max(0, Number(slider.value) - 1); render(Number(slider.value)); });
    document.getElementById("next").addEventListener("click", () => { stopPlay(); slider.value = Math.min(dataLen() - 1, Number(slider.value) + 1); render(Number(slider.value)); });
    document.getElementById("play").addEventListener("click", togglePlay);
    document.querySelectorAll('input[name="view"]').forEach((r) => {
      r.addEventListener("change", () => { view = r.value; stopPlay(); setRange(); render(Number(slider.value)); });
    });

    setRange();
    render(dataLen() - 1);
  }

  function dataLen() {
    return view === "rebalance" ? quarters.length : months.length;
  }

  function togglePlay() {
    const btn = document.getElementById("play");
    if (playTimer) { stopPlay(); return; }
    btn.textContent = "⏸ 暂停";
    const slider = document.getElementById("range");
    playTimer = setInterval(() => {
      if (Number(slider.value) >= dataLen() - 1) { stopPlay(); return; }
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
    document.getElementById("monthly-view").style.display = view === "monthly" ? "" : "none";
    document.getElementById("rebalance-view").style.display = view === "rebalance" ? "" : "none";
    document.getElementById("rank-note").textContent = `${idx + 1} / ${dataLen()} ${view === "rebalance" ? "季度" : "月"}`;
    if (view === "rebalance") renderRebalance(idx);
    else renderMonthly(idx);
  }

  function chip(sym) {
    return `<span class="rb-item"><b>${sym}</b><small>${nameMap[sym] || ""}</small></span>`;
  }

  function renderRebalance(idx) {
    const rb = rebalance[idx];
    document.getElementById("label").textContent = rb.date;
    const noChange = rb.entered.length === 0 && rb.exited.length === 0;
    document.getElementById("rb-head").textContent =
      `${rb.date} 调仓明细` + (noChange ? "（名单无变化，仅等权再平衡）" : `（买入 ${rb.entered.length} 只 / 卖出 ${rb.exited.length} 只）`);
    document.getElementById("rb-buy").innerHTML = rb.entered.length ? rb.entered.map(chip).join("") : '<span class="rb-none">无</span>';
    document.getElementById("rb-sell").innerHTML = rb.exited.length ? rb.exited.map(chip).join("") : '<span class="rb-none">无</span>';
    document.getElementById("rb-hold").innerHTML = rb.kept.length ? rb.kept.map(chip).join("") : '<span class="rb-none">无</span>';
  }

  function renderMonthly(idx) {
    const m = months[idx];
    const list = top10ByMonth[m] || [];
    document.getElementById("label").textContent = m;

    const prevList = idx > 0 ? top10ByMonth[months[idx - 1]] || [] : [];
    const prevSyms = new Set(prevList.map((x) => x.symbol));
    const curSyms = new Set(list.map((x) => x.symbol));
    const entered = list.filter((x) => !prevSyms.has(x.symbol));
    const exited = prevList.filter((x) => !curSyms.has(x.symbol));
    const info = [];
    if (entered.length) info.push(`🆕 新进：${entered.map((x) => x.symbol).join("、")}`);
    if (exited.length) info.push(`⬇ 退出：${exited.map((x) => x.symbol).join("、")}`);
    document.getElementById("change-info").textContent = info.join("　") || "本月与上月前10名单一致";

    const prevRank = {};
    prevList.forEach((x, i) => { prevRank[x.symbol] = i; });

    const totalCap = list.reduce((s, x) => s + x.mcap, 0);
    document.querySelector("#table tbody").innerHTML = list.map((x, i) => {
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
