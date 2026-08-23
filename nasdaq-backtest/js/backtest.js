/**
 * 回测引擎（纯函数，无 DOM 依赖，浏览器/Node 通用）
 *
 * 数据格式（series）: { symbol, name, dates: ["YYYY-MM-DD",...], close: [number,...] }
 * 注意: close 为 yfinance auto_adjust 复权收盘价（已含分红与拆股调整）。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Backtest = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DAY_MS = 86400000;

  function parseDate(s) {
    return new Date(s + "T00:00:00Z");
  }
  function fmtDate(d) {
    return d.toISOString().slice(0, 10);
  }
  /** 系列内某个日期之后的第一个交易日下标（含当天） */
  function firstIndexOnOrAfter(series, dateStr) {
    const target = parseDate(dateStr).getTime();
    for (let i = 0; i < series.dates.length; i++) {
      if (parseDate(series.dates[i]).getTime() >= target) return i;
    }
    return -1;
  }

  /** 定投的投入日下标（每月首个交易日 / 每周首个交易日） */
  function investmentIndices(series, opts) {
    const freq = opts.freq || "monthly";
    const startIdx = firstIndexOnOrAfter(series, opts.start);
    if (startIdx < 0) return [];
    const startD = parseDate(series.dates[startIdx]);
    const lastD = parseDate(series.dates[series.dates.length - 1]);
    const out = new Set();
    if (freq === "weekly") {
      let cur = startD;
      while (cur.getTime() <= lastD.getTime()) {
        const idx = firstIndexOnOrAfter(series, fmtDate(cur));
        if (idx >= 0 && idx >= startIdx) out.add(idx);
        cur = new Date(cur.getTime() + 7 * DAY_MS);
      }
    } else {
      let y = startD.getUTCFullYear(), m = startD.getUTCMonth();
      while (y < lastD.getUTCFullYear() || (y === lastD.getUTCFullYear() && m <= lastD.getUTCMonth())) {
        const idx = firstIndexOnOrAfter(series, fmtDate(new Date(Date.UTC(y, m, 1))));
        if (idx >= 0 && idx >= startIdx) out.add(idx);
        m++; if (m > 11) { m = 0; y++; }
      }
    }
    return Array.from(out).sort((a, b) => a - b);
  }

  /** 最大回撤（0~1） */
  function maxDrawdown(equity) {
    let peak = -Infinity, mdd = 0;
    for (const v of equity) {
      if (v > peak) peak = v;
      if (peak > 0) mdd = Math.max(mdd, (peak - v) / peak);
    }
    return mdd;
  }

  /** 年化波动率 & 夏普（rf=0，日频年化 252） */
  function sharpe(equity) {
    if (equity.length < 2) return 0;
    const rets = [];
    for (let i = 1; i < equity.length; i++) {
      if (equity[i - 1] > 0) rets.push(equity[i] / equity[i - 1] - 1);
    }
    if (rets.length < 2) return 0;
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const var_ = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
    const sd = Math.sqrt(var_);
    return sd === 0 ? 0 : (mean / sd) * Math.sqrt(252);
  }

  /** 资金加权年化收益（XIRR），基于现金流时序；无解返回 null */
  function xirr(cashflows) {
    // cashflows: [{amount, date}] amount 为负=投入, 为正=终值
    if (cashflows.length < 2) return null;
    const T = parseDate(cashflows[cashflows.length - 1].date).getTime();
    // 每条现金流向前复利到终点日期 T：NPV_T(r) = Σ CF_i · (1+r)^((T-t_i)/365)
    const ts = cashflows.map((c) => (T - parseDate(c.date).getTime()) / (365 * DAY_MS));
    const f = (r) => cashflows.reduce((s, c, i) => s + c.amount * Math.pow(1 + r, ts[i]), 0);
    let lo = -0.9999, hi = 10, flo = f(lo), fhi = f(hi);
    if (flo * fhi > 0) return null; // 可能无解或区间不含根
    for (let i = 0; i < 100; i++) {
      const mid = (lo + hi) / 2, fm = f(mid);
      if (Math.abs(fm) < 1e-7) return mid;
      if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
    }
    return (lo + hi) / 2;
  }

  /**
   * 策略 A：定投
   * opts: { amount, freq('monthly'|'weekly'), start('YYYY-MM-DD'), end }
   * 返回: { dates, equity, invested, contributions, metrics }
   */
  function backtestDCA(series, opts) {
    const amount = opts.amount || 1000;
    const start = opts.start || "2006-01-01";
    const end = opts.end || series.dates[series.dates.length - 1];

    const startIdx = firstIndexOnOrAfter(series, start);
    const endIdx = series.dates.findIndex((d) => d > end) - 1;
    const lastIdx = endIdx < 0 ? series.dates.length - 1 : endIdx;
    const invIdx = new Set(investmentIndices(series, { ...opts, start }));

    let shares = 0, invested = 0;
    const dates = [], equity = [], investedArr = [], contributions = [];
    for (let i = startIdx; i <= lastIdx; i++) {
      if (invIdx.has(i)) {
        const p = series.close[i];
        if (p > 0) {
          shares += amount / p;
          invested += amount;
          contributions.push({ date: series.dates[i], amount });
        }
      }
      dates.push(series.dates[i]);
      equity.push(shares * series.close[i]);
      investedArr.push(invested);
    }

    const finalValue = equity[equity.length - 1] || 0;
    const profit = finalValue - invested;
    const totalReturn = invested > 0 ? profit / invested : 0;
    const cf = contributions.map((c) => ({ amount: -c.amount, date: c.date }));
    cf.push({ amount: finalValue, date: dates[dates.length - 1] });
    const annualized = xirr(cf);

    return {
      dates, equity, invested: investedArr, contributions,
      metrics: {
        invested: round(invested, 2),
        finalValue: round(finalValue, 2),
        profit: round(profit, 2),
        totalReturn: round(totalReturn, 4),
        annualized: annualized === null ? null : round(annualized, 4),
        maxDrawdown: round(maxDrawdown(equity), 4),
        sharpe: round(sharpe(equity), 3),
      },
    };
  }

  /**
   * 策略 B：前10跟踪（季度再平衡，默认等权）
   * @param seriesMap { symbol: series }
   * @param schedule  V2: [{date, symbols:[...]}] 升序；V1: 传 [{date:'<start>', symbols:[...]}] 单个即可
   * @param opts { start, weight('equal'|'marketcap'), marketcap:{symbol:{shares}} }
   */
  function backtestTop10(seriesMap, schedule, opts) {
    const start = opts.start || "2006-01-01";
    const weight = opts.weight || "equal";

    // 1) 收集参与 symbol 并构建对齐矩阵
    const syms = new Set();
    schedule.forEach((s) => s.symbols.forEach((x) => syms.add(x)));
    const symList = Array.from(syms);
    const dateSet = new Set();
    symList.forEach((s) => seriesMap[s] && seriesMap[s].dates.forEach((d) => dateSet.add(d)));
    const dates = Array.from(dateSet).sort();

    const price = {}; // sym -> Float64Array(对齐后, 缺失=null)
    symList.forEach((s) => {
      const arr = new Array(dates.length).fill(null);
      const m = new Map();
      seriesMap[s].dates.forEach((d, i) => m.set(d, seriesMap[s].close[i]));
      dates.forEach((d, i) => { if (m.has(d)) arr[i] = m.get(d); });
      price[s] = arr;
    });

    // 2) 构建持仓周期
    const periods = [];
    for (let i = 0; i < schedule.length; i++) {
      const sd = schedule[i].date;
      const next = i + 1 < schedule.length ? schedule[i + 1].date : null;
      periods.push({ start: sd, end: next, symbols: schedule[i].symbols.slice() });
    }

    // 3) 计算权重（等权；marketcap 用 shares×价格近似）
    function weightsFor(period, dateIdx) {
      const list = period.symbols.filter((s) => price[s] && price[s][dateIdx] != null);
      if (list.length === 0) return null;
      if (weight === "marketcap" && opts.marketcap) {
        let tot = 0;
        const w = {};
        list.forEach((s) => { w[s] = price[s][dateIdx] * (opts.marketcap[s] || 0); tot += w[s]; });
        if (tot > 0) { list.forEach((s) => { w[s] /= tot; }); return w; }
      }
      const w = {};
      list.forEach((s) => { w[s] = 1 / list.length; });
      return w;
    }

    // 4) 模拟
    const startIdx = dates.findIndex((d) => d >= start);
    if (startIdx < 0) return null;
    const startT = parseDate(start).getTime();

    let capital = opts.initial || 10000;
    let holdings = null; // {sym: shares}
    const equity = [], eqDates = [];

    for (let i = startIdx; i < dates.length; i++) {
      const d = dates[i];
      // 检查是否处于某周期开始日
      const period = periods.find((p) => p.start === d);
      if (period) {
        const w = weightsFor(period, i);
        if (w) {
          holdings = {};
          for (const s in w) holdings[s] = capital * w[s] / price[s][i];
        }
      }
      // 每日市值
      if (holdings) {
        let val = 0;
        for (const s in holdings) {
          const p = price[s][i];
          if (p != null) val += holdings[s] * p;
        }
        capital = val;
      }
      equity.push(capital);
      eqDates.push(d);
      // 期初未建仓前，保持初始资金不变
    }

    const years = (parseDate(eqDates[eqDates.length - 1]).getTime() - parseDate(eqDates[0]).getTime()) / (365 * DAY_MS);
    const initial = opts.initial || 10000;
    const totalReturn = initial > 0 ? (capital / initial - 1) : 0;
    const annualized = years > 0 ? Math.pow(capital / initial, 1 / years) - 1 : 0;

    return {
      dates: eqDates, equity,
      metrics: {
        initial: round(initial, 2),
        finalValue: round(capital, 2),
        totalReturn: round(totalReturn, 4),
        annualized: round(annualized, 4),
        maxDrawdown: round(maxDrawdown(equity), 4),
        sharpe: round(sharpe(equity), 3),
      },
    };
  }

  function round(x, dp) {
    const f = Math.pow(10, dp);
    return Math.round(x * f) / f;
  }

  return { backtestDCA, backtestTop10, maxDrawdown, sharpe, xirr, parseDate, fmtDate, _internal: { investmentIndices, firstIndexOnOrAfter } };
});
