import { prisma } from "../db";
import { guardedSend } from "../messaging/send";
import { toBrWhatsappNumber } from "../util/format";

// tenantRef sentinela da instância CENTRAL do sistema (número do Agendota).
const CENTRAL_REF = "_central";

export interface SendOtpInput {
  systemId: string;
  phone: string; // dígitos (com ou sem DDI)
  code: string;
  ttlMinutes?: number;
  purpose?: string;
  idempotencyKey?: string;
}

export interface SendOtpResult {
  sent: boolean;
  deduped?: boolean;
  reason?: "invalid_phone" | "no_central_instance" | "not_connected" | "throttled" | "send_failed";
}

/**
 * Entrega um código OTP (já gerado pelo sistema) pelo WhatsApp, usando a
 * instância CENTRAL do sistema chamador. Saída pura — o código é conferido no
 * app do sistema, não por resposta no WhatsApp. Best-effort: nunca lança.
 */
export async function sendOtp(input: SendOtpInput): Promise<SendOtpResult> {
  const number = toBrWhatsappNumber(input.phone);
  if (!number) return { sent: false, reason: "invalid_phone" };

  const instance = await prisma.instance.findUnique({
    where: { systemId_tenantRef: { systemId: input.systemId, tenantRef: CENTRAL_REF } },
    select: { instanceName: true, status: true },
  });
  if (!instance) return { sent: false, reason: "no_central_instance" };
  if (instance.status !== "CONNECTED") return { sent: false, reason: "not_connected" };

  const ttl = input.ttlMinutes ?? 10;
  const text = `*${input.code}* é o seu código do Agendota. Vale por ${ttl} minutos. Não compartilhe com ninguém.`;

  const res = await guardedSend({
    instanceName: instance.instanceName,
    toPhone: number,
    text,
    kind: "OTP",
    idempotencyKey: input.idempotencyKey,
  });
  if (res.deduped) return { sent: true, deduped: true };
  if (!res.sent) return { sent: false, reason: res.reason ?? "send_failed" };
  return { sent: true };
}
