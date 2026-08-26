export const SIMPLER_BAS_INSTRUCTION_STEPS = [
  "登录 ATO Online services for business",
  "选择公司 → Lodgments → Activity statements",
  "在活动申报表填写 G1、1A、1B",
  "核对 ATO 预填的 5A/5B PAYG instalment",
  "提交后记录 ATO 回执号",
] as const;

export function getSimplerBasInstructionSteps() {
  return [...SIMPLER_BAS_INSTRUCTION_STEPS];
}
