import { formatCents } from "@/lib/money";
import { formatDueDate } from "@/lib/time/melbourne";
import { getRawDb } from "@/lib/db/client";
import { getBasWorksheetById } from "@/lib/domain/bas/generator";
import { displayBasPeriodLabel, summarizePriorPeriodCorrections } from "@/lib/domain/bas/correction-summary";

function csvEscape(value: string | number | null) {
  const text = value === null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function exportBasCsv(worksheetId: number): Response {
  const worksheet = getBasWorksheetById(worksheetId);
  if (!worksheet) return Response.json({ error: "BAS 底稿不存在" }, { status: 404 });
  const correctionSummary = summarizePriorPeriodCorrections(worksheet.lines);
  const headers = ["transaction_id", "date", "description", "amount_cents", "gst_cents", "gst_code", "g1_cents", "a1_cents", "b1_cents", "g10_cents", "g11_cents", "line_type", "original_period", "original_worksheet_id"];
  const lines = worksheet.lines.map((line) => [
    line.transactionId,
    formatDueDate(line.date),
    line.description,
    line.amountCents,
    line.gstCents,
    line.gstCode,
    line.g1Cents,
    line.a1Cents,
    line.b1Cents,
    line.g10Cents,
    line.g11Cents,
    line.isPriorPeriodCorrection ? "前期更正" : "普通交易",
    line.originalPeriodLabel ? displayBasPeriodLabel(line.originalPeriodLabel) : "",
    line.originalWorksheetId ? `worksheet #${line.originalWorksheetId}` : "",
  ].map(csvEscape).join(","));
  lines.push(["SUMMARY", "", "", "", "", "", worksheet.g1Cents, worksheet.a1Cents, worksheet.b1Cents, worksheet.g10Cents, worksheet.g11Cents, "", "", ""].map(csvEscape).join(","));
  if (correctionSummary.count) {
    const periods = correctionSummary.periodLabels.map(displayBasPeriodLabel).join("、");
    const text = `本期含 ${correctionSummary.count} 笔前期更正，合计 ${formatCents(correctionSummary.totalAmountCents)}，原属期间 ${periods}`;
    lines.push(["CORRECTION_SUMMARY", "", text, "", "", "", "", "", "", "", "", "前期更正", periods, correctionSummary.worksheetIds.join("、")].map(csvEscape).join(","));
  }
  return new Response(`${headers.join(",")}\r\n${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bas-worksheet-${worksheetId}.csv"`,
    },
  });
}

function pdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/[()]/g, (character) => `\\${character}`).replace(/[^\x20-\x7E]/g, "?");
}

function buildOnePagePdf(lines: string[]) {
  const content = [
    "BT",
    "/F1 10 Tf",
    ...lines.map((line, index) => `1 0 0 1 48 ${790 - index * 17} Tm (${pdfText(line)}) Tj`),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "ascii")} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "ascii");
}

export function exportBasPdf(worksheetId: number): Response {
  const worksheet = getBasWorksheetById(worksheetId);
  if (!worksheet) return Response.json({ error: "BAS 底稿不存在" }, { status: 404 });
  const context = getRawDb().prepare(`
    SELECT o.period_label, o.income_year, o.statutory_due, o.effective_due,
      e.name AS entity_name
    FROM bas_worksheets w
    INNER JOIN obligations o ON o.id = w.obligation_id
    INNER JOIN entities e ON e.id = o.entity_id
    WHERE w.id = ?
  `).get(worksheetId) as {
    period_label: string;
    income_year: string;
    statutory_due: string | null;
    effective_due: string | null;
    entity_name: string;
  } | undefined;
  if (!context) return Response.json({ error: "BAS 义务不存在" }, { status: 404 });
  const quarter = context.period_label.split(" ").at(-1) ?? context.period_label;
  const correctionSummary = summarizePriorPeriodCorrections(worksheet.lines);
  const correctionPeriods = correctionSummary.periodLabels.map((period) => displayBasPeriodLabel(period).replace("–", "-")).join(", ");
  const lines = [
    "BAS WORKSHEET",
    `${context.entity_name} - ${context.income_year} ${quarter}`,
    `Statutory due: ${context.statutory_due ? formatDueDate(context.statutory_due as `${number}-${number}-${number}`) : "Not configured"}`,
    `Effective due: ${context.effective_due ? formatDueDate(context.effective_due as `${number}-${number}-${number}`) : "Not configured"}`,
    "",
    `G1: ${formatCents(worksheet.g1Cents)}    1A: ${formatCents(worksheet.a1Cents)}    1B: ${formatCents(worksheet.b1Cents)}`,
    `G10 internal only: ${formatCents(worksheet.g10Cents)}`,
    `G11 internal only: ${formatCents(worksheet.g11Cents)}`,
    `GST net: ${formatCents(worksheet.gstNetCents)}`,
    `PAYG 5A payable: ${worksheet.payg5aCents === null ? "Not entered" : formatCents(worksheet.payg5aCents)}`,
    `PAYG 5B credit: ${worksheet.payg5bCents === null ? "Not entered" : formatCents(worksheet.payg5bCents)}`,
    `PAYG instalment net (5A - 5B): ${worksheet.paygInstalmentCents === null ? "Not entered" : formatCents(worksheet.paygInstalmentCents)}`,
    `Statement total (${worksheet.statementType === "refund" ? "refund" : "payable"}): ${worksheet.statementTotalCents === null ? "Not resolved" : formatCents(worksheet.statementTotalCents)}`,
    ...(correctionSummary.count ? [`Prior-period corrections: ${correctionSummary.count} transaction(s), total ${formatCents(correctionSummary.totalAmountCents)}, originally ${correctionPeriods}`] : []),
    "",
    "Simpler BAS instructions: enter G1, 1A and 1B only.",
    worksheet.isNil ? "Nil BAS: lodge a nil activity statement." : `Traceable transaction lines: ${worksheet.lines.length}`,
    ...worksheet.lines.slice(0, 25).map((line) => line.isPriorPeriodCorrection
      ? `Prior-period correction | Transaction #${line.transactionId} | ${formatDueDate(line.date)} | ${line.originalPeriodLabel ? displayBasPeriodLabel(line.originalPeriodLabel).replace("–", "-") : "period unknown"} | worksheet #${line.originalWorksheetId ?? "unknown"} | ${line.gstCode} | ${formatCents(line.amountCents)}`
      : `Transaction #${line.transactionId} ${formatDueDate(line.date)} ${line.gstCode} ${formatCents(line.amountCents)}`),
  ];
  const pdf = buildOnePagePdf(lines.slice(0, 45));
  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="bas-worksheet-${worksheetId}.pdf"`,
    },
  });
}
