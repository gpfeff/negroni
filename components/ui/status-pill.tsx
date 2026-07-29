import { humanize } from "@/lib/contracts/path";

export function StatusPill({
  state,
  tone,
}: {
  state: string;
  tone?: "buyer" | "consumer" | "neutral";
}) {
  return (
    <span className={`status-pill status-${state} ${tone ? `status-${tone}` : ""}`}>
      {humanize(state)}
    </span>
  );
}
