import { z } from "zod";

const supabaseSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

const blizzardSchema = z.object({
  BLIZZARD_CLIENT_ID: z.string().min(1),
  BLIZZARD_CLIENT_SECRET: z.string().min(1),
  BLIZZARD_REGION: z.string().min(1).default("eu"),
  BLIZZARD_RULESET_ID: z.coerce.number().int().optional(),
});

/** Valida las variables de entorno y lanza un error legible si falta alguna. */
function parseEnv<S extends z.ZodObject>(schema: S): z.infer<S> {
  const raw = Object.fromEntries(Object.keys(schema.shape).map((k) => [k, process.env[k] === "" ? undefined : process.env[k]]));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Faltan variables de entorno o son inválidas: ${missing}. Mira .env.example.`);
  }
  return parsed.data;
}

export const supabaseEnv = () => parseEnv(supabaseSchema);
export const blizzardEnv = () => parseEnv(blizzardSchema);

export function isConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
