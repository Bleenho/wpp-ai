import { prisma } from "../db";
import { sendText } from "../evolution/client";

// Throttle por (instância, destinatário): no máx. MAX envios na janela.
const THROTTLE_MAX = 5;
const THROTTLE_WINDOW_S = 60;

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

export interface GuardedSendInput {
  instanceName: string;
  /** Dígitos com DDI (formato que a Evolution espera). */
  toPhone: string;
  text: string;
  /** OTP | ENGINE | SUPPORT | MESSAGE — só p/ auditoria. */
  kind?: string;
  /** Se informado, dedup: o mesmo key nunca envia duas vezes. */
  idempotencyKey?: string;
}

export interface GuardedSendResult {
  sent: boolean;
  deduped?: boolean;
  reason?: "throttled" | "send_failed";
}

/**
 * Envio com trava estratégica:
 *  1. **Throttle** por (instância, destinatário) na janela — evita spam/loop.
 *  2. **Dedup** por `idempotencyKey` — reserva a linha ANTES de enviar; se o key
 *     já existe (P2002), considera já enviado. Em falha de envio, apaga a
 *     reserva (retryável).
 */
export async function guardedSend(input: GuardedSendInput): Promise<GuardedSendResult> {
  const { instanceName, toPhone, text, kind = "MESSAGE", idempotencyKey } = input;

  // 1. Throttle
  const since = new Date(Date.now() - THROTTLE_WINDOW_S * 1000);
  const recent = await prisma.outboundSend.count({
    where: { instanceName, toPhone, createdAt: { gte: since } },
  });
  if (recent >= THROTTLE_MAX) return { sent: false, reason: "throttled" };

  // 2. Reserva (dedup). Sem idempotencyKey, grava sem dedup (null é distinto no PG).
  let reservedId: string;
  try {
    const row = await prisma.outboundSend.create({
      data: { instanceName, toPhone, kind, idempotencyKey: idempotencyKey ?? null },
    });
    reservedId = row.id;
  } catch (e) {
    if (isUniqueViolation(e)) return { sent: true, deduped: true }; // já enviado
    throw e;
  }

  const ok = await sendText(instanceName, toPhone, text);
  if (!ok) {
    // Envio falhou → libera a reserva pra permitir nova tentativa depois.
    await prisma.outboundSend.delete({ where: { id: reservedId } }).catch(() => {});
    return { sent: false, reason: "send_failed" };
  }
  return { sent: true };
}
