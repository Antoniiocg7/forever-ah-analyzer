import { timingSafeEqual } from "node:crypto";

/** ¿Se pide la contraseña de administración? En local (pnpm dev) no; publicada, sí. */
export const adminTokenRequired = () => process.env.NODE_ENV === "production";

export function adminTokenOk(given: string): boolean {
  if (!adminTokenRequired()) return true;
  const expected = process.env.ADMIN_TOKEN ?? "";
  if (!expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
