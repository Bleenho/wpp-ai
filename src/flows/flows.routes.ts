import { Router } from "express";
import { z } from "zod";
import { systemAuth } from "../auth";
import { ensureFlowConfigs, updateFlowConfig } from "./flow-config.service";

export const flowsRouter = Router();

/** Lista as 5 configs de fluxo do tenant (criando os defaults na 1ª vez). */
flowsRouter.get("/v1/flows", systemAuth, async (req, res) => {
  const tenantRef = String(req.query.tenantRef ?? "");
  if (!tenantRef) {
    res.status(422).json({ error: "tenantRef obrigatório" });
    return;
  }
  const data = await ensureFlowConfigs(req.system!.id, tenantRef);
  res.json({ data });
});

const updateSchema = z.object({
  tenantRef: z.string().min(1),
  flow: z.enum(["CONFIRMATION", "REMINDER", "SALE", "RESCHEDULE", "CANCELLATION"]),
  enabled: z.boolean().optional(),
  messageTpl: z.string().min(1).max(2000).optional(),
  hoursBefore: z.number().int().min(1).max(168).nullable().optional(),
});

/** Atualiza uma config de fluxo (toggle / mensagem / antecedência). */
flowsRouter.put("/v1/flows", systemAuth, async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Dados inválidos", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { tenantRef, ...input } = parsed.data;
  await updateFlowConfig(req.system!.id, tenantRef, input);
  const data = await ensureFlowConfigs(req.system!.id, tenantRef);
  res.json({ data });
});
