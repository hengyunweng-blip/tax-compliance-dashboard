import { expect, test } from "vitest";
import { serializeObligationsToIcs } from "@/lib/domain/obligations/ics";

test("exports a Melbourne all-day event using the effective due date", () => {
  const ics = serializeObligationsToIcs([{
    id: 1,
    entityName: "Boyun Pty Ltd",
    periodLabel: "FY2026-27 Q2",
    ruleLabel: "季度 BAS",
    effectiveDue: "2027-03-01",
    statutoryDue: "2027-02-28",
    windowOpens: null,
    status: "todo",
    portalUrl: "https://www.ato.gov.au/online-services/businesses-and-organisations",
  }]);

  expect(ics).toContain("DTSTART;VALUE=DATE:20270301");
  expect(ics).toContain("Boyun Pty Ltd");
  expect(ics).toContain("法定日: 28 Feb 2027");
  expect(ics).toContain("实际日: 01 Mar 2027");
  expect(ics).not.toContain("20270228T");
});

test("exports the licence window opening date separately from its deadline", () => {
  const ics = serializeObligationsToIcs([{
    id: 2,
    entityName: "self",
    periodLabel: "FY2026-27",
    ruleLabel: "牌照年度声明",
    effectiveDue: "2026-08-14",
    statutoryDue: "2026-08-15",
    windowOpens: "2026-07-04",
    status: "todo",
    portalUrl: "https://my.consumer.vic.gov.au",
  }]);

  expect(ics).toContain("法定日: 15 Aug 2026");
  expect(ics).toContain("窗口开启日: 04 Jul 2026");
});
