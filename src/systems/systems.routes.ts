import { Router } from "express";
import { z } from "zod";
import { adminAuth } from "../auth";
import { createSystem, listSystems } from "./systems.service";

export const systemsRouter = Router();

const createSchema = z
  .object({
    name: z.string().min(1),
    adapter: z.enum(["generic", "agendota"]).default("generic"),
    // Adaptador "agendota": { baseUrl, apiKey }.
    config: z.record(z.unknown()).optional(),
    // Adaptador "generic": contrato HMAC.
    callbackUrl: z.string().url().optional(),
    callbackSecret: z.string().min(8).optional(),
  })
  .refine(
    (v) =>
      v.adapter === "generic"
        ? Boolean(v.callbackUrl && v.callbackSecret)
        : Boolean((v.config as { baseUrl?: string; apiKey?: string })?.baseUrl && (v.config as { apiKey?: string })?.apiKey),
    { message: "generic exige callbackUrl+callbackSecret; agendota exige config.baseUrl+config.apiKey" },
  );

systemsRouter.post("/admin/systems", adminAuth, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Dados inválidos", details: parsed.error.flatten() });
    return;
  }
  const data = await createSystem(parsed.data);
  res.status(201).json({ data });
});

systemsRouter.get("/admin/systems", adminAuth, async (_req, res) => {
  res.json({ data: await listSystems() });
});
