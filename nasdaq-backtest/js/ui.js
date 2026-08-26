/** UI 逻辑：装配数据、运行回测、渲染图表（含播放动画、资金曲线、盈亏显示） */
window.App = (function () {
  "use strict";

  const fmtMoney = (v) => "$" + Math.round(v).toLocaleString("en-US");
  const fmtMoney2 = (v) => (v < 0 ? "-$" : "$") + Math.abs(Math.round(v)).toLocaleString("en-US");
  const fmtPct = (v) => (v * 100).toFixed(1) + "%";

  let dcaRes = null;
  let top10Res = null;
  let axis = [];
  let compareSeries = null;      // 归一化对比曲线
  let money = { dca: null, top10: null }; // 资金曲线 {dates, value, cost}
  let animId = null;
  let playing = false;
  let viewMode = "compare";      // compare | money
  let strategy = "dca";          // dca | top10
  let top10Mode = "dca";         // dca | lump
  let initialCapital = 10000;

  const els = {};

  async function init() {
    els.run = document.getElementById("run");
    els.play = document.getElementById("play");
    els.speed = document.getElementById("speed");
    els.progress = document.getElementById("progress");
    els.year = document.getElementById("year-label");
    els.chart = document.getElementById("chart");
    els.status = document.getElementById("status");
    els.view = document.getElementById("view");
    els.strategy = document.getElementById("strategy");
    els.top10Mode = document.getElementById("top10-mode");
    els.ovValue = document.getElementById("ov-value");
    els.ovPnl = document.getElementById("ov-pnl");
    els.ovLabel = document.getElementById("ov-label");

    els.run.addEventListener("click", run);
    els.play.addEventListener("click", togglePlay);
    els.progress.addEventListener("input", onSeek);
    els.view.addEventListener("change", () => { viewMode = els.view.value; redraw(); });
    els.strategy.addEventListener("change", () => { strategy = els.strategy.value; redraw(); });
    els.top10Mode.addEventListener("change", () => { top10Mode = els.top10Mode.value; run(); });

    await run();
  }

  async function run() {
    els.status.textContent = "计算中…";

    const amount = Number(document.getElementById("amount").value) || 1000;
    const freq = document.getElementById("freq").value || "monthly";
    const start = document.getElementById("start").value || "2006-01-01";
    const dcaOpts = { amount, freq, start };
    const top10Opts = top10Mode === "dca"
      ? { weight: "equal", start, amount, freq }
      : { weight: "equal", start, initial: initialCapital };

    try {
      stopAnim();
      const qqq = await Data.loadSymbol(CONFIG.dcaSymbol);
      dcaRes = Backtest.backtestDCA(qqq, dcaOpts);

      let schedule = await Data.loadSchedule();
      let mode = "V2 动态前10";
      if (!schedule || schedule.length === 0) {
        schedule = [{ date: start, symbols: CONFIG.top10Fixed.slice() }];
        mode = "V1 固定前10";
      }
      const union = new Set();
      schedule.forEach((e) => e.symbols.forEach((s) => union.add(s)));
      const symbols = Array.from(union);
      const list = await Data.loadMany(symbols);
      const seriesMap = {};
      symbols.forEach((s, i) => { seriesMap[s] = list[i]; });
      top10Res = Backtest.backtestTop10(seriesMap, schedule, top10Opts);

      buildSeries();
      redraw();
      fillMetrics("dca-metrics", dcaRes.metrics, true);
      fillMetrics("top10-metrics", top10Res.metrics, false);

      els.progress.value = 1000;
      els.year.textContent = axis[axis.length - 1].slice(0, 4);
      els.status.textContent =
        `完成 · ${start} ~ ${axis[axis.length - 1]} · ${mode} · 前10投入=${top10Mode === "dca" ? "每月定投" : "一次性"}`;
    } catch (e) {
      els.status.textContent = "出错：" + e.message;
      console.error(e);
    }
  }

  /** 构建归一化对比曲线 + 各策略资金曲线 */
  function buildSeries() {
    axis = dcaRes.dates;
    const align = (values, fromDates) => {
      const m = new Map();
      fromDates.forEach((d, i) => m.set(d, values[i]));
      return axis.map((d) => (m.has(d) ? m.get(d) : null));
    };
    const dcaNorm = dcaRes.equity.map((v, i) => (dcaRes.invested[i] > 0 ? v / dcaRes.invested[i] : 1));
    let top10Norm;
    if (top10Res.mode === "dca") {
      top10Norm = top10Res.equity.map((v, i) => (top10Res.invested[i] > 0 ? v / top10Res.invested[i] : 1));
    } else {
      const base = top10Res.equity[0] || 1;
      top10Norm = top10Res.equity.map((v) => v / base);
    }
    compareSeries = [
      { name: "定投 QQQ（策略A）", values: dcaNorm, color: CONFIG.theme.accent1 },
      { name: "前10跟踪（策略B）", values: align(top10Norm, top10Res.dates), color: CONFIG.theme.accent2 },
    ];

    money.dca = { dates: dcaRes.dates, value: dcaRes.equity, cost: dcaRes.invested };
    money.top10 = { dates: top10Res.dates, value: top10Res.equity, cost: top10Res.invested };
  }

  function curProgress() {
    return Number(els.progress.value) / 1000;
  }

  function redraw() {
    const p = curProgress();
    drawChartAt(p);
    updateOverlay(p);
  }

  function drawChartAt(progress) {
    if (viewMode === "money") {
      const m = money[strategy];
      const color = strategy === "dca" ? CONFIG.theme.accent1 : CONFIG.theme.accent2;
      Chart.draw(els.chart, {
        dates: m.dates,
        series: [
          { name: "总持仓", values: m.value, color },
          { name: "本金", values: m.cost, color: CONFIG.theme.muted, dash: [6, 4], fill: false, width: 1.5 },
        ],
        yFormat: fmtMoney,
        progress,
      });
    } else {
      Chart.draw(els.chart, {
        dates: axis,
        series: compareSeries,
        yFormat: (v) => v.toFixed(1) + "x",
        progress,
      });
    }
  }

  function updateOverlay(progress) {
    const m = money[strategy];
    if (!m) return;
    const idx = Math.max(0, Math.min(m.dates.length - 1, Math.floor(progress * m.dates.length)));
    const value = m.value[idx];
    const cost = m.cost[idx];
    const pnl = value - cost;
    const label = strategy === "dca" ? "定投 QQQ" : (top10Mode === "dca" ? "前10跟踪（定投）" : "前10跟踪（一次性）");
    els.ovLabel.textContent = label;
    els.ovValue.textContent = fmtMoney(value);
    els.ovPnl.textContent = fmtMoney2(pnl);
    els.ovPnl.style.color = pnl >= 0 ? CONFIG.theme.up : CONFIG.theme.down;
  }

  function togglePlay() {
    if (playing) { stopAnim(); return; }
    if (Number(els.progress.value) >= 1000) els.progress.value = 0;
    playing = true;
    els.play.textContent = "⏸ 暂停";
    const speed = Number(els.speed.value) || 1;
    const dur = 9000 / speed;
    const t0 = performance.now() - (Number(els.progress.value) / 1000) * dur;
    const step = (now) => {
      if (!playing) return;
      let p = (now - t0) / dur;
      if (!isFinite(p)) p = 0;
      p = Math.max(0, Math.min(1, p));
      els.progress.value = Math.round(p * 1000);
      const d = viewMode === "money" ? money[strategy].dates : axis;
      const idx = Math.max(0, Math.min(d.length - 1, Math.floor(p * d.length)));
      if (d[idx]) els.year.textContent = d[idx].slice(0, 4);
      drawChartAt(p);
      updateOverlay(p);
      if (p < 1) animId = requestAnimationFrame(step);
      else stopAnim(true);
    };
    animId = requestAnimationFrame(step);
  }

  function stopAnim(finished) {
    playing = false;
    if (animId) cancelAnimationFrame(animId);
    animId = null;
    els.play.textContent = "▶ 播放动画";
    if (finished) { els.progress.value = 1000; drawChartAt(1); updateOverlay(1); }
  }

  function onSeek() {
    const p = curProgress();
    const d = viewMode === "money" ? money[strategy].dates : axis;
    const idx = Math.max(0, Math.min(d.length - 1, Math.floor(p * d.length)));
    if (d[idx]) els.year.textContent = d[idx].slice(0, 4);
    drawChartAt(p);
    updateOverlay(p);
  }

  function fillMetrics(id, m, isDca) {
    let rows;
    if (isDca || m.invested != null) {
      rows = [
        ["累计投入", fmtMoney(m.invested)],
        ["期末市值", fmtMoney(m.finalValue)],
        ["总收益", fmtMoney(m.profit)],
        ["总收益率", fmtPct(m.totalReturn)],
        ["年化收益(XIRR)", m.annualized == null ? "—" : fmtPct(m.annualized)],
        ["最大回撤", fmtPct(m.maxDrawdown)],
        ["夏普比率", m.sharpe],
      ];
    } else {
      rows = [
        ["初始资金", fmtMoney(m.initial)],
        ["期末市值", fmtMoney(m.finalValue)],
        ["总收益率", fmtPct(m.totalReturn)],
        ["年化收益", fmtPct(m.annualized)],
        ["最大回撤", fmtPct(m.maxDrawdown)],
        ["夏普比率", m.sharpe],
      ];
    }
    document.getElementById(id).innerHTML =
      rows.map((r) => `<div class="mrow"><span>${r[0]}</span><b>${r[1]}</b></div>`).join("");
  }

  return { init, run };
})();

window.addEventListener("DOMContentLoaded", App.init);
