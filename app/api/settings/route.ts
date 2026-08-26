import { getSettingsSnapshot, saveSettings } from "@/lib/settings";
import { runMigrations } from "@/lib/db/migrate";

export function GET() {
  try {
    runMigrations();
    return Response.json(getSettingsSnapshot());
  } catch {
    return Response.json({ error: "设置数据暂时不可用" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    runMigrations();
    const body = await request.json();
    return Response.json(saveSettings(body));
  } catch (error) {
    const message = error instanceof Error ? error.message : "设置保存失败";
    const status = message.includes("TFN") || message.includes("Invalid") || message.includes("Entity") || message.includes("Licence")
      ? 400
      : 500;
    return Response.json({ error: message }, { status });
  }
}
