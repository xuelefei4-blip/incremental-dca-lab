/**
 * [2.1] lab-engine.js - 增量定投动力学算法引擎
 * 纯数学动力学仿真计算黑盒（零 DOM 依赖）
 */
(function (global) {
  'use strict';

  // 1. 档位修圆取整
  function snapToStepUnit(val, unit) {
    if (val <= unit) return unit;
    return Math.round(val / unit) * unit;
  }

  // 2. 指数阶梯生成器 (方案 B 实操稳定大阶段)
  function generateSmartLadder(baseDaily, maxDaily, shiftCount, unit) {
    if (maxDaily <= baseDaily || shiftCount <= 1) {
      return [Math.max(baseDaily, snapToStepUnit(maxDaily, unit))];
    }
    const ladder = [];
    for (let i = 1; i <= shiftCount; i++) {
      const ratio = i / shiftCount;
      let raw = baseDaily * Math.pow(maxDaily / baseDaily, ratio);
      let clean = snapToStepUnit(raw, unit);

      if (i === shiftCount) clean = snapToStepUnit(maxDaily, unit);
      const prev = ladder.length > 0 ? ladder[ladder.length - 1] : baseDaily;
      if (clean <= prev) {
        clean = prev + unit;
      }
      ladder.push(Math.min(clean, maxDaily));
    }
    const uniqueLadder = [...new Set(ladder)].filter(v => v >= baseDaily).sort((a, b) => a - b);
    return uniqueLadder.length > 0 ? uniqueLadder : [maxDaily];
  }

  // 3. 映射到最近阶梯
  function mapToLadder(val, baseDaily, maxDaily, ladder) {
    if (val <= baseDaily) return baseDaily;
    for (let i = 0; i < ladder.length; i++) {
      if (ladder[i] >= val) return Math.min(maxDaily, ladder[i]);
    }
    return maxDaily;
  }

  // 4. 动力学递推仿真核心
  function simulateEngine(baseDaily, plannedDays, minRatio, maxDaily, deposit, monthlyInflow, ladderOrNull) {
    const P = 100; // 基准标的价格
    const dailyInflow = monthlyInflow / 30;
    let currentCashPool = deposit;
    let coins = 0;
    let totalSpent = 0;
    let maxObservedDaily = 0;
    let currentPlan = baseDaily;
    let lowestObservedRatio = Infinity;
    const history = [];

    let firstShiftDay = null;
    let hitCapDay = null;
    let brokenDay = null;

    for (let t = 1; t <= plannedDays; t++) {
      currentCashPool += dailyInflow;

      const preMV = coins * P;
      const exactMinI = (preMV * minRatio) / (1 - minRatio);

      if (currentPlan < exactMinI) {
        if (ladderOrNull) {
          currentPlan = mapToLadder(exactMinI, baseDaily, maxDaily, ladderOrNull);
        } else {
          currentPlan = Math.ceil(exactMinI / 5) * 5;
        }

        if (firstShiftDay === null && currentPlan > baseDaily) {
          firstShiftDay = t;
        }
      }

      let invest = currentPlan;
      if (invest >= maxDaily) {
        invest = maxDaily;
        if (hitCapDay === null) hitCapDay = t;
      }

      if (currentCashPool < invest - 0.001) {
        brokenDay = t;
        const remainingScrap = Math.max(0, currentCashPool);
        invest = Math.floor(remainingScrap);
        coins += invest / P;
        totalSpent += invest;
        currentCashPool = 0;
        const finalMV = coins * P;
        const ratio = finalMV > 0 ? (invest / finalMV) : 0;
        
        history.push({
          day: t, invest, cumSpent: totalSpent,
          cumInflow: deposit + t * dailyInflow, cashLeft: 0,
          ratio, coins, mv: finalMV, isBroken: true
        });
        break;
      }

      currentCashPool -= invest;
      if (invest > maxObservedDaily) maxObservedDaily = invest;

      coins += invest / P;
      totalSpent += invest;
      const finalMV = coins * P;
      const ratio = finalMV > 0 ? (invest / finalMV) : 1.0;
      if (ratio < lowestObservedRatio) lowestObservedRatio = ratio;

      history.push({
        day: t, invest, cumSpent: totalSpent,
        cumInflow: deposit + t * dailyInflow, cashLeft: currentCashPool,
        ratio, coins, mv: finalMV, isBroken: false
      });
    }

    if (history.length === 0) {
      history.push({
        day: 1, invest: 0, cumSpent: 0, cumInflow: deposit,
        cashLeft: deposit, ratio: 0, coins: 0, mv: 0, isBroken: true
      });
    }

    return { 
      history, totalSpent, maxObservedDaily, 
      finalDays: history.length, plannedDays,
      lowestObservedRatio: lowestObservedRatio === Infinity ? 0 : lowestObservedRatio, 
      firstShiftDay, hitCapDay, brokenDay,
      baseDaily, maxDaily, minRatio, deposit, monthlyInflow
    };
  }

  // 5. 现金池蓄水峰顶统计
  function findPeakCashInfo(res) {
    if (!res || !res.history || res.history.length === 0) return { maxVal: 0, day: 0, years: '0.0' };
    let maxVal = 0;
    let peakDay = 0;
    for (let i = 0; i < res.history.length; i++) {
      if (res.history[i].cashLeft > maxVal) {
        maxVal = res.history[i].cashLeft;
        peakDay = res.history[i].day;
      }
    }
    return {
      maxVal: Math.round(maxVal),
      day: peakDay,
      years: (peakDay / 360).toFixed(1)
    };
  }

  // 6. 提档换挡次数统计
  function countShifts(res) {
    if (!res || !res.history) return 0;
    let shifts = 0;
    for (let i = 1; i < res.history.length; i++) {
      if (res.history[i].invest !== res.history[i - 1].invest && !res.history[i].isBroken) {
        shifts++;
      }
    }
    return shifts;
  }

  // 7. 纯数学反算求解器集合 (与真实现金流 pool 强绑定)
  const Solvers = {
    solveBase(maxDaily, plannedDays, minRatio, deposit, monthlyInflow, stepUnit) {
      let low = 1, high = maxDaily, best = 1;
      for (let i = 0; i < 20; i++) {
        const mid = Math.floor((low + high) / 2);
        const sim = simulateEngine(mid, plannedDays, minRatio, maxDaily, deposit, monthlyInflow, null);
        if (sim.brokenDay === null) { best = mid; low = mid + 1; } else { high = mid - 1; }
      }
      return Math.max(1, snapToStepUnit(best, stepUnit));
    },

    solveDays(base, maxDaily, minRatio, deposit, monthlyInflow) {
      let lowD = 30, highD = 3600, bestD = 30;
      for (let i = 0; i < 25; i++) {
        const midD = Math.floor((lowD + highD) / 2);
        const sim = simulateEngine(base, midD, minRatio, maxDaily, deposit, monthlyInflow, null);
        if (sim.brokenDay === null) { bestD = midD; lowD = midD + 1; } else { highD = midD - 1; }
      }
      return bestD;
    },

    solveRatio(base, plannedDays, maxDaily, deposit, monthlyInflow) {
      let lowR = 0.0001, highR = 0.05, bestR = 0.0001;
      for (let i = 0; i < 20; i++) {
        const midR = (lowR + highR) / 2;
        const sim = simulateEngine(base, plannedDays, midR, maxDaily, deposit, monthlyInflow, null);
        if (sim.brokenDay === null) { bestR = midR; lowR = midR; } else { highR = midR; }
      }
      return bestR;
    },

    solveMaxDailyBaseline(base, plannedDays, minRatio, deposit, monthlyInflow) {
      const simActualA = simulateEngine(base, plannedDays, minRatio, 100000, deposit, monthlyInflow, null);
      return simActualA.maxObservedDaily;
    },

    solveCashflowMonthly(base, plannedDays, minRatio, maxDaily, deposit) {
      let lowMon = 0, highMon = maxDaily * 30, bestMon = highMon;
      for (let i = 0; i < 24; i++) {
        const midMon = (lowMon + highMon) / 2;
        const sim = simulateEngine(base, plannedDays, minRatio, maxDaily, deposit, midMon, null);
        if (sim.brokenDay === null) { bestMon = midMon; highMon = midMon; } else { lowMon = midMon; }
      }
      return Math.ceil(bestMon);
    },

    solveCashflowDeposit(base, plannedDays, minRatio, maxDaily, monthlyInflow) {
      let lowDep = 0, highDep = maxDaily * plannedDays, bestDep = highDep;
      for (let i = 0; i < 24; i++) {
        const midDep = (lowDep + highDep) / 2;
        const sim = simulateEngine(base, plannedDays, minRatio, maxDaily, midDep, monthlyInflow, null);
        if (sim.brokenDay === null) { bestDep = midDep; highDep = midDep; } else { lowDep = midDep; }
      }
      return Math.ceil(bestDep);
    },

    solveOptimizedCap(base, plannedDays, minRatio, baseMaxDaily, deposit, monthlyInflow, shiftCount, stepUnit, isBroken) {
      if (isBroken) return baseMaxDaily;
      let lowCap = baseMaxDaily, highCap = 3000, bestCap = baseMaxDaily;
      for (let iter = 0; iter < 16; iter++) {
        const midCap = Math.floor((lowCap + highCap) / 2);
        const testLadder = generateSmartLadder(base, midCap, shiftCount, stepUnit);
        const simTest = simulateEngine(base, plannedDays, minRatio, midCap, deposit, monthlyInflow, testLadder);
        if (simTest.brokenDay === null) {
          bestCap = midCap;
          lowCap = midCap + 1;
        } else {
          highCap = midCap - 1;
        }
      }
      return snapToStepUnit(bestCap, stepUnit);
    }
  };

  const LabEngine = {
    snapToStepUnit,
    generateSmartLadder,
    mapToLadder,
    simulateEngine,
    findPeakCashInfo,
    countShifts,
    Solvers
  };

  // 挂载至全局上下文，支持命名空间与全局直调
  global.LabEngine = LabEngine;
  global.snapToStepUnit = snapToStepUnit;
  global.generateSmartLadder = generateSmartLadder;
  global.mapToLadder = mapToLadder;
  global.simulateEngine = simulateEngine;
  global.findPeakCashInfo = findPeakCashInfo;
  global.countShifts = countShifts;

})(typeof window !== 'undefined' ? window : this);