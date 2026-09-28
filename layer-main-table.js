export const MainTableLayer = {
  name: 'main-table-layer',

  // 纯物理递推核：支持第 0 天真实定投发生
  calculateStep(t, prevTick, frame) {
    const { price, invest, date, dateStr } = frame;

    // t=0 首日递推
    if (t === 0 || !prevTick) {
      const unitsBought = price > 0 ? (invest / price) : 0;
      return { 
        t: 0, 
        date: date || dateStr,
        dateStr: dateStr || date,
        price, 
        invest,
        cumInvested: invest, 
        cumUnits: unitsBought, 
        avgCost: price > 0 ? price : 0, 
        assetValue: unitsBought * price, 
        ratio: 1.0 
      };
    }

    const unitsBought = price > 0 ? (invest / price) : 0;
    const cumInvested = prevTick.cumInvested + invest;
    const cumUnits = prevTick.cumUnits + unitsBought;
    const avgCost = cumUnits > 0 ? (cumInvested / cumUnits) : price;
    const assetValue = cumUnits * price;
    
    // 防爆安全保护：限制 ratio 区间在 [0, 10]
    const ratio = assetValue > 0 ? Math.min(10, Math.max(0, invest / assetValue)) : 1.0;

    return { 
      t, 
      date: date || dateStr,
      dateStr: dateStr || date,
      price, 
      invest,
      cumInvested, 
      cumUnits, 
      avgCost, 
      assetValue, 
      ratio 
    };
  },

  // 纯粹的渲染：资产波浪、黄线下弧线、本金虚线
  draw(ctx, layout, series, currentStep, curX) {
    const { mainArea, padL, plotW, viewOffset, windowDays } = layout;
    if (!series || series.length === 0) return;

    const safeTotal = series.length - 1;
    const visibleStart = Math.max(0, Math.min(safeTotal, viewOffset));
    const visibleEnd = Math.max(0, Math.min(safeTotal, viewOffset + windowDays));
    const renderLimit = Math.min(currentStep, visibleEnd);

    ctx.strokeStyle = '#334155';
    ctx.strokeRect(padL, mainArea.top, plotW, mainArea.h);

    const visibleSlice = series.slice(visibleStart, visibleEnd + 1);
    if (visibleSlice.length === 0) return;

    const maxVal = Math.max(...visibleSlice.map(s => Math.max(s.assetValue || 0, s.cumInvested || 0)), 100);

    const getYMoney = (val) => mainArea.top + mainArea.h - (val / (maxVal || 1)) * (mainArea.h - 16) - 2;
    const getX = (t) => padL + ((t - visibleStart) / (windowDays || 1)) * plotW;

    const getLogRatioY = (ratio) => {
      const clamped = Math.max(0.0005, Math.min(1.0, ratio));
      const normalized = Math.pow(clamped, 0.28); 
      return mainArea.top + mainArea.h - normalized * (mainArea.h - 18);
    };

    // 1. 左侧对数刻度 (投入占比)
    const keyRatios = [
      { val: 1.0, text: '100%' }, { val: 0.2, text: '20%' },
      { val: 0.05, text: '5%' },   { val: 0.01, text: '1%' },
      { val: 0.001, text: '0.1%' }
    ];
    ctx.textAlign = 'right';
    ctx.font = '10px monospace';
    ctx.fillStyle = '#eab308';
    keyRatios.forEach(item => {
      const y = getLogRatioY(item.val);
      ctx.fillText(item.text, padL - 8, y + 3);
      ctx.strokeStyle = 'rgba(234, 179, 8, 0.06)';
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
    });

    // 2. 右侧金额刻度 (资产总额)
    ctx.textAlign = 'left';
    ctx.fillStyle = '#64748b';
    for (let i = 0; i <= 3; i++) {
      const val = maxVal * (i / 3);
      ctx.fillText((val / 10000).toFixed(1) + '万', padL + plotW + 8, getYMoney(val) + 3);
    }

    // 3. 开始绘制波浪与轨迹
    if (renderLimit >= visibleStart) {
      // 本金投入线 (白细虚线)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      for (let t = visibleStart; t <= renderLimit; t++) {
        if (!series[t]) continue;
        const x = getX(t);
        const y = getYMoney(series[t].cumInvested || 0);
        if (t === visibleStart) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // 资产总额波浪面积
      const grad = ctx.createLinearGradient(0, mainArea.top, 0, mainArea.top + mainArea.h);
      grad.addColorStop(0, 'rgba(56, 189, 248, 0.28)');
      grad.addColorStop(1, 'rgba(56, 189, 248, 0.01)');

      ctx.beginPath();
      ctx.moveTo(getX(visibleStart), mainArea.top + mainArea.h);
      for (let t = visibleStart; t <= renderLimit; t++) {
        if (!series[t]) continue;
        ctx.lineTo(getX(t), getYMoney(series[t].assetValue || 0));
      }
      ctx.lineTo(getX(renderLimit), mainArea.top + mainArea.h);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // 资产总额折线 (青蓝)
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      for (let t = visibleStart; t <= renderLimit; t++) {
        if (!series[t]) continue;
        const x = getX(t);
        const y = getYMoney(series[t].assetValue || 0);
        if (t === visibleStart) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // 边际钝化下弧线 (黄虚线)
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      for (let t = visibleStart; t <= renderLimit; t++) {
        if (!series[t]) continue;
        const x = getX(t);
        const yRatio = getLogRatioY(series[t].ratio || 1.0);
        if (t === visibleStart) ctx.moveTo(x, yRatio); else ctx.lineTo(x, yRatio);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // 当前进度游标圆环
      if (curX !== null && series[renderLimit]) {
        const curAssetY = getYMoney(series[renderLimit].assetValue || 0);
        ctx.fillStyle = '#090d16';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(curX, curAssetY, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // 图例
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f59e0b';
    ctx.fillText('-- 本期投入/总资产比 (左轴)', padL + 8, mainArea.top + 14);
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('— 资产总额 (右轴，含波动增益)', padL + 175, mainArea.top + 14);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillText('-- 本金投入基准', padL + 340, mainArea.top + 14);
  }
};