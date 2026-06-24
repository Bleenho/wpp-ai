import { toZonedTime } from "date-fns-tz";

export function onlyDigits(value: string): string {
  return (value ?? "").replace(/\D/g, "");
}

/** Número BR em formato internacional (dígitos com DDI 55). Null se inválido. */
export function toBrWhatsappNumber(phone: string | null | undefined): string | null {
  const d = onlyDigits(phone ?? "");
  if (d.length < 10) return null;
  return d.startsWith("55") ? d : `55${d}`;
}

/** Remove o DDI 55 para casar com o telefone "local" (10/11 dígitos). */
export function toLocalPhone(raw: string): string {
  const d = onlyDigits(raw);
  if (d.startsWith("55") && d.length >= 12) return d.slice(2);
  return d;
}

export function formatMoneyBRL(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "R$ 0,00";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDate(iso: string | Date, tz = "America/Sao_Paulo"): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("pt-BR", { timeZone: tz });
}

export function formatTime(iso: string | Date, tz = "America/Sao_Paulo"): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: tz });
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function zonedYMD(d: Date, tz: string): string {
  const z = toZonedTime(d, tz);
  return `${z.getFullYear()}-${pad(z.getMonth() + 1)}-${pad(z.getDate())}`;
}

function addDaysYMD(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Interpreta "hoje", "amanhã", "DD/MM" ou "DD/MM/AAAA" -> YYYY-MM-DD (no fuso). */
export function parseDate(text: string, tz: string): string | null {
  const t = text.trim().toLowerCase();
  const today = zonedYMD(new Date(), tz);
  if (t === "hoje") return today;
  if (t === "amanha" || t === "amanhã") return addDaysYMD(today, 1);
  const m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  let yyyy = m[3] ? Number(m[3]) : Number(today.slice(0, 4));
  if (yyyy < 100) yyyy += 2000;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${yyyy}-${pad(mm)}-${pad(dd)}`;
}

/** Interpreta uma escolha numérica de menu (1..max). Null se inválida. */
export function parseChoice(text: string, max: number): number | null {
  const n = parseInt(onlyDigits(text), 10);
  return !Number.isNaN(n) && n >= 1 && n <= max ? n : null;
}

/** Lista numerada ("1- ...\n2- ..."). */
export function numbered(items: string[]): string {
  return items.map((it, i) => `${i + 1}- ${it}`).join("\n");
}

/** Substitui variáveis {chave} em um template. */
export function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
}

export function minutesToLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}
