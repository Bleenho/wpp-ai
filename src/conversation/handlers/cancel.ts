import type { ConvBase, ConvState, HandlerResult } from "../types";
import { PortError } from "../ports";
import { parseChoice, numbered } from "../../util/format";
import { next, done } from "./shared";
import { startReschedule } from "./reschedule";

export interface CancelSeed {
  bookingId?: string;
}

/**
 * Checa a política ANTES de perguntar: se o horário não pode mais ser cancelado,
 * avisa e encerra. Se pode, mostra a confirmação final (e oferece remarcar).
 */
async function askCancel(base: ConvBase, clientId: string, bookingId: string): Promise<HandlerResult> {
  let info;
  try {
    info = await base.port.bookingActionInfo(bookingId);
  } catch (e) {
    if (e instanceof PortError) return done(`❌ ${e.message}`);
    throw e;
  }
  if (!info.canCancel) {
    return done(`❌ ${info.cancelReason ?? "Este horário não pode mais ser cancelado."}`);
  }

  const lines = ["Tem certeza que deseja *cancelar* este horário?"];
  if (info.refundLabel) lines.push(`O estorno de ${info.refundLabel} será solicitado.`);
  const opts = info.canReschedule
    ? ["Sim, cancelar", "Não — prefiro remarcar", "Não — manter o horário"]
    : ["Sim, cancelar", "Não — manter o horário"];
  return next(
    `${lines.join(" ")}\n${numbered(opts)}`,
    "CANCELLATION",
    "confirm",
    { bookingId, canReschedule: info.canReschedule },
    clientId,
  );
}

export async function startCancel(
  base: ConvBase,
  clientId: string | null,
  seed: CancelSeed = {},
): Promise<HandlerResult> {
  if (!clientId) return done("Não encontrei agendamentos para este número. 🤔");
  if (seed.bookingId) return askCancel(base, clientId, seed.bookingId);

  const { bookings } = await base.port.upcomingBookings(clientId);
  if (bookings.length === 0) return done("Você não tem nenhum agendamento futuro para cancelar.");
  if (bookings.length === 1) return askCancel(base, clientId, bookings[0].id);

  return next(
    `Qual agendamento você quer cancelar?\n${numbered(bookings.map((b) => b.label))}`,
    "CANCELLATION",
    "pick",
    { ids: bookings.map((b) => b.id) },
    clientId,
  );
}

export async function handleCancel(base: ConvBase, state: ConvState): Promise<HandlerResult> {
  const { step, context, clientId } = state;
  if (!clientId) return done("Sessão expirada. Digite *menu* para recomeçar.");

  if (step === "pick") {
    const ids = (context.ids as string[]) ?? [];
    const choice = parseChoice(base.text, ids.length);
    if (!choice) return next("Escolha um número da lista.", "CANCELLATION", "pick", context, clientId);
    return askCancel(base, clientId, ids[choice - 1]);
  }

  if (step === "confirm") {
    const bookingId = context.bookingId as string;
    const canReschedule = Boolean(context.canReschedule);
    const max = canReschedule ? 3 : 2;
    const choice = parseChoice(base.text, max);
    if (!choice)
      return next(`Responda com um número de 1 a ${max}.`, "CANCELLATION", "confirm", context, clientId);

    if (choice === 1) {
      try {
        const result = await base.port.cancelBooking(bookingId);
        let msg = "Tudo certo, seu agendamento foi *cancelado*.";
        if (result.refundLabel) msg += ` O estorno de ${result.refundLabel} foi solicitado.`;
        msg += " Quando quiser, é só chamar para agendar de novo. 😉";
        return done(msg);
      } catch (e) {
        if (e instanceof PortError) return done(`❌ ${e.message}`);
        throw e;
      }
    }
    if (canReschedule && choice === 2) return startReschedule(base, clientId, { bookingId });
    return done("Ok, mantivemos seu horário. 😉");
  }

  return startCancel(base, clientId);
}
