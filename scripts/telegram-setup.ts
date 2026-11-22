// Conecta tu chat de Telegram con las alertas.
// 1) Crea el bot con @BotFather y pon el token en .env.local como TELEGRAM_BOT_TOKEN.
// 2) Escríbele cualquier cosa a tu bot desde Telegram.
// 3) pnpm telegram-setup
import { existsSync } from "node:fs";
import { supabaseAdmin } from "../src/lib/supabase";
import { recentChats, sendTelegram } from "../src/lib/telegram";

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Falta TELEGRAM_BOT_TOKEN en .env.local (te lo da @BotFather).");

  const chats = await recentChats(token);
  if (chats.length === 0) {
    console.log("Tu bot no ha recibido mensajes todavía. Ábrelo en Telegram, pulsa Iniciar (o escribe 'hola') y vuelve a ejecutar esto.");
    return;
  }
  if (chats.length > 1) console.log(`Varios chats han escrito al bot: ${chats.map((c) => c.name).join(", ")}. Uso el último: ${chats.at(-1)!.name}.`);
  const chat = chats.at(-1)!;

  const { error } = await supabaseAdmin().from("settings").upsert({ key: "telegram_chat_id", value: String(chat.id) });
  if (error) throw new Error(error.message);
  await sendTelegram(token, chat.id, "✅ <b>Forever AH</b> conectado. Aquí te llegarán los chollos, tus avisos de precio y el resumen diario.");
  console.log(`Conectado el chat de ${chat.name}. Te he enviado un mensaje de prueba.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
