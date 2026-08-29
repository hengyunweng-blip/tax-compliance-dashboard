import { z } from "zod";
import { getObligationById } from "@/lib/domain/obligations/repository";
import { transitionObligation } from "@/lib/domain/obligations/state-machine";

const transitionSchema = z.object({
  to: z.enum(["blocked", "todo", "collecting", "draft_ready", "lodged", "paid", "na"]),
  reason: z.string().trim().min(1),
  paidAt: z.string().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const obligationId = Number(id);
    if (!Number.isInteger(obligationId) || obligationId <= 0) {
      return Response.json({ error: "Invalid obligation id" }, { status: 400 });
    }
    const input = transitionSchema.parse(await request.json());
    transitionObligation({ obligationId, to: input.to, reason: input.reason, paidAt: input.paidAt });
    const obligation = getObligationById(obligationId);
    return Response.json({ obligation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "义务状态更新失败";
    return Response.json({ error: message }, { status: 400 });
  }
}
