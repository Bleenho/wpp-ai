import { Router } from "express";
import { z } from "zod";
import { adminAuth } from "../auth";
import { prisma } from "../db";
import { ensureFlowConfigs, updateFlowConfig } from "../flows/flow-config.service";
import { setAutoReply } from "../instances/instances.service";

/**
 * Rotas de ADMIN (painel da plataforma). Tudo protegido por x-admin-key.
 * Visão entre todos os sistemas/instâncias + edição de fluxos por (sistema, tenant).
 */
export const adminRouter = Router();

/** Lista todas as instâncias (conexões) com status, de todos os sistemas. */
adminRouter.get("/admin/instances", adminAuth, async (_req, res) => {
  const rows = await prisma.instance.findMany({
    select: {
      systemId: true,
      tenantRef: true,
      instanceName: true,
      status: true,
      phoneNumber: true,
      businessName: true,
      autoReply: true,
      system: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({
    data: rows.map((r) => ({
      systemId: r.systemId,
      systemName: r.system.name,
      tenantRef: r.tenantRef,
      instanceName: r.instanceName,
      status: r.status,
      phoneNumber: r.phoneNumber,
      businessName: r.businessName,
      autoReply: r.autoReply,
    })),
  });
});

/** Liga/desliga o atendimento automático (responder mensagens) de um tenant. */
adminRouter.put("/admin/instances/auto-reply", adminAuth, async (req, res) => {
  const parsed = z
    .object({ systemId: z.string().min(1), tenantRef: z.string().min(1), autoReply: z.boolean() })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "systemId, tenantRef e autoReply obrigatórios" });
    return;
  }
  await setAutoReply(parsed.data.systemId, parsed.data.tenantRef, parsed.data.autoReply);
  res.json({ data: { ok: true } });
});

/** Configs de fluxo de um (sistema, tenant) — cria os defaults se faltar. */
adminRouter.get("/admin/flows", adminAuth, async (req, res) => {
  const systemId = String(req.query.systemId ?? "");
  const tenantRef = String(req.query.tenantRef ?? "");
  if (!systemId || !tenantRef) {
    res.status(422).json({ error: "systemId e tenantRef obrigatórios" });
    return;
  }
  res.json({ data: await ensureFlowConfigs(systemId, tenantRef) });
});

const putSchema = z.object({
  systemId: z.string().min(1),
  tenantRef: z.string().min(1),
  flow: z.enum(["CONFIRMATION", "REMINDER", "SALE", "RESCHEDULE", "CANCELLATION"]),
  enabled: z.boolean().optional(),
  messageTpl: z.string().min(1).max(2000).optional(),
  hoursBefore: z.number().int().min(1).max(168).nullable().optional(),
});

/** Atualiza um fluxo de um (sistema, tenant). */
adminRouter.put("/admin/flows", adminAuth, async (req, res) => {
  const parsed = putSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Dados inválidos", details: parsed.error.flatten() });
    return;
  }
  const { systemId, tenantRef, ...input } = parsed.data;
  await updateFlowConfig(systemId, tenantRef, input);
  res.json({ data: await ensureFlowConfigs(systemId, tenantRef) });
});
