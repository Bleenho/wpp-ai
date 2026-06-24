import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(8090),
  PUBLIC_URL: z.string().url(),
  DATABASE_URL: z.string().url(),
  EVOLUTION_API_URL: z.string().url().optional(),
  EVOLUTION_API_KEY: z.string().optional(),
  EVOLUTION_WEBHOOK_TOKEN: z.string().optional(),
  ADMIN_API_KEY: z.string().min(1),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Variáveis de ambiente inválidas:", parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}

export const env = load();
