// lib/reportGenerator.js
// Tier-1 consultant-grade Markdown report.
//
// Structure:
//   Executive summary (verdict, headline numbers)
//   Headline comparison table (one-table-tells-the-story)
//   Section 1   Filter design
//   Section 2   Feed inputs
//   Section 3   Derived performance (per designer envelope)
//   Section 4   Filter loading by redundancy condition
//   Section 5   Hydraulic redundancy matrix (σ_eff-based, monotonic)
//   Section 6   Plant capacity and BW water balance
//   Section 7   Head budget vs K (with K_max vs K_implied verdicts)
//   Section 8   K reality check (K_implied vs K_max vs typical industry ranges)
//   Section 9   Water-cost differential (lifecycle implication)
//   Section 10  Risk register and verification recommendations
//   Section 11  Physics and references

import { DESIGNER_DEFAULTS, SCENARIOS, SCENARIO_SHORT, pickScenarioValue, peakFlowFromEnvelope } from "./filterDefaults";
import { REFERENCES, PHYSICS_NOTES } from "./references";
import {
  redundancyMatrix, steadyStateOfflineMetrics, plantCapacityImpact,
  totalSequenceMin, headlossDevelopmentRate,
} from "./backwashDynamics";
import {
  cleanBedHeadloss, filtrationVelocity, totalFilterArea, totalBedDepth,
  UNDERDRAIN_LIBRARY, CLEAN_BED_EQ_LABELS, waterDynamicViscosity,
} from "./filterPhysics";
import { maxKAtHead, headBudgetCurve } from "./filterCalculations";

// =========================================================================
// MAIN ENTRY POINT
// =========================================================================
export function generateMarkdownReport({
  flowEnv, dHLModel,
  filterD1, filterD2, feedD1, feedD2,
  envelopeD1, envelopeD2,
  treatedWaterCost_per_ML = 1500,   // $ per ML (configurable, default AU municipal)
  nameD1 = "Designer 1",            // display name for D1 in the report
  nameD2 = "Designer 2",            // display name for D2 in the report
}) {
  // Fall back to the generic labels if a name field is left blank
  const d1 = (nameD1 && nameD1.trim()) ? nameD1.trim() : "Designer 1";
  const d2 = (nameD2 && nameD2.trim()) ? nameD2.trim() : "Designer 2";
  const date = new Date().toISOString().slice(0, 10);
  const peakFlow = peakFlowFromEnvelope(flowEnv);

  // -----------------------------------------------------------------------
  // Pre-compute everything the report needs so the body is just templating.
  // -----------------------------------------------------------------------
  const summary = buildSummary({
    filterD1, filterD2, feedD1, feedD2,
    envelopeD1, envelopeD2, flowEnv, peakFlow, treatedWaterCost_per_ML,
  });

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  const report = `# Filter Performance Assessment — D1 vs D2

| | |
|---|---|
| Document date | ${date} |
| Plant flow envelope | ${flowEnv.designFlow_MLD.min} / ${flowEnv.designFlow_MLD.avg} / ${flowEnv.designFlow_MLD.max} ML/d |
| Peak flow (redundancy check) | ${peakFlow.toFixed(0)} ML/d |
| dHL/dt model | ${dHLModel === "linear" ? "Linear" : "Mints differential"} |
| Treated-water cost (for differential analysis) | $${treatedWaterCost_per_ML}/ML |

---

## Executive summary

${execSummary(summary)}

### Headline comparison

${headlineComparison(summary)}

---

## 1. Filter design

### 1.1 Designer 1
${filterSummary(filterD1)}

### 1.2 Designer 2
${filterSummary(filterD2)}

---

## 2. Feed envelope inputs

### 2.1 Designer 1
${feedEnvSummary(feedD1)}

### 2.2 Designer 2
${feedEnvSummary(feedD2)}

---

## 3. Derived performance — min / avg / max

¹ *K_implied is back-calculated from the user-supplied total daily BW volume and the captured solids mass balance — it is the K the operational BW schedule forces, not an independent measurement. See Section 8 for reality-check against hydraulic capability.*

### 3.1 Designer 1
${envelopeTable(envelopeD1)}

### 3.2 Designer 2
${envelopeTable(envelopeD2)}

---

## 4. Filter loading by redundancy condition

### 4.1 Designer 1 — Min
${loadingTable(envelopeD1, "min")}

### 4.2 Designer 1 — Avg
${loadingTable(envelopeD1, "avg")}

### 4.3 Designer 1 — Max
${loadingTable(envelopeD1, "max")}

### 4.4 Designer 2 — Min
${loadingTable(envelopeD2, "min")}

### 4.5 Designer 2 — Avg
${loadingTable(envelopeD2, "avg")}

### 4.6 Designer 2 — Max
${loadingTable(envelopeD2, "max")}

---

## 5. Hydraulic redundancy matrix

σ_eff (precipitate-adjusted) is held **constant within each redundancy table** so headloss varies monotonically with flow and redundancy. K_multiplier is applied at the assessment stage (Section 3), so denser flocs (ferric, CaCO₃) are credited with producing less headloss per kg of solids captured. This makes Section 5 numerically consistent with the head-budget analysis in Section 7.

### 5.1 Designer 1 — Avg scenario (peak flow always uses max envelope)
${redundancyTable(filterD1, envelopeD1, "avg", peakFlow)}

### 5.2 Designer 1 — Max scenario
${redundancyTable(filterD1, envelopeD1, "max", peakFlow)}

### 5.3 Designer 2 — Avg scenario
${redundancyTable(filterD2, envelopeD2, "avg", peakFlow)}

### 5.4 Designer 2 — Max scenario
${redundancyTable(filterD2, envelopeD2, "max", peakFlow)}

${redundancyVerdict(summary)}

---

## 6. Plant capacity & BW water balance

### 6.1 Designer 1 — capacity
${plantCapacityTable(filterD1, envelopeD1, feedD1)}

### 6.2 Designer 2 — capacity
${plantCapacityTable(filterD2, envelopeD2, feedD2)}

### 6.3 BW water balance by component — Designer 1
Destinations:
${bwDestinationSummary(feedD1)}

${bwWaterBalanceTable(envelopeD1)}

### 6.4 BW water balance by component — Designer 2
Destinations:
${bwDestinationSummary(feedD2)}

${bwWaterBalanceTable(envelopeD2)}

${capacityVerdict(summary)}

---

## 7. Head budget vs K (available vs needed)

Shows whether the available driving head supports the K implied by the operational BW schedule across N, N-1, and N-2 conditions. **ΔH req @ K_implied** is the terminal head needed to deliver the K_implied (clean bed + underdrain + Mints-Tien load + appurtenance, with precipitate K-multiplier applied). **K_max @ avail head** is the largest K the driving head can support before terminal headloss is breached — i.e. how much head margin the design has spare.

### 7.1 Designer 1 — Max scenario (peak flow)
- Available driving head: ${filterD1.drivingHead_m.toFixed(2)} m
- K implied (max scenario): ${envelopeD1.max.K_kg_per_m2.toFixed(2)} kg/m²/run
- K multiplier: ${envelopeD1.max.K_multiplier.toFixed(2)}×

${headBudgetTable(filterD1, envelopeD1, "max")}

### 7.2 Designer 1 — Avg scenario
${headBudgetTable(filterD1, envelopeD1, "avg")}

### 7.3 Designer 2 — Max scenario (peak flow)
- Available driving head: ${filterD2.drivingHead_m.toFixed(2)} m
- K implied (max scenario): ${envelopeD2.max.K_kg_per_m2.toFixed(2)} kg/m²/run
- K multiplier: ${envelopeD2.max.K_multiplier.toFixed(2)}×

${headBudgetTable(filterD2, envelopeD2, "max")}

### 7.4 Designer 2 — Avg scenario
${headBudgetTable(filterD2, envelopeD2, "avg")}

${headBudgetVerdict(summary)}

---

## 8. K reality check — implied vs achievable

Filter K (solids holding capacity per run, kg/m²/run) can come from three sources: (a) **K_implied** — back-calculated from user-supplied BW frequency; (b) **K_max** — the maximum K the available driving head can support before terminal headloss; (c) **K_typical** — industry-benchmark range for the media class and loading. A design where K_implied << K_max may be operationally over-conservative (turbidity-limited or surplus margin); K_implied > K_typical warrants verification against pilot or reference plant data.

${kRealityCheckTable(summary)}

${kRealityVerdict(summary)}

---

## 9. Water-cost differential

Treated-water value: $${treatedWaterCost_per_ML}/ML. Net plant water loss to BW translates directly to a recurring cost differential.

${waterCostTable(summary)}

${waterCostVerdict(summary)}

---

## 10. Risk register & verification recommendations

${riskRegister(summary)}

${verificationRecommendations(summary)}

---

## 11. Physics

${Object.values(PHYSICS_NOTES).join("\n\n")}

---

## 12. References

${REFERENCES.map((r) => `- **[${r.id}]** ${r.citation} — *${r.used_for}*`).join("\n")}

---

*Generated by the Filter Performance Comparator. Engineering judgement applies. Numerical conventions: σ_eff is the precipitate-adjusted specific deposit used in Mints-Tien; K_implied is back-calculated from BW frequency; K_max is the head-budget-limited maximum. All headlosses include the Cleasby-Logsdon UC correction when the toggle is on.*
`;

  // -----------------------------------------------------------------------
  // Apply designer display names. The tool uses the neutral D1 / D2 labels
  // internally; the report substitutes the user-supplied names. "Designer 1"
  // and "Designer 2" do not overlap as substrings, so replacement order is
  // immaterial. Bare "D1 vs D2" in the title is handled separately.
  // -----------------------------------------------------------------------
  return report
    .split("Filter Performance Assessment — D1 vs D2")
    .join(`Filter Performance Assessment — ${d1} vs ${d2}`)
    .split("Designer 1").join(d1)
    .split("Designer 2").join(d2);
}

// =========================================================================
// SUMMARY BUILDER
// =========================================================================
function buildSummary({ filterD1, filterD2, feedD1, feedD2, envelopeD1, envelopeD2, flowEnv, peakFlow, treatedWaterCost_per_ML }) {
  const s = { filterD1, filterD2, feedD1, feedD2, envelopeD1, envelopeD2, flowEnv, peakFlow, treatedWaterCost_per_ML };

  // For each designer, find the K_max at avg scenario at peak flow N-2 condition
  // (governing case) and at avg N (normal operating condition).
  const computeKmax = (filter, env) => {
    const scen = env.avg;
    const result = maxKAtHead({
      filter, flow_MLD: peakFlow,
      K_multiplier: scen.K_multiplier,
      drivingHead_m: filter.drivingHead_m,
    });
    return {
      N:    result.find(r => r.key === "N")?.K_max ?? null,
      "N-1": result.find(r => r.key === "N-1")?.K_max ?? null,
      "N-2": result.find(r => r.key === "N-2")?.K_max ?? null,
    };
  };
  s.kmaxD1 = computeKmax(filterD1, envelopeD1);
  s.kmaxD2 = computeKmax(filterD2, envelopeD2);

  // Identify worst-case redundancy margins at each designer (across all scenarios)
  s.worstMarginD1 = worstMargin(filterD1, envelopeD1, peakFlow);
  s.worstMarginD2 = worstMargin(filterD2, envelopeD2, peakFlow);

  // Capacity deficits — pick the avg scenario as representative
  s.deficitD1 = capacityDeficit(filterD1, envelopeD1, feedD1, "avg");
  s.deficitD2 = capacityDeficit(filterD2, envelopeD2, feedD2, "avg");

  // Recurring annual cost differential at avg
  s.annualCostD1 = s.deficitD1.daily_loss_ML * 365 * treatedWaterCost_per_ML;
  s.annualCostD2 = s.deficitD2.daily_loss_ML * 365 * treatedWaterCost_per_ML;
  s.annualCostDiff = s.annualCostD2 - s.annualCostD1;  // positive ⇒ D1 cheaper

  // Industry-benchmark loading flag
  // Typical filtration velocity for granular media: 5-12 m/h (AWWA M37)
  s.D1_v_max_N = envelopeD1.max.loadByCondition.find(c => c.key === "N").hydraulicLoading_m_per_h;
  s.D2_v_max_N = envelopeD2.max.loadByCondition.find(c => c.key === "N").hydraulicLoading_m_per_h;

  // K typical band (kg/m²/run): 2-5 for well-coagulated water, multimedia rapid filters
  s.K_typical_low = 2.0;
  s.K_typical_high = 5.0;

  // Verdict on each designer's K
  const classify = (kImpl, kMaxN) => {
    if (kImpl < s.K_typical_low * 0.5) return "very low";
    if (kImpl < s.K_typical_low) return "low";
    if (kImpl > s.K_typical_high) return "high";
    return "in typical range";
  };
  s.kClassD1 = classify(envelopeD1.avg.K_kg_per_m2, s.kmaxD1.N);
  s.kClassD2 = classify(envelopeD2.avg.K_kg_per_m2, s.kmaxD2.N);

  // Headline verdict
  s.D1pass = s.worstMarginD1.margin_m >= 0;
  s.D2pass = s.worstMarginD2.margin_m >= 0;

  return s;
}

function worstMargin(filter, env, peakFlow) {
  let worst = { margin_m: Infinity };
  for (const scen of SCENARIOS) {
    const sigma_eff = env[scen].sigma_eff_g_per_L;
    const flow = env[scen]._scenarioFlow_MLD;
    const rows = redundancyMatrix({ filter, designFlow_MLD: flow, peakFlow_MLD: peakFlow, sigma_eff_g_per_L: sigma_eff });
    for (const r of rows) {
      if (r.infeasible) continue;
      if (r.margin_m < worst.margin_m) worst = { ...r, scenario_env: scen };
    }
  }
  return worst;
}

function capacityDeficit(filter, env, feed, scenario) {
  const a = env[scenario];
  const bv = a.bwVolumes ?? {};
  const Q = a._scenarioFlow_MLD;
  const daily_loss_ML = (bv.daily_netLoss_m3 ?? 0) / 1000;
  return {
    Q_design_ML: Q,
    daily_loss_ML,
    daily_loss_pct: Q > 0 ? daily_loss_ML / Q * 100 : 0,
    daily_total_BW_ML: (bv.daily_total_m3 ?? 0) / 1000,
    bwVolumes: bv,
  };
}

// =========================================================================
// EXECUTIVE SUMMARY (narrative)
// =========================================================================
function execSummary(s) {
  const fmtMargin = (m) => m >= 0 ? `+${m.toFixed(2)}` : `${m.toFixed(2)}`;
  const verdictD1 = s.D1pass ? "feasible across all scenarios" : `**infeasible** at ${s.worstMarginD1.conditionLabel} · ${s.worstMarginD1.scenarioLabel}`;
  const verdictD2 = s.D2pass ? "feasible across all scenarios" : `**infeasible** at ${s.worstMarginD2.conditionLabel} · ${s.worstMarginD2.scenarioLabel}`;

  // Pick the design preference
  let preferred = "neither", reason = "";
  const k1 = s.envelopeD1.avg.K_kg_per_m2;
  const k2 = s.envelopeD2.avg.K_kg_per_m2;
  const d1Margin = s.worstMarginD1.margin_m;
  const d2Margin = s.worstMarginD2.margin_m;

  if (s.D1pass && s.D2pass) {
    // Both feasible — preference by efficiency
    if (s.deficitD1.daily_loss_pct < s.deficitD2.daily_loss_pct - 1) {
      preferred = "**Designer 1**";
      reason = `lower BW water loss (${s.deficitD1.daily_loss_pct.toFixed(1)}% vs ${s.deficitD2.daily_loss_pct.toFixed(1)}%) and higher K_implied (${k1.toFixed(2)} vs ${k2.toFixed(2)} kg/m²/run), saving an estimated **$${(s.annualCostDiff/1e6).toFixed(2)}M/year** in lost product water`;
    } else if (s.deficitD2.daily_loss_pct < s.deficitD1.daily_loss_pct - 1) {
      preferred = "**Designer 2**";
      reason = `lower BW water loss (${s.deficitD2.daily_loss_pct.toFixed(1)}% vs ${s.deficitD1.daily_loss_pct.toFixed(1)}%) and ${d2Margin > d1Margin ? "more head margin at the worst-case condition" : "comparable hydraulic performance"}`;
    } else {
      preferred = "both designs comparable";
      reason = `BW water deficits similar (${s.deficitD1.daily_loss_pct.toFixed(1)}% vs ${s.deficitD2.daily_loss_pct.toFixed(1)}%); preference depends on factors outside this hydraulic analysis (capital cost, footprint, operational preference)`;
    }
  } else if (s.D1pass) {
    preferred = "**Designer 1**";
    reason = `Designer 2 fails hydraulic feasibility at worst-case redundancy (margin ${fmtMargin(d2Margin)} m)`;
  } else if (s.D2pass) {
    preferred = "**Designer 2**";
    reason = `Designer 1 fails hydraulic feasibility at worst-case redundancy (margin ${fmtMargin(d1Margin)} m)`;
  }

  // Honest capacity statement: only claim surplus hydraulic capacity when the
  // designs are actually feasible, and never describe a physically impossible K
  // as merely "high".
  const kImpossible = (k) => k > 15;   // kg/m²/run, physical ceiling for granular media
  const anyImpossibleK = kImpossible(k1) || kImpossible(k2);
  const bothFeasible = s.D1pass && s.D2pass;
  let capacitySentence;
  if (anyImpossibleK) {
    capacitySentence =
      `D1 K_implied = ${k1.toFixed(1)}, D2 K_implied = ${k2.toFixed(1)} kg/m²/run. ` +
      `**One or both values are physically impossible for granular-media filtration ` +
      `(physical ceiling near 15 kg/m²/run). This indicates an input error — most likely ` +
      `the design flow — and the assessment is not valid until the inputs are corrected.**`;
  } else {
    capacitySentence =
      `D1 operates at K_implied = ${k1.toFixed(2)} kg/m²/run (${s.kClassD1}); ` +
      `D2 at K_implied = ${k2.toFixed(2)} (${s.kClassD2}). The available head budget ` +
      `supports K_max = ${s.kmaxD1.N.toFixed(1)} (D1) / ${s.kmaxD2.N.toFixed(1)} (D2) at ` +
      `N condition. ` +
      (bothFeasible
        ? "Both designs have hydraulic capacity in hand beyond the implied operating point. "
        : "Note this hydraulic headroom does not by itself make a design feasible — see the feasibility verdict above. ") +
      `${k2 < s.K_typical_low ? "**Designer 2's low K_implied (below typical range) requires verification** — it may indicate turbidity-limited operation or conservative BW practice, not media performance. " : ""}` +
      `${k1 > s.K_typical_high ? "**Designer 1's K_implied is above the typical 2-5 range** and should be verified against pilot or reference-plant data." : ""}`;
  }

  return `**Hydraulic feasibility.** D1 is ${verdictD1}; worst margin ${fmtMargin(d1Margin)} m at ${s.worstMarginD1.conditionLabel || "—"}. D2 is ${verdictD2}; worst margin ${fmtMargin(d2Margin)} m at ${s.worstMarginD2.conditionLabel || "—"}.

**Operational efficiency.** D1 loses ${s.deficitD1.daily_loss_pct.toFixed(2)}% of feed to BW at avg flow; D2 loses ${s.deficitD2.daily_loss_pct.toFixed(2)}%. At $${s.treatedWaterCost_per_ML}/ML treated-water cost the differential is **$${Math.abs(s.annualCostDiff/1e6).toFixed(2)}M/year recurring** in favour of ${s.annualCostDiff > 0 ? "D1" : "D2"}.

**Solids holding capacity.** ${capacitySentence}

**Verdict.** ${anyImpossibleK ? "**The assessment is not decision-ready. Correct the flagged input error and re-run before drawing any conclusion.**" : (preferred === "neither" ? "Neither design recommended without addressing the infeasibility flagged above." : `${preferred} preferred — ${reason}.`)} See Sections 8-10 for the reality checks, water-cost analysis, and verification recommendations.`;
}

// =========================================================================
// HEADLINE COMPARISON TABLE
// =========================================================================
function headlineComparison(s) {
  const e1a = s.envelopeD1.avg, e2a = s.envelopeD2.avg;
  const a1 = totalFilterArea(s.filterD1.numFilters, s.filterD1.areaPerFilter_m2);
  const a2 = totalFilterArea(s.filterD2.numFilters, s.filterD2.areaPerFilter_m2);
  const b1 = totalBedDepth(s.filterD1.mediaLayers);
  const b2 = totalBedDepth(s.filterD2.mediaLayers);
  const fmtNoteRatio = (a, b, hot = false) => {
    if (b === 0 || !isFinite(a/b)) return "—";
    const r = a / b;
    if (Math.abs(r - 1) < 0.05) return "—";
    if (r > 1) return `D1 ${r.toFixed(2)}×`;
    return `D2 ${(1/r).toFixed(2)}×`;
  };

  return `| Metric (avg scenario) | Designer 1 | Designer 2 | Comparison |
|---|---:|---:|---|
| **Configuration** | | | |
| Number of filters | ${s.filterD1.numFilters} | ${s.filterD2.numFilters} | ${fmtNoteRatio(s.filterD1.numFilters, s.filterD2.numFilters)} |
| Area per filter (m²) | ${s.filterD1.areaPerFilter_m2.toFixed(1)} | ${s.filterD2.areaPerFilter_m2.toFixed(1)} | ${fmtNoteRatio(s.filterD1.areaPerFilter_m2, s.filterD2.areaPerFilter_m2)} |
| Total filter area (m²) | ${a1.toFixed(1)} | ${a2.toFixed(1)} | ${fmtNoteRatio(a1, a2)} |
| Bed depth (m) | ${b1.toFixed(2)} | ${b2.toFixed(2)} | ${fmtNoteRatio(b1, b2)} |
| Driving head (m) | ${s.filterD1.drivingHead_m.toFixed(2)} | ${s.filterD2.drivingHead_m.toFixed(2)} | ${fmtNoteRatio(s.filterD1.drivingHead_m, s.filterD2.drivingHead_m)} |
| **Operating point** | | | |
| Filtration velocity at N peak (m/h) | ${s.D1_v_max_N.toFixed(2)} | ${s.D2_v_max_N.toFixed(2)} | AWWA M37 typical 5-12 m/h |
| Run length (h) | ${e1a.run_hours.toFixed(1)} | ${e2a.run_hours.toFixed(1)} | ${fmtNoteRatio(e1a.run_hours, e2a.run_hours)} |
| BWs / filter / day | ${e1a.bws_per_filter_per_day.toFixed(2)} | ${e2a.bws_per_filter_per_day.toFixed(2)} | ${fmtNoteRatio(e2a.bws_per_filter_per_day, e1a.bws_per_filter_per_day)} |
| **Solids capture** | | | |
| K implied (kg/m²/run) | **${e1a.K_kg_per_m2.toFixed(2)}** | **${e2a.K_kg_per_m2.toFixed(2)}** | typical 2-5 |
| K alum-equivalent (kg/m²/run) | ${e1a.K_alum_equivalent.toFixed(2)} | ${e2a.K_alum_equivalent.toFixed(2)} | precipitate-normalised |
| K max at avail. head (N, peak) | ${s.kmaxD1.N != null ? s.kmaxD1.N.toFixed(2) : "—"} | ${s.kmaxD2.N != null ? s.kmaxD2.N.toFixed(2) : "—"} | head-budget-limited |
| K_implied / K_max | ${(e1a.K_kg_per_m2 / s.kmaxD1.N * 100).toFixed(0)}% | ${(e2a.K_kg_per_m2 / s.kmaxD2.N * 100).toFixed(0)}% | head utilisation |
| σ_eff at terminal (g/L) | ${e1a.sigma_eff_g_per_L.toFixed(2)} | ${e2a.sigma_eff_g_per_L.toFixed(2)} | Mints validity < 4 |
| **Hydraulics** | | | |
| Worst-case margin (m) | ${s.worstMarginD1.margin_m >= 0 ? "+" : ""}${s.worstMarginD1.margin_m.toFixed(2)} | ${s.worstMarginD2.margin_m >= 0 ? "+" : ""}${s.worstMarginD2.margin_m.toFixed(2)} | at ${s.worstMarginD1.conditionLabel || "—"} (D1) / ${s.worstMarginD2.conditionLabel || "—"} (D2) |
| Hydraulic feasibility | ${s.D1pass ? "✓ all scenarios" : "✗ fails"} | ${s.D2pass ? "✓ all scenarios" : "✗ fails"} | |
| **Water balance** | | | |
| Daily BW water (m³/d) | ${s.deficitD1.daily_total_BW_ML * 1000} | ${s.deficitD2.daily_total_BW_ML * 1000} | gross |
| Net plant water loss (% feed) | ${s.deficitD1.daily_loss_pct.toFixed(2)}% | ${s.deficitD2.daily_loss_pct.toFixed(2)}% | <3% excellent, <5% good |
| Annual water-cost penalty ($) | $${formatLargeMoney(s.annualCostD1)} | $${formatLargeMoney(s.annualCostD2)} | at $${s.treatedWaterCost_per_ML}/ML |
| **Cost differential** | | | $${formatLargeMoney(Math.abs(s.annualCostDiff))} / year in favour of ${s.annualCostDiff > 0 ? "D1" : "D2"} |`;
}

function formatLargeMoney(amount) {
  const abs = Math.abs(amount);
  if (abs >= 1e6) return (amount/1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (amount/1e3).toFixed(0) + "k";
  return amount.toFixed(0);
}

// =========================================================================
// SECTION RENDERERS
// =========================================================================
function filterSummary(f) {
  const mu_mPas = (waterDynamicViscosity(f.temp_C ?? 10) * 1000).toFixed(2);
  return `
- Filters: ${f.numFilters} × ${f.areaPerFilter_m2} m² = ${(f.numFilters * f.areaPerFilter_m2).toFixed(1)} m²
- Media (${totalBedDepth(f.mediaLayers).toFixed(2)} m total): ${f.mediaLayers.map((l, i) => `L${i+1} ${l.media} ${l.depth.toFixed(2)} m / d_e ${l.d_mm} mm / UC ${(l.uc ?? 1.5).toFixed(2)}`).join("; ")}
- Underdrain: ${UNDERDRAIN_LIBRARY[f.underdrain].name} (ref ${UNDERDRAIN_LIBRARY[f.underdrain].typical_headloss_m.toFixed(2)} m @ 5 m/h)
- Clean-bed equation: ${CLEAN_BED_EQ_LABELS[f.cleanBedEquation]}${f.applyUCCorrection !== false ? " with Cleasby-Logsdon UC correction" : " (UC correction off — uniform-media assumption)"}
- Water temperature: ${(f.temp_C ?? 10).toFixed(1)} °C (μ = ${mu_mPas} mPa·s)
- Driving head: ${f.drivingHead_m.toFixed(2)} m, appurtenances ${f.appurtenanceLoss_m.toFixed(2)} m
- BW sequence: ${totalSequenceMin(f.bwSequence)} min total`;
}

function feedEnvSummary(feed) {
  const drain = feed.drainVolume_m3 ?? 0;
  const bw    = feed.backwashVolume_m3 ?? 0;
  const ftw   = feed.ftwVolume_m3 ?? 0;
  const envFmt = (e) => `${e.min} / ${e.avg} / ${e.max}`;
  const destLabel = (k) => k === "waste" ? "waste" : k === "recycle" ? "recycle" : k === "reuse" ? "reuse" : k;
  return `
- Feed TSS (min/avg/max): ${envFmt(feed.feedTSS_mgL)} mg/L
- Filter TSS removal (min/avg/max): ${envFmt(feed.filterTSSRemoval_pct)} %
- Total daily BW (min/avg/max): ${envFmt(feed.totalBWVolume_MLd)} ML/d
- BW volume per cycle (design-fixed): **${(drain + bw + ftw).toFixed(0)} m³/filter** total
  - Filter drain: ${drain.toFixed(0)} m³ → ${destLabel(feed.drainDestination ?? "waste")}
  - Backwash water: ${bw.toFixed(0)} m³ → ${destLabel(feed.backwashDestination ?? "waste")}
  - Filter to waste: ${ftw.toFixed(0)} m³ → ${destLabel(feed.ftwDestination ?? "waste")}`;
}

function envelopeTable(env) {
  const numFmt = (n, dec = 2) => isFinite(n) ? n.toFixed(dec) : "—";
  return `| Metric | Min | Avg | Max |
|---|---:|---:|---:|
| Plant flow (ML/d) | ${env.min._scenarioFlow_MLD.toFixed(0)} | ${env.avg._scenarioFlow_MLD.toFixed(0)} | ${env.max._scenarioFlow_MLD.toFixed(0)} |
| Solids load (kg/d) | ${env.min.totalLoad_kg_per_day.toFixed(0)} | ${env.avg.totalLoad_kg_per_day.toFixed(0)} | ${env.max.totalLoad_kg_per_day.toFixed(0)} |
| Solids captured (kg/d) | ${env.min.capturedKgPerDay.toFixed(0)} | ${env.avg.capturedKgPerDay.toFixed(0)} | ${env.max.capturedKgPerDay.toFixed(0)} |
| Run length (h) | ${numFmt(env.min.run_hours, 1)} | ${numFmt(env.avg.run_hours, 1)} | ${numFmt(env.max.run_hours, 1)} |
| BW cycles/filter/day | ${numFmt(env.min.bws_per_filter_per_day)} | ${numFmt(env.avg.bws_per_filter_per_day)} | ${numFmt(env.max.bws_per_filter_per_day)} |
| K implied¹ (kg/m²/run) | **${numFmt(env.min.K_kg_per_m2)}** | **${numFmt(env.avg.K_kg_per_m2)}** | **${numFmt(env.max.K_kg_per_m2)}** |
| K multiplier (precipitate) | ${numFmt(env.min.K_multiplier)}× | ${numFmt(env.avg.K_multiplier)}× | ${numFmt(env.max.K_multiplier)}× |
| K alum-equivalent (kg/m²/run) | ${numFmt(env.min.K_alum_equivalent)} | ${numFmt(env.avg.K_alum_equivalent)} | ${numFmt(env.max.K_alum_equivalent)} |
| σ (g/L) raw | ${numFmt(env.min.sigma_g_per_L)}${env.min.isMintsTienValid ? "" : " ⚠"} | ${numFmt(env.avg.sigma_g_per_L)}${env.avg.isMintsTienValid ? "" : " ⚠"} | ${numFmt(env.max.sigma_g_per_L)}${env.max.isMintsTienValid ? "" : " ⚠"} |
| σ_eff (precipitate-adjusted) | ${numFmt(env.min.sigma_eff_g_per_L)} | ${numFmt(env.avg.sigma_eff_g_per_L)} | ${numFmt(env.max.sigma_eff_g_per_L)} |`;
}

function loadingTable(env, scenario) {
  const a = env[scenario];
  const rows = ["N", "N-1", "N-2"].map((cond) => {
    const c = a.loadByCondition.find((x) => x.key === cond);
    if (!c || c.filtersInService <= 0) return `| ${cond} | infeasible | — | — | — |`;
    return `| ${cond} | ${c.filtersInService} | ${c.areaInService_m2.toFixed(1)} | ${c.hydraulicLoading_m_per_h.toFixed(2)} | ${c.loading_kg_per_m2_per_d.toFixed(3)} |`;
  }).join("\n");
  return `| Condition | Filters | Area (m²) | Hyd. loading (m/h) | Solids loading (kg/m²/d) |
|---|---:|---:|---:|---:|
${rows}`;
}

function redundancyTable(filter, env, scenario, peakFlow) {
  const sigma_eff = env[scenario].sigma_eff_g_per_L;
  const flow = env[scenario]._scenarioFlow_MLD;
  const results = redundancyMatrix({ filter, designFlow_MLD: flow, peakFlow_MLD: peakFlow, sigma_eff_g_per_L: sigma_eff });
  const grid = {};
  for (const r of results) { grid[r.condition] = grid[r.condition] || {}; grid[r.condition][r.scenario] = r; }
  let body = `*σ_eff = ${sigma_eff.toFixed(2)} g/L (held constant across this table) · driving head ${filter.drivingHead_m.toFixed(2)} m*\n\n| Condition | Design ΔH (m) | Peak ΔH (m) | +BW ΔH (m) |\n|---|---|---|---|\n`;
  for (const c of ["N", "N-1", "N-2"]) {
    const cells = ["design", "peak", "bw"].map((sc) => {
      const r = grid[c]?.[sc];
      if (!r || r.infeasible) return "—";
      return `${r.dH_total_m.toFixed(2)} (margin ${r.margin_m >= 0 ? "+" : ""}${r.margin_m.toFixed(2)}) ${r.pass ? "✓" : "✗"}`;
    });
    body += `| ${c} | ${cells[0]} | ${cells[1]} | ${cells[2]} |\n`;
  }
  return body;
}

function plantCapacityTable(filter, env, feed) {
  const headers = `| Scenario | Run (h) | BWs/d | BW (ML/d) | FTW (ML/d) | Net production (ML/d) | Deficit % |\n|---|---:|---:|---:|---:|---:|---:|`;
  const rows = SCENARIOS.map((s) => {
    const a = env[s];
    const bv = a.bwVolumes ?? {};
    const totalPerBW = bv.totalPerBW_m3 ?? 0;
    const ftw = bv.ftwVolume_m3 ?? 0;
    const fakeFilter = { ...filter, backwashPerCycle_m3: totalPerBW, ftwVolume_m3: ftw };
    const flow = a._scenarioFlow_MLD;
    const ss = steadyStateOfflineMetrics({ runHours: a.run_hours, seq: filter.bwSequence, numFilters: filter.numFilters });
    const cap = plantCapacityImpact({ filter: fakeFilter, designFlow_MLD: flow, runHours: a.run_hours, seq: filter.bwSequence, ssMetrics: ss });
    return `| ${SCENARIO_SHORT[s]} | ${a.run_hours.toFixed(1)} | ${a.bws_per_day_bank.toFixed(2)} | ${cap.total_BW_MLD.toFixed(2)} | ${cap.total_FTW_MLD.toFixed(2)} | ${cap.net_production_MLD.toFixed(2)} | ${cap.capacity_deficit_pct.toFixed(2)} |`;
  });
  return [headers, ...rows].join("\n");
}

function bwWaterBalanceTable(env) {
  const headers = `| Scenario | BWs/d | Drain (m³/d) | BW water (m³/d) | FTW (m³/d) | **Total (m³/d)** | **Waste only (m³/d)** | Waste % of feed |\n|---|---:|---:|---:|---:|---:|---:|---:|`;
  const rows = SCENARIOS.map((s) => {
    const a = env[s];
    const bv = a.bwVolumes || {};
    return `| ${SCENARIO_SHORT[s]} | ${a.bws_per_day_bank.toFixed(2)} | ${(bv.daily_drain_m3 ?? 0).toFixed(0)} | ${(bv.daily_backwash_m3 ?? 0).toFixed(0)} | ${(bv.daily_ftw_m3 ?? 0).toFixed(0)} | **${(bv.daily_total_m3 ?? 0).toFixed(0)}** | **${(bv.daily_netLoss_m3 ?? 0).toFixed(0)}** | ${(bv.daily_netLoss_pct ?? 0).toFixed(2)}% |`;
  });
  return [headers, ...rows].join("\n");
}

function bwDestinationSummary(feed) {
  const destLabel = (k) => k === "waste" ? "→ waste" : k === "recycle" ? "→ recycle to clarifier" : k === "reuse" ? "→ reuse" : `→ ${k}`;
  return [
    `- Filter drain (${(feed.drainVolume_m3 ?? 0).toFixed(0)} m³/cycle) ${destLabel(feed.drainDestination ?? "waste")}`,
    `- Backwash water (${(feed.backwashVolume_m3 ?? 0).toFixed(0)} m³/cycle) ${destLabel(feed.backwashDestination ?? "waste")}`,
    `- Filter to waste (${(feed.ftwVolume_m3 ?? 0).toFixed(0)} m³/cycle) ${destLabel(feed.ftwDestination ?? "waste")}`,
  ].join("\n");
}

function headBudgetTable(filter, env, scenario) {
  const a = env[scenario];
  const flow = a._scenarioFlow_MLD;
  const K_obs = a.K_kg_per_m2;
  const K_mult = a.K_multiplier;
  const drivingHead = filter.drivingHead_m;
  const bedDepth = a.bedDepth_m;

  const { series } = headBudgetCurve({ filter, flow_MLD: flow, K_multiplier: K_mult, K_max_kgm2: Math.max(K_obs * 2, 6) });
  const maxK = maxKAtHead({ filter, flow_MLD: flow, K_multiplier: K_mult, drivingHead_m: drivingHead });

  const rows = ["N", "N-1", "N-2"].map((cond) => {
    const s = series.find((x) => x.key === cond);
    const mk = maxK.find((x) => x.key === cond);
    if (s.infeasible) return `| ${cond} | infeasible | — | — | — | — | — |`;
    // Compute ΔH at K_implied analytically: fixed + Mints-Tien load at σ_eff
    // (don't snap to the nearest sampled K, that introduces a small overestimate)
    const sigma_eff = (K_obs / bedDepth) / (K_mult > 0 ? K_mult : 1.0);
    const dHL_load_at_K_obs = 0.92 * Math.pow(Math.max(0, sigma_eff), 2/3);
    const dH_at_obs = s.fixed_m + dHL_load_at_K_obs;
    const margin = drivingHead - dH_at_obs;
    const pass = margin >= 0 ? "✓" : "✗";
    const K_max_str = mk.K_max == null ? "—" : mk.K_max.toFixed(2);
    const K_max_perFilter = mk.K_max == null ? "—" : (mk.K_max * filter.areaPerFilter_m2).toFixed(0);
    const ratio = (mk.K_max != null && K_obs > 0) ? (mk.K_max / K_obs * 100).toFixed(0) + "%" : "—";
    return `| ${cond} | ${s.v_mh.toFixed(2)} | ${dH_at_obs.toFixed(2)} | ${margin >= 0 ? "+" : ""}${margin.toFixed(2)} ${pass} | ${K_max_str} | ${K_max_perFilter} | ${ratio} |`;
  });

  return `| Condition | v (m/h) | ΔH req @ K_implied (m) | Margin vs avail (m) | K max @ avail head (kg/m²/run) | K max (kg/filter) | K_max ÷ K_implied |
|---|---:|---:|---:|---:|---:|---:|
${rows.join("\n")}`;
}

// =========================================================================
// VERDICT BLOCKS
// =========================================================================
function redundancyVerdict(s) {
  const fmtMargin = (m) => m >= 0 ? `+${m.toFixed(2)}` : m.toFixed(2);
  return `**Section 5 verdict.** D1 worst-case margin ${fmtMargin(s.worstMarginD1.margin_m)} m at ${s.worstMarginD1.conditionLabel || "—"} · ${s.worstMarginD1.scenarioLabel || "—"}; D2 worst-case margin ${fmtMargin(s.worstMarginD2.margin_m)} m at ${s.worstMarginD2.conditionLabel || "—"} · ${s.worstMarginD2.scenarioLabel || "—"}. ${s.D1pass && s.D2pass ? "Both designs hydraulically feasible across all scenarios." : "**See infeasible flags above.**"} D2 has ${(s.worstMarginD2.margin_m - s.worstMarginD1.margin_m) >= 0 ? `${(s.worstMarginD2.margin_m - s.worstMarginD1.margin_m).toFixed(2)} m more` : `${(s.worstMarginD1.margin_m - s.worstMarginD2.margin_m).toFixed(2)} m less`} worst-case margin than D1.`;
}

function capacityVerdict(s) {
  const d1 = s.deficitD1.daily_loss_pct;
  const d2 = s.deficitD2.daily_loss_pct;
  const cls = (p) => p < 3 ? "excellent" : p < 5 ? "good" : p < 8 ? "marginal" : "poor";
  return `**Section 6 verdict.** D1 net water loss at avg flow: ${d1.toFixed(2)}% (**${cls(d1)}** by industry standards: <3% excellent, <5% good, <8% marginal, >8% poor). D2 net water loss: ${d2.toFixed(2)}% (**${cls(d2)}**). The differential implies ${Math.abs(s.deficitD2.daily_loss_ML - s.deficitD1.daily_loss_ML).toFixed(2)} ML/d of additional product water lost on the ${d1 < d2 ? "D2" : "D1"} design.`;
}

function headBudgetVerdict(s) {
  const k1 = s.envelopeD1.avg.K_kg_per_m2;
  const k2 = s.envelopeD2.avg.K_kg_per_m2;
  const util1 = (k1 / s.kmaxD1.N * 100);
  const util2 = (k2 / s.kmaxD2.N * 100);
  return `**Section 7 verdict.** D1 is using ${util1.toFixed(0)}% of its available head budget at N condition (K_implied ${k1.toFixed(2)} vs K_max ${s.kmaxD1.N.toFixed(2)}). D2 is using ${util2.toFixed(0)}% (K_implied ${k2.toFixed(2)} vs K_max ${s.kmaxD2.N.toFixed(2)}). ${util2 < 25 ? "**D2's substantial head headroom suggests the implied K is operationally limited (turbidity-driven or BW-policy-driven), not hydraulic.** Longer runs may be achievable." : ""}${util1 > 90 ? " D1 is operating close to its hydraulic limit — limited margin for unexpected loading." : ""}`;
}

// =========================================================================
// SECTION 8 — K REALITY CHECK
// =========================================================================
function kRealityCheckTable(s) {
  const e1 = s.envelopeD1.avg, e2 = s.envelopeD2.avg;
  const typLow = s.K_typical_low, typHigh = s.K_typical_high;
  const k1 = e1.K_kg_per_m2, k2 = e2.K_kg_per_m2;
  const inBand = (k) => k >= typLow && k <= typHigh;
  return `| Metric (avg scenario) | Designer 1 | Designer 2 | Industry typical |
|---|---:|---:|---:|
| K implied (kg/m²/run) | ${k1.toFixed(2)} ${inBand(k1) ? "✓" : k1 > typHigh ? "▲ above" : "▼ below"} | ${k2.toFixed(2)} ${inBand(k2) ? "✓" : k2 > typHigh ? "▲ above" : "▼ below"} | ${typLow}-${typHigh} |
| K alum-equivalent (kg/m²/run) | ${e1.K_alum_equivalent.toFixed(2)} | ${e2.K_alum_equivalent.toFixed(2)} | ${typLow}-${typHigh} |
| K max @ avail head (N peak) | ${s.kmaxD1.N != null ? s.kmaxD1.N.toFixed(2) : "—"} | ${s.kmaxD2.N != null ? s.kmaxD2.N.toFixed(2) : "—"} | — |
| K_implied as % of K_max | ${(k1 / s.kmaxD1.N * 100).toFixed(0)}% | ${(k2 / s.kmaxD2.N * 100).toFixed(0)}% | typically 50-90% |
| Hydraulic capability vs typical | ${s.kmaxD1.N >= typLow ? "supports typical K" : "below typical"} | ${s.kmaxD2.N >= typLow ? "supports typical K" : "below typical"} | — |`;
}

function kRealityVerdict(s) {
  const k1 = s.envelopeD1.avg.K_kg_per_m2;
  const k2 = s.envelopeD2.avg.K_kg_per_m2;
  const K_PHYSICAL_MAX = 15;   // kg/m²/run, physical ceiling for granular media
  const lines = [];
  if (k1 > K_PHYSICAL_MAX) {
    lines.push(`- **D1 K_implied (${k1.toFixed(1)}) is physically impossible** for granular-media filtration. A value above roughly 15 kg/m²/run far exceeds the pore volume the bed can hold. This is not a high-loading design — it is an input error, most likely the design flow. Correct the input and re-run.`);
  } else if (k1 > s.K_typical_high) {
    lines.push(`- **D1 K_implied (${k1.toFixed(2)}) is above the typical 2-5 kg/m²/run range** — verify against pilot or reference-plant operating data. It may be achievable with a well-coagulated feed, but should not be relied on without that evidence.`);
  } else if (k1 < s.K_typical_low) {
    lines.push(`- **D1 K_implied (${k1.toFixed(2)}) below typical range** — the user-supplied BW frequency forces short runs. Check whether this is turbidity-limited or conservative BW practice.`);
  } else {
    lines.push(`- D1 K_implied (${k1.toFixed(2)}) within typical range — operating point reasonable.`);
  }
  if (k2 > K_PHYSICAL_MAX) {
    lines.push(`- **D2 K_implied (${k2.toFixed(1)}) is physically impossible** for granular-media filtration (physical ceiling near 15 kg/m²/run). This indicates an input error, not a design characteristic. Correct the input and re-run.`);
  } else if (k2 > s.K_typical_high) {
    lines.push(`- **D2 K_implied (${k2.toFixed(2)}) is above the typical 2-5 kg/m²/run range** — verify against pilot or reference-plant operating data.`);
  } else if (k2 < s.K_typical_low) {
    lines.push(`- **D2 K_implied (${k2.toFixed(2)}) below typical range** — and the head budget (Section 7) shows K_max ≈ ${s.kmaxD2.N.toFixed(1)}, so the design has the *hydraulic capacity* for higher K. Three possible explanations: (a) turbidity-limited operation (filter breakthrough before headloss terminal); (b) conservative BW policy by the designer; (c) the user-supplied total daily BW (${s.feedD2.totalBWVolume_MLd?.avg ?? "—"} ML/d) is over-conservative. **Recommend obtaining a turbidity-vs-headloss profile during a representative run** to discriminate.`);
  } else {
    lines.push(`- D2 K_implied (${k2.toFixed(2)}) within typical range — operating point reasonable.`);
  }
  return `\n${lines.join("\n")}\n`;
}

// =========================================================================
// SECTION 9 — WATER-COST DIFFERENTIAL
// =========================================================================
function waterCostTable(s) {
  const cost = s.treatedWaterCost_per_ML;
  const annual = (loss_ML) => loss_ML * 365 * cost;
  const headers = `| Scenario | D1 net loss (ML/d) | D1 annual cost ($/y) | D2 net loss (ML/d) | D2 annual cost ($/y) | Differential ($/y) |\n|---|---:|---:|---:|---:|---:|`;
  const rows = SCENARIOS.map((scen) => {
    const bv1 = s.envelopeD1[scen].bwVolumes ?? {};
    const bv2 = s.envelopeD2[scen].bwVolumes ?? {};
    const l1 = (bv1.daily_netLoss_m3 ?? 0) / 1000;
    const l2 = (bv2.daily_netLoss_m3 ?? 0) / 1000;
    const a1 = annual(l1), a2 = annual(l2);
    const diff = a2 - a1;
    return `| ${SCENARIO_SHORT[scen]} | ${l1.toFixed(2)} | $${formatLargeMoney(a1)} | ${l2.toFixed(2)} | $${formatLargeMoney(a2)} | $${formatLargeMoney(Math.abs(diff))} ${diff > 0 ? "D1 cheaper" : diff < 0 ? "D2 cheaper" : ""} |`;
  });
  return [headers, ...rows].join("\n");
}

function waterCostVerdict(s) {
  const diff = s.annualCostDiff;
  const lifecycleYears = 20;
  const lifecycle = Math.abs(diff) * lifecycleYears;
  return `**Section 9 verdict.** At avg flow, the recurring water-loss differential is **$${formatLargeMoney(Math.abs(diff))}/year** in favour of ${diff > 0 ? "D1" : "D2"}. Over a 20-year plant lifecycle this is **$${formatLargeMoney(lifecycle)} undiscounted**, which is comparable to a significant capital cost line item. The differential should be weighed against any capital, operational, or footprint advantage of the more water-intensive design.`;
}

// =========================================================================
// SECTION 10 — RISK REGISTER
// =========================================================================
function riskRegister(s) {
  const k1 = s.envelopeD1.avg.K_kg_per_m2;
  const k2 = s.envelopeD2.avg.K_kg_per_m2;
  const risks = [];

  // K plausibility risks
  if (k1 > s.K_typical_high) {
    risks.push({
      risk: "D1 K_implied above typical industry range",
      likelihood: "Medium",
      consequence: "If K cannot be sustained, BW frequency will rise to match D2's; capacity deficit increases by ~5-7%",
      mitigation: "Pilot test or reference-plant data on equivalent media",
    });
  }
  if (k2 < s.K_typical_low) {
    risks.push({
      risk: "D2 K_implied below typical industry range",
      likelihood: "Medium",
      consequence: "Operational reality may already absorb the cost; otherwise BW deficit is over-estimated",
      mitigation: "Turbidity-vs-headloss profile during representative run",
    });
  }

  // Hydraulic feasibility risks
  if (s.worstMarginD1.margin_m < 0.5) {
    risks.push({
      risk: "D1 worst-case hydraulic margin tight",
      likelihood: "Low-Medium",
      consequence: `Margin only ${s.worstMarginD1.margin_m.toFixed(2)} m at ${s.worstMarginD1.conditionLabel}; fouling, UC effects, or transients could breach`,
      mitigation: "Verify UC correction assumption, validate clean-bed equation choice",
    });
  }
  if (s.worstMarginD2.margin_m < 0.5) {
    risks.push({
      risk: "D2 worst-case hydraulic margin tight",
      likelihood: "Low-Medium",
      consequence: `Margin only ${s.worstMarginD2.margin_m.toFixed(2)} m at ${s.worstMarginD2.conditionLabel}`,
      mitigation: "Verify UC correction assumption, validate clean-bed equation choice",
    });
  }

  // UC correction risk
  if (s.filterD1.applyUCCorrection === false || s.filterD2.applyUCCorrection === false) {
    risks.push({
      risk: "UC correction toggled off for at least one design",
      likelihood: "Medium",
      consequence: "True clean-bed headloss may be 30-65% higher than reported, eroding margin by 0.3-0.9 m at typical UC values",
      mitigation: "Sensitivity check with UC correction enabled",
    });
  }

  // K-multiplier risk
  if (Math.abs(s.envelopeD1.avg.K_multiplier - s.envelopeD2.avg.K_multiplier) > 0.2) {
    risks.push({
      risk: "Different precipitate K-multipliers between D1 and D2",
      likelihood: "—",
      consequence: `D1 multiplier ${s.envelopeD1.avg.K_multiplier.toFixed(2)}×, D2 ${s.envelopeD2.avg.K_multiplier.toFixed(2)}× — K_implied not directly comparable without verifying actual feed precipitate composition`,
      mitigation: "Confirm precipitate composition from upstream process designer",
    });
  }

  // Capacity deficit risk
  if (Math.max(s.deficitD1.daily_loss_pct, s.deficitD2.daily_loss_pct) > 8) {
    risks.push({
      risk: "Net water loss exceeds 8% (poor industry classification)",
      likelihood: "—",
      consequence: `${s.deficitD1.daily_loss_pct > 8 ? "D1" : "D2"} consumes >8% of feed in BW; lifecycle product-water cost penalty significant`,
      mitigation: "Investigate BW-water recycling to clarifier inlet (reduces net loss by 80-100% of drain+FTW volumes)",
    });
  }

  if (risks.length === 0) {
    return "*No significant risks flagged. Both designs operate within typical industry envelopes and hydraulic feasibility is robust.*";
  }

  const headers = `| Risk | Likelihood | Consequence | Mitigation |\n|---|---|---|---|`;
  const rows = risks.map((r) => `| ${r.risk} | ${r.likelihood} | ${r.consequence} | ${r.mitigation} |`);
  return [headers, ...rows].join("\n");
}

function verificationRecommendations(s) {
  const recs = [
    "Obtain the **basis of the user-supplied BW frequency** for each designer (pilot data, reference-plant operating record, theoretical, or assumed). The K_implied numbers are only as good as this input.",
    "If D2's K is well below typical range, request a **turbidity-vs-headloss profile** from a representative run to determine whether headloss or turbidity is the run-terminating constraint.",
    "Confirm the **precipitate composition** (alum/ferric/CaCO₃/Mg(OH)₂/other) from the upstream process designer — this drives the K-multiplier directly.",
    "Run a **sensitivity check** by toggling the UC correction on and rerunning the assessment. UC effects can swing required head by 0.3-1.0 m depending on bed geometry.",
    "Verify the **driving head** in the hydraulic profile is what the designer assumed — small head differences propagate strongly through the head budget.",
    "If water-recovery efficiency matters, investigate **BW component recycling**: filter drain to clarifier inlet, BW water to clarifier inlet (settled), and FTW to clarifier or reuse. Routing these to the inlet typically reduces net plant water loss by 60-100% of the routed component.",
  ];
  return `\n**Verification recommendations:**\n\n${recs.map(r => `- ${r}`).join("\n")}\n`;
}

// =========================================================================
// CSV EXPORT (unchanged structure, extended with new fields)
// =========================================================================
export function generateCSV({ flowEnv, filterD1, filterD2, feedD1, feedD2, envelopeD1, envelopeD2 }) {
  const headers = [
    "designer", "scenario", "flow_MLD", "feedTSS_mgL", "filterTSSRemoval_pct",
    "totalBWVolume_MLd",
    "drainVolume_m3", "backwashVolume_m3", "ftwVolume_m3", "totalPerBW_m3", "netLossPerBW_m3",
    "drainDestination", "backwashDestination", "ftwDestination",
    "daily_drain_m3", "daily_backwash_m3", "daily_ftw_m3", "daily_total_m3", "daily_netLoss_m3", "daily_netLoss_pct",
    "solids_load_kgday", "solids_captured_kgday",
    "N_loading_kg_m2_d", "N-1_loading_kg_m2_d", "N-2_loading_kg_m2_d",
    "N_hydloading_m_h", "N-1_hydloading_m_h", "N-2_hydloading_m_h",
    "bws_per_day_bank", "run_hours",
    "K_implied_kgm2", "K_multiplier", "K_alum_equiv_kgm2", "sigma_gL", "sigma_eff_gL",
  ];
  const rows = [headers.join(",")];

  for (const [id, env] of [["D1", envelopeD1], ["D2", envelopeD2]]) {
    for (const scen of SCENARIOS) {
      const a = env[scen];
      const bv = a.bwVolumes || {};
      const N = a.loadByCondition.find((c) => c.key === "N");
      const N1 = a.loadByCondition.find((c) => c.key === "N-1");
      const N2 = a.loadByCondition.find((c) => c.key === "N-2");
      rows.push([
        id, scen,
        a._scenarioFlow_MLD.toFixed(2),
        a._scenarioFeed.feedTSS_mgL.toFixed(2),
        a._scenarioFeed.filterTSSRemoval_pct.toFixed(2),
        a._scenarioFeed.totalBWVolume_MLd.toFixed(3),
        (bv.drainVolume_m3 ?? 0).toFixed(0),
        (bv.backwashVolume_m3 ?? 0).toFixed(0),
        (bv.ftwVolume_m3 ?? 0).toFixed(0),
        (bv.totalPerBW_m3 ?? 0).toFixed(0),
        (bv.netLossPerBW_m3 ?? 0).toFixed(0),
        bv.drainDestination ?? "waste",
        bv.backwashDestination ?? "waste",
        bv.ftwDestination ?? "waste",
        (bv.daily_drain_m3 ?? 0).toFixed(0),
        (bv.daily_backwash_m3 ?? 0).toFixed(0),
        (bv.daily_ftw_m3 ?? 0).toFixed(0),
        (bv.daily_total_m3 ?? 0).toFixed(0),
        (bv.daily_netLoss_m3 ?? 0).toFixed(0),
        (bv.daily_netLoss_pct ?? 0).toFixed(2),
        a.totalLoad_kg_per_day.toFixed(1),
        a.capturedKgPerDay.toFixed(1),
        N.loading_kg_per_m2_per_d.toFixed(3),
        N1.filtersInService > 0 ? N1.loading_kg_per_m2_per_d.toFixed(3) : "infeas",
        N2.filtersInService > 0 ? N2.loading_kg_per_m2_per_d.toFixed(3) : "infeas",
        N.hydraulicLoading_m_per_h.toFixed(2),
        N1.filtersInService > 0 ? N1.hydraulicLoading_m_per_h.toFixed(2) : "infeas",
        N2.filtersInService > 0 ? N2.hydraulicLoading_m_per_h.toFixed(2) : "infeas",
        a.bws_per_day_bank.toFixed(2),
        a.run_hours.toFixed(2),
        a.K_kg_per_m2.toFixed(3),
        a.K_multiplier.toFixed(3),
        a.K_alum_equivalent.toFixed(3),
        a.sigma_g_per_L.toFixed(3),
        a.sigma_eff_g_per_L.toFixed(3),
      ].join(","));
    }
  }
  return rows.join("\n");
}
