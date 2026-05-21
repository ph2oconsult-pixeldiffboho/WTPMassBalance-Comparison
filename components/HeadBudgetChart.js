// components/HeadBudgetChart.js
// K (kg/m²/run) vs terminal head required (m).
// Two dropdowns:
//   - Flow scenario: min / avg / max / all
//   - Redundancy condition: N / N-1 / N-2 / all
// Curves drawn for the selected combinations. K observed and available head
// overlays remain. Numerical readout below.

import { useState } from "react";
import { headBudgetCurve, maxKAtHead } from "../lib/filterCalculations";
import { totalBedDepth } from "../lib/filterPhysics";
import { SCENARIO_SHORT, SCENARIO_COLOURS, pickScenarioValue } from "../lib/filterDefaults";

const REDUNDANCY_COLOURS = {
  "N":   "#5A7359",   // sage
  "N-1": "#3F5870",   // slate
  "N-2": "#B0451F",   // rust
};

const REDUNDANCY_ORDER = ["N", "N-1", "N-2"];
const SCENARIO_ORDER = ["min", "avg", "max"];

export default function HeadBudgetChart({
  designerId, filter, flowEnv, envelope, drivingHead_m,
  sharedXMax, sharedYMax,
}) {
  const [scenarioPick, setScenarioPick] = useState("max");
  const [redundancyPick, setRedundancyPick] = useState("all");

  // K observed = the K from the assessment at the chosen scenario (or "max" if showing all flows)
  const K_obs_scenario = scenarioPick === "all" ? "max" : scenarioPick;
  const K_observed = envelope[K_obs_scenario].K_kg_per_m2;
  const K_multiplier = envelope[K_obs_scenario].K_multiplier;

  const bedDepth = totalBedDepth(filter.mediaLayers);
  const K_validity_limit = 4.0 * bedDepth * (K_multiplier || 1.0);
  const ownK_max_chart = Math.min(
    Math.max(K_observed * 2.2, 5.0),
    K_validity_limit * 1.1,
    10.0,
  );
  // Use the shared x-axis max if provided so D1 and D2 charts are visually comparable
  const K_max_chart = sharedXMax != null ? sharedXMax : ownK_max_chart;

  // Build the set of (flow_MLD, scenario, condition) tuples to draw
  const flowsToDraw = scenarioPick === "all" ? SCENARIO_ORDER : [scenarioPick];
  const condsToDraw = redundancyPick === "all" ? REDUNDANCY_ORDER : [redundancyPick];

  // For each (flow scen × redundancy cond), generate a series
  const seriesAll = [];
  for (const flowScen of flowsToDraw) {
    const flow_MLD = pickScenarioValue(flowEnv.designFlow_MLD, flowScen);
    const mult = envelope[flowScen].K_multiplier;
    const { series } = headBudgetCurve({
      filter, flow_MLD, K_multiplier: mult, K_max_kgm2: K_max_chart,
    });
    for (const s of series) {
      if (!condsToDraw.includes(s.key)) continue;
      seriesAll.push({
        ...s,
        flowScen,
        flow_MLD,
        // Colour: if showing all flows in one condition → colour by flow scenario
        // If showing all conditions in one flow → colour by redundancy
        // If showing all of both → colour by redundancy, line style by flow scenario
        colour: redundancyPick === "all" ? REDUNDANCY_COLOURS[s.key] : SCENARIO_COLOURS[flowScen],
        dashArray: scenarioPick === "all"
          ? (flowScen === "min" ? "4 3" : flowScen === "max" ? "8 4" : null)
          : null,
        label: scenarioPick === "all" && redundancyPick === "all"
          ? `${s.key} · ${SCENARIO_SHORT[flowScen]}`
          : scenarioPick === "all"
            ? `${s.key} · ${SCENARIO_SHORT[flowScen]}`
            : `${s.key}`,
      });
    }
  }

  // Compute chart axes — use shared y-max if provided, else auto-scale
  let yMax = drivingHead_m * 1.25;
  for (const s of seriesAll) {
    if (s.infeasible) continue;
    if (s.points && s.points.length > 0) {
      const at_obs = s.points.find((p) => p.K >= K_observed);
      if (at_obs && at_obs.total > yMax) yMax = at_obs.total * 1.15;
    }
    if (s.fixed_m != null && s.fixed_m > yMax) yMax = s.fixed_m * 1.15;
  }
  yMax = Math.ceil(yMax * 2) / 2;
  if (sharedYMax != null) yMax = sharedYMax;
  const xMax = K_max_chart;

  // SVG dimensions
  const W = 560, H = 360;
  const margin = { top: 20, right: 30, bottom: 50, left: 60 };
  const plotW = W - margin.left - margin.right;
  const plotH = H - margin.top - margin.bottom;
  const xScale = (K) => margin.left + (K / xMax) * plotW;
  const yScale = (h) => margin.top + plotH - (h / yMax) * plotH;

  // Path strings
  const seriesPaths = seriesAll.map((s) => {
    if (s.infeasible) return { ...s, path: null };
    const path = s.points
      .filter((p) => p.total <= yMax * 1.05)
      .map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.K).toFixed(1)} ${yScale(p.total).toFixed(1)}`)
      .join(" ");
    return { ...s, path };
  });

  // Readout at K observed for each visible series
  const obsReadout = seriesAll.map((s) => {
    if (s.infeasible) return { ...s, dH_at_obs: null };
    const p = s.points.find((pt) => pt.K >= K_observed);
    return { ...s, dH_at_obs: p ? p.total : null };
  });

  // Max K at available head for each visible series
  const maxKReadout = seriesAll.map((s) => {
    if (s.infeasible) return { ...s, K_max: null };
    const mult = envelope[s.flowScen].K_multiplier;
    const result = maxKAtHead({ filter, flow_MLD: s.flow_MLD, K_multiplier: mult, drivingHead_m });
    const match = result.find((r) => r.key === s.key);
    return { ...s, K_max: match ? match.K_max : null };
  });

  // Axis ticks
  const xTicks = [];
  const xStep = xMax <= 6 ? 1 : 2;
  for (let x = 0; x <= xMax + 0.001; x += xStep) xTicks.push(x);
  const yTicks = [];
  const yStep = yMax <= 4 ? 0.5 : yMax <= 8 ? 1 : 2;
  for (let y = 0; y <= yMax + 0.001; y += yStep) yTicks.push(y);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h4 className="font-display text-xl">{designerId} — Head budget vs K</h4>
        <span className="eyebrow">Available head {drivingHead_m.toFixed(2)} m</span>
      </div>

      {/* Dropdowns */}
      <div className="flex items-end gap-6 mb-4">
        <div>
          <div className="eyebrow mb-1" style={{ fontSize: 9 }}>Flow scenario</div>
          <select value={scenarioPick} onChange={(e) => setScenarioPick(e.target.value)}>
            <option value="min">Min (low envelope)</option>
            <option value="avg">Avg (central estimate)</option>
            <option value="max">Max (peak envelope)</option>
            <option value="all">All three flows</option>
          </select>
        </div>
        <div>
          <div className="eyebrow mb-1" style={{ fontSize: 9 }}>Redundancy condition</div>
          <select value={redundancyPick} onChange={(e) => setRedundancyPick(e.target.value)}>
            <option value="N">N — all filters in service</option>
            <option value="N-1">N-1 — one offline</option>
            <option value="N-2">N-2 — two offline</option>
            <option value="all">All three conditions</option>
          </select>
        </div>
      </div>

      <svg width={W} height={H} style={{ background: "var(--paper-dark)", border: "0.5px solid var(--ink-300)" }}>
        {/* Grid */}
        {yTicks.map((y) => (
          <line key={`gy${y}`} x1={margin.left} y1={yScale(y)} x2={W - margin.right} y2={yScale(y)}
            stroke="var(--ink-300)" strokeWidth="0.4" strokeDasharray="2 2" />
        ))}
        {xTicks.map((x) => (
          <line key={`gx${x}`} x1={xScale(x)} y1={margin.top} x2={xScale(x)} y2={H - margin.bottom}
            stroke="var(--ink-300)" strokeWidth="0.4" strokeDasharray="2 2" />
        ))}

        {/* Axes */}
        <line x1={margin.left} y1={H - margin.bottom} x2={W - margin.right} y2={H - margin.bottom}
          stroke="var(--ink-900)" strokeWidth="1" />
        <line x1={margin.left} y1={margin.top} x2={margin.left} y2={H - margin.bottom}
          stroke="var(--ink-900)" strokeWidth="1" />

        {/* Available driving head — horizontal */}
        <line
          x1={margin.left} y1={yScale(drivingHead_m)}
          x2={W - margin.right} y2={yScale(drivingHead_m)}
          stroke="var(--ink-900)" strokeWidth="1.5" strokeDasharray="6 3"
        />
        <text x={W - margin.right - 5} y={yScale(drivingHead_m) - 4}
          textAnchor="end" fontSize="11" fontFamily="JetBrains Mono, monospace"
          fill="var(--ink-900)" fontWeight="600">
          Avail {drivingHead_m.toFixed(2)} m
        </text>

        {/* K observed — vertical */}
        {K_observed > 0 && K_observed <= xMax && (
          <>
            <line
              x1={xScale(K_observed)} y1={margin.top}
              x2={xScale(K_observed)} y2={H - margin.bottom}
              stroke="var(--rust)" strokeWidth="1.5" strokeDasharray="6 3"
            />
            <text x={xScale(K_observed) + 4} y={margin.top + 12}
              fontSize="10" fontFamily="JetBrains Mono, monospace"
              fill="var(--rust)" fontWeight="600">
              K {K_observed.toFixed(2)}
            </text>
          </>
        )}

        {/* Series curves */}
        {seriesPaths.map((s, idx) => s.path && (
          <g key={`${s.key}-${s.flowScen}-${idx}`}>
            <path
              d={s.path} fill="none"
              stroke={s.colour} strokeWidth="2"
              strokeDasharray={s.dashArray || null}
            />
          </g>
        ))}

        {/* X-axis labels */}
        {xTicks.map((x) => (
          <text key={`tx${x}`} x={xScale(x)} y={H - margin.bottom + 14}
            textAnchor="middle" fontSize="10" fontFamily="JetBrains Mono, monospace"
            fill="var(--ink-700)">{x.toFixed(0)}</text>
        ))}
        {/* Y-axis labels */}
        {yTicks.map((y) => (
          <text key={`ty${y}`} x={margin.left - 6} y={yScale(y) + 3}
            textAnchor="end" fontSize="10" fontFamily="JetBrains Mono, monospace"
            fill="var(--ink-700)">{y.toFixed(yMax <= 4 ? 1 : 0)}</text>
        ))}
        {/* Axis titles */}
        <text x={margin.left + plotW / 2} y={H - 8}
          textAnchor="middle" fontSize="11" fontFamily="Inter Tight, sans-serif"
          fill="var(--ink-900)" fontWeight="500">
          K, solids holding capacity (kg/m²/run)
        </text>
        <text x={14} y={margin.top + plotH / 2}
          textAnchor="middle" fontSize="11" fontFamily="Inter Tight, sans-serif"
          fill="var(--ink-900)" fontWeight="500"
          transform={`rotate(-90 14 ${margin.top + plotH / 2})`}>
          Terminal head required (m)
        </text>
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-2 mb-3" style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}>
        {seriesPaths.filter((s) => s.path).map((s, idx) => (
          <div key={`leg-${idx}`} className="flex items-center gap-1.5">
            <svg width="22" height="6">
              <line x1="0" y1="3" x2="22" y2="3"
                stroke={s.colour} strokeWidth="2"
                strokeDasharray={s.dashArray || null} />
            </svg>
            <span style={{ color: s.colour, fontWeight: 600 }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Readout: terminal head required at K observed */}
      <div className="mt-3" style={{ background: "var(--paper-dark)", border: "0.5px solid var(--ink-300)", padding: 12 }}>
        <div className="eyebrow mb-2">At implied K = {K_observed.toFixed(2)} kg/m²/run, terminal head required</div>
        <table className="data" style={{ fontSize: 11 }}>
          <thead>
            <tr>
              <th>Condition</th>
              <th>Flow</th>
              <th className="text-right">v (m/h)</th>
              <th className="text-right">ΔH required (m)</th>
              <th className="text-right">Margin (m)</th>
              <th className="text-right">Result</th>
            </tr>
          </thead>
          <tbody>
            {obsReadout.map((s, i) => {
              if (s.infeasible) return (
                <tr key={`obs-${i}`} style={{ color: "var(--ink-500)" }}>
                  <td style={{ fontWeight: 600, color: REDUNDANCY_COLOURS[s.key] }}>{s.key}</td>
                  <td>{SCENARIO_SHORT[s.flowScen]} ({s.flow_MLD != null ? s.flow_MLD.toFixed(0) : "—"})</td>
                  <td colSpan="4" style={{ fontStyle: "italic" }}>Infeasible — filter count insufficient</td>
                </tr>
              );
              if (s.dH_at_obs == null) return (
                <tr key={`obs-${i}`} style={{ color: "var(--ink-500)" }}>
                  <td style={{ fontWeight: 600, color: REDUNDANCY_COLOURS[s.key] }}>{s.key}</td>
                  <td>{SCENARIO_SHORT[s.flowScen]} ({s.flow_MLD.toFixed(0)})</td>
                  <td className="num">{s.v_mh != null ? s.v_mh.toFixed(2) : "—"}</td>
                  <td colSpan="3" style={{ fontStyle: "italic" }}>K implied beyond chart range — increase chart or check inputs</td>
                </tr>
              );
              const margin = drivingHead_m - s.dH_at_obs;
              const pass = margin >= 0;
              return (
                <tr key={`obs-${i}`}>
                  <td style={{ fontWeight: 600, color: REDUNDANCY_COLOURS[s.key] }}>{s.key}</td>
                  <td style={{ color: SCENARIO_COLOURS[s.flowScen] }}>{SCENARIO_SHORT[s.flowScen]} ({s.flow_MLD != null ? s.flow_MLD.toFixed(0) : "—"})</td>
                  <td className="num">{s.v_mh.toFixed(2)}</td>
                  <td className="num">{s.dH_at_obs.toFixed(2)}</td>
                  <td className="num" style={{ color: pass ? "var(--ink-900)" : "var(--rust)", fontWeight: 600 }}>
                    {margin >= 0 ? "+" : ""}{margin.toFixed(2)}
                  </td>
                  <td className="num" style={{ color: pass ? "var(--ink-900)" : "var(--rust)", fontWeight: 700 }}>
                    {pass ? "✓ PASS" : "✗ FAIL"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Readout: max K at available head */}
      <div className="mt-3" style={{ background: "var(--paper-dark)", border: "0.5px solid var(--ink-300)", padding: 12 }}>
        <div className="eyebrow mb-2">At available head = {drivingHead_m.toFixed(2)} m, max K achievable</div>
        <table className="data" style={{ fontSize: 11 }}>
          <thead>
            <tr>
              <th>Condition</th>
              <th>Flow</th>
              <th className="text-right">K max (kg/m²/run)</th>
              <th className="text-right">K max (kg/filter)</th>
              <th className="text-right">vs K implied</th>
            </tr>
          </thead>
          <tbody>
            {maxKReadout.map((s, i) => {
              if (s.infeasible) return (
                <tr key={`mk-${i}`} style={{ color: "var(--ink-500)" }}>
                  <td style={{ fontWeight: 600, color: REDUNDANCY_COLOURS[s.key] }}>{s.key}</td>
                  <td>{SCENARIO_SHORT[s.flowScen]}</td>
                  <td colSpan="3" style={{ fontStyle: "italic" }}>infeasible</td>
                </tr>
              );
              const K_perFilter = s.K_max != null ? s.K_max * filter.areaPerFilter_m2 : null;
              const ratio = (s.K_max != null && K_observed > 0) ? s.K_max / K_observed : null;
              const colour = ratio == null ? "var(--ink-500)" : ratio >= 1.0 ? "var(--ink-900)" : "var(--rust)";
              return (
                <tr key={`mk-${i}`}>
                  <td style={{ fontWeight: 600, color: REDUNDANCY_COLOURS[s.key] }}>{s.key}</td>
                  <td style={{ color: SCENARIO_COLOURS[s.flowScen] }}>{SCENARIO_SHORT[s.flowScen]} ({s.flow_MLD != null ? s.flow_MLD.toFixed(0) : "—"})</td>
                  <td className="num">{s.K_max == null ? "—" : s.K_max.toFixed(2)}</td>
                  <td className="num">{K_perFilter == null ? "—" : K_perFilter.toFixed(0)}</td>
                  <td className="num" style={{ color: colour, fontWeight: 600 }}>
                    {ratio == null ? "—" : `${(ratio * 100).toFixed(0)}% of observed`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs italic mt-3" style={{ color: "var(--ink-500)", fontFamily: "Source Serif 4, serif" }}>
        Curves show terminal head required (clean bed + underdrain + Mints-Tien load + appurtenances) as a function of K.
        Use the dropdowns to vary the flow scenario and redundancy condition. The horizontal dashed line marks the available
        driving head; the vertical line marks the K implied at the selected scenario (defaults to max).
      </p>
    </div>
  );
}
