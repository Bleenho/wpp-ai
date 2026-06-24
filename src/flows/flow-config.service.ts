import type { Flow } from "@prisma/client";
import { prisma } from "../db";

export const WA_FLOWS: Flow[] = ["CONFIRMATION", "REMINDER", "SALE", "RESCHEDULE", "CANCELLATION"];

interface FlowDefault {
  messageTpl: string;
  hoursBefore: number | null;
}

export const FLOW_DEFAULTS: Record<Flow, FlowDefault> = {
  CONFIRMATION: {
    messageTpl:
      "Olá, {cliente}! Confirmando seu horário no {negocio}: {data} às {hora} — {servico} com {profissional}.",
    hoursBefore: 24,
  },
  REMINDER: {
    messageTpl:
      "Olá, {cliente}! Lembrete do seu horário no {negocio}: {data} às {hora} — {servico} com {profissional}. {link}",
    hoursBefore: 3,
  },
  SALE: { messageTpl: "Olá! Que bom falar com o {negocio} 😊 Vamos agendar seu horário?", hoursBefore: null },
  RESCHEDULE: { messageTpl: "Sem problemas, {cliente}! Vamos remarcar seu horário no {negocio}.", hoursBefore: null },
  CANCELLATION: { messageTpl: "Entendi, {cliente}. Antes de cancelar, posso te ajudar?", hoursBefore: null },
};

export interface FlowConfigDTO {
  flow: Flow;
  enabled: boolean;
  messageTpl: string;
  hoursBefore: number | null;
}

export async function getFlowConfig(systemId: string, tenantRef: string, flow: Flow): Promise<FlowConfigDTO | null> {
  const row = await prisma.flowConfig.findUnique({
    where: { systemId_tenantRef_flow: { systemId, tenantRef, flow } },
    select: { flow: true, enabled: true, messageTpl: true, hoursBefore: true },
  });
  return row;
}

/** Garante as 5 linhas (defaults) e devolve todas. Idempotente. */
export async function ensureFlowConfigs(systemId: string, tenantRef: string): Promise<FlowConfigDTO[]> {
  await prisma.$transaction(
    WA_FLOWS.map((flow) =>
      prisma.flowConfig.upsert({
        where: { systemId_tenantRef_flow: { systemId, tenantRef, flow } },
        create: {
          systemId,
          tenantRef,
          flow,
          enabled: false,
          messageTpl: FLOW_DEFAULTS[flow].messageTpl,
          hoursBefore: FLOW_DEFAULTS[flow].hoursBefore,
        },
        update: {},
      }),
    ),
  );
  return prisma.flowConfig.findMany({
    where: { systemId, tenantRef },
    select: { flow: true, enabled: true, messageTpl: true, hoursBefore: true },
    orderBy: { flow: "asc" },
  });
}

export interface UpdateFlowInput {
  flow: Flow;
  enabled?: boolean;
  messageTpl?: string;
  hoursBefore?: number | null;
}

export async function updateFlowConfig(
  systemId: string,
  tenantRef: string,
  input: UpdateFlowInput,
): Promise<void> {
  await prisma.flowConfig.upsert({
    where: { systemId_tenantRef_flow: { systemId, tenantRef, flow: input.flow } },
    create: {
      systemId,
      tenantRef,
      flow: input.flow,
      enabled: input.enabled ?? false,
      messageTpl: input.messageTpl ?? FLOW_DEFAULTS[input.flow].messageTpl,
      hoursBefore: input.hoursBefore ?? FLOW_DEFAULTS[input.flow].hoursBefore,
    },
    update: {
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.messageTpl !== undefined ? { messageTpl: input.messageTpl } : {}),
      ...(input.hoursBefore !== undefined ? { hoursBefore: input.hoursBefore } : {}),
    },
  });
}
