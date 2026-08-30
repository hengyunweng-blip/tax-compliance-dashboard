import { addDays } from "date-fns";
import { formatDueDate, formatDateOnly, parseMelbourneDate, type DateOnly } from "@/lib/time/melbourne";

export type IcsObligation = {
  id: number;
  entityName: string;
  periodLabel: string;
  ruleLabel: string;
  effectiveDue: DateOnly | null;
  statutoryDue: DateOnly | null;
  windowOpens?: DateOnly | null;
  status: string;
  portalUrl: string;
};

function escapeIcsText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function utcStamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function serializeObligationsToIcs(obligations: IcsObligation[]): string {
  const events = obligations.flatMap((obligation) => {
    const reminderDue = obligation.effectiveDue ?? obligation.statutoryDue;
    if (!reminderDue || !obligation.statutoryDue) {
      return [];
    }
    const endDate = formatDateOnly(addDays(parseMelbourneDate(reminderDue), 1));
    const summary = `${obligation.entityName} · ${obligation.ruleLabel} · ${obligation.periodLabel}`;
    const description = [
      `法定日: ${formatDueDate(obligation.statutoryDue)}`,
      obligation.effectiveDue ? `实际日: ${formatDueDate(obligation.effectiveDue)}` : "工作日校准待配置，按法定日排提醒",
      obligation.windowOpens ? `窗口开启日: ${formatDueDate(obligation.windowOpens)}` : "",
      `状态: ${obligation.status}`,
      obligation.portalUrl ? `入口: ${obligation.portalUrl}` : "",
    ].filter(Boolean).join("\\n");
    return [[
      "BEGIN:VEVENT",
      `UID:tax-compliance-obligation-${obligation.id}@local`,
      `DTSTAMP:${utcStamp()}`,
      `DTSTART;VALUE=DATE:${reminderDue.replace(/-/g, "")}`,
      `DTEND;VALUE=DATE:${endDate.replace(/-/g, "")}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      "END:VEVENT",
    ].join("\r\n")];
  });

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tax Compliance Dashboard//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
