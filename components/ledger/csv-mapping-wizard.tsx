"use client";

import { useMemo, useState } from "react";
import { type CsvMapping, type CsvPreview } from "@/lib/ingest/csv";
import { CSV_DATE_FORMATS, DEFAULT_CSV_DATE_FORMAT, parseCsvDate, type CsvDateFormat } from "@/lib/ingest/csv-date";
import { formatDueDate } from "@/lib/time/melbourne";

type Props = {
  entities: Array<{ id: string; name: string }>;
  accounts: Array<{ id: number; entityId: string; code: string; name: string; defaultGstCode: string }>;
};

const emptyMapping: CsvMapping = { date: "", description: "", amount: "", balance: "", counterparty: "", dateFormat: DEFAULT_CSV_DATE_FORMAT };
const mappingFields = ["date", "description", "amount", "balance", "counterparty"] as const;

export function CsvMappingWizard({ entities, accounts }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [bankId, setBankId] = useState("bank-a");
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [mapping, setMapping] = useState<CsvMapping>(emptyMapping);
  const [entityId, setEntityId] = useState(entities.find((entity) => entity.id === "boyun_co")?.id ?? entities[0]?.id ?? "");
  const [accountId, setAccountId] = useState("");
  const [gstCode, setGstCode] = useState("GST_INCOME");
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState<{ created: number; duplicates: number; invalid: number; reviewCount: number } | null>(null);

  const entityAccounts = useMemo(() => accounts.filter((account) => account.entityId === entityId), [accounts, entityId]);

  function updateEntity(value: string) {
    setEntityId(value);
    setAccountId("");
  }

  async function previewFile() {
    if (!file) { setMessage("请先选择 CSV 文件"); return; }
    const formData = new FormData();
    formData.set("file", file);
    setMessage("读取预览中…");
    const response = await fetch("/api/import/csv", { method: "POST", body: formData });
    const payload = await response.json() as { preview?: CsvPreview; error?: string };
    if (!response.ok || !payload.preview) { setMessage(payload.error ?? "CSV 预览失败"); return; }
    setPreview(payload.preview);
    const headers = payload.preview.headers;
    setMapping({
      date: headers.find((header) => /date|日期/i.test(header)) ?? headers[0] ?? "",
      description: headers.find((header) => /narration|description|详情|摘要/i.test(header)) ?? headers[1] ?? "",
      amount: headers.find((header) => /amount|金额/i.test(header)) ?? headers[2] ?? "",
      balance: headers.find((header) => /balance|余额/i.test(header)) ?? "",
      counterparty: headers.find((header) => /payee|counterparty|对手方/i.test(header)) ?? "",
    });
    setMessage("预览已生成，请核对字段后导入");
  }

  async function importFile() {
    if (!file || !preview) { setMessage("请先生成预览"); return; }
    if (!mapping.date || !mapping.description || !mapping.amount || !entityId || !accountId || !gstCode) {
      setMessage("日期、描述、金额、主体、科目和 GST 代码均为必填");
      return;
    }
    try {
      for (const row of preview.rows) {
        parseCsvDate(row[mapping.date] ?? "", mapping.dateFormat ?? DEFAULT_CSV_DATE_FORMAT);
      }
    } catch {
      setMessage("日期无法按所选格式解析，可能选错格式；请检查日期格式后再导入");
      return;
    }
    const formData = new FormData();
    formData.set("file", file);
    formData.set("bankId", bankId);
    formData.set("mapping", JSON.stringify(mapping));
    formData.set("entityId", entityId);
    formData.set("accountId", accountId);
    formData.set("gstCode", gstCode);
    setMessage("导入中…");
    const response = await fetch("/api/import/csv", { method: "POST", body: formData });
    const payload = await response.json() as { summary?: { created: unknown[]; duplicates: unknown[]; invalid: unknown[]; reviewCount: number }; error?: string };
    if (!response.ok || !payload.summary) { setMessage(payload.error ?? "CSV 导入失败"); return; }
    setSummary({ created: payload.summary.created.length, duplicates: payload.summary.duplicates.length, invalid: payload.summary.invalid.length, reviewCount: payload.summary.reviewCount });
    setMessage("导入完成，待确认记录已进入 Inbox");
  }

  return (
    <section className="ledger-upload-card csv-wizard" data-testid="csv-wizard">
      <div className="ledger-card-heading"><div><p className="page-kicker">CSV 入口</p><h2>三步导入</h2><p>上传/预览 → 映射字段 → 选择主体、科目和 GST 代码。</p></div></div>
      <div className="ledger-form-grid">
        <label><span>银行模板名</span><input value={bankId} onChange={(event) => setBankId(event.target.value)} /></label>
        <label className="file-picker-label"><span>CSV 文件</span><input type="file" accept=".csv,text/csv" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); setSummary(null); }} /></label>
      </div>
      <button type="button" className="secondary-button" onClick={previewFile}>1. 生成预览</button>
      {preview ? (
        <>
          <div className="csv-preview"><strong>{preview.totalRows} 行</strong><span>{preview.headers.join(" · ")}</span>{preview.rows.slice(0, 3).map((row, index) => <code key={index}>{JSON.stringify(row)}</code>)}</div>
          <div className="csv-date-preview" aria-label="解析日期预览">
            <strong>解析后日期（DD MMM YYYY）</strong>
            {preview.rows.slice(0, 3).map((row, index) => {
              const rawDate = mapping.date ? row[mapping.date] ?? "" : "";
              let parsedDate = "请选择日期列";
              try {
                if (rawDate) parsedDate = formatDueDate(parseCsvDate(rawDate, mapping.dateFormat ?? DEFAULT_CSV_DATE_FORMAT));
              } catch {
                parsedDate = "无法解析：可能选错格式";
              }
              return <span key={index}><code>{rawDate || "（空）"}</code><span aria-hidden="true"> → </span><time>{parsedDate}</time></span>;
            })}
          </div>
          <div className="ledger-form-grid csv-mapping-grid">
            {mappingFields.map((key) => (
              <label key={key}><span>{key === "date" ? "日期" : key === "description" ? "描述" : key === "amount" ? "金额" : key === "balance" ? "余额（可选）" : "对手方（可选）"}</span><select value={mapping[key] ?? ""} onChange={(event) => setMapping({ ...mapping, [key]: event.target.value })}><option value="">不映射</option>{preview.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>
            ))}
          </div>
          <label className="csv-date-format"><span>日期格式</span><select aria-label="日期格式" value={mapping.dateFormat ?? DEFAULT_CSV_DATE_FORMAT} onChange={(event) => setMapping({ ...mapping, dateFormat: event.target.value as CsvDateFormat })}>{CSV_DATE_FORMATS.map((format) => <option key={format} value={format}>{format}</option>)}</select></label>
          <div className="ledger-form-grid">
            <label><span>主体</span><select value={entityId} onChange={(event) => updateEntity(event.target.value)}>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label>
            <label><span>科目</span><select value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">请选择</option>{entityAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label>
            <label><span>默认 GST 代码</span><select value={gstCode} onChange={(event) => setGstCode(event.target.value)}>{["GST_INCOME", "GST_FREE_INCOME", "INPUT_TAXED", "GST_EXPENSE", "GST_CAPITAL", "NO_GST", "PRIVATE"].map((code) => <option key={code} value={code}>{code}</option>)}</select></label>
          </div>
          <button type="button" className="primary-button" onClick={importFile}>2. 导入并进入 Inbox</button>
        </>
      ) : null}
      <p className="form-message" aria-live="polite">{message}</p>
      {summary ? <div className="import-summary"><span>已创建 {summary.created}</span><span>重复 {summary.duplicates}</span><span>无效 {summary.invalid}</span><span>待确认 {summary.reviewCount}</span></div> : null}
    </section>
  );
}
