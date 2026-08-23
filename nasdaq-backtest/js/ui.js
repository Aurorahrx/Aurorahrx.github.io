/** UI 逻辑：装配数据、运行回测、渲染图表（含播放动画）与指标 */
window.App = (function () {
  "use strict";

  const fmtMoney = (v) => "$" + Math.round(v).toLocaleString("en-US");
  const fmtPct = (v) => (v * 100).toFixed(1) + "%";

  let dcaRes = null;
  let top10Res = null;
  let axis = [];
  let seriesCache = null; // 供动画复用的归一化曲线
  let animId = null;
  let playing = false;

  const els = {};

  async function init() {
    els.run = document.getElementById("run");
    els.play = document.getElementById("play");
    els.speed = document.getElementById("speed");
    els.progress = document.getElementById("progress");
    els.year = document.getElementById("year-label");
    els.chart = document.getElementById("chart");
    els.status = document.getElementById("status");

    els.run.addEventListener("click", run);
    els.play.addEventListener("click", togglePlay);
    els.progress.addEventListener("input", onSeek);

    await run();
  }

  async function run() {
    els.status.textContent = "计算中…";

    const dcaOpts = {
      amount: Number(document.getElementById("amount").value) || 1000,
      freq: document.getElementById("freq").value || "monthly",
      start: document.getElementById("start").value || "2006-01-01",
    };
    const top10Opts = { weight: "equal", start: dcaOpts.start, initial: 10000 };

    try {
      stopAnim();
      const qqq = await Data.loadSymbol(CONFIG.dcaSymbol);
      dcaRes = Backtest.backtestDCA(qqq, dcaOpts);

      let schedule = await Data.loadSchedule();
      let mode = "V2 动态前10";
      if (!schedule || schedule.length === 0) {
        schedule = [{ date: dcaOpts.start, symbols: CONFIG.top10Fixed.slice() }];
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
      drawChartAt(1);
      fillMetrics("dca-metrics", dcaRes.metrics, true);
      fillMetrics("top10-metrics", top10Res.metrics, false);

      els.progress.value = 1000;
      els.year.textContent = axis[axis.length - 1].slice(0, 4);
      els.status.textContent =
        `完成 · ${dcaOpts.start} ~ ${axis[axis.length - 1]} · ${mode} · 归一化净值（每$1增长倍数）`;
    } catch (e) {
      els.status.textContent = "出错：" + e.message;
      console.error(e);
    }
  }

  /** 对齐并归一化两条曲线，缓存供动画复用 */
  function buildSeries() {
    axis = dcaRes.dates;
    const align = (values, fromDates) => {
      const m = new Map();
      fromDates.forEach((d, i) => m.set(d, values[i]));
      return axis.map((d) => (m.has(d) ? m.get(d) : null));
    };
    const dcaNorm = dcaRes.equity.map((v, i) => (dcaRes.invested[i] > 0 ? v / dcaRes.invested[i] : 1));
    const base = top10Res.equity[0] || 1;
    const top10Norm = top10Res.equity.map((v) => v / base);
    seriesCache = [
      { name: "定投 QQQ（策略A）", values: dcaNorm, color: CONFIG.theme.accent1 },
      { name: "前10跟踪（策略B）", values: align(top10Norm, top10Res.dates), color: CONFIG.theme.accent2 },
    ];
  }

  function drawChartAt(progress) {
    Chart.draw(els.chart, {
      dates: axis,
      series: seriesCache,
      yFormat: (v) => v.toFixed(1) + "x",
      progress,
    });
  }

  function togglePlay() {
    if (playing) { stopAnim(); return; }
    // 满进度时重播 → 从 0 开始
    if (Number(els.progress.value) >= 1000) els.progress.value = 0;
    playing = true;
    els.play.textContent = "⏸ 暂停";
    const speed = Number(els.speed.value) || 1;
    const dur = 9000 / speed; // 1x 时约 9 秒播完
    const t0 = performance.now() - (Number(els.progress.value) / 1000) * dur;
    const step = (now) => {
      if (!playing) return;
      let p = (now - t0) / dur;
      if (!isFinite(p)) p = 0;
      p = Math.max(0, Math.min(1, p));
      els.progress.value = Math.round(p * 1000);
      const idx = Math.max(0, Math.min(axis.length - 1, Math.floor(p * axis.length)));
      if (axis[idx]) els.year.textContent = axis[idx].slice(0, 4);
      drawChartAt(p);
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
    if (finished) { els.progress.value = 1000; drawChartAt(1); }
  }

  function onSeek() {
    const p = Math.max(0, Math.min(1, Number(els.progress.value) / 1000));
    const idx = Math.max(0, Math.min(axis.length - 1, Math.floor(p * axis.length)));
    if (axis[idx]) els.year.textContent = axis[idx].slice(0, 4);
    drawChartAt(p);
  }

  function fillMetrics(id, m, isDca) {
    const rows = isDca
      ? [
          ["累计投入", fmtMoney(m.invested)],
          ["期末市值", fmtMoney(m.finalValue)],
          ["总收益", fmtMoney(m.profit)],
          ["总收益率", fmtPct(m.totalReturn)],
          ["年化收益(XIRR)", m.annualized == null ? "—" : fmtPct(m.annualized)],
          ["最大回撤", fmtPct(m.maxDrawdown)],
        ]
      : [
          ["初始资金", fmtMoney(m.initial)],
          ["期末市值", fmtMoney(m.finalValue)],
          ["总收益率", fmtPct(m.totalReturn)],
          ["年化收益", fmtPct(m.annualized)],
          ["最大回撤", fmtPct(m.maxDrawdown)],
          ["夏普比率", m.sharpe],
        ];
    document.getElementById(id).innerHTML =
      rows.map((r) => `<div class="mrow"><span>${r[0]}</span><b>${r[1]}</b></div>`).join("");
  }

  return { init, run };
})();

window.addEventListener("DOMContentLoaded", App.init);
