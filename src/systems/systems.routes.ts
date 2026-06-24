import { Router } from "express";
import { z } from "zod";
import { adminAuth } from "../auth";
import { createSystem, listSystems } from "./systems.service";

export const systemsRouter = Router();

const createSchema = z.object({
  name: z.string().min(1),
  callbackUrl: z.string().url(),
  callbackSecret: z.string().min(8),
});

systemsRouter.post("/admin/systems", adminAuth, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Dados inválidos", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const data = await createSystem(parsed.data);
  res.status(201).json({ data });
});

systemsRouter.get("/admin/systems", adminAuth, async (_req, res) => {
  res.json({ data: await listSystems() });
});
