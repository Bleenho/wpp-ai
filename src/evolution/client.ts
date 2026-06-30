import { env } from "../env";

/**
 * Adaptador HTTP da Evolution API (Baileys). Toda comunicação com a Evolution
 * entra só aqui. Autenticação por header `apikey` (chave global da instância).
 */

export function isConfigured(): boolean {
  return Boolean(env.EVOLUTION_API_URL && env.EVOLUTION_API_KEY);
}

function baseUrl(): string {
  return (env.EVOLUTION_API_URL ?? "").replace(/\/+$/, "");
}

async function evoFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!isConfigured()) throw new Error("Evolution API não configurada (EVOLUTION_API_URL/KEY).");
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: env.EVOLUTION_API_KEY as string,
      ...(init.headers ?? {}),
    },
  });
  const body = await res.text();
  const json = body ? safeJson(body) : null;
  if (!res.ok) {
    const msg = readError(json) || body || res.statusText;
    throw new Error(`Evolution ${res.status}: ${msg}`);
  }
  return json as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readError(json: unknown): string | null {
  if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;
    const msg = obj.message ?? obj.error;
    if (typeof msg === "string") return msg;
    if (msg) return JSON.stringify(msg);
  }
  return null;
}

export interface QrResult {
  base64?: string;
  code?: string;
  /** Código de pareamento (8 chars) — vem quando conectamos passando ?number=. */
  pairingCode?: string;
}

export async function createInstance(instanceName: string, webhookUrl: string): Promise<void> {
  await evoFetch("/instance/create", {
    method: "POST",
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      webhook: {
        url: webhookUrl,
        byEvents: false,
        base64: true,
        events: ["QRCODE_UPDATED", "CONNECTION_UPDATE", "MESSAGES_UPSERT"],
      },
    }),
  });
}

/**
 * Inicia a conexão. Sem `number` → devolve o QR (base64) para escanear. Com
 * `number` (dígitos com DDI, ex.: 5511999999999) → a Evolution devolve um
 * `pairingCode` de 8 caracteres para o salão digitar no WhatsApp ("Conectar com
 * número de telefone") — útil para quem está num celular só e não consegue
 * escanear o próprio QR.
 */
export async function connectInstance(instanceName: string, number?: string): Promise<QrResult> {
  const qs = number ? `?number=${encodeURIComponent(number)}` : "";
  const data = await evoFetch<{ qrcode?: QrResult } & QrResult>(
    `/instance/connect/${encodeURIComponent(instanceName)}${qs}`,
    { method: "GET" },
  );
  const qr = data?.qrcode ?? data ?? {};
  // pairingCode costuma vir na raiz; aceitamos aninhado por segurança.
  const pairingCode = data?.pairingCode ?? qr?.pairingCode;
  return { base64: qr.base64, code: qr.code, pairingCode };
}

export type ConnState = "open" | "connecting" | "close" | "unknown";

export async function connectionState(instanceName: string): Promise<ConnState> {
  try {
    const data = await evoFetch<{ instance?: { state?: ConnState } }>(
      `/instance/connectionState/${encodeURIComponent(instanceName)}`,
      { method: "GET" },
    );
    return data?.instance?.state ?? "unknown";
  } catch {
    return "unknown";
  }
}

export async function logoutInstance(instanceName: string): Promise<void> {
  await evoFetch(`/instance/logout/${encodeURIComponent(instanceName)}`, { method: "DELETE" }).catch(
    () => {},
  );
}

export async function deleteInstance(instanceName: string): Promise<void> {
  await evoFetch(`/instance/delete/${encodeURIComponent(instanceName)}`, { method: "DELETE" }).catch(
    () => {},
  );
}

/** Best-effort: retorna boolean, nunca lança. `number` em formato internacional. */
export async function sendText(instanceName: string, number: string, text: string): Promise<boolean> {
  if (!isConfigured()) {
    console.info(`[evolution] (não configurado) p/ ${number}: ${text.slice(0, 60)}`);
    return false;
  }
  try {
    await evoFetch(`/message/sendText/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      body: JSON.stringify({ number, text }),
    });
    return true;
  } catch (e) {
    console.error("[evolution] falha ao enviar:", (e as Error)?.message);
    return false;
  }
}
