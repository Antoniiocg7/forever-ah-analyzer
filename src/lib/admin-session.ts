import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { adminTokenRequired } from "./admin";

/**
 * Sesión de administración para ver datos personales (Mi oro). En local no hace falta; publicada,
 * una cookie httpOnly con una firma derivada de ADMIN_TOKEN (nunca el token en claro).
 */
export const ADMIN_COOKIE = "admin_sesion";

export function sessionValue(): string {
  return createHmac("sha256", process.env.ADMIN_TOKEN ?? "").update("forever-ah:admin").digest("hex");
}

export async function isAdmin(): Promise<boolean> {
  if (!adminTokenRequired()) return true;
  if (!process.env.ADMIN_TOKEN) return false;
  const got = (await cookies()).get(ADMIN_COOKIE)?.value ?? "";
  const want = sessionValue();
  return got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}
