import type { Flow } from "@prisma/client";
import type { SystemPort } from "./ports";

export type { Flow };

/** Estado persistido da conversa. flow=null + step="menu" => aguardando menu. */
export interface ConvState {
  flow: Flow | null;
  step: string;
  context: Record<string, unknown>;
  clientId: string | null;
}

/** Contexto imutável de uma mensagem recebida. */
export interface ConvBase {
  systemId: string;
  tenantRef: string;
  instanceName: string;
  businessName: string;
  tz: string;
  /** Telefone local (sem DDI 55). */
  phone: string;
  /** Texto já trimado. */
  text: string;
  /** Id da mensagem recebida (WhatsApp) — usado como chave de idempotência do envio. */
  messageId?: string;
  /** Porta do sistema (adaptador) já ligada ao sistema + tenant. */
  port: SystemPort;
}

/** Resultado de um handler: resposta + próximo estado (null = encerrar). */
export interface HandlerResult {
  reply: string;
  state: ConvState | null;
}
