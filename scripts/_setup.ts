import { existsSync } from "node:fs";
import { BlizzardClient } from "../src/lib/blizzard/client";
import { blizzardEnv } from "../src/lib/env";
import { supabaseAdmin } from "../src/lib/supabase";

/** Carga .env.local (en CI las variables vienen de los secretos) y crea los clientes. */
export async function setup() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const env = blizzardEnv();
  const blizzard = new BlizzardClient({
    clientId: env.BLIZZARD_CLIENT_ID,
    clientSecret: env.BLIZZARD_CLIENT_SECRET,
    region: env.BLIZZARD_REGION,
  });
  const rulesetId = env.BLIZZARD_RULESET_ID ?? (await blizzard.firstRulesetId());
  return { db: supabaseAdmin(), blizzard, rulesetId };
}
