/**
 * 快照生成与归档引擎 (Snapshot Exporter)
 * 职责：抓取 Canvas 图表、拼接 HUD 数据、生成右侧策略阶梯档案卡，存入 IndexedDB
 */
import { saveSnapshot, getAllSnapshots } from './db.js';
import { getCurrentInvestMode, getLoadedStrategy } from './main-strategy.js';

export async function updatePocketBadge() {
  const badge = document.getElementById('pocketBadge');
  if (!badge) return;
  try {
    const list = await getAllSnapshots();
    badge.innerText = `${list.length} 张截图`;
    badge.style.background = list.length > 0 ? '#f59e0b' : '#334155';
    badge.style.color = list.length > 0 ? '#0b0f19' : '#94a3b8';
  } catch (e) {
    badge.innerText = `0 张截图`;
  }
}

export async function snapCurrentViewToPocket() {
  const mainCanvas = document.getElementById('mainCanvas');
  if (!mainCanvas || mainCanvas.width === 0 || mainCanvas.height === 0) {
    alert('当前暂无图表画面可截图！');
    return;
  }

  const w = mainCanvas.width;
  const h = mainCanvas.height;
  const scale = Math.max(1, w / 1280);

  const topH = Math.round(52 * scale);
  const bottomH = Math.round(84 * scale);
  const sideW = Math.round(290 * scale);

  const shot = document.createElement('canvas');
  shot.width = w + sideW;
  shot.height = h + topH + bottomH;
  const ctx = shot.getContext('2d');

  ctx.fillStyle = '#0b0f19';
  ctx.fillRect(0, 0, shot.width, shot.height);

  // 1. 顶部：一级客观市场条
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, w, topH);
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = Math.max(1, Math.round(scale));
  ctx.strokeRect(0, 0, w, topH);

  const hudP = document.getElementById('hudPeriod')?.innerText || '-';
  const hudValid = document.getElementById('hudValidDays')?.innerText || '-';
  const hudRest = document.getElementById('hudRestDays')?.innerText || '-';
  const hudPr = document.getElementById('hudPrice')?.innerText || '-';
  const hudChg = document.getElementById('hudMarketChange')?.innerText || '-';
  const hudSt = document.getElementById('hudMarketStatus')?.innerText || '开市交易中';

  const topFontSize = Math.round(13 * scale);
  ctx.textBaseline = 'middle';
  const topY = topH / 2;

  let curX = 20 * scale;
  const drawTopTag = (lbl, val, valColor) => {
    ctx.textAlign = 'left';
    ctx.font = `${topFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(lbl, curX, topY);
    curX += ctx.measureText(lbl).width + 5 * scale;

    ctx.font = `bold ${topFontSize}px tabular-nums -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillStyle = valColor || '#f8fafc';
    ctx.fillText(val, curX, topY);
    curX += ctx.measureText(val).width + 20 * scale;
  };

  drawTopTag('时间进度:', hudP, '#f8fafc');
  drawTopTag('有效交易日:', hudValid, '#38bdf8');
  drawTopTag('未交易日:', hudRest, '#f59e0b');
  drawTopTag('市场现价 P(t):', hudPr, '#38bdf8');
  drawTopTag('标的自身涨幅:', hudChg, (hudChg.startsWith('+') ? '#10b981' : '#ef4444'));
  drawTopTag('交易环境:', hudSt, '#38bdf8');

  // 2. 中间：主图表画面
  ctx.drawImage(mainCanvas, 0, topH);

  // 3. 底部：二级个人账本条
  const sumY = shot.height - bottomH;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, sumY, w, bottomH);
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = Math.max(1, Math.round(scale));
  ctx.strokeRect(0, sumY, w, bottomH);

  const sumInv = document.getElementById('sumInvested')?.innerText || '-';
  const sumPnd = document.getElementById('sumPending')?.innerText || '-';
  const sumCost = document.getElementById('sumCost')?.innerText || '-';
  const sumRatio = document.getElementById('sumRatio')?.innerText || '-';
  const sumValue = document.getElementById('sumValue')?.innerText || '-';
  const sumRoi = document.getElementById('sumRoi')?.innerText || '-';
  const sumRealRoi = document.getElementById('sumRealRoi')?.innerText || '-';

  const bottomItems = [
    { label: '累计已投入', val: sumInv, color: '#38bdf8' },
    { label: '休市未投(滞留)', val: sumPnd, color: '#f59e0b' },
    { label: '持仓平均成本', val: sumCost, color: '#10b981' },
    { label: '当日定投占比', val: sumRatio, color: '#eab308' },
    { label: '当前资产总市值', val: sumValue, color: '#f8fafc' },
    { label: '投资利润率 (ROI)', val: sumRoi, color: (sumRoi.startsWith('+') ? '#10b981' : '#ef4444') },
    { label: '真实净利润(扣贬值)', val: sumRealRoi, color: (sumRealRoi.startsWith('+') ? '#10b981' : '#ef4444') }
  ];

  const margin = 36 * scale;
  const usableW = w - 2 * margin;
  const colW = usableW / bottomItems.length;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  bottomItems.forEach((item, idx) => {
    const cx = margin + idx * colW + colW / 2;

    ctx.font = `${Math.round(13 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(item.label, cx, sumY + 28 * scale);

    ctx.font = `bold ${Math.round(18 * scale)}px tabular-nums -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillStyle = item.color;
    ctx.fillText(item.val, cx, sumY + 58 * scale);
  });

  // 4. 右侧：精炼档案 + 完整定投阶梯表
  const sideX = w;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(sideX, 0, sideW, shot.height);
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = Math.max(1, Math.round(scale));
  ctx.strokeRect(sideX, 0, sideW, shot.height);

  const inSourceSelect = document.getElementById('inSource');
  const sourceName = inSourceSelect?.options[inSourceSelect.selectedIndex]?.text || inSourceSelect.value.toUpperCase();
  const periodStr = `${document.getElementById('inPeriodStart')?.value} ~ ${document.getElementById('inPeriodEnd')?.value}`;
  const nowTimeStr = new Date().toLocaleString('zh-CN', { hour12: false });
  const currentInvestMode = getCurrentInvestMode();
  const loadedStrategy = getLoadedStrategy();
  const isFixed = (currentInvestMode === 'fixed');

  const rPad = sideX + 14 * scale;
  const rInnerW = sideW - 28 * scale;
  let rY = 18 * scale;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `bold ${Math.round(14 * scale)}px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.fillStyle = '#38bdf8';
  ctx.fillText('📋 回测档案记录', rPad, rY);
  rY += 26 * scale;

  // 资产标的
  ctx.fillStyle = '#141d33';
  ctx.fillRect(rPad, rY, rInnerW, 46 * scale);
  ctx.strokeStyle = '#1e293b';
  ctx.strokeRect(rPad, rY, rInnerW, 46 * scale);
  ctx.font = `${Math.round(9.5 * scale)}px sans-serif`;
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('【资产标的】', rPad + 8 * scale, rY + 6 * scale);
  ctx.font = `bold ${Math.round(11 * scale)}px sans-serif`;
  ctx.fillStyle = '#f8fafc';
  ctx.fillText(sourceName, rPad + 8 * scale, rY + 24 * scale);
  rY += 54 * scale;

  // 测试时间跨度
  ctx.fillStyle = '#141d33';
  ctx.fillRect(rPad, rY, rInnerW, 46 * scale);
  ctx.strokeStyle = '#1e293b';
  ctx.strokeRect(rPad, rY, rInnerW, 46 * scale);
  ctx.font = `${Math.round(9.5 * scale)}px sans-serif`;
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('【测试时间跨度】', rPad + 8 * scale, rY + 6 * scale);
  ctx.font = `bold ${Math.round(12 * scale)}px monospace`;
  ctx.fillStyle = '#38bdf8';
  ctx.fillText(periodStr, rPad + 8 * scale, rY + 24 * scale);
  rY += 54 * scale;

  // 定投策略与阶梯表
  const sum = loadedStrategy?.summary || {};
  let intervals = sum.ladderIntervals || [];

  if (!isFixed && intervals.length === 0 && loadedStrategy?.dailySchedule) {
    let curG = null;
    loadedStrategy.dailySchedule.forEach(item => {
      if (!curG || curG.invest !== item.invest) {
        if (curG) intervals.push(curG);
        curG = { startDay: item.day, endDay: item.day, invest: item.invest, count: 1, endCum: item.cumSpent };
      } else {
        curG.endDay = item.day;
        curG.endCum = item.cumSpent;
        curG.count++;
      }
    });
    if (curG) intervals.push(curG);
  }

  const planTitle = isFixed ? '固定金额定投模式' : (sum.planName || '自定义增量策略');
  const rowH = Math.round(20 * scale);
  const rowsCount = isFixed ? 2 : (intervals.length + 2);
  const ladderBoxH = Math.round(36 * scale) + rowsCount * rowH + Math.round(12 * scale);

  ctx.fillStyle = '#141d33';
  ctx.fillRect(rPad, rY, rInnerW, ladderBoxH);
  ctx.strokeStyle = isFixed ? '#1e293b' : 'rgba(245, 158, 11, 0.4)';
  ctx.strokeRect(rPad, rY, rInnerW, ladderBoxH);

  ctx.font = `${Math.round(9.5 * scale)}px sans-serif`;
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('【定投策略与规格】', rPad + 8 * scale, rY + 6 * scale);
  ctx.font = `bold ${Math.round(12 * scale)}px sans-serif`;
  ctx.fillStyle = '#f59e0b';
  ctx.fillText(planTitle, rPad + 8 * scale, rY + 22 * scale);

  let listY = rY + 42 * scale;

  if (isFixed) {
    const baseInvestVal = document.getElementById('inBaseInvest')?.value || '300';
    const totalBudgetVal = document.getElementById('inTotalBudget')?.value || '--';
    ctx.font = `${Math.round(11 * scale)}px monospace`;
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(`· 每日供款: ¥${baseInvestVal} /天`, rPad + 10 * scale, listY);
    listY += rowH;
    ctx.fillText(`· 规划总额: ¥${Number(totalBudgetVal).toLocaleString()}`, rPad + 10 * scale, listY);
  } else {
    intervals.forEach(inv => {
      const rangeText = `第${inv.startDay}~${inv.endDay}天`;
      const durText = `${inv.count}天(${(inv.count/30).toFixed(1)}月)`;
      const cumText = `累¥${Math.round(inv.endCum).toLocaleString()}`;
      const investText = `¥${inv.invest}`;

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(rPad + 6 * scale, listY - 2 * scale, rInnerW - 12 * scale, rowH - 2 * scale);

      ctx.font = `${Math.round(9.5 * scale)}px monospace`;
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(rangeText, rPad + 8 * scale, listY);

      ctx.fillStyle = '#64748b';
      ctx.fillText(durText, rPad + 82 * scale, listY);

      ctx.fillStyle = '#94a3b8';
      ctx.fillText(cumText, rPad + 152 * scale, listY);

      ctx.font = `bold ${Math.round(11 * scale)}px monospace`;
      ctx.fillStyle = '#f59e0b';
      ctx.textAlign = 'right';
      ctx.fillText(investText, rPad + rInnerW - 10 * scale, listY);
      ctx.textAlign = 'left';

      listY += rowH;
    });

    const cruiseDaily = sum.cruiseDaily || 100;
    const monthly = sum.monthlyDisposable || (cruiseDaily * 30);
    listY += 4 * scale;
    ctx.font = `${Math.round(10 * scale)}px sans-serif`;
    ctx.fillStyle = '#10b981';
    ctx.fillText(`超期巡航: ¥${cruiseDaily}/天 (¥${Number(monthly).toLocaleString()}/月)`, rPad + 8 * scale, listY);
  }

  rY += ladderBoxH + 12 * scale;

  // 存档时间戳
  ctx.fillStyle = '#141d33';
  ctx.fillRect(rPad, rY, rInnerW, 36 * scale);
  ctx.strokeStyle = '#1e293b';
  ctx.strokeRect(rPad, rY, rInnerW, 36 * scale);
  ctx.font = `${Math.round(9.5 * scale)}px sans-serif`;
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('【存档时间戳】', rPad + 8 * scale, rY + 5 * scale);
  ctx.font = `${Math.round(10 * scale)}px monospace`;
  ctx.fillStyle = '#64748b';
  ctx.fillText(nowTimeStr, rPad + 8 * scale, rY + 19 * scale);

  const imgData = shot.toDataURL('image/png');
  const source = document.getElementById('inSource').value.toUpperCase();
  const modeLabel = isFixed ? `固定定投 (¥${document.getElementById('inBaseInvest')?.value}/天)` : planTitle;

  const snapshotItem = {
    id: 'shot_' + Date.now(),
    timestamp: Date.now(),
    createTime: nowTimeStr,
    source: source,
    period: periodStr,
    mode: currentInvestMode,
    modeLabel: modeLabel,
    cost: sumCost,
    invested: sumInv,
    value: sumValue,
    roi: sumRoi,
    realRoi: sumRealRoi,
    imgUrl: imgData
  };

  try {
    await saveSnapshot(snapshotItem);
    await updatePocketBadge();
    window.postMessage({ type: 'POCKET_SNAPSHOT_SAVED' }, '*');
    
    const tip = document.getElementById('pocketStatusTip');
    if (tip) {
      tip.style.color = '#10b981';
      tip.innerText = `✓ 已成功存入带完整阶梯明细的快照！`;
      setTimeout(() => {
        tip.style.color = '#64748b';
        tip.innerText = '每次测试完成后点击截图，自动归档至 [3.0] 口袋独立陈列馆。';
      }, 3000);
    }
  } catch (err) {
    alert('存储空间异常或保存失败：' + err.message);
  }
}