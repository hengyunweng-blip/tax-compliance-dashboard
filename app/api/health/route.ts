import { pingDatabase } from "@/lib/db/client";

export function GET() {
  try {
    pingDatabase();
    return Response.json({ ok: true, database: "connected" });
  } catch {
    return Response.json({ ok: false, database: "unavailable" }, { status: 503 });
  }
}
