// components/FilterAssessmentDisplay.js
// Shows the assessment for min / avg / max scenarios side-by-side.

import { PRECIPITATE_MULTIPLIERS, SCENARIOS, SCENARIO_SHORT, SCENARIO_COLOURS, pickScenarioValue } from "../lib/filterDefaults";
import { maxKAtHead, K_PRAGMATIC_CAP } from "../lib/filterCalculations";

export default function FilterAssessmentDisplay({ designerId, envelope, filter, flowEnv }) {
  // Compute K_max (head-budget-limited, capped) for each scenario at N condition.
  // Used for the K reality-check block at the top of the assessment.
  const kMaxByScenario = {};
  for (const s of SCENARIOS) {
    const flow = pickScenarioValue(flowEnv.designFlow_MLD, s);
    const result = maxKAtHead({
      filter, flow_MLD: flow,
      K_multiplier: envelope[s].K_multiplier,
      drivingHead_m: filter.drivingHead_m,
    });
    kMaxByScenario[s] = result.find(r => r.key === "N") ?? null;
  }
  const hasOverride = envelope.avg.runHours_override_hr != null;
  const hasDesignRun = envelope.avg.designRunHours_at_maxTSS_hr != null;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <h4 className="font-display text-xl">{designerId} — Assessment</h4>
        <span className="eyebrow">Min · Avg · Max envelope</span>
      </div>

      <div className="mb-6">
        <table className="data">
          <thead>
            <tr>
              <th>Metric</th>
              {SCENARIOS.map((s) => (
                <th key={s} className="text-right" style={{ color: SCENARIO_COLOURS[s] }}>{SCENARIO_SHORT[s]}</th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            <Row label="Solids load into filter" unit="kg/d">
              {SCENARIOS.map((s) => <td key={s} className="num">{envelope[s].totalLoad_kg_per_day.toFixed(0)}</td>)}
            </Row>
            <Row label="Solids captured by filter" unit="kg/d">
              {SCENARIOS.map((s) => <td key={s} className="num">{envelope[s].capturedKgPerDay.toFixed(0)}</td>)}
            </Row>
            <Row label="Filter flow" unit="ML/d">
              {SCENARIOS.map((s) => <td key={s} className="num">{envelope[s]._scenarioFlow_MLD.toFixed(0)}</td>)}
            </Row>
            <Row label="Filter run length (from BW frequency)" unit="hours" emphasis>
              {SCENARIOS.map((s) => (
                <td key={s} className="num">
                  {isFinite(envelope[s].run_hours) && envelope[s].run_hours > 0
                    ? envelope[s].run_hours.toFixed(1) : "—"}
                </td>
              ))}
            </Row>
            {hasOverride && (
              <Row label="Filter run length (manual override)" unit="hours" emphasis>
                {SCENARIOS.map((s) => (
                  <td key={s} className="num" style={{ color: "var(--ochre, #C8961A)", fontWeight: 700 }}>
                    {envelope[s].runHours_override_hr != null ? envelope[s].runHours_override_hr.toFixed(1) : "—"}
                  </td>
                ))}
              </Row>
            )}
            <Row label="BW cycles/filter/day" unit="">
              {SCENARIOS.map((s) => <td key={s} className="num">{envelope[s].bws_per_filter_per_day.toFixed(2)}</td>)}
            </Row>
            <Row label="K_implied (from BW frequency)" unit="kg/m²/run" emphasis>
              {SCENARIOS.map((s) => (
                <td key={s} className="num" style={{ fontWeight: 700 }}>
                  {envelope[s].K_kg_per_m2 > 0 ? envelope[s].K_kg_per_m2.toFixed(2) : "—"}
                </td>
              ))}
            </Row>
            {hasOverride && (
              <Row label="K_operator (from manual run time)" unit="kg/m²/run" emphasis>
                {SCENARIOS.map((s) => (
                  <td key={s} className="num" style={{ fontWeight: 700, color: "var(--ochre, #C8961A)" }}>
                    {envelope[s].K_operator != null && envelope[s].K_operator > 0 ? envelope[s].K_operator.toFixed(2) : "—"}
                  </td>
                ))}
              </Row>
            )}
            {hasDesignRun && (
              <Row label={`K_design (at designer's ${envelope.avg.designRunHours_at_maxTSS_hr.toFixed(0)} h run)`} unit="kg/m²/run" emphasis>
                {SCENARIOS.map((s) => (
                  <td key={s} className="num" style={{ fontWeight: 700, color: "var(--slate, #3F5870)" }}>
                    {envelope[s].K_design != null && envelope[s].K_design > 0 ? envelope[s].K_design.toFixed(2) : "—"}
                  </td>
                ))}
              </Row>
            )}
            {hasDesignRun && (
              <Row label="BW frequency at design run length" unit="ML/d (bank)">
                {SCENARIOS.map((s) => (
                  <td key={s} className="num" style={{ color: "var(--slate, #3F5870)" }}>
                    {envelope[s].total_BW_MLd_design != null ? envelope[s].total_BW_MLd_design.toFixed(2) : "—"}
                  </td>
                ))}
              </Row>
            )}
            <Row label="K_max @ available head (N, capped)" unit="kg/m²/run">
              {SCENARIOS.map((s) => {
                const mk = kMaxByScenario[s];
                if (!mk || mk.K_max == null) return <td key={s} className="num">—</td>;
                return (
                  <td key={s} className="num" style={{ fontWeight: 600 }}>
                    {mk.K_max.toFixed(2)}{mk.K_capped ? " (cap)" : ""}
                  </td>
                );
              })}
            </Row>
            <Row label="Δ vs K_max (head budget headroom)" unit="kg/m²/run">
              {SCENARIOS.map((s) => {
                const mk = kMaxByScenario[s];
                // Prefer K_design over K_operator over K_implied for the comparison
                const Kuse = hasDesignRun && envelope[s].K_design != null
                  ? envelope[s].K_design
                  : (hasOverride && envelope[s].K_operator != null ? envelope[s].K_operator : envelope[s].K_kg_per_m2);
                if (!mk || mk.K_max == null || !isFinite(Kuse)) return <td key={s} className="num">—</td>;
                const delta = mk.K_max - Kuse;
                const colour = delta < 0 ? "var(--rust)" : delta < 0.5 ? "var(--ochre, #C8961A)" : "var(--sage, #5A7359)";
                return (
                  <td key={s} className="num" style={{ color: colour, fontWeight: 600 }}>
                    {delta >= 0 ? "+" : ""}{delta.toFixed(2)}
                  </td>
                );
              })}
            </Row>
            <Row label="Deposit structure factor (precipitate)" unit="×">
              {SCENARIOS.map((s) => (
                <td key={s} className="num" style={{ color: SCENARIO_COLOURS[s] }}>
                  {envelope[s].K_multiplier.toFixed(2)}
                </td>
              ))}
            </Row>
            <Row label="K (alum-equivalent baseline)" unit="kg/m²/run">
              {SCENARIOS.map((s) => (
                <td key={s} className="num">
                  {envelope[s].K_alum_equivalent > 0 ? envelope[s].K_alum_equivalent.toFixed(2) : "—"}
                </td>
              ))}
            </Row>
            <Row label="σ (specific deposit)" unit="g/L" emphasis>
              {SCENARIOS.map((s) => {
                const sigma = envelope[s].sigma_g_per_L;
                const valid = envelope[s].isMintsTienValid;
                return (
                  <td key={s} className="num" style={{ color: valid ? "var(--ink-900)" : "var(--rust)", fontWeight: 600 }}>
                    {sigma.toFixed(2)}{!valid ? " ⚠" : ""}
                  </td>
                );
              })}
            </Row>
          </tbody>
        </table>
        <p className="text-xs italic mt-2" style={{ color: "var(--ink-500)", fontFamily: "Source Serif 4, serif" }}>
          K_max is capped at {K_PRAGMATIC_CAP.toFixed(1)} kg/m²/run (pragmatic breakthrough limit per Cleasby-Logsdon literature, regardless of available head). σ &gt; 4 g/L (⚠) means the Mints-Tien relationship is no longer valid — pore-clogging dominates and headloss rises super-quadratically. {hasOverride ? "Manual run-time override is active; both K_implied (from BW frequency) and K_operator (from override) are shown alongside the head-budget-limited K_max." : "Set a manual run-time override on the Filter design tab to compare operator-set runs against the BW-frequency-implied K and the head-budget-limited K_max."}
        </p>
      </div>

      <div>
        <div className="eyebrow mb-2">Filter loading by redundancy condition (kg/m²/d)</div>
        <table className="data">
          <thead>
            <tr>
              <th>Condition</th>
              <th className="text-right">Filters</th>
              <th className="text-right">Area (m²)</th>
              {SCENARIOS.map((s) => (
                <th key={s} className="text-right" style={{ color: SCENARIO_COLOURS[s] }}>{SCENARIO_SHORT[s]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {["N", "N-1", "N-2"].map((condKey) => {
              const cond = envelope.avg.loadByCondition.find((c) => c.key === condKey);
              return (
                <tr key={condKey}>
                  <td style={{ fontWeight: 600 }}>{condKey}</td>
                  <td className="num">{cond.filtersInService > 0 ? cond.filtersInService : "—"}</td>
                  <td className="num">{cond.filtersInService > 0 ? cond.areaInService_m2.toFixed(1) : "—"}</td>
                  {SCENARIOS.map((s) => {
                    const c = envelope[s].loadByCondition.find((x) => x.key === condKey);
                    if (!c || c.filtersInService <= 0) {
                      return <td key={s} className="num" style={{ color: "var(--rust)" }}>—</td>;
                    }
                    return <td key={s} className="num">{c.loading_kg_per_m2_per_d.toFixed(3)}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <div className="eyebrow mb-2">Hydraulic loading by redundancy (m/h)</div>
        <table className="data">
          <thead>
            <tr>
              <th>Condition</th>
              {SCENARIOS.map((s) => (
                <th key={s} className="text-right" style={{ color: SCENARIO_COLOURS[s] }}>{SCENARIO_SHORT[s]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {["N", "N-1", "N-2"].map((condKey) => (
              <tr key={condKey}>
                <td style={{ fontWeight: 600 }}>{condKey}</td>
                {SCENARIOS.map((s) => {
                  const c = envelope[s].loadByCondition.find((x) => x.key === condKey);
                  if (!c || c.filtersInService <= 0) {
                    return <td key={s} className="num" style={{ color: "var(--rust)" }}>—</td>;
                  }
                  return <td key={s} className="num">{c.hydraulicLoading_m_per_h.toFixed(2)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6">
        <div className="eyebrow mb-2">BW water balance — bank-wide daily volumes (m³/d)</div>
        <table className="data">
          <thead>
            <tr>
              <th>Component</th>
              <th>Destination</th>
              {SCENARIOS.map((s) => (
                <th key={s} className="text-right" style={{ color: SCENARIO_COLOURS[s] }}>{SCENARIO_SHORT[s]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { key: "daily_drain_m3",    label: "Filter drain",       destKey: "drainDestination" },
              { key: "daily_backwash_m3", label: "Backwash water",     destKey: "backwashDestination" },
              { key: "daily_ftw_m3",      label: "Filter to waste",    destKey: "ftwDestination" },
            ].map((row) => {
              const bv = envelope.avg.bwVolumes || {};
              const destLabel = bv[row.destKey] === "waste" ? "→ waste"
                              : bv[row.destKey] === "recycle" ? "→ recycle"
                              : bv[row.destKey] === "reuse" ? "→ reuse"
                              : "→ —";
              const destColour = bv[row.destKey] === "waste" ? "var(--rust)" : "var(--sage, #5A7359)";
              return (
                <tr key={row.key}>
                  <td>{row.label}</td>
                  <td style={{ color: destColour, fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}>{destLabel}</td>
                  {SCENARIOS.map((s) => {
                    const v = envelope[s].bwVolumes?.[row.key];
                    return <td key={s} className="num">{v != null ? v.toFixed(0) : "—"}</td>;
                  })}
                </tr>
              );
            })}
            <tr style={{ borderTop: "0.5px solid var(--ink-300)", fontWeight: 600 }}>
              <td>Total</td>
              <td></td>
              {SCENARIOS.map((s) => {
                const v = envelope[s].bwVolumes?.daily_total_m3;
                return <td key={s} className="num">{v != null ? v.toFixed(0) : "—"}</td>;
              })}
            </tr>
            <tr style={{ fontWeight: 600, color: "var(--rust)" }}>
              <td>Net plant water loss</td>
              <td style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--ink-500)" }}>(waste components only)</td>
              {SCENARIOS.map((s) => {
                const bv = envelope[s].bwVolumes || {};
                return (
                  <td key={s} className="num">
                    {bv.daily_netLoss_m3 != null
                      ? `${bv.daily_netLoss_m3.toFixed(0)} (${bv.daily_netLoss_pct.toFixed(2)}%)`
                      : "—"}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ label, unit, children, emphasis }) {
  return (
    <tr style={emphasis ? { background: "rgba(176, 69, 31, 0.04)" } : {}}>
      <td style={{ fontWeight: emphasis ? 600 : 400 }}>
        {label}
        {unit && <span style={{ color: "var(--ink-500)", fontFamily: "JetBrains Mono, monospace", fontSize: 11, fontWeight: 400 }}> {unit}</span>}
      </td>
      {children}
    </tr>
  );
}
