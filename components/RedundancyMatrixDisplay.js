// components/RedundancyMatrixDisplay.js
import { redundancyMatrix } from "../lib/backwashDynamics";

export default function RedundancyMatrixDisplay({ filter, designFlow_MLD, peakFlow_MLD, sigma_eff_g_per_L, designerId }) {
  const results = redundancyMatrix({ filter, designFlow_MLD, peakFlow_MLD, sigma_eff_g_per_L });

  const conditions = ["N", "N-1", "N-2"];
  const scenarios = [
    { key: "design",  label: "Design flow" },
    { key: "peak",    label: "Peak flow" },
    { key: "bw",      label: "+ BW in progress" },
  ];

  const lookup = {};
  for (const r of results) {
    if (!lookup[r.condition]) lookup[r.condition] = {};
    lookup[r.condition][r.scenario] = r;
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h4 className="font-display text-xl">{designerId} — Redundancy matrix</h4>
        <span className="eyebrow">Driving head {filter.drivingHead_m.toFixed(2)} m · σ_eff {sigma_eff_g_per_L.toFixed(2)} g/L</span>
      </div>

      <p className="text-xs italic mb-3" style={{ color: "var(--ink-500)", fontFamily: "Source Serif 4, serif" }}>
        σ_eff = K_implied / bed_depth / K_multiplier (precipitate-adjusted). Held constant across the matrix so headloss varies monotonically with flow and redundancy.
      </p>

      <table className="data">
        <thead>
          <tr>
            <th>Condition</th>
            {scenarios.map((s) => (
              <th key={s.key} style={{ textAlign: "center" }}>{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {conditions.map((c) => (
            <tr key={c}>
              <td style={{ fontWeight: 600 }}>{c}</td>
              {scenarios.map((s) => {
                const r = lookup[c]?.[s.key];
                if (!r || r.infeasible) {
                  return <td key={s.key} className="num fail" style={{ textAlign: "center" }}>—</td>;
                }
                return (
                  <td key={s.key} className="num" style={{ textAlign: "center" }}>
                    <div className="font-mono text-xs" style={{ color: "var(--ink-500)" }}>
                      v = {r.velocity_m_h.toFixed(1)} m/h
                    </div>
                    <div className={`font-mono text-sm ${r.pass ? "pass" : "fail"}`} style={{ fontWeight: 600 }}>
                      ΔH = {r.dH_total_m.toFixed(2)} m
                    </div>
                    <div className="font-mono text-xs" style={{ color: "var(--ink-500)" }}>
                      margin {r.margin_m >= 0 ? "+" : ""}{r.margin_m.toFixed(2)}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <RedundancyBreakdown filter={filter} designFlow_MLD={designFlow_MLD} peakFlow_MLD={peakFlow_MLD} sigma_eff_g_per_L={sigma_eff_g_per_L} />
    </div>
  );
}

function RedundancyBreakdown({ filter, designFlow_MLD, peakFlow_MLD, sigma_eff_g_per_L }) {
  const results = redundancyMatrix({ filter, designFlow_MLD, peakFlow_MLD, sigma_eff_g_per_L });
  const worst = results.filter(r => !r.infeasible).reduce((acc, r) => (acc && acc.margin_m < r.margin_m ? acc : r), null);
  if (!worst) return null;

  return (
    <div className="mt-4 p-4" style={{ background: "var(--paper-dark)", borderLeft: "2px solid var(--rust)" }}>
      <div className="eyebrow mb-1">Worst case</div>
      <div className="font-display text-base mb-2" style={{ fontStyle: "italic" }}>
        {worst.conditionLabel} · {worst.scenarioLabel}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs tabular">
        <div>Filters in service</div><div className="text-right">{worst.filtersInService}</div>
        <div>Filtration velocity</div><div className="text-right">{worst.velocity_m_h.toFixed(2)} m/h</div>
        <div>Clean bed ΔH</div><div className="text-right">{worst.dH_clean_m.toFixed(3)} m</div>
        <div>Underdrain ΔH</div><div className="text-right">{worst.dH_underdrain_m.toFixed(3)} m</div>
        <div>Mints-Tien load ΔH</div><div className="text-right">{worst.dH_load_m.toFixed(3)} m</div>
        <div>Appurtenances ΔH</div><div className="text-right">{worst.dH_appurtenance_m.toFixed(3)} m</div>
        <div style={{ fontWeight: 600 }}>Total ΔH</div><div className="text-right" style={{ fontWeight: 600 }}>{worst.dH_total_m.toFixed(3)} m</div>
        <div style={{ fontWeight: 600 }}>Driving head</div><div className="text-right" style={{ fontWeight: 600 }}>{worst.drivingHead_m.toFixed(2)} m</div>
        <div style={{ fontWeight: 600 }} className={worst.pass ? "pass" : "fail"}>Margin</div>
        <div className={`text-right ${worst.pass ? "pass" : "fail"}`} style={{ fontWeight: 600 }}>
          {worst.margin_m >= 0 ? "+" : ""}{worst.margin_m.toFixed(3)} m
        </div>
      </div>
    </div>
  );
}
