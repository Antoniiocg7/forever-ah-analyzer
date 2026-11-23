import Link from "next/link";
import type { ReactNode } from "react";
import { PageIntro } from "@/components/PageIntro";

export const metadata = { title: "Ayuda · Forever AH" };

const SECTIONS: { id: string; title: string; href?: string; text: ReactNode }[] = [
  {
    id: "precios",
    title: "Precios",
    href: "/",
    text: "Buscador de la subasta: cuánto cuesta cada objeto ahora, cuánto suele costar y cuánto se vende. Úsalo para saber a qué precio comprar o publicar algo.",
  },
  {
    id: "chollos",
    title: "Chollos",
    href: "/deals",
    text: "Lo que conviene comprar ahora: objetos por debajo de su precio habitual para revenderlos, cosas que el vendedor (NPC) te paga más de lo que cuestan en la subasta y materiales de raid que suelen subir.",
  },
  {
    id: "profesiones",
    title: "Profesiones",
    href: "/professions",
    text: "Todas las recetas de cada profesión con lo que cuesta fabricarlas y lo que ganas vendiéndolas. Dentro de cada profesión, “Planificar subida” calcula la forma más barata de subir de nivel y te da la lista de la compra.",
  },
  {
    id: "ajustes",
    title: "Ajustes",
    href: "/admin/houses",
    text: "Qué casas de subastas se descargan (tu Alianza y la neutral, Blackwater). Solo hace falta tocarlo una vez. Desde ahí también se configuran las alertas de Telegram.",
  },
];

const TERMS: { term: string; text: ReactNode }[] = [
  { term: "Mínimo ahora", text: "El precio por unidad de la subasta más barata en este momento. Es lo que pagarías si compras ya." },
  { term: "Mercado", text: "La media del 15% de unidades más baratas. Es más estable que el mínimo, que puede ser una sola subasta suelta." },
  {
    term: "Mediana 7 días (7 d)",
    text: "El precio “normal” de la última semana. Si el mínimo de ahora está muy por debajo (en verde, p. ej. −20%), está barato; si está por encima (en rojo), está caro.",
  },
  {
    term: "Vendidos/día",
    text: "ESTIMACIÓN: la API de Blizzard no da ventas, así que se cuentan las subastas que desaparecen antes de caducar (sin contar las que se cancelan para rebajarlas). Con menos de una semana de datos se usan las últimas 24 h.",
  },
  {
    term: "Mucho / normal / poco mercado",
    text: "Lo fácil que es vender algo. Mucho: se vende muchísimo o rota más de la mitad de lo que hay en venta cada día. Poco: menos de 5 ventas al día, puedes tardar en venderlo o no venderlo.",
  },
  { term: "En venta", text: "Unidades publicadas ahora mismo en la subasta y en cuántas subastas están repartidas." },
  { term: "Comisión", text: "Lo que se queda la subasta cuando vendes: 5% en las casas de facción. La de Blackwater (neutral) está sin confirmar." },
  {
    term: "Depósito",
    text: "Lo que pagas al publicar (según la duración: 2, 8 o 24 h). Te lo devuelven si se vende; si caduca o cancelas, lo pierdes.",
  },
  { term: "Vendedor (NPC)", text: "“Paga X” es lo que te da un vendedor del juego por el objeto. “Vende a X” es lo que cuesta comprárselo a él." },
  {
    term: "Beneficio de un chollo",
    text: "Lo que ganarías comprando ahora y revendiendo a la mediana de 7 días, después de la comisión y del riesgo de perder el depósito si no se vende.",
  },
  {
    term: "Cebo",
    text: "1–2 unidades sueltas puestas muy por debajo del resto (≥ 20% más baratas) para que quien publica con Auctionator rebaje a ese precio. No las tomes como referencia: publica por debajo del precio “real” (el primero con volumen). Comprar el cebo suele ser buena idea.",
  },
  {
    term: "Resetear un mercado",
    text: "Comprar todas las unidades baratas de un objeto hasta el siguiente escalón de precio (el “muro”) y volver a publicarlas más caras. Funciona con objetos que se venden bien y que nadie repone enseguida; si se repone rápido, te quedas con el stock.",
  },
  {
    term: "Reset de otro jugador",
    text: "Se detecta cuando, de una hora a otra, alguien compra todo lo barato de un objeto y el mínimo salta más de un 25% (y más de un 15% sobre su precio normal). Si tienes ese objeto, es momento de vender. Se sigue durante 24 h: “aguantó” o “se cayó”, y con ese historial sabes en qué objetos merece la pena resetear tú.",
  },
  { term: "Reposición", text: "ESTIMACIÓN de unidades nuevas que se publican al día (incluye las que se cancelan y se vuelven a poner). Si se repone tanto como se vende, un reset no aguanta." },
  { term: "Profundidad", text: "Cuántas unidades puedes comprar antes de que el precio deje de ser una ganga (≤ 85% de la mediana)." },
  {
    term: "Colores de receta",
    text: "Naranja: siempre sube un punto. Amarillo: casi siempre (≈75%). Verde: a veces (≈25%). Gris: ya no sube. El planificador usa estos colores para elegir qué fabricar.",
  },
  {
    term: "Nivel “aprox.”",
    text: "La API no da el nivel de todas las recetas; esos se estiman y pueden fallar. Si en el juego ves otro, corrígelo en la receta (“corregir”).",
  },
  { term: "Mis profesiones", text: "Las que tienes. Se usan para calcular si te sale más barato fabricar un material (p. ej. fundir barras) que comprarlo." },
  { term: "Casa", text: "Cada subasta es una casa distinta con sus propios precios: la de Alianza (tu facción) y Blackwater (neutral, compartida con la Horda)." },
];

export default function Page() {
  return (
    <div className="space-y-6">
      <PageIntro
        title="Ayuda"
        summary="Para qué sirve cada apartado y qué significa cada número. Las compras siempre las haces tú a mano en el juego: esta web solo te dice qué conviene."
      />

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted">Apartados</h2>
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface text-sm">
          {SECTIONS.map((s) => (
            <li key={s.id} id={s.id} className="px-4 py-3">
              <p className="font-medium">
                {s.href ? (
                  <Link href={s.href} className="text-gold underline">
                    {s.title}
                  </Link>
                ) : (
                  s.title
                )}
              </p>
              <p className="mt-1 text-muted">{s.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted">Glosario</h2>
        <dl className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface text-sm">
          {TERMS.map((t) => (
            <div key={t.term} className="px-4 py-3">
              <dt className="font-medium">{t.term}</dt>
              <dd className="mt-1 text-muted">{t.text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="text-xs text-muted">
        Los precios se descargan de la API oficial de Blizzard una vez por hora. La píldora de arriba (junto a “Forever AH”) dice hace
        cuánto fue la última descarga: verde al día, ámbar con retraso, roja si se ha parado.
      </p>
    </div>
  );
}
