# 澳洲多主体税务合规看板

这是一个面向自主管理的澳大利亚多主体记账与税务准备系统。它把银行/发票资料整理成交易账本、BAS 底稿、年度税务底稿、Div 7A、养老金和到期提醒，最终由用户在 ATO、ASIC 或其他监管网站手动提交。

GitHub 仓库：[tax-compliance-dashboard](https://github.com/hengyunweng-blip/tax-compliance-dashboard)

> 本项目不自动向 ATO 或 ASIC 申报、付款或签署，也不替代注册税务代理或法律意见。AI 只提供待确认的分析建议；未经用户确认，不会写入交易、义务或申报金额。

## 当前包含的功能

- 六个固定主体：`self`、`spouse`、`boyun_trust`、`boyun_co`、`yeeliving_co`、`neighbourhood_co`。
- 交易录入入口：CSV、文件上传、邮箱附件 API、快速手动录入。
- CSV 映射向导：`DD/MM/YYYY`、`YYYY-MM-DD`、`MM/DD/YYYY`，预览统一显示 `DD MMM YYYY`；完整行 hash（含描述）用于去重。
- Simpler BAS：G1、1A、1B；G10/G11 只作内部核算，并标记“不填入 ATO 表单”。PAYG 手动录入 5A/5B，支持无 PAYG 和负数退税。
- 已关账期间保护：补录交易进入独立 Inbox 区域，不会静默修改已递交底稿。
- 年度底稿：按 `income_year` 聚合，收入、费用和资本采购采用不含 GST 口径，并提供 GST 对账表。
- Div 7A：年度基准利率、期初余额、逐年余额/利息/最低还款、协议义务、还款有效性风险提示、合并贷款展示。
- 轻量资产登记与折旧：prime cost / diminishing value、首年/处置当年按天数、私人使用调整。
- 养老金供款与抵扣意向通知：两个独立待办；上限按所得年度保存。
- 义务看板、T-30/T-10/T-3/当天、逾期每日提醒和 ICS 导出。
- CAV 牌照年度声明、三家公司 ASIC 年检、ATO/ASIC 操作指引和资讯面板。
- AI 可关闭运行；真实客户数据默认不发送给 AI。
- 数据库与文件 ZIP 备份/还原。

## 重要业务边界

- 所有金额以整数分（cents）存储、计算和传输，显示时才换算为澳元。
- 业务时区固定为 IANA `Australia/Melbourne`，禁止固定 UTC 偏移。
- 只读日期为 `DD MMM YYYY`；输入为 `DD/MM/YYYY`，不依赖浏览器 locale。
- TFN 不入库，也不进入导出或 AI payload；发送给 AI 前会脱敏 TFN、银行账号和完整地址。
- 已递交/已缴款的底稿不自动修改；前期交易必须经过更正、待修订或排除决策。
- 基准利率、养老金上限、GST 更正阈值等外部常量按年度/规则保存来源 URL 和取数日期；不能用实现者自算值冒充官方基准。
- 真实手机摄像头和拍照上传不属于本项目的自动化验收范围。

## 环境要求

- Node.js：建议使用 Node `v26.7.0`（当前验证版本）。
- npm。
- SQLite 由 `better-sqlite3` 使用；不需要单独安装数据库服务。

## 安装与首次运行

```bash
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

默认打开 `http://localhost:3000`。

默认数据库是 `./data/app.db`。`data/`、`.env.local`、Next 构建产物和测试产物均已加入 `.gitignore`，不会随 Git 上传。需要重新生成一个干净演示数据库时，可以删除本地 `data/app.db` 后重新运行 migrate 和 seed；不要删除或覆盖 `docs/evidence/gate0` 至 `gate9` 的证据文件。

## 环境变量

复制模板并按需填写：

```bash
cp .env.example .env.local
```

变量名：

```text
DATABASE_PATH
INGEST_TOKEN
AI_ENABLED
AI_ALLOW_REAL_DATA
AI_API_URL
AI_API_KEY
AI_MODEL
AI_TIMEOUT_MS
```

建议本地演示使用：

```text
AI_ENABLED=false
AI_ALLOW_REAL_DATA=false
```

邮箱入口 `POST /api/ingest/email` 必须配置 `INGEST_TOKEN`。不要把真实 token、AI key、TFN、银行账号或真实数据库文件提交到 GitHub。

## 同一 Wi‑Fi 访问

在运行看板的 Mac 上执行：

```bash
DATABASE_PATH="$(pwd)/data/app.db" \
INGEST_TOKEN="本机临时测试 token" \
AI_ENABLED=false \
AI_ALLOW_REAL_DATA=false \
npm run dev -- --hostname 0.0.0.0 --port 3000
```

查看本机 Wi‑Fi 地址：

```bash
ipconfig getifaddr en0
```

如果当前网络接口不是 `en0`，在系统网络设置中查看本机 IPv4 地址。其他连接同一 Wi‑Fi 的电脑访问：

```text
http://<本机局域网IP>:3000
```

例如 `http://192.168.1.23:3000`。如果 macOS 防火墙询问 Node.js 是否允许接收连接，请允许当前私有网络。访问完成后按 `Ctrl+C` 停止服务。

局域网链接没有登录权限层；只应在可信的私有网络中使用演示数据库，不要把真实客户资料暴露给不受信任的设备。

## 测试与构建

常用命令：

```bash
npm test -- --run
npm run lint
npm run build
npm run test:e2e
```

当前验证基线（含 Gate 9 后续测试 fixture 补充）：

| 检查 | 结果 |
|---|---|
| Vitest 默认顺序 | 36 文件，190/190 通过 |
| Vitest shuffle seed 101 | 36/36 文件，190/190 通过 |
| Vitest shuffle seed 202 | 36/36 文件，190/190 通过 |
| Playwright 完整套件 | 两轮均 7 passed / 5 failed / 2 did not run（14 declarations） |
| lint | 通过 |
| build | 通过 |

Gate 9 报告保留了测试 fixture 修复前的历史失败记录；当前提交已补齐不改变断言的独立 fixture 初始化，三轮单元测试均通过。E2E 仍有报告中列出的未解决失败，不能把当前状态描述为全套浏览器测试通过。

## 证据、设计与交接

- 设计文档：[`docs/superpowers/specs/`](docs/superpowers/specs/)
- 实施计划：[`docs/superpowers/plans/`](docs/superpowers/plans/)
- Gate 0–8 证据：[`docs/evidence/`](docs/evidence/)
- Gate 9 审计报告：[`docs/evidence/gate9/report.md`](docs/evidence/gate9/report.md)
- 交接文档：[`HANDOVER.md`](HANDOVER.md)
- 车辆事实清单：[`docs/vehicle-fact-checklist.md`](docs/vehicle-fact-checklist.md)

当前已有标签：`gate-0`、`gate-1`、`gate-2`、`gate-3`、`gate-4`、`gate-6`、`gate-7`、`gate-8`。`gate-5` 和 `gate-9` 没有创建；Gate 9 审计提交和发现以报告为准。

## 运行安全提示

1. 先备份数据库和上传文件，再进行迁移或还原。
2. 真实数据运行前关闭局域网访问，或只绑定 `127.0.0.1`。
3. ATO/ASIC 的实际申报、付款、协议签署和税务判断由用户自行核对并完成。
4. AI 规划结果必须逐项检查假设、适用年度、来源和未纳入因素；无法判断时保持“无法判断/需要补资料”。
