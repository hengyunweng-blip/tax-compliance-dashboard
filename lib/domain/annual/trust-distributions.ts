import { getRawDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { assertIntegerCents } from "@/lib/money";
import { assertDateOnly, formatDateOnly, parseMelbourneDate, type DateOnly } from "@/lib/time/melbourne";
import { normalizeIncomeYear } from "@/lib/domain/annual/shared";

export type TrustDistributionStatus = "proposed" | "signed";

export type TrustDistribution = {
  id: number;
  trustEntityId: string;
  trustEntityName: string;
  incomeYear: string;
  beneficiaryEntityId: string;
  beneficiaryName: string;
  amountCents: number;
  resolutionDate: DateOnly;
  status: TrustDistributionStatus;
  statusLabel: "拟议·未签署" | "已签署";
  sourceDescription: string;
  enteredBy: string;
};

function normalizeDate(value: string, label: string): DateOnly {
  const date = value.trim() as DateOnly;
  assertDateOnly(date);
  if (formatDateOnly(parseMelbourneDate(date)) !== date) throw new Error(`${label}无效: ${value}`);
  return date;
}

function normalizeStatus(value: string): TrustDistributionStatus {
  if (value !== "proposed" && value !== "signed") throw new Error("分配状态必须是 proposed 或 signed");
  return value;
}

function mapRow(row: {
  id: number;
  trust_entity_id: string;
  trust_entity_name: string;
  income_year: string;
  beneficiary_entity_id: string;
  beneficiary_name: string;
  amount_cents: number;
  resolution_date: DateOnly;
  status: string;
  source_description: string;
  entered_by: string;
}): TrustDistribution {
  assertIntegerCents(row.amount_cents);
  const status = normalizeStatus(row.status);
  return {
    id: row.id,
    trustEntityId: row.trust_entity_id,
    trustEntityName: row.trust_entity_name,
    incomeYear: normalizeIncomeYear(row.income_year),
    beneficiaryEntityId: row.beneficiary_entity_id,
    beneficiaryName: row.beneficiary_name,
    amountCents: row.amount_cents,
    resolutionDate: normalizeDate(row.resolution_date, "决议日"),
    status,
    statusLabel: status === "signed" ? "已签署" : "拟议·未签署",
    sourceDescription: row.source_description,
    enteredBy: row.entered_by,
  };
}

const DISTRIBUTION_SELECT = `
  SELECT d.id, d.trust_entity_id, trust.name AS trust_entity_name,
    d.income_year, d.beneficiary_entity_id, beneficiary.name AS beneficiary_name,
    d.amount_cents, d.resolution_date, d.status, d.source_description, d.entered_by
  FROM trust_distributions d
  INNER JOIN entities trust ON trust.id = d.trust_entity_id
  INNER JOIN entities beneficiary ON beneficiary.id = d.beneficiary_entity_id
`;

export function listTrustDistributions(input: { trustEntityId?: string; beneficiaryEntityId?: string; incomeYear?: string } = {}): TrustDistribution[] {
  runMigrations();
  const clauses = ["1 = 1"];
  const params: unknown[] = [];
  if (input.trustEntityId) { clauses.push("d.trust_entity_id = ?"); params.push(input.trustEntityId); }
  if (input.beneficiaryEntityId) { clauses.push("d.beneficiary_entity_id = ?"); params.push(input.beneficiaryEntityId); }
  if (input.incomeYear) { clauses.push("d.income_year = ?"); params.push(normalizeIncomeYear(input.incomeYear)); }
  const rows = getRawDb().prepare(`${DISTRIBUTION_SELECT} WHERE ${clauses.join(" AND ")} ORDER BY d.income_year, d.beneficiary_entity_id, d.id`).all(...params) as Array<Parameters<typeof mapRow>[0]>;
  return rows.map(mapRow);
}

export function saveTrustDistribution(input: {
  trustEntityId: string;
  incomeYear: string;
  beneficiaryEntityId: string;
  amountCents: number;
  resolutionDate: string;
  status: TrustDistributionStatus;
  sourceDescription: string;
  enteredBy: string;
}): TrustDistribution {
  runMigrations();
  const incomeYear = normalizeIncomeYear(input.incomeYear);
  const resolutionDate = normalizeDate(input.resolutionDate, "决议日");
  assertIntegerCents(input.amountCents);
  if (input.amountCents < 0) throw new Error("信托分配金额不能为负数");
  const sourceDescription = input.sourceDescription.trim();
  const enteredBy = input.enteredBy.trim();
  if (!sourceDescription || !enteredBy) throw new Error("来源说明和录入人均为必填");

  const db = getRawDb();
  const trust = db.prepare("SELECT id, type FROM entities WHERE id = ? AND active = 1").get(input.trustEntityId) as { id: string; type: string } | undefined;
  if (!trust || trust.type !== "trust") throw new Error("分配来源主体必须是有效信托");
  const beneficiary = db.prepare("SELECT id, name, type FROM entities WHERE id = ? AND active = 1").get(input.beneficiaryEntityId) as { id: string; name: string; type: string } | undefined;
  if (!beneficiary || beneficiary.type !== "individual" || !["self", "spouse"].includes(beneficiary.id)) {
    throw new Error("信托受益人仅限 self 或 spouse；如结构变化需重新评估范围");
  }
  const status = normalizeStatus(input.status);

  const saved = db.transaction(() => {
    db.prepare(`
      INSERT INTO trust_distributions
        (trust_entity_id, income_year, beneficiary_entity_id, amount_cents, resolution_date, status, source_description, entered_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(trust_entity_id, income_year, beneficiary_entity_id) DO UPDATE SET
        amount_cents = excluded.amount_cents,
        resolution_date = excluded.resolution_date,
        status = excluded.status,
        source_description = excluded.source_description,
        entered_by = excluded.entered_by,
        updated_at = datetime('now')
    `).run(input.trustEntityId, incomeYear, input.beneficiaryEntityId, input.amountCents, resolutionDate, status, sourceDescription, enteredBy);
    const row = db.prepare("SELECT id FROM trust_distributions WHERE trust_entity_id = ? AND income_year = ? AND beneficiary_entity_id = ?").get(input.trustEntityId, incomeYear, input.beneficiaryEntityId) as { id: number };
    db.prepare(`
      INSERT INTO audit_log (target_type, target_id, from_status, to_status, reason, metadata_json)
      VALUES ('trust_distribution', ?, NULL, ?, ?, ?)
    `).run(String(row.id), status, "保存信托分配记录", JSON.stringify({ trustEntityId: input.trustEntityId, incomeYear, beneficiaryEntityId: input.beneficiaryEntityId, amountCents: input.amountCents, resolutionDate, status, sourceDescription, enteredBy }));
    return row.id;
  })();

  return listTrustDistributions({ trustEntityId: input.trustEntityId, incomeYear }).find((row) => row.id === saved) as TrustDistribution;
}

export function confirmTrustDistributionDifference(input: { trustEntityId: string; incomeYear: string; differenceCents: number; explanation: string; enteredBy: string }) {
  runMigrations();
  const incomeYear = normalizeIncomeYear(input.incomeYear);
  assertIntegerCents(input.differenceCents);
  const explanation = input.explanation.trim();
  const enteredBy = input.enteredBy.trim();
  if (!explanation || !enteredBy) throw new Error("差额说明和确认人均为必填");
  getRawDb().prepare(`
    INSERT INTO audit_log (target_type, target_id, reason, metadata_json)
    VALUES ('trust_distribution_reconciliation', ?, ?, ?)
  `).run(`${input.trustEntityId}:${incomeYear}`, explanation, JSON.stringify({ differenceCents: input.differenceCents, enteredBy }));
}
