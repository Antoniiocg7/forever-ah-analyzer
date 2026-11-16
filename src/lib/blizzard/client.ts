import { z } from "zod";
import {
  auctionsResponseSchema,
  extractHouseIds,
  houseSchema,
  itemSchema,
  rawAuctionSchema,
  rulesetIndexSchema,
  type House,
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

  async houseIds(rulesetId: number): Promise<number[]> {
    // La barra final es obligatoria.
    const res = await this.get(`/data/wow/ruleset/${rulesetId}/auctions/`, { namespace: "dynamic" });
    return extractHouseIds(res.status === 200 ? res.json : null);
  }

  async house(rulesetId: number, houseId: number): Promise<House | null> {
    const res = await this.get(`/data/wow/ruleset/${rulesetId}/auctions/${houseId}`, { namespace: "dynamic" });
    if (res.status !== 200) return null;
    const parsed = houseSchema.safeParse(res.json);
    return parsed.success ? parsed.data : { id: houseId, name: undefined, auctions: undefined, commodities: undefined };
  }

  /**
   * Descarga commodities + subastas de objeto de una casa.
   * Devuelve null si los commodities no han cambiado desde `ifModifiedSince`.
   */
  async listings(
    rulesetId: number,
    house: House,
    ifModifiedSince?: string | null,
  ): Promise<{ listings: Listing[]; lastModified: string | null; skipped: number } | null> {
    const base = `/data/wow/ruleset/${rulesetId}/auctions/${house.id}`;
    const commodities = await this.get(`${base}/commodities`, { namespace: "dynamic", ifModifiedSince });
    if (commodities.status === 304) return null;

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
        const unitPrice =
          unit_price && unit_price > 0 ? unit_price : buyout && buyout > 0 ? Math.round(buyout / quantity) : null;
        out.push({ auctionId: id, itemId: item, qty: quantity, unitPrice, timeLeft: time_left });
      }
    };

    if (commodities.status === 200) absorb(commodities.json);
    if (house.auctions?.href) {
      const auctions = await this.get(house.auctions.href, { namespace: "dynamic" });
      if (auctions.status === 200) absorb(auctions.json);
    }
    return {
      listings: out,
      lastModified: commodities.status === 200 ? commodities.lastModified : null,
      skipped,
    };
  }

  /** Datos estáticos de un objeto. null si da 404 (pasa con ~43% de los IDs). */
  async item(itemId: number) {
    const res = await this.get(`/data/wow/item/${itemId}`, { namespace: "static" });
    if (res.status !== 200) return null;
    const parsed = itemSchema.safeParse(res.json);
    return parsed.success ? parsed.data : null;
  }
}
