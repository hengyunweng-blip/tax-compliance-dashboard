import type { DateOnly } from "@/lib/time/melbourne";

export type ObligationStatus = "blocked" | "todo" | "collecting" | "draft_ready" | "lodged" | "paid" | "na";
export type EntityType = "individual" | "trust" | "company";
export type AdjustmentDirection = "forward" | "backward";

export type ObligationEntityInput = {
  id: string;
  type: string;
  gstRegistered: boolean;
  acn: string | null;
  asicReviewDate: DateOnly | null;
};

export type ObligationLicenceInput = {
  anniversaryDate: DateOnly | null;
};

export type ObligationCalculationContext = {
  priorYearReturnOutstanding: boolean;
};

export type ObligationInput = {
  ruleId: string;
  ruleLabel: string;
  entityId: string;
  periodLabel: string;
  scopeKey?: string;
  periodStart: DateOnly | null;
  periodEnd: DateOnly | null;
  incomeYear: string;
  deadlineFy: string;
  statutoryDue: DateOnly | null;
  effectiveDue: DateOnly | null;
  windowOpens?: DateOnly | null;
  status: ObligationStatus;
  portalUrl: string;
  checklist: string[];
  notes?: string;
};

export const RULE_LABELS: Record<string, string> = {
  bas_quarterly: "季度 BAS",
  company_tax_return: "公司税表",
  trust_tax_return: "信托税表",
  individual_tax_return: "个人税表",
  trust_distribution_resolution: "信托分配决议",
  asic_annual_review: "ASIC 年检",
  estate_agent_licence_annual_statement: "牌照年度声明",
  super_contribution: "个人可抵扣供款到账",
  super_notice: "供款抵扣意向通知",
  div7a_loan_agreement: "Div 7A 协议截止义务",
  vic_public_holiday_calendar: "录入次年维州公众假日",
};

export const RULE_ADJUSTMENT_DIRECTIONS: Record<string, AdjustmentDirection> = {
  bas_quarterly: "forward",
  company_tax_return: "forward",
  trust_tax_return: "forward",
  individual_tax_return: "forward",
  trust_distribution_resolution: "backward",
  asic_annual_review: "forward",
  estate_agent_licence_annual_statement: "backward",
  super_contribution: "backward",
  super_notice: "forward",
  div7a_loan_agreement: "forward",
  vic_public_holiday_calendar: "forward",
};

export const RULE_REQUIRED_FIELDS: Record<string, string[]> = {
  bas_quarterly: [],
  company_tax_return: [],
  trust_tax_return: [],
  individual_tax_return: [],
  trust_distribution_resolution: [],
  asic_annual_review: ["asic_review_date"],
  estate_agent_licence_annual_statement: ["anniversary_date"],
  super_contribution: [],
  super_notice: [],
  div7a_loan_agreement: [],
  vic_public_holiday_calendar: [],
};

export const PERIOD_LABELS = {
  bas: (incomeYear: string, quarter: string) => `${incomeYear} ${quarter}`,
  annual: (incomeYear: string) => incomeYear,
};
