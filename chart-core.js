export class ChartCore {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.width = 0;
    this.height = 0;
    this.lastDpr = 0;

    this.defaultWindowDays = 730;
    this.windowDays = 730;
    this.viewOffset = 0;
    this.totalDays = 730;

    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartOffset = 0;

    this.bindInteractions();
  }

  setup() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    
    // 只有尺寸真正发生变化时才更新 canvas 像素与重置矩阵，避免动画掉帧
    if (this.width !== rect.width || this.height !== rect.height || this.lastDpr !== dpr) {
      this.width = rect.width;
      this.height = rect.height;
      this.lastDpr = dpr;
      this.canvas.width = rect.width * dpr;
      this.canvas.height = rect.height * dpr;
      this.ctx.resetTransform();
      this.ctx.scale(dpr, dpr);
    }

    const padL = 60, padR = 60, padT = 16, padB = 26;
    const plotW = Math.max(10, this.width - padL - padR);
    const plotH = Math.max(10, this.height - padT - padB);

    const topH = plotH * 0.26;
    const gap = 16;
    const mainH = Math.max(10, plotH - topH - gap);

    this.clampViewBounds();

    return {
      padL, padR, padT, padB,
      plotW, plotH,
      topArea: { top: padT, h: topH },
      mainArea: { top: padT + topH + gap, h: mainH },
      windowDays: this.windowDays,
      viewOffset: this.viewOffset
    };
  }

  clampViewBounds() {
    const maxDays = Math.max(1, this.totalDays);
    this.windowDays = Math.max(30, Math.min(maxDays, this.windowDays));
    const maxOffset = Math.max(0, maxDays - this.windowDays);
    this.viewOffset = Math.max(0, Math.min(maxOffset, this.viewOffset));
  }

  bindInteractions() {
    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragStartOffset = this.viewOffset;
      this.canvas.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.dragStartX;
      const layout = this.setup();
      const daysMoved = Math.round((dx / layout.plotW) * this.windowDays);

      const maxOffset = Math.max(0, this.totalDays - this.windowDays);
      this.viewOffset = Math.max(0, Math.min(maxOffset, this.dragStartOffset - daysMoved));
      if (this.onViewChange) this.onViewChange();
    });

    window.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.canvas.style.cursor = 'default';
      }
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 0.85 : 1.15;
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - 60;
      const plotW = Math.max(1, this.width - 120);

      const mouseRatio = Math.max(0, Math.min(1, mouseX / plotW));
      const oldDays = this.windowDays;

      const newDays = Math.max(30, Math.min(this.totalDays, Math.round(oldDays * zoomFactor)));
      const centerDay = this.viewOffset + oldDays * mouseRatio;
      
      this.viewOffset = Math.max(0, Math.min(this.totalDays - newDays, Math.round(centerDay - newDays * mouseRatio)));
      this.windowDays = newDays;
      this.clampViewBounds();

      if (this.onViewChange) this.onViewChange();
    }, { passive: false });
  }

  autoFollow(currentStep, totalT) {
    this.totalDays = totalT;
    if (!this.isDragging) {
      if (currentStep > this.windowDays) {
        this.viewOffset = Math.max(0, Math.min(totalT - this.windowDays, currentStep - this.windowDays));
      } else {
        this.viewOffset = 0;
      }
    }
    this.clampViewBounds();
  }

  showFullOverview(totalT) {
    this.totalDays = totalT;
    this.windowDays = totalT;
    this.viewOffset = 0;
    this.clampViewBounds();
  }

  drawGrid(layout, totalT, currentStep, series) {
    const { ctx } = this;
    const { padL, plotW, topArea, mainArea, viewOffset, windowDays } = layout;

    ctx.clearRect(0, 0, this.width, this.height);

    const safeTotalT = Math.max(0, Math.min(totalT, series ? series.length - 1 : 0));
    const visibleStart = viewOffset;
    const visibleEnd = Math.min(safeTotalT, viewOffset + windowDays);

    ctx.font = '10px monospace';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';

    const colCount = 4;
    const colInterval = Math.max(1, Math.round(windowDays / colCount));
    for (let i = 0; i <= colCount; i++) {
      const curT = Math.min(safeTotalT, visibleStart + i * colInterval);
      const x = padL + (i / colCount) * plotW;

      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, topArea.top);
      ctx.lineTo(x, mainArea.top + mainArea.h);
      ctx.stroke();

      if (series && series[curT]) {
        const dText = series[curT].dateStr || series[curT].date || `D${curT}`;
        ctx.fillText(dText, x, mainArea.top + mainArea.h + 14);
      } else {
        ctx.fillText(`D${curT}`, x, mainArea.top + mainArea.h + 14);
      }
    }

    let curX = null;
    if (currentStep >= visibleStart && currentStep <= visibleEnd) {
      curX = padL + ((currentStep - visibleStart) / (windowDays || 1)) * plotW;
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(curX, topArea.top);
      ctx.lineTo(curX, mainArea.top + mainArea.h);
      ctx.stroke();
    }

    ctx.textAlign = 'right';
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#475569';
    const isFull = this.windowDays >= safeTotalT;
    const zoomText = isFull
      ? '【全景展开】可滚轮放大'
      : `【视窗: ${(this.windowDays / 365).toFixed(1)}年】可按住拖动/滚轮缩放`;
    ctx.fillText(zoomText, padL + plotW, topArea.top - 4);

    return curX;
  }
}