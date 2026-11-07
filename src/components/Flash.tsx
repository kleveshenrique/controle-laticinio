export function Flash({ erro, ok }: { erro?: string; ok?: string }) {
  if (!erro && !ok) return null;
  return (
    <div
      role={erro ? "alert" : "status"}
      className={`mb-4 rounded-md border px-3 py-2 text-sm ${erro ? "border-red-200 bg-red-50 text-red-800" : "border-brand-600/30 bg-brand-50 text-brand-700"}`}
    >
      {erro ?? ok}
    </div>
  );
}
