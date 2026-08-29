"use client";

import { Div7aLoanCard } from "@/components/annual/div7a-loan-card";
import { formatCents } from "@/lib/money";
import { DIV7A_AMALGAMATED_LOAN_SOURCE_URL, type AmalgamatedLoanGroup } from "@/lib/domain/div7a/amalgamated";
import type { Div7aLoanView } from "@/lib/domain/div7a/service";

export function Div7aAmalgamatedGroup({
  group,
  loans,
  onChanged,
}: {
  group: AmalgamatedLoanGroup;
  loans: Div7aLoanView[];
  onChanged: () => void;
}) {
  const loanById = new Map(loans.map((loan) => [loan.id, loan]));
  const groupLoans = group.loans
    .map((loan) => loanById.get(loan.id))
    .filter((loan): loan is Div7aLoanView => loan !== undefined);
  const isAmalgamated = groupLoans.length > 1;

  return (
    <section className="div7a-amalgamated-group" data-testid={`div7a-group-${group.key}`}>
      <div className="annual-card-heading">
        <div>
          <p className="page-kicker">Div 7A {isAmalgamated ? "合并贷款" : "贷款"}</p>
          <h2>{group.borrower} · {group.incomeYear.replace("-", "–")}</h2>
        </div>
        <strong>{group.totalMinimumRepaymentCents === null ? "无法判断" : `合计最低还款 ${formatCents(group.totalMinimumRepaymentCents)}`}</strong>
      </div>
      {isAmalgamated ? (
        <p className="div7a-due-note">
          同一贷款方、借款人、所得年度及相同最高期限的贷款，按 Division 7A 规则作为一笔 amalgamated loan 展示；协议义务仍按每笔贷款独立追踪。最高期限：{group.maximumTermYears} 年。<a href={DIV7A_AMALGAMATED_LOAN_SOURCE_URL} target="_blank" rel="noreferrer">ATO 官方来源</a>
        </p>
      ) : null}
      <div className="div7a-amalgamated-loans">
        {groupLoans.map((loan) => <Div7aLoanCard key={loan.id} loan={loan} onChanged={onChanged} />)}
      </div>
    </section>
  );
}
