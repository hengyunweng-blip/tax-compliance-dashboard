import { getRawDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { assertIntegerCents } from "@/lib/money";
import { DEFAULT_SUPER_CONFIGURATION, SUPER_SETTING_KEYS } from "@/lib/domain/super/constants";
import { assertDateOnly, formatDateOnly, parseMelbourneDate, type DateOnly } from "@/lib/time/melbourne";

export type SuperProgress = {
  person: string;
  incomeYear: string;
  contributedCents: number;
  capCents: number | null;
  nonConcessionalCapCents: number | null;
  remainingCents: number | null;
  capConfigured: boolean;
  capSourceUrl: string | null;
  capRetrievedAt: string | null;
  nonConcessionalCapSourceUrl: string | null;
  nonConcessionalCapRetrievedAt: string | null;
  carryForwardAvailableCents: number | null;
  carryForwardYears: number | null;
  carryForwardTsbLimitCents: number | null;
  carryForwardSourceUrl: string | null;
  carryForwardRetrievedAt: string | null;
  carryForwardHint: string;
  paymentComplete: boolean;
  noticeComplete: boolean;
  noticeSubmittedAt: DateOnly | null;
};

export type SuperConfiguration = {
  incomeYear: string;
  capCents: number | null;
  nonConcessionalCapCents: number | null;
  capSourceUrl: string | null;
  capRetrievedAt: string | null;
  nonConcessionalCapSourceUrl: string | null;
  nonConcessionalCapRetrievedAt: string | null;
  carryForwardAvailableCents: number | null;
  carryForwardYears: number | null;
  carryForwardTsbLimitCents: number | null;
  carryForwardSourceUrl: string | null;
  carryForwardRetrievedAt: string | null;
};

function normalizeFy(value: string) {
  const normalized = value.trim().replace(/^FY/, "");
  if (!/^\d{4}-\d{2}$/.test(normalized)) throw new Error(`Invalid income year: ${value}`);
  return normalized;
}

function optionalIntegerSetting(key: string): number | null {
  const row = getRawDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  if (!row || row.value.trim() === "") return null;
  const parsed = Number(row.value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function optionalTextSetting(key: string): string | null {
  const row = getRawDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value.trim() || null;
}

export function getSuperConfiguration(incomeYear = "FY2026-27"): SuperConfiguration {
  runMigrations();
  const fy = normalizeFy(incomeYear);
  const cap = getRawDb().prepare(`
    SELECT income_year, concessional_cap_cents, non_concessional_cap_cents,
      concessional_source_url, concessional_retrieved_at,
      non_concessional_source_url, non_concessional_retrieved_at
    FROM super_caps
    WHERE income_year = ?
  `).get(fy) as {
    income_year: string;
    concessional_cap_cents: number;
    non_concessional_cap_cents: number;
    concessional_source_url: string;
    concessional_retrieved_at: string;
    non_concessional_source_url: string;
    non_concessional_retrieved_at: string;
  } | undefined;

  if (cap) {
    assertIntegerCents(cap.concessional_cap_cents);
    assertIntegerCents(cap.non_concessional_cap_cents);
  }

  return {
    incomeYear: `FY${fy}`,
    capCents: cap?.concessional_cap_cents ?? null,
    nonConcessionalCapCents: cap?.non_concessional_cap_cents ?? null,
    capSourceUrl: cap?.concessional_source_url ?? null,
    capRetrievedAt: cap?.concessional_retrieved_at ?? null,
    nonConcessionalCapSourceUrl: cap?.non_concessional_source_url ?? null,
    nonConcessionalCapRetrievedAt: cap?.non_concessional_retrieved_at ?? null,
    carryForwardAvailableCents: optionalIntegerSetting(SUPER_SETTING_KEYS.carryForwardAvailableCents),
    carryForwardYears: optionalIntegerSetting(SUPER_SETTING_KEYS.carryForwardYears),
    carryForwardTsbLimitCents: optionalIntegerSetting(SUPER_SETTING_KEYS.carryForwardTsbLimitCents),
    carryForwardSourceUrl: optionalTextSetting(SUPER_SETTING_KEYS.carryForwardSourceUrl),
    carryForwardRetrievedAt: optionalTextSetting(SUPER_SETTING_KEYS.carryForwardRetrievedAt),
  };
}

function normalizeDate(value: string | null | undefined): DateOnly | null {
  if (value === undefined || value === null || value.trim() === "") return null;
  const date = value.trim() as DateOnly;
  assertDateOnly(date);
  if (formatDateOnly(parseMelbourneDate(date)) !== date) throw new Error(`Invalid date: ${value}`);
  return date;
}

function carryForwardHint(configuration: SuperConfiguration) {
  if (configuration.carryForwardYears === null || configuration.carryForwardTsbLimitCents === null) {
    return "追补规则未配置，请核对 ATO 现行规定。";
  }
  if (configuration.carryForwardAvailableCents === null) {
    return `追补额度未配置；需人工核对最近 ${configuration.carryForwardYears} 个所得年度的未用额度。`;
  }
  return `已手动配置追补额度 ${configuration.carryForwardAvailableCents} 分；仍需以 ATO 记录确认。`;
}

export function getSuperProgress(person: string, incomeYear: string): SuperProgress {
  const fy = normalizeFy(incomeYear);
  const configuration = getSuperConfiguration(fy);
  const row = getRawDb().prepare(`
    SELECT COALESCE(SUM(CASE WHEN paid_at IS NOT NULL THEN amount_cents ELSE 0 END), 0) AS contributed_cents,
      MAX(notice_submitted_at) AS notice_submitted_at
    FROM super_contributions
    WHERE person = ? AND fy = ?
  `).get(person, fy) as { contributed_cents: number; notice_submitted_at: string | null };
  assertIntegerCents(row.contributed_cents);
  const remainingCents = configuration.capCents === null
    ? null
    : Math.max(0, configuration.capCents - row.contributed_cents);
  if (remainingCents !== null) assertIntegerCents(remainingCents);

  return {
    person,
    incomeYear: `FY${fy}`,
    contributedCents: row.contributed_cents,
    capCents: configuration.capCents,
    nonConcessionalCapCents: configuration.nonConcessionalCapCents,
    remainingCents,
    capConfigured: configuration.capCents !== null,
    capSourceUrl: configuration.capSourceUrl,
    capRetrievedAt: configuration.capRetrievedAt,
    nonConcessionalCapSourceUrl: configuration.nonConcessionalCapSourceUrl,
    nonConcessionalCapRetrievedAt: configuration.nonConcessionalCapRetrievedAt,
    carryForwardAvailableCents: configuration.carryForwardAvailableCents,
    carryForwardYears: configuration.carryForwardYears,
    carryForwardTsbLimitCents: configuration.carryForwardTsbLimitCents,
    carryForwardSourceUrl: configuration.carryForwardSourceUrl,
    carryForwardRetrievedAt: configuration.carryForwardRetrievedAt,
    carryForwardHint: carryForwardHint(configuration),
    paymentComplete: row.contributed_cents > 0,
    noticeComplete: Boolean(row.notice_submitted_at),
    noticeSubmittedAt: normalizeDate(row.notice_submitted_at),
  };
}

export function recordSuperContribution(input: { person: string; fy: string; amountCents: number; paidAt?: string | null }) {
  runMigrations();
  if (!input.person.trim()) throw new Error("Person is required");
  const fy = normalizeFy(input.fy);
  assertIntegerCents(input.amountCents);
  if (input.amountCents < 0) throw new Error("Contribution cannot be negative");
  const paidAt = normalizeDate(input.paidAt);
  const configuration = getSuperConfiguration(fy);
  getRawDb().prepare(`
    INSERT INTO super_contributions (person, fy, amount_cents, paid_at, notice_submitted_at, cap_cents, carry_forward_note)
    VALUES (?, ?, ?, ?, NULL, ?, ?)
  `).run(
    input.person.trim(),
    fy,
    input.amountCents,
    paidAt,
    configuration.capCents ?? 0,
    configuration.carryForwardAvailableCents === null ? "追补额度待人工核对" : `追补额度 ${configuration.carryForwardAvailableCents} 分（手动）`,
  );
  return getSuperProgress(input.person.trim(), fy);
}

export function markSuperNoticeSubmitted(input: { person: string; fy: string; submittedAt: string }) {
  runMigrations();
  if (!input.person.trim()) throw new Error("Person is required");
  const fy = normalizeFy(input.fy);
  const submittedAt = normalizeDate(input.submittedAt);
  if (!submittedAt) throw new Error("Notice date is required");
  const db = getRawDb();
  const configuration = getSuperConfiguration(fy);
  const result = db.prepare(`
    UPDATE super_contributions
    SET notice_submitted_at = ?, updated_at = datetime('now')
    WHERE id = (
      SELECT id FROM super_contributions WHERE person = ? AND fy = ? ORDER BY id DESC LIMIT 1
    )
  `).run(submittedAt, input.person.trim(), fy);
  if (result.changes === 0) {
    db.prepare(`
      INSERT INTO super_contributions (person, fy, amount_cents, paid_at, notice_submitted_at, cap_cents, carry_forward_note)
      VALUES (?, ?, 0, NULL, ?, ?, ?)
    `).run(input.person.trim(), fy, submittedAt, configuration.capCents ?? 0, "仅记录通知，供款到账仍需单独完成");
  }
  return getSuperProgress(input.person.trim(), fy);
}

export function defaultSuperConfiguration() {
  return DEFAULT_SUPER_CONFIGURATION;
}
