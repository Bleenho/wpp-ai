import { Router } from "express";
import { z } from "zod";
import { systemAuth } from "../auth";
import { connect, status, refresh, disconnect, setAutoReply } from "./instances.service";

export const instancesRouter = Router();

const tenantSchema = z.object({ tenantRef: z.string().min(1) });
const connectSchema = tenantSchema.extend({
  businessName: z.string().optional(),
  timezone: z.string().optional(),
});

/** Conecta (ou reconecta) a instância do tenant e devolve o QR. */
instancesRouter.post("/v1/instances/connect", systemAuth, async (req, res) => {
  const parsed = connectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "tenantRef obrigatório" });
    return;
  }
  try {
    const data = await connect(req.system!.id, parsed.data.tenantRef, {
      businessName: parsed.data.businessName,
      timezone: parsed.data.timezone,
    });
    res.json({ data });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

/** Status da instância. ?refresh=1 sincroniza com a Evolution. */
instancesRouter.get("/v1/instances/status", systemAuth, async (req, res) => {
  const tenantRef = String(req.query.tenantRef ?? "");
  if (!tenantRef) {
    res.status(422).json({ error: "tenantRef obrigatório" });
    return;
  }
  const data =
    req.query.refresh === "1"
      ? await refresh(req.system!.id, tenantRef)
      : await status(req.system!.id, tenantRef);
  res.json({ data });
});

/** Liga/desliga o atendimento automático (responder mensagens recebidas). */
instancesRouter.put("/v1/instances/auto-reply", systemAuth, async (req, res) => {
  const parsed = z.object({ tenantRef: z.string().min(1), autoReply: z.boolean() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "tenantRef e autoReply obrigatórios" });
    return;
  }
  await setAutoReply(req.system!.id, parsed.data.tenantRef, parsed.data.autoReply);
  res.json({ data: { ok: true } });
});

/** Desconecta a instância do tenant. */
instancesRouter.delete("/v1/instances", systemAuth, async (req, res) => {
  const parsed = tenantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "tenantRef obrigatório" });
    return;
  }
  await disconnect(req.system!.id, parsed.data.tenantRef);
  res.json({ data: { ok: true } });
});
