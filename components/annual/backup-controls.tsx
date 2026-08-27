"use client";

import { useState } from "react";

export function BackupControls() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function restore(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    const formData = new FormData();
    formData.set("file", file);
    const response = await fetch("/api/restore", { method: "POST", body: formData });
    const payload = await response.json() as { error?: string };
    setBusy(false);
    setMessage(response.ok ? "备份已还原；请重新加载页面确认数据。" : payload.error ?? "还原失败");
    event.target.value = "";
  }

  return <section className="backup-card" data-testid="backup-controls"><div><p className="page-kicker">本地灾备</p><h2>备份与还原</h2><p>导出包含 SQLite 数据库和 data/files 附件，不包含 .env 文件。还原前会校验清单、路径和必需表。</p></div><div className="backup-actions"><a className="primary-button" href="/api/backup">下载 db + files 备份 ZIP</a><label className="secondary-button backup-file-label"><span>{busy ? "还原中…" : "选择 ZIP 还原"}</span><input type="file" accept=".zip,application/zip" onChange={(event) => void restore(event)} disabled={busy} /></label></div><p className="form-message" aria-live="polite">{message}</p></section>;
}
