export function TwoSidedBand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`two-sided-band ${compact ? "two-sided-band-compact" : ""}`}>
      <div className="side-segment side-buyer">
        <span className="side-kicker">Lead buyer</span>
        <strong>Will this organization accept and work the lead?</strong>
      </div>
      <div className="side-segment side-bridge">
        <span className="side-kicker">Lead product</span>
        <strong>Qualification joins both sides</strong>
      </div>
      <div className="side-segment side-consumer">
        <span className="side-kicker">End customer</span>
        <strong>Why should this person act and trust the path?</strong>
      </div>
    </div>
  );
}
