import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

export default function VehicleFactChecklistPage() {
  const documentPath = path.resolve(process.cwd(), "docs/vehicle-fact-checklist.md");
  const contents = fs.readFileSync(documentPath, "utf8");
  return (
    <main className="standalone-document-shell">
      <article className="standalone-document">
        <p className="page-kicker">车辆事实清单</p>
        <pre>{contents}</pre>
      </article>
    </main>
  );
}
