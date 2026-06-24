import type { ConvBase, ConvState, HandlerResult } from "../types";
import { CallbackError, type Service } from "../callback";
import { parseChoice, parseDate, numbered, formatMoneyBRL, minutesToLabel } from "../../util/format";
import { next, done, toStoredSlots, type StoredSlot } from "./shared";

function servicesPrompt(services: Service[]): string {
  const lines = services.map((s) => `${s.name} (${minutesToLabel(s.durationMin)} • ${formatMoneyBRL(s.price)})`);
  return `Qual serviço você deseja?\n${numbered(lines)}`;
}

export async function startSale(base: ConvBase, clientId: string | null): Promise<HandlerResult> {
  if (!clientId) return next("Para começar, qual é o seu *nome*?", "SALE", "name", {}, null);
  return askService(base, clientId);
}

async function askService(base: ConvBase, clientId: string): Promise<HandlerResult> {
  const { services } = await base.caller.listServices();
  if (services.length === 0) return done("No momento não há serviços disponíveis para agendar.");
  return next(servicesPrompt(services), "SALE", "service", { services }, clientId);
}

export async function handleSale(base: ConvBase, state: ConvState): Promise<HandlerResult> {
  const { step, context, clientId } = state;

  if (step === "name") {
    const name = base.text.trim();
    if (name.length < 2) return next("Pode me dizer seu *nome*?", "SALE", "name", {}, null);
    const { client } = await base.caller.createClient(base.phone, name);
    return askService(base, client.id);
  }

  if (step === "service") {
    const services = (context.services as Service[]) ?? [];
    const choice = parseChoice(base.text, services.length);
    if (!choice) return next(`Não entendi. ${servicesPrompt(services)}`, "SALE", "service", context, clientId);
    const service = services[choice - 1];
    return next(
      `Para *${service.name}*, qual dia você prefere? (ex.: hoje, amanhã ou 25/12)`,
      "SALE",
      "date",
      { serviceId: service.id, serviceName: service.name },
      clientId,
    );
  }

  if (step === "date") {
    const date = parseDate(base.text, base.tz);
    if (!date) return next("Data inválida. Tente *hoje*, *amanhã* ou DD/MM.", "SALE", "date", context, clientId);
    const { slots } = await base.caller.findSlots([context.serviceId as string], date);
    const stored = toStoredSlots(slots, base.tz);
    if (stored.length === 0)
      return next("Não há horários nesse dia. 😕 Tente outra data.", "SALE", "date", context, clientId);
    return next(
      `Horários disponíveis:\n${numbered(stored.map((s) => s.label))}\n\nResponda com o número.`,
      "SALE",
      "slot",
      { ...context, slots: stored },
      clientId,
    );
  }

  if (step === "slot") {
    const slots = (context.slots as StoredSlot[]) ?? [];
    const choice = parseChoice(base.text, slots.length);
    if (!choice) return next(`Escolha um número da lista:\n${numbered(slots.map((s) => s.label))}`, "SALE", "slot", context, clientId);
    const slot = slots[choice - 1];
    if (!clientId) return done("Ops, perdi seus dados. Digite *menu* para recomeçar.");
    try {
      const result = await base.caller.createBooking({
        clientId,
        serviceIds: [context.serviceId as string],
        professionalId: slot.professionalId,
        startTime: slot.iso,
      });
      let msg = `✅ Pronto! Seu horário de *${context.serviceName}* ficou para *${slot.label}*.`;
      msg += result.checkoutUrl
        ? `\n\nPara confirmar, faça o pagamento aqui:\n${result.checkoutUrl}`
        : `\n\nO negócio vai confirmar em breve. 😉`;
      return done(msg);
    } catch (e) {
      if (e instanceof CallbackError) return done(`❌ ${e.message}\n\nDigite *menu* para tentar de novo.`);
      throw e;
    }
  }

  return startSale(base, clientId);
}
