import type { ConvBase, ConvState, HandlerResult } from "../types";
import { CallbackError } from "../callback";
import { parseChoice } from "../../util/format";
import { next, done } from "./shared";
import { startReschedule } from "./reschedule";
import { startCancel } from "./cancel";

/** Pergunta de confirmação (texto-base do sistema + as 3 opções). */
export function confirmationMenu(header: string): string {
  return `${header}\n\n1- Sim, confirmar ✅\n2- Remarcar\n3- Cancelar`;
}

export async function handleConfirm(base: ConvBase, state: ConvState): Promise<HandlerResult> {
  const { step, context, clientId } = state;
  const bookingId = context.bookingId as string;

  if (step !== "await") return done("Tudo certo! Se precisar de algo, digite *menu*.");

  const choice = parseChoice(base.text, 3);
  if (!choice) return next(confirmationMenu("Como prefere?"), "CONFIRMATION", "await", context, clientId);

  if (choice === 1) {
    try {
      await base.caller.confirmBooking(bookingId);
      return done("Perfeito! Seu horário está *confirmado*. Te esperamos! 😄");
    } catch (e) {
      if (e instanceof CallbackError) return done(`❌ ${e.message}`);
      throw e;
    }
  }
  if (choice === 2) return startReschedule(base, clientId, { bookingId });
  return startCancel(base, clientId, { bookingId });
}
