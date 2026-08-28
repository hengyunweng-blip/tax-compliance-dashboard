# Gate 5 验收报告（待验收）

日期：2026-08-29（Australia/Melbourne）

Gate 4 已验收并保留 `gate-4` 标签；Gate 5 本轮修复已实现并完成本地验证，尚未打 `gate-5` 标签，等待用户验收。

本轮修复：养老金上限改为按所得年度存储；Div 7A 按上一所得年度末余额和当前剩余年限逐年重算并在期限结束后显示“已到期”；年度待补充清单按主体类型区分；同时修复了 Div 7A 年度切换请求乱序时可能回显旧年度卡片的前端竞态。

## 1. Div 7A 官方基准

Gate 5 开始前实际打开 [ATO Division 7A calculator and decision tool](https://www.ato.gov.au/calculators-and-tools/division-7a-calculator-and-decision-tool?page=1)，输入：2016–17 所得年度、无担保贷款、$100,000.00、5.30% 手动基准利率、7 年；计算 2017–18。ATO 页面实际返回：

```text
The minimum yearly repayment for income year 2017-18 is $17,470.34
```

测试基准以整数分保存为 `1,747,034`，见 `tests/fixtures/div7a/ato-baseline.json`。测试注释记录了来源 URL 和取数日期 `2026-08-27`；不是由实现反推的期望值。`tests/unit/div7a.test.ts` 中官方基准断言通过，且另有测试锁定：贷款发放所得年度最低还款为 `0`，下一所得年度才开始计算。基准利率只接受用户手动输入，系统不按年份推定。

`div7a_loans.term_years` 明确表示原始合同期限；`Div7aSummary.remainingTermYears` 是按评估所得年度推导的当前剩余期限，`balanceAtPreviousYearEndCents` 是逐笔扣除此前所得年度还款后的余额。2017-05-15 发放、原始 7 年贷款的最后有效还款年度为 FY2023–24，FY2024–25 起为 `expired`、最低还款为 0、截止日为空。连续三个年度的最低还款单测使用不同余额/剩余期限并断言结果不相等。

## 2. 年度底稿与养老金

- 公司、信托、个人底稿均按 `income_year` 聚合，页面切换 `FY2025–26` 后信托标题也显示 `FY2025–26`；`deadline_fy` 不参与聚合。
- 待人工补充清单按主体类型生成：公司为“折旧、结转亏损、franking account 余额、Div 7A 借款余额”；信托为“折旧、结转亏损、信托 FTE 状态”；个人仅为“折旧、结转亏损”。单测同时断言个人不含 franking account、Div 7A 或 FTE。
- 养老金上限按所得年度写入 `super_caps`，不是单一当前设置：

| 所得年度 | concessional | non-concessional | 取数日期 |
|---|---:|---:|---|
| FY2021–22 至 FY2023–24 | $27,500（2,750,000 分） | $110,000（11,000,000 分） | 2026-08-29 |
| FY2024–25 至 FY2025–26 | $30,000（3,000,000 分） | $120,000（12,000,000 分） | 2026-08-29 |
| FY2026–27 | $32,500（3,250,000 分） | $130,000（13,000,000 分） | 2026-08-29 |

concessional 来源为 [ATO concessional contributions cap](https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/caps-limits-and-tax-on-super-contributions/concessional-contributions-cap)，non-concessional 来源为 [ATO non-concessional contributions cap](https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/caps-limits-and-tax-on-super-contributions/non-concessional-contributions-cap)。ASIC FY2026–27 普通 proprietary company 年检费参考值为 $342（34,200 分），来自 [ASIC Fees for commonly lodged documents](https://asic.gov.au/for-business-and-companies/forms-and-fees/all-fees/fees-for-commonly-lodged-documents)，取数日期 2026-08-29；系统只作人工核对提示，不自动付款。
- 追补规则的 5 年期限与 $500,000 TSB 门槛同样保存来源和取数日期；个人实际可用追补额度是个体数据，当前留空，UI 显示需人工核对，不自行推算。
- “供款到账”与“抵扣意向通知”是两个独立任务。供款使用 `backward` 方向；记录一个不会自动关闭另一个。单测覆盖单独完成顺序和 2029-06-30 周六调整为 2029-06-29。

## 3. 备份与还原实测

真实运行的 `GET /api/backup` 返回 `application/zip`，文件头为 ZIP，`unzip -t` 输出 `No errors detected in compressed data`。包内包括 `app.db`、`manifest.json` 和 `files/`，不包含 `.env`。

用该 ZIP 还原到清空的临时数据库 `/tmp/tax-gate5-restore-final-14iZBb/restored.db`，还原前后执行同一组 SQL：

```sql
SELECT id, name, type, gst_registered FROM entities ORDER BY sort_order;
SELECT id, entity_id, date, amount_cents FROM transactions ORDER BY id;
SELECT id, rule_id, entity_id, period_label, status FROM obligations ORDER BY id;
SELECT id, obligation_id, g1_cents, net_cents FROM bas_worksheets ORDER BY id;
```

实际还原后的输出为：

```text
entities
self              使用者本人                     individual  0
spouse            配偶                           individual  0
boyun_trust       Boyun Trust                    trust       0
boyun_co          Boyun Pty Ltd                  company     1
yeeliving_co      Yeeliving Pty Ltd（易居）      company     1
neighbourhood_co  Neighbourhood Project Pty Ltd  company     1

transactions
1  boyun_co  2026-07-04  -55000

obligations
1  individual_tax_return          self              FY2025-26     todo
2  super_contribution             self              FY2026-27     todo
3  super_notice                   self              FY2025-26     todo
4  individual_tax_return          spouse            FY2025-26     todo
5  super_contribution             spouse            FY2026-27     todo
6  super_notice                   spouse            FY2025-26     todo
7  trust_tax_return               boyun_trust       FY2025-26     todo
8  trust_distribution_resolution  boyun_trust       FY2026-27     todo
9  bas_quarterly                  boyun_co          FY2026-27 Q1  draft_ready
10 bas_quarterly                  boyun_co          FY2026-27 Q2  todo
11 bas_quarterly                  boyun_co          FY2026-27 Q3  todo
12 bas_quarterly                  boyun_co          FY2026-27 Q4  todo
13 company_tax_return             boyun_co          FY2025-26     todo
14 asic_annual_review             boyun_co          FY2026-27     blocked
15 bas_quarterly                  yeeliving_co      FY2026-27 Q1  todo
16 bas_quarterly                  yeeliving_co      FY2026-27 Q2  todo
17 bas_quarterly                  yeeliving_co      FY2026-27 Q3  todo
18 bas_quarterly                  yeeliving_co      FY2026-27 Q4  todo
19 company_tax_return             yeeliving_co      FY2025-26     todo
20 asic_annual_review             yeeliving_co      FY2026-27     blocked
21 bas_quarterly                  neighbourhood_co  FY2026-27 Q1  todo
22 bas_quarterly                  neighbourhood_co  FY2026-27 Q2  todo
23 bas_quarterly                  neighbourhood_co  FY2026-27 Q3  todo
24 bas_quarterly                  neighbourhood_co  FY2026-27 Q4  todo
25 company_tax_return             neighbourhood_co  FY2025-26     todo
26 asic_annual_review             neighbourhood_co  FY2026-27     blocked

bas_worksheets
1  9  0  -5000
```

`diff -u` 比较还原前后的四组查询输出，退出码为 `0`。另实际调用 `POST /api/restore` 返回 `{"restored":true}`，随后 `GET /api/health` 返回 `{"ok":true,"database":"connected"}`。

## 4. 验证结果

```text
npm test -- --run       29 个测试文件，143 个测试全部通过
npm run lint            通过
npm run build           通过，Next.js production build/typecheck 通过
Playwright final-regression.spec.ts  1 passed
```

本轮最终浏览器回归使用先执行 `DATABASE_PATH=./data/gate5-evidence-final5.db npm run db:seed` 的独立数据库，截图只写入 Gate 5 目录：

- `annual-worksheets.png`
- `div7a-official-baseline.png`
- `super-backup.png`

浏览器验证包含年度切换、官方 Div 7A 样本、养老金双任务、备份 ZIP 响应和 390px 窄屏无横向溢出。Browser 视觉复核的 `/annual`、`/div7a`、`/super` 页面均无应用 error/warn 日志；未声称验证真实手机摄像头或手机拍照上传。

## 5. 已知边界与待办

- 不做 ATO/ASIC 自动申报；Div 7A 协议签署、信托分配、折旧、亏损结转、franking account、Div 7A 余额和 FTE 仍需人工补充或核对。
- 个人追补额度不从本地账本推算，需以 ATO 个人记录输入。
- Gate 4 backlog：真实 ATO 抓取中 100 条里有 38 条无法确认首发日期，继续保持 `published_at = NULL` 并置于日期未知区；后续可进入文章页取明确发布日期，本 Gate 不处理。

其中养老金单测验证 FY2025–26 为 `3,000,000` 分、FY2026–27 为 `3,250,000` 分；Div 7A 单测验证官方基准、发放年度为 0、连续年度不相等和期满状态；年度单测验证公司/信托/个人清单差异。
