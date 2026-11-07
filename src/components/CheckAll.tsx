"use client";

export function CheckAll({ name = "ids" }: { name?: string }) {
  return (
    <input
      type="checkbox"
      aria-label="Selecionar todas"
      onChange={(e) =>
        document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`).forEach((c) => (c.checked = e.target.checked))
      }
    />
  );
}
