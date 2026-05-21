// components/BackwashSequenceEditor.js
import { totalSequenceMin } from "../lib/backwashDynamics";

const PHASES = [
  { key: "drainDown_min",       label: "Drain down",         desc: "Lower water above media" },
  { key: "backwashWater_min",   label: "Backwash (air+water)", desc: "Air scour / water wash" },
  { key: "fillUp_min",          label: "Fill up",            desc: "Re-fill above media" },
  { key: "filterToWaste_min",   label: "Filter to waste",    desc: "Ripening period to waste" },
  { key: "returnToService_min", label: "Return to service",  desc: "Valve sequencing back online" },
];

export default function BackwashSequenceEditor({ designerId, seq, onChange }) {
  const total = totalSequenceMin(seq);
  const update = (key, value) => onChange({ ...seq, [key]: Math.max(0, Number(value) || 0) });

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <h4 className="font-display text-xl">{designerId} — Backwash sequence</h4>
        <div className="text-right">
          <div className="eyebrow">Total cycle</div>
          <div className="font-mono text-2xl tabular">{total} min</div>
        </div>
      </div>

      <table className="data">
        <thead>
          <tr>
            <th>Phase</th>
            <th>Description</th>
            <th className="text-right">Duration (min)</th>
            <th className="text-right">% of sequence</th>
          </tr>
        </thead>
        <tbody>
          {PHASES.map((p) => (
            <tr key={p.key}>
              <td style={{ fontWeight: 600 }}>{p.label}</td>
              <td style={{ color: "var(--ink-500)", fontStyle: "italic", fontFamily: "Source Serif 4, serif" }}>{p.desc}</td>
              <td className="num">
                <input type="number" min="0" max="60" step="1" value={seq[p.key]}
                  onChange={(e) => update(p.key, e.target.value)}
                  style={{ width: 60, textAlign: "right" }} />
              </td>
              <td className="num">{total > 0 ? ((seq[p.key] / total) * 100).toFixed(0) : 0}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-xs mt-3 italic" style={{ color: "var(--ink-500)", fontFamily: "Source Serif 4, serif" }}>
        Sequencing policy: bank-wide single backwash. Only one filter may be in any backwash phase at a time. Subsequent BWs queue until the current one returns to service.
      </p>
    </div>
  );
}
