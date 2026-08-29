import { SettingsForm } from "@/components/settings/entity-config-form";
import { runMigrations } from "@/lib/db/migrate";
import { listBenchmarkRates } from "@/lib/domain/div7a/rates";
import { getSettingsSnapshot } from "@/lib/settings";

export default function SettingsPage() {
  runMigrations();
  const snapshot = getSettingsSnapshot();
  const benchmarkRates = listBenchmarkRates();

  return <SettingsForm initialSnapshot={{ ...snapshot, benchmarkRates }} />;
}
