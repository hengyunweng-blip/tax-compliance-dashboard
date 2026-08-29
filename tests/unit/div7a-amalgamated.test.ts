import { expect, test } from "vitest";
import { groupDiv7aLoans, type AmalgamationLoan } from "@/lib/domain/div7a/amalgamated";

function loan(overrides: Partial<AmalgamationLoan> = {}): AmalgamationLoan {
  return {
    id: 1,
    lenderEntityId: "boyun_co",
    borrower: "Director borrower",
    loanIncomeYear: "FY2026-27",
    securityType: "unsecured",
    minimumRepaymentCents: 100_000,
    ...overrides,
  };
}

test("groups same borrower, income year and maximum term and sums minimum repayments", () => {
  const groups = groupDiv7aLoans([
    loan({ id: 1, minimumRepaymentCents: 100_000 }),
    loan({ id: 2, minimumRepaymentCents: 250_000 }),
  ]);

  expect(groups).toHaveLength(1);
  expect(groups[0]).toMatchObject({ borrower: "Director borrower", incomeYear: "FY2026-27", maximumTermYears: 7, totalMinimumRepaymentCents: 350_000 });
  expect(groups[0].loans.map((item) => item.id)).toEqual([1, 2]);
});

test("does not combine loans with different borrowers, income years or unknown security", () => {
  const groups = groupDiv7aLoans([
    loan({ id: 1 }),
    loan({ id: 2, borrower: "Other borrower" }),
    loan({ id: 3, loanIncomeYear: "FY2027-28" }),
    loan({ id: 4, securityType: "registered_mortgage" }),
    loan({ id: 5, securityType: "unknown" }),
  ]);

  expect(groups.map((group) => group.loans.map((item) => item.id))).toEqual([[1], [2], [3], [4], [5]]);
});

