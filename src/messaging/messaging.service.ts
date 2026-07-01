import type { Flow } from "@prisma/client";
import { prisma } from "../db";
import { guardedSend } from "./send";
import { toBrWhatsappNumber, toLocalPhone, renderTemplate } from "../util/format";
import { getFlowConfig } from "../flows/flow-config.service";
import { confirmationMenu } from "../conversation/handlers/confirm";
import { openConfirmationConversation } from "../conversation/engine";

/**
 * Disparos de SAÍDA pedidos pelo sistema (que tem o agendamento + o agendador).
 * O wpp-ai dona do template (renderiza com as `vars`), do toggle e do envio.
 * Para CONFIRMATION, anexa o menu (1/2/3) e abre a conversa para a resposta.
 */
export interface SendFlowInput {
  flow: Flow; // CONFIRMATION | REMINDER
  tenantRef: string;
  clientPhone: string;
  clientId?: string;
  bookingId?: string;
  vars: Record<string, string>;
}

export interface SendResult {
  sent: boolean;
  deduped?: boolean;
  reason?: string;
}

export async function sendFlowMessage(systemId: string, input: SendFlowInput): Promise<SendResult> {
  const cfg = await getFlowConfig(systemId, input.tenantRef, input.flow);
  if (!cfg || !cfg.enabled) return { sent: false, reason: "flow_disabled" };

  const instance = await prisma.instance.findUnique({
    where: { systemId_tenantRef: { systemId, tenantRef: input.tenantRef } },
  });
  if (!instance || instance.status !== "CONNECTED") return { sent: false, reason: "not_connected" };

  const number = toBrWhatsappNumber(input.clientPhone);
  if (!number) return { sent: false, reason: "invalid_phone" };

  const rendered = renderTemplate(cfg.messageTpl, input.vars);
  const text = input.flow === "CONFIRMATION" ? confirmationMenu(rendered) : rendered;

  // Trava estratégica: idempotência por (flow, agendamento) — o mesmo lembrete/
  // confirmação do MESMO booking não sai duas vezes. Sem bookingId (ex.: aniversário),
  // deduplica por (flow, tenant, telefone, dia). Throttle por destinatário embutido.
  const dayBucket = Math.floor(Date.now() / 86_400_000);
  const idempotencyKey = input.bookingId
    ? `camp:${input.flow}:${input.bookingId}`
    : `camp:${input.flow}:${input.tenantRef}:${toLocalPhone(input.clientPhone)}:${dayBucket}`;

  const res = await guardedSend({
    instanceName: instance.instanceName,
    toPhone: number,
    text,
    kind: "CAMPAIGN",
    idempotencyKey,
  });
  if (!res.sent) return { sent: false, reason: res.reason };

  // Abre a conversa de confirmação mesmo em dedup (upsert idempotente) — garante
  // que o contexto exista para a resposta 1/2/3 do cliente.
  if (input.flow === "CONFIRMATION" && input.bookingId) {
    await openConfirmationConversation(
      systemId,
      input.tenantRef,
      toLocalPhone(input.clientPhone),
      input.clientId ?? null,
      input.bookingId,
    );
  }
  return { sent: true, deduped: res.deduped };
}
