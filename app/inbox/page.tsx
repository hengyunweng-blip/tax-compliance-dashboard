import { InboxClient } from "@/components/ledger/inbox-client";
import { getRawDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";

export const dynamic = "force-dynamic";

export default function InboxPage() {
  runMigrations();
  const db = getRawDb();
  const entities = db.prepare("SELECT id, name FROM entities WHERE active = 1 ORDER BY sort_order").all() as Array<{ id: string; name: string }>;
  const accounts = db.prepare("SELECT id, entity_id AS entityId, code, name, type, default_gst_code AS defaultGstCode FROM accounts WHERE archived = 0 ORDER BY entity_id, code").all() as Array<{ id: number; entityId: string; code: string; name: string; type: string; defaultGstCode: string }>;
  return <InboxClient entities={entities} accounts={accounts} />;
}
