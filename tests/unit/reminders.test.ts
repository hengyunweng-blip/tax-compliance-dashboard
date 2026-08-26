import { expect, test } from "vitest";
import { buildReminderInstances } from "@/lib/domain/obligations/reminders";

test("builds Melbourne-local reminder dates from the effective due date", () => {
  expect(buildReminderInstances({
    obligationId: 42,
    effectiveDue: "2026-11-11",
    reminderOffsets: [-30, -10, -3, 0],
  })).toEqual([
    { obligationId: 42, fireAt: "2026-10-12", level: "reminder" },
    { obligationId: 42, fireAt: "2026-11-01", level: "reminder" },
    { obligationId: 42, fireAt: "2026-11-08", level: "reminder" },
    { obligationId: 42, fireAt: "2026-11-11", level: "due" },
  ]);
});

test("starts licence reminders from the window opening date", () => {
  expect(buildReminderInstances({
    obligationId: 43,
    effectiveDue: "2026-08-14",
    reminderStart: "2026-07-04",
    reminderOffsets: [0, 7, 14, 21],
  }).map((reminder) => reminder.fireAt)).toEqual([
    "2026-07-04",
    "2026-07-11",
    "2026-07-18",
    "2026-07-25",
  ]);
});
