import fs from "node:fs";
import path from "node:path";
import { beforeEach, expect, test } from "vitest";
import { getRawDb } from "@/lib/db/client";
import { seedDatabase } from "@/lib/db/seed";
import { getBenchmarkRateForIncomeYear, listBenchmarkRates, parseBenchmarkRateText, saveBenchmarkRate } from "@/lib/domain/div7a/rates";
import { createDiv7aLoan, getDiv7aLoanSummary } from "@/lib/domain/div7a/service";

beforeEach(() => {
  seedDatabase();
  getRawDb().exec("DELETE FROM div7a_benchmark_rates; DELETE FROM audit_log;");
});

test("stores an annual rate as exact text with ATO provenance", () => {
  const fixture = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "tests/fixtures/div7a/benchmark-rates.json"), "utf8")) as Array<Record<string, string>>;
  const row = fixture.find((item) => item.incomeYear === "FY2026-27");
  expect(row).toBeDefined();
  saveBenchmarkRate(row as { incomeYear: string; rateText: string; sourceUrl: string; retrievedAt: string });

  expect(getRawDb().prepare("SELECT income_year, rate_text, source_url, retrieved_at FROM div7a_benchmark_rates").get()).toEqual({
    income_year: "FY2026-27",
    rate_text: "8.77%",
    source_url: "https://www.ato.gov.au/tax-rates-and-codes/division-7a-benchmark-interest-rate",
    retrieved_at: "2026-08-29",
  });
  expect(listBenchmarkRates()[0]).toMatchObject({ incomeYear: "FY2026-27", rateText: "8.77%" });
  expect(getRawDb().prepare("SELECT target_type, target_id FROM audit_log").get()).toEqual({ target_type: "div7a_benchmark_rate", target_id: "FY2026-27" });
});

test("missing income year returns null and never falls back to another year", () => {
  saveBenchmarkRate({
    incomeYear: "FY2026-27",
    rateText: "8.77%",
    sourceUrl: "https://www.ato.gov.au/tax-rates-and-codes/division-7a-benchmark-interest-rate",
    retrievedAt: "2026-08-29",
  });
  expect(getBenchmarkRateForIncomeYear("FY2027-28")).toBeNull();
});

test("parses the exact text with Decimal instead of a binary floating point number", () => {
  const parsed = parseBenchmarkRateText("8.77%");
  expect(parsed.constructor.name).toBe("Decimal");
  expect(parsed.toFixed(4)).toBe("0.0877");
});

test("missing annual rate leaves every calculated amount unresolved and does not use the legacy loan rate", () => {
  const loanId = createDiv7aLoan({
    lenderEntityId: "boyun_co",
    borrower: "Missing annual rate fixture",
    loanDate: "2026-07-01",
    principalCents: 10_000_000,
    termYears: 7,
    benchmarkRate: "5.30%",
  });

  const summary = getDiv7aLoanSummary(loanId, "FY2027-28");

  expect(summary.repaymentStatus).toBe("manual_review");
  expect(summary.unresolvedReason).toContain("基准利率未配置");
  expect(summary.interestCents).toBeNull();
  expect(summary.minimumRepaymentCents).toBeNull();
  expect(summary.closingBalanceCents).toBeNull();
  expect(summary.benchmarkRateText).toBeNull();
});
