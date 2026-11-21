import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

let client: SupabaseClient | null = null;

/** Cliente con la service key. Solo para servidor y scripts: nunca lo importes en un componente cliente. */
export function supabaseAdmin(): SupabaseClient {
  if (!client) {
    const env = supabaseEnv();
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export type HouseRow = {
  id: number;
  region: string;
  name: string;
  faction: "alliance" | "horde" | "neutral" | "unknown";
  ruleset_guess: string | null;
  label: string | null;
  tracked: boolean;
  auction_count: number | null;
  probed_at: string | null;
};

export type LatestPriceRow = {
  house_id: number;
  fetched_at: string;
  item_id: number;
  min_buyout: number;
  p15_market: number;
  qty: number;
  num_auctions: number;
  /** Mediana del precio de mercado de los últimos 7 días. */
  market_7d: number | null;
  /** ESTIMACIÓN de ventas por día (media de 7 días). */
  sold_per_day: number | null;
  name_en: string | null;
  quality: string | null;
  icon_url: string | null;
  vendor_sell: number | null;
  vendor_buy: number | null;
  vendor_sold: boolean | null;
  /** 1 − mínimo / mediana de 7 días: 0,2 = un 20% más barato de lo normal. */
  discount: number | null;
};
