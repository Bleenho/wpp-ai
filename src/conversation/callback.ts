import { signPayload } from "../auth";

/**
 * Cliente do "callback": como o wpp-ai EXECUTA as ações de domínio chamando de
 * volta o sistema consumidor (ex.: Agendota) via HTTP. Cada chamada é assinada
 * com HMAC-SHA256 (header `x-wppai-signature`) usando o segredo do sistema.
 *
 * Contrato esperado no sistema (todas POST, base = system.callbackUrl):
 *   /services            { tenantRef }                              -> { services: Service[] }
 *   /slots               { tenantRef, serviceIds, date, proId? }    -> { slots: Slot[] }
 *   /clients/find        { tenantRef, phone }                       -> { client: Client|null }
 *   /clients/create      { tenantRef, phone, name }                 -> { client: Client }
 *   /bookings/upcoming   { tenantRef, clientId }                    -> { bookings: BookingRef[] }
 *   /bookings/create     { tenantRef, clientId, serviceIds, professionalId, startTime }
 *                                                                    -> { bookingId, checkoutUrl? }
 *   /bookings/reschedule-slots { tenantRef, bookingId, date }       -> { slots: Slot[] }
 *   /bookings/reschedule { tenantRef, bookingId, startTime, professionalId } -> { ok, error? }
 *   /bookings/cancel     { tenantRef, bookingId }                   -> { ok, refundLabel?, error? }
 *   /bookings/confirm    { tenantRef, bookingId }                   -> { ok, error? }
 *
 * Em erro de regra de negócio, o sistema deve responder { ok:false, error } ou
 * um status >= 400 com { error } — a mensagem é repassada ao cliente no chat.
 */

export interface Service {
  id: string;
  name: string;
  price: number;
  durationMin: number;
}
export interface Slot {
  iso: string;
  professionalId: string;
  professionalName: string;
}
export interface ClientRef {
  id: string;
  name: string;
}
export interface BookingRef {
  id: string;
  label: string;
}

export class CallbackError extends Error {}

export interface SystemRef {
  callbackUrl: string;
  callbackSecret: string;
}

export class Caller {
  constructor(
    private readonly system: SystemRef,
    private readonly tenantRef: string,
  ) {}

  private async call<T>(path: string, payload: Record<string, unknown>): Promise<T> {
    const body = JSON.stringify({ tenantRef: this.tenantRef, ...payload });
    const sig = signPayload(this.system.callbackSecret, body);
    const url = `${this.system.callbackUrl.replace(/\/+$/, "")}${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-wppai-signature": sig },
        body,
      });
    } catch (e) {
      throw new CallbackError(`Sistema indisponível: ${(e as Error)?.message ?? ""}`.trim());
    }
    const text = await res.text();
    const json = (text ? safeJson(text) : {}) as Record<string, unknown>;
    if (!res.ok) throw new CallbackError(asString(json?.error) || `Erro ${res.status}`);
    if (json && json.ok === false) throw new CallbackError(asString(json.error) || "Operação não permitida.");
    return json as T;
  }

  listServices(): Promise<{ services: Service[] }> {
    return this.call("/services", {});
  }
  findSlots(serviceIds: string[], date: string, professionalId?: string): Promise<{ slots: Slot[] }> {
    return this.call("/slots", { serviceIds, date, professionalId });
  }
  findClient(phone: string): Promise<{ client: ClientRef | null }> {
    return this.call("/clients/find", { phone });
  }
  createClient(phone: string, name: string): Promise<{ client: ClientRef }> {
    return this.call("/clients/create", { phone, name });
  }
  upcomingBookings(clientId: string): Promise<{ bookings: BookingRef[] }> {
    return this.call("/bookings/upcoming", { clientId });
  }
  createBooking(input: {
    clientId: string;
    serviceIds: string[];
    professionalId: string;
    startTime: string;
  }): Promise<{ bookingId: string; checkoutUrl?: string }> {
    return this.call("/bookings/create", input);
  }
  /** Horários elegíveis para remarcar este booking (o sistema aplica a política). */
  rescheduleSlots(bookingId: string, date: string): Promise<{ slots: Slot[] }> {
    return this.call("/bookings/reschedule-slots", { bookingId, date });
  }
  rescheduleBooking(bookingId: string, startTime: string, professionalId: string): Promise<{ ok: boolean }> {
    return this.call("/bookings/reschedule", { bookingId, startTime, professionalId });
  }
  cancelBooking(bookingId: string): Promise<{ ok: boolean; refundLabel?: string }> {
    return this.call("/bookings/cancel", { bookingId });
  }
  confirmBooking(bookingId: string): Promise<{ ok: boolean }> {
    return this.call("/bookings/confirm", { bookingId });
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}
