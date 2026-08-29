import { z } from "zod";
import { listBenchmarkRates, saveBenchmarkRate } from "@/lib/domain/div7a/rates";

export const dynamic = "force-dynamic";

const rateSchema = z.object({
  incomeYear: z.string().min(1),
  rateText: z.string().min(1),
  sourceUrl: z.string().url(),
  retrievedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().nullable().optional(),
}).strict();

export function GET() {
  try {
    return Response.json({ rates: listBenchmarkRates() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Div 7A 利率暂时不可用" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const parsed = rateSchema.parse(await request.json());
    saveBenchmarkRate(parsed);
    return Response.json({ rates: listBenchmarkRates() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Div 7A 利率保存失败" }, { status: 400 });
  }
}
