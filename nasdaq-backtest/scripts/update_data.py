#!/usr/bin/env python3
"""更新纳斯达克回测数据：抓取 QQQ/NDX/前10成分股历史日线 + 历史成分名单。

用法:
    python scripts/update_data.py            # 全部更新
    python scripts/update_data.py --core     # 仅核心标的（QQQ/NDX/前10）
    python scripts/update_data.py --universe # 仅 V2 历史成分市值排名数据

输出目录: data/
  qqq.json / ndx.json / <symbol>.json   -> {"symbol","name","dates":[...],"close":[...]}
  ndx100-history.csv                     -> 历史成分事件表(2006至今)
  top10-schedule.json                    -> V2 每季度前10名单(由 universe 计算)
  universe-marketcap.json                -> 全成分股月度市值(用于排名, 近似)
"""
import json
import os
import sys
import time
import urllib.request

import pandas as pd
import yfinance as yf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
os.makedirs(DATA, exist_ok=True)

# (文件名, yfinance代码, 名称) —— 核心标的：定投策略A + 基准 + 当前前10(V1固定篮子)
CORE = [
    ("qqq",  "QQQ",  "Invesco QQQ Trust"),
    ("ndx",  "^NDX", "Nasdaq 100 Index"),
    ("nvda", "NVDA", "NVIDIA"),
    ("msft", "MSFT", "Microsoft"),
    ("aapl", "AAPL", "Apple"),
    ("avgo", "AVGO", "Broadcom"),
    ("amzn", "AMZN", "Amazon"),
    ("googl", "GOOGL", "Alphabet Class A"),
    ("meta", "META", "Meta Platforms"),
    ("tsla", "TSLA", "Tesla"),
    ("nflx", "NFLX", "Netflix"),
    ("cost", "COST", "Costco"),
]

CONSTITUENTS_URL = (
    "https://raw.githubusercontent.com/unliftedq/index-constitution/"
    "main/history/nasdaq100.csv"
)


def fetch_series(code, name, start="1900-01-01"):
    """抓取一只标的的日线复权收盘价, 返回 {symbol,name,dates,close} 或 None。"""
    try:
        df = yf.Ticker(code).history(start=start, auto_adjust=True)
    except Exception as e:  # noqa: BLE001
        print(f"  [warn] {code} 抓取异常: {e}")
        return None
    if df is None or df.empty:
        print(f"  [warn] {code} 无数据")
        return None
    df = df[~df.index.duplicated(keep="last")]
    dates = [d.strftime("%Y-%m-%d") for d in df.index]
    close = [round(float(c), 6) for c in df["Close"]]
    return {"symbol": code, "name": name, "dates": dates, "close": close}


def dump_json(obj, path):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    size = os.path.getsize(path)
    n = len(obj["close"]) if "close" in obj else 0
    print(f"  [ok] {os.path.basename(path)}  行数={n}  大小={size/1024:.1f} KB")


def fetch_core():
    print("== 抓取核心标的 ==")
    for fn, code, name in CORE:
        print(f"- {code} ({name}) ...")
        s = fetch_series(code, name)
        if s:
            dump_json(s, os.path.join(DATA, f"{fn}.json"))
        time.sleep(0.4)


def fetch_constituents():
    print("== 下载历史成分名单 ==")
    out = os.path.join(DATA, "ndx100-history.csv")
    urllib.request.urlretrieve(CONSTITUENTS_URL, out)
    print(f"  [ok] ndx100-history.csv  {os.path.getsize(out)/1024:.1f} KB")


def build_top10_schedule():
    """基于历史成分名单 + 月度市值(近似) 计算每季度前10名单。

    近似口径: 市值 = 月末价格 x 最新股本(用 yfinance get_shares_full 最新值)。
    输出: top10-schedule.json = [{date, symbols:[...10个]}]
    注意: 该近似对头部大票误差可接受, 已在网页注明口径。
    """
    print("== 构建 V2 前10轮动名单 ==")
    csv_path = os.path.join(DATA, "ndx100-history.csv")
    if not os.path.exists(csv_path):
        fetch_constituents()
    hist = pd.read_csv(csv_path)
    hist.columns = [c.strip().lstrip("\ufeff") for c in hist.columns]
    hist["opt_in"] = pd.to_datetime(hist["opt-in"], errors="coerce")
    hist["opt_out"] = pd.to_datetime(hist["opt-out"], errors="coerce")
    # 尚未退出的视为今天
    hist["opt_out"] = hist["opt_out"].fillna(pd.Timestamp.today().normalize())

    # 季度末日期序列
    dates = pd.date_range("2006-01-01", pd.Timestamp.today().normalize(), freq="QE")

    # 收集全部曾出现过的 symbol (需要最新股本)
    symbols = sorted(hist["symbol"].unique().tolist())
    print(f"  历史成分总数: {len(symbols)}")

    # 拉最新股本(近似) + 月末价格, 存 universe-marketcap.json
    universe = {}
    for i, sym in enumerate(symbols):
        try:
            t = yf.Ticker(sym)
            shares = None
            try:
                sf = t.get_shares_full(start="2006-01-01", end=None)
                if sf is not None and len(sf) > 0:
                    shares = float(sf.iloc[-1])
            except Exception:  # noqa: BLE001
                shares = None
            px = t.history(start="2006-01-01", interval="1mo", auto_adjust=True)
            if px.empty:
                continue
            px = px[~px.index.duplicated(keep="last")]
            monthly = {
                d.strftime("%Y-%m"): round(float(c), 4) for d, c in px["Close"].items()
            }
            universe[sym] = {"shares": shares, "monthly": monthly}
        except Exception as e:  # noqa: BLE001
            print(f"  [warn] {sym}: {e}")
        if (i + 1) % 25 == 0:
            print(f"  ...{i+1}/{len(symbols)}")
        time.sleep(0.15)

    dump_json(universe, os.path.join(DATA, "universe-marketcap.json"))

    # 每个季度末: 筛出当时在成分内的, 按市值降序取前10
    schedule = []
    for dt in dates:
        members = hist[(hist["opt_in"] <= dt) & (hist["opt_out"] > dt)]["symbol"].tolist()
        caps = []
        ym = dt.strftime("%Y-%m")
        for s in members:
            u = universe.get(s)
            if not u or u.get("shares") is None:
                continue
            p = (u.get("monthly") or {}).get(ym)
            if p is None:
                continue
            caps.append((s, p * u["shares"]))
        caps.sort(key=lambda x: -x[1])
        top10 = [s for s, _ in caps[:10]]
        if len(top10) >= 10:
            schedule.append({"date": dt.strftime("%Y-%m-%d"), "symbols": top10})
    dump_json(schedule, os.path.join(DATA, "top10-schedule.json"))
    print(f"  [ok] 生成 {len(schedule)} 个季度的前10名单")


def fetch_top10_daily():
    """读取 top10-schedule.json，为历史上出现过的前10成分股并集补拉日线数据。

    已有文件的 symbol 跳过；已退市的抓不到则跳过并警告。
    """
    print("== 补拉历史前10成分股日线 ==")
    schedule_path = os.path.join(DATA, "top10-schedule.json")
    if not os.path.exists(schedule_path):
        print("  [warn] 缺少 top10-schedule.json，先运行 --universe")
        return
    schedule = json.load(open(schedule_path, encoding="utf-8"))
    syms = sorted({s for entry in schedule for s in entry["symbols"]})
    print(f"  历史前10并集: {len(syms)} 只 -> {syms}")
    existing = {fn.rsplit(".", 1)[0] for fn in os.listdir(DATA) if fn.endswith(".json")}
    for sym in syms:
        fn = sym.lower()
        if fn in existing or sym in existing:
            print(f"  [skip] {sym} 已有")
            continue
        print(f"- {sym} ...")
        s = fetch_series(sym, sym)
        if s:
            dump_json(s, os.path.join(DATA, f"{fn}.json"))
        time.sleep(0.4)


def main():
    args = set(sys.argv[1:])
    if "--core" in args:
        fetch_core()
        return
    if "--universe" in args:
        build_top10_schedule()
        return
    if "--top10-daily" in args:
        fetch_top10_daily()
        return
    # 默认全部
    fetch_core()
    fetch_constituents()
    build_top10_schedule()
    fetch_top10_daily()


if __name__ == "__main__":
    main()
