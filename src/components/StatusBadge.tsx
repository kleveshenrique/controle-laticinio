import { STATUS } from "@/lib/format";

export function StatusBadge({ status }: { status: keyof typeof STATUS }) {
  const s = STATUS[status];
  return <span className={`inline-block whitespace-nowrap rounded border px-2 py-0.5 text-xs ${s.cls}`}>{s.label}</span>;
}
