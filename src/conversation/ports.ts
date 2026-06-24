/**
 * SystemPort — a interface que o motor de conversa usa para falar com um sistema
 * consumidor. Cada sistema tem um ADAPTADOR que implementa esta porta:
 *
 *  - "generic":  o sistema implementa um contrato neutro (callback HMAC).
 *  - "agendota": o wpp-ai mapeia para a API do Agendota (leituras na API pública
 *                existente; escritas num endpoint confiável por API-key).
 *
 * Assim o wpp-ai roda separado e não conhece os detalhes de cada sistema — só a
 * porta. Trocar/adicionar um sistema = adicionar um adaptador.
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

export interface CreateBookingInput {
  clientId: string;
  serviceIds: string[];
  professionalId: string;
  startTime: string;
}

/** Erro de regra de negócio do sistema — a mensagem vai para o cliente no chat. */
export class PortError extends Error {}

export interface SystemPort {
  listServices(): Promise<{ services: Service[] }>;
  findSlots(serviceIds: string[], date: string, professionalId?: string): Promise<{ slots: Slot[] }>;
  findClient(phone: string): Promise<{ client: ClientRef | null }>;
  createClient(phone: string, name: string): Promise<{ client: ClientRef }>;
  upcomingBookings(clientId: string): Promise<{ bookings: BookingRef[] }>;
  createBooking(input: CreateBookingInput): Promise<{ bookingId: string; checkoutUrl?: string }>;
  /** Horários elegíveis para remarcar este booking (o sistema aplica a política). */
  rescheduleSlots(bookingId: string, date: string): Promise<{ slots: Slot[] }>;
  rescheduleBooking(bookingId: string, startTime: string, professionalId: string): Promise<{ ok: boolean }>;
  cancelBooking(bookingId: string): Promise<{ ok: boolean; refundLabel?: string }>;
  confirmBooking(bookingId: string): Promise<{ ok: boolean }>;
}
