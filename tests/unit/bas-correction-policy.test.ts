import { expect, test } from "vitest";
import {
  assessGstCorrection,
  GST_CORRECTION_POLICY,
} from "@/lib/domain/bas/gst-correction-policy";

test("uses the published ATO low-turnover debit-error cap and time limit", () => {
  expect(GST_CORRECTION_POLICY).toMatchObject({
    turnoverBand: "under_20m",
    debitErrorValueLimitCents: 1_250_000,
    debitErrorTimeLimitMonths: 18,
    sourceRetrievedOn: "2026-08-27",
  });
  expect(GST_CORRECTION_POLICY.sourceUrl).toContain("ato.gov.au");
  expect(GST_CORRECTION_POLICY.determinationUrl).toContain("ato.gov.au");
});

test("blocks a debit GST correction at or above the ATO value limit", () => {
  const result = assessGstCorrection({
    originalEffectiveDue: "2026-11-11",
    targetEffectiveDue: "2027-03-01",
    gstDeltaCents: 1_250_000,
  });

  expect(result).toMatchObject({ allowed: false, kind: "debit", netGstDeltaCents: 1_250_000 });
  expect(result.reason).toMatch(/12,500/);
  expect(result.reason).toMatch(/修订/);
});

test("blocks a correction after the published time limit", () => {
  const result = assessGstCorrection({
    originalEffectiveDue: "2026-11-11",
    targetEffectiveDue: "2028-06-01",
    gstDeltaCents: 10_000,
  });

  expect(result.allowed).toBe(false);
  expect(result.kind).toBe("debit");
  expect(result.reason).toMatch(/18 个月/);
  expect(result.limitDate).toBe("2028-05-11");
});

test("allows a small in-time debit correction and a credit correction within review", () => {
  expect(assessGstCorrection({
    originalEffectiveDue: "2026-11-11",
    targetEffectiveDue: "2027-03-01",
    gstDeltaCents: 10_000,
  }).allowed).toBe(true);

  expect(assessGstCorrection({
    originalEffectiveDue: "2026-11-11",
    targetEffectiveDue: "2029-03-01",
    gstDeltaCents: -50_000,
  }).allowed).toBe(true);
});
