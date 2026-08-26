import { getRawDb } from "@/lib/db/client";
import { expandObligationsInDatabase } from "@/lib/domain/obligations/expand";
import type { ObligationStatus } from "@/lib/domain/obligations/rules";
import type { DateOnly } from "@/lib/time/melbourne";

export type ObligationView = {
  id: number;
  ruleId: string;
  ruleLabel: string;
  entityId: string;
  entityName: string;
  entityType: string;
  periodLabel: string;
  periodStart: DateOnly | null;
  periodEnd: DateOnly | null;
  incomeYear: string;
  deadlineFy: string;
  statutoryDue: DateOnly | null;
  effectiveDue: DateOnly | null;
  windowOpens: DateOnly | null;
  status: ObligationStatus;
  portalUrl: string;
  checklist: string[];
};

type ObligationRow = {
  id: number;
  rule_id: string;
  rule_label: string | null;
  entity_id: string;
  entity_name: string;
  entity_type: string;
  period_label: string;
  period_start: DateOnly | null;
  period_end: DateOnly | null;
  income_year: string;
  deadline_fy: string;
  statutory_due: DateOnly | null;
  effective_due: DateOnly | null;
  status: ObligationStatus;
  portal_url: string | null;
  checklist: string | null;
  notes: string | null;
};

function readChecklist(value: string | null): string[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function readNoteDate(value: string | null, key: "windowOpens"): DateOnly | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const date = parsed[key];
    return typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date as DateOnly : null;
  } catch {
    return null;
  }
}

function mapRow(row: ObligationRow): ObligationView {
  return {
    id: row.id,
    ruleId: row.rule_id,
    ruleLabel: row.rule_label ?? row.rule_id,
    entityId: row.entity_id,
    entityName: row.entity_name,
    entityType: row.entity_type,
    periodLabel: row.period_label,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    incomeYear: row.income_year,
    deadlineFy: row.deadline_fy,
    statutoryDue: row.statutory_due,
    effectiveDue: row.effective_due,
    windowOpens: readNoteDate(row.notes, "windowOpens"),
    status: row.status,
    portalUrl: row.portal_url ?? "",
    checklist: readChecklist(row.checklist),
  };
}

export function getObligationsForFy(fy: string): ObligationView[] {
  const normalizedFy = fy.startsWith("FY") ? fy : `FY${fy}`;
  const rows = getRawDb().prepare(`
    SELECT o.id, o.rule_id, r.label AS rule_label, o.entity_id, e.name AS entity_name, e.type AS entity_type,
      o.period_label, o.period_start, o.period_end, o.income_year, o.deadline_fy,
      o.statutory_due, o.effective_due, o.status, r.portal_url, r.checklist, o.notes
    FROM obligations o
    INNER JOIN entities e ON e.id = o.entity_id
    LEFT JOIN obligation_rules r ON r.id = o.rule_id
    WHERE o.deadline_fy = ?
    ORDER BY o.effective_due, e.sort_order, o.id
  `).all(normalizedFy) as ObligationRow[];
  return rows.map(mapRow);
}

export function getObligationById(id: number): ObligationView | null {
  const row = getRawDb().prepare(`
    SELECT o.id, o.rule_id, r.label AS rule_label, o.entity_id, e.name AS entity_name, e.type AS entity_type,
      o.period_label, o.period_start, o.period_end, o.income_year, o.deadline_fy,
      o.statutory_due, o.effective_due, o.status, r.portal_url, r.checklist, o.notes
    FROM obligations o
    INNER JOIN entities e ON e.id = o.entity_id
    LEFT JOIN obligation_rules r ON r.id = o.rule_id
    WHERE o.id = ?
  `).get(id) as ObligationRow | undefined;
  return row ? mapRow(row) : null;
}

export function ensureObligationsForFy(fy: string, context = { priorYearReturnOutstanding: false }) {
  expandObligationsInDatabase({ fy, context });
  return getObligationsForFy(fy);
}
