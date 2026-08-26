/** 全局配置：标的清单、文件映射、策略默认参数、主题色 */
window.CONFIG = {
  // 数据文件映射：symbol -> data/<file>.json
  files: {
    QQQ: "qqq",
    "^NDX": "ndx",
    NVDA: "nvda", MSFT: "msft", AAPL: "aapl", AVGO: "avgo", AMZN: "amzn",
    GOOGL: "googl", META: "meta", TSLA: "tsla", NFLX: "nflx", COST: "cost",
  },

  // 定投标的（策略A）
  dcaSymbol: "QQQ",

  // V1 固定前10（策略B 简化版）
  top10Fixed: ["NVDA", "MSFT", "AAPL", "AVGO", "AMZN", "GOOGL", "META", "TSLA", "NFLX", "COST"],

  // 策略默认参数
  defaults: {
    dca: { amount: 1000, freq: "monthly", start: "2006-01-01" },
    top10: { weight: "equal", start: "2006-01-01", initial: 10000 },
  },

  // 图表主题
  theme: {
    bg: "#0d1117",
    panel: "#161b22",
    grid: "#21262d",
    text: "#e6edf3",
    dim: "#8b949e",
    accent1: "#58a6ff", // 定投曲线
    accent2: "#3fb950", // 前10曲线
    muted: "#8b949e",   // 本金/成本线
    up: "#3fb950",      // 浮盈
    down: "#f85149",    // 浮亏
    glow: "rgba(88,166,255,0.6)",
  },
};
