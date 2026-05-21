// lib/validation.js
// Sanity-check layer. A decision-support tool must not silently propagate an
// implausible input into a physically impossible result. These checks flag
// out-of-range inputs and physically impossible derived values so they are
// never presented as merely "high" or "upper end".

export const PHYSICAL_BOUNDS = {
  flow_MLD_min: 0.5,            // a filter plant below this is implausible
  flow_MLD_max: 600,            // a single filter bank above this is implausible
  velocity_mh_typicalMax: 25,   // above typical high-rate granular-media practice
  velocity_mh_physicalMax: 40,  // above this it is not granular-media filtration
  K_typicalMax: 6,              // pragmatic breakthrough cap, kg/m2/run
  K_physicalMax: 15,            // above this K is physically impossible (exceeds pore volume)
};

// severity "error" = result is not usable; "warning" = plausible but verify.
function issue(severity, code, message) { return { severity, code, message }; }

// Validate a {min, avg, max} design-flow envelope.
export function validateFlowEnvelope(designFlow_MLD) {
  const out = [];
  const f = designFlow_MLD || {};
  const { min, avg, max } = f;
  const named = [["minimum", min], ["average", avg], ["maximum", max]];
  for (const [k, v] of named) {
    if (v == null || !isFinite(v) || v <= 0) {
      out.push(issue("error", "flow-nonpositive",
        `Design flow (${k}) is not a valid positive number.`));
    } else if (v > PHYSICAL_BOUNDS.flow_MLD_max) {
      out.push(issue("error", "flow-implausible",
        `Design flow (${k}) is ${Math.round(v).toLocaleString()} ML/d, far outside the ` +
        `plausible range for a filter plant. Check for an input error.`));
    } else if (v < PHYSICAL_BOUNDS.flow_MLD_min) {
      out.push(issue("error", "flow-implausible",
        `Design flow (${k}) is ${v} ML/d, implausibly low for a filter plant.`));
    }
  }
  if (named.every(([, v]) => v != null && isFinite(v) && v > 0)) {
    if (!(min <= avg && avg <= max)) {
      out.push(issue("error", "flow-order",
        `Flow envelope is inconsistent: average (${avg} ML/d) must sit between ` +
        `minimum (${min}) and maximum (${max}).`));
    }
  }
  return out;
}

// Validate derived hydraulic quantities against physical limits.
export function validateDerived({ velocity_mh, K, poreFillK, label = "" }) {
  const out = [];
  const tag = label ? `${label}: ` : "";
  if (velocity_mh != null && isFinite(velocity_mh)) {
    if (velocity_mh > PHYSICAL_BOUNDS.velocity_mh_physicalMax) {
      out.push(issue("error", "velocity-impossible",
        `${tag}filtration velocity ${velocity_mh.toFixed(0)} m/h is physically impossible ` +
        `for granular-media filtration. This indicates an input error, most likely the design flow.`));
    } else if (velocity_mh > PHYSICAL_BOUNDS.velocity_mh_typicalMax) {
      out.push(issue("warning", "velocity-high",
        `${tag}filtration velocity ${velocity_mh.toFixed(1)} m/h is above typical ` +
        `high-rate practice. Verify the design flow and filter area.`));
    }
  }
  if (K != null && isFinite(K)) {
    if (K > PHYSICAL_BOUNDS.K_physicalMax) {
      out.push(issue("error", "K-impossible",
        `${tag}solids holding capacity K = ${K.toFixed(0)} kg/m2/run is physically ` +
        `impossible for granular media. It far exceeds the available pore volume and ` +
        `indicates an input error, not a high-loading design.`));
    } else if (poreFillK != null && K > poreFillK) {
      out.push(issue("warning", "K-above-porefill",
        `${tag}K = ${K.toFixed(2)} kg/m2/run exceeds the bed's pore-fill ceiling of ` +
        `${poreFillK.toFixed(2)} kg/m2/run and is not achievable without breakthrough.`));
    }
  }
  return out;
}

// Worst severity across a list of issues.
export function worstSeverity(issues) {
  if (!issues || !issues.length) return "ok";
  if (issues.some((i) => i.severity === "error")) return "error";
  if (issues.some((i) => i.severity === "warning")) return "warning";
  return "ok";
}

// Classify a K value for benchmark reporting. Returns a band label that is
// honest about physically impossible values rather than calling them "high".
export function classifyK(K, { typicalLow = 2, typicalHigh = 5 } = {}) {
  if (K == null || !isFinite(K)) return { band: "invalid", label: "not a valid number" };
  if (K > PHYSICAL_BOUNDS.K_physicalMax)
    return { band: "impossible", label: "physically impossible — check inputs" };
  if (K > PHYSICAL_BOUNDS.K_typicalMax)
    return { band: "above-cap", label: "above the breakthrough cap" };
  if (K > typicalHigh) return { band: "above-typical", label: "above typical range" };
  if (K < typicalLow) return { band: "below-typical", label: "below typical range" };
  return { band: "typical", label: "within typical range" };
}
