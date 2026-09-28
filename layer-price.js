// plugins/layer-price.js

const RAW_CACHE = {};

async function loadMarketData(source) {
  if (RAW_CACHE[source]) return RAW_CACHE[source];
  try {
    const res = await fetch(`./data/${source}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    RAW_CACHE[source] = json;
    return json;
  } catch (err) {
    console.warn(`[PriceOverlayLayer] 加载数据 ${source}.json 失败:`, err);
    return null;
  }
}

export const PriceOverlayLayer = {
  name: 'price-layer',

  // 1. 预载入并返回 JSON 数据
  async preload(source) {
    if (source && source !== 'custom') {
      return await loadMarketData(source);
    }
    return null;
  },

  getMeta(key) {
    return RAW_CACHE[key] || null;
  },

  // 2. 根据选中的起止月份截取真实日线或生成数学曲线
  buildSeries(config) {
    const { 
      source, 
      startPeriod, 
      endPeriod, 
      priceStart, 
      priceEnd, 
      amplitude, 
      cycleYears 
    } = config;

    // 真实日度行情数据处理
    if (source !== 'custom' && RAW_CACHE[source]) {
      const allDaily = RAW_CACHE[source].data || [];
      
      let startStr = startPeriod || '1900-01';
      let endStr = endPeriod || '2099-12';

      // 补齐日期字符串以便按日进行字典序准确过滤
      if (startStr.length === 7) startStr = `${startStr}-01`;
      if (endStr.length === 7) endStr = `${endStr}-31`;

      const filtered = allDaily.filter(([dateStr, price]) => {
        if (!dateStr || price === null || price === undefined || isNaN(price)) return false;
        return dateStr >= startStr && dateStr <= endStr;
      });

      if (filtered.length > 0) {
        return filtered.map(([date, price], index) => ({
          t: index,
          date: date,
          dateStr: date,
          price: Number(price)
        }));
      }
    }

    // 自定义数学模型 (选 custom 或无数据时兜底)
    const yStart = startPeriod ? parseInt(startPeriod.slice(0, 4)) : 2023;
    const yEnd = endPeriod ? parseInt(endPeriod.slice(0, 4)) : 2026;
    const totalDays = Math.max(30, Math.round((Math.max(yEnd - yStart, 0.5)) * 365));
    
    const P0 = Number(priceStart) || 100;
    const P1 = Number(priceEnd) || 100;
    const amp = (Number(amplitude) || 0) / 100;
    const cycleDays = (Number(cycleYears) || 1) * 365;

    const series = [];
    for (let t = 0; t <= totalDays; t++) {
      const base = P0 + (P1 - P0) * (t / totalDays);
      let p = base;
      if (cycleDays > 0 && amp > 0) {
        p = base * (1 + amp * Math.sin((2 * Math.PI * t) / cycleDays));
      }
      series.push({
        t,
        date: `D${t}`,
        dateStr: `D${t}`,
        price: Math.max(0.01, p)
      });
    }
    return series;
  },

  // 3. 绘制上轨：基准线、刻度、红线 P(t) 与 绿线 Cost(t)
  draw(ctx, layout, series, currentStep, isPriceConfirmed) {
    const { topArea, padL, plotW, viewOffset = 0, windowDays = 100 } = layout;
    if (!series || series.length === 0) return;

    const safeTotal = series.length - 1;
    const effWindow = Math.max(1, windowDays);
    const visibleStart = Math.max(0, Math.min(safeTotal, viewOffset));
    const visibleEnd = Math.max(0, Math.min(safeTotal, viewOffset + effWindow));

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.strokeRect(padL, topArea.top, plotW, topArea.h);

    const visibleSlice = series.slice(visibleStart, visibleEnd + 1);
    if (visibleSlice.length === 0) return;

    const P0 = series[0].price || 100;
    const prices = visibleSlice.map(s => s.price);
    const minP = Math.max(0, Math.min(...prices, P0 * 0.5) * 0.95);
    const maxP = Math.max(...prices, P0 * 1.5) * 1.05;
    const priceSpan = (maxP - minP) || 1;

    const getPriceY = (p) => topArea.top + topArea.h - ((p - minP) / priceSpan) * (topArea.h - 18) - 9;
    const getX = (t) => padL + ((t - visibleStart) / effWindow) * plotW;

    // 起点基准参考线 (白色虚线)
    const p0Y = getPriceY(P0);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(padL, p0Y);
    ctx.lineTo(padL + plotW, p0Y);
    ctx.stroke();
    ctx.setLineDash([]);

    // 刻度
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`${P0.toFixed(0)} (起点)`, padL - 8, p0Y + 3);
    ctx.fillText(maxP.toFixed(0), padL - 8, topArea.top + 10);
    ctx.fillText(minP.toFixed(0), padL - 8, topArea.top + topArea.h - 2);

    // 市场价格曲线 (红线 P(t))
    if (isPriceConfirmed && visibleSlice.length > 0) {
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let i = 0; i < visibleSlice.length; i++) {
        const item = visibleSlice[i];
        const x = getX(item.t);
        const y = getPriceY(item.price);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // 持仓均价曲线 (绿线 Cost(t))
    if (currentStep > 0) {
      const renderLimit = Math.min(currentStep, visibleEnd);
      if (renderLimit >= visibleStart) {
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        let started = false;
        for (let t = visibleStart; t <= renderLimit; t++) {
          if (series[t] && series[t].avgCost !== undefined) {
            const x = getX(t);
            const yCost = getPriceY(series[t].avgCost);
            if (!started) { ctx.moveTo(x, yCost); started = true; } else ctx.lineTo(x, yCost);
          }
        }
        ctx.stroke();
      }
    }

    // 顶部图例
    ctx.textAlign = 'left';
    ctx.font = '10px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText('-- 起点基准', padL + 8, topArea.top + 13);
    if (isPriceConfirmed) {
      ctx.fillStyle = '#f43f5e';
      ctx.fillText('— 市场价格 P(t)', padL + 80, topArea.top + 13);
    }
    if (currentStep > 0) {
      ctx.fillStyle = '#10b981';
      ctx.fillText('— 持仓均价 Cost(t)', padL + 190, topArea.top + 13);
    }
  }
};