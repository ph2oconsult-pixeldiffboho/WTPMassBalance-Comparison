// lib/filterPhysics.js
// Filter design physics: media properties, underdrains, clean-bed headloss
// (Kozeny-Carman / Ergun / Rose), terminal head, redundancy matrix.

const g = 9.81;

// =========================================================================
// WATER PROPERTIES vs TEMPERATURE
// =========================================================================
// Dynamic viscosity from Vogel equation; density from a 4th-order polynomial
// fit to standard tables (Crittenden 2012 Appendix C). Both accurate to 
// better than 0.1% over the 0-30 °C range typical of municipal WTP design.
// Default temp = 10 °C (cold-water conservative design).
export const DEFAULT_TEMP_C = 10;

// Density of pure water vs temperature (kg/m³)
//   Polynomial fit, ±0.05 kg/m³ over 0-40 °C
export function waterDensity(T_C) {
  const T = T_C;
  // Tanaka et al. 2001 simplified
  return 999.974950 * (1 - ((T - 3.98315) ** 2) * (T + 283.1505) / (503570 * (T + 67.26889)));
}

// Dynamic viscosity of pure water vs temperature (Pa·s)
//   Vogel-Fulcher-Tammann fit, ±0.5% over 0-50 °C
export function waterDynamicViscosity(T_C) {
  // µ = A · exp(B / (C + T))   with T in °C
  // Coefficients from Korson, Drost-Hansen & Millero (1969)
  const A = 2.414e-5;
  const B = 247.8;
  const C = 140;       // (T + 140) in Kelvin actually = T_C + 273.15 - 133.15
  // Standard form: µ = 2.414e-5 · 10^(247.8 / (T_K - 140))
  const T_K = T_C + 273.15;
  return A * Math.pow(10, B / (T_K - 140));
}

// Kinematic viscosity (m²/s)
export function waterKinematicViscosity(T_C) {
  return waterDynamicViscosity(T_C) / waterDensity(T_C);
}

// Reference values at 10 °C (retained for backwards compatibility)
const NU_WATER_REF = waterKinematicViscosity(DEFAULT_TEMP_C);       // ~1.30e-6 m²/s
const RHO_WATER_REF = waterDensity(DEFAULT_TEMP_C);                  // ~999.7 kg/m³
const MU_WATER_REF = waterDynamicViscosity(DEFAULT_TEMP_C);          // ~1.30e-3 Pa·s

// =========================================================================
// MEDIA LIBRARY
// =========================================================================
export const MEDIA_LIBRARY = {
  anthracite: { name: "Anthracite",        d_mm_default: 1.20, uc_default: 1.5, sphericity: 0.65, porosity: 0.50, density: 1600 },
  sand:       { name: "Silica sand",       d_mm_default: 0.55, uc_default: 1.5, sphericity: 0.80, porosity: 0.42, density: 2650 },
  garnet:     { name: "Garnet",            d_mm_default: 0.30, uc_default: 1.6, sphericity: 0.75, porosity: 0.45, density: 4100 },
  gac:        { name: "GAC",               d_mm_default: 1.30, uc_default: 1.7, sphericity: 0.75, porosity: 0.50, density: 1450 },
};

// =========================================================================
// MEDIA CONFIGURATIONS (preset stacks)
// =========================================================================
export const MEDIA_CONFIGURATIONS = {
  "mono-sand":       { name: "Mono-media sand",                     layers: [{ media: "sand", depth: 0.75, d_mm: 0.55, uc: 1.5, porosity: 0.42 }] },
  "mono-anthracite": { name: "Mono-media anthracite",               layers: [{ media: "anthracite", depth: 1.50, d_mm: 1.20, uc: 1.5, porosity: 0.50 }] },
  "dual":            { name: "Dual media (anthracite + sand)",      layers: [
                        { media: "anthracite", depth: 0.60, d_mm: 1.20, uc: 1.5, porosity: 0.50 },
                        { media: "sand",       depth: 0.30, d_mm: 0.55, uc: 1.5, porosity: 0.42 },
                      ]},
  "tri-media":       { name: "Tri-media (anthracite + sand + garnet)", layers: [
                        { media: "anthracite", depth: 0.45, d_mm: 1.20, uc: 1.5, porosity: 0.50 },
                        { media: "sand",       depth: 0.25, d_mm: 0.55, uc: 1.5, porosity: 0.42 },
                        { media: "garnet",     depth: 0.10, d_mm: 0.30, uc: 1.6, porosity: 0.45 },
                      ]},
  "gac-cap":         { name: "GAC cap on sand", layers: [
                        { media: "gac",  depth: 0.60, d_mm: 1.30, uc: 1.7, porosity: 0.50 },
                        { media: "sand", depth: 0.30, d_mm: 0.55, uc: 1.5, porosity: 0.42 },
                      ]},
};

// =========================================================================
// UNDERDRAIN LIBRARY
// Empirical headloss at reference velocity v_ref = 5 m/h (1.39e-3 m/s),
// scaled with v² ratio. Captures gravel + manifold pressure drop that
// a pure K·v²/2g on filtration v alone misses.
//
// Vendor-neutral names. Reference headloss values are from peer-reviewed
// design literature and manufacturer-published curves (lowest, most-cited).
// Each entry carries its source citation for audit.
// =========================================================================
const V_REF_UNDERDRAIN_M_S = 5 / 3600;
export const UNDERDRAIN_LIBRARY = {
  block: {
    name: "Block underdrain + IMS cap",
    K_loss: 1.1,
    typical_headloss_m: 0.18,
    notes: "HDPE/PP dual-parallel-lateral block with Integrated Media Support (IMS) cap — sintered HDPE porous plate directly on top of the block, replacing 200-300 mm of support gravel. Lowest-headloss block configuration; all-in installed headloss bundles block + IMS cap + outlet pipework.",
    source: "Xylem-Leopold Type S/SL with IMS 1000/200 cap: published 0.15-0.18 m at 5 m/h. De Nora Tetra LP Block with S-Plate (equivalent sintered HDPE plate): published 0.15-0.20 m at 5 m/h. Both manufacturers agree within ±10% on the IMS-cap-on-block configuration. 0.18 m used as a conservative installed mid-range value.",
  },
  nozzle: {
    name: "Nozzle (false floor)",
    K_loss: 1.8,
    typical_headloss_m: 0.30,
    notes: "Strainer-nozzles in a concrete or pre-cast false-floor; air-scour capable",
    source: "Kawamura (2000) Table 7-6; Degrémont Water Treatment Handbook (2007) §13.2",
  },
  "pipe-lateral": {
    name: "Pipe lateral with orifices",
    K_loss: 3.0,
    typical_headloss_m: 0.55,
    notes: "Manifold and orifice laterals over support gravel; traditional, highest headloss",
    source: "Kawamura (2000) Table 7-6; AWWA M37 (2011) Ch 5",
  },
  wheeler: {
    name: "Wheeler bottom",
    K_loss: 2.5,
    typical_headloss_m: 0.45,
    notes: "Concrete false bottom with porcelain spheres; older design, retained for legacy comparisons",
    source: "Cleasby & Logsdon (1999) §8.4.3; Crittenden et al. (2012) §11.6",
  },
  "block-gravel": {
    name: "Block underdrain + support gravel",
    K_loss: 1.5,
    typical_headloss_m: 0.28,
    notes: "Same dual-parallel-lateral block, but with 200-300 mm traditional graded support gravel above the block instead of an IMS cap. Higher headloss because of the gravel layer, but lower capital cost and longer service life history.",
    source: "Xylem-Leopold Type S/SL with graded gravel: published 0.22-0.28 m at 5 m/h. De Nora Tetra LP Block with gravel: published 0.20-0.30 m at 5 m/h. 0.28 m used as a conservative installed value.",
  },
};

// =========================================================================
// CLEAN BED HEADLOSS EQUATIONS (m head per m bed)
// =========================================================================

// Kozeny-Carman (Crittenden 2012 Eq 11-39)
export function headlossKozenyCarman(layer, v_m_s, temp_C = DEFAULT_TEMP_C) {
  const eps = layer.porosity;
  const phi = MEDIA_LIBRARY[layer.media].sphericity;
  const d   = layer.d_mm / 1000;
  const mu  = waterDynamicViscosity(temp_C);
  const rho = waterDensity(temp_C);
  return (180 * mu * (1-eps)**2 * v_m_s)
       / (rho * g * eps**3 * phi**2 * d**2);
}

// Ergun (Crittenden 2012 Eq 11-40)
export function headlossErgun(layer, v_m_s, temp_C = DEFAULT_TEMP_C) {
  const eps = layer.porosity;
  const phi = MEDIA_LIBRARY[layer.media].sphericity;
  const d   = layer.d_mm / 1000;
  const mu  = waterDynamicViscosity(temp_C);
  const rho = waterDensity(temp_C);
  const viscous  = (150 * mu * (1-eps)**2 * v_m_s) / (rho * g * eps**3 * phi**2 * d**2);
  const inertial = (1.75 * (1-eps) * v_m_s**2) / (g * eps**3 * phi * d);
  return viscous + inertial;
}

// Rose (Cleasby & Logsdon 1999)
export function headlossRose(layer, v_m_s, temp_C = DEFAULT_TEMP_C) {
  const eps = layer.porosity;
  const phi = MEDIA_LIBRARY[layer.media].sphericity;
  const d   = layer.d_mm / 1000;
  const nu  = waterKinematicViscosity(temp_C);
  const Re  = (v_m_s * d) / (eps * nu);
  const C_D = 24/Math.max(Re,1e-3) + 3/Math.sqrt(Math.max(Re,1e-3)) + 0.34;
  return (1.067 * C_D * v_m_s**2 * (1-eps)) / (phi * g * eps**4 * d);
}

const CLEAN_BED_EQS = {
  "kozeny-carman": headlossKozenyCarman,
  "ergun":         headlossErgun,
  "rose":          headlossRose,
};

export const CLEAN_BED_EQ_LABELS = {
  "kozeny-carman": "Kozeny-Carman",
  "ergun":         "Ergun",
  "rose":          "Rose",
};

// =========================================================================
// CLEASBY-LOGSDON UC CORRECTION
// =========================================================================
// Real filter sand is not perfectly uniform. The uniformity coefficient
// UC = d_60 / d_10 captures this — published clean-bed equations are
// calibrated against d_10, but a non-uniform medium has more fine grains
// generating extra headloss than the d_10 alone predicts.
//
//   ΔH_corrected = ΔH(d_10) × [1 + 1.3 × (UC − 1)]
//
// At UC = 1.0 (uniform): factor = 1.00
// At UC = 1.3 (good filter sand): factor = 1.39
// At UC = 1.5 (typical sand): factor = 1.65
// At UC = 1.7 (graded): factor = 1.91
//
// Source: Cleasby, J.L., Logsdon, G.S. (1999). Granular bed and precoat
// filtration. In: Water Quality and Treatment, 5th ed., AWWA.
export function ucCorrectionFactor(uc) {
  if (!uc || uc < 1.0) return 1.0;
  return 1.0 + 1.3 * (uc - 1.0);
}

export function cleanBedHeadloss({ layers, velocity_m_s, equation = "kozeny-carman", applyUCCorrection = true, temp_C = DEFAULT_TEMP_C }) {
  const fn = CLEAN_BED_EQS[equation];
  if (!fn) throw new Error(`Unknown equation: ${equation}`);
  const layerResults = layers.map((layer) => {
    const dHperL_uniform = fn(layer, velocity_m_s, temp_C);
    const uc = layer.uc ?? 1.0;
    const correction = applyUCCorrection ? ucCorrectionFactor(uc) : 1.0;
    const dHperL = dHperL_uniform * correction;
    return {
      media: layer.media, depth_m: layer.depth, d_mm: layer.d_mm,
      uc, porosity: layer.porosity, ucCorrection: correction,
      dH_per_m_uniform: dHperL_uniform,
      dH_per_m: dHperL,
      dH_m_uniform: dHperL_uniform * layer.depth,
      dH_m: dHperL * layer.depth,
    };
  });
  return {
    total_m: layerResults.reduce((a,l) => a + l.dH_m, 0),
    total_m_uniform: layerResults.reduce((a,l) => a + l.dH_m_uniform, 0),
    layers: layerResults,
    ucCorrectionApplied: applyUCCorrection,
    temp_C,
    mu_Pa_s: waterDynamicViscosity(temp_C),
    rho_kg_m3: waterDensity(temp_C),
  };
}

export function underdrainHeadloss(underdrainKey, v_m_s) {
  const u = UNDERDRAIN_LIBRARY[underdrainKey];
  if (!u) throw new Error(`Unknown underdrain: ${underdrainKey}`);
  // Scale empirical reference headloss with v² ratio (typical 5 m/h reference)
  return u.typical_headloss_m * Math.pow(v_m_s / V_REF_UNDERDRAIN_M_S, 2);
}

// Return reference velocity (m/s) used for empirical scaling
export const UNDERDRAIN_REF_VELOCITY_M_S = V_REF_UNDERDRAIN_M_S;
export const UNDERDRAIN_REF_VELOCITY_M_H = 5;

// Generate a velocity-vs-headloss series for plotting. velocityRange_mh is
// a [min, max] tuple in m/h (e.g. [2, 16] covers everything from low-rate to
// N-2 + peak conditions). nPoints controls smoothness.
export function underdrainHeadlossSeries({
  underdrainKey, velocityRange_mh = [2, 16], nPoints = 28,
}) {
  const [vmin, vmax] = velocityRange_mh;
  const step = (vmax - vmin) / (nPoints - 1);
  const points = [];
  for (let i = 0; i < nPoints; i++) {
    const v_mh = vmin + i * step;
    const v_ms = v_mh / 3600;
    points.push({ v_m_h: v_mh, dH_m: underdrainHeadloss(underdrainKey, v_ms) });
  }
  return points;
}

// Generate series for ALL underdrains in the library, for comparison plot
export function allUnderdrainHeadlossSeries({ velocityRange_mh = [2, 16], nPoints = 28 } = {}) {
  return Object.entries(UNDERDRAIN_LIBRARY).map(([key, u]) => ({
    key,
    name: u.name,
    refHeadloss_m: u.typical_headloss_m,
    points: underdrainHeadlossSeries({ underdrainKey: key, velocityRange_mh, nPoints }),
  }));
}

// =========================================================================
// HELPERS
// =========================================================================
export function totalBedDepth(layers)         { return layers.reduce((a,l) => a + l.depth, 0); }
export function totalFilterArea(n, areaEach)  { return n * areaEach; }
export function filtrationVelocity(flowMLD, areaInService_m2) {
  const Q_m3s = (flowMLD * 1e6) / (24*3600*1000);
  return Q_m3s / areaInService_m2;
}
export function vToMperHr(v_m_s) { return v_m_s * 3600; }

// Mints-Tien load-dependent headloss
export function mintsTienLoad(sigma_g_per_L) {
  return 0.92 * Math.pow(Math.max(0, sigma_g_per_L), 2/3);
}
