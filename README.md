<div align="center">

  # 人生资产定投策略 (Life Asset DCA Strategy)

  <p align="center">
    <a href="README.md">English</a> | <b>简体中文</b>
  </p>

  <br>

  <p align="center">
    🧭📈 给投资者的跨周期定投指南：如何在低估时加码、高估时防守，通过推演真实购买力与策略对比，为人生关键资产构建抗通胀的长期投资体系。
  </p>

  <!-- 状态与技术栈徽章 -->
  <p align="center">
    <a href="https://github.com/xuelefei4-blip/incremental-dca-lab/actions"><img src="https://img.shields.io/badge/status-active-success.svg" alt="Status"></a>
    <img src="https://img.shields.io/badge/version-1.0.2026-green.svg" alt="Version">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License">
    <img src="https://img.shields.io/badge/platform-Web%20%7C%20Windows%20EXE-blueviolet.svg" alt="Platform">
    <img src="https://img.shields.io/badge/engine-Vanilla%20JS%20%2B%20Canvas-orange.svg" alt="Engine">
  </p>

  <p align="center">
    <a href="https://github.com/xuelefei4-blip/incremental-dca-lab/issues"><img src="https://img.shields.io/static/v1?color=1f2328&logo=github&logoColor=fff&label&message=Github%20Issues" alt="Issues"></a>
    <a href="https://github.com/xuelefei4-blip/incremental-dca-lab/discussions"><img src="https://img.shields.io/static/v1?color=1f2328&logo=github&logoColor=fff&label&message=Github%20Discussions" alt="Discussions"></a>
  </p>

</div>

---

## 📸 运行预览
<div align="center">
  <video src="docs/demo.mp4" controls autoplay loop muted width="100%">
    您的浏览器不支持视频播放，请直接下载查看。
  </video>
  <p><i>▶ 演示：纳斯达克\沪深 300 \ BTC  ——6年定投收益对比。阶梯增量定投模式演示</i></p>
</div>
---

## ✨ 核心特性与策略模型
📌 基准定投（标尺模型）：
提供最基础的固定周期、固定金额机械定投。不猜顶底、不带情绪，专用于检验市场长期持有的自然 Beta 回报，作为衡量所有进阶策略超额收益的基准底线。

📊 10 大主流股票与资产模型（全天候资产库）：
内置覆盖全球多维市场的 10 种代表性资产日线底层：
宽基蓝筹（稳健底仓）：沪深 300、上证指数，检验震荡磨底市况下的防钝化抗压能力；
高成长科技股（弹性进攻）：纳斯达克 100、标普 500 等核心成长标的，验证单边上行与高波动回撤中的阶梯吸筹效率；
宏观避险与另类资产（流动性对冲）：黄金 (Gold)、比特币 (BTC) 等，测算不同通胀周期与流动性环境下的收益弹性差异。

⚙️ 自定义规则定投（纪律模型）：
打破“无脑机械扣款”，将投资者的择时经验固化为量化条件。支持按均线偏离、估值区间与回撤深度自由设定加减仓触发阀门，避免在极端泡沫区被动接盘。

⚡ 动态增量定投（逆风吸筹模型）：
针对传统定投中后期资金量变大导致的“成本钝化”死穴。引入均线偏离阶梯加仓算法——浅跌小补、深跌重仓、回血减档，把弹药集中在价格最便宜的黄金区间，逆风暴力拉低持仓均线，大幅缩短扭亏回本周期。

💼 双轨对比陈列馆（策略竞技场）：
策略优劣不听故事，拉到同一张图、同一笔钱下同台切磋。支持将任意两套回测结果一键存入“口袋”（如普通定投 vs 增量定投、沪深300 vs BTC），并排生成像素级对齐的双轨视图，一键导出高清长图。

🪙 穿透名义收益（真实购买力折现）：
账面微赚不代表资产保值。系统在基础 ROI 之外引入年化贬值折现因子，直接揭示扣除购买力损耗后的真实净利润，彻底戳破通胀环境下的“保本幻觉”。

⏱️ 毫秒级时间轴回放与跨周期推演：
纯前端原生绘制，拒绝冷冰冰的静态数字报表。支持拖动时间轴逐日复盘资金占比极限点与持仓成本变动，完整检验穿越多轮历史牛熊周期的真实资金演变。

---

## 📦 项目结构

```text
incremental-dca-lab/
├── data/                      # 10 大核心标的历史全量日线 JSON (A股/美股/加密/贵金属)
├── docs/                      # 文档与预览资源（包含预览动图 preview.gif）
├── scripts/
│   ├── fetch_market_data.py   # 多通道容灾爬虫与增量同步引擎
│   ├── run_app.py             # 本地桌面端服务与浏览器自动调度器
│   └── update_data.bat        # Windows 一键全量数据更新批处理
├── index.html                 # 主界面与时间轴回测主画布
├── lab.html                   # 增量策略模型定义与调优沙盒
├── pocket.html                # 双轨口袋陈列馆与长图合成器
├── chart-core.js              # 核心图表与动力学渲染算法
└── main.css                   # 金融工程暗黑极客风样式库
```

## 🚀 快速运行
方式 1：直接运行独立桌面端 (.EXE)
前往 Releases 下载 增量定投动力学实验台.exe，双击即可直接运行，完全断网环境亦可秒级启动。

方式 2：本地源码运行
克隆代码仓库：
git clone https://github.com/xuelefei4-blip/incremental-dca-lab.git
cd incremental-dca-lab

本地浏览： 

直接在浏览器中打开 index.html，或通过 VS Code Live Server 插件启动；[cite: 10]

或使用内置 Python 脚本启动本地安全服务器：
python scripts/run_app.py

方式 3：更新全量市场行情

python scripts/fetch_market_data.py
# 或在 Windows 上直接双击 scripts/update_data.bat

📄 开源协议
本项目基于 MIT License 开源协议