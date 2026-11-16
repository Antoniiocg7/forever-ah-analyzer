# Forever AH Analyzer

Web personal para analizar la casa de subastas de **World of Warcraft: Forever** (EU · PvP · Alianza).
La especificación completa está en [CLAUDE.md](CLAUDE.md). Hecho hasta ahora: **Fase 0** (identificar la casa) y **Fase 1** (ingesta + explorador de precios).

## Puesta en marcha

1. **Blizzard**: crea un cliente en <https://develop.battle.net> y copia el client ID y el secret.
2. **Supabase**: crea un proyecto y aplica `supabase/migrations/20261116000000_init.sql` (SQL Editor, o `supabase link` + `supabase db push`).
3. Copia `.env.example` a `.env.local` y rellénalo.
4. Descarga las 15 casas y marca la tuya:

   ```bash
   pnpm discover
   pnpm dev
   ```

   Abre <http://localhost:3000/admin/houses>, compara los precios con los del juego y marca "Alliance · PvP" y "Blackwater · PvP".
5. Primera ingesta (repítela cada hora para tener histórico):

   ```bash
   pnpm ingest
   ```

## Ingesta horaria

`.github/workflows/ingest.yml` ejecuta `pnpm ingest` cada hora. Necesita estos secretos en el repo de GitHub:
`BLIZZARD_CLIENT_ID`, `BLIZZARD_CLIENT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

El resumen diario y el borrado de datos horarios de más de 7 días los hace `pg_cron` dentro de Supabase.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `pnpm dev` | Web en local |
| `pnpm discover` | Fase 0: descarga todas las casas y sus precios de referencia |
| `pnpm ingest` | Ingesta de las casas marcadas |
| `pnpm test` | Tests (Vitest) |
| `pnpm typecheck` / `pnpm lint` | Comprobaciones |

## Pendiente de confirmar

- Los IDs de los materiales de referencia (`src/lib/reference-items.ts`) son los de Classic.
- La comisión de la casa neutral (Blackwater): `settings.ah_cut.neutral` está a `null`.
- De dónde sacar nombres e iconos del ~43% de objetos que dan 404 en `static-forever`.
- Ingesta en Edge Function o en GitHub Actions: hay que medir con datos reales (`pnpm ingest` imprime tiempo y memoria).
