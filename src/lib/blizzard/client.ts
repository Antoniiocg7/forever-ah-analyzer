import { z } from "zod";
import {
  auctionsResponseSchema,
  extractHouses,
  hrefSchema,
  itemClassIndexSchema,
  itemClassSchema,
  itemSchema,
  mediaSchema,
  professionIndexSchema,
  professionSchema,
  recipeSchema,
  skillTierSchema,
  rawAuctionSchema,
  rulesetIndexSchema,
  spanishName,
  type TimeLeft,
} from "./schemas";

export type Listing = {
  auctionId: number;
  itemId: number;
  qty: number;
  /** Precio de compra directa por unidad, en cobre. null = solo puja. */
  unitPrice: number | null;
  timeLeft: TimeLeft;
};

type GetResult =
  | { status: 200; json: unknown; lastModified: string | null }
  | { status: 304 }
  | { status: 404 };

/**
 * - dynamic/static: los de Forever.
 * - classic: catálogo de Classic Era. Forever reutiliza sus IDs y ahí están casi todos los objetos que
 *   dan 404 en static-forever (comprobado el 21-11-2026).
 */
export type Namespace = "dynamic" | "static" | "classic";
const NAMESPACE_PREFIX: Record<Namespace, string> = {
  dynamic: "dynamic-forever",
  static: "static-forever",
  classic: "static-classic1x",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class BlizzardClient {
  private token: { value: string; expiresAt: number } | null = null;
  private readonly host: string;

  constructor(
    private readonly cfg: { clientId: string; clientSecret: string; region?: string },
  ) {
    this.host = `https://${cfg.region ?? "eu"}.api.blizzard.com`;
  }

  get region(): string {
    return this.cfg.region ?? "eu";
  }

  private async getToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const res = await fetch("https://oauth.battle.net/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${this.cfg.clientId}:${this.cfg.clientSecret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) throw new Error(`OAuth de Blizzard falló: HTTP ${res.status}`);
    const body = z.object({ access_token: z.string(), expires_in: z.number() }).parse(await res.json());
    this.token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return body.access_token;
  }

  /** GET con reintentos y backoff en 429/5xx. `pathOrUrl` puede ser un href completo de la API. */
  async get(
    pathOrUrl: string,
    opts: { namespace: Namespace; ifModifiedSince?: string | null; allLocales?: boolean },
  ): Promise<GetResult> {
    const url = new URL(pathOrUrl, this.host);
    if (url.host !== new URL(this.host).host) throw new Error(`Host inesperado: ${url.host}`);
    url.searchParams.set("namespace", `${NAMESPACE_PREFIX[opts.namespace]}-${this.region}`);
    // Sin `locale` la API devuelve todos los idiomas: así se guardan inglés y español de una vez.
    if (!opts.allLocales) url.searchParams.set("locale", "en_US");

    for (let attempt = 0; ; attempt++) {
      const headers: Record<string, string> = { Authorization: `Bearer ${await this.getToken()}` };
      if (opts.ifModifiedSince) headers["If-Modified-Since"] = opts.ifModifiedSince;
      const res = await fetch(url, { headers });

      if (res.status === 304) return { status: 304 };
      if (res.status === 404) return { status: 404 };
      if (res.ok) {
        return { status: 200, json: await res.json(), lastModified: res.headers.get("last-modified") };
      }
      if (res.status === 401 && attempt === 0) {
        this.token = null;
        continue;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < 4) {
        const retryAfter = Number(res.headers.get("retry-after"));
        await sleep(retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt);
        continue;
      }
      throw new Error(`Blizzard API ${url.pathname}: HTTP ${res.status}`);
    }
  }

  async firstRulesetId(): Promise<number> {
    const res = await this.get("/data/wow/ruleset/index", { namespace: "dynamic" });
    if (res.status !== 200) throw new Error("No se pudo leer el índice de rulesets");
    const id = rulesetIndexSchema.parse(res.json).rulesets[0]?.id;
    if (id === undefined) throw new Error("El índice de rulesets está vacío");
    return id;
  }

  /** Índice de casas: [{ id, name }]. La barra final de la URL es obligatoria. */
  async houses(rulesetId: number): Promise<{ id: number; name: string | undefined }[]> {
    const res = await this.get(`/data/wow/ruleset/${rulesetId}/auctions/`, { namespace: "dynamic" });
    return extractHouses(res.status === 200 ? res.json : null);
  }

  /**
   * Descarga las subastas de objeto (vienen dentro del documento de la casa) y los commodities.
   * Devuelve null si la casa no ha cambiado desde `ifModifiedSince`.
   */
  async listings(
    rulesetId: number,
    houseId: number,
    ifModifiedSince?: string | null,
  ): Promise<{ listings: Listing[]; lastModified: string | null; skipped: number } | null> {
    const base = `/data/wow/ruleset/${rulesetId}/auctions/${houseId}`;
    const house = await this.get(base, { namespace: "dynamic", ifModifiedSince });
    if (house.status === 304) return null;
    if (house.status === 404) throw new Error("La casa no existe en la API");

    const out: Listing[] = [];
    let skipped = 0;
    const absorb = (json: unknown) => {
      const parsed = auctionsResponseSchema.safeParse(json);
      if (!parsed.success) return;
      for (const raw of parsed.data.auctions) {
        const a = rawAuctionSchema.safeParse(raw);
        if (!a.success || a.data.quantity <= 0) {
          skipped++;
          continue;
        }
        const { id, item, quantity, unit_price, buyout, time_left } = a.data;
        // `buyout` es el precio del lote entero; `unit_price` (commodities) ya es por unidad.
        const unitPrice =
          unit_price && unit_price > 0 ? unit_price : buyout && buyout > 0 ? Math.round(buyout / quantity) : null;
        out.push({ auctionId: id, itemId: item, qty: quantity, unitPrice, timeLeft: time_left });
      }
    };

    // Algunas casas (112, 115, 118) no traen `auctions`; por si acaso, también se acepta un enlace.
    const doc = house.json as { auctions?: unknown } | null;
    const link = hrefSchema.safeParse(doc?.auctions);
    if (link.success) {
      const auctions = await this.get(link.data.href, { namespace: "dynamic" });
      if (auctions.status === 200) absorb(auctions.json);
    } else {
      absorb(doc);
    }

    const commodities = await this.get(`${base}/commodities`, { namespace: "dynamic" });
    if (commodities.status === 200) absorb(commodities.json);

    return { listings: out, lastModified: house.lastModified, skipped };
  }

  /** Datos estáticos de un objeto. null si da 404 (pasa con ~43% de los IDs en static-forever). */
  async item(itemId: number, namespace: "static" | "classic" = "static") {
    const res = await this.get(`/data/wow/item/${itemId}`, { namespace, allLocales: true });
    if (res.status !== 200) return null;
    const parsed = itemSchema.safeParse(res.json);
    return parsed.success ? { ...parsed.data, name_es: spanishName((res.json as { name?: unknown }).name) } : null;
  }

  /** URL del icono de un objeto (render.worldofwarcraft.com). null si no hay. */
  async itemIcon(itemId: number, namespace: "static" | "classic" = "static"): Promise<string | null> {
    const res = await this.get(`/data/wow/media/item/${itemId}`, { namespace });
    if (res.status !== 200) return null;
    const parsed = mediaSchema.safeParse(res.json);
    return parsed.success ? (parsed.data.assets.find((a) => a.key === "icon")?.value ?? null) : null;
  }

  /** GET a static-forever validado con un esquema. null si da 404 o el formato no encaja. */
  /** GET a static-forever con todos los idiomas: devuelve lo validado (en inglés) más el nombre en español. */
  private async staticGet<S extends z.ZodType>(path: string, schema: S): Promise<(z.infer<S> & { name_es: string | null }) | null> {
    const res = await this.get(path, { namespace: "static", allLocales: true });
    if (res.status !== 200) return null;
    const parsed = schema.safeParse(res.json);
    return parsed.success ? { ...(parsed.data as object), name_es: spanishName((res.json as { name?: unknown }).name) } as z.infer<S> & { name_es: string | null } : null;
  }

  async professions() {
    return (await this.staticGet("/data/wow/profession/index", professionIndexSchema))?.professions ?? [];
  }

  profession(id: number) {
    return this.staticGet(`/data/wow/profession/${id}`, professionSchema);
  }

  skillTier(professionId: number, tierId: number) {
    return this.staticGet(`/data/wow/profession/${professionId}/skill-tier/${tierId}`, skillTierSchema);
  }

  /** Pares inglés → español de todas las clases y subclases de objeto. */
  async itemClassNames(): Promise<{ en: string; es: string }[]> {
    const index = await this.staticGet("/data/wow/item-class/index", itemClassIndexSchema);
    const out = new Map<string, string>();
    for (const c of index?.item_classes ?? []) {
      const cls = await this.staticGet(`/data/wow/item-class/${c.id}`, itemClassSchema);
      for (const n of [cls?.name, ...(cls?.item_subclasses ?? []).map((s) => s.name)]) {
        if (n?.en && n.es && !out.has(n.en)) out.set(n.en, n.es);
      }
    }
    return [...out].map(([en, es]) => ({ en, es }));
  }

  recipe(id: number) {
    return this.staticGet(`/data/wow/recipe/${id}`, recipeSchema);
  }
}
