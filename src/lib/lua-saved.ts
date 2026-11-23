/**
 * Lector de archivos SavedVariables de WoW (WTF/Account/<cuenta>/SavedVariables/*.lua).
 * Solo entiende lo que escribe el juego: asignaciones `Nombre = valor` con tablas, cadenas, números,
 * booleanos y nil. No ejecuta nada. Pensado para archivos grandes (20 MB): un solo recorrido.
 *
 * Las tablas con claves 1..n consecutivas (o sin claves) se devuelven como arrays; el resto, como objetos.
 */

export type LuaValue = string | number | boolean | null | LuaValue[] | { [key: string]: LuaValue };

export class LuaParseError extends Error {}

export function parseSavedVariables(src: string): Record<string, LuaValue> {
  let i = 0;
  const n = src.length;
  const out: Record<string, LuaValue> = {};

  const fail = (msg: string): never => {
    const line = src.slice(0, i).split("\n").length;
    throw new LuaParseError(`${msg} (línea ${line})`);
  };

  const skip = () => {
    for (;;) {
      while (i < n && /\s/.test(src[i])) i++;
      if (src.startsWith("--", i)) {
        if (src.startsWith("--[[", i)) {
          const end = src.indexOf("]]", i + 4);
          i = end === -1 ? n : end + 2;
        } else {
          const end = src.indexOf("\n", i);
          i = end === -1 ? n : end + 1;
        }
        continue;
      }
      return;
    }
  };

  const ident = (): string => {
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i, i + 256));
    if (!m) fail("se esperaba un nombre");
    i += m![0].length;
    return m![0];
  };

  const ESC: Record<string, string> = { n: "\n", t: "\t", r: "\r", a: "\x07", b: "\b", f: "\f", v: "\v", "\\": "\\", '"': '"', "'": "'", "\n": "\n" };

  const string = (): string => {
    const q = src[i++];
    let s = "";
    let start = i;
    for (;;) {
      if (i >= n) fail("cadena sin cerrar");
      const c = src[i];
      if (c === q) {
        s += src.slice(start, i);
        i++;
        return s;
      }
      if (c === "\\") {
        s += src.slice(start, i);
        const e = src[i + 1];
        if (/\d/.test(e)) {
          const m = /^\d{1,3}/.exec(src.slice(i + 1, i + 4))!;
          s += String.fromCharCode(Number(m[0]));
          i += 1 + m[0].length;
        } else {
          s += ESC[e] ?? e;
          i += 2;
        }
        start = i;
        continue;
      }
      i++;
    }
  };

  const number = (): number => {
    const m = /^-?(?:0x[0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/.exec(src.slice(i, i + 64));
    if (!m) fail("número no válido");
    i += m![0].length;
    return Number(m![0]);
  };

  const value = (): LuaValue => {
    skip();
    const c = src[i];
    if (c === "{") return table();
    if (c === '"' || c === "'") return string();
    if (c === "-" || c === "." || /\d/.test(c)) return number();
    const w = ident();
    if (w === "true") return true;
    if (w === "false") return false;
    if (w === "nil") return null;
    return fail(`valor desconocido "${w}"`);
  };

  const table = (): LuaValue => {
    i++; // {
    const obj: Record<string, LuaValue> = {};
    let pos = 1; // contador de los valores sin clave (independiente de las claves [n])
    for (;;) {
      skip();
      if (src[i] === "}") {
        i++;
        break;
      }
      let key: string | number | null = null;
      if (src[i] === "[") {
        i++;
        skip();
        const k = src[i] === '"' || src[i] === "'" ? string() : number();
        skip();
        if (src[i] !== "]") fail("se esperaba ]");
        i++;
        skip();
        if (src[i] !== "=") fail("se esperaba =");
        i++;
        key = k;
      } else if (/[A-Za-z_]/.test(src[i])) {
        const save = i;
        const w = ident();
        skip();
        if (src[i] === "=" && src[i + 1] !== "=") {
          i++;
          key = w;
        } else i = save;
      }
      const v = value();
      obj[String(key ?? pos++)] = v;
      skip();
      if (src[i] === "," || src[i] === ";") i++;
    }
    // Claves exactamente 1..n → array.
    const keys = Object.keys(obj);
    if (keys.every((k, idx) => k === String(idx + 1))) return keys.map((k) => obj[k]);
    return obj;
  };

  for (;;) {
    skip();
    if (i >= n) break;
    const name = ident();
    skip();
    if (src[i] !== "=") fail("se esperaba =");
    i++;
    out[name] = value();
  }
  return out;
}
