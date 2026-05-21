// components/LikeForLikeComparison.js
// Pure filter performance comparison — strips out upstream and BW design
// choices so the two filter beds can be assessed on like-for-like operating
// conditions. The user enters feed TSS and TSS-removal independently for each
// design: equal values → pure filter comparison; unequal → quantifies how
// much of the performance difference is upstream-driven (clarifier carryover,
// algae allowance) vs filter-design-driven.

import { useState } from "react";
import {
  cleanBedHeadloss, underdrainHeadloss, filtrationVelocity,
  totalFilterArea, totalBedDepth, mintsTienLoad,
} from "../lib/filterPhysics";
import { effectiveKMultiplier, K_PRAGMATIC_CAP, maxKAtHead } from "../lib/filterCalculations";

const RUST  = "var(--rust)";
const OCHRE = "#C8961A";
const SAGE  = "#5A7359";
const SLATE = "#3F5870";
const INK_500 = "var(--ink-500)";

// Operating-mode configuration. Coagulation uses different chemistry per
// designer (D1 ferric, D2 alum); lime softening uses the same CaCO3-dominant
// precipitate for both. Default feed TSS values reflect the designer-documented
// conditions for each mode.
const MODE_CONFIG = {
  coagulation: {
    label: "Coagulation (maximum turbidity)",
    precipD1: { alum: 0, ferric: 1, caco3: 0, mgoh2: 0, other: 0 },   // D1 ferric
    precipD2: { alum: 1, ferric: 0, caco3: 0, mgoh2: 0, other: 0 },   // D2 alum
    defTssD1: 8.0, defTssD2: 10.0,
    defRemovalD1: 97, defRemovalD2: 90,
    chemNote: "D1 on ferric coagulation, D2 on alum coagulation",
  },
  softening: {
    label: "100% lime softening at pH 10",
    precipD1: { alum: 0, ferric: 0, caco3: 0.90, mgoh2: 0.05, other: 0.05 },
    precipD2: { alum: 0, ferric: 0, caco3: 0.90, mgoh2: 0.05, other: 0.05 },
    defTssD1: 11.6, defTssD2: 42.4,
    defRemovalD1: 97, defRemovalD2: 90,
    chemNote: "both designs on lime softening at pH 10 (CaCO3-dominant precipitate)",
  },
};

export default function LikeForLikeComparison({ filterD1, filterD2, feedD1, feedD2, mode = "softening" }) {
  const cfg = MODE_CONFIG[mode] || MODE_CONFIG.softening;
  // Per-designer deposit structure factor for this operating mode
  const kmultD1 = effectiveKMultiplier(cfg.precipD1).multiplier;
  const kmultD2 = effectiveKMultiplier(cfg.precipD2).multiplier;

  // User-controlled comparison inputs (independent per design)
  const [tssD1, setTssD1]         = useState(cfg.defTssD1);
  const [tssD2, setTssD2]         = useState(cfg.defTssD2);
  const [removalD1, setRemovalD1] = useState(cfg.defRemovalD1);
  const [removalD2, setRemovalD2] = useState(cfg.defRemovalD2);
  const [flow_MLD, setFlow]       = useState(120);
  const [runHours, setRunHours]   = useState(24);

  const compute = (filter, feed, tss, removalPct, K_mult) => {
    const totalArea = totalFilterArea(filter.numFilters, filter.areaPerFilter_m2);
    const bedDepth  = totalBedDepth(filter.mediaLayers);

    // Solids capture mass balance
    const totalLoad_kgd      = tss * flow_MLD;
    const captured_kgd       = totalLoad_kgd * removalPct / 100;
    const captured_perFilter = captured_kgd / filter.numFilters;
    const loading_kgm2d      = captured_kgd / totalArea;

    // Operating K at the chosen run length
    const K          = loading_kgm2d * runHours / 24;
    const sigma_obs  = K / bedDepth;
    const sigma_eff  = sigma_obs / (K_mult || 1.0);
    const mintsValid = sigma_obs < 4.0;

    // Capacity measures
    const anth     = filter.mediaLayers.find((l) => l.media === "anthracite");
    const sand     = filter.mediaLayers.find((l) => l.media === "sand");
    const anthDepth = anth?.depth ?? 0;
    const sandDepth = sand?.depth ?? 0;
    const K_porefill      = anthDepth * 7.0 + sandDepth * 1.0;
    const K_mintsValidity = 4.0 * bedDepth * K_mult;
    const K_Kawamura_low  = 1.0 * anthDepth;
    const K_Kawamura_high = 1.5 * anthDepth;

    // BW volume — DUMP (drain) + FILTER BACKWASH WATER ONLY, excluding FTW.
    // FTW handling differs between designs (D1 dumps, D2 recycles) so it is
    // excluded from the like-for-like BW-water comparison.
    const drain_m3   = feed?.drainVolume_m3 ?? 0;
    const bwWater_m3 = feed?.backwashVolume_m3 ?? 0;
    const bwCompare_m3 = drain_m3 + bwWater_m3;          // excl. FTW

    // Head budget at the operating K
    const v_ms = filtrationVelocity(flow_MLD, totalArea);
    const v_mh = v_ms * 3600;
    const cb = cleanBedHeadloss({
      layers: filter.mediaLayers, velocity_m_s: v_ms,
      equation: filter.cleanBedEquation,
      applyUCCorrection: filter.applyUCCorrection !== false,
      temp_C: filter.temp_C ?? 10,
    });
    const ud_m     = underdrainHeadloss(filter.underdrain, v_ms);
    const load_m   = mintsTienLoad(Math.max(0, sigma_eff));
    const appurt_m = filter.appurtenanceLoss_m ?? 0.15;
    const total_dH = cb.total_m + ud_m + load_m + appurt_m;
    const margin   = filter.drivingHead_m - total_dH;
    const feasible = margin >= 0;

    const maxK = maxKAtHead({
      filter, flow_MLD, K_multiplier: K_mult, drivingHead_m: filter.drivingHead_m,
    });
    const N_maxK = maxK.find((r) => r.key === "N") ?? {};

    return {
      tss, removalPct, totalLoad_kgd, captured_kgd, captured_perFilter, loading_kgm2d,
      K, sigma_obs, sigma_eff, mintsValid,
      K_porefill, K_mintsValidity, K_Kawamura_low, K_Kawamura_high,
      K_max: N_maxK.K_max, K_max_hydraulic: N_maxK.K_max_hydraulic, K_capped: N_maxK.K_capped,
      drain_m3, bwWater_m3, bwCompare_m3,
      v_mh, cb_total: cb.total_m, ud_m, load_m, appurt_m, total_dH, margin, feasible,
      drivingHead: filter.drivingHead_m,
      totalArea, bedDepth, anthDepth, sandDepth,
      numFilters: filter.numFilters, areaPerFilter: filter.areaPerFilter_m2,
    };
  };

  const r1 = compute(filterD1, feedD1, tssD1, removalD1, kmultD1);
  const r2 = compute(filterD2, feedD2, tssD2, removalD2, kmultD2);

  const feedMatch = Math.abs(tssD1 - tssD2) < 0.01 && Math.abs(removalD1 - removalD2) < 0.01;

  const fmtRatio = (a, b) => {
    if (b === 0 || !isFinite(a / b)) return "—";
    const r = a / b;
    if (Math.abs(r - 1) < 0.02) return "≈";
    return r > 1 ? `D1 ${r.toFixed(2)}×` : `D2 ${(1/r).toFixed(2)}×`;
  };
  const fmtAbsDelta = (a, b, dec = 2) => {
    const d = a - b;
    if (Math.abs(d) < Math.pow(10, -dec) * 0.5) return "≈";
    return d > 0 ? `D1 +${d.toFixed(dec)}` : `D2 +${(-d).toFixed(dec)}`;
  };

  return (
    <div>
      <div className="mb-6 text-sm" style={{ fontFamily: "Source Serif 4, serif", color: INK_500, fontStyle: "italic" }}>
        Strips out upstream and BW process design differences so the two filter beds can be assessed
        side-by-side. Feed TSS and TSS-removal are set independently per design — equal values give a
        pure filter comparison; unequal values show how much of the gap is upstream-driven. Backwash-water
        comparison counts dump water + filter backwash water only (FTW excluded — its handling differs
        between the two designs). Operating mode: {cfg.label}; {cfg.chemNote}. deposit structure factor applied —
        D1 {kmultD1.toFixed(2)}×, D2 {kmultD2.toFixed(2)}×.
      </div>

      {/* ----------------- INPUT CONTROLS ----------------- */}
      <div className="mb-8 p-4" style={{ background: "var(--paper-dark)", border: "0.5px solid var(--ink-300)" }}>
        <div className="grid grid-cols-2 gap-8 mb-4">
          {/* D1 column */}
          <div>
            <div className="eyebrow mb-2" style={{ color: RUST }}>Designer 1 feed</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="eyebrow mb-1" style={{ fontSize: 9 }}>Feed TSS (mg/L)</div>
                <input type="number" min="0" max="500" step="0.1"
                  value={tssD1}
                  onChange={(e) => setTssD1(parseFloat(e.target.value) || 0)}
                  style={{ width: "100%", fontFamily: "JetBrains Mono, monospace", fontSize: 14 }} />
              </div>
              <div>
                <div className="eyebrow mb-1" style={{ fontSize: 9 }}>TSS removal (%)</div>
                <input type="number" min="0" max="100" step="0.5"
                  value={removalD1}
                  onChange={(e) => setRemovalD1(parseFloat(e.target.value) || 0)}
                  style={{ width: "100%", fontFamily: "JetBrains Mono, monospace", fontSize: 14 }} />
              </div>
            </div>
          </div>
          {/* D2 column */}
          <div>
            <div className="eyebrow mb-2" style={{ color: SLATE }}>Designer 2 feed</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="eyebrow mb-1" style={{ fontSize: 9 }}>Feed TSS (mg/L)</div>
                <input type="number" min="0" max="500" step="0.1"
                  value={tssD2}
                  onChange={(e) => setTssD2(parseFloat(e.target.value) || 0)}
                  style={{ width: "100%", fontFamily: "JetBrains Mono, monospace", fontSize: 14 }} />
              </div>
              <div>
                <div className="eyebrow mb-1" style={{ fontSize: 9 }}>TSS removal (%)</div>
                <input type="number" min="0" max="100" step="0.5"
                  value={removalD2}
                  onChange={(e) => setRemovalD2(parseFloat(e.target.value) || 0)}
                  style={{ width: "100%", fontFamily: "JetBrains Mono, monospace", fontSize: 14 }} />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-end gap-6" style={{ flexWrap: "wrap" }}>
          <div>
            <div className="eyebrow mb-1" style={{ fontSize: 9 }}>Plant flow (ML/d)</div>
            <input type="number" min="0" step="1"
              value={flow_MLD}
              onChange={(e) => setFlow(parseFloat(e.target.value) || 0)}
              style={{ width: 90, fontFamily: "JetBrains Mono, monospace", fontSize: 14 }} />
          </div>
          <div>
            <div className="eyebrow mb-1" style={{ fontSize: 9 }}>Operating run length (h)</div>
            <input type="number" min="1" max="500" step="1"
              value={runHours}
              onChange={(e) => setRunHours(parseFloat(e.target.value) || 1)}
              style={{ width: 90, fontFamily: "JetBrains Mono, monospace", fontSize: 14 }} />
          </div>
          <button
            type="button"
            onClick={() => { setTssD2(tssD1); setRemovalD2(removalD1); }}
            className="text-xs"
            style={{ fontFamily: "JetBrains Mono, monospace", color: SLATE, textDecoration: "underline", background: "none", border: "none", cursor: "pointer", paddingBottom: 4 }}>
            → set D2 feed = D1 (like-for-like)
          </button>
          <button
            type="button"
            onClick={() => { setTssD1(tssD2); setRemovalD1(removalD2); }}
            className="text-xs"
            style={{ fontFamily: "JetBrains Mono, monospace", color: RUST, textDecoration: "underline", background: "none", border: "none", cursor: "pointer", paddingBottom: 4 }}>
            ← set D1 feed = D2 (like-for-like)
          </button>
        </div>

        <div className="mt-3 text-xs italic" style={{ color: INK_500, fontFamily: "Source Serif 4, serif" }}>
          {feedMatch
            ? `Pure filter comparison — both designs at identical feed conditions (${tssD1} mg/L, ${removalD1}% removal). Differences below are filter-design-driven only.`
            : `Asymmetric feed: D1 at ${tssD1} mg/L / ${removalD1}%, D2 at ${tssD2} mg/L / ${removalD2}%. The comparison combines filter design + upstream clarifier performance. Use the buttons above to equalise feeds for a pure filter comparison.`}
        </div>
      </div>

      {/* ----------------- COMPARISON TABLE ----------------- */}
      <table className="data" style={{ tableLayout: "fixed", width: "100%" }}>
        <colgroup>
          <col style={{ width: "40%" }} />
          <col style={{ width: "20%" }} />
          <col style={{ width: "20%" }} />
          <col style={{ width: "20%" }} />
        </colgroup>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Metric</th>
            <th style={{ textAlign: "right", color: RUST }}>D1</th>
            <th style={{ textAlign: "right", color: SLATE }}>D2</th>
            <th style={{ textAlign: "right", color: INK_500 }}>Comparison</th>
          </tr>
        </thead>
        <tbody>

          <SectionRow label="Filter geometry" />
          <Row label="Filters in bank" v1={r1.numFilters} v2={r2.numFilters} cmp={fmtRatio(r1.numFilters, r2.numFilters)} />
          <Row label="Area per filter" unit="m²" v1={r1.areaPerFilter.toFixed(1)} v2={r2.areaPerFilter.toFixed(1)} cmp={fmtRatio(r1.areaPerFilter, r2.areaPerFilter)} />
          <Row label="Total filter area" unit="m²" v1={r1.totalArea.toFixed(1)} v2={r2.totalArea.toFixed(1)} cmp={fmtRatio(r1.totalArea, r2.totalArea)} />
          <Row label="Anthracite depth" unit="m" v1={r1.anthDepth.toFixed(2)} v2={r2.anthDepth.toFixed(2)} cmp={fmtRatio(r1.anthDepth, r2.anthDepth)} />
          <Row label="Sand depth" unit="m" v1={r1.sandDepth.toFixed(2)} v2={r2.sandDepth.toFixed(2)} cmp={fmtRatio(r1.sandDepth, r2.sandDepth)} />
          <Row label="Total bed depth" unit="m" v1={r1.bedDepth.toFixed(2)} v2={r2.bedDepth.toFixed(2)} cmp={fmtRatio(r1.bedDepth, r2.bedDepth)} />
          <Row label="Driving head" unit="m" v1={r1.drivingHead.toFixed(2)} v2={r2.drivingHead.toFixed(2)} cmp={fmtRatio(r1.drivingHead, r2.drivingHead)} />

          <SectionRow label="Feed conditions (set above)" />
          <Row label="Feed TSS" unit="mg/L" emphasis
            v1={r1.tss.toFixed(1)} v2={r2.tss.toFixed(1)}
            c1={RUST} c2={SLATE}
            cmp={feedMatch ? "same" : fmtRatio(r2.tss, r1.tss)} />
          <Row label="TSS removal" unit="%" emphasis
            v1={r1.removalPct.toFixed(1)} v2={r2.removalPct.toFixed(1)}
            c1={RUST} c2={SLATE}
            cmp={feedMatch ? "same" : fmtAbsDelta(r1.removalPct, r2.removalPct, 1)} />

          <SectionRow label="Solids load" />
          <Row label="Total load to bank" unit="kg/d" v1={r1.totalLoad_kgd.toFixed(0)} v2={r2.totalLoad_kgd.toFixed(0)} cmp={fmtRatio(r1.totalLoad_kgd, r2.totalLoad_kgd)} />
          <Row label="Captured solids" unit="kg/d" v1={r1.captured_kgd.toFixed(0)} v2={r2.captured_kgd.toFixed(0)} cmp={fmtRatio(r1.captured_kgd, r2.captured_kgd)} />
          <Row label="Captured per filter" unit="kg/d" v1={r1.captured_perFilter.toFixed(0)} v2={r2.captured_perFilter.toFixed(0)} cmp={fmtRatio(r1.captured_perFilter, r2.captured_perFilter)} />
          <Row label="Loading per filter area" unit="kg/m²/d" emphasis v1={r1.loading_kgm2d.toFixed(3)} v2={r2.loading_kgm2d.toFixed(3)} cmp={fmtRatio(r1.loading_kgm2d, r2.loading_kgm2d)} />

          <SectionRow label="Operating point (at chosen run length)" />
          <Row label="K achieved" unit="kg/m²/run" emphasis
            v1={r1.K.toFixed(2)} v2={r2.K.toFixed(2)}
            c1={RUST} c2={SLATE}
            cmp={fmtRatio(r1.K, r2.K)} />
          <Row label="σ_obs (specific deposit, raw)" unit="g/L"
            v1={`${r1.sigma_obs.toFixed(2)}${!r1.mintsValid ? " ⚠" : ""}`}
            v2={`${r2.sigma_obs.toFixed(2)}${!r2.mintsValid ? " ⚠" : ""}`}
            c1={r1.mintsValid ? "var(--ink-900)" : RUST}
            c2={r2.mintsValid ? "var(--ink-900)" : RUST}
            cmp={fmtRatio(r1.sigma_obs, r2.sigma_obs)} />
          <Row label="σ_eff (precipitate-adjusted)" unit="g/L" v1={r1.sigma_eff.toFixed(2)} v2={r2.sigma_eff.toFixed(2)} cmp={fmtRatio(r1.sigma_eff, r2.sigma_eff)} />

          <SectionRow label="Solids holding capacity — multiple measures" />
          <Row label="Pore-fill ceiling (anth 7.0 + sand 1.0 kg/m³)" unit="kg/m²/run" emphasis v1={r1.K_porefill.toFixed(2)} v2={r2.K_porefill.toFixed(2)} cmp={fmtRatio(r1.K_porefill, r2.K_porefill)} />
          <Row label="Mints-Tien σ-validity limit (σ < 4 g/L)" unit="kg/m²/run" v1={r1.K_mintsValidity.toFixed(2)} v2={r2.K_mintsValidity.toFixed(2)} cmp={fmtRatio(r1.K_mintsValidity, r2.K_mintsValidity)} />
          <Row label="Kawamura range (1.0–1.5 × anth depth)" unit="kg/m²/run"
            v1={`${r1.K_Kawamura_low.toFixed(2)}–${r1.K_Kawamura_high.toFixed(2)}`}
            v2={`${r2.K_Kawamura_low.toFixed(2)}–${r2.K_Kawamura_high.toFixed(2)}`}
            cmp={fmtRatio(r1.K_Kawamura_high, r2.K_Kawamura_high)} />
          <Row label="AWWA M37 / Cleasby-Logsdon typical" unit="kg/m²/run" v1="2.0–5.0" v2="2.0–5.0" cmp="same range" />
          <Row label="K_max from head budget alone (uncapped)" unit="kg/m²/run" emphasis
            v1={r1.K_max_hydraulic != null ? r1.K_max_hydraulic.toFixed(2) : "—"}
            v2={r2.K_max_hydraulic != null ? r2.K_max_hydraulic.toFixed(2) : "—"}
            cmp={fmtRatio(r1.K_max_hydraulic, r2.K_max_hydraulic)} />
          <Row label="K_max governing (head limit, then capped at 6.0)" unit="kg/m²/run"
            v1={r1.K_max != null ? `${r1.K_max.toFixed(2)}${r1.K_capped ? " (cap)" : ""}` : "—"}
            v2={r2.K_max != null ? `${r2.K_max.toFixed(2)}${r2.K_capped ? " (cap)" : ""}` : "—"}
            c1={INK_500} c2={INK_500}
            cmp={(r1.K_capped && r2.K_capped) ? "both at cap" : fmtRatio(r1.K_max, r2.K_max)} />
          <Row label="Pragmatic K cap (Cleasby-Logsdon)" unit="kg/m²/run" v1={K_PRAGMATIC_CAP.toFixed(1)} v2={K_PRAGMATIC_CAP.toFixed(1)} c1={INK_500} c2={INK_500} cmp="same" />

          <SectionRow label="Backwash water — dump + filter backwash (FTW excluded)" />
          <Row label="Dump (drain) water per cycle" unit="m³" v1={r1.drain_m3.toFixed(0)} v2={r2.drain_m3.toFixed(0)} cmp={fmtRatio(r1.drain_m3, r2.drain_m3)} />
          <Row label="Filter backwash water per cycle" unit="m³" v1={r1.bwWater_m3.toFixed(0)} v2={r2.bwWater_m3.toFixed(0)} cmp={fmtRatio(r1.bwWater_m3, r2.bwWater_m3)} />
          <Row label="BW water per cycle (dump + backwash)" unit="m³" emphasis v1={r1.bwCompare_m3.toFixed(0)} v2={r2.bwCompare_m3.toFixed(0)} cmp={fmtRatio(r1.bwCompare_m3, r2.bwCompare_m3)} />
          <Row label="BW water per m² filter area" unit="m³/m²"
            v1={(r1.bwCompare_m3 / r1.areaPerFilter).toFixed(2)}
            v2={(r2.bwCompare_m3 / r2.areaPerFilter).toFixed(2)}
            cmp={fmtRatio(r1.bwCompare_m3 / r1.areaPerFilter, r2.bwCompare_m3 / r2.areaPerFilter)} />

          <SectionRow label="Head budget at this operating K" />
          <Row label="Filtration velocity" unit="m/h" v1={r1.v_mh.toFixed(2)} v2={r2.v_mh.toFixed(2)} cmp={fmtRatio(r1.v_mh, r2.v_mh)} />
          <Row label="Clean-bed ΔH" unit="m" v1={r1.cb_total.toFixed(3)} v2={r2.cb_total.toFixed(3)} cmp={fmtAbsDelta(r1.cb_total, r2.cb_total, 3)} />
          <Row label="Underdrain ΔH" unit="m" v1={r1.ud_m.toFixed(3)} v2={r2.ud_m.toFixed(3)} cmp={fmtAbsDelta(r1.ud_m, r2.ud_m, 3)} />
          <Row label="Mints-Tien load ΔH (at σ_eff)" unit="m" v1={r1.load_m.toFixed(3)} v2={r2.load_m.toFixed(3)} cmp={fmtAbsDelta(r1.load_m, r2.load_m, 3)} />
          <Row label="Appurtenances ΔH" unit="m" v1={r1.appurt_m.toFixed(3)} v2={r2.appurt_m.toFixed(3)} cmp={fmtAbsDelta(r1.appurt_m, r2.appurt_m, 3)} />
          <Row label="Total ΔH required" unit="m" emphasis v1={r1.total_dH.toFixed(2)} v2={r2.total_dH.toFixed(2)} cmp={fmtAbsDelta(r1.total_dH, r2.total_dH)} />
          <Row label="Margin vs available head" unit="m" emphasis
            v1={`${r1.margin >= 0 ? "+" : ""}${r1.margin.toFixed(2)}`}
            v2={`${r2.margin >= 0 ? "+" : ""}${r2.margin.toFixed(2)}`}
            c1={r1.feasible ? SAGE : RUST}
            c2={r2.feasible ? SAGE : RUST}
            cmp={fmtAbsDelta(r1.margin, r2.margin)} />

          <SectionRow label="Verdict — operating-point feasibility checks (pass/fail; design margin is shown in the rows above)" />
          <Row label="Operating K below pore-fill ceiling?"
            v1={r1.K < r1.K_porefill ? `✓ (${(r1.K/r1.K_porefill*100).toFixed(0)}%)` : "✗"}
            v2={r2.K < r2.K_porefill ? `✓ (${(r2.K/r2.K_porefill*100).toFixed(0)}%)` : "✗"}
            c1={r1.K < r1.K_porefill ? SAGE : RUST}
            c2={r2.K < r2.K_porefill ? SAGE : RUST}
            cmp="" />
          <Row label="Operating K below breakthrough cap (6.0)?"
            v1={r1.K < K_PRAGMATIC_CAP ? `✓ (${(r1.K/K_PRAGMATIC_CAP*100).toFixed(0)}%)` : "✗ above cap"}
            v2={r2.K < K_PRAGMATIC_CAP ? `✓ (${(r2.K/K_PRAGMATIC_CAP*100).toFixed(0)}%)` : "✗ above cap"}
            c1={r1.K < K_PRAGMATIC_CAP ? SAGE : RUST}
            c2={r2.K < K_PRAGMATIC_CAP ? SAGE : RUST}
            cmp="" />
          <Row label="σ within Mints-Tien validity?"
            v1={r1.mintsValid ? "✓" : "⚠ pore-clogging"}
            v2={r2.mintsValid ? "✓" : "⚠ pore-clogging"}
            c1={r1.mintsValid ? SAGE : OCHRE}
            c2={r2.mintsValid ? SAGE : OCHRE}
            cmp="" />
          <Row label="Head budget feasible?"
            v1={r1.feasible ? "✓" : "✗ deficit"}
            v2={r2.feasible ? "✓" : "✗ deficit"}
            c1={r1.feasible ? SAGE : RUST}
            c2={r2.feasible ? SAGE : RUST}
            cmp="" />
        </tbody>
      </table>
    </div>
  );
}

function SectionRow({ label }) {
  return (
    <tr>
      <td colSpan={4} className="eyebrow"
        style={{ paddingTop: 14, paddingBottom: 4, borderBottom: "0.5px solid var(--ink-300)", textAlign: "left" }}>
        {label}
      </td>
    </tr>
  );
}

function Row({ label, unit, emphasis, v1, v2, c1, c2, cmp }) {
  return (
    <tr>
      <td style={{ fontWeight: emphasis ? 500 : 400, textAlign: "left" }}>
        {label}{unit ? <span style={{ color: INK_500, fontWeight: 400, marginLeft: 8 }}>{unit}</span> : null}
      </td>
      <td className="num" style={{ textAlign: "right", color: c1 || "var(--ink-900)", fontWeight: emphasis ? 700 : 400 }}>{v1}</td>
      <td className="num" style={{ textAlign: "right", color: c2 || "var(--ink-900)", fontWeight: emphasis ? 700 : 400 }}>{v2}</td>
      <td className="num" style={{ textAlign: "right", color: INK_500 }}>{cmp}</td>
    </tr>
  );
}
