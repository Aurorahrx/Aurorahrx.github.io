# 📈 纳斯达克定投 vs 前10跟踪 · 策略回测

纯前端静态网页，用真实历史数据回测两个美股策略，并支持动画波浪图播放。无后端、无 API Key、无实时依赖，可直接部署到 GitHub Pages。

- **策略 A：纳斯达克定投** —— 按月/周定投 QQQ（参数可调）
- **策略 B：前 10 跟踪** —— 纳斯达克 100 前 10 成分股，季度再平衡（V2 动态历史成分名单）

## ✨ 特性

- 🎬 **动画波浪图**：平滑曲线（Catmull-Rom）+ 流动光效（彗星拖尾），支持播放/暂停/倍速/拖动，曲线随时间生长，年份联动
- 📊 双策略净值对比（归一化"每 1 美元增长倍数"，公平比较）
- 🧮 完整指标：总收益 / 年化（XIRR）/ 最大回撤 / 夏普比率
- 💰 **资金曲线视图**：本金虚线 + 总持仓曲线，播放动画时右上角实时显示「总持仓 / 浮盈浮亏」（可切换定投/前10）
- 🧭 **动态前10追踪页**（`constituents.html`）：按月查看历史前10名单、市值权重与排名变动；含「调仓明细」视图，逐季度显示买入/卖出/持有
- 📦 数据本地化：一次性抓取存静态 JSON，页面运行时零外部请求

## 🚀 本地运行

```bash
cd nasdaq-backtest
python -m http.server 8090
# 浏览器打开 http://127.0.0.1:8090/
```

> 直接双击 `index.html` 会因浏览器 `file://` 的 CORS 限制无法加载数据，务必用本地服务器。

## ☁️ 部署到 GitHub Pages

1. 新建 GitHub 仓库，把本项目 push 到 `main` 分支
2. 仓库 **Settings → Pages**：
   - Source 选 **Deploy from a branch**
   - Branch 选 **main**，目录选 **/ (root)**，保存
3. 等 1 分钟，访问 `https://<你的用户名>.github.io/<仓库名>/`

国内访问 GitHub Pages 不稳定时，可把同一套代码部署到 Gitee Pages 或 Cloudflare Pages（无需改代码）。

## 📊 数据说明

| 文件 | 内容 | 来源 |
|---|---|---|
| `data/*.json` | 各标的日线复权收盘价 `{symbol,name,dates,close}` | Yahoo Finance（yfinance） |
| `data/ndx100-history.csv` | 纳斯达克 100 历史成分事件表（2006至今） | [unliftedq/index-constitution](https://github.com/unliftedq/index-constitution) |
| `data/top10-schedule.json` | 每个季度末的前 10 名单（V2 动态） | 由下方法计算 |
| `data/universe-marketcap.json` | 全成分股月度市值（近似） | yfinance |

### 更新数据

```bash
python scripts/update_data.py          # 全量更新
python scripts/update_data.py --core   # 仅 QQQ/NDX/前10
python scripts/update_data.py --universe      # 仅重算 V2 前10名单
python scripts/update_data.py --top10-daily   # 仅补拉历史前10日线
python scripts/validate.py             # 校验数据完整性
```

### 回测口径（重要，引用前请知悉）

- **前 10 名单**：基于历史成分事件表，按季度末市值排名取前 10。市值 = **月末价格 × 最新股本**（近似，未精确还原历史股本与拆股后权重）。
- **幸存者偏差**：早期已退市的成分股（如 YHOO）因数据不可得会被跳过，可能使边界位置（第 9~12 名）的历史排名略有偏差。
- **收益**：使用复权收盘价（含分红/拆股调整），近似总回报。
- 结论仅供研究演示，**不构成投资建议**。

## 🧪 测试

```bash
node tests/test_backtest.js   # 回测引擎单元测试
node tests/smoke_v2.js        # V2 端到端冒烟测试（真实数据）
```

## 📁 目录结构

```
nasdaq-backtest/
├── index.html            # 单页入口
├── css/style.css
├── js/
│   ├── config.js         # 标的/参数/主题配置
│   ├── data.js           # 数据加载（fetch + 缓存）
│   ├── backtest.js       # 回测引擎（纯函数，浏览器/Node 通用）
│   ├── chart.js          # Canvas 图表（平滑曲线+流动光效）
│   └── ui.js             # UI 装配 + 播放动画驱动
├── data/                 # 静态数据（生成于 scripts/update_data.py）
├── scripts/              # 数据抓取/校验/CDP 冒烟测试
└── tests/                # 单元测试 + 冒烟测试
```

## 📝 方法论近似与局限

1. **历史股本近似**：市值用"当前股本 × 历史价格"，对经历大额回购的公司（如 AAPL）会低估其历史市值，可能影响早期前 10 边界排名。
2. **季度粒度**：前 10 名单每季度末更新一次，与纳斯达克官方再平衡频率一致；期间固定持仓。
3. **等权假设**：默认等权配置（各 1/10），如需市值加权可改 `js/ui.js` 中 `top10Opts.weight` 与传入 `marketcap`。
