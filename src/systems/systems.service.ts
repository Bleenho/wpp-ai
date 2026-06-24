import crypto from "node:crypto";
import { prisma } from "../db";

export interface CreateSystemInput {
  name: string;
  adapter: string; // "generic" | "agendota"
  config?: Record<string, unknown>; // ex.: agendota = { baseUrl, apiKey }
  callbackUrl?: string;
  callbackSecret?: string;
}

/** Registra um sistema consumidor e devolve a apiKey (mostrada só uma vez). */
export async function createSystem(input: CreateSystemInput) {
  const apiKey = `wppai_${crypto.randomBytes(24).toString("hex")}`;
  const system = await prisma.system.create({
    data: {
      name: input.name,
      adapter: input.adapter,
      config: (input.config ?? {}) as object,
      callbackUrl: input.callbackUrl ?? null,
      callbackSecret: input.callbackSecret ?? null,
      apiKey,
    },
  });
  return { id: system.id, name: system.name, adapter: system.adapter, apiKey };
}

export async function listSystems() {
  return prisma.system.findMany({
    select: { id: true, name: true, adapter: true, callbackUrl: true, active: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}
