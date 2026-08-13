import { Router } from "express";
import { z } from "zod";
import { systemAuth } from "../auth";
import { sendFlowMessage, sendTextMessage } from "./messaging.service";

export const messagingRouter = Router();

const sendTextSchema = z.object({
  tenantRef: z.string().min(1),
  clientPhone: z.string().min(10),
  text: z.string().min(1).max(4000),
  idempotencyKey: z.string().min(1).max(200).optional(),
});

const sendSchema = z.object({
  flow: z.enum(["CONFIRMATION", "REMINDER", "BIRTHDAY"]),
  tenantRef: z.string().min(1),
  clientPhone: z.string().min(10),
  clientId: z.string().optional(),
  bookingId: z.string().optional(),
  bookingStartIso: z.string().datetime().optional(),
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

/**
 * Disparo de texto livre: o sistema manda a mensagem já montada. Sem template e
 * sem fluxo — é o caminho para campanhas (cobrança, avisos) em que cada
 * destinatário recebe um texto diferente.
 *
 * ATENÇÃO: não há espaçamento entre destinatários DIFERENTES aqui (o throttle do
 * `guardedSend` é por destinatário). Quem dispara em lote precisa impor o próprio
 * ritmo, sob pena de queimar o número.
 */
messagingRouter.post("/v1/messages/text", systemAuth, async (req, res) => {
  const parsed = sendTextSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Dados inválidos", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const data = await sendTextMessage(req.system!.id, parsed.data);
  res.json({ data });
});
