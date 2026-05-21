// lib/filterCalculations.js
// Core filter performance calculations:
//   - Solids load (kg/d) into the filter from feed TSS and flow
//   - Filter loading rate at N, N-1, N-2 (kg/m²/d)
//   - Filter run length (h) derived from observed BW frequency
//   - K (solids holding capacity, kg/m²/run) derived from run length and loading
//   - K-multiplier from precipitate composition (alum/ferric/CaCO3/Mg(OH)2/other)
//
// Inputs are user-supplied (no scenario lookups).

import { totalFilterArea, totalBedDepth, filtrationVelocity } from "./filterPhysics";
import { PRECIPITATE_MULTIPLIERS } from "./filterDefaults";

// =========================================================================
// SOLIDS LOAD INTO FILTER
// =========================================================================
//   Mass into filter (kg/d) = feed TSS (mg/L) * flow (ML/d)
// (since mg/L * ML/d = mg/L * 10^6 L/d = 10^6 mg/d / 1000 mg/g / 1000 g/kg = kg/d)
// In SI: mg/L * ML/d = kg/d directly
export function solidsLoadKgPerDay({ feedTSS_mgL, flow_MLD }) {
  return feedTSS_mgL * flow_MLD;
}

// =========================================================================
// SOLIDS CAPTURED BY FILTER
// =========================================================================
//   Captured (kg/d) = Load (kg/d) * removal % / 100
export function solidsCapturedKgPerDay({ feedTSS_mgL, flow_MLD, filterTSSRemoval_pct }) {
  return solidsLoadKgPerDay({ feedTSS_mgL, flow_MLD }) * (filterTSSRemoval_pct / 100);
}

// =========================================================================
// FILTER LOADING RATE BY REDUNDANCY CONDITION
// =========================================================================
// At each condition (N, N-1, N-2), the same solids load is distributed across
// fewer filters, so loading rate per m² increases.
export function filterLoadingByCondition({
  feedTSS_mgL, flow_MLD, filterTSSRemoval_pct, filter,
}) {
  const N = filter.numFilters;
  const areaEach = filter.areaPerFilter_m2;
  const captured = solidsCapturedKgPerDay({ feedTSS_mgL, flow_MLD, filterTSSRemoval_pct });

  const conditions = [
    { key: "N",   filtersInService: N,     label: `N = ${N} (all in service)` },
    { key: "N-1", filtersInService: N - 1, label: `N-1 = ${N - 1} (1 offline)` },
    { key: "N-2", filtersInService: N - 2, label: `N-2 = ${N - 2} (2 offline)` },
  ];

  return conditions.map((c) => ({
    ...c,
    areaInService_m2: c.filtersInService > 0 ? c.filtersInService * areaEach : 0,
    loading_kg_per_m2_per_d: c.filtersInService > 0
      ? captured / (c.filtersInService * areaEach)
      : Infinity,
    flowPerFilter_MLd: c.filtersInService > 0 ? flow_MLD / c.filtersInService : Infinity,
    hydraulicLoading_m_per_h: c.filtersInService > 0
      ? (flow_MLD * 1e6 / (24 * 3600 * 1000)) / (c.filtersInService * areaEach) * 3600
      : Infinity,
  }));
}

// =========================================================================
// FILTER RUN LENGTH FROM OBSERVED BW VOLUMES
// =========================================================================
// User supplies:
//   - Total daily BW water consumption (ML/d) across all N filters
//   - Volume per single filter BW cycle (m³)
//
// Number of BWs per day (bank-wide) = total BW (m³/d) / volume per BW (m³)
//                                   = (total BW ML/d * 1000) / volume per BW (m³)
// Number of BWs per filter per day = N_bws_bank / N_filters
// Run length (h) = 24 / (BWs per filter per day) - sequence_time_h
export function deriveFilterRunLength({
  totalBWVolume_MLd, volumePerBW_m3, numFilters, sequence_hr = 34/60,
}) {
  const total_m3_per_day = totalBWVolume_MLd * 1000;
  const bws_per_day_bank = total_m3_per_day / volumePerBW_m3;
  const bws_per_filter_per_day = bws_per_day_bank / numFilters;
  if (bws_per_filter_per_day <= 0) return { bws_per_day_bank, bws_per_filter_per_day, run_hours: Infinity };

  // Each filter's cycle = run + sequence. Cycles/day = 1 / (cycle_hr)
  // bws_per_filter_per_day = 24 / (run_hr + sequence_hr)
  // → run_hr = 24/bws_per_filter_per_day - sequence_hr
  const run_hours = 24 / bws_per_filter_per_day - sequence_hr;
  return { bws_per_day_bank, bws_per_filter_per_day, run_hours };
}

// =========================================================================
// K (SOLIDS HOLDING CAPACITY) DERIVED FROM RUN LENGTH
// =========================================================================
// K = solids captured per filter per run (kg/m²/run)
//   = (loading_kg_per_m2_per_d) * (run_hr / 24)
//
// σ (specific deposit, g/L) = K / L (bed depth)
export function deriveK({ loading_kg_per_m2_per_d, run_hours, mediaLayers }) {
  const K_kg_per_m2 = loading_kg_per_m2_per_d * (run_hours / 24);
  const L = totalBedDepth(mediaLayers);
  const sigma_g_per_L = L > 0 ? K_kg_per_m2 / L : 0;
  return { K_kg_per_m2, sigma_g_per_L, bedDepth_m: L };
}

// =========================================================================
// PRECIPITATE-WEIGHTED K MULTIPLIER
// =========================================================================
// Computes the effective K multiplier from the precipitate mass-fraction
// composition. Returns 1.0 if no composition supplied (alum baseline).
export function effectiveKMultiplier(composition) {
  if (!composition) return { multiplier: 1.0, normalised: null, total: 0 };
  // Normalise in case fractions don't sum to 1.0
  const total = Object.values(composition).reduce((a, b) => a + (b || 0), 0);
  if (total <= 0) return { multiplier: 1.0, normalised: null, total: 0 };

  const normalised = {};
  let weighted = 0;
  for (const [key, fraction] of Object.entries(composition)) {
    const f_norm = (fraction || 0) / total;
    normalised[key] = f_norm;
    weighted += f_norm * (PRECIPITATE_MULTIPLIERS[key]?.multiplier ?? 1.0);
  }
  return { multiplier: weighted, normalised, total };
}

// =========================================================================
// COMPLETE FILTER ASSESSMENT
// =========================================================================
export function assessFilter({
  feedTSS_mgL, designFlow_MLD, filterTSSRemoval_pct,
  totalBWVolume_MLd, volumePerBW_m3,
  // Optional three-component volumes (defaults to single scalar if not provided)
  drainVolume_m3 = 0, backwashVolume_m3 = null, ftwVolume_m3 = 0,
  netLossPerBW_m3 = null,
  drainDestination = "waste", backwashDestination = "waste", ftwDestination = "waste",
  filter, precipitate,
}) {
  // Backwards compatibility: if components are missing, treat full volumePerBW_m3 as backwash water to waste
  const _drain = drainVolume_m3 || 0;
  const _bw    = (backwashVolume_m3 != null) ? backwashVolume_m3 : (volumePerBW_m3 - _drain - (ftwVolume_m3 || 0));
  const _ftw   = ftwVolume_m3 || 0;
  const _totalPerBW = _drain + _bw + _ftw;
  const _netLoss = (netLossPerBW_m3 != null) ? netLossPerBW_m3 :
    ((drainDestination    === "waste" ? _drain : 0) +
     (backwashDestination === "waste" ? _bw    : 0) +
     (ftwDestination      === "waste" ? _ftw   : 0));

  const captured = solidsCapturedKgPerDay({ feedTSS_mgL, flow_MLD: designFlow_MLD, filterTSSRemoval_pct });
  const loadByCondition = filterLoadingByCondition({
    feedTSS_mgL, flow_MLD: designFlow_MLD, filterTSSRemoval_pct, filter,
  });

  const sequence_hr = filter.bwSequence
    ? (filter.bwSequence.drainDown_min + filter.bwSequence.backwashWater_min + filter.bwSequence.fillUp_min + filter.bwSequence.filterToWaste_min + filter.bwSequence.returnToService_min) / 60
    : 34/60;

  const { bws_per_day_bank, bws_per_filter_per_day, run_hours } = deriveFilterRunLength({
    totalBWVolume_MLd, volumePerBW_m3: _totalPerBW, numFilters: filter.numFilters, sequence_hr,
  });

  // K_implied — derived from the user-supplied BW frequency.
  // Strictly this is K_IMPLIED by the operational BW schedule, not an
  // independent measurement.
  const N_loading = loadByCondition.find((c) => c.key === "N").loading_kg_per_m2_per_d;
  const { K_kg_per_m2: K_observed, sigma_g_per_L, bedDepth_m } = deriveK({
    loading_kg_per_m2_per_d: N_loading, run_hours, mediaLayers: filter.mediaLayers,
  });

  const kMult = effectiveKMultiplier(precipitate);
  const K_alum_equivalent = kMult.multiplier > 0 ? K_observed / kMult.multiplier : K_observed;
  // σ_eff for Mints-Tien: precipitate-adjusted (denser flocs produce less headloss/kg)
  const sigma_eff_g_per_L = kMult.multiplier > 0 ? sigma_g_per_L / kMult.multiplier : sigma_g_per_L;

  // ---------------------------------------------------------------------
  // Optional MANUAL RUN-TIME OVERRIDE
  // ---------------------------------------------------------------------
  // If filter.runHours_override_hr is set, treat that as the operating run
  // time and re-derive an "operator K" from it. The assessment then exposes
  // both K_implied (from BW frequency) and K_operator (from manual entry),
  // plus a comparison against K_max (head-budget-limited) and K_cap (the
  // pragmatic breakthrough cap).
  const runHoursOverride = (filter.runHours_override_hr != null && isFinite(filter.runHours_override_hr) && filter.runHours_override_hr > 0)
    ? filter.runHours_override_hr
    : null;
  let K_operator = null, sigma_operator_g_per_L = null, sigma_operator_eff_g_per_L = null;
  if (runHoursOverride != null) {
    const derived = deriveK({
      loading_kg_per_m2_per_d: N_loading,
      run_hours: runHoursOverride,
      mediaLayers: filter.mediaLayers,
    });
    K_operator = derived.K_kg_per_m2;
    sigma_operator_g_per_L = derived.sigma_g_per_L;
    sigma_operator_eff_g_per_L = kMult.multiplier > 0 ? sigma_operator_g_per_L / kMult.multiplier : sigma_operator_g_per_L;
  }

  // ---------------------------------------------------------------------
  // DESIGN BASIS K — from the designer's stated run length at max TSS
  // ---------------------------------------------------------------------
  // If filter.designRunHours_at_maxTSS_hr is set, derive the K that the
  // designer's own working implies, evaluated at THIS scenario's loading.
  // K_design = loading × designRun_h / 24
  // For the avg scenario this gives a useful "design intent K"; at max-TSS
  // conditions specifically, it equals the designer's quoted operating K.
  // Also expose the BW frequency that the design run length requires.
  const designRunHours = (filter.designRunHours_at_maxTSS_hr != null && isFinite(filter.designRunHours_at_maxTSS_hr) && filter.designRunHours_at_maxTSS_hr > 0)
    ? filter.designRunHours_at_maxTSS_hr
    : null;
  let K_design = null, sigma_design_g_per_L = null, sigma_design_eff_g_per_L = null;
  let bws_per_filter_per_day_design = null, total_BW_MLd_design = null;
  if (designRunHours != null) {
    const derivedDesign = deriveK({
      loading_kg_per_m2_per_d: N_loading,
      run_hours: designRunHours,
      mediaLayers: filter.mediaLayers,
    });
    K_design = derivedDesign.K_kg_per_m2;
    sigma_design_g_per_L = derivedDesign.sigma_g_per_L;
    sigma_design_eff_g_per_L = kMult.multiplier > 0 ? sigma_design_g_per_L / kMult.multiplier : sigma_design_g_per_L;
    // BW frequency implied by the design run length
    const cycle_hr_design = designRunHours + sequence_hr;
    bws_per_filter_per_day_design = 24 / cycle_hr_design;
    total_BW_MLd_design = (bws_per_filter_per_day_design * filter.numFilters * _totalPerBW) / 1000;
  }

  // Daily water usage breakdown (bank-wide)
  const daily_drain_m3    = _drain * bws_per_day_bank;
  const daily_backwash_m3 = _bw    * bws_per_day_bank;
  const daily_ftw_m3      = _ftw   * bws_per_day_bank;
  const daily_total_m3    = _totalPerBW * bws_per_day_bank;
  const daily_netLoss_m3  = _netLoss * bws_per_day_bank;

  return {
    capturedKgPerDay: captured,
    totalLoad_kg_per_day: solidsLoadKgPerDay({ feedTSS_mgL, flow_MLD: designFlow_MLD }),
    loadByCondition,
    bws_per_day_bank,
    bws_per_filter_per_day,
    run_hours,
    sequence_hr,
    K_kg_per_m2: K_observed,
    K_alum_equivalent,
    K_multiplier: kMult.multiplier,
    precipitate_normalised: kMult.normalised,
    sigma_g_per_L,
    sigma_eff_g_per_L,
    bedDepth_m,
    isMintsTienValid: sigma_g_per_L < 4.0,
    // Operator's manual run-time override (null if not set)
    runHours_override_hr: runHoursOverride,
    K_operator,
    sigma_operator_g_per_L,
    sigma_operator_eff_g_per_L,
    // Designer's stated run length at max TSS (null if not set)
    designRunHours_at_maxTSS_hr: designRunHours,
    K_design,
    sigma_design_g_per_L,
    sigma_design_eff_g_per_L,
    bws_per_filter_per_day_design,
    total_BW_MLd_design,
    // BW volume breakdown (per cycle and per day)
    bwVolumes: {
      drainVolume_m3:    _drain,
      backwashVolume_m3: _bw,
      ftwVolume_m3:      _ftw,
      totalPerBW_m3:     _totalPerBW,
      netLossPerBW_m3:   _netLoss,
      drainDestination, backwashDestination, ftwDestination,
      daily_drain_m3, daily_backwash_m3, daily_ftw_m3,
      daily_total_m3, daily_netLoss_m3,
      // As fraction of plant influent
      daily_netLoss_pct: designFlow_MLD > 0 ? (daily_netLoss_m3 / (designFlow_MLD * 1000)) * 100 : 0,
    },
  };
}

// =========================================================================
// ENVELOPE ASSESSMENT
// =========================================================================
// Runs assessFilter three times — once per scenario (min/avg/max) — using
// scenario-picked values from the feed envelope and flow envelope.
//
// Returns a {min, avg, max} object where each value is a full assessment.
import { SCENARIOS, pickFeedScenario, pickScenarioValue } from "./filterDefaults";

export function assessFilterEnvelope({ feed, flowEnv, filter }) {
  const out = {};
  for (const scen of SCENARIOS) {
    const feedScen = pickFeedScenario(feed, scen);
    const flow = pickScenarioValue(flowEnv.designFlow_MLD, scen);
    out[scen] = assessFilter({
      feedTSS_mgL:          feedScen.feedTSS_mgL,
      designFlow_MLD:       flow,
      filterTSSRemoval_pct: feedScen.filterTSSRemoval_pct,
      totalBWVolume_MLd:    feedScen.totalBWVolume_MLd,
      volumePerBW_m3:       feedScen.volumePerBW_m3,
      drainVolume_m3:       feedScen.drainVolume_m3,
      backwashVolume_m3:    feedScen.backwashVolume_m3,
      ftwVolume_m3:         feedScen.ftwVolume_m3,
      netLossPerBW_m3:      feedScen.netLossPerBW_m3,
      drainDestination:     feedScen.drainDestination,
      backwashDestination:  feedScen.backwashDestination,
      ftwDestination:       feedScen.ftwDestination,
      filter,
      precipitate:          feedScen.precipitate,
    });
    out[scen]._scenarioFlow_MLD = flow;
    out[scen]._scenarioFeed = feedScen;
  }
  return out;
}

// =========================================================================
// HEAD BUDGET CURVE
// =========================================================================
// For each operating condition (N, N-1, N-2), compute the terminal head
// required to support a range of K values. Returns one series per condition.
//
//   ΔH_terminal(K) = ΔH_clean_bed(v) + ΔH_underdrain(v) + ΔH_load(K) + ΔH_appurtenance
//
// where ΔH_load = 0.92 × σ_eff^(2/3) and σ_eff = (K / bed_depth) / K_multiplier
//
// Returns curves at the *selected flow scenario* (typically the user's max envelope).
import { cleanBedHeadloss, underdrainHeadloss } from "./filterPhysics";

export function headBudgetCurve({ filter, flow_MLD, K_multiplier = 1.0, K_max_kgm2 = 8.0 }) {
  const bedDepth = totalBedDepth(filter.mediaLayers);
  const conditions = [
    { key: "N",   nServ: filter.numFilters,     label: "N" },
    { key: "N-1", nServ: filter.numFilters - 1, label: "N-1" },
    { key: "N-2", nServ: filter.numFilters - 2, label: "N-2" },
  ];

  // Sample K values densely for a smooth curve
  const K_samples = [];
  for (let K = 0; K <= K_max_kgm2; K += 0.1) K_samples.push(K);
  if (K_samples[K_samples.length - 1] < K_max_kgm2) K_samples.push(K_max_kgm2);

  const series = conditions.map((c) => {
    if (c.nServ <= 0) {
      return { ...c, infeasible: true, points: [], fixed_m: null, v_mh: null };
    }
    const area = totalFilterArea(c.nServ, filter.areaPerFilter_m2);
    const v = filtrationVelocity(flow_MLD, area);
    const cb = cleanBedHeadloss({
      layers: filter.mediaLayers, velocity_m_s: v, equation: filter.cleanBedEquation,
      applyUCCorrection: filter.applyUCCorrection !== false,
      temp_C: filter.temp_C ?? 10,
    });
    const udH = underdrainHeadloss(filter.underdrain, v);
    const fixed = cb.total_m + udH + (filter.appurtenanceLoss_m || 0);

    const points = K_samples.map((K) => {
      const sigma_obs = K / bedDepth;
      const sigma_eff = sigma_obs / (K_multiplier > 0 ? K_multiplier : 1.0);
      const dHL_load = 0.92 * Math.pow(Math.max(0, sigma_eff), 2 / 3);
      return { K, sigma_obs, sigma_eff, dHL_load, total: fixed + dHL_load };
    });

    return {
      ...c,
      infeasible: false,
      fixed_m: fixed,
      cb_m: cb.total_m,
      ud_m: udH,
      v_mh: v * 3600,
      points,
    };
  });

  return { bedDepth, series };
}

// =========================================================================
// PRAGMATIC K CAP (BREAKTHROUGH LIMIT)
// =========================================================================
// Mints-Tien's σ^(2/3) form under-predicts headloss beyond σ ≈ 4 g/L; in
// practice depth filters also lose particle-removal efficiency (turbidity
// breakthrough) well before that point, regardless of available head.
// AWWA/Cleasby-Logsdon literature places the practical upper K bound around
// 5-7 kg/m²/run for well-coagulated water on dual/multimedia rapid filters.
// We cap at 6.0 kg/m²/run by default — head-budget K_max above this is
// hydraulically achievable but operationally unrealistic.
export const K_PRAGMATIC_CAP = 6.0;   // kg/m²/run

// Given an available driving head, find the maximum K each condition can support.
// Returns null for a condition if even K=0 cannot fit (clean+UD+appurt already exceeds head).
// The reported K_max is capped at K_PRAGMATIC_CAP by default; the raw hydraulic
// limit is also returned as K_max_hydraulic for diagnostic use.
export function maxKAtHead({ filter, flow_MLD, K_multiplier = 1.0, drivingHead_m, K_search_max = 20, K_cap = K_PRAGMATIC_CAP }) {
  const curve = headBudgetCurve({ filter, flow_MLD, K_multiplier, K_max_kgm2: K_search_max });
  return curve.series.map((s) => {
    if (s.infeasible) return { ...s, K_max: null, K_max_hydraulic: null, K_capped: false };
    if (s.fixed_m >= drivingHead_m) return { ...s, K_max: 0, K_max_hydraulic: 0, deficitAtZeroK: s.fixed_m - drivingHead_m, K_capped: false };
    // Bisection for K such that total = drivingHead_m
    let lo = 0, hi = K_search_max;
    const bedDepth = totalBedDepth(filter.mediaLayers);
    const fixed = s.fixed_m;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      const sigma_eff = (mid / bedDepth) / (K_multiplier > 0 ? K_multiplier : 1.0);
      const dHL = 0.92 * Math.pow(Math.max(0, sigma_eff), 2 / 3);
      if (fixed + dHL < drivingHead_m) lo = mid; else hi = mid;
    }
    const K_max_hydraulic = (lo + hi) / 2;
    const K_max = K_cap != null && K_cap > 0
      ? Math.min(K_max_hydraulic, K_cap)
      : K_max_hydraulic;
    return { ...s, K_max, K_max_hydraulic, K_capped: K_max_hydraulic > K_max };
  });
}
