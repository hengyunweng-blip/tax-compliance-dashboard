const MONEY_PATTERN = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/;

function assertSafeCents(value: number) {
  if (!Number.isSafeInteger(value)) {
    throw new Error("Money must be a safe integer number of cents");
  }
}

export function parseMoneyToCents(input: string): number {
  if (typeof input !== "string") {
    throw new Error("Money input must be a string");
  }

  const normalized = input.trim();
  const match = MONEY_PATTERN.exec(normalized);
  if (!match) {
    throw new Error(`Invalid money value: ${input}`);
  }

  const [, sign, wholePart, fractionPart = ""] = match;
  const cents = BigInt(wholePart) * 100n + BigInt(fractionPart.padEnd(2, "0"));
  const signedCents = sign === "-" ? -cents : cents;
  const numericCents = Number(signedCents);
  assertSafeCents(numericCents);
  return numericCents;
}

export function formatCents(cents: number): string {
  assertSafeCents(cents);
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function assertIntegerCents(value: number): asserts value is number {
  assertSafeCents(value);
}
