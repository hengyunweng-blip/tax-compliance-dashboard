export const SUPER_SETTING_KEYS = {
  carryForwardYears: "concessional_carry_forward_years",
  carryForwardTsbLimitCents: "concessional_carry_forward_tsb_limit_cents",
  carryForwardSourceUrl: "concessional_carry_forward_source_url",
  carryForwardRetrievedAt: "concessional_carry_forward_retrieved_at",
  carryForwardAvailableCents: "concessional_carry_forward_available_cents",
} as const;

export const SUPER_CONCESSIONAL_SOURCE_URL = "https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/caps-limits-and-tax-on-super-contributions/concessional-contributions-cap";
export const SUPER_NON_CONCESSIONAL_SOURCE_URL = "https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/caps-limits-and-tax-on-super-contributions/non-concessional-contributions-cap";
export const SUPER_OFFICIAL_SOURCE_URL = "https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/caps-limits-and-tax-on-super-contributions";

export type SuperCapSeed = {
  incomeYear: string;
  concessionalCapCents: number;
  nonConcessionalCapCents: number;
  concessionalSourceUrl: string;
  concessionalRetrievedAt: string;
  nonConcessionalSourceUrl: string;
  nonConcessionalRetrievedAt: string;
};

// ATO caps table read on 29 Aug 2026 (Australia/Melbourne). Values are kept
// per income year so carry-forward calculations never reuse today's cap for a
// historical year.
export const SUPER_CAP_SEEDS: SuperCapSeed[] = [
  { incomeYear: "2021-22", concessionalCapCents: 2_750_000, nonConcessionalCapCents: 11_000_000, concessionalSourceUrl: SUPER_CONCESSIONAL_SOURCE_URL, concessionalRetrievedAt: "2026-08-29", nonConcessionalSourceUrl: SUPER_NON_CONCESSIONAL_SOURCE_URL, nonConcessionalRetrievedAt: "2026-08-29" },
  { incomeYear: "2022-23", concessionalCapCents: 2_750_000, nonConcessionalCapCents: 11_000_000, concessionalSourceUrl: SUPER_CONCESSIONAL_SOURCE_URL, concessionalRetrievedAt: "2026-08-29", nonConcessionalSourceUrl: SUPER_NON_CONCESSIONAL_SOURCE_URL, nonConcessionalRetrievedAt: "2026-08-29" },
  { incomeYear: "2023-24", concessionalCapCents: 2_750_000, nonConcessionalCapCents: 11_000_000, concessionalSourceUrl: SUPER_CONCESSIONAL_SOURCE_URL, concessionalRetrievedAt: "2026-08-29", nonConcessionalSourceUrl: SUPER_NON_CONCESSIONAL_SOURCE_URL, nonConcessionalRetrievedAt: "2026-08-29" },
  { incomeYear: "2024-25", concessionalCapCents: 3_000_000, nonConcessionalCapCents: 12_000_000, concessionalSourceUrl: SUPER_CONCESSIONAL_SOURCE_URL, concessionalRetrievedAt: "2026-08-29", nonConcessionalSourceUrl: SUPER_NON_CONCESSIONAL_SOURCE_URL, nonConcessionalRetrievedAt: "2026-08-29" },
  { incomeYear: "2025-26", concessionalCapCents: 3_000_000, nonConcessionalCapCents: 12_000_000, concessionalSourceUrl: SUPER_CONCESSIONAL_SOURCE_URL, concessionalRetrievedAt: "2026-08-29", nonConcessionalSourceUrl: SUPER_NON_CONCESSIONAL_SOURCE_URL, nonConcessionalRetrievedAt: "2026-08-29" },
  { incomeYear: "2026-27", concessionalCapCents: 3_250_000, nonConcessionalCapCents: 13_000_000, concessionalSourceUrl: SUPER_CONCESSIONAL_SOURCE_URL, concessionalRetrievedAt: "2026-08-29", nonConcessionalSourceUrl: SUPER_NON_CONCESSIONAL_SOURCE_URL, nonConcessionalRetrievedAt: "2026-08-29" },
];

export const DEFAULT_SUPER_CONFIGURATION = {
  carryForwardYears: 5,
  carryForwardTsbLimitCents: 50_000_000,
  carryForwardSourceUrl: SUPER_OFFICIAL_SOURCE_URL,
  carryForwardRetrievedAt: "2026-08-27",
  // The available catch-up amount is person-specific and cannot be inferred
  // from a single cap. Keep it blank until the user enters an ATO record.
  carryForwardAvailableCents: null as number | null,
} as const;
