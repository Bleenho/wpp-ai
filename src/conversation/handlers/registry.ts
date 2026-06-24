import type { Flow } from "@prisma/client";
import type { ConvBase, ConvState, HandlerResult } from "../types";
import { startSale, handleSale } from "./sale";
import { startReschedule, handleReschedule } from "./reschedule";
import { startCancel, handleCancel } from "./cancel";
import { handleConfirm } from "./confirm";
import { done } from "./shared";

/** Inicia um fluxo pelo menu (CONFIRMATION é iniciado pelo disparo, não aqui). */
export async function startFlow(
  flow: Flow,
  base: ConvBase,
  clientId: string | null,
): Promise<HandlerResult> {
  switch (flow) {
    case "SALE":
      return startSale(base, clientId);
    case "RESCHEDULE":
      return startReschedule(base, clientId);
    case "CANCELLATION":
      return startCancel(base, clientId);
    default:
      return done("Não consegui iniciar esse atendimento. Digite *menu*.");
  }
}

/** Encaminha uma mensagem para o handler do fluxo ativo. */
export async function dispatch(base: ConvBase, state: ConvState): Promise<HandlerResult> {
  switch (state.flow) {
    case "SALE":
      return handleSale(base, state);
    case "RESCHEDULE":
      return handleReschedule(base, state);
    case "CANCELLATION":
      return handleCancel(base, state);
    case "CONFIRMATION":
      return handleConfirm(base, state);
    default:
      return done("Digite *menu* para começar.");
  }
}
