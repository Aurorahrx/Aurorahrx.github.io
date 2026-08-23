/**
 * Canvas 图表渲染器（自绘，无外部依赖）
 * 特性：平滑曲线(Catmull-Rom)、渐变填充、双系列对比、进度播放(progress)、光点标记
 * API: Chart.draw(canvas, opts)
 *   opts: { dates:[], series:[{name,values,color}], progress:0..1, yFormat:fn, title }
 */
window.Chart = (function () {
  "use strict";

  function draw(canvas, opts) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || canvas.width;
    const cssH = canvas.clientHeight || canvas.height;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const theme = CONFIG.theme;
    ctx.clearRect(0, 0, cssW, cssH);

    const pad = { l: 56, r: 16, t: 20, b: 30 };
    const w = cssW - pad.l - pad.r;
    const h = cssH - pad.t - pad.b;

    const n = opts.dates.length;
    const progress = Math.max(0, Math.min(1, opts.progress == null ? 1 : opts.progress));
    const maxIdx = progress >= 1 ? n - 1 : Math.floor(progress * (n - 1));

    // y 范围（只用画到 maxIdx 的数据）
    let ymin = Infinity, ymax = -Infinity;
    for (const s of opts.series) {
      for (let i = 0; i <= maxIdx; i++) {
        const v = s.values[i];
        if (v == null) continue;
        if (v < ymin) ymin = v;
        if (v > ymax) ymax = v;
      }
    }
    if (!isFinite(ymin)) { ymin = 0; ymax = 1; }
    const padY = (ymax - ymin) * 0.06 || 1;
    ymin -= padY; ymax += padY;

    const X = (i) => pad.l + (i / (n - 1)) * w;
    const Y = (v) => pad.t + (1 - (v - ymin) / (ymax - ymin)) * h;

    // 网格 + y 轴刻度
    ctx.font = "11px 'Segoe UI', 'Microsoft YaHei', sans-serif";
    ctx.textBaseline = "middle";
    const yticks = 5;
    for (let k = 0; k <= yticks; k++) {
      const v = ymin + ((ymax - ymin) * k) / yticks;
      const y = Y(v);
      ctx.strokeStyle = theme.grid;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + w, y); ctx.stroke();
      ctx.fillStyle = theme.dim;
      ctx.textAlign = "right";
      ctx.fillText((opts.yFormat || ((x) => x))(v), pad.l - 8, y);
    }

    // x 轴年份刻度
    ctx.fillStyle = theme.dim;
    ctx.textAlign = "center";
    const xticks = 6;
    for (let k = 0; k <= xticks; k++) {
      const i = Math.round((k / xticks) * (n - 1));
      const x = X(i);
      ctx.strokeStyle = theme.grid;
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + h); ctx.stroke();
      ctx.fillText(opts.dates[i].slice(0, 4), x, pad.t + h + 14);
    }

    // 各系列
    for (const s of opts.series) {
      const pts = [];
      for (let i = 0; i <= maxIdx; i++) {
        if (s.values[i] == null) continue;
        pts.push({ x: X(i), y: Y(s.values[i]) });
      }
      if (pts.length < 2) continue;

      // 渐变填充
      if (opts.fill !== false) {
        const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + h);
        grad.addColorStop(0, hexA(s.color, 0.28));
        grad.addColorStop(1, hexA(s.color, 0.02));
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pad.t + h);
        ctx.lineTo(pts[0].x, pts[0].y);
        smoothPath(ctx, pts);
        ctx.lineTo(pts[pts.length - 1].x, pad.t + h);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // 平滑曲线
      ctx.beginPath();
      smoothPath(ctx, pts);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();

      // 流动光效：头部亮点 + 沿曲线拖尾的彗星光
      const last = pts[pts.length - 1];
      if (progress > 0) {
        const trailN = 5;
        for (let k = 1; k <= trailN; k++) {
          const idx = pts.length - 1 - Math.round(k * pts.length * 0.012);
          if (idx < 0) break;
          const p = pts[idx];
          const rad = Math.max(2, 10 - k * 1.5);
          const alpha = Math.max(0.04, 0.6 - k * 0.11);
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad * 2);
          g.addColorStop(0, hexA(s.color, alpha));
          g.addColorStop(1, hexA(s.color, 0));
          ctx.beginPath();
          ctx.arc(p.x, p.y, rad * 2, 0, Math.PI * 2);
          ctx.fillStyle = g;
          ctx.fill();
        }
        // 头部亮点
        ctx.beginPath();
        ctx.arc(last.x, last.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = s.color;
        ctx.fill();
        const glow = ctx.createRadialGradient(last.x, last.y, 0, last.x, last.y, 18);
        glow.addColorStop(0, hexA(s.color, 0.8));
        glow.addColorStop(1, hexA(s.color, 0));
        ctx.beginPath();
        ctx.arc(last.x, last.y, 18, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();
      }
    }

    // 图例
    ctx.textAlign = "left";
    let lx = pad.l;
    for (const s of opts.series) {
      ctx.fillStyle = s.color;
      ctx.fillRect(lx, 8, 14, 3);
      ctx.fillStyle = theme.text;
      ctx.font = "12px 'Segoe UI', 'Microsoft YaHei', sans-serif";
      ctx.fillText(s.name, lx + 20, 10);
      lx += ctx.measureText(s.name).width + 44;
    }
  }

  // Catmull-Rom 平滑路径
  function smoothPath(ctx, pts) {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
  }

  function hexA(hex, a) {
    const m = hex.replace("#", "");
    const r = parseInt(m.slice(0, 2), 16);
    const g = parseInt(m.slice(2, 4), 16);
    const b = parseInt(m.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  return { draw };
})();
