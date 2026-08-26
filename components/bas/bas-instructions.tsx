import { getSimplerBasInstructionSteps } from "@/lib/domain/bas/instructions";

export function BasInstructions({ isNil }: { isNil: boolean }) {
  return (
    <section className="bas-instructions" data-testid="bas-instructions" aria-label="Simpler BAS 操作指引">
      <h2>Simpler BAS 操作指引</h2>
      {isNil ? <p className="bas-nil-note">本期没有已确认交易，请向 ATO 递交 nil activity statement。</p> : null}
      <ol>{getSimplerBasInstructionSteps().map((step) => <li key={step}>{step}</li>)}</ol>
    </section>
  );
}
