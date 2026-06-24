import type { SystemPort } from "../ports";
import { GenericAdapter } from "./generic";
import { AgendotaAdapter, type AgendotaConfig } from "./agendota";

/** Dados do sistema necessários para montar a porta. */
export interface SystemRef {
  adapter: string;
  config: unknown; // JSON específico do adaptador
  callbackUrl: string | null;
  callbackSecret: string | null;
}

/** Monta a SystemPort do sistema (escolhe o adaptador). */
export function makePort(system: SystemRef, tenantRef: string): SystemPort {
  if (system.adapter === "agendota") {
    const cfg = (system.config ?? {}) as Partial<AgendotaConfig>;
    return new AgendotaAdapter({ baseUrl: cfg.baseUrl ?? "", apiKey: cfg.apiKey ?? "" }, tenantRef);
  }
  return new GenericAdapter(
    { callbackUrl: system.callbackUrl ?? "", callbackSecret: system.callbackSecret ?? "" },
    tenantRef,
  );
}
