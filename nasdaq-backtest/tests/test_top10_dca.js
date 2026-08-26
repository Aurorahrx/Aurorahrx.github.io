/** 前10跟踪「每月定投」模式测试：与 QQQ 定投公平对比 */
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const B = require("../js/backtest.js");

const DATA = path.join(__dirname, "..", "data");
const schedule = JSON.parse(fs.readFileSync(path.join(DATA, "top10-schedule.json"), "utf8"));
const seriesMap = {};
fs.readdirSync(DATA).filter((f) => f.endsWith(".json") && !f.includes("schedule") && !f.includes("universe"))
  .forEach((f) => { const j = JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8")); seriesMap[j.symbol] = j; });

const start = "2006-01-01";
const top10 = B.backtestTop10(seriesMap, schedule, { start, amount: 1000, freq: "monthly", weight: "equal" });
const qqq = B.backtestDCA(seriesMap["QQQ"], { amount: 1000, freq: "monthly", start });

assert.strictEqual(top10.mode, "dca");
assert.ok(top10.metrics.invested > 240000, "累计投入应约 24.6 万");
assert.ok(top10.metrics.finalValue > top10.metrics.invested, "应为正收益");
assert.ok(top10.equity.length > 4000);

console.log("=== 公平对比：每月定投 $1000（2006-2026）===");
console.log(`策略A 定投 QQQ      ：投入 $${qqq.metrics.invested} → 期末 $${qqq.metrics.finalValue}  收益率 ${(qqq.metrics.totalReturn * 100).toFixed(1)}%  年化 ${(qqq.metrics.annualized * 100).toFixed(1)}%  回撤 ${(qqq.metrics.maxDrawdown * 100).toFixed(1)}%`);
console.log(`策略B 前10跟踪(定投) ：投入 $${top10.metrics.invested} → 期末 $${top10.metrics.finalValue}  收益率 ${(top10.metrics.totalReturn * 100).toFixed(1)}%  年化 ${(top10.metrics.annualized * 100).toFixed(1)}%  回撤 ${(top10.metrics.maxDrawdown * 100).toFixed(1)}%  夏普 ${top10.metrics.sharpe}`);
console.log("\n测试通过 ✅");
