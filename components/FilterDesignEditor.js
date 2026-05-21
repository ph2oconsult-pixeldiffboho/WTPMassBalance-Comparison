// components/FilterDesignEditor.js
import {
  MEDIA_LIBRARY, MEDIA_CONFIGURATIONS, UNDERDRAIN_LIBRARY, CLEAN_BED_EQ_LABELS,
} from "../lib/filterPhysics";

export default function FilterDesignEditor({ designerId, filter, onChange }) {
  const update = (patch) => onChange({ ...filter, ...patch });

  const updateMediaLayer = (idx, patch) => {
    const newLayers = filter.mediaLayers.map((l, i) => (i === idx ? { ...l, ...patch } : l));
    update({ mediaLayers: newLayers });
  };

  const setMediaConfig = (key) => {
    const cfg = MEDIA_CONFIGURATIONS[key];
    if (!cfg) return;
    update({ mediaConfig: key, mediaLayers: JSON.parse(JSON.stringify(cfg.layers)) });
  };

  const addLayer = () => {
    update({
      mediaLayers: [
        ...filter.mediaLayers,
        { media: "sand", depth: 0.20, d_mm: 0.55, uc: 1.5, porosity: 0.42 },
      ],
    });
  };

  const removeLayer = (idx) => {
    update({ mediaLayers: filter.mediaLayers.filter((_, i) => i !== idx) });
  };

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <h4 className="font-display text-xl">{designerId} — Filter design</h4>
        <span className="eyebrow">All parameters editable</span>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 mb-6">
        <Field label="Number of filters (N)">
          <input type="number" min="1" max="20" value={filter.numFilters}
            onChange={(e) => update({ numFilters: Math.max(1, parseInt(e.target.value) || 1) })} />
        </Field>
        <Field label="Area per filter (m²)">
          <input type="number" min="1" step="0.1" value={filter.areaPerFilter_m2}
            onChange={(e) => update({ areaPerFilter_m2: Number(e.target.value) })} />
        </Field>
        <Field label="Backwash water per cycle (m³/filter)">
          <input type="number" min="0" step="5" value={filter.backwashPerCycle_m3}
            onChange={(e) => update({ backwashPerCycle_m3: Number(e.target.value) })} />
        </Field>
        <Field label="Total filter area (m²)">
          <div className="font-mono text-sm tabular">{(filter.numFilters * filter.areaPerFilter_m2).toFixed(1)}</div>
        </Field>
      </div>

      <div className="p-3 mb-6" style={{ background: "var(--paper-dark)", borderLeft: "3px solid var(--rust)" }}>
        <div className="eyebrow mb-2" style={{ color: "var(--rust)" }}>Hydraulic profile inputs — read from drawing</div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <Field label="Driving head available (m) — TWL upstream of outlet minus TWL downstream">
            <input type="number" min="0" step="0.01" value={filter.drivingHead_m}
              onChange={(e) => update({ drivingHead_m: Number(e.target.value) })}
              style={{ fontWeight: 600, fontSize: 15 }} />
          </Field>
          <Field label="Appurtenance loss allowance (m) — inlet/outlet weirs, channels, pipework">
            <input type="number" min="0" step="0.01" value={filter.appurtenanceLoss_m}
              onChange={(e) => update({ appurtenanceLoss_m: Number(e.target.value) })} />
          </Field>
        </div>
      </div>

      <div className="rule-thin mb-4" />

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 mb-6">
        <Field label="Underdrain type">
          <select value={filter.underdrain} onChange={(e) => update({ underdrain: e.target.value })}>
            {Object.entries(UNDERDRAIN_LIBRARY).map(([k, v]) => (
              <option key={k} value={k}>{v.name} (K = {v.K_loss})</option>
            ))}
          </select>
        </Field>
        <Field label="Clean bed headloss equation">
          <select value={filter.cleanBedEquation} onChange={(e) => update({ cleanBedEquation: e.target.value })}>
            {Object.entries(CLEAN_BED_EQ_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mb-4 flex items-start gap-3" style={{ background: "var(--paper-dark)", border: "0.5px solid var(--ink-300)", padding: 10 }}>
        <input type="checkbox"
          id={`uc-toggle-${designerId}`}
          checked={filter.applyUCCorrection !== false}
          onChange={(e) => update({ applyUCCorrection: e.target.checked })}
          style={{ marginTop: 3 }} />
        <label htmlFor={`uc-toggle-${designerId}`} style={{ cursor: "pointer", flex: 1 }}>
          <div className="eyebrow" style={{ fontSize: 9 }}>Apply Cleasby-Logsdon UC correction</div>
          <div className="text-xs italic mt-1" style={{ color: "var(--ink-500)", fontFamily: "Source Serif 4, serif" }}>
            Multiplies clean-bed headloss per layer by (1 + 1.3 × (UC−1)) to account for non-uniform grading.
            At UC = 1.5 (typical sand) the correction adds ~65% to clean-bed headloss. Defensible but contested in the
            literature; some methods consider grading already partly captured in the sphericity term. Untick to
            use the uncorrected (d₁₀-only) headloss. The UC values per layer are still kept on the media table for record.
          </div>
        </label>
      </div>

      <div className="mb-4 flex items-start gap-4" style={{ background: "var(--paper-dark)", border: "0.5px solid var(--ink-300)", padding: 10 }}>
        <div style={{ minWidth: 110 }}>
          <div className="eyebrow mb-1" style={{ fontSize: 9 }}>Water temperature</div>
          <div className="flex items-baseline gap-2">
            <input
              type="number"
              min="0" max="40" step="0.5"
              value={filter.temp_C ?? 10}
              onChange={(e) => update({ temp_C: parseFloat(e.target.value) || 0 })}
              style={{ width: 70, fontFamily: "JetBrains Mono, monospace", fontSize: 14 }}
            />
            <span className="text-sm" style={{ fontFamily: "JetBrains Mono, monospace" }}>°C</span>
          </div>
        </div>
        <div className="text-xs italic" style={{ color: "var(--ink-500)", fontFamily: "Source Serif 4, serif", flex: 1 }}>
          Affects water viscosity and density in the clean-bed (KC / Ergun / Rose) and underdrain headloss calculations.
          Cold water is more viscous: μ rises ~70% from 25°C → 5°C (typical raw water seasonal range), which is the
          dominant driver of seasonal headloss variation. Defaults to 10°C (cold-water conservative design).
          Suggested values: design min winter raw water (e.g. 5-8°C) for conservative sizing; annual average for typical
          operation; warm summer water if checking BW efficiency. Does NOT affect Mints-Tien load (calibrated separately).
        </div>
      </div>

      <div className="mb-4 flex items-start gap-4" style={{ background: "var(--paper-dark)", border: "0.5px solid var(--ink-300)", padding: 10 }}>
        <div style={{ minWidth: 110 }}>
          <div className="eyebrow mb-1" style={{ fontSize: 9 }}>Operating run-time override</div>
          <div className="flex items-baseline gap-2">
            <input
              type="number"
              min="0" max="1000" step="1"
              value={filter.runHours_override_hr ?? ""}
              placeholder="auto"
              onChange={(e) => {
                const v = e.target.value;
                update({ runHours_override_hr: (v === "" || v == null) ? null : parseFloat(v) });
              }}
              style={{ width: 80, fontFamily: "JetBrains Mono, monospace", fontSize: 14 }}
            />
            <span className="text-sm" style={{ fontFamily: "JetBrains Mono, monospace" }}>h</span>
          </div>
        </div>
        <div className="text-xs italic" style={{ color: "var(--ink-500)", fontFamily: "Source Serif 4, serif", flex: 1 }}>
          Optional. Leave blank to derive run length from the user-supplied total daily BW volume (the BW-frequency-implied
          K_implied calculation). Set a value to specify the operator's actual run time directly — the Assessment will then show
          BOTH the implied and operator-set K, plus the delta to the head-budget-limited K_max so you can see how much head
          margin is being used vs spare. Useful for sensitivity analysis or when the operator's run time differs from the
          mass-balance-derived figure.
        </div>
      </div>

      <div className="mb-4 flex items-start gap-4" style={{ background: "var(--paper-dark)", border: "0.5px solid var(--ink-300)", padding: 10 }}>
        <div style={{ minWidth: 110 }}>
          <div className="eyebrow mb-1" style={{ fontSize: 9 }}>Designer's stated run length @ max TSS</div>
          <div className="flex items-baseline gap-2">
            <input
              type="number"
              min="0" max="1000" step="1"
              value={filter.designRunHours_at_maxTSS_hr ?? ""}
              placeholder="—"
              onChange={(e) => {
                const v = e.target.value;
                update({ designRunHours_at_maxTSS_hr: (v === "" || v == null) ? null : parseFloat(v) });
              }}
              style={{ width: 80, fontFamily: "JetBrains Mono, monospace", fontSize: 14 }}
            />
            <span className="text-sm" style={{ fontFamily: "JetBrains Mono, monospace" }}>h</span>
          </div>
        </div>
        <div className="text-xs italic" style={{ color: "var(--ink-500)", fontFamily: "Source Serif 4, serif", flex: 1 }}>
          The designer's quoted run length at maximum feed TSS conditions (taken from their process design document).
          Used to derive K_design (the designer's intended operating K at max TSS) and the required BW frequency that
          honours the design intent. When set, the Assessment shows K_design alongside K_implied and K_operator, and the
          report flags any variance between the design BW frequency and the user-supplied total daily BW input.
          Example: Designer 1 states 44 h at 10.86 mg/L max TSS → K_design ≈ 4.3 kg/m²/run, requiring ~2.2 ML/d total BW at max scenario.
        </div>
      </div>

      <div className="rule-thin mb-4" />

      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="eyebrow">Media stack — top to bottom</div>
          <h5 className="font-display text-lg">Bed depth: {filter.mediaLayers.reduce((a,l) => a + l.depth, 0).toFixed(2)} m</h5>
        </div>
        <div className="flex gap-2">
          <select value={filter.mediaConfig} onChange={(e) => setMediaConfig(e.target.value)}>
            <option value="custom">Custom</option>
            {Object.entries(MEDIA_CONFIGURATIONS).map(([k, v]) => (
              <option key={k} value={k}>{v.name}</option>
            ))}
          </select>
          <button className="ghost" onClick={addLayer}>+ Add layer</button>
        </div>
      </div>

      <table className="data">
        <thead>
          <tr>
            <th>#</th>
            <th>Media</th>
            <th className="text-right">Depth (m)</th>
            <th className="text-right">d_e (mm)</th>
            <th className="text-right">UC</th>
            <th className="text-right">Porosity</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filter.mediaLayers.map((layer, idx) => (
            <tr key={idx}>
              <td className="font-mono">{idx + 1}</td>
              <td>
                <select value={layer.media} onChange={(e) => {
                  const next = e.target.value;
                  const def = MEDIA_LIBRARY[next];
                  updateMediaLayer(idx, { media: next, d_mm: def.d_mm_default, uc: def.uc_default ?? 1.5, porosity: def.porosity });
                }}>
                  {Object.entries(MEDIA_LIBRARY).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
                </select>
              </td>
              <td className="num">
                <input type="number" min="0.05" max="3" step="0.05" value={layer.depth}
                  onChange={(e) => updateMediaLayer(idx, { depth: Number(e.target.value) })}
                  style={{ width: 60, textAlign: "right" }} />
              </td>
              <td className="num">
                <input type="number" min="0.1" max="5" step="0.05" value={layer.d_mm}
                  onChange={(e) => updateMediaLayer(idx, { d_mm: Number(e.target.value) })}
                  style={{ width: 60, textAlign: "right" }} />
              </td>
              <td className="num">
                <input type="number" min="1.0" max="2.5" step="0.05" value={layer.uc ?? 1.5}
                  onChange={(e) => updateMediaLayer(idx, { uc: Number(e.target.value) })}
                  style={{ width: 56, textAlign: "right" }} />
              </td>
              <td className="num">
                <input type="number" min="0.25" max="0.65" step="0.01" value={layer.porosity}
                  onChange={(e) => updateMediaLayer(idx, { porosity: Number(e.target.value) })}
                  style={{ width: 60, textAlign: "right" }} />
              </td>
              <td>
                <button className="ghost" onClick={() => removeLayer(idx)} style={{ padding: "2px 8px", fontSize: 11 }}>×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs italic mt-2" style={{ color: "var(--ink-500)", fontFamily: "Source Serif 4, serif" }}>
        d_e = effective grain size (d₁₀). UC = uniformity coefficient (d₆₀/d₁₀). The clean-bed headloss equation is calibrated against d_e; Cleasby-Logsdon correction (1 + 1.3×(UC−1)) is applied per layer to account for non-uniform grading.
      </p>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="eyebrow mb-1" style={{ fontSize: 9 }}>{label}</div>
      {children}
    </div>
  );
}
