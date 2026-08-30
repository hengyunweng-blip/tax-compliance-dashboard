import { CsvMappingWizard } from "@/components/ledger/csv-mapping-wizard";
import { runMigrations } from "@/lib/db/migrate";
import { getRawDb } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export default function ImportPage() {
  runMigrations();
  const db = getRawDb();
  const entities = db.prepare("SELECT id, name FROM entities WHERE active = 1 ORDER BY sort_order").all() as Array<{ id: string; name: string }>;
  const accounts = db.prepare("SELECT id, entity_id AS entityId, code, name, type, default_gst_code AS defaultGstCode FROM accounts WHERE archived = 0 ORDER BY entity_id, code").all() as Array<{ id: number; entityId: string; code: string; name: string; type: string; defaultGstCode: string }>;
  return (
    <main className="ledger-shell">
      <aside className="app-rail" aria-label="主导航"><div className="brand-lockup"><span>税务合规看板</span></div><nav className="app-nav"><a className="nav-item" href="/">看板</a><a className="nav-item" href="/upload">上传</a><a className="nav-item active" href="/import">CSV 导入</a><a className="nav-item" href="/inbox">Inbox</a><a className="nav-item" href="/news">资讯</a><a className="nav-item" href="/settings">设置</a></nav></aside>
      <section className="ledger-content"><header className="ledger-header"><div><p className="page-kicker">Gate 2 · 录入</p><h1>银行 CSV 导入</h1><p>原始金额字符串精确转换为整数分；重复完整行 hash + 日期 + 金额会被标记，不会静默丢弃。</p></div><a className="dashboard-settings-link" href="/inbox">打开 Inbox</a></header><CsvMappingWizard entities={entities} accounts={accounts} /></section>
    </main>
  );
}
