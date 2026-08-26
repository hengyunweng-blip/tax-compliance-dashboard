import { formatDateOnly, parseMelbourneDate, type DateOnly } from "@/lib/time/melbourne";

export const CSV_DATE_FORMATS = ["DD/MM/YYYY", "YYYY-MM-DD", "MM/DD/YYYY"] as const;
export type CsvDateFormat = (typeof CSV_DATE_FORMATS)[number];
export const DEFAULT_CSV_DATE_FORMAT: CsvDateFormat = "DD/MM/YYYY";

function isCsvDateFormat(value: string): value is CsvDateFormat {
  return CSV_DATE_FORMATS.includes(value as CsvDateFormat);
}

export function parseCsvDate(value: string, dateFormat: CsvDateFormat = DEFAULT_CSV_DATE_FORMAT): DateOnly {
  const trimmed = value.trim();
  if (!isCsvDateFormat(dateFormat)) {
    throw new Error(`Unsupported CSV date format: ${dateFormat}`);
  }

  let year: number;
  let month: number;
  let day: number;
  if (dateFormat === "YYYY-MM-DD") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (!match) throw new Error(`Invalid date "${value}" for ${dateFormat}; date format may be incorrect`);
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
    if (!match) throw new Error(`Invalid date "${value}" for ${dateFormat}; date format may be incorrect`);
    year = Number(match[3]);
    month = Number(dateFormat === "DD/MM/YYYY" ? match[2] : match[1]);
    day = Number(dateFormat === "DD/MM/YYYY" ? match[1] : match[2]);
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`Invalid date "${value}" for ${dateFormat}; date format may be incorrect`);
  }
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` as DateOnly;
  try {
    if (formatDateOnly(parseMelbourneDate(date)) === date) return date;
  } catch {
    // Fall through to the format-specific error below.
  }
  throw new Error(`Invalid date "${value}" for ${dateFormat}; date format may be incorrect`);
}
