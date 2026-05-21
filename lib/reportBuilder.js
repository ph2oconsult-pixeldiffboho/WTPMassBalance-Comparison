// lib/reportBuilder.js
// Computes the full dual-mode assessment (coagulation + lime softening)
// used by the in-app PDF report. Reuses the app physics in filterPhysics.js so
// the report stays consistent with the rest of the tool.

import {
  cleanBedHeadloss, underdrainHeadloss, filtrationVelocity,
  totalFilterArea, totalBedDepth,
} from "./filterPhysics";
import { effectiveKMultiplier } from "./filterCalculations";
import { totalSequenceMin } from "./backwashDynamics";
import { validateDerived, worstSeverity } from "./validation";

export const K_CAP = 6.0;       // pragmatic breakthrough cap, kg/m2/run
export const REPORT_FLOW = 120; // ML/d, plant design flow
export const REPORT_TEMP_MIN = 15; // degC, minimum design water temperature (SEQ basis)
const APPURT_DEFAULT = 0.15;    // m, appurtenance headloss if not on the filter

// Designer-documented operating points for the two modes. Coagulation uses
// ferric (D1) and alum (D2); lime softening uses a CaCO3-dominant precipitate
// for both. These are the stable assessment inputs.
export const REPORT_MODES = {
  coag: {
    key: "coag",
    label: "Coagulation (maximum turbidity)",
    short: "Coagulation",
    D1: { tss: 10.9, run: 44, removal: 97, precip: { ferric: 1 }, chem: "ferric coagulation" },
    D2: { tss: 9.98, run: 24, removal: 90, precip: { alum: 1 },   chem: "alum coagulation" },
  },
  soft: {
    key: "soft",
    label: "100% lime softening at pH 10",
    short: "Lime softening",
    D1: { tss: 11.6, run: 44, removal: 97, precip: { caco3: 0.90, mgoh2: 0.05, other: 0.05 }, chem: "lime softening" },
    D2: { tss: 42.4, run: 16, removal: 90, precip: { caco3: 0.90, mgoh2: 0.05, other: 0.05 }, chem: "lime softening" },
  },
};

function kmultOf(precip) {
  const full = { alum: 0, ferric: 0, caco3: 0, mgoh2: 0, other: 0, ...precip };
  return effectiveKMultiplier(full).multiplier;
}

function poreFillK(filter) {
  // anthracite 7.0 kg/m3, sand 1.0 kg/m3 pore-fill capacity ratios
  const anth = filter.mediaLayers.find((l) => l.media === "anthracite");
  const sand = filter.mediaLayers.find((l) => l.media === "sand");
  return (anth ? anth.depth * 7.0 : 0) + (sand ? sand.depth * 1.0 : 0);
}

function appurtOf(filter) {
  return filter.appurtenanceLoss_m ?? APPURT_DEFAULT;
}

// Core assessment: a design at a feed TSS / removal / run length / chemistry.
export function assess({ filter, tss, removal, runHours, kmult, flow = REPORT_FLOW }) {
  const area = totalFilterArea(filter.numFilters, filter.areaPerFilter_m2);
  const bed = totalBedDepth(filter.mediaLayers);
  const loading = (tss * flow * removal) / 100 / area;     // kg/m2/d
  const K = (loading * runHours) / 24;                      // kg/m2/run
  const sigmaObs = K / bed;                                 // g/L
  const sigmaEff = sigmaObs / (kmult || 1);
  const v = filtrationVelocity(flow, area);                 // m/s
  const cb = cleanBedHeadloss({
    layers: filter.mediaLayers, velocity_m_s: v,
    equation: filter.cleanBedEquation, applyUCCorrection: true,
    temp_C: REPORT_TEMP_MIN,
  }).total_m;
  const ud = underdrainHeadloss(filter.underdrain, v);
  const load = 0.92 * Math.pow(Math.max(0, sigmaEff), 2 / 3);
  const appurt = appurtOf(filter);
  const totalDH = cb + ud + load + appurt;
  const head = filter.drivingHead_m;
  return {
    area, bed, loading, K, sigmaObs, sigmaEff, v_mh: v * 3600,
    cb, ud, load, appurt, totalDH, head, margin: head - totalDH,
    feasible: head - totalDH >= 0, runHours, tss, removal,
    poreFill: poreFillK(filter),
  };
}

// Maximum K the head budget allows at the given flow.
export function headLimitedK({ filter, kmult, flow = REPORT_FLOW }) {
  const area = totalFilterArea(filter.numFilters, filter.areaPerFilter_m2);
  const bed = totalBedDepth(filter.mediaLayers);
  const v = filtrationVelocity(flow, area);
  const cb = cleanBedHeadloss({
    layers: filter.mediaLayers, velocity_m_s: v,
    equation: filter.cleanBedEquation, applyUCCorrection: true,
    temp_C: REPORT_TEMP_MIN,
  }).total_m;
  const ud = underdrainHeadloss(filter.underdrain, v);
  const availLoad = filter.drivingHead_m - cb - ud - appurtOf(filter);
  if (availLoad <= 0) return 0;
  const sigmaEff = Math.pow(availLoad / 0.92, 1.5);
  return sigmaEff * (kmult || 1) * bed;
}

// Backwash water as ML/d and % of plant flow. Dump + filter backwash, with
// filter-to-waste reported separately. BW volumes live in the feed object;
// sequence durations in the filter object.
export function backwashDaily({ filter, feed, runHours, flow = REPORT_FLOW }) {
  const seqH = filter.bwSequence ? totalSequenceMin(filter.bwSequence) / 60 : 0;
  const bwsBank = (24 / (runHours + seqH)) * filter.numFilters;
  const perCycle = (feed.drainVolume_m3 ?? 0) + (feed.backwashVolume_m3 ?? 0);
  const ftwPerCycle = feed.ftwVolume_m3 ?? 0;
  const daily = (bwsBank * perCycle) / 1000;
  const ftwDaily = (bwsBank * ftwPerCycle) / 1000;
  return {
    bwsBank, perCycle, daily, pctFlow: (daily / flow) * 100,
    ftwPerCycle, ftwDaily, ftwPctFlow: (ftwDaily / flow) * 100,
    totalPerCycle: perCycle + ftwPerCycle,
    totalDaily: daily + ftwDaily, totalPctFlow: ((daily + ftwDaily) / flow) * 100,
  };
}

// Clean-bed headloss sensitivity to water temperature. Kozeny-Carman headloss
// is proportional to viscosity, so cold water raises clean-bed headloss and
// shrinks the head left for solids load. Evaluated at N and N-2.
export function coldWaterSensitivity({ filter, flow = REPORT_FLOW }) {
  const appurt = appurtOf(filter);
  const calc = (inService, T) => {
    if (inService <= 0) return { v_mh: null, cb: null, ud: null, headForLoad: null };
    const area = inService * filter.areaPerFilter_m2;
    const v = filtrationVelocity(flow, area);
    const cb = cleanBedHeadloss({
      layers: filter.mediaLayers, velocity_m_s: v,
      equation: filter.cleanBedEquation, applyUCCorrection: true, temp_C: T,
    }).total_m;
    const ud = underdrainHeadloss(filter.underdrain, v);
    return { v_mh: v * 3600, cb, ud, headForLoad: filter.drivingHead_m - cb - ud - appurt };
  };
  return [15, 21, 28].map((T) => ({
    temp_C: T,
    N: calc(filter.numFilters, T),
    N1: calc(filter.numFilters - 1, T),
    N2: calc(filter.numFilters - 2, T),
  }));
}

// Hydraulic headroom at N, N-1 and N-2 filters in service, at the maximum
// design flow. This is the governing robustness check: with filters out of
// service the velocity rises, clean-bed and underdrain headloss rise, and the
// head left for solids load shrinks.
export function redundancy({ filter, flow = REPORT_FLOW }) {
  const levels = [
    { key: "N", label: "N, all filters in service", offline: 0 },
    { key: "N-1", label: "N-1, one filter offline", offline: 1 },
    { key: "N-2", label: "N-2, one offline plus one in backwash", offline: 2 },
  ];
  return levels.map((lv) => {
    const inService = filter.numFilters - lv.offline;
    if (inService <= 0) {
      return { ...lv, inService, feasible: false, v_mh: null, headForLoad: null };
    }
    const area = inService * filter.areaPerFilter_m2;
    const v = filtrationVelocity(flow, area);
    const cb = cleanBedHeadloss({
      layers: filter.mediaLayers, velocity_m_s: v,
      equation: filter.cleanBedEquation, applyUCCorrection: true,
      temp_C: REPORT_TEMP_MIN,
    }).total_m;
    const ud = underdrainHeadloss(filter.underdrain, v);
    const appurt = appurtOf(filter);
    const headForLoad = filter.drivingHead_m - cb - ud - appurt;
    return { ...lv, inService, v_mh: v * 3600, cb, ud, appurt,
             headForLoad, feasible: headForLoad > 0 };
  });
}

// Sensitivity: feed solids doubled. The design keeps its run length if the
// doubled-feed K stays within the achievable K (lower of head limit and cap);
// otherwise the run shortens to what the achievable K allows.
export function sensitivity({ filter, modeDesign, kmult, flow = REPORT_FLOW }) {
  const tss2 = modeDesign.tss * 2;
  const aDesign = assess({ filter, tss: tss2, removal: modeDesign.removal,
    runHours: modeDesign.run, kmult, flow });
  const kHead = headLimitedK({ filter, kmult, flow });
  const kAch = Math.min(kHead, K_CAP);
  const area = totalFilterArea(filter.numFilters, filter.areaPerFilter_m2);
  const loading2 = (tss2 * flow * modeDesign.removal) / 100 / area;
  const runAtCap = (kAch / loading2) * 24;
  const runRet = Math.min(modeDesign.run, runAtCap);
  const aAch = assess({ filter, tss: tss2, removal: modeDesign.removal,
    runHours: runRet, kmult, flow });
  let bind = kHead < K_CAP ? "head budget" : "breakthrough cap";
  if (aDesign.K <= kAch) bind = "none, run length retained";
  return {
    tss2, kReq: aDesign.K, kHead, kAch, runRet, runDesign: modeDesign.run,
    margin: aAch.margin, feasible: aAch.feasible, bind,
  };
}

// Build the complete dual-mode assessment object the PDF renderer consumes.
export function buildReportModel({ filterD1, filterD2, feedD1, feedD2, nameD1, nameD2, preparedBy }) {
  const d1 = (nameD1 && nameD1.trim()) ? nameD1.trim() : "Designer 1";
  const d2 = (nameD2 && nameD2.trim()) ? nameD2.trim() : "Designer 2";
  const filters = { D1: filterD1, D2: filterD2 };
  const feeds = { D1: feedD1, D2: feedD2 };

  const modes = {};
  for (const mk of ["coag", "soft"]) {
    const m = REPORT_MODES[mk];
    const out = { key: mk, label: m.label, short: m.short };
    for (const dk of ["D1", "D2"]) {
      const md = m[dk];
      const kmult = kmultOf(md.precip);
      const a = assess({
        filter: filters[dk], tss: md.tss, removal: md.removal,
        runHours: md.run, kmult,
      });
      const bw = backwashDaily({ filter: filters[dk], feed: feeds[dk], runHours: md.run });
      const sens = sensitivity({ filter: filters[dk], modeDesign: md, kmult });
      out[dk] = { ...a, kmult, chem: md.chem, bw, sens, modeDesign: md };
    }
    modes[mk] = out;
  }

  // Like-for-like at a common feed, per chemistry
  const lfl = {};
  for (const mk of ["coag", "soft"]) {
    const m = REPORT_MODES[mk];
    lfl[mk] = {
      D1: assess({ filter: filterD1, tss: 20, removal: 95, runHours: 24,
        kmult: kmultOf(m.D1.precip) }),
      D2: assess({ filter: filterD2, tss: 20, removal: 95, runHours: 24,
        kmult: kmultOf(m.D2.precip) }),
    };
  }

  // D2 lime-softening utilisation opportunity. D2 underuses its bed; this
  // quantifies the gain from running closer to the breakthrough cap and from
  // a 50% reduction in softening turbidity carryover.
  const oppD2 = (() => {
    const soft = REPORT_MODES.soft.D2;
    const kmult = kmultOf(soft.precip);
    const area = totalFilterArea(filterD2.numFilters, filterD2.areaPerFilter_m2);
    const removal = soft.removal;
    const point = (tss, targetK, runOverride) => {
      const loading = (tss * REPORT_FLOW * removal) / 100 / area;
      const run = runOverride != null ? runOverride : (targetK / loading) * 24;
      const a = assess({ filter: filterD2, tss, removal, runHours: run, kmult });
      const bw = backwashDaily({ filter: filterD2, feed: feedD2, runHours: run });
      return { tss, K: a.K, run, margin: a.margin, bwPct: bw.pctFlow, bwDaily: bw.daily };
    };
    const asBuilt = point(soft.tss, null, soft.run);
    const runToCap = point(soft.tss, K_CAP);
    const halfTss = soft.tss * 0.5;
    const turbCut = point(halfTss, asBuilt.K);   // 50% turbidity cut, hold current K
    const turbCutCap = point(halfTss, K_CAP);    // 50% turbidity cut + run to cap
    return {
      asBuilt, runToCap, turbCut, turbCutCap,
      poreFill: poreFillK(filterD2),
      capPctOfCeiling: (K_CAP / poreFillK(filterD2)) * 100,
      asBuiltPctOfCeiling: (asBuilt.K / poreFillK(filterD2)) * 100,
      bwSaveRunToCap: asBuilt.bwDaily - runToCap.bwDaily,
      bwSaveFull: asBuilt.bwDaily - turbCutCap.bwDaily,
    };
  })();

  // D2 lime-softening removal-efficiency opportunity. The designer assumes 90%
  // TSS removal, which is conservative for a 2.10 m dual-media bed. This shows
  // the effect of 90 / 95 / 98% removal at the design run length: captured
  // solids and K rise only modestly, head margin barely moves, but filtrate
  // TSS improves sharply.
  const removalOppD2 = (() => {
    const soft = REPORT_MODES.soft.D2;
    const kmult = kmultOf(soft.precip);
    const point = (removal) => {
      const a = assess({ filter: filterD2, tss: soft.tss, removal,
        runHours: soft.run, kmult });
      return {
        removal,
        capturedTSS: (soft.tss * removal) / 100,
        filtrateTSS: soft.tss * (1 - removal / 100),
        K: a.K, load: a.load, totalDH: a.totalDH, margin: a.margin,
        runHours: soft.run, feasible: a.feasible,
      };
    };
    const pts = [90, 95, 98].map(point);
    return {
      asBuiltRemoval: soft.removal, feedTSS: soft.tss, poreFill: poreFillK(filterD2),
      points: pts,
      filtrateGain: pts[0].filtrateTSS / pts[2].filtrateTSS, // 90% vs 98% factor
      marginCost: pts[0].margin - pts[2].margin,             // head margin given up
      kRise: pts[2].K - pts[0].K,                            // extra K at 98%
    };
  })();

  // Mg(OH)2 floc sensitivity for the D2 lime-softening duty. Acciona targets
  // magnesium removal to meet the CCPP and total-hardness goals, which
  // introduces a Mg(OH)2 fraction into the softening precipitate. Mg(OH)2 is
  // the least favourable precipitate for headloss, so a higher fraction lowers
  // the deposit structure factor and erodes the head margin. The fraction is
  // uncertain; this sweep bounds its effect. Run length held at the design value.
  const mgFlocSensD2 = (() => {
    const soft = REPORT_MODES.soft.D2;
    const other = 0.05;
    const point = (mgFrac) => {
      const caco3 = Math.max(0, 1 - mgFrac - other);
      const precip = { caco3, mgoh2: mgFrac, other };
      const kmult = kmultOf(precip);
      const a = assess({ filter: filterD2, tss: soft.tss, removal: soft.removal,
        runHours: soft.run, kmult });
      return { mgFrac, kmult, load: a.load, totalDH: a.totalDH,
        margin: a.margin, K: a.K, feasible: a.feasible };
    };
    const pts = [0, 0.15, 0.30, 0.45].map(point);
    return {
      asBuiltMgFrac: soft.precip.mgoh2 || 0,
      asBuiltKmult: kmultOf(soft.precip),
      points: pts,
      marginSwing: pts[0].margin - pts[pts.length - 1].margin,
    };
  })();

  return {
    names: { d1, d2 },
    preparedBy: (preparedBy && preparedBy.trim()) ? preparedBy.trim() : null,
    filters: { D1: filterD1, D2: filterD2 },
    poreFill: { D1: poreFillK(filterD1), D2: poreFillK(filterD2) },
    modes, lfl,
    opportunityD2: oppD2,
    removalOpportunityD2: removalOppD2,
    mgFlocSensitivityD2: mgFlocSensD2,
    tempMin: REPORT_TEMP_MIN,
    redundancy: {
      D1: redundancy({ filter: filterD1 }),
      D2: redundancy({ filter: filterD2 }),
    },
    coldWater: {
      D1: coldWaterSensitivity({ filter: filterD1 }),
      D2: coldWaterSensitivity({ filter: filterD2 }),
    },
    flow: REPORT_FLOW, kCap: K_CAP,
    validation: (() => {
      // Sanity-check every derived operating point against physical limits.
      const issues = [];
      for (const mk of ["coag", "soft"]) {
        for (const dk of ["D1", "D2"]) {
          const r = modes[mk][dk];
          issues.push(...validateDerived({
            velocity_mh: r.v_mh, K: r.K, poreFillK: poreFillK(filters[dk]),
            label: `${dk} ${REPORT_MODES[mk].short.toLowerCase()}`,
          }));
        }
      }
      return { issues, severity: worstSeverity(issues) };
    })(),
  };
}
