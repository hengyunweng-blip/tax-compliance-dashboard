export function displayIncomeYear(value: string) {
  return value.trim().replace(/^FY/, "FY").replace("-", "–");
}
