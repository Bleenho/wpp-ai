import { signPayload } from "../../auth";
import {
  PortError,
  type SystemPort,
  type Service,
  type Slot,
  type ClientRef,
  type BookingRef,
  type CreateBookingInput,
} from "../ports";

/**
 * Adaptador "generic": o sistema implementa um contrato neutro. Cada chamada é
 * POST assinada com HMAC-SHA256 (header `x-wppai-signature`) usando o segredo do
 * sistema. Rotas (base = callbackUrl): /services /slots /clients/find
 * /clients/create /bookings/upcoming /bookings/create /bookings/reschedule-slots
 * /bookings/reschedule /bookings/cancel /bookings/confirm.
 *
 * Em erro de negócio, o sistema responde { ok:false, error } (ou status >=400
 * com { error }) — a mensagem é repassada ao cliente.
 */
export interface GenericConfig {
  callbackUrl: string;
  callbackSecret: string;
}

export class GenericAdapter implements SystemPort {
  constructor(
    private readonly cfg: GenericConfig,
    private readonly tenantRef: string,
  ) {}

  private async call<T>(path: string, payload: Record<string, unknown>): Promise<T> {
    const body = JSON.stringify({ tenantRef: this.tenantRef, ...payload });
    const sig = signPayload(this.cfg.callbackSecret, body);
    const url = `${this.cfg.callbackUrl.replace(/\/+$/, "")}${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-wppai-signature": sig },
        body,
      });
    } catch (e) {
      throw new PortError(`Sistema indisponível: ${(e as Error)?.message ?? ""}`.trim());
    }
    const text = await res.text();
    const json = (text ? safeJson(text) : {}) as Record<string, unknown>;
    if (!res.ok) throw new PortError(asString(json?.error) || `Erro ${res.status}`);
    if (json && json.ok === false) throw new PortError(asString(json.error) || "Operação não permitida.");
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
  createBooking(input: CreateBookingInput): Promise<{ bookingId: string; checkoutUrl?: string }> {
    return this.call("/bookings/create", { ...input });
  }
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
