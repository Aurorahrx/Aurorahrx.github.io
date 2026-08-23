/** 端到端冒烟测试：真实 schedule + 真实数据跑 V2 前10回测 + 定投对比 */
"use strict";
const fs = require("fs");
const path = require("path");
const B = require("../js/backtest.js");

const DATA = path.join(__dirname, "..", "data");
const schedule = JSON.parse(fs.readFileSync(path.join(DATA, "top10-schedule.json"), "utf8"));

// 把所有 *.json 数据文件读入 seriesMap（排除 schedule/universe）
const seriesMap = {};
fs.readdirSync(DATA).filter((f) => f.endsWith(".json") && !f.includes("schedule") && !f.includes("universe"))
  .forEach((f) => {
    const j = JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));
    seriesMap[j.symbol] = j;
  });

const start = "2006-01-01";

const top10 = B.backtestTop10(seriesMap, schedule, { start, initial: 10000, weight: "equal" });
const dca = B.backtestDCA(seriesMap["QQQ"], { amount: 1000, freq: "monthly", start });

console.log("=== 策略 B：前10跟踪（V2 动态，季度等权再平衡）===");
console.log(`  季度数: ${schedule.length}`);
console.log(`  初始 $${top10.metrics.initial} → 期末 $${top10.metrics.finalValue}`);
console.log(`  总收益率 ${(top10.metrics.totalReturn * 100).toFixed(1)}%  年化 ${(top10.metrics.annualized * 100).toFixed(1)}%  最大回撤 ${(top10.metrics.maxDrawdown * 100).toFixed(1)}%`);

console.log("\n=== 策略 A：定投 QQQ ===");
console.log(`  投入 $${dca.metrics.invested} → 期末 $${dca.metrics.finalValue}`);
console.log(`  总收益率 ${(dca.metrics.totalReturn * 100).toFixed(1)}%  年化 ${(dca.metrics.annualized * 100).toFixed(1)}%  最大回撤 ${(dca.metrics.maxDrawdown * 100).toFixed(1)}%`);

// 合理性校验
const assert = require("assert");
assert.ok(top10.metrics.totalReturn > 0, "前10跟踪 2006 至今应为正收益");
assert.ok(dca.metrics.totalReturn > 0, "定投 QQQ 2006 至今应为正收益");
assert.ok(top10.equity.length > 4000, "应有 4000+ 交易日净值");
console.log("\n端到端校验通过 ✅");
