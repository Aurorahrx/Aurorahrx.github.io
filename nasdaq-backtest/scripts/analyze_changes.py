#!/usr/bin/env python3
"""分析 top10-schedule.json：找出每个季度前10名单的变化（新进/退出）。"""
import json

schedule = json.load(open("data/top10-schedule.json", encoding="utf-8"))

prev = None
changes = []
for e in schedule:
    cur = set(e["symbols"])
    if prev is not None and cur != prev:
        entered = sorted(cur - prev)
        exited = sorted(prev - cur)
        changes.append((e["date"], entered, exited))
    prev = cur

print(f"总季度数: {len(schedule)}")
print(f"发生名单变动的季度: {len(changes)} 个\n")
print("时间          新进              退出")
print("-" * 60)
for date, entered, exited in changes:
    print(f"{date}  +{','.join(entered) if entered else '-'}   -{','.join(exited) if exited else '-'}")
