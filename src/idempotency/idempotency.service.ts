import { prisma } from "../db";

// Quanto tempo guardamos os registros de dedup (inbound e outbound). Cobre com
// folga o TTL de um código OTP (10 min) e a janela de throttle (60s).
const DEDUP_TTL_MIN = 60;

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

/**
 * Registra a mensagem recebida. Retorna `true` se é NOVA (deve processar) e
 * `false` se já foi vista (duplicada → ignorar). Race-safe: o unique
 * (instanceName, messageId) + P2002 garante que só o primeiro processa.
 * Sem `messageId` não há como deduplicar → processa (retorna true).
 */
export async function recordInbound(
  instanceName: string,
  messageId: string | undefined | null,
): Promise<boolean> {
  if (!messageId) return true;
  try {
    await prisma.inboundMessage.create({ data: { instanceName, messageId } });
    return true;
  } catch (e) {
    if (isUniqueViolation(e)) return false; // duplicada
    console.error("[idempotency] recordInbound:", (e as Error)?.message);
    return true; // erro diferente: não bloqueia o processamento
  }
}

/** Apaga registros de dedup vencidos. Chamado por um sweep periódico. */
export async function cleanupIdempotency(): Promise<void> {
  const cutoff = new Date(Date.now() - DEDUP_TTL_MIN * 60 * 1000);
  await prisma.inboundMessage.deleteMany({ where: { createdAt: { lt: cutoff } } }).catch(() => {});
  await prisma.outboundSend.deleteMany({ where: { createdAt: { lt: cutoff } } }).catch(() => {});
}
