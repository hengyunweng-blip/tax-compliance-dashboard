/**
 * Section 109R screening settings shared by server code and client settings UI.
 * Keep this module free of database/runtime imports so it is safe to bundle in
 * the browser.
 */
export const DIV7A_S109R_WINDOW_SETTING_KEY = "div7a_s109r_window_days";
export const DEFAULT_DIV7A_S109R_WINDOW_DAYS = 30;
export const DIV7A_S109R_WINDOW_BASIS =
  "Internal screening default only: 30 calendar days around a repayment; s109R requires a reasonable-person assessment of the surrounding facts, not a fixed statutory window.";
