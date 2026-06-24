import type { ConvBase, ConvState, HandlerResult } from "../types";
import { PortError } from "../ports";
import { parseChoice, parseDate, numbered } from "../../util/format";
import { next, done, toStoredSlots, type StoredSlot } from "./shared";

export interface RescheduleSeed {
  bookingId?: string;
}

function askDate(clientId: string, bookingId: string): HandlerResult {
  return next(
    "Para quando você quer remarcar? (ex.: hoje, amanhã ou 25/12)",
    "RESCHEDULE",
    "date",
    { bookingId },
    clientId,
  );
}

export async function startReschedule(
  base: ConvBase,
  clientId: string | null,
  seed: RescheduleSeed = {},
): Promise<HandlerResult> {
  if (!clientId) return done("Não encontrei agendamentos para este número. 🤔");
  if (seed.bookingId) return askDate(clientId, seed.bookingId);

  const { bookings } = await base.port.upcomingBookings(clientId);
  if (bookings.length === 0) return done("Você não tem nenhum agendamento futuro para remarcar.");
  if (bookings.length === 1) return askDate(clientId, bookings[0].id);

  return next(
    `Qual agendamento você quer remarcar?\n${numbered(bookings.map((b) => b.label))}`,
    "RESCHEDULE",
    "pick",
    { ids: bookings.map((b) => b.id) },
    clientId,
  );
}

export async function handleReschedule(base: ConvBase, state: ConvState): Promise<HandlerResult> {
  const { step, context, clientId } = state;
  if (!clientId) return done("Sessão expirada. Digite *menu* para recomeçar.");

  if (step === "pick") {
    const ids = (context.ids as string[]) ?? [];
    const choice = parseChoice(base.text, ids.length);
    if (!choice) return next("Escolha um número da lista.", "RESCHEDULE", "pick", context, clientId);
    return askDate(clientId, ids[choice - 1]);
  }

  if (step === "date") {
    const date = parseDate(base.text, base.tz);
    if (!date) return next("Data inválida. Tente *hoje*, *amanhã* ou DD/MM.", "RESCHEDULE", "date", context, clientId);
    const bookingId = context.bookingId as string;
    // O sistema decide (via política) os horários elegíveis ao remarcar este booking.
    const { slots } = await base.port.rescheduleSlots(bookingId, date);
    const stored = toStoredSlots(slots, base.tz);
    if (stored.length === 0)
      return next("Não há horários nesse dia. Tente outra data.", "RESCHEDULE", "date", context, clientId);
    return next(
      `Novos horários:\n${numbered(stored.map((s) => s.label))}\n\nResponda com o número.`,
      "RESCHEDULE",
      "slot",
      { bookingId, slots: stored },
      clientId,
    );
  }

  if (step === "slot") {
    const slots = (context.slots as StoredSlot[]) ?? [];
    const choice = parseChoice(base.text, slots.length);
    if (!choice) return next("Escolha um número da lista.", "RESCHEDULE", "slot", context, clientId);
    const slot = slots[choice - 1];
    try {
      await base.port.rescheduleBooking(context.bookingId as string, slot.iso, slot.professionalId);
      return done(`✅ Remarcado! Seu novo horário é *${slot.label}*. Até lá! 😉`);
    } catch (e) {
      if (e instanceof PortError) return done(`❌ ${e.message}\n\nDigite *menu* se precisar de algo mais.`);
      throw e;
    }
  }

  return startReschedule(base, clientId);
}
