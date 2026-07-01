import { Router } from "express";
import { z } from "zod";
import { systemAuth } from "../auth";
import { sendOtp } from "./otp.service";

export const otpRouter = Router();

const sendSchema = z.object({
  phone: z.string().min(8),
  code: z.string().min(3).max(12),
  ttlMinutes: z.number().int().positive().max(60).optional(),
  purpose: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

/** Entrega um OTP pelo WhatsApp via a instância central do sistema chamador. */
otpRouter.post("/v1/otp/send", systemAuth, async (req, res) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "phone e code obrigatórios" });
    return;
  }
  const data = await sendOtp({ systemId: req.system!.id, ...parsed.data });
  res.json({ data });
});
