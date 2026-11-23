import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Hint } from "@/components/Hint";
import { Loading, SetupNotice } from "@/components/notices";
import { PageIntro } from "@/components/PageIntro";
import { adminTokenRequired } from "@/lib/admin";
import { alertConfig } from "@/lib/alerts/run";
import { isConfigured } from "@/lib/env";
import { pick } from "@/lib/lang";
import { nameLang } from "@/lib/lang-server";
import { formatMoney } from "@/lib/money";
import { marketData, professionSummaries } from "@/lib/professions/queries";
import { trackedHouses } from "@/lib/queries";
import { supabaseAdmin } from "@/lib/supabase";
import { removeWatch, saveAlertSettings, sendTestAlert } from "./actions";

const MESSAGES: Record<string, { text: string; ok: boolean }> = {
  ok: { text: "Guardado.", ok: true },
  prueba: { text: "Mensaje de prueba enviado: mira Telegram.", ok: true },
  quitado: { text: "Aviso quitado.", ok: true },
  token: { text: "La contraseña de administración no es correcta.", ok: false },
  invalid: { text: "Algún valor no es válido.", ok: false },
  "sin-telegram": { text: "Telegram no está configurado todavía (mira los pasos de abajo).", ok: false },
  "error-telegram": { text: "Telegram rechazó el mensaje. Revisa el token o vuelve a conectar el chat.", ok: false },
};

const KIND: Record<string, string> = { deal: "Chollo", watch: "Seguimiento", leveling: "Profesión", reset: "Reset de otro", digest: "Resumen", test: "Prueba" };

export default function Page({ searchParams }: PageProps<"/alerts">) {
  return (
    <div className="space-y-4">
      <Link href="/admin/houses" className="text-sm text-muted">
        ← Ajustes
      </Link>
      <PageIntro
        title="Alertas de Telegram"
        summary="Mensajes al móvil cuando aparece un chollo, cuando un precio que vigilas cruza tu límite o cuando es buen momento para subir una profesión."
        steps={[
          "Conecta el bot de Telegram (pasos en “Estado”). Solo se hace una vez.",
          "En “Qué avisar” elige a partir de cuánto beneficio quieres que te avise de un chollo y a qué hora quieres el resumen diario.",
          "Para vigilar un objeto concreto, entra en su ficha (desde Precios) y usa “Avísame por Telegram”.",
          "Para que te avise cuando subir una profesión salga barato, añádela abajo con el tramo de niveles que te interesa.",
        ]}
      />
      <Suspense fallback={<Loading />}>
        <Alerts searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Alerts({ searchParams }: Pick<PageProps<"/alerts">, "searchParams">) {
  await connection();
  if (!isConfigured()) return <SetupNotice />;
  const db = supabaseAdmin();
  const [sp, { settings: s, chatId }, professions, houses, lang, watchRows, sentRows] = await Promise.all([
    searchParams,
    alertConfig(db),
    professionSummaries(),
    trackedHouses(),
    nameLang(),
    db.from("watchlist").select("item_id, target_price, direction").order("created_at"),
    db.from("alerts_sent").select("kind, key, sent_at, payload").not("key", "is", null).order("sent_at", { ascending: false }).limit(10),
  ]);
  const msg = typeof sp.msg === "string" ? MESSAGES[sp.msg] : undefined;
  const needToken = adminTokenRequired();
  const hasToken = Boolean(process.env.TELEGRAM_BOT_TOKEN);
  const watch = watchRows.data ?? [];
  const { markets, info } = watch.length && houses[0] ? await marketData(houses[0].id, watch.map((w) => w.item_id as number)) : { markets: new Map(), info: new Map() };
  const tokenField = needToken && <input name="token" type="password" required placeholder="Contraseña" className="input" autoComplete="current-password" aria-label="Contraseña de administración" />;
  const levelingRows = [...s.leveling, { slug: "", from: 1, to: 300 }];

  return (
    <div className="space-y-5">
      {msg && <p className={`card text-sm ${msg.ok ? "text-good" : "text-bad"}`}>{msg.text}</p>}

      <section className="card space-y-2 text-sm">
        <h2 className="font-medium">Estado</h2>
        <p>
          Bot: {hasToken ? <span className="text-good">configurado</span> : <span className="text-bad">sin token</span>} · Chat:{" "}
          {chatId ? <span className="text-good">conectado</span> : <span className="text-bad">sin conectar</span>} · Alertas:{" "}
          {s.enabled ? <span className="text-good">activadas</span> : <span className="text-muted">desactivadas</span>}
        </p>
        <p className="text-xs text-muted">Se revisan después de cada descarga horaria (a los :35). El resumen diario sale a partir de las {s.dailyHour}:00 (hora de Polonia).</p>
        {hasToken && chatId && (
          <form action={sendTestAlert} className="flex gap-2">
            {tokenField}
            <button className="btn shrink-0">Enviar mensaje de prueba</button>
          </form>
        )}
        {(!hasToken || !chatId) && (
          <ol className="list-decimal space-y-1 pl-5 text-xs text-muted">
            <li>En Telegram, habla con @BotFather, envía /newbot y sigue los pasos. Te da un token.</li>
            <li>Pon el token en .env.local como TELEGRAM_BOT_TOKEN (y en GitHub y Vercel: lo hace Claude).</li>
            <li>Escribe cualquier cosa a tu bot y ejecuta pnpm telegram-setup en el Mac para conectar tu chat.</li>
          </ol>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="text-sm font-medium">Qué avisar</h2>
        <form action={saveAlertSettings} className="space-y-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="enabled" defaultChecked={s.enabled} className="h-4 w-4 accent-[#e0b354]" />
            Alertas activadas
            <span className="text-xs text-muted">(desmárcalo para pausarlas sin perder la configuración)</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="flex items-center gap-1 text-muted">
                Avisar de chollos desde
                <Hint label="Beneficio mínimo de un chollo">Solo te avisa de chollos que dejen al menos este beneficio en total. Escríbelo como 5g o 2g 50s.</Hint>
              </span>
              <input className="input mt-1" name="min_deal_profit" defaultValue={formatMoney(s.minDealProfit)} placeholder="5g" required />
            </label>
            <label>
              <span className="flex items-center gap-1 text-muted">
                Máx. chollos por hora
                <Hint label="Máximo de avisos por hora">Para no llenarte el móvil: como mucho este número de chollos en cada revisión horaria (los mejores). Un mismo objeto no se repite en 6 h.</Hint>
              </span>
              <input className="input mt-1" type="number" name="max_per_run" min={0} max={20} defaultValue={s.maxPerRun} required />
            </label>
            <label>
              <span className="flex items-center gap-1 text-muted">
                Hora del resumen diario
                <Hint label="Resumen diario">Una vez al día, a partir de esta hora (0–23, hora de Polonia), te manda un resumen con los mejores chollos.</Hint>
              </span>
              <input className="input mt-1" type="number" name="daily_hour" min={0} max={23} defaultValue={s.dailyHour} required />
            </label>
            <label>
              <span className="text-muted">Nombres en los mensajes</span>
              <select className="input mt-1" name="lang" defaultValue={s.lang}>
                <option value="en">Inglés</option>
                <option value="es">Español</option>
              </select>
            </label>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-muted">
              Avísame cuando subir una profesión salga barato (≥15% menos que una semana normal). Elige la profesión y el tramo: desde el
              nivel → hasta el nivel.
            </legend>
            <div className="grid grid-cols-[1fr_4.5rem_4.5rem] gap-2 text-xs text-muted" aria-hidden>
              <span>Profesión</span>
              <span>Desde nivel</span>
              <span>Hasta nivel</span>
            </div>
            {levelingRows.map((lv, i) => (
              <div key={i} className="grid grid-cols-[1fr_4.5rem_4.5rem] gap-2">
                <select className="input" name="lv_slug" defaultValue={lv.slug} aria-label="Profesión">
                  <option value="">{i === s.leveling.length ? "Añadir profesión…" : "Quitar"}</option>
                  {professions.map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {pick(p.name, p.name_es, lang)}
                    </option>
                  ))}
                </select>
                <input className="input px-2" type="number" name="lv_from" min={1} max={299} defaultValue={lv.from} aria-label="Desde" />
                <input className="input px-2" type="number" name="lv_to" min={2} max={300} defaultValue={lv.to} aria-label="Hasta" />
              </div>
            ))}
          </fieldset>
          {tokenField}
          <button className="btn w-full sm:w-auto">Guardar qué avisar</button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted">Precios que vigilas</h2>
        {watch.length === 0 ? (
          <p className="card text-sm text-muted">Ninguno. Añádelos desde la ficha de cualquier objeto (“Avísame cuando…”).</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface text-sm">
            {watch.map((w) => {
              const id = w.item_id as number;
              return (
                <li key={id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <Link href={`/item/${id}`} className="min-w-0">
                    <span className="block truncate">{pick(info.get(id)?.name, info.get(id)?.nameEs, lang) ?? `Objeto #${id}`}</span>
                    <span className="text-xs text-muted">
                      {w.direction === "below" ? "por debajo de" : "por encima de"} {formatMoney(Number(w.target_price))} · ahora {formatMoney(markets.get(id)?.min)}
                    </span>
                  </Link>
                  <form action={removeWatch} className="flex shrink-0 gap-2">
                    <input type="hidden" name="itemId" value={id} />
                    <input type="hidden" name="back" value="/alerts" />
                    {tokenField}
                    <button className="min-h-9 rounded-lg border border-line px-3 text-muted">Quitar</button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted">Últimos avisos enviados</h2>
        {(sentRows.data ?? []).length === 0 ? (
          <p className="card text-sm text-muted">Todavía ninguno.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface text-xs">
            {(sentRows.data ?? []).map((a) => (
              <li key={`${a.key}-${a.sent_at}`} className="px-4 py-2.5">
                <span className="text-muted">
                  {new Date(a.sent_at as string).toLocaleString("es-ES", { timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "short" })} · {KIND[a.kind as string] ?? a.kind}
                </span>
                <span className="mt-0.5 line-clamp-2 block">{String((a.payload as { html?: string } | null)?.html ?? "").replace(/<[^>]+>/g, "")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
