import { addDays } from "date-fns";
import { formatDateOnly, parseMelbourneDate, type DateOnly } from "@/lib/time/melbourne";

export type ReminderInstance = {
  obligationId: number;
  fireAt: DateOnly;
  level: "reminder" | "due" | "overdue";
};

export function buildReminderInstances({
  obligationId,
  effectiveDue,
  reminderStart,
  reminderOffsets,
}: {
  obligationId: number;
  effectiveDue: DateOnly;
  reminderStart?: DateOnly;
  reminderOffsets: number[];
}): ReminderInstance[] {
  const anchorDate = reminderStart ?? effectiveDue;
  return reminderOffsets.map((offset) => ({
    obligationId,
    fireAt: formatDateOnly(addDays(parseMelbourneDate(anchorDate), offset)),
    level: reminderStart ? "reminder" : offset === 0 ? "due" : offset > 0 ? "overdue" : "reminder",
  }));
}
