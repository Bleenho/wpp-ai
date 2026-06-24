import crypto from "node:crypto";
import { prisma } from "../db";

/** Registra um sistema consumidor e devolve a apiKey (mostrada só uma vez). */
export async function createSystem(input: {
  name: string;
  callbackUrl: string;
  callbackSecret: string;
}) {
  const apiKey = `wppai_${crypto.randomBytes(24).toString("hex")}`;
  const system = await prisma.system.create({
    data: {
      name: input.name,
      callbackUrl: input.callbackUrl,
      callbackSecret: input.callbackSecret,
      apiKey,
    },
  });
  return { id: system.id, name: system.name, apiKey };
}

export async function listSystems() {
  return prisma.system.findMany({
    select: { id: true, name: true, callbackUrl: true, active: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}
