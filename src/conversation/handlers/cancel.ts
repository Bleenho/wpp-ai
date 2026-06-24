import type { ConvBase, ConvState, HandlerResult } from "../types";
import { PortError } from "../ports";
import { parseChoice, numbered } from "../../util/format";
import { next, done } from "./shared";
import { startReschedule } from "./reschedule";

export interface CancelSeed {
  bookingId?: string;
}

function offerReschedule(clientId: string, bookingId: string): HandlerResult {
  return next(
    "Antes de cancelar, que tal *remarcar*? 🙂\n1- Quero remarcar\n2- Cancelar mesmo assim",
    "CANCELLATION",
    "offer",
    { bookingId },
    clientId,
  );
}

export async function startCancel(
  base: ConvBase,
  clientId: string | null,
  seed: CancelSeed = {},
): Promise<HandlerResult> {
  if (!clientId) return done("Não encontrei agendamentos para este número. 🤔");
  if (seed.bookingId) return offerReschedule(clientId, seed.bookingId);

  const { bookings } = await base.port.upcomingBookings(clientId);
  if (bookings.length === 0) return done("Você não tem nenhum agendamento futuro para cancelar.");
  if (bookings.length === 1) return offerReschedule(clientId, bookings[0].id);

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
    return offerReschedule(clientId, ids[choice - 1]);
  }

  if (step === "offer") {
    const choice = parseChoice(base.text, 2);
    const bookingId = context.bookingId as string;
    if (choice === 1) return startReschedule(base, clientId, { bookingId });
    if (choice !== 2)
      return next("Responda *1* para remarcar ou *2* para cancelar.", "CANCELLATION", "offer", context, clientId);
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

  return startCancel(base, clientId);
}
