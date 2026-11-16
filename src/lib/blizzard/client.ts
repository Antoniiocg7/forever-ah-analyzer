import { z } from "zod";
import {
  auctionsResponseSchema,
  extractHouses,
  hrefSchema,
  itemSchema,
  professionIndexSchema,
  professionSchema,
  recipeSchema,
  skillTierSchema,
  rawAuctionSchema,
  rulesetIndexSchema,
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
    opts: { namespace: "dynamic" | "static"; ifModifiedSince?: string | null },
  ): Promise<GetResult> {
    const url = new URL(pathOrUrl, this.host);
    if (url.host !== new URL(this.host).host) throw new Error(`Host inesperado: ${url.host}`);
    url.searchParams.set("namespace", `${opts.namespace}-forever-${this.region}`);
    url.searchParams.set("locale", "en_US");

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

  /** Datos estáticos de un objeto. null si da 404 (pasa con ~43% de los IDs). */
  async item(itemId: number) {
    const res = await this.get(`/data/wow/item/${itemId}`, { namespace: "static" });
    if (res.status !== 200) return null;
    const parsed = itemSchema.safeParse(res.json);
    return parsed.success ? parsed.data : null;
  }

  /** GET a static-forever validado con un esquema. null si da 404 o el formato no encaja. */
  private async staticGet<S extends z.ZodType>(path: string, schema: S): Promise<z.infer<S> | null> {
    const res = await this.get(path, { namespace: "static" });
    if (res.status !== 200) return null;
    const parsed = schema.safeParse(res.json);
    return parsed.success ? parsed.data : null;
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

  recipe(id: number) {
    return this.staticGet(`/data/wow/recipe/${id}`, recipeSchema);
  }
}
