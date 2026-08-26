import { UploadDropzone } from "@/components/ledger/upload-dropzone";
import { runMigrations } from "@/lib/db/migrate";
import { getSettingsSnapshot } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default function UploadPage() {
  runMigrations();
  const snapshot = getSettingsSnapshot();
  return (
    <main className="ledger-shell">
      <aside className="app-rail" aria-label="主导航">
        <div className="brand-lockup"><span>税务合规看板</span></div>
        <nav className="app-nav">
          <a className="nav-item" href="/">看板</a>
          <a className="nav-item active" href="/upload">上传</a>
          <a className="nav-item" href="/import">CSV 导入</a>
          <a className="nav-item" href="/inbox">Inbox</a>
          <a className="nav-item" href="/settings">设置</a>
        </nav>
      </aside>
      <section className="ledger-content">
        <header className="ledger-header">
          <div><p className="page-kicker">Gate 2 · 录入</p><h1>上传与邮箱转发</h1><p>上传页只负责接收文件；分类、主体、科目和 GST 代码在 Inbox 人工确认。</p></div>
          <a className="dashboard-settings-link" href="/inbox">打开 Inbox</a>
        </header>
        <UploadDropzone entities={snapshot.entities.filter((entity) => entity.active).map(({ id, name }) => ({ id, name }))} />
        <section className="ledger-info-card">
          <h2>邮箱转发入口</h2>
          <p><code>POST /api/ingest/email</code> 接受 multipart 附件或 JSON base64 附件，服务端用 <code>INGEST_TOKEN</code> 校验后写入同一份 Inbox。</p>
          <p>未确认的文档不会自动变成交易，也不会进入 BAS 候选。</p>
        </section>
      </section>
    </main>
  );
}
