import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { prisma } from "./db";
import { env } from "./env";

/** Sistema autenticado, anexado à request por `systemAuth`. */
export interface AuthedSystem {
  id: string;
  name: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      system?: AuthedSystem;
    }
  }
}

/** Middleware: autentica um sistema consumidor pelo header `x-api-key`. */
export async function systemAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const key = req.header("x-api-key");
  if (!key) {
    res.status(401).json({ error: "x-api-key ausente" });
    return;
  }
  const system = await prisma.system.findUnique({ where: { apiKey: key } });
  if (!system || !system.active) {
    res.status(401).json({ error: "sistema não autorizado" });
    return;
  }
  req.system = { id: system.id, name: system.name };
  next();
}

/** Middleware: protege rotas de administração com a ADMIN_API_KEY. */
export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.header("x-admin-key") !== env.ADMIN_API_KEY) {
    res.status(401).json({ error: "não autorizado" });
    return;
  }
  next();
}

/** Assinatura HMAC-SHA256 (hex) de um corpo, com o segredo do sistema. */
export function signPayload(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}
