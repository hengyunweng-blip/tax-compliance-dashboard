import { getRawDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import {
  calculateAnnualTaxDue,
  calculateAsicAnnualReviewDue,
  calculateBasDueDates,
  calculateLicenceWindowDue,
  calculateSuperContributionDue,
  calculateSuperNoticeDue,
  calculateTrustDistributionDue,
  type BasQuarter,
} from "@/lib/domain/obligations/calculator";
import {
  PERIOD_LABELS,
  RULE_ADJUSTMENT_DIRECTIONS,
  RULE_LABELS,
  RULE_REQUIRED_FIELDS,
  type AdjustmentDirection,
  type ObligationCalculationContext,
  type ObligationEntityInput,
  type ObligationInput,
  type ObligationLicenceInput,
  type ObligationStatus,
} from "@/lib/domain/obligations/rules";
import { buildReminderInstances } from "@/lib/domain/obligations/reminders";
import type { DateOnly } from "@/lib/time/melbourne";

const BAS_PERIODS: Record<BasQuarter, { start: DateOnly; end: DateOnly }> = {
  Q1: { start: "2026-07-01", end: "2026-09-30" },
  Q2: { start: "2026-10-01", end: "2026-12-31" },
  Q3: { start: "2027-01-01", end: "2027-03-31" },
  Q4: { start: "2027-04-01", end: "2027-06-30" },
};

const BAS_QUARTERS: BasQuarter[] = ["Q1", "Q2", "Q3", "Q4"];

type ExpandOptions = {
  fy: string;
  entities?: ObligationEntityInput[];
  licence?: ObligationLicenceInput;
  context: ObligationCalculationContext;
  adjustmentDirections?: Partial<Record<string, AdjustmentDirection>>;
  requiredFields?: Partial<Record<string, string[]>>;
};

function fyLabel(fy: string) {
  return fy.startsWith("FY") ? fy : `FY${fy}`;
}

function requiredFieldPresent(field: string, entity?: ObligationEntityInput, licence?: ObligationLicenceInput): boolean {
  switch (field) {
    case "acn":
      return Boolean(entity?.acn?.trim());
    case "asic_review_date":
      return Boolean(entity?.asicReviewDate);
    case "anniversary_date":
      return Boolean(licence?.anniversaryDate);
    default:
      return false;
  }
}

function statusForRule(
  ruleId: string,
  entity: ObligationEntityInput | undefined,
  licence: ObligationLicenceInput | undefined,
  overrides?: Partial<Record<string, string[]>>,
): ObligationStatus {
  const requiredFields = overrides?.[ruleId] ?? RULE_REQUIRED_FIELDS[ruleId] ?? [];
  return requiredFields.every((field) => requiredFieldPresent(field, entity, licence)) ? "todo" : "blocked";
}

function adjustmentDirectionFor(ruleId: string, overrides?: Partial<Record<string, AdjustmentDirection>>): AdjustmentDirection {
  return overrides?.[ruleId] ?? RULE_ADJUSTMENT_DIRECTIONS[ruleId] ?? "forward";
}

function makeInput(
  input: Omit<ObligationInput, "ruleLabel" | "portalUrl" | "checklist"> & { ruleId: string },
): ObligationInput {
  return {
    ...input,
    ruleLabel: RULE_LABELS[input.ruleId] ?? input.ruleId,
    portalUrl: input.ruleId === "individual_tax_return" ? "https://my.gov.au/" : "https://www.ato.gov.au/online-services/businesses-and-organisations",
    checklist: [],
  };
}

export function expandObligations({ fy, entities = [], licence, context, adjustmentDirections, requiredFields }: ExpandOptions): ObligationInput[] {
  const incomeYear = fyLabel(fy);
  const inputs: ObligationInput[] = [];

  for (const entity of entities) {
    if (entity.type === "company" && entity.gstRegistered) {
      for (const quarter of BAS_QUARTERS) {
        const due = calculateBasDueDates(fy, quarter, adjustmentDirectionFor("bas_quarterly", adjustmentDirections));
        inputs.push(makeInput({
          ruleId: "bas_quarterly",
          entityId: entity.id,
          periodLabel: PERIOD_LABELS.bas(incomeYear, quarter),
          periodStart: BAS_PERIODS[quarter].start,
          periodEnd: BAS_PERIODS[quarter].end,
          incomeYear: due.incomeYear,
          deadlineFy: due.deadlineFy,
          statutoryDue: due.statutoryDue,
          effectiveDue: due.effectiveDue,
          status: "todo",
        }));
      }
    }

    if (entity.type === "company" || entity.type === "trust" || entity.type === "individual") {
      const due = calculateAnnualTaxDue({
        type: entity.type,
        priorYearReturnOutstanding: entity.type === "company" && context.priorYearReturnOutstanding,
      }, { fy }, adjustmentDirectionFor(entity.type === "company" ? "company_tax_return" : entity.type === "trust" ? "trust_tax_return" : "individual_tax_return", adjustmentDirections));
      const ruleId = entity.type === "company"
        ? "company_tax_return"
        : entity.type === "trust" ? "trust_tax_return" : "individual_tax_return";
      inputs.push(makeInput({
        ruleId,
        entityId: entity.id,
        periodLabel: PERIOD_LABELS.annual(due.incomeYear),
        periodStart: null,
        periodEnd: null,
        incomeYear: due.incomeYear,
        deadlineFy: due.deadlineFy,
        statutoryDue: due.statutoryDue,
        effectiveDue: due.effectiveDue,
        status: statusForRule(ruleId, entity, licence, requiredFields),
      }));
    }

    if (entity.type === "trust") {
      const due = calculateTrustDistributionDue(undefined, adjustmentDirectionFor("trust_distribution_resolution", adjustmentDirections));
      inputs.push(makeInput({
        ruleId: "trust_distribution_resolution",
        entityId: entity.id,
        periodLabel: PERIOD_LABELS.annual(due.incomeYear),
        periodStart: null,
        periodEnd: null,
        incomeYear: due.incomeYear,
        deadlineFy: due.deadlineFy,
        statutoryDue: due.statutoryDue,
        effectiveDue: due.effectiveDue,
        status: "todo",
      }));
    }

    if (entity.type === "company") {
      if (entity.asicReviewDate) {
        const due = calculateAsicAnnualReviewDue(entity.asicReviewDate, fy, adjustmentDirectionFor("asic_annual_review", adjustmentDirections));
        inputs.push(makeInput({
          ruleId: "asic_annual_review",
          entityId: entity.id,
          periodLabel: PERIOD_LABELS.annual(due.incomeYear),
          periodStart: null,
          periodEnd: null,
          incomeYear: due.incomeYear,
          deadlineFy: due.deadlineFy,
          statutoryDue: due.statutoryDue,
          effectiveDue: due.effectiveDue,
          status: statusForRule("asic_annual_review", entity, licence, requiredFields),
        }));
      } else {
        const year = fyLabel(fy);
        inputs.push(makeInput({
          ruleId: "asic_annual_review",
          entityId: entity.id,
          periodLabel: PERIOD_LABELS.annual(year),
          periodStart: null,
          periodEnd: null,
          incomeYear: year,
          deadlineFy: year,
          statutoryDue: null,
          effectiveDue: null,
          status: "blocked",
        }));
      }
    }

    if (entity.type === "individual") {
      const due = calculateSuperContributionDue(undefined, adjustmentDirectionFor("super_contribution", adjustmentDirections));
      inputs.push(makeInput({
        ruleId: "super_contribution",
        entityId: entity.id,
        periodLabel: PERIOD_LABELS.annual(due.incomeYear),
        periodStart: null,
        periodEnd: null,
        incomeYear: due.incomeYear,
        deadlineFy: due.deadlineFy,
        statutoryDue: due.statutoryDue,
        effectiveDue: due.effectiveDue,
        status: "todo",
      }));

      const noticeDue = calculateSuperNoticeDue(fy, adjustmentDirectionFor("super_notice", adjustmentDirections));
      inputs.push(makeInput({
        ruleId: "super_notice",
        entityId: entity.id,
        periodLabel: PERIOD_LABELS.annual(noticeDue.incomeYear),
        periodStart: null,
        periodEnd: null,
        incomeYear: noticeDue.incomeYear,
        deadlineFy: noticeDue.deadlineFy,
        statutoryDue: noticeDue.statutoryDue,
        effectiveDue: noticeDue.effectiveDue,
        status: "todo",
      }));
    }
  }

  if (licence?.anniversaryDate) {
    const due = calculateLicenceWindowDue(licence.anniversaryDate, fy, adjustmentDirectionFor("estate_agent_licence_annual_statement", adjustmentDirections));
    inputs.push(makeInput({
      ruleId: "estate_agent_licence_annual_statement",
      entityId: "self",
      periodLabel: PERIOD_LABELS.annual(due.incomeYear),
      periodStart: null,
      periodEnd: null,
      incomeYear: due.incomeYear,
      deadlineFy: due.deadlineFy,
      statutoryDue: due.statutoryDue,
        effectiveDue: due.effectiveDue,
        windowOpens: due.windowOpens,
        status: "todo",
    }));
  }

  return inputs;
}

type DatabaseEntity = {
  id: string;
  type: string;
  gst_registered: number;
  acn: string | null;
  asic_review_date: DateOnly | null;
};

export function expandObligationsInDatabase({ fy, context }: { fy: string; context: ObligationCalculationContext }) {
  runMigrations();
  const db = getRawDb();
  const entities = db.prepare("SELECT id, type, gst_registered, acn, asic_review_date FROM entities ORDER BY sort_order").all() as DatabaseEntity[];
  const ruleRows = db.prepare("SELECT id, adjustment_direction, required_fields, reminder_offsets FROM obligation_rules").all() as Array<{
    id: string;
    adjustment_direction: string;
    required_fields: string;
    reminder_offsets: string;
  }>;
  const adjustmentDirections = Object.fromEntries(ruleRows.map((rule) => [
    rule.id,
    rule.adjustment_direction === "backward" ? "backward" : "forward",
  ])) as Partial<Record<string, AdjustmentDirection>>;
  const requiredFields = Object.fromEntries(ruleRows.map((rule) => {
    try {
      const parsed = JSON.parse(rule.required_fields) as unknown;
      return [rule.id, Array.isArray(parsed) ? parsed.filter((field): field is string => typeof field === "string") : []];
    } catch {
      return [rule.id, []];
    }
  })) as Partial<Record<string, string[]>>;
  const reminderOffsets = Object.fromEntries(ruleRows.map((rule) => {
    try {
      const parsed = JSON.parse(rule.reminder_offsets) as unknown;
      return [rule.id, Array.isArray(parsed) ? parsed.filter((offset): offset is number => typeof offset === "number") : []];
    } catch {
      return [rule.id, []];
    }
  })) as Record<string, number[]>;
  const licence = db.prepare("SELECT anniversary_date FROM licences ORDER BY id LIMIT 1").get() as { anniversary_date: DateOnly | null } | undefined;
  const inputs = expandObligations({
    fy,
    context,
    entities: entities.map((entity) => ({
      id: entity.id,
      type: entity.type,
      gstRegistered: Boolean(entity.gst_registered),
      acn: entity.acn,
      asicReviewDate: entity.asic_review_date,
    })),
    licence: { anniversaryDate: licence?.anniversary_date ?? null },
    adjustmentDirections,
    requiredFields,
  });

  const transaction = db.transaction(() => {
    const insert = db.prepare(`
      INSERT INTO obligations (
        rule_id, entity_id, period_label, period_start, period_end, income_year, deadline_fy,
        statutory_due, effective_due, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(rule_id, entity_id, period_label) DO UPDATE SET
        period_start = excluded.period_start,
        period_end = excluded.period_end,
        income_year = excluded.income_year,
        deadline_fy = excluded.deadline_fy,
        statutory_due = excluded.statutory_due,
        effective_due = excluded.effective_due,
        notes = excluded.notes,
        status = CASE
          WHEN excluded.status = 'blocked' THEN 'blocked'
          WHEN obligations.status = 'blocked' THEN excluded.status
          ELSE obligations.status
        END,
        updated_at = datetime('now')
    `);
    for (const input of inputs) {
      insert.run(
        input.ruleId,
        input.entityId,
        input.periodLabel,
        input.periodStart,
        input.periodEnd,
        input.incomeYear,
        input.deadlineFy,
        input.statutoryDue,
        input.effectiveDue,
        input.status,
        JSON.stringify({
          ruleLabel: input.ruleLabel,
          portalUrl: input.portalUrl,
          checklist: input.checklist,
          windowOpens: input.windowOpens ?? null,
          reminderStart: input.windowOpens ?? input.effectiveDue,
        }),
      );

      const obligation = db.prepare(`
        SELECT id
        FROM obligations
        WHERE rule_id = ? AND entity_id = ? AND period_label = ?
      `).get(input.ruleId, input.entityId, input.periodLabel) as { id: number };
      db.prepare("DELETE FROM reminders WHERE obligation_id = ? AND acknowledged_at IS NULL").run(obligation.id);
      if (input.effectiveDue && reminderOffsets[input.ruleId]?.length) {
        const reminderRows = buildReminderInstances({
          obligationId: obligation.id,
          effectiveDue: input.effectiveDue,
          reminderStart: input.windowOpens ?? undefined,
          reminderOffsets: reminderOffsets[input.ruleId],
        });
        const insertReminder = db.prepare(`
          INSERT INTO reminders (obligation_id, fire_at, level)
          VALUES (?, ?, ?)
        `);
        for (const reminder of reminderRows) {
          insertReminder.run(reminder.obligationId, reminder.fireAt, reminder.level);
        }
      }
    }
  });
  transaction();
  return inputs;
}
