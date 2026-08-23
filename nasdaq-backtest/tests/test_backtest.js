/**
 * 回测引擎单元测试（Node 运行：node tests/test_backtest.js）
 */
"use strict";
const assert = require("assert");
const B = require("../js/backtest.js");

function monthlySeries(closes, yearStart = 2020) {
  const dates = closes.map((_, i) => {
    const d = new Date(Date.UTC(yearStart, i, 1));
    return d.toISOString().slice(0, 10);
  });
  return { symbol: "T", name: "Test", dates, close: closes };
}

// ---- 1. 定投：价格恒定，收益率应为 0 ----
{
  const s = monthlySeries([10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10]);
  const r = B.backtestDCA(s, { amount: 1000, freq: "monthly", start: "2020-01-01" });
  assert.strictEqual(r.metrics.invested, 12000, "invested should be 12000");
  assert.strictEqual(r.metrics.finalValue, 12000, "finalValue should be 12000");
  assert.strictEqual(r.metrics.totalReturn, 0, "totalReturn should be 0");
  assert.strictEqual(r.metrics.maxDrawdown, 0, "maxDrawdown should be 0");
  assert.strictEqual(r.equity[r.equity.length - 1], 12000, "equity end should be 12000");
  console.log("✔ 测试1 通过：定投价格恒定 → 收益0");
}

// ---- 2. 定投：线性上涨，期末市值应 > 累计投入 ----
{
  const s = monthlySeries([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
  const r = B.backtestDCA(s, { amount: 1000, freq: "monthly", start: "2020-01-01" });
  assert.strictEqual(r.metrics.invested, 12000);
  assert.ok(r.metrics.finalValue > 12000, "finalValue should exceed invested");
  assert.ok(r.metrics.totalReturn > 0);
  assert.ok(r.metrics.annualized > 0);
  console.log("✔ 测试2 通过：定投上涨 → 正收益");
}

// ---- 3. 前10跟踪：等权、价格不变 → 收益0 ----
{
  const sA = { symbol: "A", name: "A", dates: ["2020-01-01", "2020-01-02", "2020-01-03"], close: [10, 10, 10] };
  const sB = { symbol: "B", name: "B", dates: ["2020-01-01", "2020-01-02", "2020-01-03"], close: [20, 20, 20] };
  const r = B.backtestTop10({ A: sA, B: sB }, [{ date: "2020-01-01", symbols: ["A", "B"] }], {
    start: "2020-01-01", initial: 10000, weight: "equal",
  });
  assert.strictEqual(r.metrics.finalValue, 10000);
  assert.strictEqual(r.metrics.totalReturn, 0);
  console.log("✔ 测试3 通过：前10等权不变 → 收益0");
}

// ---- 4. 前10跟踪：A 翻倍 → 收益 50% ----
{
  const sA = { symbol: "A", name: "A", dates: ["2020-01-01", "2020-01-02", "2020-01-03"], close: [10, 20, 20] };
  const sB = { symbol: "B", name: "B", dates: ["2020-01-01", "2020-01-02", "2020-01-03"], close: [20, 20, 20] };
  const r = B.backtestTop10({ A: sA, B: sB }, [{ date: "2020-01-01", symbols: ["A", "B"] }], {
    start: "2020-01-01", initial: 10000, weight: "equal",
  });
  // 500 股 A + 250 股 B；第2日起 A=20 → 500*20 + 250*20 = 15000
  assert.strictEqual(r.metrics.finalValue, 15000);
  assert.strictEqual(r.metrics.totalReturn, 0.5);
  console.log("✔ 测试4 通过：前10等权 A翻倍 → +50%");
}

// ---- 5. 真实 QQQ 数据 sanity：2010-2024 定投应为正收益 ----
{
  const fs = require("fs");
  const path = require("path");
  const qqq = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "qqq.json"), "utf8"));
  const r = B.backtestDCA(qqq, { amount: 1000, freq: "monthly", start: "2010-01-01", end: "2024-01-01" });
  assert.ok(Number.isFinite(r.metrics.totalReturn));
  assert.ok(r.metrics.totalReturn > 0, "QQQ 2010-2024 定投应为正收益");
  assert.ok(r.metrics.invested > 150000, "约 168 个月定投");
  console.log("✔ 测试5 通过：QQQ 真实数据 sanity");
  console.log(`   2010-2024 定投：投入 $${r.metrics.invested} → 期末 $${r.metrics.finalValue}，收益率 ${(r.metrics.totalReturn * 100).toFixed(1)}%，年化 ${(r.metrics.annualized * 100).toFixed(1)}%，最大回撤 ${(r.metrics.maxDrawdown * 100).toFixed(1)}%`);
}

console.log("\n全部测试通过 ✅");
