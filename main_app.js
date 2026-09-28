/**
 * 增量定投动力学实验台 - 调度中枢 (App Core)
 * 职责：图表渲染中枢、时间轴步进循环、HUD 同步更新、交互事件监听
 */
import { ChartCore } from './chart-core.js';
// ⚠️ 注意：已经挪到根目录，去掉 /plugins/
import { PriceOverlayLayer } from './layer-price.js';
import { MainTableLayer } from './layer-main-table.js';

// ⚠️ 注意：文件名改为了 main-strategy.js
import { 
  initStrategyModeControls, 
  getInvestForDay, 
  getCurrentInvestMode, 
  getLoadedStrategy 
} from './main-strategy.js';

// ⚠️ 注意：文件名改为了 main-snapshot.js
import { 
  snapCurrentViewToPocket, 
  updatePocketBadge 
} from './main-snapshot.js';
class App {
  constructor() {
    this.chart = new ChartCore('mainCanvas');
    this.isPlaying = false;
    this.isPriceConfirmed = false;
    this.isSimulationActive = false;
    this.currentStep = 0;
    this.timer = null;
    this.ANIMATION_FRAME_MS = 20;

    const initialRatioInput = parseFloat(document.getElementById('inLimitRatio')?.value);
    this.activeLimitRatio = isNaN(initialRatioInput) ? 0.05 : initialRatioInput;

    this.renderedBreachLines = [];
    this.hoveredBreachIndex = null;

    initStrategyModeControls(() => {
      this.stopAnimation();
      this.currentStep = 0;
      this.render();
    });

    this.bindEvents();
    this.chart.onViewChange = () => this.render();
    
    this.initApp();
  }

  async initApp() {
    const source = document.getElementById('inSource').value;
    await PriceOverlayLayer.preload(source);
    await this.updateSourceBounds();
    this.syncFixedInvestInputs('daily');
    await updatePocketBadge();
    this.render();
  }

  stopAnimation() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isPlaying = false;
  }

  getTotalCalendarDays() {
    const pStart = document.getElementById('inPeriodStart')?.value || '2023-08';
    const pEnd = document.getElementById('inPeriodEnd')?.value || '2026-09';
    const d1 = new Date(`${pStart}-01`);
    const [y2, m2] = pEnd.split('-').map(Number);
    const d2 = new Date(y2, m2, 0);
    return Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1);
  }

  syncFixedInvestInputs(fromField = 'daily') {
    const dailyInp = document.getElementById('inBaseInvest');
    const totalInp = document.getElementById('inTotalBudget');
    const tipEl = document.getElementById('fixedInterlockTip');
    if (!dailyInp || !totalInp) return;

    const totalDays = this.getTotalCalendarDays();

    if (fromField === 'daily') {
      const dailyVal = Math.max(1, parseFloat(dailyInp.value) || 0);
      const totalVal = Math.round(dailyVal * totalDays);
      totalInp.value = totalVal;
    } else if (fromField === 'total') {
      const totalVal = Math.max(1, parseFloat(totalInp.value) || 0);
      const dailyVal = Math.max(1, Math.round(totalVal / totalDays));
      dailyInp.value = dailyVal;
    }

    if (tipEl) {
      tipEl.innerHTML = `按自然日 <b>${totalDays}</b> 天核算 | 每日 <b>¥${dailyInp.value}</b> ⇋ 总计 <b>¥${Number(totalInp.value).toLocaleString()}</b>`;
    }
  }

  getUIParams() {
    const source = document.getElementById('inSource').value;
    const periodStart = document.getElementById('inPeriodStart')?.value || '2023-08';
    const periodEnd = document.getElementById('inPeriodEnd')?.value || '2026-09';

    const [y1, m1] = periodStart.split('-').map(Number);
    const [y2, m2] = periodEnd.split('-').map(Number);
    const totalMonths = Math.max(1, (y2 - y1) * 12 + (m2 - m1) + 1);
    const baseInvest = Math.max(1, parseFloat(document.getElementById('inBaseInvest')?.value) || 300);

    return {
      source,
      periodStart,
      periodEnd,
      startPeriod: periodStart,
      endPeriod: periodEnd,
      startDateStr: `${periodStart}-01`,
      endDateStr: `${periodEnd}-31`,
      yearStart: y1,
      yearEnd: y2,
      totalMonths,
      diffYears: +(totalMonths / 12).toFixed(2),
      baseInvest,
      priceStart: parseFloat(document.getElementById('inPriceStart')?.value) || 100,
      priceEnd: parseFloat(document.getElementById('inPriceEnd')?.value) || 100,
      amplitude: parseFloat(document.getElementById('inAmplitude')?.value) || 0,
      cycleYears: parseFloat(document.getElementById('inCycle')?.value) || 0
    };
  }

  buildLedger() {
    const params = this.getUIParams();
    const rawPrices = PriceOverlayLayer.buildSeries(params);
    const ledger = [];
    let prev = null;

    const limitRatioVal = this.activeLimitRatio !== undefined ? this.activeLimitRatio : 0.05;
    const limitRatioThreshold = limitRatioVal / 100;

    const breachEvents = [];
    let wasBelowThreshold = false;
    let lastBreachStep = -999;
    const MIN_EVENT_GAP = 30;

    for (let t = 0; t < rawPrices.length; t++) {
      const currentDayInvest = getInvestForDay(t + 1);

      const frame = {
        date: rawPrices[t].date,
        dateStr: rawPrices[t].dateStr,
        price: rawPrices[t].price,
        invest: currentDayInvest
      };
      const record = MainTableLayer.calculateStep(t, prev, frame);

      const isBelow = (t >= 5 && record.ratio > 0 && record.ratio < limitRatioThreshold);
      if (isBelow && !wasBelowThreshold && (t - lastBreachStep >= MIN_EVENT_GAP)) {
        breachEvents.push({
          step: t,
          day: t + 1,
          date: record.date || record.dateStr,
          ratio: record.ratio,
          record: record
        });
        lastBreachStep = t;
        wasBelowThreshold = true;
      } else if (!isBelow) {
        wasBelowThreshold = false;
      }

      ledger.push(record);
      prev = record;
    }

    ledger.breachEvents = breachEvents;
    ledger.limitRatioVal = limitRatioVal;

    return { params, ledger };
  }

  render() {
    const { ledger, params } = this.buildLedger();
    const layout = this.chart.setup();
    const totalT = Math.max(1, ledger.length - 1);
    
    if (this.currentStep > totalT) {
      this.currentStep = totalT;
    }
    const step = this.isSimulationActive ? this.currentStep : 0;

    if (this.isPlaying) {
      this.chart.autoFollow(step, totalT);
    }

    const curX = this.chart.drawGrid(layout, totalT, step, ledger);

    PriceOverlayLayer.draw(this.chart.ctx, layout, ledger, step, this.isPriceConfirmed);

    if (this.isSimulationActive && ledger.length > 0) {
      MainTableLayer.draw(this.chart.ctx, layout, ledger, step, curX);
      this.drawLimitBreachMarker(this.chart.ctx, layout, ledger, step, totalT);
      this.syncHUD(ledger[step], totalT, ledger, params);
    } else {
      this.resetHUD(ledger[0] ? ledger[0].price : 100);
    }
  }

  drawLimitBreachMarker(ctx, layout, ledger, currentStep, totalT) {
    this.renderedBreachLines = [];

    const isShowLines = document.getElementById('chkShowBreachLines')?.checked ?? true;
    if (!isShowLines) return;

    const breachEvents = ledger.breachEvents || [];
    if (breachEvents.length === 0) return;

    const canvasW = ctx.canvas.width;
    const canvasH = ctx.canvas.height;
    const plotLeft = layout.plotX ?? layout.padLeft ?? 60;
    const plotWidth = layout.plotW ?? (canvasW - plotLeft - (layout.padRight ?? 60));
    const topY = layout.mainTop ?? layout.padTop ?? 32;
    const bottomY = layout.subBottom ?? layout.subChartBottomY ?? layout.plotBottom ?? (canvasH - 36);

    breachEvents.forEach((ev, idx) => {
      if (this.isSimulationActive && currentStep < totalT && currentStep < ev.step) return;

      const x = this.getXCoordinate(ev.step, layout, totalT);
      if (x < plotLeft || x > plotLeft + plotWidth) return;

      this.renderedBreachLines.push({
        x: x,
        event: ev,
        index: idx
      });

      const isHovered = (this.hoveredBreachIndex === idx);

      ctx.save();
      ctx.strokeStyle = isHovered ? '#ff4d4f' : 'rgba(239, 68, 68, 0.85)';
      ctx.lineWidth = isHovered ? 2.5 : 1.5;

      if (isHovered) {
        ctx.shadowColor = 'rgba(239, 68, 68, 0.9)';
        ctx.shadowBlur = 8;
      }

      ctx.beginPath();
      ctx.moveTo(x, topY);
      ctx.lineTo(x, bottomY);
      ctx.stroke();

      ctx.restore();
    });
  }

  getXCoordinate(idx, layout, totalT) {
    if (typeof this.chart.indexToX === 'function') {
      return this.chart.indexToX(idx);
    }
    if (typeof this.chart.getX === 'function') {
      return this.chart.getX(idx);
    }
    const plotLeft = layout.plotX ?? layout.padLeft ?? 60;
    const plotWidth = layout.plotW ?? (layout.width - plotLeft - (layout.padRight ?? 60));
    const windowDays = this.chart.windowDays || totalT || 1;
    const viewOffset = this.chart.viewOffset || 0;
    return plotLeft + ((idx - viewOffset) / windowDays) * plotWidth;
  }

  syncHUD(cur, totalT, ledger, params) {
    if (!cur) return;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };

    const totalCalendarDays = this.getTotalCalendarDays();
    const totalTradingDays = totalT + 1;
    const restDays = params.source === 'btc' ? 0 : Math.max(0, totalCalendarDays - totalTradingDays);

    set('hudPeriod', `第 ${cur.t + 1} 天 (${cur.date || cur.dateStr})`);
    set('hudValidDays', `${totalTradingDays} 天`);
    set('hudRestDays', `${restDays} 天`);
    set('hudPrice', `¥${cur.price.toFixed(2)}`);

    const startPrice = (ledger && ledger[0]) ? ledger[0].price : cur.price;
    const mktChangePct = startPrice > 0 ? ((cur.price - startPrice) / startPrice) * 100 : 0;
    const mktSign = mktChangePct >= 0 ? '+' : '';
    const hudMktChangeEl = document.getElementById('hudMarketChange');
    if (hudMktChangeEl) {
      hudMktChangeEl.innerText = `${mktSign}${mktChangePct.toFixed(2)}%`;
      hudMktChangeEl.style.color = mktChangePct >= 0 ? '#10b981' : '#ef4444';
    }

    const hudMktStatus = document.getElementById('hudMarketStatus');
    if (hudMktStatus) {
      if (cur.t >= totalT) {
        hudMktStatus.innerText = '周期结束 (交割完毕)';
        hudMktStatus.style.color = '#94a3b8';
      } else {
        hudMktStatus.innerText = '开市交易中';
        hudMktStatus.style.color = '#38bdf8';
      }
    }

    const actualDaysEl = document.getElementById('chartActualDays');
    if (actualDaysEl) {
      actualDaysEl.innerText = `${totalTradingDays} 天`;
    }

    set('sumInvested', '¥' + Math.round(cur.cumInvested).toLocaleString());
    set('sumCost', '¥' + cur.avgCost.toFixed(2));
    set('sumRatio', `${(cur.ratio * 100).toFixed(2)}%`);
    set('sumValue', '¥' + Math.round(cur.assetValue).toLocaleString());

    const sumPendingEl = document.getElementById('sumPending');
    const currentInvestMode = getCurrentInvestMode();
    const loadedStrategy = getLoadedStrategy();

    if (sumPendingEl) {
      if (params.source === 'btc') {
        sumPendingEl.innerText = '¥0 (0天)';
        sumPendingEl.style.color = '#64748b';
      } else if (currentInvestMode === 'strategy') {
        const schedLen = loadedStrategy?.dailySchedule?.length || 1080;
        const totalPlannedFund = Number(loadedStrategy?.summary?.totalFund || 0);

        if (totalTradingDays >= schedLen) {
          sumPendingEl.innerText = '¥0 (已全部入场)';
          sumPendingEl.style.color = '#10b981';
        } else {
          const unspentFund = Math.max(0, totalPlannedFund - cur.cumInvested);
          const unspentDays = schedLen - totalTradingDays;
          sumPendingEl.innerText = `¥${Math.round(unspentFund).toLocaleString()} (${unspentDays}期未投)`;
          sumPendingEl.style.color = '#f59e0b';
        }
      } else {
        const pendingFund = restDays * params.baseInvest;
        sumPendingEl.innerText = `¥${Math.round(pendingFund).toLocaleString()} (${restDays}天)`;
        sumPendingEl.style.color = restDays > 0 ? '#f59e0b' : '#64748b';
      }
    }

    const profit = cur.assetValue - cur.cumInvested;
    const roiPct = cur.cumInvested > 0 ? (profit / cur.cumInvested) * 100 : 0;
    const roiSign = roiPct >= 0 ? '+' : '';
    const sumRoiEl = document.getElementById('sumRoi');
    if (sumRoiEl) {
      sumRoiEl.innerText = `${roiSign}${roiPct.toFixed(2)}%`;
      sumRoiEl.style.color = roiPct >= 0 ? '#10b981' : '#ef4444';
    }
    // === ✨ 新增：直接复用提取好的年份参数 params.diffYears × 7.0% 年化贬值率 ===
    const realRoi = roiPct - (params.diffYears * 7.0);
    const realSign = realRoi >= 0 ? '+' : '';
    const sumRealRoiEl = document.getElementById('sumRealRoi');
    if (sumRealRoiEl) {
      sumRealRoiEl.innerText = `${realSign}${realRoi.toFixed(2)}%`;
      // 只要扣除贬值后实际为负，立刻标红告警！
      sumRealRoiEl.style.color = realRoi >= 0 ? '#10b981' : '#ef4444';
    }
  }

  resetHUD(basePrice) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    set('hudPeriod', `-`);
    set('hudValidDays', `-`);
    set('hudRestDays', `-`);
    set('hudPrice', `¥${basePrice ? basePrice.toFixed(2) : '100.00'}`);
    set('hudMarketChange', `-`);
    set('hudMarketStatus', `待命就绪`);

    const actualDaysEl = document.getElementById('chartActualDays');
    if (actualDaysEl) actualDaysEl.innerText = `- 天`;

    set('sumInvested', `-`);
    set('sumPending', `-`);
    set('sumCost', `-`);
    set('sumRatio', `-`);
    set('sumValue', `-`);

    const sumRoiEl = document.getElementById('sumRoi');
    if (sumRoiEl) {
      sumRoiEl.innerText = `-`;
      sumRoiEl.style.color = '#10b981';
    }

    const sumRealRoiEl = document.getElementById('sumRealRoi');
    if (sumRealRoiEl) {
      sumRealRoiEl.innerText = `-`;
      sumRealRoiEl.style.color = '#10b981';
    }
  }

  async updateSourceBounds() {
    const source = document.getElementById('inSource').value;
    const pStart = document.getElementById('inPeriodStart');
    const pEnd = document.getElementById('inPeriodEnd');
    const customGroup = document.getElementById('customGroup');

    if (source === 'custom') {
      if (customGroup) customGroup.style.display = 'block';
      if (pStart && pEnd) {
        pStart.min = '1900-01';
        pStart.max = '2099-12';
        pEnd.min = '1900-01';
        pEnd.max = '2099-12';
      }
      this.updateSpanTip();
      return;
    }

    if (customGroup) customGroup.style.display = 'none';

    const dataObj = await PriceOverlayLayer.preload(source);
    const meta = PriceOverlayLayer.getMeta(source);

    if (dataObj && dataObj.data && dataObj.data.length > 0 && pStart && pEnd) {
      const allData = dataObj.data;
      const firstDate = allData[0][0];               
      const lastDate = allData[allData.length - 1][0]; 

      const minMonth = firstDate.slice(0, 7); 
      const maxMonth = lastDate.slice(0, 7);  

      pStart.min = minMonth;
      pStart.max = maxMonth;
      pEnd.min = minMonth;
      pEnd.max = maxMonth;

      const maxYear = parseInt(maxMonth.slice(0, 4));
      const defaultStartYear = Math.max(parseInt(minMonth.slice(0, 4)), maxYear - 3);
      const defaultStartMonth = `${defaultStartYear}-${maxMonth.slice(5, 7)}`;

      pStart.value = defaultStartMonth;
      pEnd.value = maxMonth;
    } else if (meta && pStart && pEnd) {
      pStart.min = `${meta.minYear}-01`;
      pStart.max = `${meta.maxYear}-12`;
      pEnd.min = `${meta.minYear}-01`;
      pEnd.max = `${meta.maxYear}-12`;

      const defaultStartYear = Math.max(meta.minYear, meta.maxYear - 3);
      pStart.value = `${defaultStartYear}-01`;
      if (meta.latestDate) {
        pEnd.value = meta.latestDate.slice(0, 7);
      } else {
        pEnd.value = `${meta.maxYear}-12`;
      }
    }

    this.updateSpanTip();
  }

  updateSpanTip() {
    const startVal = document.getElementById('inPeriodStart')?.value || '2023-08';
    const endVal = document.getElementById('inPeriodEnd')?.value || '2026-09';
    const tip = document.getElementById('spanTip');
    if (!tip) return;

    const [y1, m1] = startVal.split('-').map(Number);
    const [y2, m2] = endVal.split('-').map(Number);
    const totalMonths = (y2 - y1) * 12 + (m2 - m1) + 1;

    if (totalMonths <= 0) {
      tip.style.color = '#ef4444';
      tip.innerText = '⚠️ 结束年月必须大于等于起始年月';
      return;
    }

    const spanYears = Math.floor(totalMonths / 12);
    const remainMonths = totalMonths % 12;
    const estTradingDays = Math.round(totalMonths * 21.7);

    let spanText = '';
    if (spanYears > 0 && remainMonths > 0) {
      spanText = `${spanYears} 年 ${remainMonths} 个月`;
    } else if (spanYears > 0) {
      spanText = `${spanYears} 年`;
    } else {
      spanText = `${remainMonths} 个月`;
    }

    tip.style.color = '#38bdf8';
    tip.innerText = `跨度: ${spanText} (共 ${totalMonths} 个月 / 约 ${estTradingDays} 个交易日)`;
  }

  bindEvents() {
    const inSource = document.getElementById('inSource');
    const pStart = document.getElementById('inPeriodStart');
    const pEnd = document.getElementById('inPeriodEnd');
    const btnPlay = document.getElementById('btnPlay');
    const btnApplyPrice = document.getElementById('btnApplyPrice');
    const inBaseInvest = document.getElementById('inBaseInvest');
    const inTotalBudget = document.getElementById('inTotalBudget');
    const mainCanvas = document.getElementById('mainCanvas');
    const tooltip = document.getElementById('breachTooltip');

    if (inBaseInvest) {
      inBaseInvest.addEventListener('input', () => {
        this.syncFixedInvestInputs('daily');
        if (!this.isPlaying) this.render();
      });
    }

    if (inTotalBudget) {
      inTotalBudget.addEventListener('input', () => {
        this.syncFixedInvestInputs('total');
        if (!this.isPlaying) this.render();
      });
    }

    document.getElementById('chkShowBreachLines')?.addEventListener('change', () => {
      this.render();
    });

    if (mainCanvas && tooltip) {
      mainCanvas.addEventListener('mousemove', (e) => {
        if (!this.renderedBreachLines || this.renderedBreachLines.length === 0) {
          tooltip.style.display = 'none';
          mainCanvas.style.cursor = 'default';
          if (this.hoveredBreachIndex !== null) {
            this.hoveredBreachIndex = null;
            this.render();
          }
          return;
        }

        const rect = mainCanvas.getBoundingClientRect();
        const cssMouseX = e.clientX - rect.left;
        const dpr = (mainCanvas.width / rect.width) || 1;
        const physMouseX = cssMouseX * dpr;

        const hitRadiusCss = 18;
        const hitRadiusPhys = 18 * dpr;
        let matched = null;

        for (const item of this.renderedBreachLines) {
          const diffCss = Math.abs(cssMouseX - item.x);
          const diffPhys = Math.abs(physMouseX - item.x);
          if (diffCss <= hitRadiusCss || diffPhys <= hitRadiusPhys) {
            matched = item;
            break;
          }
        }

        if (matched) {
          mainCanvas.style.cursor = 'pointer';

          if (this.hoveredBreachIndex !== matched.index) {
            this.hoveredBreachIndex = matched.index;
            this.render();
          }

          const ev = matched.event;
          const rec = ev.record;
          const params = this.getUIParams();
          const currentInvestMode = getCurrentInvestMode();
          const loadedStrategy = getLoadedStrategy();

          let pendingText = '¥0 (0天)';
          if (params.source !== 'btc') {
            const totalPlanned = (currentInvestMode === 'strategy' && loadedStrategy?.dailySchedule)
              ? loadedStrategy.dailySchedule.length
              : this.getTotalCalendarDays();
            const remainDays = Math.max(0, totalPlanned - ev.day);
            if (remainDays > 0) {
              let pendingFund = 0;
              if (currentInvestMode === 'strategy' && loadedStrategy?.dailySchedule) {
                for (let i = ev.day; i < totalPlanned; i++) {
                  if (loadedStrategy.dailySchedule[i]) {
                    pendingFund += loadedStrategy.dailySchedule[i].invest;
                  }
                }
              } else {
                pendingFund = remainDays * params.baseInvest;
              }
              pendingText = `¥${Math.round(pendingFund).toLocaleString()} (${remainDays}天)`;
            }
          }

          const profit = rec.assetValue - rec.cumInvested;
          const roiPct = rec.cumInvested > 0 ? (profit / rec.cumInvested) * 100 : 0;
          const roiSign = roiPct >= 0 ? '+' : '';
          const roiColor = roiPct >= 0 ? '#10b981' : '#ef4444';

          tooltip.innerHTML = `
            <div style="font-weight: bold; color: #f87171; border-bottom: 1px dashed rgba(239, 68, 68, 0.4); padding-bottom: 5px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
              <span>🔻 占比极限点 (第 ${ev.day} 天)</span>
              <span style="color: #94a3b8; font-weight: normal; font-size: 11px;">${ev.date}</span>
            </div>
            <div style="display: grid; grid-template-columns: auto auto; row-gap: 4px; column-gap: 16px; font-size: 11px;">
              <span style="color: #94a3b8;">累计已投入:</span>
              <span style="color: #38bdf8; font-weight: 600; text-align: right; font-family: monospace;">¥${Math.round(rec.cumInvested).toLocaleString()}</span>

              <span style="color: #94a3b8;">休市未投(滞留):</span>
              <span style="color: #f59e0b; font-weight: 600; text-align: right; font-family: monospace;">${pendingText}</span>

              <span style="color: #94a3b8;">持仓平均成本:</span>
              <span style="color: #10b981; font-weight: 600; text-align: right; font-family: monospace;">¥${rec.avgCost.toFixed(2)}</span>

              <span style="color: #94a3b8;">当日定投占比:</span>
              <span style="color: #eab308; font-weight: 600; text-align: right; font-family: monospace;">${(rec.ratio * 100).toFixed(2)}%</span>

              <span style="color: #94a3b8;">当前资产总市值:</span>
              <span style="color: #f8fafc; font-weight: 600; text-align: right; font-family: monospace;">¥${Math.round(rec.assetValue).toLocaleString()}</span>

              <span style="color: #94a3b8;">投资利润率 (ROI):</span>
              <span style="color: ${roiColor}; font-weight: 600; text-align: right; font-family: monospace;">${roiSign}${roiPct.toFixed(2)}%</span>
            </div>
          `;

          tooltip.style.position = 'fixed';
          tooltip.style.zIndex = '99999';
          tooltip.style.pointerEvents = 'none';

          const tipWidth = 240;
          let targetX = e.clientX;
          if (targetX - tipWidth / 2 < 10) {
            targetX = tipWidth / 2 + 10;
          } else if (targetX + tipWidth / 2 > window.innerWidth - 10) {
            targetX = window.innerWidth - tipWidth / 2 - 10;
          }
          tooltip.style.left = `${targetX}px`;

          if (e.clientY < 220) {
            tooltip.style.top = `${e.clientY + 20}px`;
            tooltip.style.transform = 'translate(-50%, 0)';
          } else {
            tooltip.style.top = `${e.clientY - 14}px`;
            tooltip.style.transform = 'translate(-50%, -100%)';
          }

          tooltip.style.display = 'block';
        } else {
          mainCanvas.style.cursor = 'default';
          if (this.hoveredBreachIndex !== null) {
            this.hoveredBreachIndex = null;
            this.render();
          }
          tooltip.style.display = 'none';
        }
      });

      mainCanvas.addEventListener('mouseleave', () => {
        mainCanvas.style.cursor = 'default';
        if (this.hoveredBreachIndex !== null) {
          this.hoveredBreachIndex = null;
          this.render();
        }
        tooltip.style.display = 'none';
      });
    }

    document.getElementById('btnSnapPocket')?.addEventListener('click', () => snapCurrentViewToPocket());
    document.getElementById('btnOpenPocket')?.addEventListener('click', () => window.open('pocket.html', '_blank'));

    inSource.addEventListener('change', async () => {
      this.stopAnimation();
      await PriceOverlayLayer.preload(inSource.value);
      await this.updateSourceBounds();
      this.syncFixedInvestInputs('daily');
      this.isPriceConfirmed = false;
      this.isSimulationActive = false;
      this.currentStep = 0;
      this.chart.viewOffset = 0;
      
      if (btnPlay) {
        btnPlay.innerText = "▶ 开始演示";
        btnPlay.classList.remove('playing');
      }
      this.render();
    });

    [pStart, pEnd].forEach(el => {
      if (!el) return;
      ['input', 'change'].forEach(evt => {
        el.addEventListener(evt, () => {
          this.stopAnimation();
          this.updateSpanTip();
          this.syncFixedInvestInputs('daily');
          if (btnPlay) {
            btnPlay.innerText = "▶ 开始演示";
            btnPlay.classList.remove('playing');
          }
        });
      });
    });

    btnApplyPrice.addEventListener('click', async () => {
      this.stopAnimation();
      
      const currentSource = document.getElementById('inSource').value;
      await PriceOverlayLayer.preload(currentSource);

      const rawLimit = parseFloat(document.getElementById('inLimitRatio')?.value);
      this.activeLimitRatio = isNaN(rawLimit) ? 0.05 : rawLimit;

      this.isPriceConfirmed = true;
      this.isSimulationActive = false;
      this.currentStep = 0;
      
      const { ledger } = this.buildLedger();
      const totalT = Math.max(1, ledger.length - 1);
      this.chart.windowDays = Math.min(totalT, 730);
      this.chart.viewOffset = 0;

      if (btnPlay) {
        btnPlay.innerText = "▶ 开始演示";
        btnPlay.classList.remove('playing');
      }
      this.render();
    });

    btnPlay.addEventListener('click', () => {
      this.isPlaying = !this.isPlaying;

      const rawLimit = parseFloat(document.getElementById('inLimitRatio')?.value);
      this.activeLimitRatio = isNaN(rawLimit) ? 0.05 : rawLimit;

      const { ledger } = this.buildLedger();
      const totalT = Math.max(1, ledger.length - 1);

      if (this.isPlaying) {
        this.isPriceConfirmed = true;
        this.isSimulationActive = true;
        btnPlay.innerText = "❚❚ 暂停演示";
        btnPlay.classList.add('playing');

        if (this.currentStep >= totalT) {
          this.currentStep = 0;
          this.chart.windowDays = Math.min(totalT, 730);
          this.chart.viewOffset = 0;
        }

        const stepIncrement = Math.max(1, Math.round(totalT / 600));

        if (this.timer) clearInterval(this.timer);

        this.timer = setInterval(() => {
          if (this.currentStep < totalT) {
            this.currentStep += stepIncrement;
            if (this.currentStep > totalT) this.currentStep = totalT;
            this.render();
          } else {
            this.stopAnimation();
            this.chart.showFullOverview(totalT);
            this.render();
            btnPlay.innerText = "▶ 重新演示";
            btnPlay.classList.remove('playing');
          }
        }, this.ANIMATION_FRAME_MS);
      } else {
        this.stopAnimation();
        btnPlay.innerText = "▶ 继续演示";
        btnPlay.classList.remove('playing');
      }
    });

    window.addEventListener('resize', () => this.render());
  }
}

window.appInstance = new App();