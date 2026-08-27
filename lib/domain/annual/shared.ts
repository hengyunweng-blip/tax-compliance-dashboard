import { getRawDb } from "@/lib/db/client";
import { assertIntegerCents } from "@/lib/money";

export const ANNUAL_MANUAL_ITEMS = [
  "折旧",
  "结转亏损",
  "franking account 余额",
  "Div 7A 借款余额",
  "信托 FTE 状态",
] as const;

export type AnnualTransactionLine = {
  id: number;
  date: string;
  description: string;
  amountCents: number;
  gstCents: number;
  gstCode: string;
  accountId: number;
  accountCode: string;
  accountName: string;
  accountType: string;
};

export function normalizeIncomeYear(value: string) {
  const normalized = value.trim().replace(/^FY/, "");
  if (!/^\d{4}-\d{2}$/.test(normalized)) {
    throw new Error(`Invalid income year: ${value}`);
  }
  return `FY${normalized}`;
}

export function annualTransactionLines(entityId: string, incomeYear: string): AnnualTransactionLine[] {
  const fy = normalizeIncomeYear(incomeYear).replace(/^FY/, "");
  const rows = getRawDb().prepare(`
    SELECT t.id, t.date, t.description, t.amount_cents, t.gst_cents, t.gst_code,
      a.id AS account_id, a.code AS account_code, a.name AS account_name, a.type AS account_type
    FROM transactions t
    INNER JOIN accounts a ON a.id = t.account_id
    WHERE t.entity_id = ? AND t.fy = ? AND t.review_flag = 0
    ORDER BY t.date, t.id
  `).all(entityId, fy) as Array<{
    id: number;
    date: string;
    description: string;
    amount_cents: number;
    gst_cents: number;
    gst_code: string;
    account_id: number;
    account_code: string;
    account_name: string;
    account_type: string;
  }>;

  return rows.map((row) => {
    assertIntegerCents(row.amount_cents);
    assertIntegerCents(row.gst_cents);
    return {
      id: row.id,
      date: row.date,
      description: row.description,
      amountCents: row.amount_cents,
      gstCents: row.gst_cents,
      gstCode: row.gst_code,
      accountId: row.account_id,
      accountCode: row.account_code,
      accountName: row.account_name,
      accountType: row.account_type,
    };
  });
}

export function sumCents(values: number[]) {
  let total = 0;
  for (const value of values) {
    assertIntegerCents(value);
    total += value;
    assertIntegerCents(total);
  }
  return total;
}

export function displayIncomeYear(value: string) {
  return normalizeIncomeYear(value).replace("-", "–");
}
