import crypto from "node:crypto";

const TFN_PATTERN = /\b\d{3}(?:[ -]?\d{3}){2}\b/g;
const BANK_DETAILS_PATTERN = /\b(?:bsb\s*[:#-]?\s*\d{3}[ -]?\d{3}\s*[,;]?\s*)?(?:account|a\/c)\s*(?:number|no\.?)?\s*[:#-]?\s*\d{6,10}\b/gi;
const BSB_PATTERN = /\bbsb\s*[:#-]?\s*\d{3}[ -]?\d{3}\b/gi;
const ADDRESS_PATTERN = /\b\d{1,5}\s+[A-Za-z][A-Za-z0-9.'-]*(?:\s+[A-Za-z][A-Za-z0-9.'-]*){0,8}\s+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Lane|Ln|Place|Pl|Boulevard|Blvd|Crescent|Cres)\.?\s*(?:,\s*[A-Za-z][A-Za-z .'-]*)?(?:\s+(?:VIC|NSW|QLD|SA|WA|TAS|NT|ACT)\s+\d{4})?/gi;

export function redactSensitiveText(input: string) {
  return input
    .replace(BANK_DETAILS_PATTERN, "[REDACTED_BANK_ACCOUNT]")
    .replace(BSB_PATTERN, "[REDACTED_BSB]")
    .replace(TFN_PATTERN, "[REDACTED_TFN]")
    .replace(ADDRESS_PATTERN, "[REDACTED_ADDRESS]");
}

function sensitiveKey(key: string) {
  const normalized = key.toLowerCase().replace(/[^a-z]/g, "");
  if (normalized.includes("tfn") || normalized.includes("taxfilenumber")) return "[REDACTED_TFN]";
  if (normalized.includes("bank") || normalized.includes("accountnumber") || normalized === "account") return "[REDACTED_BANK_ACCOUNT]";
  if (normalized.includes("address") || normalized.includes("streetaddress")) return "[REDACTED_ADDRESS]";
  return null;
}

export function redactSensitiveValue(input: unknown): unknown {
  if (typeof input === "string") return redactSensitiveText(input);
  if (Array.isArray(input)) return input.map((item) => redactSensitiveValue(item));
  if (!input || typeof input !== "object") return input;
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, sensitiveKey(key) ?? redactSensitiveValue(value)]));
}

function canonicalValue(input: unknown): unknown {
  if (Array.isArray(input)) return input.map((item) => canonicalValue(item));
  if (input && typeof input === "object") {
    return Object.fromEntries(Object.entries(input).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => [key, canonicalValue(value)]));
  }
  return input;
}

export function canonicalRedactedJson(input: unknown) {
  return JSON.stringify(canonicalValue(redactSensitiveValue(input)));
}

export function hashRedactedInput(input: unknown) {
  return crypto.createHash("sha256").update(canonicalRedactedJson(input)).digest("hex");
}
