import type { SecurityType } from "@/lib/domain/div7a/opening-balances";

export type AmalgamationLoan = {
  id: number;
  lenderEntityId: string;
  borrower: string;
  loanIncomeYear: string;
  securityType: SecurityType;
  minimumRepaymentCents: number | null;
};

export type AmalgamatedLoanGroup = {
  key: string;
  lenderEntityId: string;
  borrower: string;
  incomeYear: string;
  maximumTermYears: number;
  loans: AmalgamationLoan[];
  totalMinimumRepaymentCents: number | null;
};

export const DIV7A_AMALGAMATED_LOAN_SOURCE_URL = "https://www.ato.gov.au/api/public/content/0-df9bf50b-461c-4f07-b86b-f6fe8b2cc89a";

export function maximumTermYearsForSecurity(securityType: SecurityType): number | null {
  if (securityType === "unsecured") return 7;
  if (securityType === "registered_mortgage") return 25;
  return null;
}

export function groupDiv7aLoans(loans: AmalgamationLoan[]): AmalgamatedLoanGroup[] {
  const groups = new Map<string, AmalgamatedLoanGroup>();
  for (const loan of loans) {
    const maximumTermYears = maximumTermYearsForSecurity(loan.securityType);
    if (maximumTermYears === null) {
      groups.set(`loan:${loan.id}`, {
        key: `loan:${loan.id}`,
        lenderEntityId: loan.lenderEntityId,
        borrower: loan.borrower,
        incomeYear: loan.loanIncomeYear,
        maximumTermYears: 0,
        loans: [loan],
        totalMinimumRepaymentCents: loan.minimumRepaymentCents,
      });
      continue;
    }

    const key = [loan.lenderEntityId, loan.borrower, loan.loanIncomeYear, maximumTermYears].join("|");
    const existing = groups.get(key);
    if (existing) {
      existing.loans.push(loan);
      if (existing.totalMinimumRepaymentCents !== null && loan.minimumRepaymentCents !== null) {
        existing.totalMinimumRepaymentCents += loan.minimumRepaymentCents;
      } else {
        existing.totalMinimumRepaymentCents = null;
      }
      continue;
    }
    groups.set(key, {
      key,
      lenderEntityId: loan.lenderEntityId,
      borrower: loan.borrower,
      incomeYear: loan.loanIncomeYear,
      maximumTermYears,
      loans: [loan],
      totalMinimumRepaymentCents: loan.minimumRepaymentCents,
    });
  }
  return [...groups.values()].sort((left, right) => left.loans[0].id - right.loans[0].id);
}

