// components/PrecipitateNarrative.js
// Full narrative descriptions for each precipitate type — explains why
// each has the K characteristic it does.

import { PRECIPITATE_MULTIPLIERS } from "../lib/filterDefaults";

const ORDER = ["mgoh2", "alum", "other", "ferric", "caco3"];  // worst to best K

const COLOURS = {
  mgoh2:  "#7B5E8C",  // muted purple
  alum:   "#3F5870",  // slate
  other:  "#5A7359",  // sage
  ferric: "#C8961A",  // ochre
  caco3:  "#B0451F",  // rust
};

export default function PrecipitateNarrative() {
  return (
    <div>
      <p className="font-display text-base italic mb-6 max-w-3xl" style={{ color: "var(--ink-700)" }}>
        Five precipitate types reach the filter from upstream treatment, each with distinct morphology and packing behaviour. The deposit structure factor captures how the precipitate type affects solids-holding capacity at a given headloss budget, relative to alum floc as the baseline (1.00×).
      </p>

      <div className="space-y-8">
        {ORDER.map((key) => {
          const p = PRECIPITATE_MULTIPLIERS[key];
          const colour = COLOURS[key];
          return (
            <article key={key} style={{ borderLeft: `3px solid ${colour}`, paddingLeft: 20 }}>
              <div className="flex items-baseline justify-between mb-2">
                <h4 className="font-display text-2xl" style={{ letterSpacing: "-0.01em" }}>
                  {p.label}
                </h4>
                <div className="font-mono text-sm tabular" style={{ color: colour, fontWeight: 600 }}>
                  Deposit structure factor {p.multiplier.toFixed(2)}×
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs tabular mb-3" style={{ color: "var(--ink-500)" }}>
                <div>Floc density</div><div>{p.density_gcm3.toFixed(3)} g/cm³</div>
                <div>Dry solids content</div><div>{p.drySolids_pct}</div>
              </div>

              <div className="space-y-3 font-display text-[14px] leading-relaxed">
                <div>
                  <div className="eyebrow mb-1" style={{ fontSize: 9 }}>What it is</div>
                  <p>{p.description}</p>
                </div>
                <div>
                  <div className="eyebrow mb-1" style={{ fontSize: 9 }}>Impact on K</div>
                  <p>{p.impact}</p>
                </div>
                <div>
                  <div className="eyebrow mb-1" style={{ fontSize: 9 }}>Practical note</div>
                  <p style={{ color: "var(--ink-700)" }}>{p.practicalNote}</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-10 p-5" style={{ background: "var(--paper-dark)", borderLeft: "2px solid var(--rust)" }}>
        <div className="eyebrow mb-2">Combining the precipitates</div>
        <p className="font-display text-[14px] leading-relaxed mb-2">
          The effective deposit structure factor for a real filter feed is a mass-weighted average across the precipitate fractions:
        </p>
        <div className="font-mono text-sm tabular my-3 p-3" style={{ background: "var(--paper)", border: "0.5px solid var(--ink-300)" }}>
          K_effective = K_alum_baseline × Σ (f_i × multiplier_i)
        </div>
        <p className="font-display text-[14px] leading-relaxed">
          For the two designs as currently configured: D1 (mostly ferric + partial softening CaCO₃) has an effective deposit structure factor of ~1.33×; D2 (alum + full softening CaCO₃) has ~1.28×. Both substantially exceed the alum baseline because of the CaCO₃ contribution from softening.
        </p>
        <p className="font-display text-[14px] leading-relaxed italic mt-3" style={{ color: "var(--ink-700)" }}>
          The deposit structure factor framework is most useful when comparing designs whose upstream treatment differs in coagulant choice, softening intensity, or operating pH. If both designs use identical upstream treatment, the precipitate composition is the same and the deposit structure factor cancels out of the comparison — the meaningful differences are then in filter geometry, run length, and BW practice.
        </p>
      </div>
    </div>
  );
}
