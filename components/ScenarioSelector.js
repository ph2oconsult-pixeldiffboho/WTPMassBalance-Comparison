// components/ScenarioSelector.js
// Tab-style scenario picker (Min / Avg / Max) used at the top of tabs that
// can only show one scenario at a time (Redundancy, BW timeline).

import { SCENARIOS, SCENARIO_SHORT, SCENARIO_LABELS, SCENARIO_COLOURS } from "../lib/filterDefaults";

export default function ScenarioSelector({ scenario, onChange, label = "Showing scenario" }) {
  return (
    <div className="mb-6 flex items-center gap-4">
      <div className="eyebrow">{label}</div>
      <div className="flex" style={{ gap: 0 }}>
        {SCENARIOS.map((s) => {
          const active = s === scenario;
          return (
            <button key={s}
              onClick={() => onChange(s)}
              style={{
                padding: "8px 18px",
                background: active ? SCENARIO_COLOURS[s] : "transparent",
                color: active ? "var(--paper)" : SCENARIO_COLOURS[s],
                border: `1px solid ${SCENARIO_COLOURS[s]}`,
                borderRight: active ? `1px solid ${SCENARIO_COLOURS[s]}` : "none",
                fontFamily: "Inter Tight, sans-serif",
                fontSize: 11,
                fontWeight: active ? 600 : 500,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                cursor: "pointer",
              }}>
              {SCENARIO_SHORT[s]}
            </button>
          );
        })}
      </div>
      <span className="font-display italic text-sm" style={{ color: "var(--ink-500)" }}>
        — {SCENARIO_LABELS[scenario]}
      </span>
    </div>
  );
}
