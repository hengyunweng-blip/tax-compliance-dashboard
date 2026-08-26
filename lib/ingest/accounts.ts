import { getRawDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import type { GstCode } from "@/lib/constants/gst";

export type Account = {
  id: number;
  entityId: string;
  code: string;
  name: string;
  type: string;
  defaultGstCode: GstCode;
  archived: boolean;
};

type AccountRow = {
  id: number;
  entity_id: string;
  code: string;
  name: string;
  type: string;
  default_gst_code: GstCode;
  archived: number;
};

function mapAccount(row: AccountRow): Account {
  return {
    id: row.id,
    entityId: row.entity_id,
    code: row.code,
    name: row.name,
    type: row.type,
    defaultGstCode: row.default_gst_code,
    archived: Boolean(row.archived),
  };
}

export function listAccounts(entityId?: string): Account[] {
  runMigrations();
  const rows = entityId
    ? getRawDb().prepare("SELECT * FROM accounts WHERE entity_id = ? AND archived = 0 ORDER BY code").all(entityId)
    : getRawDb().prepare("SELECT * FROM accounts WHERE archived = 0 ORDER BY entity_id, code").all();
  return (rows as AccountRow[]).map(mapAccount);
}

export function getAccountByCode(entityId: string, code: string): Account | null {
  runMigrations();
  const row = getRawDb().prepare("SELECT * FROM accounts WHERE entity_id = ? AND code = ? AND archived = 0").get(entityId, code) as AccountRow | undefined;
  return row ? mapAccount(row) : null;
}
