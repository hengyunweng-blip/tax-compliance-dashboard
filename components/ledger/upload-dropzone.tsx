"use client";

import { useState } from "react";

type Props = {
  entities: Array<{ id: string; name: string }>;
};

export function UploadDropzone({ entities }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [entityId, setEntityId] = useState(entities.find((entity) => entity.id === "boyun_co")?.id ?? entities[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [uploaded, setUploaded] = useState<Array<{ id: number; filename: string | null; duplicate: boolean }>>([]);

  async function submit() {
    if (!files.length) {
      setMessage("请选择 PDF 或图片文件");
      return;
    }
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    if (entityId) formData.set("entityId", entityId);
    setMessage("上传中…");
    const response = await fetch("/api/documents", { method: "POST", body: formData });
    const payload = await response.json() as { documents?: Array<{ id: number; filename: string | null; duplicate: boolean }>; error?: string };
    if (!response.ok) {
      setMessage(payload.error ?? "上传失败");
      return;
    }
    setUploaded(payload.documents ?? []);
    setMessage(`已接收 ${payload.documents?.length ?? 0} 个文件，等待 Inbox 确认`);
    setFiles([]);
  }

  return (
    <section className="ledger-upload-card" data-testid="upload-dropzone">
      <div className="ledger-card-heading">
        <div>
          <p className="page-kicker">文件入口</p>
          <h2>上传凭证</h2>
          <p>支持 PDF、JPG、PNG、WEBP；文件会按 SHA-256 去重并进入人工 Inbox。</p>
        </div>
      </div>
      <div className="ledger-form-grid">
        <label>
          <span>归属主体</span>
          <select value={entityId} onChange={(event) => setEntityId(event.target.value)}>
            {entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}
          </select>
        </label>
        <label className="file-picker-label">
          <span>选择文件</span>
          <input
            type="file"
            multiple
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          />
        </label>
      </div>
      <div className="upload-file-list" aria-live="polite">
        {files.length ? files.map((file) => <span key={`${file.name}-${file.size}`}>{file.name}</span>) : <span>尚未选择文件</span>}
      </div>
      <button type="button" className="primary-button" onClick={submit}>上传并进入 Inbox</button>
      <p className="form-message" aria-live="polite">{message}</p>
      {uploaded.length ? (
        <ul className="upload-result-list">
          {uploaded.map((document) => <li key={document.id}>{document.filename ?? `文档 #${document.id}`} {document.duplicate ? "（重复，未重复写入）" : "（待确认）"}</li>)}
        </ul>
      ) : null}
    </section>
  );
}
