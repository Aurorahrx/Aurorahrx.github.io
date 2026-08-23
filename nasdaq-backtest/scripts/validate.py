#!/usr/bin/env python3
"""校验 data/*.json 完整性：长度一致、日期升序、收盘价>0 且非 NaN。"""
import glob
import json
import os
import sys

BAD = 0
for f in sorted(glob.glob("data/*.json")):
    d = json.load(open(f, encoding="utf-8"))
    n = len(d["dates"])
    ok = True
    if n != len(d["close"]):
        print(f"[BAD] {f}: 长度不一致"); ok = False
    if d["dates"] != sorted(d["dates"]):
        print(f"[BAD] {f}: 日期未升序"); ok = False
    if not all(c > 0 and c == c for c in d["close"]):
        print(f"[BAD] {f}: 存在非正/NaN 收盘价"); ok = False
    if ok:
        print(f"{os.path.basename(f):14s} {d['dates'][0]} ~ {d['dates'][-1]}  rows={n}")
    else:
        BAD += 1

print("\ndata OK" if BAD == 0 else f"\n{BAD} file(s) BAD")
sys.exit(1 if BAD else 0)
