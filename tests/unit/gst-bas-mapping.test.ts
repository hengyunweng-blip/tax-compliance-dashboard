import { expect, test } from "vitest";
import { mapTransactionToBas, summarizeBas } from "@/lib/domain/bas/gst-mapping";

test.each([
  ["GST_INCOME", 110000, 10000, { g1Cents: 110000, a1Cents: 10000, b1Cents: 0, g10Cents: 0, g11Cents: 0 }],
  ["GST_FREE_INCOME", 110000, 0, { g1Cents: 110000, a1Cents: 0, b1Cents: 0, g10Cents: 0, g11Cents: 0 }],
  ["INPUT_TAXED", 90000, 0, { g1Cents: 90000, a1Cents: 0, b1Cents: 0, g10Cents: 0, g11Cents: 0 }],
  ["GST_EXPENSE", -55000, -5000, { g1Cents: 0, a1Cents: 0, b1Cents: 5000, g10Cents: 0, g11Cents: 55000 }],
  ["GST_CAPITAL", -220000, -20000, { g1Cents: 0, a1Cents: 0, b1Cents: 20000, g10Cents: 220000, g11Cents: 0 }],
  ["NO_GST", -10000, 0, { g1Cents: 0, a1Cents: 0, b1Cents: 0, g10Cents: 0, g11Cents: 0 }],
  ["PRIVATE", -10000, 0, { g1Cents: 0, a1Cents: 0, b1Cents: 0, g10Cents: 0, g11Cents: 0 }],
] as const)("maps %s without floating amounts", (gstCode, amountCents, gstCents, expected) => {
  expect(mapTransactionToBas({ gstCode, amountCents, gstCents })).toEqual(expected);
});

test("separates GST net from the manually entered PAYG statement total", () => {
  const summary = summarizeBas([
    { id: 1, entityId: "boyun_co", accountId: 1, reviewFlag: false, gstCode: "GST_INCOME", amountCents: 110000, gstCents: 10000 },
    { id: 2, entityId: "boyun_co", accountId: 2, reviewFlag: false, gstCode: "GST_EXPENSE", amountCents: -55000, gstCents: -5000 },
  ], { payg5aCents: 2500, payg5bCents: 0 });

  expect(summary).toMatchObject({
    g1Cents: 110000,
    a1Cents: 10000,
    b1Cents: 5000,
    g10Cents: 0,
    g11Cents: 55000,
    payg5aCents: 2500,
    payg5bCents: 0,
    paygInstalmentCents: 2500,
    gstNetCents: 5000,
    statementTotalCents: 7500,
    statementType: "payable",
  });
});

test("keeps the statement total unresolved until PAYG is manually entered", () => {
  const summary = summarizeBas([], null);

  expect(summary).toMatchObject({
    g1Cents: 0,
    a1Cents: 0,
    b1Cents: 0,
    g10Cents: 0,
    g11Cents: 0,
    payg5aCents: null,
    payg5bCents: null,
    paygInstalmentCents: null,
    gstNetCents: 0,
    statementTotalCents: null,
    statementType: null,
  });
});

test("subtracts PAYG 5B credits and labels a negative statement as a refund", () => {
  const summary = summarizeBas([
    { id: 1, entityId: "boyun_co", accountId: 1, reviewFlag: false, gstCode: "GST_EXPENSE", amountCents: -55000, gstCents: -5000 },
  ], { payg5aCents: 0, payg5bCents: 1000 });

  expect(summary).toMatchObject({
    gstNetCents: -5000,
    payg5aCents: 0,
    payg5bCents: 1000,
    statementTotalCents: -6000,
    statementType: "refund",
  });
});

test("warns and excludes review or incomplete transactions from BAS totals", () => {
  const summary = summarizeBas([
    { id: 1, entityId: "boyun_co", accountId: 1, reviewFlag: true, gstCode: "GST_INCOME", amountCents: 110000, gstCents: 10000 },
    { id: 2, entityId: null, accountId: 1, reviewFlag: false, gstCode: "GST_INCOME", amountCents: 220000, gstCents: 20000 },
    { id: 3, entityId: "boyun_co", accountId: null, reviewFlag: false, gstCode: "GST_INCOME", amountCents: 330000, gstCents: 30000 },
    { id: 4, entityId: "boyun_co", accountId: 1, reviewFlag: false, gstCode: undefined, amountCents: 440000, gstCents: 40000 },
  ]);

  expect(summary.g1Cents).toBe(0);
  expect(summary.warnings).toHaveLength(4);
});

test("rejects fractional money or an unknown GST code", () => {
  expect(() => mapTransactionToBas({ gstCode: "GST_INCOME", amountCents: 10.5, gstCents: 1 })).toThrow(/integer cents/);
  expect(() => mapTransactionToBas({ gstCode: "NOT_A_CODE", amountCents: 100, gstCents: 0 })).toThrow(/GST code/);
});
