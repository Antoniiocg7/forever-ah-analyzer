"use client";

import { useState, useTransition } from "react";
import { readAhledgerFile } from "@/lib/ahledger";
import { uploadPlayerData } from "./actions";

/** Lee AHledger.lua en el navegador y sube solo lo necesario (inventario y libro). */
export function AddonUpload() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-2">
      <label className="btn-ghost w-full cursor-pointer sm:w-auto">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M12 16V4M6 10l6-6 6 6M4 20h16" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {pending ? "Subiendo…" : "Elegir AHledger.lua y subir"}
        <input
          type="file"
          accept=".lua"
          className="sr-only"
          disabled={pending}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setMsg(null);
            try {
              const data = readAhledgerFile(await file.text());
              start(async () => {
                const r = await uploadPlayerData(JSON.stringify(data));
                setMsg(r);
                if (r.ok) window.location.reload();
              });
            } catch (err) {
              setMsg({ ok: false, text: err instanceof Error ? err.message : "No se pudo leer el archivo." });
            }
          }}
        />
      </label>
      {msg && <p className={`text-sm ${msg.ok ? "text-good" : "text-bad"}`}>{msg.text}</p>}
    </div>
  );
}
