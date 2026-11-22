"use client";

import type { ComponentProps } from "react";

/** Formulario GET que se envía solo al cambiar un desplegable o casilla (los campos de texto, con Enter). */
export function AutoSubmitForm(props: ComponentProps<"form">) {
  return (
    <form
      {...props}
      onChange={(e) => {
        const t = e.target as HTMLElement;
        if (t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && (t.type === "checkbox" || t.type === "radio"))) {
          e.currentTarget.requestSubmit();
        }
      }}
    />
  );
}
