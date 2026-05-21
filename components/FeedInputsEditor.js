// components/FeedInputsEditor.js
// User-supplied inputs as a min / avg / max envelope: feed TSS, filter TSS
// removal, BW volumes, and precipitate composition.

import { PRECIPITATE_MULTIPLIERS, SCENARIO_COLOURS, SCENARIO_SHORT, BW_VOLUME_DESTINATIONS } from "../lib/filterDefaults";

export default function FeedInputsEditor({ designerId, feed, onChange }) {
  // Update a single envelope field (e.g. feedTSS_mgL.avg)
  const updateEnv = (field, scenario, value) => {
    onChange({
      ...feed,
      [field]: { ...feed[field], [scenario]: Number(value) || 0 },
    });
  };
  const updatePrecipEnv = (key, scenario, value) => {
    onChange({
      ...feed,
      precipitate: {
        ...feed.precipitate,
        [key]: { ...feed.precipitate[key], [scenario]: Number(value) || 0 },
      },
    });
  };

  // deposit structure factor preview for each scenario
  const kMult = (scen) => {
    if (!feed.precipitate) return 1.0;
    const fractions = Object.fromEntries(
      Object.entries(feed.precipitate).map(([k, env]) => [k, env[scen] ?? 0])
    );
    const total = Object.values(fractions).reduce((a, b) => a + b, 0);
    if (total <= 0) return 0;
    let sum = 0;
    for (const [k, f] of Object.entries(fractions)) {
      sum += (f / total) * (PRECIPITATE_MULTIPLIERS[k]?.multiplier ?? 1.0);
    }
    return sum;
  };
  const total = (scen) => {
    if (!feed.precipitate) return 0;
    return Object.values(feed.precipitate).reduce((a, env) => a + (env[scen] ?? 0), 0);
  };

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <h4 className="font-display text-xl">{designerId} — Filter feed & backwash</h4>
        <span className="eyebrow">Min / Avg / Max envelope</span>
      </div>

      <div className="space-y-5">
        <div>
          <div className="eyebrow mb-2">Feed to filter</div>
          <EnvelopeRow
            label="Feed TSS (mg/L)"
            hint="TSS entering the filter from upstream treatment"
            field="feedTSS_mgL"
            envelope={feed.feedTSS_mgL}
            onChange={updateEnv}
            step={1}
          />
          <EnvelopeRow
            label="Filter TSS removal (%)"
            hint="Fraction of feed TSS captured"
            field="filterTSSRemoval_pct"
            envelope={feed.filterTSSRemoval_pct}
            onChange={updateEnv}
            step={0.1}
            max={100}
          />
        </div>

        <div className="rule-thin" />

        <div>
          <div className="eyebrow mb-2">Backwash water</div>
          <EnvelopeRow
            label="Total daily BW (ML/d)"
            hint="Sum across all filters per day"
            field="totalBWVolume_MLd"
            envelope={feed.totalBWVolume_MLd}
            onChange={updateEnv}
            step={0.05}
          />
          <div className="mb-3">
            <div className="flex items-baseline justify-between mb-2">
              <div>
                <div className="eyebrow" style={{ fontSize: 9 }}>BW volume per cycle (m³/filter) — by component</div>
                <div className="text-xs italic mt-1" style={{ color: "var(--ink-500)", fontFamily: "Source Serif 4, serif" }}>
                  Each component is design-fixed (same for all scenarios). Total = filter drain + backwash water + filter-to-waste. Set destination per component: waste counts as plant water loss, recycle returns to clarifier inlet.
                </div>
              </div>
              <div className="text-xs" style={{ color: "var(--ink-700)", fontFamily: "JetBrains Mono, monospace" }}>
                Total: {((feed.drainVolume_m3 ?? 0) + (feed.backwashVolume_m3 ?? 0) + (feed.ftwVolume_m3 ?? 0)).toFixed(0)} m³/cycle
              </div>
            </div>

            <table className="data" style={{ fontSize: 11 }}>
              <thead>
                <tr>
                  <th>Component</th>
                  <th className="text-right">Volume (m³/filter)</th>
                  <th>Destination</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <div style={{ fontWeight: 600 }}>Filter drain</div>
                    <div className="text-xs italic" style={{ color: "var(--ink-500)", fontFamily: "Source Serif 4, serif" }}>
                      Box drain-down before BW (unfiltered water above media)
                    </div>
                  </td>
                  <td className="num">
                    <input type="number" min="0" step="5"
                      value={feed.drainVolume_m3 ?? 0}
                      onChange={(e) => onChange({ ...feed, drainVolume_m3: Number(e.target.value) || 0 })}
                      style={{ width: 90, textAlign: "right" }} />
                  </td>
                  <td>
                    <select value={feed.drainDestination ?? "waste"}
                      onChange={(e) => onChange({ ...feed, drainDestination: e.target.value })}
                      style={{ fontSize: 11 }}>
                      {Object.entries(BW_VOLUME_DESTINATIONS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </td>
                </tr>
                <tr>
                  <td>
                    <div style={{ fontWeight: 600 }}>Backwash water</div>
                    <div className="text-xs italic" style={{ color: "var(--ink-500)", fontFamily: "Source Serif 4, serif" }}>
                      Dirty BW effluent (BW rate × duration), high in TSS
                    </div>
                  </td>
                  <td className="num">
                    <input type="number" min="0" step="5"
                      value={feed.backwashVolume_m3 ?? 0}
                      onChange={(e) => onChange({ ...feed, backwashVolume_m3: Number(e.target.value) || 0 })}
                      style={{ width: 90, textAlign: "right" }} />
                  </td>
                  <td>
                    <select value={feed.backwashDestination ?? "waste"}
                      onChange={(e) => onChange({ ...feed, backwashDestination: e.target.value })}
                      style={{ fontSize: 11 }}>
                      {Object.entries(BW_VOLUME_DESTINATIONS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </td>
                </tr>
                <tr>
                  <td>
                    <div style={{ fontWeight: 600 }}>Filter to waste (FTW)</div>
                    <div className="text-xs italic" style={{ color: "var(--ink-500)", fontFamily: "Source Serif 4, serif" }}>
                      First filtrate after BW (until turbidity stabilises) — partially filtered water
                    </div>
                  </td>
                  <td className="num">
                    <input type="number" min="0" step="5"
                      value={feed.ftwVolume_m3 ?? 0}
                      onChange={(e) => onChange({ ...feed, ftwVolume_m3: Number(e.target.value) || 0 })}
                      style={{ width: 90, textAlign: "right" }} />
                  </td>
                  <td>
                    <select value={feed.ftwDestination ?? "waste"}
                      onChange={(e) => onChange({ ...feed, ftwDestination: e.target.value })}
                      style={{ fontSize: 11 }}>
                      {Object.entries(BW_VOLUME_DESTINATIONS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="rule-thin" />

        <div>
          <div className="flex items-baseline justify-between mb-2">
            <div className="eyebrow">Precipitate composition (mass fractions)</div>
          </div>
          <table className="data" style={{ fontSize: 11 }}>
            <thead>
              <tr>
                <th>Precipitate type</th>
                <th className="text-right">K mult.</th>
                <th className="text-right" style={{ color: SCENARIO_COLOURS.min }}>Min</th>
                <th className="text-right" style={{ color: SCENARIO_COLOURS.avg }}>Avg</th>
                <th className="text-right" style={{ color: SCENARIO_COLOURS.max }}>Max</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(PRECIPITATE_MULTIPLIERS).map(([k, info]) => (
                <tr key={k}>
                  <td>{info.label}</td>
                  <td className="num">{info.multiplier.toFixed(2)}×</td>
                  {["min", "avg", "max"].map((scen) => (
                    <td key={scen} className="num">
                      <input type="number" min="0" max="1" step="0.01"
                        value={feed.precipitate?.[k]?.[scen] ?? 0}
                        onChange={(e) => updatePrecipEnv(k, scen, e.target.value)}
                        style={{ width: 56, textAlign: "right" }} />
                    </td>
                  ))}
                </tr>
              ))}
              <tr style={{ borderTop: "1px solid var(--ink-700)", fontWeight: 600 }}>
                <td>Total / deposit structure factor</td>
                <td></td>
                {["min", "avg", "max"].map((scen) => {
                  const t = total(scen);
                  const m = kMult(scen);
                  return (
                    <td key={scen} className="num">
                      <div className="font-mono text-xs" style={{ color: t === 0 ? "var(--rust)" : "var(--ink-500)" }}>
                        Σ {t.toFixed(2)}
                      </div>
                      <div className="font-mono" style={{ color: SCENARIO_COLOURS[scen], fontWeight: 700 }}>
                        {m.toFixed(2)}×
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
          <p className="text-xs italic mt-2" style={{ color: "var(--ink-500)", fontFamily: "Source Serif 4, serif" }}>
            Fractions per column should sum to 1.0. The deposit structure factor is the mass-weighted average of per-precipitate multipliers; alum floc is the baseline (1.00×).{" "}
            <span style={{ color: "var(--rust)", fontStyle: "normal" }}>See Precipitates tab for the narrative on each type.</span>
          </p>
        </div>
      </div>

      <p className="text-xs italic mt-4" style={{ color: "var(--ink-500)", fontFamily: "Source Serif 4, serif" }}>
        Each input has a min / avg / max value. The Assessment tab computes solids load, K, σ and loading for all three scenarios side-by-side; Redundancy and BW timeline tabs use a scenario selector.
      </p>
    </div>
  );
}

function EnvelopeRow({ label, hint, field, envelope, onChange, step = 0.1, max }) {
  return (
    <div className="grid mb-3" style={{ gridTemplateColumns: "1.3fr 1fr 1fr 1fr", alignItems: "end", gap: 12 }}>
      <div>
        <div className="eyebrow" style={{ fontSize: 9 }}>{label}</div>
        {hint && <div className="text-xs italic mt-1" style={{ color: "var(--ink-500)", fontFamily: "Source Serif 4, serif" }}>{hint}</div>}
      </div>
      {["min", "avg", "max"].map((scen) => (
        <div key={scen}>
          <div className="eyebrow mb-1" style={{ fontSize: 8, color: SCENARIO_COLOURS[scen] }}>{SCENARIO_SHORT[scen]}</div>
          <input type="number" min="0" max={max} step={step}
            value={envelope?.[scen] ?? 0}
            onChange={(e) => onChange(field, scen, e.target.value)}
            style={{ width: "100%" }} />
        </div>
      ))}
    </div>
  );
}
