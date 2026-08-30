/**
 * Section 109R screening settings shared by server code and client settings UI.
 * Keep this module free of database/runtime imports so it is safe to bundle in
 * the browser.
 */
export const DIV7A_S109R_WINDOW_SETTING_KEY = "div7a_s109r_window_days";
export const DEFAULT_DIV7A_S109R_WINDOW_DAYS = 30;
export const DIV7A_S109R_SOURCE_URL = "https://www.ato.gov.au/api/public/content/0-4f686e44-3c3f-424f-b3b9-7b8455aefd47";
export const DIV7A_S109R_SOURCE_RETRIEVED_AT = "2026-08-30";
export const DIV7A_S109R_WINDOW_BASIS =
  "内部筛查默认值：还款日前后 30 个日历日；s109R 要求结合全部事实作合理人判断，并没有固定法定窗口。";
