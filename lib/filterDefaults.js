// lib/filterDefaults.js
// Filter design defaults for D1 and D2.
// Operational inputs (TSS, flow, removal %, BW volumes, precipitate fractions)
// are user-supplied as a min / avg / max envelope so all downstream outputs
// can be computed for three scenarios. Filter geometry and clean-bed equation
// remain single values (fixed by design, not operational).

import { MEDIA_CONFIGURATIONS } from "./filterPhysics";
import { DEFAULT_BW_SEQUENCE } from "./backwashDynamics";

// Helper to construct a min/avg/max triplet
export const envelope = (min, avg, max) => ({ min, avg, max });

// =========================================================================
// SCENARIO PICKERS
// =========================================================================
export const SCENARIOS = ["min", "avg", "max"];
export const SCENARIO_LABELS = {
  min: "Min (low envelope)",
  avg: "Avg (central estimate)",
  max: "Max (high envelope)",
};
export const SCENARIO_SHORT = { min: "Min", avg: "Avg", max: "Max" };
export const SCENARIO_COLOURS = {
  min: "#5A7359",  // sage
  avg: "#3F5870",  // slate
  max: "#B0451F",  // rust
};

// Given a value that may be a scalar or an envelope, return the value
// for the requested scenario.
export function pickScenarioValue(envelopeOrScalar, scenario = "avg") {
  if (envelopeOrScalar == null) return 0;
  if (typeof envelopeOrScalar === "number") return envelopeOrScalar;
  if (typeof envelopeOrScalar === "object" && "avg" in envelopeOrScalar) {
    return envelopeOrScalar[scenario] ?? envelopeOrScalar.avg ?? 0;
  }
  return 0;
}

// Resolve a feed envelope object into concrete values for one scenario.
export function pickFeedScenario(feed, scenario = "avg") {
  const precipitate = feed.precipitate
    ? Object.fromEntries(
        Object.entries(feed.precipitate).map(([k, v]) => [k, pickScenarioValue(v, scenario)])
      )
    : null;
  // Three-component BW volumes (each design-fixed scalar)
  const drainVolume_m3    = feed.drainVolume_m3    ?? 0;
  const backwashVolume_m3 = feed.backwashVolume_m3 ?? (feed.volumePerBW_m3 ?? 0);  // legacy fallback
  const ftwVolume_m3      = feed.ftwVolume_m3      ?? 0;
  const drainDestination    = feed.drainDestination    ?? "waste";
  const backwashDestination = feed.backwashDestination ?? "waste";
  const ftwDestination      = feed.ftwDestination      ?? "waste";
  const volumePerBW_m3 = drainVolume_m3 + backwashVolume_m3 + ftwVolume_m3;  // derived total
  // Net loss is only the portion that goes to waste (recycled water returns to inlet)
  const isLoss = (dest) => dest === "waste";
  const netLossPerBW_m3 =
    (isLoss(drainDestination)    ? drainVolume_m3    : 0) +
    (isLoss(backwashDestination) ? backwashVolume_m3 : 0) +
    (isLoss(ftwDestination)      ? ftwVolume_m3      : 0);
  return {
    feedTSS_mgL:          pickScenarioValue(feed.feedTSS_mgL, scenario),
    filterTSSRemoval_pct: pickScenarioValue(feed.filterTSSRemoval_pct, scenario),
    totalBWVolume_MLd:    pickScenarioValue(feed.totalBWVolume_MLd, scenario),
    drainVolume_m3,
    backwashVolume_m3,
    ftwVolume_m3,
    volumePerBW_m3,           // sum, used for BWs-per-day and dirty-water-mass-balance
    netLossPerBW_m3,          // waste-only portion, used for plant capacity impact
    drainDestination,
    backwashDestination,
    ftwDestination,
    precipitate,
  };
}

export const BW_VOLUME_DESTINATIONS = {
  waste:   "Waste (lost to drain / sludge)",
  recycle: "Recycle to clarifier inlet",
  reuse:   "Reuse (e.g. internal BW supply)",
};

// =========================================================================
// PRECIPITATE TYPE — K MULTIPLIERS AND NARRATIVE DESCRIPTIONS
// =========================================================================
// (Same as before — relative to alum baseline of 1.00×.)
export const PRECIPITATE_MULTIPLIERS = {
  alum: {
    label: "Aluminium hydroxide (alum)",
    short: "Alum floc",
    multiplier: 1.00,
    density_gcm3: 1.003,
    drySolids_pct: "0.5–2%",
    description: "Alum (aluminium sulphate) hydrolyses to Al(OH)₃, forming light, gelatinous flocs with extensive water of hydration. Floc density is only 1-5 kg/m³ above water and dry solids content is 0.5-2%.",
    impact: "These flocs occupy substantial pore volume per unit dry mass — they are bulky relative to their mass. This is why alum is the K baseline (1.00×): the headloss curve is dominated by pore-volume occupation, and the σ^(2/3) Mints-Tien relationship was originally calibrated on alum-coagulated water. Alum flocs do compress under headloss buildup, which slows late-run dHL/dt but caps the achievable K.",
    practicalNote: "Most predictable behaviour. Performance degrades at low temperature (winter) due to slower floc formation. Charge-neutralisation conditions (lower dose, pH 6.5-7.5) give the most filterable floc; sweep coagulation (higher dose) gives more voluminous, harder-to-filter floc.",
  },
  ferric: {
    label: "Ferric hydroxide (ferric coag.)",
    short: "Ferric floc",
    multiplier: 1.30,
    density_gcm3: 1.010,
    drySolids_pct: "1.5–4%",
    description: "Ferric chloride or ferric sulphate hydrolyses to Fe(OH)₃, forming smaller, denser, and more compact flocs than alum. Floc density is 5-15 kg/m³ above water with dry solids content of 1.5-4% — roughly double the dry solids of alum at the same mass.",
    impact: "Ferric flocs are smaller and denser, so they penetrate deeper into the bed before being captured. This distributes the solids deposit more uniformly through the bed depth rather than caking the top — exactly the deposition pattern that maximises K. SEM imaging shows ferric flocs form compact, uniform deposits whereas alum flocs form larger but fewer surface deposits. The result is a K multiplier of 1.2-1.4× relative to alum.",
    practicalNote: "Better cold-water performance than alum. More aggressive on pH (drives pH down harder), so requires more alkalinity adjustment. Slightly higher coagulant dose for equivalent NOM removal. The denser, smaller flocs settle faster in the clarifier too — but if any escape clarification, they filter better than alum carryover.",
  },
  caco3: {
    label: "Calcium carbonate (lime softening)",
    short: "CaCO₃ floc",
    multiplier: 1.70,
    density_gcm3: 1.15,
    drySolids_pct: "5–15%",
    description: "Calcium carbonate from lime softening forms dense crystalline precipitates. Pure calcite has a true density of 2.7 g/cm³; when well-formed in a softening clarifier, the floc density is 1.05-1.20 g/cm³ and dry solids content reaches 5-15%.",
    impact: "When CaCO₃ arrives at the filter as well-formed dense particles from clarifier carryover, it has the highest filterability of the four precipitates. The crystalline particles pack tightly with minimal pore-volume occupation per unit dry mass — essentially the opposite of alum/Mg(OH)₂ behaviour. K multipliers of 1.5-2.0× are typical.",
    practicalNote: "⚠ CRITICAL CAVEAT: this favourable behaviour only applies if the softening reaction has FINISHED before water reaches the filter. If recarbonation is incomplete or if pH stays above ~9.5, CaCO₃ will continue to precipitate INSIDE the filter — coating media and underdrain laterals with crystalline scale. This collapses K toward zero and is essentially irreversible without acid wash. CO₂ injection just upstream of the filter is essential when blend ratios are high.",
  },
  mgoh2: {
    label: "Magnesium hydroxide (lime softening)",
    short: "Mg(OH)₂ floc",
    multiplier: 0.50,
    density_gcm3: 1.002,
    drySolids_pct: "<1%",
    description: "Magnesium hydroxide is the most gelatinous of the four precipitates. Floc density is only 1-3 kg/m³ above water and dry solids content typically falls below 1% — even more dilute than alum floc. Forms at high pH (>10.6) during lime softening when magnesium hardness is present.",
    impact: "Pure Mg(OH)₂ has the worst filterability of the four. The highly gelatinous structure plugs pore throats aggressively because the floc cannot deform without losing structural integrity. K multipliers of 0.4-0.6× relative to alum are typical when Mg(OH)₂ dominates. Importantly, the impact is non-linear: Mg(OH)₂ fractions above ~20-30% start dragging the effective K below alum baseline regardless of the rest of the mix.",
    practicalNote: "Mg(OH)₂ rarely arrives at the filter alone — it usually co-precipitates with CaCO₃ in lime softening, and the combined floc is much more filterable than pure Mg(OH)₂. The library multiplier assumes the pure-precipitate case; if the upstream clarifier captures most of the Mg(OH)₂, the effective fraction at the filter may be much lower than the bulk-water composition implies.",
  },
  other: {
    label: "Other inert solids (raw TSS)",
    short: "Inert TSS",
    multiplier: 1.10,
    density_gcm3: 1.30,
    drySolids_pct: "5–25%",
    description: "Mineral particles (silica, clay, fine sand) and organic detritus that pass through coagulation untreated — typically the small fraction of raw water TSS that escapes the clarifier without being incorporated into a coagulant floc.",
    impact: "Inert mineral solids are denser than any of the chemical precipitates and have negligible water of hydration. They occupy little pore volume per unit dry mass. However, they tend to be small and well-distributed (since they weren't captured by the coagulant) and so penetrate deep into the bed. Net K multiplier is around 1.1× — slightly better than alum but not as good as ferric or CaCO₃.",
    practicalNote: "The 'other' fraction is usually small in a well-coagulated plant (under 20% of filter feed solids). If it grows above ~30%, it indicates poor coagulation or a step-change in raw water quality. Algae and algogenic organic carbon, if present, should be classified here too but they behave more like alum/Mg(OH)₂ — better to treat them by adjusting the alum fraction upward.",
  },
};

// =========================================================================
// PLANT FLOW ENVELOPE
// =========================================================================
// Three flow scenarios:
//   min  = low-demand off-peak (e.g. winter overnight)
//   avg  = design average daily flow
//   max  = peak hour or peak day
export const DEFAULT_FLOW_ENVELOPE = {
  designFlow_MLD: envelope(60, 90, 120),
  dHLModel: "mints",
  treatedWaterCost_per_ML: 1500,   // $/ML, configurable on the inputs tab
};

// Peak flow (used only by hydraulic redundancy "+ peak" condition) is
// always the max of the envelope by convention.
export function peakFlowFromEnvelope(flowEnv) {
  return pickScenarioValue(flowEnv.designFlow_MLD, "max");
}

// =========================================================================
// FILTER GEOMETRY DEFAULTS (single-valued — fixed by design)
// =========================================================================
export const DESIGNER_DEFAULTS = {
  D1: {
    id: "D1",
    name: "Designer 1",
    fullName: "Designer 1 (RGMF)",
    filter: {
      type: "RGMF (multi-media)",
      numFilters: 8,
      areaPerFilter_m2: 80.7,
      mediaConfig: "custom",
      // D1 actual design (Process Calculations doc, 4 layers totalling 1.675 m):
      //   L1 Anthracite 1.00 m, d_e 1.00 mm, UC 1.30
      //   L2 Sand       0.40 m, d_e 0.50 mm, UC 1.40
      //   L3 Garnet     0.20 m, d_e 0.45 mm (granulometry 0.3–0.6), UC 1.40
      //   L4 Garnet     0.075 m, d_e 2.00 mm (granulometry 1.0–3.0), UC 1.60
      // Porosities derived from bulk/real densities (Image 2 of designer doc):
      //   Anthracite: 1 - 720/1400 = 0.49
      //   Sand:       1 - 1600/2650 = 0.40
      //   Garnet:     1 - 2250/4100 = 0.45
      mediaLayers: [
        { media: "anthracite", depth: 1.000, d_mm: 1.00, uc: 1.30, porosity: 0.49 },
        { media: "sand",       depth: 0.400, d_mm: 0.50, uc: 1.40, porosity: 0.40 },
        { media: "garnet",     depth: 0.200, d_mm: 0.45, uc: 1.40, porosity: 0.45 },
        { media: "garnet",     depth: 0.075, d_mm: 2.00, uc: 1.60, porosity: 0.45 },
      ],
      underdrain: "block",
      cleanBedEquation: "kozeny-carman",
      applyUCCorrection: true,
      temp_C: 10,
      drivingHead_m: 3.87,
      appurtenanceLoss_m: 0.15,
      // D1 cleaning cycle (37.5 min total) from designer's cleaning cycle table:
      //   Phase 1 Level Reduction         (drain)         : 5.0 min
      //   Phase 2 Particle friction (air)                 : 3.0 min
      //   Phase 3 Backwash with air                       : 5.0 min
      //   Phase 4 Mattress air purge                      : 1.0 min
      //   Phase 5 Fluidification                          : 7.5 min
      //   Phase 6 Cleaning pause                          : 1.0 min
      //   Phase 7 Bed rinse (raw water FTW)               : 15.0 min
      // Map to model's 5-phase schema:
      //   drainDown          = Phase 1 (5.0)
      //   backwashWater      = Phases 2 + 3 + 4 + 5 (16.5)
      //   fillUp             = (none distinct - rolled into BW)
      //   filterToWaste      = Phase 7 (15.0)
      //   returnToService    = Phase 6 (1.0)
      bwSequence: { drainDown_min: 5.0, backwashWater_min: 16.5, fillUp_min: 0, filterToWaste_min: 15.0, returnToService_min: 1.0 },
      runHours_override_hr: 24,
      designRunHours_at_maxTSS_hr: 44,    // Designer 1 stated 44 h at max TSS conditions
    },
  },
  D2: {
    id: "D2",
    name: "Designer 2",
    fullName: "Designer 2 (DMF)",
    filter: {
      type: "DMF (dual-media)",
      numFilters: 6,
      areaPerFilter_m2: 121.6,
      mediaConfig: "dual",
      mediaLayers: [
        // D2 actual design (Process Calculations doc Image 3-4):
        //   Anthracite: 1.40 m, d_e 1.50 mm, UC 1.50
        //     Real density 1400, bulk density 730 → porosity = 1 - 730/1400 = 0.479
        //   Sand: 0.70 m, d_e 0.55 mm, UC 1.50
        //     Real density 2650, bulk density 1600 → porosity = 1 - 1600/2650 = 0.396
        { media: "anthracite", depth: 1.40, d_mm: 1.50, uc: 1.50, porosity: 0.48 },
        { media: "sand",       depth: 0.70, d_mm: 0.55, uc: 1.50, porosity: 0.40 },
      ],
      underdrain: "block",
      cleanBedEquation: "kozeny-carman",
      applyUCCorrection: true,
      temp_C: 10,
      drivingHead_m: 4.77,
      appurtenanceLoss_m: 0.15,
      // D2 wash sequence (~85 min total) from designer Wash Sequence table (Image 2):
      //   Phase 1.1 Partial drainage to penstock        : 2.0 min   (drain — large vol)
      //   Phase 1.2 Partial drainage below penstock     : 5.0 min   (drain — small vol)
      //   Phase 2   Air agitation (air only)            : 5.0 min
      //   Phase 3   Wash (water at 35 m/h)              : 15.0 min  (filtered water 1100 m³)
      //   Phase 4   Filter displacement (raw water)     : 27-31 min (615 m³ → DAF)
      //   Phase 5   Maturation (raw water)              : 27-31 min (615 m³ → DAF)
      // Map to model's 5-phase schema:
      //   drainDown      = phases 1.1 + 1.2 (7.0)
      //   backwashWater  = phases 2 + 3 (20.0)  (air agitation + wash water)
      //   fillUp         = phase 4 displacement (29)
      //   filterToWaste  = phase 5 maturation (29)
      //   returnToService = 0
      bwSequence: { drainDown_min: 7.0, backwashWater_min: 20.0, fillUp_min: 29.0, filterToWaste_min: 29.0, returnToService_min: 0 },
      runHours_override_hr: 24,
      designRunHours_at_maxTSS_hr: 16,   // D2 designer's stated run length at Band 2 max hardness (TSS 42.37 mg/L)
    },
  },
};

// =========================================================================
// PER-DESIGNER FEED ENVELOPE DEFAULTS
// =========================================================================
// Every operational input is a {min, avg, max} triplet so the assessment
// can run three scenarios. Defaults set so:
//   min  = best-case envelope (low TSS, high removal, low BW use, favourable precipitate mix)
//   avg  = central estimate
//   max  = worst-case envelope (high TSS, lower removal, high BW use, less favourable mix)
//
// For precipitate fractions, "min/max" refers to the K-favourability direction
// (min K = max gelatinous Mg(OH)₂, max K = max dense CaCO₃) which means each
// scenario typically combines internal trade-offs. Users can edit freely.
export const DESIGNER_FEED_DEFAULTS = {
  D1: {
    feedTSS_mgL:          envelope(5,    8,   11.6),    // 11.6 = designer's max TSS under 100% lime softening
    filterTSSRemoval_pct: envelope(97,   97,   97),     // Designer 1 stated 97% TSS removal in first stage
    // Total daily BW envelope. At the designer's 44h cycle (max TSS) with 799 m³/cycle
    // total volume and 8 filters, daily total = 24/(44+0.625) × 8 × 799 / 1000 ≈ 3.44 ML/d.
    // At longer runs under lower TSS (116h theoretical at medium TSS), daily total drops.
    // Min ≈ 1.30 (long run at low TSS, ~75-120h), Avg ≈ 2.50 (mid), Max ≈ 3.44 (44h at max TSS).
    totalBWVolume_MLd:    envelope(1.30, 2.50, 3.44),
    // Per-cycle volume components from designer's cleaning cycle table (screenshot Aug 2026):
    //   Phase 1  Level reduction: 80.7 m² × 2.2 m water above bed = ~178 m³ (clarified water dumped)
    //   Phase 3+5 Backwash water (clarified filtrate): 47 + 403 = 450 m³
    //   Phase 7  Bed rinse / FTW (raw water at 8.5 m/h × 15 min × 80.7 m²): 171 m³
    //   Total per cycle: ~799 m³
    drainVolume_m3:       178,   // Level reduction — water above the bed at HWL, drained to waste
    backwashVolume_m3:    450,   // Backwash water consumed (phases 3 + 5), clarified filtrate
    ftwVolume_m3:         171,   // Bed rinse — raw water through freshly-cleaned filter, dumped (FTW)
    // Destination of each stream (affects net plant water loss)
    drainDestination:     "waste",   // Level reduction is dumped pre-BW
    backwashDestination:  "waste",   // BW water leaves with sludge
    ftwDestination:       "waste",   // Bed rinse / FTW dumped while bed re-ripens
    // Precipitate composition — default 100% ferric coagulation for D1.
    // (Lime-softening chemistry can be set on the Precipitates tab if the
    // plant is operating in 100% softening mode: CaCO3 0.90 / Mg(OH)2 0.05 / other 0.05.)
    precipitate: {
      alum:   envelope(0.00, 0.00, 0.00),
      ferric: envelope(1.00, 1.00, 1.00),
      caco3:  envelope(0.00, 0.00, 0.00),
      mgoh2:  envelope(0.00, 0.00, 0.00),
      other:  envelope(0.00, 0.00, 0.00),
    },
  },
  D2: {
    feedTSS_mgL:          envelope(10,   15.3,  42.4),  // From D2 designer doc: min=Band 2 Max TURB/TSS (9.98), avg=AVG water quality (15.28), max=Band 2 MAX Hardness (42.37)
    filterTSSRemoval_pct: envelope(90,   90,   90),     // D2 designer stated 90% TSS removal across all 5 design bands
    // Total daily BW envelope from D2's actual process calculations (Image 2), GROSS values
    // (sum of to-waste + recirculated, = cycles/day × 2,858 m³/cycle):
    //   min (TSS 10, Band 2 Max TURB/TSS, 5.50 cycles/d): 15.72 ML/d, scaled to Q60 → 7.86 ML/d
    //   avg (TSS 15.3, AVG water quality, 2.75 cycles/d): 7.86 ML/d, scaled to Q90 → 5.89 ML/d
    //   max (TSS 42, Band 2 MAX Hardness, 8.25 cycles/d): 23.58 ML/d at Q120
    // Note: BW frequency is non-monotonic with TSS — the "Max TURB" event drives more
    // washes at low hardness than AVG conditions, despite lower TSS.
    totalBWVolume_MLd:    envelope(7.86, 5.89, 23.58),
    // Per-cycle volume components from D2 designer's wash sequence (Image 2):
    //   Phase 1.1 Partial drainage to penstock: 419 m³ → wastewater treatment (waste)
    //   Phase 1.2 Partial drainage below penstock: 109 m³ → recirculated to DAF
    //   Phase 3 Wash water (filtered water 35 m/h × 15 min): 1,100 m³ → wastewater treatment
    //   Phase 4 Displacement (raw water): 615 m³ → recirculated to DAF
    //   Phase 5 Maturation (raw water): 615 m³ → recirculated to DAF
    //   Total per cycle: 419 + 1,100 + (109 + 615 + 615) = 2,858 m³
    //   To waste per cycle: 419 + 1,100 = 1,519 m³
    //   To recycle per cycle: 109 + 615 + 615 = 1,339 m³
    drainVolume_m3:       419,    // Partial drainage to penstock (to wastewater treatment)
    backwashVolume_m3:    1100,   // Wash water (to wastewater treatment)
    ftwVolume_m3:         1339,   // Drainage below penstock + displacement + maturation (recirculated to DAF)
    drainDestination:     "waste",
    backwashDestination:  "waste",
    ftwDestination:       "recycle",   // 89% of D2's BW water is recovered upstream
    // Precipitate composition — default 100% alum coagulation for D2.
    precipitate: {
      alum:   envelope(1.00, 1.00, 1.00),
      ferric: envelope(0.00, 0.00, 0.00),
      caco3:  envelope(0.00, 0.00, 0.00),
      mgoh2:  envelope(0.00, 0.00, 0.00),
      other:  envelope(0.00, 0.00, 0.00),
    },
  },
};
