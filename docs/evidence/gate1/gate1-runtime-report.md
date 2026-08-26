# Gate 1 运行证据

运行日期：2026-08-26  
业务时区：`Australia/Melbourne`  
数据库：默认 `./data/app.db`（运行浏览器验收时未设置 `DATABASE_PATH`）

## BAS 12 条逐行核对

| 主体 | 期间 | income_year | deadline_fy | 期间法定日 | 实际日 |
|---|---|---|---|---|---|
| Boyun Pty Ltd | Q1 | FY2026–27 | FY2026–27 | 28 Oct 2026 | **11 Nov 2026** |
| Boyun Pty Ltd | Q2 | FY2026–27 | FY2026–27 | 28 Feb 2027 | **01 Mar 2027** |
| Boyun Pty Ltd | Q3 | FY2026–27 | FY2026–27 | 28 Apr 2027 | **12 May 2027** |
| Boyun Pty Ltd | Q4 | FY2026–27 | FY2026–27 | 28 Jul 2027 | **11 Aug 2027** |
| Yeeliving Pty Ltd（易居） | Q1 | FY2026–27 | FY2026–27 | 28 Oct 2026 | **11 Nov 2026** |
| Yeeliving Pty Ltd（易居） | Q2 | FY2026–27 | FY2026–27 | 28 Feb 2027 | **01 Mar 2027** |
| Yeeliving Pty Ltd（易居） | Q3 | FY2026–27 | FY2026–27 | 28 Apr 2027 | **12 May 2027** |
| Yeeliving Pty Ltd（易居） | Q4 | FY2026–27 | FY2026–27 | 28 Jul 2027 | **11 Aug 2027** |
| Neighbourhood Project Pty Ltd | Q1 | FY2026–27 | FY2026–27 | 28 Oct 2026 | **11 Nov 2026** |
| Neighbourhood Project Pty Ltd | Q2 | FY2026–27 | FY2026–27 | 28 Feb 2027 | **01 Mar 2027** |
| Neighbourhood Project Pty Ltd | Q3 | FY2026–27 | FY2026–27 | 28 Apr 2027 | **12 May 2027** |
| Neighbourhood Project Pty Ltd | Q4 | FY2026–27 | FY2026–27 | 28 Jul 2027 | **11 Aug 2027** |

这 12 行来自运行后的 SQLite 查询，不是仅由测试常量生成。Q2 三行实际日均为 **01 Mar 2027**，没有出现 `14 Mar 2027`。

## 年度税表年度拆分

| 主体/义务 | income_year | deadline_fy | 法定日 | 实际日 |
|---|---|---|---|---|
| Boyun Trust 信托税表 | FY2025–26 | FY2026–27 | 31 Oct 2026 | 02 Nov 2026 |
| 三家公司公司税表 | FY2025–26 | FY2026–27 | 28 Feb 2027 | 01 Mar 2027 |

看板标题已验证为 `FY2025–26 信托税表 · 截止 31 Oct 2026` 和 `FY2025–26 公司税表 · 截止 28 Feb 2027`。

## 牌照日期与风险

设置牌照周年日为 `15 Aug 2026` 后，运行数据库中的牌照义务为：

| window_opens | statutory_due（截止） | effective_due（工作日校准） | 后果日期 |
|---|---|---|---|
| 04 Jul 2026 | **15 Aug 2026** | 14 Aug 2026 | 05 Sep 2026 自动注销 |

看板卡片把“截止”只放在 `15 Aug 2026`，同时显示“窗口开启日：04 Jul 2026”；详情页显示周年日后 21 天自动注销。当前日期下该牌照已逾期，卡片使用红色最高危险边框和“最高危险”标识。

`obligation_rules` 实际方向：BAS/税表/ASIC 为 `forward`；牌照、个人可抵扣供款到账、信托分配决议为 `backward`；默认值为 `forward`。

## ASIC 未配置行为

实际 SQL 输出：

```text
SELECT id, acn, asic_review_date FROM entities WHERE type='company';

boyun_co          123456789  2026-07-15
yeeliving_co      NULL       NULL
neighbourhood_co  NULL       NULL
```

上一轮 Gate 1 浏览器测试为了验证三家公司 ASIC 日期，曾手动 PATCH 将三家公司都写成 `2026-07-15`；这些相同日期不是系统默认值。复审证据已重置为只有 `boyun_co` 有配置。两个未配置主体的 ASIC 义务均为 `blocked`，`statutory_due` 和 `effective_due` 均为 `NULL`，卡片只显示“日期待配置”。

## 日期格式与浏览器验证

- `formatDueDate("2026-07-15")` 在默认环境和 `en-US` 环境测试均返回 `15 Jul 2026`。
- 看板、义务详情、ICS 描述使用 `DD MMM YYYY`；没有 `mm/dd/yyyy` 或美式日期。
- 设置页输入控件使用自定义 `DD/MM/YYYY`，字段内显示格式提示，不依赖浏览器 locale。牌照截图中的 `15/08/2026` 是输入值，不是只读展示值。
- 桌面截图：[dashboard-dates.png](./dashboard-dates.png)
- 牌照配置保存后截图：[licence-settings.png](./licence-settings.png)
- 窄屏 `390px` 响应式布局已用 Playwright 验证可用；未声称验证真实手机摄像头或手机拍照上传流程。

## 默认数据库验证

以下命令在未设置 `DATABASE_PATH` 时运行并成功：

```text
env -u DATABASE_PATH npm run db:migrate   PASS
env -u DATABASE_PATH npm run db:migrate   PASS
env -u DATABASE_PATH npm run db:seed      PASS
```

运行后的 `./data/app.db` 查询结果：6 个主体、9 条义务规则、25 条 FY2026–27 义务；其中 12 条为 BAS。`data/gate0-evidence-final.db` 是 Gate 0 截图阶段的一次性证据数据库，不在应用代码或 `.env.local` 中被引用；应用默认路径由 `lib/db/client.ts` 的 `DATABASE_PATH ?? "./data/app.db"` 决定。

## 自动化结果

- `npm test`：11 个测试文件，46 个单元测试通过。
- `npm run lint`：通过。
- `npm run build`：通过。
- `npm run test:e2e -- tests/e2e/gate1-dashboard.spec.ts`：3 个浏览器测试通过；包含 12 条 BAS API/UI 核对、Q2 反例、年度标题、义务详情日期、ICS 导出、牌照保存/重载和 390px 响应式布局。
