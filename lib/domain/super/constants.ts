export const SUPER_SETTING_KEYS = {
  concessionalCapCents: "concessional_cap_cents",
  concessionalCapSourceUrl: "concessional_cap_source_url",
  concessionalCapRetrievedAt: "concessional_cap_retrieved_at",
  carryForwardYears: "concessional_carry_forward_years",
  carryForwardTsbLimitCents: "concessional_carry_forward_tsb_limit_cents",
  carryForwardSourceUrl: "concessional_carry_forward_source_url",
  carryForwardRetrievedAt: "concessional_carry_forward_retrieved_at",
  carryForwardAvailableCents: "concessional_carry_forward_available_cents",
} as const;

export const SUPER_OFFICIAL_SOURCE_URL = "https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/caps-limits-and-tax-on-super-contributions";

export const DEFAULT_SUPER_CONFIGURATION = {
  concessionalCapCents: 3_000_000,
  concessionalCapSourceUrl: SUPER_OFFICIAL_SOURCE_URL,
  concessionalCapRetrievedAt: "2026-08-27",
  carryForwardYears: 5,
  carryForwardTsbLimitCents: 50_000_000,
  carryForwardSourceUrl: SUPER_OFFICIAL_SOURCE_URL,
  carryForwardRetrievedAt: "2026-08-27",
  // The available catch-up amount is person-specific and cannot be inferred
  // from a single cap. Keep it blank until the user enters an ATO record.
  carryForwardAvailableCents: null as number | null,
} as const;
