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
 * Adaptador do Agendota. `tenantRef` é o SLUG do negócio.
 *
 *  - LEITURAS reusam a API pública existente:
 *      GET /api/public/{slug}/services      (serviços)
 *      GET /api/public/{slug}/availability  (horários)
 *  - ESCRITAS e lookup por telefone usam um endpoint CONFIÁVEL (x-api-key), pois
 *    a API pública é protegida por OTP de e-mail / token assinado (segurança de
 *    navegador) e não serve para um robô servidor:
 *      base /api/integrations/wpp/*  (a implementar no Agendota — ver README)
 */
export interface AgendotaConfig {
  baseUrl: string;
  apiKey: string;
}

interface RawService {
  id: string;
  name: string;
  price: number;
  duration: number;
}
interface RawSlot {
  startTime: string;
  professionalId: string;
  professionalName: string;
}

export class AgendotaAdapter implements SystemPort {
  private readonly base: string;
  constructor(
    private readonly cfg: AgendotaConfig,
    private readonly slug: string,
  ) {
    this.base = cfg.baseUrl.replace(/\/+$/, "");
  }

  // ---- API pública (sem auth) ----------------------------------------------

  async listServices(): Promise<{ services: Service[] }> {
    const data = await this.get<{ services: RawService[] }>(`/api/public/${this.slug}/services`, false);
    const services = (data.services ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      price: s.price,
      durationMin: s.duration,
    }));
    return { services };
  }

  async findSlots(serviceIds: string[], date: string, professionalId?: string): Promise<{ slots: Slot[] }> {
    const qs = new URLSearchParams({ date, serviceIds: serviceIds.join(",") });
    if (professionalId) qs.set("professionalId", professionalId);
    const slots = await this.get<RawSlot[]>(`/api/public/${this.slug}/availability?${qs.toString()}`, false);
    return { slots: (slots ?? []).map((s) => ({ iso: s.startTime, professionalId: s.professionalId, professionalName: s.professionalName })) };
  }

  // ---- Endpoint confiável (x-api-key) --------------------------------------

  findClient(phone: string): Promise<{ client: ClientRef | null }> {
    return this.get(`/api/integrations/wpp/${this.slug}/clients?phone=${encodeURIComponent(phone)}`, true);
  }
  createClient(phone: string, name: string): Promise<{ client: ClientRef }> {
    return this.post(`/api/integrations/wpp/${this.slug}/clients`, { phone, name });
  }
  upcomingBookings(clientId: string): Promise<{ bookings: BookingRef[] }> {
    return this.get(`/api/integrations/wpp/${this.slug}/bookings/upcoming?clientId=${encodeURIComponent(clientId)}`, true);
  }
  createBooking(input: CreateBookingInput): Promise<{ bookingId: string; checkoutUrl?: string }> {
    return this.post(`/api/integrations/wpp/${this.slug}/bookings`, { ...input });
  }
  rescheduleSlots(bookingId: string, date: string): Promise<{ slots: Slot[] }> {
    return this.get(
      `/api/integrations/wpp/${this.slug}/bookings/reschedule-slots?bookingId=${encodeURIComponent(bookingId)}&date=${encodeURIComponent(date)}`,
      true,
    );
  }
  rescheduleBooking(bookingId: string, startTime: string, professionalId: string): Promise<{ ok: boolean }> {
    return this.post(`/api/integrations/wpp/${this.slug}/bookings/reschedule`, { bookingId, startTime, professionalId });
  }
  cancelBooking(bookingId: string): Promise<{ ok: boolean; refundLabel?: string }> {
    return this.post(`/api/integrations/wpp/${this.slug}/bookings/cancel`, { bookingId });
  }
  confirmBooking(bookingId: string): Promise<{ ok: boolean }> {
    return this.post(`/api/integrations/wpp/${this.slug}/bookings/confirm`, { bookingId });
  }

  // ---- HTTP helpers --------------------------------------------------------

  private async get<T>(path: string, auth: boolean): Promise<T> {
    return this.request<T>("GET", path, undefined, auth);
  }
  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return this.request<T>("POST", path, body, true);
  }

  private async request<T>(
    method: string,
    path: string,
    body: Record<string, unknown> | undefined,
    auth: boolean,
  ): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (auth) headers["x-api-key"] = this.cfg.apiKey;
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        method,
        headers,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch (e) {
      throw new PortError(`Agendota indisponível: ${(e as Error)?.message ?? ""}`.trim());
    }
    const text = await res.text();
    const json = (text ? safeJson(text) : {}) as Record<string, unknown>;
    if (!res.ok) throw new PortError(asString(json?.error) || `Erro ${res.status}`);
    // Agendota responde { data: ... } no sucesso.
    return ("data" in json ? (json.data as T) : (json as T));
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
