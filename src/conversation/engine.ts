import { prisma } from "../db";
import { guardedSend } from "../messaging/send";
import { toBrWhatsappNumber, toLocalPhone, numbered } from "../util/format";
import { makePort } from "./adapters";
import type { ConvBase, ConvState, Flow, HandlerResult } from "./types";
import { startFlow, dispatch } from "./handlers/registry";
import { handleCentralInbound } from "./central";

const TTL_MINUTES = 20;

const MENU_FLOWS: { flow: Flow; label: string }[] = [
  { flow: "SALE", label: "Agendar um horário" },
  { flow: "RESCHEDULE", label: "Remarcar um horário" },
  { flow: "CANCELLATION", label: "Cancelar um horário" },
];

/**
 * Ponto de entrada do motor: chamado pelo webhook a cada mensagem recebida.
 * Resolve a instância -> sistema/tenant, carrega/cria a sessão (TTL), roteia e
 * envia a resposta pelo número conectado. Best-effort: nunca lança.
 */
export async function handleInboundMessage(
  instanceName: string,
  fromPhone: string,
  rawText: string,
  messageId?: string,
): Promise<void> {
  try {
    const instance = await prisma.instance.findUnique({
      where: { instanceName },
      include: { system: true },
    });
    if (!instance || !instance.system.active) return;

    // Número central: bot de suporte que só responde a donos de salão.
    if (instance.system.isCentral) {
      await handleCentralInbound(
        { instanceName, systemId: instance.systemId, systemConfig: instance.system.config },
        fromPhone,
        rawText,
        messageId,
      );
      return;
    }

    const phone = toLocalPhone(fromPhone);
    const text = (rawText ?? "").trim();
    if (phone.length < 10 || !text) return;

    const port = makePort(instance.system, instance.tenantRef);
    const base: ConvBase = {
      systemId: instance.systemId,
      tenantRef: instance.tenantRef,
      instanceName,
      businessName: instance.businessName ?? instance.system.name,
      tz: instance.timezone,
      phone,
      text,
      messageId,
      port,
    };

    const lower = text.toLowerCase();
    if (lower === "parar" || lower === "sair") {
      await clearConversation(base.systemId, base.tenantRef, phone);
      await send(base, "Tudo bem! Quando precisar, é só mandar uma mensagem. 👋");
      return;
    }

    const conv = await prisma.conversation.findUnique({
      where: {
        systemId_tenantRef_clientPhone: {
          systemId: base.systemId,
          tenantRef: base.tenantRef,
          clientPhone: phone,
        },
      },
    });
    const fresh = conv && conv.expiresAt.getTime() > Date.now();

    // Atendimento automático desligado: o robô só faz envios (campanhas) e não
    // responde mensagens NOVAS. Conversas já em andamento (ex.: resposta da
    // confirmação que o próprio robô iniciou) continuam normalmente.
    const active = Boolean(fresh && conv!.flow);
    if (!instance.autoReply && !active) return;

    let result: HandlerResult;
    if (lower === "menu") {
      result = await showMenu(base);
    } else if (fresh && conv!.flow) {
      result = await dispatch(base, toState(conv!));
    } else if (fresh && conv!.step === "menu") {
      result = await handleMenuSelection(base, toState(conv!));
    } else {
      result = await showMenu(base);
    }

    await persist(base, result);
    await send(base, result.reply);
  } catch (e) {
    console.error("[engine] handleInboundMessage:", (e as Error)?.message);
  }
}

async function showMenu(base: ConvBase): Promise<HandlerResult> {
  // Só chegamos aqui com o atendimento LIGADO (o guard de autoReply retorna
  // antes quando está desligado). Com atendimento on, todos os fluxos de
  // resposta ficam disponíveis — não há liga/desliga por fluxo.
  const options = MENU_FLOWS;
  const reply = `Olá! 👋 Sou o assistente do *${base.businessName}*. Como posso ajudar?\n${numbered(
    options.map((o) => o.label),
  )}\n\nResponda com o número.`;
  return {
    reply,
    state: { flow: null, step: "menu", context: { flows: options.map((o) => o.flow) }, clientId: null },
  };
}

async function handleMenuSelection(base: ConvBase, state: ConvState): Promise<HandlerResult> {
  const flows = (state.context.flows as Flow[]) ?? [];
  const n = parseInt(base.text.replace(/\D/g, ""), 10);
  if (Number.isNaN(n) || n < 1 || n > flows.length) return showMenu(base);
  const clientId = await resolveClientId(base);
  return startFlow(flows[n - 1], base, clientId);
}

/** Pergunta ao sistema se este telefone já é um cliente (id) — ou null. */
async function resolveClientId(base: ConvBase): Promise<string | null> {
  try {
    const { client } = await base.port.findClient(base.phone);
    return client?.id ?? null;
  } catch {
    return null;
  }
}

// ---- Persistência / envio --------------------------------------------------

function toState(conv: {
  flow: Flow | null;
  step: string;
  context: unknown;
  clientId: string | null;
}): ConvState {
  return {
    flow: conv.flow,
    step: conv.step,
    context: (conv.context as Record<string, unknown>) ?? {},
    clientId: conv.clientId,
  };
}

function expiry(): Date {
  return new Date(Date.now() + TTL_MINUTES * 60 * 1000);
}

async function persist(base: ConvBase, result: HandlerResult): Promise<void> {
  if (result.state === null) {
    await clearConversation(base.systemId, base.tenantRef, base.phone);
    return;
  }
  const s = result.state;
  const key = {
    systemId_tenantRef_clientPhone: {
      systemId: base.systemId,
      tenantRef: base.tenantRef,
      clientPhone: base.phone,
    },
  };
  await prisma.conversation.upsert({
    where: key,
    create: {
      systemId: base.systemId,
      tenantRef: base.tenantRef,
      clientPhone: base.phone,
      clientId: s.clientId,
      flow: s.flow,
      step: s.step,
      context: s.context as object,
      expiresAt: expiry(),
    },
    update: {
      clientId: s.clientId,
      flow: s.flow,
      step: s.step,
      context: s.context as object,
      expiresAt: expiry(),
    },
  });
}

async function clearConversation(systemId: string, tenantRef: string, phone: string): Promise<void> {
  await prisma.conversation
    .delete({ where: { systemId_tenantRef_clientPhone: { systemId, tenantRef, clientPhone: phone } } })
    .catch(() => {});
}

async function send(base: ConvBase, message: string): Promise<void> {
  const number = toBrWhatsappNumber(base.phone);
  if (!number) return;
  await guardedSend({
    instanceName: base.instanceName,
    toPhone: number,
    text: message,
    kind: "ENGINE",
    idempotencyKey: base.messageId ? `eng:${base.instanceName}:${base.messageId}` : undefined,
  });
}

/**
 * Abre (ou substitui) uma conversa de CONFIRMATION — usado pelo disparo de
 * confirmação (o sistema informa o booking + telefone). Quando o cliente
 * responder 1/2/3, o motor já sabe o contexto.
 */
export async function openConfirmationConversation(
  systemId: string,
  tenantRef: string,
  clientPhone: string,
  clientId: string | null,
  bookingId: string,
): Promise<void> {
  const key = { systemId_tenantRef_clientPhone: { systemId, tenantRef, clientPhone } };
  await prisma.conversation.upsert({
    where: key,
    create: {
      systemId,
      tenantRef,
      clientPhone,
      clientId,
      flow: "CONFIRMATION",
      step: "await",
      context: { bookingId },
      expiresAt: expiry(),
    },
    update: {
      clientId,
      flow: "CONFIRMATION",
      step: "await",
      context: { bookingId },
      expiresAt: expiry(),
    },
  });
}
