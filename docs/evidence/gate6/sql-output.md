# Gate 6 实际 SQL 输出

取数日期：2026-08-29（`Australia/Melbourne`）。以下输出来自独立临时数据库，不是应用默认数据库，也没有写入 `docs/evidence/gate0`–`gate5`。

## 1. 年度基准利率

运行方式：

```text
DATABASE_PATH=/tmp/tax-gate6-sql.OSS8nb/app.db npx tsx scripts/gate6-evidence.ts
```

实际查询：

```sql
SELECT income_year, rate_text, source_url, retrieved_at, entry_method
FROM div7a_benchmark_rates
ORDER BY income_year;
```

实际输出：

```json
[
  {
    "income_year": "FY2025-26",
    "rate_text": "8.37%",
    "source_url": "https://www.ato.gov.au/tax-rates-and-codes/division-7a-benchmark-interest-rate",
    "retrieved_at": "2026-08-29",
    "entry_method": "manual"
  },
  {
    "income_year": "FY2026-27",
    "rate_text": "8.77%",
    "source_url": "https://www.ato.gov.au/tax-rates-and-codes/division-7a-benchmark-interest-rate",
    "retrieved_at": "2026-08-29",
    "entry_method": "manual"
  }
]
```

## 2. 30 June 2026 期初余额

实际查询：

```sql
SELECT entity_id, category, reference_type, reference_id, as_of_date,
       amount_cents, source_description, entered_by, entered_at
FROM opening_balances
ORDER BY id;
```

实际输出：

```json
[
  {
    "entity_id": "boyun_co",
    "category": "div7a_loan_balance",
    "reference_type": "loan",
    "reference_id": "loan:1",
    "as_of_date": "2026-06-30",
    "amount_cents": 5000000,
    "source_description": "会计 FY2025–26 底稿（Gate 6 临时演练）",
    "entered_by": "gate6-evidence",
    "entered_at": "2026-08-29"
  }
]
```

## 3. 每笔贷款独立的协议义务

实际查询：

```sql
SELECT id, entity_id, period_label, scope_key, statutory_due,
       effective_due, status
FROM obligations
WHERE rule_id = 'div7a_loan_agreement'
ORDER BY scope_key;
```

实际输出：

```json
[
  {
    "id": 28,
    "entity_id": "boyun_co",
    "period_label": "FY2019-20 · 贷款 1",
    "scope_key": "loan:1",
    "statutory_due": "2021-02-28",
    "effective_due": "2021-02-28",
    "status": "blocked"
  },
  {
    "id": 29,
    "entity_id": "yeeliving_co",
    "period_label": "FY2026-27 · 贷款 2",
    "scope_key": "loan:2",
    "statutory_due": "2028-02-28",
    "effective_due": "2028-02-28",
    "status": "blocked"
  }
]
```

## 4. 协议义务提醒

实际查询：

```sql
SELECT o.scope_key, COUNT(*) AS reminder_count,
       MIN(r.fire_at) AS first_fire_at, MAX(r.fire_at) AS last_fire_at
FROM reminders r
JOIN obligations o ON o.id = r.obligation_id
WHERE o.rule_id = 'div7a_loan_agreement'
GROUP BY o.scope_key
ORDER BY o.scope_key;
```

实际输出：

```json
[
  {
    "scope_key": "loan:1",
    "reminder_count": 369,
    "first_fire_at": "2021-01-29",
    "last_fire_at": "2022-02-28"
  },
  {
    "scope_key": "loan:2",
    "reminder_count": 369,
    "first_fire_at": "2028-01-29",
    "last_fire_at": "2029-02-27"
  }
]
```

369 条包括 T-30、T-10、T-3、当天，以及从逾期次日起至报告窗口结束的每日提醒。每笔贷款按 `scope_key` 分组，没有互相覆盖。

## 5. A 修补丁：边界与连续性

运行方式：

```text
BOUNDARY_DB_DIR=$(mktemp -d /tmp/tax-gate6-boundary.XXXXXX)
DATABASE_PATH="$BOUNDARY_DB_DIR/app.db" npx tsx scripts/gate6-boundary-evidence.ts
```

该独立边界库中的贷款：发放所得年度 `FY2016-17`、原始本金 `10,000,000` 分、7 年期、每年实际还款恰好等于当年最低还款；各年度基准利率为测试场景的 `5.30%`。以下是脚本的实际输出，金额均为分：

| 所得年度 | 状态 | 期初余额 | 利息 | 最低还款 | 实际还款 | 期末余额 | 剩余年限 |
|---|---:|---:|---:|---:|---:|---:|---:|
| FY2017–18 | active | 10,000,000 | 530,000 | 1,747,034 | 1,747,034 | 8,782,966 | 7 |
| FY2018–19 | active | 8,782,966 | 465,497 | 1,747,035 | 1,747,035 | 7,501,428 | 6 |
| FY2019–20 | active | 7,501,428 | 397,576 | 1,747,034 | 1,747,034 | 6,151,970 | 5 |
| FY2020–21 | active | 6,151,970 | 326,054 | 1,747,035 | 1,747,035 | 4,730,989 | 4 |
| FY2021–22 | active | 4,730,989 | 250,742 | 1,747,034 | 1,747,034 | 3,234,697 | 3 |
| FY2022–23 | active | 3,234,697 | 171,439 | 1,747,034 | 1,747,034 | 1,659,102 | 2 |
| FY2023–24 | active | 1,659,102 | 87,932 | 1,747,034 | 1,747,034 | 0 | 1 |
| FY2024–25 | expired | 0 | 0 | 0 | 0 | 0 | 0 |

因此 FY2023–24 是第七个、最后一个还款年度；FY2024–25 才进入 `expired`。另一个单元测试使用未清偿余额验证：进入 `expired` 时不会静默结束，并保留未清偿余额和人工核对警告。
