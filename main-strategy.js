/**
 * 定投策略管理器 (Strategy Manager)
 * 职责：管理固定/增量模式切换、附表策略JSON解析导入、计算任意第 t 天应投金额
 */

let currentInvestMode = 'fixed';
let loadedStrategy = null;

export function getCurrentInvestMode() {
  return currentInvestMode;
}

export function getLoadedStrategy() {
  return loadedStrategy;
}

export function initStrategyModeControls(onModeChangedCallback) {
  const modeSelect = document.getElementById('investModeSelect');
  const boxFixed = document.getElementById('boxModeFixed');
  const boxStrategy = document.getElementById('boxModeStrategy');
  const btnSandbox = document.getElementById('btnOpenSandbox');
  const btnImportFile = document.getElementById('btnImportStrategyFile');
  const fileInput = document.getElementById('strategyFileInput');

  localStorage.removeItem('active_dca_strategy');
  loadedStrategy = null;

  if (!modeSelect) return;

  modeSelect.addEventListener('change', (e) => {
    currentInvestMode = e.target.value;
    if (currentInvestMode === 'strategy') {
      boxFixed.style.display = 'none';
      boxStrategy.style.display = 'block';
      if (btnSandbox) btnSandbox.style.display = 'inline-block';
      updateStrategyDisplay();
    } else {
      boxFixed.style.display = 'block';
      boxStrategy.style.display = 'none';
      if (btnSandbox) btnSandbox.style.display = 'none';
      if (window.appInstance) {
        window.appInstance.syncFixedInvestInputs('daily');
      }
    }
    if (onModeChangedCallback) onModeChangedCallback();
  });

  if (btnSandbox) {
    btnSandbox.addEventListener('click', () => {
  window.open('lab.html', '_blank');
});
  }

  if (btnImportFile && fileInput) {
    btnImportFile.addEventListener('click', () => {
      fileInput.value = '';
      fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = JSON.parse(evt.target.result);
          if (data && data.dailySchedule && data.summary) {
            loadedStrategy = data;
            updateStrategyDisplay();
            if (onModeChangedCallback) onModeChangedCallback();
          } else {
            alert('文件格式不匹配，请确保是附表导出的策略 JSON！');
          }
        } catch (err) {
          alert('解析策略文件失败：格式错误或非合法 JSON！');
        }
      };
      reader.readAsText(file);
    });
  }

  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'DCA_STRATEGY_IMPORTED' && event.data.payload) {
      loadedStrategy = event.data.payload;
      if (currentInvestMode === 'strategy') {
        updateStrategyDisplay();
        if (onModeChangedCallback) onModeChangedCallback();
      }
    }
  });

  updateStrategyDisplay();
}

export function updateStrategyDisplay() {
  const statusEl = document.getElementById('strategyStatusText');
  const descEl = document.getElementById('strategyDetailDesc');
  if (!statusEl || !descEl) return;

  if (loadedStrategy && loadedStrategy.dailySchedule) {
    const sum = loadedStrategy.summary || {};
    const cruiseDaily = sum.cruiseDaily || 100;
    const monthly = sum.monthlyDisposable || (cruiseDaily * 30);

    statusEl.textContent = `✓ 已挂载：${sum.planName || '自定义增量策略'}`;
    statusEl.style.color = '#f59e0b';
    descEl.textContent = `规划期 ${sum.totalDays}天 (${sum.totalYears}年) | 建议总本金 ¥${Number(sum.totalFund || 0).toLocaleString()} | 峰值 ¥${sum.maxDaily}/天。超期后自动按策略每月可支配 (¥${monthly.toLocaleString()}/月，折合 ¥${cruiseDaily}/天) 平稳巡航。`;
  } else {
    statusEl.textContent = '⚠️ 未加载';
    statusEl.style.color = '#94a3b8';
    descEl.textContent = '未检测到附表策略数据。请点击上方“策略模型定义 ↗”推演生成或点击右侧“导入文件”。';
  }
}

export function getInvestForDay(dayIndex) {
  if (currentInvestMode === 'fixed') {
    return Math.max(1, parseFloat(document.getElementById('inBaseInvest')?.value) || 300);
  }

  if (loadedStrategy && loadedStrategy.dailySchedule && loadedStrategy.dailySchedule.length > 0) {
    const sched = loadedStrategy.dailySchedule;
    if (dayIndex <= sched.length) {
      return sched[dayIndex - 1].invest;
    }
    if (loadedStrategy.summary && loadedStrategy.summary.cruiseDaily) {
      return loadedStrategy.summary.cruiseDaily;
    }
  }

  return 100;
}