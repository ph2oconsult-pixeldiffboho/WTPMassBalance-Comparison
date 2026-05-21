// lib/backwashDynamics.js
// Backwash sequence physics:
//   - Sequence durations: drain-down, BW, fill, FTW, return-to-service
//   - Steady-state offline fraction per filter
//   - Headloss development rate dHL/dt (two models)
//   - 24-h timeline simulation: filter states, instantaneous loading
//   - Plant capacity impact: water lost to BW & FTW, production deficit
//
// Sequencing policy: ONE filter in any BW phase at any moment (bank-wide).

import {
  cleanBedHeadloss, underdrainHeadloss, filtrationVelocity, vToMperHr,
  totalBedDepth, totalFilterArea, mintsTienLoad,
} from "./filterPhysics.js";

// =========================================================================
// SEQUENCE DEFAULTS (minutes) - editable per designer
// =========================================================================
export const DEFAULT_BW_SEQUENCE = {
  drainDown_min:        5,    // lower water level above media
  backwashWater_min:    8,    // air scour + water wash (or water-only)
  fillUp_min:           4,    // re-fill above media
  filterToWaste_min:    15,   // ripening period to waste
  returnToService_min:  2,    // valve sequencing back to production
};

export function totalSequenceMin(seq) {
  return seq.drainDown_min + seq.backwashWater_min + seq.fillUp_min
       + seq.filterToWaste_min + seq.returnToService_min;
}

// Each phase is "out of production" - drainDown through returnToService
// (filter contributes nothing to production during entire sequence)
export function offlineMinutesPerSequence(seq) {
  return totalSequenceMin(seq);
}

// Water consumed during sequence (m³)
// - BW water phase consumes backwashPerCycle_m3
// - FTW is filtered water sent to waste at the post-BW filtration velocity
//   FTW_m3 = velocity_m_s * area * FTW_duration_s  (approx; filter is running)
export function sequenceWaterConsumption({ seq, backwashPerCycle_m3, filterArea_m2, postBW_velocity_m_s }) {
  const FTW_s = seq.filterToWaste_min * 60;
  const FTW_m3 = postBW_velocity_m_s * filterArea_m2 * FTW_s;
  return {
    backwash_m3: backwashPerCycle_m3,
    FTW_m3,
    total_m3: backwashPerCycle_m3 + FTW_m3,
  };
}

// =========================================================================
// STEADY-STATE OFFLINE FRACTION
// Given run length t_run (h) and sequence duration t_seq (min), the fraction
// of time each filter is offline:
//   f_off = t_seq / (t_seq + 60 * t_run)
// Bank-wide, with N filters and single-BW policy:
//   filters in service at any instant: avg = N - f_off * N if BW slots overlap,
//   but with single-BW policy: avg = N - 1 * (cycles/day * t_seq_h / 24)
// More precisely, fraction of TIME the bank operates at N-1:
//   p(BW active) = N * cycles_per_filter_per_day * t_seq_h / 24
//                = total bank BW hours / 24
// If single-BW: capped at 1.0 (continuous BW), which is when next BW must wait.
// =========================================================================
export function steadyStateOfflineMetrics({ runHours, seq, numFilters }) {
  const t_seq_h = totalSequenceMin(seq) / 60;
  const t_run_h = runHours;
  const cyclesPerFilterPerDay = 24 / (t_run_h + t_seq_h);
  const bankBWHoursPerDay = numFilters * cyclesPerFilterPerDay * t_seq_h;
  // Fraction of bank-time that one filter is in BW (capped at 1.0)
  const fractionTimeOneFilterOffline = Math.min(1.0, bankBWHoursPerDay / 24);
  // Effective average filters in service
  const avgFiltersInService = numFilters - fractionTimeOneFilterOffline;
  return {
    sequenceMin: totalSequenceMin(seq),
    sequenceHr: t_seq_h,
    runHours: t_run_h,
    cyclesPerFilterPerDay,
    bankBWHoursPerDay,
    fractionTimeOneFilterOffline,
    avgFiltersInService,
    isSequencingFeasible: bankBWHoursPerDay <= 24, // if > 24 the schedule can't fit
  };
}

// =========================================================================
// RATE OF HEADLOSS DEVELOPMENT (dHL/dt)
//   Linear model: dHL/dt = (dH_terminal - dH_clean) / t_run
//   Mints differential: σ(t) = σ_max * (t/t_run)  (linear deposition)
//     dHL/dt = d/dt [0.92 * σ(t)^(2/3)] = (2/3) * 0.92 * σ(t)^(-1/3) * dσ/dt
//   Both expressed in m/h
// =========================================================================
export function dHL_dt_linear({ dH_clean_m, dH_terminal_m, runHours }) {
  if (runHours <= 0) return Infinity;
  return (dH_terminal_m - dH_clean_m) / runHours;
}

export function dHL_dt_mints_at_t({ sigma_max_g_per_L, runHours, t_hours }) {
  if (runHours <= 0 || t_hours <= 0) return Infinity;
  const sigma_t = sigma_max_g_per_L * (t_hours / runHours);
  const dSigma_dt = sigma_max_g_per_L / runHours; // (g/L)/h
  return (2/3) * 0.92 * Math.pow(Math.max(sigma_t, 1e-6), -1/3) * dSigma_dt;
}

// Return both averages over the run (Mints averaged across 1..N hours)
export function headlossDevelopmentRate({ model, dH_clean_m, dH_terminal_m, runHours, sigma_max_g_per_L }) {
  if (model === "linear") {
    const rate = dHL_dt_linear({ dH_clean_m, dH_terminal_m, runHours });
    return { model, average_m_per_h: rate, instantaneous_m_per_h: rate };
  }
  if (model === "mints") {
    // Average across run using midpoint
    const midT = runHours / 2;
    const avgRate = dHL_dt_mints_at_t({ sigma_max_g_per_L, runHours, t_hours: midT });
    const endRate = dHL_dt_mints_at_t({ sigma_max_g_per_L, runHours, t_hours: runHours });
    return { model, average_m_per_h: avgRate, instantaneous_m_per_h: endRate, sigmaAtMidT: sigma_max_g_per_L/2 };
  }
  throw new Error("Unknown dHL/dt model: " + model);
}

// =========================================================================
// REDUNDANCY MATRIX (N, N-1, N-2 across design/peak/BW)
// At each (condition × flow), compute velocity, clean bed, underdrain,
// Mints load, total head, vs available driving head.
// =========================================================================
// REDUNDANCY MATRIX (N, N-1, N-2 across design/peak/BW)
// At each (condition × flow), compute velocity, clean bed, underdrain,
// Mints load, total head, vs available driving head.
//
// IMPORTANT: pass `sigma_eff_g_per_L` not raw σ_obs. The precipitate K-multiplier
// must be applied at the assessment stage so denser flocs (ferric, CaCO₃) get
// credit for producing less headloss per kg of solids captured. This makes
// Section 5 (redundancy) consistent with Section 7 (head budget curve).
// =========================================================================
export function redundancyMatrix({
  filter, designFlow_MLD, peakFlow_MLD, sigma_eff_g_per_L, sigma_g_per_L,
  K_multiplier,
}) {
  // Accept either sigma_eff_g_per_L (preferred) or legacy sigma_g_per_L + K_multiplier.
  // If only sigma_g_per_L is given, divide by multiplier to recover σ_eff.
  const sigma_eff = (sigma_eff_g_per_L != null)
    ? sigma_eff_g_per_L
    : (sigma_g_per_L != null ? sigma_g_per_L / (K_multiplier || 1.0) : 0);
  const conditions = [
    { key: "N",   filtersInService: filter.numFilters,   label: `N = ${filter.numFilters} (all)` },
    { key: "N-1", filtersInService: filter.numFilters-1, label: `N-1 = ${filter.numFilters-1} (1 offline)` },
    { key: "N-2", filtersInService: filter.numFilters-2, label: `N-2 = ${filter.numFilters-2} (2 offline)` },
  ];
  const scenarios = [
    { key: "design", flow: designFlow_MLD, label: "Design flow", duringBW: false },
    { key: "peak",   flow: peakFlow_MLD,   label: "Peak flow",   duringBW: false },
    { key: "bw",     flow: designFlow_MLD, label: "Design + BW in progress", duringBW: true },
  ];

  const results = [];
  for (const cond of conditions) {
    for (const scen of scenarios) {
      const effectiveN = scen.duringBW ? cond.filtersInService - 1 : cond.filtersInService;
      if (effectiveN <= 0) {
        results.push({
          condition: cond.key, conditionLabel: cond.label,
          scenario: scen.key,  scenarioLabel: scen.label,
          filtersInService: effectiveN, pass: false, infeasible: true,
          note: "Insufficient filters in service",
        });
        continue;
      }
      const areaInService = effectiveN * filter.areaPerFilter_m2;
      const v_m_s = filtrationVelocity(scen.flow, areaInService);
      const v_m_h = vToMperHr(v_m_s);

      const cleanBed = cleanBedHeadloss({
        layers: filter.mediaLayers,
        velocity_m_s: v_m_s,
        equation: filter.cleanBedEquation,
        applyUCCorrection: filter.applyUCCorrection !== false,
        temp_C: filter.temp_C ?? 10,
      });
      const dH_under = underdrainHeadloss(filter.underdrain, v_m_s);
      const dH_load  = mintsTienLoad(sigma_eff);
      const dH_app   = filter.appurtenanceLoss_m ?? 0.30;
      const dH_total = cleanBed.total_m + dH_under + dH_load + dH_app;
      const margin   = filter.drivingHead_m - dH_total;

      results.push({
        condition: cond.key, conditionLabel: cond.label,
        scenario: scen.key,  scenarioLabel: scen.label,
        filtersInService: effectiveN,
        velocity_m_s: v_m_s, velocity_m_h: v_m_h,
        dH_clean_m: cleanBed.total_m, dH_clean_layers: cleanBed.layers,
        dH_underdrain_m: dH_under,
        dH_load_m: dH_load,
        dH_appurtenance_m: dH_app,
        dH_total_m: dH_total,
        drivingHead_m: filter.drivingHead_m,
        margin_m: margin,
        sigma_eff_g_per_L: sigma_eff,
        pass: margin >= 0,
        infeasible: false,
      });
    }
  }
  return results;
}

// =========================================================================
// 24-HOUR TIMELINE SIMULATION
// Single-BW policy: one filter at a time.
// Each filter has its own run clock; first BW triggered when run completes.
// Single-BW queue: if another filter's run ends while one BW is in progress,
// the new one waits.
// =========================================================================
export function timelineSimulation({
  numFilters, runHours, seq, stepMin = 5, durationHr = 24,
}) {
  const t_seq_min = totalSequenceMin(seq);
  const t_run_min = runHours * 60;
  if (t_run_min <= 0) return { steps: [], summary: { error: "Run length non-positive" } };

  // Stagger initial run-end times across filters so they don't all backwash simultaneously
  // Filter i finishes its first run at time (i+1) * (t_run_min / numFilters)
  const filters = Array.from({ length: numFilters }, (_, i) => ({
    id: i + 1,
    state: "producing",
    runEndsAt: ((i + 1) / numFilters) * t_run_min, // minutes
    bwEndsAt:  null,
    bwPhase:   null,
    bwQueuedAt: null,
  }));

  const steps = [];
  const totalMin = durationHr * 60;
  let bwBusy = false;
  let bwBusyFilterId = null;

  // Track state at each step
  for (let t = 0; t <= totalMin; t += stepMin) {
    // Advance each filter
    for (const f of filters) {
      // If producing and run is complete - try to start BW
      if (f.state === "producing" && t >= f.runEndsAt) {
        if (!bwBusy) {
          f.state = "bw";
          f.bwPhase = "drainDown";
          f.bwEndsAt = t + t_seq_min;
          bwBusy = true;
          bwBusyFilterId = f.id;
        } else {
          f.state = "queued";
          f.bwQueuedAt = t;
        }
      }
      // If in BW and finished - return to service
      if (f.state === "bw" && t >= f.bwEndsAt) {
        f.state = "producing";
        f.bwPhase = null;
        f.bwEndsAt = null;
        f.runEndsAt = t + t_run_min;
        bwBusy = false;
        bwBusyFilterId = null;
        // Pick a queued filter (FIFO)
        const queued = filters.find((q) => q.state === "queued");
        if (queued) {
          queued.state = "bw";
          queued.bwPhase = "drainDown";
          queued.bwEndsAt = t + t_seq_min;
          queued.bwQueuedAt = null;
          bwBusy = true;
          bwBusyFilterId = queued.id;
        }
      }
    }

    // Snapshot
    const producing = filters.filter((f) => f.state === "producing").length;
    const inBW      = filters.filter((f) => f.state === "bw").length;
    const queued    = filters.filter((f) => f.state === "queued").length;
    steps.push({
      t_min: t,
      t_hr: t / 60,
      filterStates: filters.map((f) => ({ id: f.id, state: f.state })),
      producing, inBW, queued,
    });
  }

  // Summary
  const minWithBW    = steps.filter((s) => s.inBW > 0).length * stepMin;
  const minWithQueue = steps.filter((s) => s.queued > 0).length * stepMin;
  const minWithMax   = Math.min(...steps.map((s) => s.producing));
  const avgProducing = steps.reduce((a,s) => a + s.producing, 0) / steps.length;
  const completedBWs = filters.filter((f) => f.runEndsAt > t_run_min).length; // approx

  return {
    steps,
    summary: {
      stepMin, durationHr,
      sequenceMin: t_seq_min,
      runMin: t_run_min,
      minWithBW, minWithQueue, minProducing: minWithMax,
      avgProducingFilters: avgProducing,
      bwScheduleFeasible: minWithQueue === 0,
      completedBWs,
    },
  };
}

// =========================================================================
// PLANT CAPACITY IMPACT
// Effective plant capacity given total BW water losses (drain + bw + ftw):
//   Q_lost_total = N_bws_per_day * V_per_bw_total
// where V_per_bw_total is the SUM of drain + backwash + FTW (filter.backwashPerCycle_m3
// is set to this sum upstream). Previously this function added a separately-
// derived FTW volume on top, double-counting the FTW stream. The user now
// inputs FTW explicitly as part of the per-cycle breakdown.
// =========================================================================
export function plantCapacityImpact({
  filter, designFlow_MLD, runHours, seq, ssMetrics,
}) {
  const N_bws_per_day = ssMetrics.cyclesPerFilterPerDay * filter.numFilters;

  // Total per-cycle volume (drain + backwash + FTW) — already known
  const bw_per_cycle = filter.backwashPerCycle_m3;

  // For backwards-compatible reporting we still split out an FTW component using
  // the user's explicit ftwVolume_m3 if present (filter object carries it via
  // bwVolumes); otherwise the velocity-based FTW estimate is used purely for
  // display, NOT for double-counting.
  const ftw_per_cycle = filter.ftwVolume_m3 ?? null;
  // Velocity-based FTW estimate (display only)
  const areaInService = Math.max(1, (filter.numFilters - 1) * filter.areaPerFilter_m2);
  const v_post_bw = filtrationVelocity(designFlow_MLD, areaInService);
  const FTW_velocity_estimate = v_post_bw * filter.areaPerFilter_m2 * (seq.filterToWaste_min * 60);
  const FTW_per_cycle = (ftw_per_cycle != null) ? ftw_per_cycle : FTW_velocity_estimate;

  const total_lost_m3_per_day = N_bws_per_day * bw_per_cycle;  // user-supplied total
  const total_BW_m3_per_day   = N_bws_per_day * Math.max(0, bw_per_cycle - FTW_per_cycle);
  const total_FTW_m3_per_day  = N_bws_per_day * FTW_per_cycle;
  const total_lost_MLD = total_lost_m3_per_day / 1000;

  const design_m3_per_day = designFlow_MLD * 1000;
  const net_production_m3_per_day = design_m3_per_day - total_lost_m3_per_day;
  const net_production_MLD = net_production_m3_per_day / 1000;
  const capacity_deficit_pct = ((design_m3_per_day - net_production_m3_per_day) / design_m3_per_day) * 100;

  return {
    N_bws_per_day,
    bw_per_cycle_m3:  bw_per_cycle,
    FTW_per_cycle_m3: FTW_per_cycle,
    total_BW_MLD:     total_BW_m3_per_day / 1000,
    total_FTW_MLD:    total_FTW_m3_per_day / 1000,
    total_lost_MLD,
    net_production_MLD,
    capacity_deficit_pct,
  };
}
