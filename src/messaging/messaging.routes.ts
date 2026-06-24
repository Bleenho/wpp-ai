import { Router } from "express";
import { z } from "zod";
import { systemAuth } from "../auth";
import { sendFlowMessage } from "./messaging.service";

export const messagingRouter = Router();

const sendSchema = z.object({
  flow: z.enum(["CONFIRMATION", "REMINDER"]),
  tenantRef: z.string().min(1),
  clientPhone: z.string().min(10),
  clientId: z.string().optional(),
  bookingId: z.string().optional(),
  vars: z.record(z.string()).default({}),
});

/**
 * Disparo de saída (o sistema decide QUANDO, via seu cron, e passa as variáveis).
 * O wpp-ai renderiza o template salvo e envia; para CONFIRMATION abre a conversa.
 */
messagingRouter.post("/v1/messages", systemAuth, async (req, res) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Dados inválidos", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const data = await sendFlowMessage(req.system!.id, parsed.data);
  res.json({ data });
});
