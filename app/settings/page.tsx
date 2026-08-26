import { SettingsForm } from "@/components/settings/entity-config-form";
import { runMigrations } from "@/lib/db/migrate";
import { getSettingsSnapshot } from "@/lib/settings";

export default function SettingsPage() {
  runMigrations();
  const snapshot = getSettingsSnapshot();

  return <SettingsForm initialSnapshot={snapshot} />;
}
