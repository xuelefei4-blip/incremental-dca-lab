/**
 * [2.2] lab-charts.js - Canvas 绘图与双轨叠加动画引擎
 */
(function (global) {
  'use strict';

  let currentAnimId = null;

  function stopAnimation() {
    if (currentAnimId) {
      cancelAnimationFrame(currentAnimId);
      currentAnimId = null;
    }
  }

  // 1. 占比非线性压缩归一化 (0% ~ 100%)
  function ratioToNorm(r) {
    if (r <= 0) return 0;
    if (r >= 100) return 1.0;
    const brackets = [
      { r: 0.0,   v: 0.00 },
      { r: 0.2,   v: 0.16 },
      { r: 0.5,   v: 0.32 },
      { r: 1.0,   v: 0.50 },
      { r: 5.0,   v: 0.68 },
      { r: 20.0,  v: 0.84 },
      { r: 100.0, v: 1.00 }
    ];
    for (let i = 0; i < brackets.length - 1; i++) {
      if (r >= brackets[i].r && r <= brackets[i + 1].r) {
        const spanR = brackets[i + 1].r - brackets[i].r;
        const spanV = brackets[i + 1].v - brackets[i].v;
        return brackets[i].v + ((r - brackets[i].r) / spanR) * spanV;
      }
    }
    return 1.0;
  }

  // 2. 自适应时间轴网格
  function getTimeGrid(totalDays) {
    const majorTicks = [];
    const minorDays = [];

    if (totalDays <= 120) {
      for (let d = 0; d <= totalDays; d += 30) {
        const m = Math.round(d / 30);
        majorTicks.push({ day: d, label: d === 0 ? '0' : `${m}月 (${d}天)` });
      }
      for (let d = 0; d <= totalDays; d += 10) if (d % 30 !== 0) minorDays.push(d);
    } else if (totalDays <= 400) {
      for (let d = 0; d <= totalDays; d += 60) {
        const m = Math.round(d / 30);
        const label = d === 0 ? '0' : (d === 360 ? `1年 (360天)` : `${m}月 (${d}天)`);
        majorTicks.push({ day: d, label });
      }
      for (let d = 0; d <= totalDays; d += 30) if (d % 60 !== 0) minorDays.push(d);
    } else if (totalDays <= 1440) {
      for (let d = 0; d <= totalDays; d += 180) {
        const m = Math.round(d / 30);
        const y = (d / 360);
        let label = '0';
        if (d > 0) {
          label = (d % 360 === 0) ? `第${y}年 (${m}月/第${d}天)` : `${y.toFixed(1)}年 (${m}月/第${d}天)`;
        }
        majorTicks.push({ day: d, label });
      }
      for (let d = 0; d <= totalDays; d += 90) if (d % 180 !== 0) minorDays.push(d);
    } else {
      const step = (totalDays >= 2800) ? 720 : 360;
      for (let d = 0; d <= totalDays; d += step) {
        const y = Math.round(d / 360);
        const m = Math.round(d / 30);
        majorTicks.push({ day: d, label: d === 0 ? '0' : `第${y}年 (${m}月)` });
      }
      for (let d = 0; d <= totalDays; d += 180) if (d % step !== 0) minorDays.push(d);
    }

    if (majorTicks.length > 0 && majorTicks[majorTicks.length - 1].day < totalDays * 0.92) {
      const m = Math.round(totalDays / 30);
      const y = (totalDays / 360).toFixed(1);
      majorTicks.push({ day: totalDays, label: `${y}年 (${m}月/${totalDays}天)` });
    }

    return { majorTicks, minorDays };
  }

  // 3. 绘制多图共享时间刻度网格
  function drawSharedTimeGrid(ctx, grid, totalCount, padL, plotW, padT, plotH, h) {
    ctx.save();
    ctx.strokeStyle = '#141c2e';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    grid.minorDays.forEach(day => {
      const x = padL + (day / totalCount) * plotW;
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + plotH); ctx.stroke();
    });
    ctx.setLineDash([]);

    ctx.font = '10px tabular-nums sans-serif';
    ctx.textAlign = 'center';
    grid.majorTicks.forEach(tick => {
      const x = padL + (tick.day / totalCount) * plotW;
      ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + plotH); ctx.stroke();
      ctx.fillStyle = '#64748b';
      ctx.fillText(tick.label, x, h - 8);
    });
    ctx.restore();
  }

  // 4. 穿仓爆仓截断竖线
  function drawSolidBrokenLine(ctx, res1, res2, padL, plotW, padT, plotH, totalCount, currentCount) {
    const brokenDay = (res2 && res2.brokenDay) || (res1 && res1.brokenDay);
    if (brokenDay && currentCount >= brokenDay) {
      ctx.save();
      ctx.setLineDash([]);
      const xb = padL + (brokenDay / totalCount) * plotW;
      ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(xb, padT); ctx.lineTo(xb, padT + plotH); ctx.stroke();
      ctx.restore();
    }
  }

  // 5. 图表 1：每日定投金额柱状/阶梯图
  function drawBarChart(id, res1, res2, count1, count2, totalCount) {
    const cvs = document.getElementById(id);
    if (!cvs) return;
    cvs.width = cvs.clientWidth; cvs.height = cvs.clientHeight;
    const ctx = cvs.getContext('2d');
    const w = cvs.width, h = cvs.height;
    const padL = 60, padR = 30, padT = 28, padB = 26;
    const plotW = w - padL - padR, plotH = h - padT - padB;
    ctx.clearRect(0, 0, w, h);

    const maxVal = Math.max(10, Math.max(res1.maxObservedDaily, res2 ? res2.maxObservedDaily : 0) * 1.15);

    ctx.textAlign = 'right'; ctx.font = '10px tabular-nums sans-serif'; ctx.fillStyle = '#64748b';
    [0, maxVal * 0.5, maxVal].forEach(val => {
      const y = padT + plotH - (val / maxVal) * plotH;
      ctx.strokeStyle = '#1e293b'; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      ctx.fillText(`¥${Math.round(val)}`, padL - 8, y + 3);
    });

    const grid = getTimeGrid(totalCount);
    drawSharedTimeGrid(ctx, grid, totalCount, padL, plotW, padT, plotH, h);

    // 方案 A 柱状图
    const barW = Math.max(1, plotW / totalCount);
    ctx.fillStyle = 'rgba(2, 132, 199, 0.4)';
    for (let i = 0; i < count1; i++) {
      const x = padL + (i / totalCount) * plotW;
      const barH = (res1.history[i].invest / maxVal) * plotH;
      ctx.fillRect(x, padT + plotH - barH, barW, barH);
    }

    // 方案 B 橙线阶梯 (叠加绘制)
    if (res2 && count2 > 0) {
      ctx.beginPath(); ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2.5;
      for (let i = 0; i < count2; i++) {
        const x = padL + (i / totalCount) * plotW;
        const y = padT + plotH - (res2.history[i].invest / maxVal) * plotH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      drawSolidBrokenLine(ctx, res1, res2, padL, plotW, padT, plotH, totalCount, count2);
    } else if (res1 && res1.brokenDay && count1 >= res1.brokenDay) {
      drawSolidBrokenLine(ctx, res1, null, padL, plotW, padT, plotH, totalCount, count1);
    }
  }

  // 6. 图表 2：现金蓄水池存量图
  function drawCumChart(id, res1, res2, count1, count2, totalCount) {
    const cvs = document.getElementById(id);
    if (!cvs) return;
    cvs.width = cvs.clientWidth; cvs.height = cvs.clientHeight;
    const ctx = cvs.getContext('2d');
    const w = cvs.width, h = cvs.height;
    const padL = 60, padR = 30, padT = 28, padB = 26;
    const plotW = w - padL - padR, plotH = h - padT - padB;
    ctx.clearRect(0, 0, w, h);

    let maxCashPool = 10000;
    for (let i = 0; i < count1; i++) {
      if (res1.history[i].cashLeft > maxCashPool) maxCashPool = res1.history[i].cashLeft;
    }
    if (res2) {
      for (let i = 0; i < count2; i++) {
        if (res2.history[i].cashLeft > maxCashPool) maxCashPool = res2.history[i].cashLeft;
      }
    }
    maxCashPool = Math.ceil((maxCashPool * 1.15) / 10000) * 10000;

    ctx.textAlign = 'right'; ctx.font = '10px tabular-nums sans-serif'; ctx.fillStyle = '#64748b';
    [0, maxCashPool * 0.5, maxCashPool].forEach(val => {
      const y = padT + plotH - (val / maxCashPool) * plotH;
      ctx.strokeStyle = '#1e293b'; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      ctx.fillText(`¥${(val / 10000).toFixed(1)}万`, padL - 8, y + 3);
    });

    const zeroY = padT + plotH;
    ctx.save();
    ctx.strokeStyle = '#ef4444';
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(padL, zeroY); ctx.lineTo(w - padR, zeroY); ctx.stroke();
    ctx.restore();

    const grid = getTimeGrid(totalCount);
    drawSharedTimeGrid(ctx, grid, totalCount, padL, plotW, padT, plotH, h);

    // 方案 A 活钱曲线 (紫色)
    ctx.beginPath(); ctx.strokeStyle = '#a855f7'; ctx.lineWidth = 1.8;
    for (let i = 0; i < count1; i++) {
      const x = padL + (i / totalCount) * plotW;
      const y = padT + plotH - (Math.max(0, res1.history[i].cashLeft) / maxCashPool) * plotH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 方案 B 活钱曲线 (橙色叠加)
    if (res2 && count2 > 0) {
      ctx.beginPath(); ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2.5;
      for (let i = 0; i < count2; i++) {
        const x = padL + (i / totalCount) * plotW;
        const y = padT + plotH - (Math.max(0, res2.history[i].cashLeft) / maxCashPool) * plotH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      drawSolidBrokenLine(ctx, res1, res2, padL, plotW, padT, plotH, totalCount, count2);
    } else if (res1 && res1.brokenDay && count1 >= res1.brokenDay) {
      drawSolidBrokenLine(ctx, res1, null, padL, plotW, padT, plotH, totalCount, count1);
    }
  }

  // 7. 图表 3：当日定投占比图
  function drawRatioChart(id, res1, res2, count1, count2, totalCount, targetRatioVal) {
    const cvs = document.getElementById(id);
    if (!cvs) return;
    cvs.width = cvs.clientWidth; cvs.height = cvs.clientHeight;
    const ctx = cvs.getContext('2d');
    const w = cvs.width, h = cvs.height;
    const padL = 60, padR = 30, padT = 28, padB = 26;
    const plotW = w - padL - padR, plotH = h - padT - padB;
    ctx.clearRect(0, 0, w, h);

    [0.0, 0.5, 1.0, 5.0, 20.0, 100.0].forEach(tickVal => {
      const y = padT + plotH - ratioToNorm(tickVal) * plotH;
      ctx.strokeStyle = '#1e293b'; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      ctx.fillStyle = tickVal === 0.5 ? '#ef4444' : '#64748b';
      ctx.fillText(`${tickVal}%`, padL - 8, y + 3);
    });

    const grid = getTimeGrid(totalCount);
    drawSharedTimeGrid(ctx, grid, totalCount, padL, plotW, padT, plotH, h);

    const targetRatio = (typeof targetRatioVal === 'number') ? targetRatioVal : (res1.minRatio * 100);
    const targetY = padT + plotH - ratioToNorm(targetRatio) * plotH;
    ctx.beginPath(); ctx.strokeStyle = '#ef4444'; ctx.setLineDash([4, 4]);
    ctx.moveTo(padL, targetY); ctx.lineTo(w - padR, targetY); ctx.stroke();
    ctx.setLineDash([]);

    // 方案 A 占比曲线 (黄色贴底)
    ctx.beginPath(); ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < count1; i++) {
      const x = padL + (i / totalCount) * plotW;
      const y = padT + plotH - ratioToNorm(res1.history[i].ratio * 100) * plotH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 方案 B 占比曲线 (橙色饱满锯齿叠加)
    if (res2 && count2 > 0) {
      ctx.beginPath(); ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2;
      for (let i = 0; i < count2; i++) {
        const x = padL + (i / totalCount) * plotW;
        const y = padT + plotH - ratioToNorm(res2.history[i].ratio * 100) * plotH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      drawSolidBrokenLine(ctx, res1, res2, padL, plotW, padT, plotH, totalCount, count2);
    } else if (res1 && res1.brokenDay && count1 >= res1.brokenDay) {
      drawSolidBrokenLine(ctx, res1, null, padL, plotW, padT, plotH, totalCount, count1);
    }
  }

  // 8. 动画调度器 1：方案 A 独立入场动画
  function playBaselineAnimation(resA, options) {
    stopAnimation();
    const opts = options || {};
    if (typeof opts.onStart === 'function') opts.onStart();

    const totalFrames = 25;
    let frame = 0;
    const targetDays = resA.finalDays;
    const maxPlotDays = Math.max(resA.plannedDays, resA.finalDays);
    const targetRatio = (resA.minRatio * 100);

    function renderFrame() {
      frame++;
      const rawProgress = frame / totalFrames;
      const progress = Math.min(1, 1 - Math.pow(1 - rawProgress, 2.5));
      const countA = Math.max(1, Math.floor(progress * targetDays));

      drawBarChart('canvas-invest', resA, null, countA, 0, maxPlotDays);
      drawCumChart('canvas-cum', resA, null, countA, 0, maxPlotDays);
      drawRatioChart('canvas-ratio', resA, null, countA, 0, maxPlotDays, targetRatio);

      if (rawProgress < 1) {
        currentAnimId = requestAnimationFrame(renderFrame);
      } else {
        currentAnimId = null;
        if (typeof opts.onComplete === 'function') opts.onComplete();
      }
    }

    currentAnimId = requestAnimationFrame(renderFrame);
  }

  // 9. 动画调度器 2：方案 B 橙线在原有方案 A 上叠加生长动画
  function playOptimizedOverlayAnimation(resA, resB, options) {
    stopAnimation();
    const opts = options || {};
    if (typeof opts.onStart === 'function') opts.onStart();

    const totalFrames = 25;
    let frame = 0;
    const countA = resA.finalDays; // 方案 A 保持满幅展示
    const targetDaysB = resB.finalDays;
    const maxPlotDays = Math.max(resA.plannedDays, resA.finalDays);
    const targetRatio = (resA.minRatio * 100);

    function renderFrame() {
      frame++;
      const rawProgress = frame / totalFrames;
      const progress = Math.min(1, 1 - Math.pow(1 - rawProgress, 2.5));
      const countB = Math.max(1, Math.floor(progress * targetDaysB));

      drawBarChart('canvas-invest', resA, resB, countA, countB, maxPlotDays);
      drawCumChart('canvas-cum', resA, resB, countA, countB, maxPlotDays);
      drawRatioChart('canvas-ratio', resA, resB, countA, countB, maxPlotDays, targetRatio);

      if (rawProgress < 1) {
        currentAnimId = requestAnimationFrame(renderFrame);
      } else {
        currentAnimId = null;
        if (typeof opts.onComplete === 'function') opts.onComplete();
      }
    }

    currentAnimId = requestAnimationFrame(renderFrame);
  }

  const LabCharts = {
    stopAnimation,
    ratioToNorm,
    getTimeGrid,
    drawSharedTimeGrid,
    drawSolidBrokenLine,
    drawBarChart,
    drawCumChart,
    drawRatioChart,
    playBaselineAnimation,
    playOptimizedOverlayAnimation
  };

  // 挂载至全局上下文
  global.LabCharts = LabCharts;
  global.drawBarChart = drawBarChart;
  global.drawCumChart = drawCumChart;
  global.drawRatioChart = drawRatioChart;
  global.getTimeGrid = getTimeGrid;
  global.drawSharedTimeGrid = drawSharedTimeGrid;

})(typeof window !== 'undefined' ? window : this);