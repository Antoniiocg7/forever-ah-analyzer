/** Envío de mensajes por la API de bots de Telegram. El token es secreto: solo en servidor. */

const API = "https://api.telegram.org";

export class TelegramError extends Error {}

async function call<T>(token: string, method: string, body?: Record<string, unknown>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}/bot${token}/${method}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string; parameters?: { retry_after?: number } };
    if (json.ok) return json.result as T;
    // 429: Telegram dice cuánto esperar.
    const wait = json.parameters?.retry_after;
    if (res.status === 429 && wait && attempt < 2) {
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    // No se incluye el token en el error.
    throw new TelegramError(`Telegram ${method}: ${json.description ?? `HTTP ${res.status}`}`);
  }
}

/** Envía un mensaje con formato HTML (sin vista previa de enlaces). */
export function sendTelegram(token: string, chatId: string | number, html: string) {
  return call(token, "sendMessage", { chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true });
}

/** Chats privados que han escrito al bot (para conectar el tuyo con `pnpm telegram-setup`). */
export async function recentChats(token: string): Promise<{ id: number; name: string }[]> {
  type Update = { message?: { chat: { id: number; type: string; first_name?: string; username?: string } } };
  const updates = await call<Update[]>(token, "getUpdates");
  const chats = new Map<number, string>();
  for (const u of updates) {
    const c = u.message?.chat;
    if (c && c.type === "private") chats.set(c.id, c.username ? `@${c.username}` : (c.first_name ?? String(c.id)));
  }
  return [...chats].map(([id, name]) => ({ id, name }));
}

/** Escapa texto para el modo HTML de Telegram. */
export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
