import { prisma } from "../db";
import { handleInboundMessage } from "../conversation/engine";
import { recordInbound } from "../idempotency/idempotency.service";

/**
 * Processa um evento de webhook da Evolution para uma instância (resolvida pelo
 * instanceName na URL). Trata qrcode.updated, connection.update e
 * messages.upsert. Best-effort: nunca lança (a rota sempre responde 200).
 */
interface EvoKey {
  remoteJid?: string;
  fromMe?: boolean;
  id?: string;
}
interface EvoMessage {
  key?: EvoKey;
  message?: { conversation?: string; extendedTextMessage?: { text?: string } };
}
interface EvoData {
  state?: string;
  connection?: string;
  qrcode?: { base64?: string };
  base64?: string;
  wuid?: string;
  me?: { id?: string };
  instance?: { wuid?: string };
  messages?: EvoMessage[];
  key?: EvoKey;
  message?: EvoMessage["message"];
}
interface EvoPayload {
  event?: string;
  data?: EvoData;
}

export async function handleEvolutionEvent(instanceName: string, payload: unknown): Promise<void> {
  const p = (payload ?? {}) as EvoPayload;
  const event = String(p.event ?? "").toLowerCase().replace(/_/g, ".");
  const data: EvoData = p.data ?? {};

  try {
    if (event === "qrcode.updated") {
      const base64 = data?.qrcode?.base64 ?? data?.base64 ?? null;
      if (base64) {
        await prisma.instance.updateMany({
          where: { instanceName },
          data: { status: "CONNECTING", lastQrCode: base64 },
        });
      }
      return;
    }

    if (event === "connection.update") {
      const state = data?.state ?? data?.connection;
      if (state === "open") {
        await prisma.instance.updateMany({
          where: { instanceName },
          data: {
            status: "CONNECTED",
            connectedAt: new Date(),
            lastQrCode: null,
            ...(extractNumber(data) ? { phoneNumber: extractNumber(data) } : {}),
          },
        });
      } else if (state === "close") {
        await prisma.instance.updateMany({ where: { instanceName }, data: { status: "DISCONNECTED" } });
      } else if (state === "connecting") {
        await prisma.instance.updateMany({ where: { instanceName }, data: { status: "CONNECTING" } });
      }
      return;
    }

    if (event === "messages.upsert") {
      await handleInbound(instanceName, data);
      return;
    }
  } catch (e) {
    console.error(`[webhook] ${event}:`, (e as Error)?.message);
  }
}

function extractNumber(data: EvoData): string | null {
  const jid: string | undefined = data?.wuid ?? data?.me?.id ?? data?.instance?.wuid;
  if (typeof jid === "string") {
    const digits = jid.split("@")[0]?.split(":")[0]?.replace(/\D/g, "");
    if (digits) return digits;
  }
  return null;
}

async function handleInbound(instanceName: string, data: EvoData): Promise<void> {
  const msg: EvoMessage = Array.isArray(data?.messages) ? data.messages[0] : data;
  const key = msg?.key ?? {};
  if (key.fromMe) return;
  const remoteJid: string = key.remoteJid ?? "";
  if (!remoteJid || remoteJid.endsWith("@g.us")) return;

  const fromPhone = remoteJid.split("@")[0]?.replace(/\D/g, "");
  const text = msg?.message?.conversation ?? msg?.message?.extendedTextMessage?.text ?? "";
  if (!fromPhone || !text) return;

  // Idempotência: se já processamos essa mensagem, ignora (não responde 2x).
  const fresh = await recordInbound(instanceName, key.id);
  if (!fresh) return;

  await handleInboundMessage(instanceName, fromPhone, text, key.id);
}
