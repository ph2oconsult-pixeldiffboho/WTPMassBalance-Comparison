// components/UnderdrainHeadlossChart.js
// Headloss vs filtration velocity for the SELECTED underdrain system.
// Shows the curve with explicit headloss readings at N design, N-1, peak.
// Includes source citation for the underdrain's reference headloss.

import {
  UNDERDRAIN_LIBRARY,
  underdrainHeadlossSeries,
  underdrainHeadloss,
  filtrationVelocity,
  totalFilterArea,
} from "../lib/filterPhysics";

export default function UnderdrainHeadlossChart({ designerId, filter, flowMLD, peakFlowMLD, sharedYMax }) {
  const u = UNDERDRAIN_LIBRARY[filter.underdrain];
  const series = underdrainHeadlossSeries({
    underdrainKey: filter.underdrain,
    velocityRange_mh: [2, 16],
    nPoints: 28,
  });

  // Design points
  const totalArea = totalFilterArea(filter.numFilters, filter.areaPerFilter_m2);
  const v_design = filtrationVelocity(flowMLD, totalArea) * 3600;
  const v_peak   = filtrationVelocity(peakFlowMLD, totalArea) * 3600;
  const v_N1     = filtrationVelocity(flowMLD, (filter.numFilters - 1) * filter.areaPerFilter_m2) * 3600;
  const v_N2     = filtrationVelocity(flowMLD, (filter.numFilters - 2) * filter.areaPerFilter_m2) * 3600;

  // Headloss at each design point
  const dH_design = underdrainHeadloss(filter.underdrain, v_design / 3600);
  const dH_peak   = underdrainHeadloss(filter.underdrain, v_peak / 3600);
  const dH_N1     = underdrainHeadloss(filter.underdrain, v_N1 / 3600);
  const dH_N2     = underdrainHeadloss(filter.underdrain, v_N2 / 3600);

  // Plot bounds — use shared yMax if supplied so side-by-side D1/D2 charts
  // are visually comparable; otherwise auto-scale to own data.
  const xMin = 2, xMax = 16;
  const ownYMax = Math.max(...series.map(p => p.dH_m), dH_N2);
  const yMax = sharedYMax != null
    ? sharedYMax
    : Math.ceil(ownYMax * 10) / 10;
  const yMin = 0;

  // SVG layout
  const W = 700, H = 360;
  const ML = 60, MR = 30, MT = 40, MB = 50;
  const innerW = W - ML - MR;
  const innerH = H - MT - MB;
  const xScale = (x) => ML + ((x - xMin) / (xMax - xMin)) * innerW;
  const yScale = (y) => MT + innerH - ((y - yMin) / (yMax - yMin)) * innerH;

  // Ticks
  const xTicks = []; for (let x = 2; x <= 16; x += 2) xTicks.push(x);
  const yStep = yMax > 2 ? 0.5 : (yMax > 1 ? 0.25 : 0.1);
  const yTicks = []; for (let y = 0; y <= yMax + 0.001; y += yStep) yTicks.push(Math.round(y * 100) / 100);

  // Build curve path
  const path = series.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.v_m_h)} ${yScale(Math.min(p.dH_m, yMax))}`).join(" ");

  return (
    <div className="p-4" style={{ background: "var(--paper-dark)", border: "0.5px solid var(--ink-300)" }}>
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="eyebrow">{designerId} — Underdrain headloss vs filtration velocity</div>
          <p className="font-display text-base mt-1" style={{ fontStyle: "italic" }}>
            {u.name} · ref ΔH = {u.typical_headloss_m.toFixed(2)} m at 5 m/h
          </p>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        {/* Grid */}
        {yTicks.map((y, i) => (
          <line key={`gy${i}`} x1={ML} x2={ML + innerW} y1={yScale(y)} y2={yScale(y)} stroke="#E8EAEE" strokeWidth="0.5" />
        ))}
        {xTicks.map((x, i) => (
          <line key={`gx${i}`} x1={xScale(x)} x2={xScale(x)} y1={MT} y2={MT + innerH} stroke="#E8EAEE" strokeWidth="0.5" />
        ))}

        {/* Axes */}
        <line x1={ML} x2={ML + innerW} y1={MT + innerH} y2={MT + innerH} stroke="#0E1116" strokeWidth="1" />
        <line x1={ML} x2={ML} y1={MT} y2={MT + innerH} stroke="#0E1116" strokeWidth="1" />

        {/* X ticks + labels */}
        {xTicks.map((x, i) => (
          <g key={`xt${i}`}>
            <line x1={xScale(x)} x2={xScale(x)} y1={MT + innerH} y2={MT + innerH + 4} stroke="#0E1116" />
            <text x={xScale(x)} y={MT + innerH + 16} textAnchor="middle" fontSize="10" fontFamily="JetBrains Mono, monospace" fill="#0E1116">{x}</text>
          </g>
        ))}
        <text x={ML + innerW / 2} y={MT + innerH + 38} textAnchor="middle" fontSize="11" fontFamily="Source Serif 4, serif" fontStyle="italic" fill="#0E1116">
          Filtration velocity (m/h)
        </text>

        {/* Y ticks + labels */}
        {yTicks.map((y, i) => (
          <g key={`yt${i}`}>
            <line x1={ML - 4} x2={ML} y1={yScale(y)} y2={yScale(y)} stroke="#0E1116" />
            <text x={ML - 8} y={yScale(y) + 3} textAnchor="end" fontSize="10" fontFamily="JetBrains Mono, monospace" fill="#0E1116">{y.toFixed(2)}</text>
          </g>
        ))}
        <text x={18} y={MT + innerH / 2} textAnchor="middle" fontSize="11" fontFamily="Source Serif 4, serif" fontStyle="italic" fill="#0E1116" transform={`rotate(-90 18 ${MT + innerH / 2})`}>
          Underdrain headloss (m)
        </text>

        {/* Reference scaling point at 5 m/h */}
        {5 >= xMin && 5 <= xMax && (
          <g>
            <circle cx={xScale(5)} cy={yScale(u.typical_headloss_m)} r={3} fill="#3F5870" stroke="#FFFFFF" strokeWidth="1" />
            <text x={xScale(5) + 6} y={yScale(u.typical_headloss_m) - 6} fontSize="9" fontFamily="JetBrains Mono, monospace" fill="#3F5870">
              ref point
            </text>
          </g>
        )}

        {/* Operating point markers — dashed vertical, then dot at curve, then label */}
        <DesignPoint v={v_design} dH={dH_design} label="N" sublabel="design" colour="#5A7359" xScale={xScale} yScale={yScale} yMax={yMax} MT={MT} innerH={innerH} labelSide="right" />
        <DesignPoint v={v_N1}     dH={dH_N1}     label="N-1" sublabel="design" colour="#C8961A" xScale={xScale} yScale={yScale} yMax={yMax} MT={MT} innerH={innerH} labelSide="left" />
        <DesignPoint v={v_peak}   dH={dH_peak}   label="N" sublabel="peak" colour="#B0451F" xScale={xScale} yScale={yScale} yMax={yMax} MT={MT} innerH={innerH} labelSide="right" />
        {v_N2 <= xMax && (
          <DesignPoint v={v_N2} dH={dH_N2} label="N-2" sublabel="design" colour="#7B5E8C" xScale={xScale} yScale={yScale} yMax={yMax} MT={MT} innerH={innerH} labelSide="left" />
        )}

        {/* The curve */}
        <path d={path} fill="none" stroke="#B0451F" strokeWidth="2.4" />

        {/* Title at top */}
        <text x={W / 2} y={20} textAnchor="middle" fontSize="11" fontFamily="Inter Tight, sans-serif" fontWeight="600" fill="#0E1116" letterSpacing="0.5" style={{ textTransform: "uppercase" }}>
          ΔH(v) = ΔH_ref · (v / 5)² · v_ref = 5 m/h
        </text>
      </svg>

      {/* Operating-point readouts */}
      <div className="grid grid-cols-4 gap-2 mt-3">
        <ReadoutTile v={v_design} dH={dH_design} label="N design" colour="#5A7359" />
        <ReadoutTile v={v_N1} dH={dH_N1} label="N-1 design" colour="#C8961A" />
        <ReadoutTile v={v_peak} dH={dH_peak} label="N peak" colour="#B0451F" />
        <ReadoutTile v={v_N2} dH={dH_N2} label="N-2 design" colour="#7B5E8C" />
      </div>

      <div className="mt-4 p-3" style={{ background: "var(--paper)", borderLeft: "2px solid var(--rust)" }}>
        <div className="eyebrow mb-1" style={{ fontSize: 9 }}>Source & basis for {u.name}</div>
        <p className="font-display text-xs leading-relaxed" style={{ color: "var(--ink-700)" }}>
          <em>Reference ΔH: {u.typical_headloss_m.toFixed(2)} m @ 5 m/h.</em> {u.source}
        </p>
        <p className="font-display text-xs italic leading-relaxed mt-2" style={{ color: "var(--ink-500)" }}>
          Detail: {u.notes}
        </p>
      </div>
    </div>
  );
}

function DesignPoint({ v, dH, label, sublabel, colour, xScale, yScale, yMax, MT, innerH, above }) {
  if (dH > yMax * 1.02) {
    // Off-chart - show indicator at the top
    return (
      <g>
        <line x1={xScale(v)} x2={xScale(v)} y1={MT} y2={MT + innerH} stroke={colour} strokeWidth="0.8" strokeDasharray="3 2" />
        <text x={xScale(v)} y={MT - 22} textAnchor="middle" fontSize="9" fontFamily="JetBrains Mono, monospace" fill={colour}>{label}</text>
        <text x={xScale(v)} y={MT - 10} textAnchor="middle" fontSize="8" fontFamily="JetBrains Mono, monospace" fill={colour}>{sublabel}</text>
      </g>
    );
  }
  return (
    <g>
      <line x1={xScale(v)} x2={xScale(v)} y1={MT} y2={yScale(dH)} stroke={colour} strokeWidth="0.8" strokeDasharray="3 2" />
      <circle cx={xScale(v)} cy={yScale(dH)} r={4} fill={colour} stroke="#FFFFFF" strokeWidth="1.5" />
      <text x={xScale(v)} y={MT - 22} textAnchor="middle" fontSize="9" fontFamily="JetBrains Mono, monospace" fill={colour}>{label}</text>
      <text x={xScale(v)} y={MT - 10} textAnchor="middle" fontSize="8" fontFamily="JetBrains Mono, monospace" fill={colour}>{sublabel}</text>
    </g>
  );
}

function ReadoutTile({ v, dH, label, colour }) {
  return (
    <div className="p-2" style={{ background: "var(--paper)", borderTop: `2px solid ${colour}` }}>
      <div className="eyebrow" style={{ fontSize: 9, color: colour }}>{label}</div>
      <div className="font-mono text-xs tabular mt-1" style={{ color: "var(--ink-500)" }}>v = {v.toFixed(2)} m/h</div>
      <div className="font-mono text-sm tabular" style={{ fontWeight: 600 }}>ΔH = {dH.toFixed(3)} m</div>
    </div>
  );
}
