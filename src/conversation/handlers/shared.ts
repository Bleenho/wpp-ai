import type { ConvState, HandlerResult } from "../types";
import type { Slot } from "../callback";
import { formatTime } from "../../util/format";

/** Slot salvo no contexto da conversa (JSON-serializável). */
export interface StoredSlot {
  iso: string;
  professionalId: string;
  professionalName: string;
  label: string;
}

export function toStoredSlots(slots: Slot[], tz: string, limit = 8): StoredSlot[] {
  return slots.slice(0, limit).map((s) => ({
    iso: s.iso,
    professionalId: s.professionalId,
    professionalName: s.professionalName,
    label: `${formatTime(s.iso, tz)} com ${s.professionalName}`,
  }));
}

/** Continua no mesmo fluxo, avançando para `step`. */
export function next(
  reply: string,
  flow: ConvState["flow"],
  step: string,
  context: Record<string, unknown>,
  clientId: string | null,
): HandlerResult {
  return { reply, state: { flow, step, context, clientId } };
}

/** Encerra a conversa (limpa o estado). */
export function done(reply: string): HandlerResult {
  return { reply, state: null };
}
