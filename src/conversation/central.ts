import { prisma } from "../db";
import { guardedSend } from "../messaging/send";
import { toBrWhatsappNumber, toLocalPhone, onlyDigits, numbered } from "../util/format";
import { status as instanceStatus } from "../instances/instances.service";

/**
 * Número CENTRAL do Agendota (instância tenantRef="_central" de um System
 * isCentral). Duas responsabilidades: entregar OTP (saída, tratada em otp/) e
 * ser o **bot de suporte** — que SÓ responde quando quem escreve é um DONO de
 * salão. Qualquer outro (cliente final, estranho) recebe SILÊNCIO.
 *
 * Estado do bot reusa a tabela Conversation com tenantRef="_central" e
 * flow=null (não é um Flow do enum); o "modo" fica em context.mode.
 */

const TTL_MINUTES = 20;
const CENTRAL_REF = "_central";

export interface CentralInstance {
  instanceName: string;
  systemId: string;
  systemConfig: unknown;
}

interface CentralCfg {
  baseUrl: string;
  apiKey: string;
}

interface OwnerRef {
  tenantSlug: string;
  businessName: string;
  ownerName: string;
}

/** baseUrl + apiKey do adaptador agendota (System.config). Null se incompleto. */
function centralCfg(config: unknown): CentralCfg | null {
  const c = (config ?? {}) as Record<string, unknown>;
  const baseUrl = typeof c.baseUrl === "string" ? c.baseUrl.replace(/\/+$/, "") : "";
  const apiKey = typeof c.apiKey === "string" ? c.apiKey : "";
  if (!baseUrl || !apiKey) return null;
  return { baseUrl, apiKey };
}

function ddiVariants(digits: string): string[] {
  if (digits.length < 10) return [];
  return digits.startsWith("55") ? [digits, digits.slice(2)] : [digits, `55${digits}`];
}

/**
 * Identidade do dono (híbrida):
 *  1. Match local — alguma instância NÃO-central deste sistema com esse número
 *     já CONECTADO (zero atrito: o dono usa o próprio WhatsApp do salão).
 *  2. Fallback — OwnerContact confirmado por OTP no agendota (/resolve-owner).
 * Retorna null quando não é dono (gate crítico do bot).
 */
async function resolveOwner(inst: CentralInstance, cfg: CentralCfg, digitsWithDdi: string): Promise<OwnerRef | null> {
  const variants = ddiVariants(digitsWithDdi);
  if (!variants.length) return null;

  const local = await prisma.instance.findFirst({
    where: {
      systemId: inst.systemId,
      tenantRef: { not: CENTRAL_REF },
      status: "CONNECTED",
      phoneNumber: { in: variants },
    },
    select: { tenantRef: true, businessName: true },
  });
  if (local) {
    const name = local.businessName ?? local.tenantRef;
    return { tenantSlug: local.tenantRef, businessName: name, ownerName: name };
  }

  try {
    const res = await fetch(`${cfg.baseUrl}/api/integrations/wpp/resolve-owner`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": cfg.apiKey },
      body: JSON.stringify({ phone: digitsWithDdi }),
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => ({}))) as { data?: { owner?: OwnerRef | null } };
    return json?.data?.owner ?? null;
  } catch {
    return null;
  }
}

/** Envia a mensagem "falar com atendente" para a fila do painel (/platform/suporte). */
async function escalate(cfg: CentralCfg, tenantSlug: string, ownerPhone: string, message: string): Promise<boolean> {
  try {
    const res = await fetch(`${cfg.baseUrl}/api/integrations/wpp/support-escalation`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": cfg.apiKey },
      body: JSON.stringify({ tenantSlug, ownerPhone, message }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Entrada do bot central. Best-effort (nunca lança). Idempotência de inbound já
 * foi aplicada no webhook (recordInbound) antes de chegar aqui.
 */
export async function handleCentralInbound(
  inst: CentralInstance,
  fromPhone: string,
  rawText: string,
  messageId?: string,
): Promise<void> {
  try {
    const cfg = centralCfg(inst.systemConfig);
    if (!cfg) return; // sem baseUrl/apiKey não dá para resolver o dono

    const phone = toLocalPhone(fromPhone);
    const text = (rawText ?? "").trim();
    if (phone.length < 10 || !text) return;

    // GATE CRÍTICO: só responde a DONO de salão. Estranho/cliente ⇒ silêncio.
    const digitsWithDdi = toBrWhatsappNumber(fromPhone) ?? onlyDigits(fromPhone);
    const owner = await resolveOwner(inst, cfg, digitsWithDdi);
    if (!owner) return;

    const lower = text.toLowerCase();
    if (lower === "parar" || lower === "sair") {
      await clearCentral(inst.systemId, phone);
      await sendCentral(inst.instanceName, phone, "Tudo bem! Quando precisar, é só chamar. 👋", messageId);
      return;
    }

    const conv = await prisma.conversation.findUnique({
      where: {
        systemId_tenantRef_clientPhone: { systemId: inst.systemId, tenantRef: CENTRAL_REF, clientPhone: phone },
      },
    });
    const fresh = Boolean(conv && conv.expiresAt.getTime() > Date.now());
    const ctx = (fresh ? (conv!.context as Record<string, unknown>) : {}) ?? {};
    const awaiting = fresh && ctx.mode === "escalate";

    let reply: string;
    let nextMode = "support";

    if (awaiting) {
      await escalate(cfg, owner.tenantSlug, digitsWithDdi, text.slice(0, 1000));
      reply = "Pronto! Registrei sua mensagem e um atendente vai te responder por aqui. 🙌";
    } else {
      const n = parseInt(text.replace(/\D/g, ""), 10);
      if (fresh && lower !== "menu" && !Number.isNaN(n)) {
        const r = await supportOption(inst.systemId, cfg, owner, n);
        reply = r.reply;
        if (r.escalating) nextMode = "escalate";
      } else {
        reply = supportMenu(owner);
      }
    }

    await persistCentral(inst.systemId, phone, { mode: nextMode });
    await sendCentral(inst.instanceName, phone, reply, messageId);
  } catch (e) {
    console.error("[central] handleCentralInbound:", (e as Error)?.message);
  }
}

function supportMenu(owner: OwnerRef): string {
  return `Olá, ${owner.ownerName}! 👋 Aqui é o suporte do Agendota. Como posso ajudar?\n${numbered([
    "Status do meu WhatsApp",
    "Meu link de agendamento",
    "Ajuda e dúvidas",
    "Falar com um atendente",
  ])}\n\nResponda com o número.`;
}

async function supportOption(
  systemId: string,
  cfg: CentralCfg,
  owner: OwnerRef,
  n: number,
): Promise<{ reply: string; escalating?: boolean }> {
  switch (n) {
    case 1: {
      const st = await instanceStatus(systemId, owner.tenantSlug);
      let label: string;
      if (st.status === "CONNECTED") {
        label = `conectado ✅${st.phoneNumber ? ` (número ${st.phoneNumber})` : ""}`;
      } else if (st.status === "CONNECTING") {
        label = "conectando… escaneie o QR no painel (Painel → WhatsApp).";
      } else {
        label = "desconectado ❌ — reconecte em Painel → WhatsApp.";
      }
      return { reply: `WhatsApp do *${owner.businessName}*: ${label}` };
    }
    case 2:
      return { reply: `Seu link de agendamento:\n${cfg.baseUrl}/${owner.tenantSlug}` };
    case 3:
      return {
        reply:
          "Central de ajuda: no painel, acesse *Ajuda*. Para falar com uma pessoa, responda *4*.",
      };
    case 4:
      return {
        reply: "Certo! Escreva numa mensagem a sua dúvida ou problema que eu encaminho para um atendente. ✍️",
        escalating: true,
      };
    default:
      return { reply: supportMenu(owner) };
  }
}

// ---- Persistência / envio --------------------------------------------------

async function sendCentral(instanceName: string, phone: string, message: string, messageId?: string): Promise<void> {
  const number = toBrWhatsappNumber(phone);
  if (!number) return;
  await guardedSend({
    instanceName,
    toPhone: number,
    text: message,
    kind: "SUPPORT",
    idempotencyKey: messageId ? `sup:${instanceName}:${messageId}` : undefined,
  });
}

function expiry(): Date {
  return new Date(Date.now() + TTL_MINUTES * 60 * 1000);
}

async function persistCentral(systemId: string, phone: string, context: Record<string, unknown>): Promise<void> {
  const key = {
    systemId_tenantRef_clientPhone: { systemId, tenantRef: CENTRAL_REF, clientPhone: phone },
  };
  await prisma.conversation.upsert({
    where: key,
    create: {
      systemId,
      tenantRef: CENTRAL_REF,
      clientPhone: phone,
      flow: null,
      step: "support",
      context: context as object,
      expiresAt: expiry(),
    },
    update: { flow: null, step: "support", context: context as object, expiresAt: expiry() },
  });
}

async function clearCentral(systemId: string, phone: string): Promise<void> {
  await prisma.conversation
    .delete({ where: { systemId_tenantRef_clientPhone: { systemId, tenantRef: CENTRAL_REF, clientPhone: phone } } })
    .catch(() => {});
}
