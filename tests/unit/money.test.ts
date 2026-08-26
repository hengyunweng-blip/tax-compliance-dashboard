import { expect, test } from "vitest";
import { formatCents, parseMoneyToCents } from "@/lib/money";

test.each([
  ["0", 0],
  ["12", 1200],
  ["12.3", 1230],
  ["12.34", 1234],
  ["-12.34", -1234],
])("parses %s as integer cents", (input, expected) => {
  expect(parseMoneyToCents(input)).toBe(expected);
});

test.each(["1.234", "AUD 1", "", "1e3", "NaN"])("rejects unsafe money string %s", (input) => {
  expect(() => parseMoneyToCents(input)).toThrow();
});

test("formats integer cents without introducing a fractional money value", () => {
  expect(formatCents(123456)).toBe("$1,234.56");
});
