import { Router } from "express";
import { env } from "../env";
import { handleEvolutionEvent } from "./webhook.service";

export const webhookRouter = Router();

/**
 * Webhook da Evolution (por instância). Sempre 200 (best-effort). Se
 * EVOLUTION_WEBHOOK_TOKEN estiver definido, valida o header `apikey`.
 */
webhookRouter.post("/webhooks/evolution/:instanceName", async (req, res) => {
  if (env.EVOLUTION_WEBHOOK_TOKEN) {
    const apikey = req.header("apikey");
    const auth = req.header("authorization");
    const ok = apikey === env.EVOLUTION_WEBHOOK_TOKEN || auth === `Bearer ${env.EVOLUTION_WEBHOOK_TOKEN}`;
    if (!ok) {
      res.status(401).json({ error: "não autorizado" });
      return;
    }
  }
  await handleEvolutionEvent(req.params.instanceName, req.body);
  res.json({ ok: true });
});
