// lib/pdfReport.js
// Builds the governance-grade filter performance assessment as a PDF.
// Structure: decision-grade executive summary, basis and confidence,
// methodology and limitations, Part A intrinsic filter capability, Part B
// whole-of-plant system performance, Part C decision support. The technical
// computation is in reportBuilder.js; the charts in reportCharts.js.

import { buildAllCharts } from "./reportCharts";

const COL = {
  ink: "#0E1116", ink500: "#5B5F66", rust: "#B0451F", ochre: "#C8961A",
  sage: "#5A7359", slate: "#3F5870", rule: "#C8C2B4",
};

const f1 = (v) => v.toFixed(1);
const f2 = (v) => v.toFixed(2);
const f3 = (v) => v.toFixed(3);
const f0 = (v) => v.toFixed(0);
const pct1 = (v) => `${v.toFixed(1)}%`;

// margin cell: green if feasible, red if deficit
const mgn = (v) => ({ text: `${v >= 0 ? "+" : ""}${v.toFixed(2)}`, bold: true,
  color: v >= 0 ? COL.sage : COL.rust });
// head-for-load cell: green if comfortable, ochre if tight, red if near-zero
const hcol = (v) => ({ text: `${v >= 0 ? "+" : ""}${v.toFixed(2)}`, bold: true,
  color: v < 0.2 ? COL.rust : (v < 0.8 ? COL.ochre : COL.sage) });
const bold = (t) => ({ text: String(t), bold: true });
const flag = (t) => ({ text: String(t), bold: true, color: COL.ochre });
// confidence cell colour
const conf = (level) => {
  const l = String(level);
  const c = /high/i.test(l) && !/low/i.test(l) ? COL.sage
    : /low/i.test(l) ? COL.rust : COL.ochre;
  return { text: l, bold: true, color: c };
};

// ---- structural elements ----
const H1 = (n, t, brk) => ([
  { text: `${n}   ${t}`, style: "h1", headlineLevel: 1,
    pageBreak: brk ? "before" : undefined },
  { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: COL.rule }],
    margin: [0, 1, 0, 6] },
]);
const H2 = (t) => ({ text: t, style: "h2" });
const NOTE = (t) => ({ text: t, style: "note" });
const BODY = (t) => ({ text: t, style: "body" });
const BODYB = (t) => ({ text: t, style: "bodyB" });
const CAP = (t) => ({ text: t, style: "caption" });

const partHeader = (letter, title, sub) => ([
  { text: `PART ${letter}`, style: "eyebrow", color: COL.rust, pageBreak: "before",
    margin: [0, 0, 0, 2] },
  { text: title, fontSize: 16, bold: true, color: COL.ink, margin: [0, 0, 0, 2] },
  { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.2, lineColor: COL.ink }],
    margin: [0, 0, 0, 4] },
  { text: sub, style: "note", margin: [0, 0, 0, 8] },
]);

// section table: rows are {section:"..."} or {cells:[label,d1,d2,cmp]}
function sectionTable(rows, widths) {
  const body = [];
  const sectionRows = [];
  rows.forEach((row) => {
    if (row.section) {
      sectionRows.push(body.length);
      body.push([
        { text: row.section, style: "eyebrow", colSpan: widths.length, margin: [0, 5, 0, 2] },
        ...Array(widths.length - 1).fill({}),
      ]);
    } else {
      body.push(row.cells.map((c, ci) => {
        const right = ci > 0;
        if (c && typeof c === "object") {
          return { text: c.text, bold: !!c.bold, color: c.color || COL.ink,
            alignment: right ? "right" : "left", style: "cell" };
        }
        return { text: String(c), alignment: right ? "right" : "left", style: "cell" };
      }));
    }
  });
  return {
    table: { widths, body },
    layout: {
      hLineWidth: (i, node) => {
        if (i === 0 || i === node.table.body.length) return 0;
        return sectionRows.includes(i - 1) ? 0.9 : 0.3;
      },
      hLineColor: (i) => (sectionRows.includes(i - 1) ? COL.ink : COL.rule),
      vLineWidth: () => 0,
      paddingTop: () => 3, paddingBottom: () => 3,
      paddingLeft: () => 4, paddingRight: () => 4,
    },
    margin: [0, 2, 0, 2],
  };
}

// generic grid table with a header row
function gridTable(headers, rows, widths) {
  return {
    table: {
      widths, headerRows: 1,
      body: [
        headers.map((h) => ({ text: h, style: "eyebrow" })),
        ...rows.map((r) => r.map((c) => (c && typeof c === "object")
          ? { text: c.text, bold: !!c.bold, color: c.color || COL.ink, style: "cell" }
          : { text: String(c), style: "cell" })),
      ],
    },
    layout: {
      hLineWidth: (i, node) => (i === 0 ? 0 : (i === 1 ? 0.8 : (i === node.table.body.length ? 0 : 0.3))),
      hLineColor: (i) => (i === 1 ? COL.ink : COL.rule),
      vLineWidth: () => 0,
      paddingTop: () => 4, paddingBottom: () => 4, paddingLeft: () => 4, paddingRight: () => 4,
    },
    margin: [0, 2, 0, 8],
  };
}

// boxed callout
function box(stackContent, accent = COL.ink) {
  return {
    table: { widths: ["*"], body: [[{ stack: stackContent, margin: [9, 8, 9, 8] }]] },
    layout: {
      hLineWidth: () => 0.8, vLineWidth: () => 0.8,
      hLineColor: () => accent, vLineColor: () => accent,
      paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
    },
    margin: [0, 2, 0, 10],
  };
}

function bullet(t, accent = COL.rust, style = "body") {
  return { text: [{ text: "\u2022  ", color: accent }, t], style, margin: [0, 0, 0, 3] };
}

// validation outcome rendering
function validationBlock(model) {
  const v = model.validation;
  if (!v || v.severity === "ok") {
    return { text:
      "Input validation: derived filtration velocities and solids holding capacities have " +
      "been checked against physical limits and fall within plausible ranges for " +
      "granular-media filtration. No implausible inputs were detected.", style: "body" };
  }
  const colr = v.severity === "error" ? COL.rust : COL.ochre;
  return {
    stack: [
      { text: v.severity === "error"
        ? "Input validation: physically impossible values were detected. This assessment is "
          + "not decision-ready until the flagged inputs are corrected."
        : "Input validation: values outside typical ranges were detected. Verify the "
          + "flagged inputs before relying on the result.",
        bold: true, color: colr, fontSize: 9.5, margin: [0, 0, 0, 4] },
      ...v.issues.map((i) => ({
        text: [{ text: "\u2022  ", color: colr }, i.message],
        fontSize: 9, color: COL.ink, margin: [0, 0, 0, 2] })),
    ],
    margin: [0, 0, 0, 6],
  };
}

export function docDefinition(model, charts) {
  const { names: N, modes, lfl, poreFill, filters, kCap } = model;
  const d1 = N.d1, d2 = N.d2;
  const D1 = "D1", D2 = "D2";
  const F1 = filters.D1, F2 = filters.D2;
  const C = modes.coag, S = modes.soft;
  const O = model.opportunityD2;
  const RM = model.removalOpportunityD2;
  const rd1 = model.redundancy.D1, rd2 = model.redundancy.D2;
  const cw1 = model.coldWater.D1, cw2 = model.coldWater.D2;
  const W = [225, 92, 92, 96];
  const ratio = (a, b) => (b ? (a / b).toFixed(2) : "-");
  const layerD = (filt, m) => {
    const l = filt.mediaLayers.find((x) => x.media === m);
    return l ? l.depth : 0;
  };

  const content = [];

  // ===================================================================
  // COVER
  // ===================================================================
  content.push({ text: "FILTER PERFORMANCE ASSESSMENT", style: "title" });
  content.push({ text: `${d1} (RGMF) and ${d2} (DMF), rapid gravity filtration`,
    style: "subtitle", margin: [0, 2, 0, 6] });
  content.push({ canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: COL.ink }],
    margin: [0, 0, 0, 10] });
  const ctrl = [
    ["Document", "Filter performance assessment, independent engineering review"],
    ["Project", "120 ML/d Wyaralong Water Treatment Plant"],
    ["Assessment type", "Independent comparative engineering review for design selection"],
    [`Configuration ${D1}`, d1],
    [`Configuration ${D2}`, d2],
    ["Operating modes assessed", "Coagulation (maximum turbidity) and 100% lime softening"],
    ["Governing flow", "120 ML/d maximum design flow"],
    ["Revision", "A, for client review"],
    ["Status", "Draft, subject to verification actions in Section 16"],
  ];
  if (model.preparedBy) ctrl.push(["Prepared by", model.preparedBy]);
  content.push({
    table: {
      widths: [135, 380],
      body: ctrl.map(([k, v]) => [
        { text: k, style: "eyebrow" }, { text: v, style: "cell" },
      ]),
    },
    layout: {
      hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0 : 0.3),
      hLineColor: () => COL.rule, vLineWidth: () => 0,
      paddingTop: () => 4, paddingBottom: () => 4, paddingLeft: () => 0, paddingRight: () => 4,
    },
    margin: [0, 0, 0, 14],
  });

  // critical assumptions box
  const assumptions = [
    `Governing flow: ${model.flow} ML/d maximum design flow. The assessment is anchored on ` +
      `the maximum design flow; N-1 and N-2 redundancy conditions are evaluated against it.`,
    `Feed TSS to the filter is accepted as documented by the designers: coagulation ` +
      `${f1(C.D1.tss)} mg/L (${D1}) and ${f1(C.D2.tss)} mg/L (${D2}); lime softening ` +
      `${f1(S.D1.tss)} mg/L (${D1}) and ${f1(S.D2.tss)} mg/L (${D2}). The lime-softening ` +
      `difference follows from the two softening strategies: both designers target the ` +
      `same finished-water hardness and CCPP goals, but ${d2} removes magnesium, generating ` +
      `more precipitate. The figures are designer-supplied and consistent with typical ` +
      `softening ranges.`,
    `Coagulant: ferric for ${D1}, alum for ${D2}. Lime-softening precipitate is ` +
      `calcium-carbonate-dominant for ${D1}; for ${D2} it includes a magnesium hydroxide ` +
      `fraction from the magnesium-removal duty, the size of which is to be confirmed ` +
      `(Section 11). The deposit structure factor, and so the head budget, depends on this.`,
    `Clean-bed headloss by Kozeny-Carman with uniformity-coefficient correction, evaluated ` +
      `at the ${model.tempMin} degrees C minimum design water temperature for the source ` +
      `(a South East Queensland basis). Temperature sensitivity is assessed across the 15 ` +
      `to 28 degrees C range expected for the source water; the 21 and 28 degrees C values ` +
      `are indicative and to be confirmed.`,
    `Driving head accepted as documented: ${D1} ${f2(F1.drivingHead_m)} m, ${D2} ` +
      `${f2(F2.drivingHead_m)} m, to be confirmed against the plant hydraulic profile.`,
    `${d2} recycles filter-to-waste to the DAF inlet; ${d1} sends filter-to-waste to waste.`,
    `Designer-supplied data not yet available is listed in Section 16. This assessment is ` +
      `subject to those confirmations.`,
  ];
  content.push(box([
    { text: "CRITICAL ASSUMPTIONS", style: "eyebrow", color: COL.rust, margin: [0, 0, 0, 4] },
    ...assumptions.map((t) => ({
      text: [{ text: "\u2022  ", color: COL.rust }, t],
      fontSize: 8, color: COL.ink, lineHeight: 1.15, margin: [0, 0, 0, 2.5] })),
    { text: "This is a screening and comparative assessment for design review. It " +
      "is subject to the confirmations above and is not a substitute for detailed design, " +
      "pilot validation, or independent clarification modelling.",
      fontSize: 7.5, italics: true, color: COL.ink500, margin: [0, 3, 0, 0] },
  ], COL.ink));

  // ===================================================================
  // EXECUTIVE DECISION SUMMARY (plain-language, precedes the technical §1)
  // ===================================================================
  const dsH = (t) => content.push({ text: t, bold: true, fontSize: 10,
    color: COL.rust, margin: [0, 7, 0, 2] });
  const dsB = (t) => content.push({ text: t, fontSize: 9, color: COL.ink,
    alignment: "justify", lineHeight: 1.2, margin: [0, 0, 0, 4] });
  const dsBb = (t) => content.push({ text: t, bold: true, fontSize: 9, color: COL.ink,
    alignment: "justify", lineHeight: 1.2, margin: [0, 0, 0, 4] });

  content.push({ text: "FOR THE DECISION-MAKER", style: "eyebrow", color: COL.rust,
    pageBreak: "before", margin: [0, 0, 0, 2] });
  content.push({ text: "Executive Decision Summary", fontSize: 17, bold: true,
    color: COL.ink, margin: [0, 0, 0, 3] });
  content.push({ canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.2, lineColor: COL.ink }],
    margin: [0, 0, 0, 4] });
  content.push({ text: "A plain-language decision note for senior readers. The full " +
    "technical assessment, with all supporting figures, begins at Section 1.",
    style: "note", margin: [0, 0, 0, 6] });

  dsH("Decision context");
  dsB(`Two rapid gravity filtration configurations have been proposed for the 120 ML/d ` +
    `plant, one by ${d1} and one by ${d2}. This note summarises an independent engineering ` +
    `comparison of the two, prepared to inform which should be selected. It compares how ` +
    `each configuration performs and how it operates; it does not compare cost.`);

  dsH("The main tradeoff");
  dsBb(`The choice is a genuine tradeoff, not a case of one configuration being better. ` +
    `The ${d1} configuration uses markedly less washwater and loses less water day to day, ` +
    `but operates with less spare hydraulic capacity. The ${d2} configuration has greater ` +
    `hydraulic resilience and absorbs upset conditions more readily, but imposes a ` +
    `substantially larger washwater and recycle burden on the plant.`);

  dsH("What the assessment shows");
  dsB(`Both configurations are hydraulically feasible across the full range of operating ` +
    `conditions assessed, including with filters out of service and at the coldest design ` +
    `water temperature. The ${d2} configuration has the greater spare hydraulic capacity ` +
    `and the greater resilience to upsets such as a deterioration in the water reaching the ` +
    `filters. The ${d1} configuration is the more economical in day-to-day water use, ` +
    `notably in softening operation, where it uses considerably less washwater. That ` +
    `washwater difference arises largely because the two designs soften the water by ` +
    `different routes, not because one filter is inferior to the other.`);

  dsH("What remains uncertain");
  dsB(`Several of the findings depend on inputs that should be confirmed before they are ` +
    `relied upon for selection:`);
  content.push(gridTable(
    ["Finding", "Depends on"],
    [
      [`${d1} uses less washwater`,
       "Its softening route delivering the low solids carryover to the filters assumed in the assessment."],
      [`${d2} has greater hydraulic resilience`,
       "The hydraulic head documented for the plant being available, and the larger washwater recycle being workable in operation."],
      [`${d2} could remove more solids than assumed`,
       "The quality of the material reaching the filters being good enough to be captured efficiently."],
    ],
    [200, 315]
  ));

  dsH("What must be verified before selection");
  dsB(`Four things should be confirmed before this assessment is used to choose a ` +
    `configuration: the plant hydraulic design and the head available to drive flow ` +
    `through the filters; the softening duty assumed for each design; the basis for ` +
    `handling and recycling washwater; and evidence of the filtered-water quality each ` +
    `configuration achieves through a full filter cycle.`);

  dsH("Practical implication for the client");
  dsBb(`This assessment should not be used to select a preferred configuration until the ` +
    `plant hydraulic design, the softening duty, the washwater and recycle basis, and ` +
    `filtered-water quality evidence are confirmed.`);
  dsB(`Once those are in hand, the decision becomes a clear, values-based choice: lower ` +
    `day-to-day water use with the ${d1} configuration, or greater hydraulic resilience ` +
    `with the ${d2} configuration. The sections that follow provide the full technical ` +
    `basis for that choice.`);

  // ===================================================================
  // 1  EXECUTIVE SUMMARY
  // ===================================================================
  content.push(...H1("1", "Executive summary", true));
  content.push(H2("Purpose and basis"));
  content.push(BODY(
    `This report is an independent comparative engineering review of two rapid ` +
    `gravity filter configurations proposed for the 120 ML/d plant: the ${d1} configuration ` +
    `(an eight-cell, four-layer rapid gravity multimedia filter) and the ${d2} configuration ` +
    `(a six-cell dual-media filter with DAF recirculation). The review covers intrinsic ` +
    `filter capability and whole-of-plant system performance across the two operating modes ` +
    `the plant runs: coagulation at maximum turbidity, and 100% lime softening. It is ` +
    `governed by the ${model.flow} ML/d maximum design flow. Confidence levels, dependencies ` +
    `and limitations are stated in Sections 2 and 3.`));
  content.push(H2("Key findings"));
  content.push(BODY(
    `Intrinsic filter capability. On intrinsic hydraulic capability, comprising pore-fill ` +
    `solids holding capacity, clean-bed headloss, redundancy headroom and resilience, the ` +
    `${d2} configuration demonstrates greater capacity and greater hydraulic margin in both ` +
    `operating modes. This finding rests on documented filter geometry and established ` +
    `headloss models and is assessed at high confidence.`));
  content.push(BODY(
    `Washwater performance. On as-built whole-of-plant washwater demand the ${d1} ` +
    `configuration demonstrates the lower demand. This outcome is materially dependent ` +
    `on the lower clarified-water solids loading delivered to the ${d1} filters, ` +
    `particularly under lime softening (${f1(S.D1.tss)} mg/L against ${f1(S.D2.tss)} mg/L). ` +
    `That difference is a designer-supplied consequence of the two softening strategies, ` +
    `not an intrinsic filter-design advantage: both configurations target the same ` +
    `finished-water hardness and CCPP goals, but the ${d2} route removes magnesium and so ` +
    `generates more precipitate, while the ${d1} route is calcium-carbonate-dominant ` +
    `(Section 8).`));
  content.push(BODY(
    `Hydraulic reserve. The ${d1} configuration operates with the lower hydraulic reserve of ` +
    `the two. Its as-built head margin is ${f2(C.D1.margin)} m in coagulation and ` +
    `${f2(S.D1.margin)} m in lime softening. At the governing redundancy condition, N-1 ` +
    `with one filter out of service, and the ${model.tempMin} degrees C minimum design ` +
    `water temperature, its head available for solids load is about ` +
    `${f1(model.coldWater.D1[0].N1.headForLoad)} m, against about ` +
    `${f1(model.coldWater.D2[0].N1.headForLoad)} m for the ${d2} configuration. Both are ` +
    `positive and workable; ${d1} carries the lower reserve of the two, and that warrants ` +
    `confirmation against the plant hydraulic profile.`));
  content.push(BODY(
    `Washwater handling. The ${d2} configuration handles a substantially larger washwater ` +
    `volume, reaching approximately ${f0(S.D2.bw.totalPctFlow)}% of plant flow in lime ` +
    `softening when filter-to-waste is included. While the filter-to-waste stream is ` +
    `recycled to the DAF and is not a net water loss, it is a material recycle, DAF and ` +
    `sludge loading consideration in its own right.`));
  content.push(H2("Critical dependencies"));
  content.push(BODY(
    `These findings are conditional. The ${d1} washwater-performance position depends on the ` +
    `${d1} softening route delivering the calcium-carbonate-dominant carryover assumed. The ` +
    `${d2} resilience position depends on the documented driving head being confirmed. The ` +
    `feasibility of ${d2}'s filter-to-waste recycling depends on acceptable DAF recycle ` +
    `loading. These and other dependencies are set out in Section 12; if a dependency is not ` +
    `met, the associated finding changes.`));
  content.push(BODY(
    `The large lime-softening feed-TSS difference, ${f1(S.D1.tss)} mg/L for ${d1} against ` +
    `${f1(S.D2.tss)} mg/L for ${d2}, is explained rather than open: both designers work to ` +
    `the same finished-water goals, and the difference follows from ${d2}'s magnesium-removal ` +
    `softening duty. The figures are designer-supplied and consistent with typical ranges ` +
    `for softening clarification. The point to confirm is therefore narrower than a feed-TSS ` +
    `verification: that the difference in softening duty is intended and understood, since ` +
    `it carries through to the whole-of-plant comparison.`));
  content.push(H2("Implications"));
  content.push(BODY(
    `Selecting the ${d1} configuration would prioritise lower day-to-day washwater demand under ` +
    `stable clarified-water conditions, while accepting reduced hydraulic reserve and ` +
    `greater operational sensitivity to transient deterioration events. Selecting the ${d2} ` +
    `configuration would prioritise hydraulic robustness and resilience to feed variability, ` +
    `while accepting greater washwater handling, recycle loading and operational complexity. ` +
    `Section 13 sets out a risk-weighted decision framework, and Section 14 the operational ` +
    `and lifecycle implications.`));
  content.push(H2("Recommended next actions"));
  [
    `Confirm the plant hydraulic profile and the actual available driving head for each ` +
      `configuration, including the N-1 condition at the minimum design water temperature.`,
    `Confirm that the difference in softening duty between the configurations, ${d2} ` +
      `removing magnesium and ${d1} not, is intended and understood, and confirm the ` +
      `magnesium hydroxide fraction in the ${d2} softening precipitate.`,
    `Challenge and verify the ${d2} filter's assumed ${model.removalOpportunityD2.asBuiltRemoval}% ` +
      `TSS removal, which appears conservative for the bed depth (Section 14).`,
    `Obtain dirty-bed terminal headloss data across the design temperature range, and ` +
      `backwash, air-scour and bed-expansion data, from each designer.`,
    `Obtain the filter-to-waste duration basis with turbidity recovery curves, and pilot ` +
      `or reference-plant data, before selection.`,
    `Complete the verification actions in Section 16 and re-confirm the comparison before ` +
      `a configuration is selected.`,
  ].forEach((t) => content.push(bullet(t)));
  content.push(H2("Overall position"));
  content.push(box([
    BODYB(
      `Based on the hydraulic head-budget assessment, solids holding capacity analysis and ` +
      `resilience testing undertaken for this review, the ${d2} configuration demonstrates ` +
      `greater hydraulic robustness and resilience under the assessed operating ` +
      `envelopes. The ${d1} configuration demonstrates a lower as-built whole-of-plant ` +
      `washwater demand. That comparative outcome is, however, highly sensitive to the ` +
      `realised ${d1} softening carryover, because that single input materially drives the ` +
      `washwater, run-length and hydraulic-reserve comparisons; if the ${d1} softening route ` +
      `carries more solids forward than documented, the apparent washwater advantage narrows ` +
      `quickly. Neither configuration ` +
      `should be selected or rejected on the basis of this assessment alone. The decision ` +
      `framework in Section 13 sets out how the choice depends on the client's ` +
      `prioritisation, and the verification actions in Section 16 should be completed first.`),
  ], COL.rust));

  // ===================================================================
  // 2  BASIS OF ASSESSMENT AND CONFIDENCE
  // ===================================================================
  content.push(...H1("2", "Basis of assessment and confidence", false));
  content.push(BODY(
    `This assessment is governed by the ${model.flow} ML/d maximum design flow. Filters must ` +
    `be robust at their worst hydraulic condition, so the head budget, filtration velocity ` +
    `and feasibility checks are evaluated at the maximum design flow rather than the ` +
    `average. The N-1 and N-2 redundancy conditions and a water-temperature sensitivity are ` +
    `evaluated against the same flow (Section 7).`));
  content.push(validationBlock(model));
  content.push(H2("Confidence in the assessment findings"));
  content.push(NOTE("Confidence reflects the quality and independence of the data " +
    "underpinning each finding. Findings drawn from documented geometry and established " +
    "models carry high confidence; findings dependent on un-verified upstream assumptions " +
    "carry lower confidence."));
  content.push(gridTable(
    ["Finding area", "Confidence", "Basis for the rating"],
    [
      ["Intrinsic hydraulic comparison", conf("High"),
       "Documented filter geometry and established clean-bed and dirty-bed models."],
      ["Relative solids holding capacity", conf("High"),
       "Documented media depths and grading; capacity benchmarks from literature."],
      ["Redundancy and temperature robustness", conf("High"),
       "Derived from documented geometry; driving head still to be confirmed."],
      ["Coagulation feed assumptions", conf("Medium"),
       "Feed TSS accepted as submitted; similar between the two configurations."],
      ["Lime-softening feed assumptions", conf("Medium"),
       "Feed-TSS difference explained by the two softening duties; designer-supplied and within typical ranges."],
      ["Whole-of-plant washwater performance", conf("Medium"),
       "Depends on feed TSS and run-length assumptions, and on FTW handling philosophy."],
      ["Long-term fouling and media resilience", conf("Medium"),
       "No pilot or physical media-testing data available to this review."],
    ],
    [148, 78, 289]
  ));
  content.push(NOTE("The confidence ratings above are the reviewing engineer's judgement " +
    "and are to be confirmed by the report author prior to issue."));

  // ===================================================================
  // 3  METHODOLOGY AND LIMITATIONS
  // ===================================================================
  content.push(...H1("3", "Assessment methodology and limitations", false));
  content.push(H2("Methodology"));
  content.push(BODY(
    `The assessment applies a hydraulic head-budget method. For each configuration and ` +
    `operating point the terminal headloss required to deliver the design run is built up ` +
    `from clean-bed headloss, underdrain headloss, solids-load headloss and appurtenance ` +
    `losses, and compared against the available driving head. A positive margin indicates ` +
    `hydraulic feasibility; the size of the margin indicates hydraulic reserve.`));
  content.push(BODY(
    `Clean-bed headloss is computed by the Kozeny-Carman equation with the Cleasby-Logsdon ` +
    `uniformity-coefficient correction, at the ${model.tempMin} degrees C minimum design ` +
    `water temperature, with a sensitivity across the 15 to 28 degrees C range expected for ` +
    `the source water. Solids-load headloss is computed by the Mints-Tien differential ` +
    `model; the effective specific deposit is adjusted for the precipitate type through a ` +
    `deposit structure factor (defined in Section 8). Solids holding capacity K is ` +
    `back-calculated from the documented backwash frequency and benchmarked against the ` +
    `bed's theoretical pore-fill ceiling, the Kawamura range, the ` +
    `AWWA M37 and Cleasby-Logsdon typical range, and a pragmatic breakthrough cap of ` +
    `${f1(kCap)} kg/m2/run. That ${f1(kCap)} kg/m2/run value is used here as a ` +
    `screening-level operational ceiling consistent with conventional rapid gravity ` +
    `filtration practice, rather than as a universal physical limit; the achievable figure ` +
    `for a specific bed and floc should be confirmed by pilot or reference-plant data. ` +
    `Redundancy is assessed at N, N-1 and N-2 filters in service at ` +
    `the maximum design flow. Resilience is assessed by a 100% feed-solids deterioration ` +
    `sensitivity. A validation layer checks derived velocities and K values against physical ` +
    `limits.`));
  content.push(H2("Scope of this assessment"));
  content.push(BODY(
    `In scope: the two filter configurations as documented in the designer process ` +
    `calculations, comprising filter geometry and media, the hydraulic head budget, ` +
    `backwash and washwater balance, redundancy, and resilience to feed deterioration. Not ` +
    `in scope: clarifier and upstream process design, the detailed plant hydraulic profile, ` +
    `structural, mechanical and electrical design, and capital and lifecycle cost ` +
    `estimation. Feed TSS to each filter is accepted as submitted by the designers and is ` +
    `not independently modelled.`));
  content.push(H2("Limitations of assessment"));
  content.push(NOTE("The following limitations apply and should be read with every finding " +
    "in this report."));
  [
    "No pilot-plant validation has been undertaken or reviewed.",
    "The assessment relies on data submitted by the designers; proprietary designer " +
      "assumptions are not independently accessible in full.",
    "No computational fluid dynamics verification of the filter or underdrain hydraulics " +
      "has been performed.",
    "No physical media testing, grading verification or media-expansion testing has been " +
      "performed.",
    "No independent clarification or lime-softening modelling has been performed; the feed " +
      "TSS to each filter is accepted as submitted.",
    "The clean-bed and dirty-bed models are screening-level; dirty-bed terminal headloss " +
      "has not been independently measured.",
    "Driving head is accepted as documented and has not been verified against an as-built " +
      "or detailed-design hydraulic profile.",
  ].forEach((t) => content.push(bullet(t)));
  content.push(H2("Governing references"));
  [
    "Cleasby, J.L. and Logsdon, G.S. (1999). Granular Bed and Precoat Filtration. In Water " +
      "Quality and Treatment, 5th edition, AWWA and McGraw-Hill.",
    "Kawamura, S. (2000). Integrated Design and Operation of Water Treatment Facilities, " +
      "2nd edition, John Wiley and Sons.",
    "AWWA Manual M37, Operational Control of Coagulation and Filtration Processes.",
    "Mints, D.M. (1966). Modern theory of filtration. International Water Supply Congress, " +
      "Barcelona.",
  ].forEach((t) => content.push(bullet(t, COL.rust, "foot")));

  // ===================================================================
  // PART A — INTRINSIC FILTER CAPABILITY
  // ===================================================================
  content.push(...partHeader("A", "Intrinsic filter capability",
    "The sections in Part A assess each filter on its own engineering merit, independent " +
    "of upstream feed assumptions. They describe what each bed can do hydraulically."));

  // ---- 4  Filter design ----
  content.push(...H1("4", "Filter design and configuration", false));
  content.push(NOTE("Both configurations as documented in the designer process " +
    "calculations. Filter geometry and media are common to both operating modes."));
  content.push(sectionTable([
    { section: "Configuration" },
    { cells: ["Filter type", "RGMF, 4-layer multimedia", "DMF, dual-media", ""] },
    { cells: ["Number of filters", String(F1.numFilters), String(F2.numFilters),
      `${D1} ${ratio(F1.numFilters, F2.numFilters)}x`] },
    { cells: ["Area per filter (m2)", f1(F1.areaPerFilter_m2), f1(F2.areaPerFilter_m2),
      `${D2} ${ratio(F2.areaPerFilter_m2, F1.areaPerFilter_m2)}x`] },
    { cells: ["Total filter area (m2)", f1(F1.numFilters * F1.areaPerFilter_m2),
      f1(F2.numFilters * F2.areaPerFilter_m2),
      `${D2} ${ratio(F2.numFilters * F2.areaPerFilter_m2, F1.numFilters * F1.areaPerFilter_m2)}x`] },
    { section: "Media stack" },
    { cells: ["Anthracite depth (m)", f2(layerD(F1, "anthracite")), f2(layerD(F2, "anthracite")),
      `${D2} ${ratio(layerD(F2, "anthracite"), layerD(F1, "anthracite"))}x`] },
    { cells: ["Sand depth (m)", f2(layerD(F1, "sand")), f2(layerD(F2, "sand")),
      `${D2} ${ratio(layerD(F2, "sand"), layerD(F1, "sand"))}x`] },
    { cells: ["Total bed depth (m)",
      f3(F1.mediaLayers.reduce((a, l) => a + l.depth, 0)),
      f2(F2.mediaLayers.reduce((a, l) => a + l.depth, 0)), ""] },
    { section: "Hydraulics" },
    { cells: ["Driving head (m)", f2(F1.drivingHead_m), f2(F2.drivingHead_m),
      `${D2} ${ratio(F2.drivingHead_m, F1.drivingHead_m)}x`] },
    { cells: ["Appurtenance loss (m)", f2(F1.appurtenanceLoss_m), f2(F2.appurtenanceLoss_m), "equal"] },
  ], W));
  content.push(BODY(
    `The ${d2} configuration provides materially greater media depth and total filtration ` +
    `volume. The bed is deeper, the anthracite layer is 40% deeper, and the anthracite grain ` +
    `is coarser. The ${d1} configuration spreads the duty across more cells, ` +
    `${F1.numFilters} against ${F2.numFilters}, which is relevant to its redundancy ` +
    `behaviour in Section 7.`));
  content.push(H2("Media grading"));
  content.push(NOTE("Effective size, uniformity coefficient and density govern clean-bed " +
    "headloss and backwash behaviour. Values as documented by the designers."));
  const MED_DENS = { anthracite: 1600, sand: 2650, garnet: 4100, gac: 1450 };
  const mediaRows = [];
  const layerName = (m) => ({ anthracite: "Anthracite", sand: "Silica sand",
    garnet: "Garnet", gac: "GAC" }[m] || m);
  [["D1", d1, F1], ["D2", d2, F2]].forEach(([tag, name, filt]) => {
    filt.mediaLayers.forEach((l, i) => {
      const isSupport = l.media === "garnet" && (l.d_mm || 0) >= 1.5;
      mediaRows.push([
        i === 0 ? `${tag}  ${name}` : "",
        layerName(l.media) + (isSupport ? " (support)" : ""),
        f2(l.depth), f2(l.d_mm), f2(l.uc),
        String(MED_DENS[l.media] || "-"),
      ]);
    });
  });
  content.push(gridTable(
    ["Configuration", "Layer", "Depth (m)", "Effective size (mm)", "UC", "Density (kg/m3)"],
    mediaRows,
    [120, 110, 62, 95, 50, 78]
  ));
  content.push(H2("Multimedia configuration: four-layer against dual-media"));
  content.push(BODY(
    `The two configurations adopt different media philosophies. The ${d2} configuration is a ` +
    `conventional dual-media bed, coarse anthracite over finer sand, with a single media ` +
    `interface. The ${d1} configuration is a four-layer multimedia bed, anthracite over ` +
    `sand over garnet over a coarse garnet support, with three interfaces. Where properly ` +
    `designed and controlled, a graded multimedia bed can improve depth filtration and ` +
    `delay surface blinding relative to a conventional dual-media bed, making fuller use of ` +
    `the bed depth. That benefit, however, is obtained at the cost of operational ` +
    `sensitivity: each additional interface adds a place where the grading can be disturbed.`));
  content.push(BODY(
    `Each medium fluidises at a different backwash rate, so a four-layer bed has a narrower ` +
    `backwash-rate window within which all layers expand without intermixing. Imperfect ` +
    `restratification blurs the interfaces over time, raising clean-bed headloss, increasing ` +
    `mudball susceptibility and reducing filtrate quality. The ${d1} four-layer bed is ` +
    `therefore more sensitive to backwash control and operator practice than the ${d2} ` +
    `dual-media bed, and carries a higher long-term media-stability risk. This is a ` +
    `recognised characteristic of multimedia beds rather than a disqualifying feature, but ` +
    `the backwash and air-scour regime, bed expansion and restratification behaviour of the ` +
    `four-layer stack should be confirmed (Section 15).`));
  content.push(H2("Media interface behaviour and long-term performance"));
  content.push(BODY(
    `Because the four-layer arrangement turns on how its media interfaces behave over the ` +
    `plant life, it is worth setting out plainly why those interfaces matter. Multimedia ` +
    `filtration is graded by design. The bed is built coarse at the top and progressively ` +
    `finer with depth, so that water passes through steadily smaller pore spaces as it ` +
    `descends. The intent is to filter in depth rather than at the surface: the coarse ` +
    `upper anthracite removes the bulk of the solids without quickly blinding over, while ` +
    `the finer media below polish the water. A well-graded multimedia bed therefore makes ` +
    `fuller use of its depth and can run longer between washes than a bed that captures ` +
    `everything in its top layer. The progressively finer structure is the source of the ` +
    `benefit.`));
  content.push(BODY(
    `That same structure creates media interfaces, the zones where one medium meets the ` +
    `next and the pore size steps down. Particle capture and hydraulic behaviour change ` +
    `relatively abruptly across an interface, and solids tend to accumulate there. ` +
    `Particles that have travelled freely through the larger pores above arrive at the ` +
    `smaller pore throats below, where interception and deposition increase. Local flow ` +
    `then redistributes around the developing deposit, and because coagulated and ` +
    `softening flocs are compressible, they can consolidate and concentrate further in ` +
    `these transition zones. An interface is, in effect, a secondary filtration front ` +
    `within the bed.`));
  content.push(BODY(
    `Interfaces are maintained by backwashing. When the bed is fluidised and then allowed ` +
    `to settle, the media should restratify cleanly back into their layers, because each ` +
    `medium has a different size and density. If restratification is imperfect, repeated ` +
    `wash cycles can gradually blur an interface or create a mixed transition zone where ` +
    `the media intermingle. The sand-to-garnet interface in the ${d1} four-layer bed is ` +
    `the most sensitive in this respect: garnet is considerably denser than sand, so the ` +
    `two respond very differently to a given wash rate, and garnet expands only modestly ` +
    `during backwash. Achieving enough expansion to clean the lower bed without drawing ` +
    `sand down into the garnet is a comparatively narrow operating window.`));
  content.push(BODY(
    `The consequence of imperfect interface management is not sudden failure; it is gradual ` +
    `degradation over many operating cycles. The symptoms appear slowly: clean-bed headloss ` +
    `creeps upward, filter runs shorten, filtration becomes less even across the bed, ` +
    `mudballs may form, and ripening after backwash becomes less reliable. Effective air ` +
    `scour materially reduces this risk, by improving lower-bed cleaning and breaking up ` +
    `incipient deposits, but it does not remove the underlying need to manage the ` +
    `interfaces over the life of the plant. Because a multimedia bed contains more ` +
    `interfaces than a dual-media bed, it is generally less forgiving operationally and ` +
    `depends more heavily on consistent, well-controlled backwashing.`));
  content.push(BODYB(
    `These are recognised characteristics of multimedia filtration, not defects. Multimedia ` +
    `beds are widely and successfully used, and a well-designed installation performs very ` +
    `effectively where the media grading, underdrain system, air scour, wash sequencing and ` +
    `any collapse-pulse strategy are properly designed and consistently operated. The ` +
    `engineering requirement is therefore one of demonstration rather than doubt: the ${d1} ` +
    `four-layer configuration should be supported by evidence that its interfaces ` +
    `restratify reliably and that clean-bed performance remains stable over the long term, ` +
    `drawn from pilot data, comparable reference-plant experience, or commissioning ` +
    `verification. The ${d2} dual-media bed, with a single interface, carries less of this ` +
    `long-term management burden.`));

  // ---- 5  Solids holding capacity ----
  content.push(...H1("5", "Solids holding capacity", false));
  content.push(NOTE("Filter capacity K is the dry solids retained per m2 of filter area per " +
    "run. The measures below are properties of the filter bed and apply in both operating " +
    "modes."));
  content.push(sectionTable([
    { section: "Capacity measure (kg/m2/run)" },
    { cells: ["Theoretical pore-fill ceiling (anthracite 7.0, sand 1.0 kg/m3)",
      bold(f2(poreFill.D1)), bold(f2(poreFill.D2)), `${D2} ${ratio(poreFill.D2, poreFill.D1)}x`] },
    { cells: ["Kawamura range (1.0 to 1.5x anthracite depth)",
      `${f2(layerD(F1, "anthracite"))} to ${f2(layerD(F1, "anthracite") * 1.5)}`,
      `${f2(layerD(F2, "anthracite"))} to ${f2(layerD(F2, "anthracite") * 1.5)}`, ""] },
    { cells: ["AWWA M37 and Cleasby-Logsdon typical", "2.0 to 5.0", "2.0 to 5.0", "same range"] },
    { cells: ["Pragmatic breakthrough cap", f1(kCap), f1(kCap), "equal"] },
  ], W));
  content.push({ image: charts.capacity, width: 470, alignment: "center", margin: [0, 8, 0, 2] });
  content.push(CAP(`Figure 1. Solids holding capacity by measure. The ${d2} configuration ` +
    `carries more capacity on every depth-dependent measure.`));
  content.push(BODY(
    `On every depth-dependent measure the ${d2} configuration carries more capacity per unit ` +
    `area, owing to its deeper anthracite. The theoretical pore-fill ceiling states the ` +
    `difference plainly: ${f1(poreFill.D1)} kg/m2/run for ${d1} and ${f1(poreFill.D2)} for ` +
    `${d2}. Both configurations sit within or just above the AWWA and Cleasby-Logsdon ` +
    `literature band of 2 to 5 kg/m2/run, and neither relies on an implausible loading.`));
  content.push(NOTE("The pore-fill ceiling is a theoretical maximum, not an operationally " +
    "demonstrated capacity. The achievable fraction of it depends on floc compressibility, " +
    "the deposition profile through the bed, media shape and stratification, and backwash " +
    "effectiveness, and should be confirmed by pilot or reference-plant data. It is used " +
    "here as a comparative upper bound, not as a design loading."));

  // ---- 6  Hydraulic head budget ----
  content.push(...H1("6", "Hydraulic head budget, like-for-like", false));
  content.push(NOTE("Both filters at a common 20 mg/L feed, 95% removal, 24 h run. This " +
    "isolates intrinsic filter-design performance from the upstream feed differences. The " +
    "two modes differ only in the precipitate chemistry."));
  const lflBlock = (label, a1, a2) => ([
    { section: label },
    { cells: ["Clean-bed headloss (m)", f3(a1.cb), f3(a2.cb), ""] },
    { cells: ["Solids-load headloss (m)", f3(a1.load), f3(a2.load), ""] },
    { cells: ["Total headloss required (m)", bold(f2(a1.totalDH)), bold(f2(a2.totalDH)), ""] },
    { cells: ["Margin against available head (m)", mgn(a1.margin), mgn(a2.margin), ""] },
  ]);
  content.push(sectionTable([
    ...lflBlock("Coagulation chemistry, common 20 mg/L feed", lfl.coag.D1, lfl.coag.D2),
    ...lflBlock("Lime softening chemistry, common 20 mg/L feed", lfl.soft.D1, lfl.soft.D2),
  ], W));
  content.push(BODY(
    `At an identical feed the ${d2} configuration retains more head margin than ${d1} in ` +
    `both chemistries. The difference arises from ${d2}'s larger total area, which lowers ` +
    `the filtration velocity, and its larger driving head. The ${d1} configuration is ` +
    `tighter under coagulation chemistry (${f2(lfl.coag.D1.margin)} m) than under lime ` +
    `softening (${f2(lfl.soft.D1.margin)} m), because ferric's deposit structure factor ` +
    `(${f2(C.D1.kmult)}) is lower than the lime-softening precipitate's (${f2(S.D1.kmult)}), ` +
    `which raises the solids-load headloss. Held at an equal feed, the ${d2} configuration ` +
    `provides the greater intrinsic hydraulic capacity.`));

  // ---- 7  Redundancy and temperature robustness ----
  content.push(...H1("7", "Redundancy and temperature robustness", false));
  content.push(NOTE("The governing intrinsic robustness check. With filters out of service " +
    "or at colder water, filtration velocity and clean-bed headloss rise and the head left " +
    "for solids load shrinks. All cases are at the maximum design flow."));
  const rget = (rd, key) => rd.find((x) => x.key === key) || {};
  content.push(sectionTable([
    { section: `Hydraulic headroom at ${model.flow} ML/d and ${model.tempMin} degrees C, by redundancy condition` },
    { cells: ["Filtration velocity, N all in service (m/h)",
      f2(rget(rd1, "N").v_mh), f2(rget(rd2, "N").v_mh), ""] },
    { cells: ["Filtration velocity, N-1 one offline (m/h)",
      f2(rget(rd1, "N-1").v_mh), f2(rget(rd2, "N-1").v_mh), ""] },
    { cells: ["Filtration velocity, N-2 offline plus backwash (m/h)",
      f2(rget(rd1, "N-2").v_mh), f2(rget(rd2, "N-2").v_mh), ""] },
    { cells: ["Head for solids load, N (m)",
      hcol(rget(rd1, "N").headForLoad), hcol(rget(rd2, "N").headForLoad), ""] },
    { cells: ["Head for solids load, N-1 (m)",
      hcol(rget(rd1, "N-1").headForLoad), hcol(rget(rd2, "N-1").headForLoad), ""] },
    { cells: ["Head for solids load, N-2 (m)",
      hcol(rget(rd1, "N-2").headForLoad), hcol(rget(rd2, "N-2").headForLoad), ""] },
  ], W));
  content.push(BODY(
    `At the maximum design flow and the ${model.tempMin} degrees C minimum design water ` +
    `temperature, with all filters in service, both configurations have adequate hydraulic ` +
    `headroom. With filters out of service the head left for solids load reduces. The ` +
    `governing redundancy condition is N-1, one filter out of service, because this is a ` +
    `sustained state the plant can hold for hours or days while maintenance is carried out. ` +
    `At N-1 the ${d1} configuration retains ${f2(rget(rd1, "N-1").headForLoad)} m of head ` +
    `for the solids load and the ${d2} configuration ${f2(rget(rd2, "N-1").headForLoad)} m; ` +
    `both are comfortable, with ${d1} carrying the lower of the two reserves.`));
  content.push(BODY(
    `The N-2 condition, one filter out of service with a second briefly in backwash, is a ` +
    `short and schedulable transient rather than a sustained state: a backwash lasts only ` +
    `tens of minutes and can be staggered to avoid coinciding with a filter being offline. ` +
    `It is reported here as a transient check, not as the design-governing case. At N-2 the ` +
    `${d1} configuration retains ${f2(rget(rd1, "N-2").headForLoad)} m and the ${d2} ` +
    `configuration ${f2(rget(rd2, "N-2").headForLoad)} m; both remain positive, so the ` +
    `plant rides through the transient, with ${d1} again the tighter of the two.`));
  content.push(BODY(
    `Filtration velocity rises as filters are taken out of service. At the governing N-1 ` +
    `condition the sustained velocities are approximately ${f1(rget(rd1, "N-1").v_mh)} m/h ` +
    `for ${d1} and ${f1(rget(rd2, "N-1").v_mh)} m/h for ${d2}, within normal practice for ` +
    `rapid gravity filtration. The brief N-2 transient reaches approximately ` +
    `${f1(rget(rd1, "N-2").v_mh)} m/h, in the upper practical range; sustained operation at ` +
    `that rate would reduce the margin against floc breakthrough and terminal headloss, ` +
    `particularly under lime-softening duty, but as a short transient it is manageable. ` +
    `Both configurations operate well below these velocities with all filters in service.`));
  content.push(sectionTable([
    { section: "Clean-bed headloss sensitivity to water temperature, N at maximum design flow" },
    { cells: [`Clean-bed headloss at ${cw1[0].temp_C} degrees C, minimum design (m)`,
      f3(cw1[0].N.cb), f3(cw2[0].N.cb), ""] },
    { cells: [`Clean-bed headloss at ${cw1[1].temp_C} degrees C, indicative mean (m)`,
      f3(cw1[1].N.cb), f3(cw2[1].N.cb), ""] },
    { cells: [`Clean-bed headloss at ${cw1[2].temp_C} degrees C, indicative summer (m)`,
      f3(cw1[2].N.cb), f3(cw2[2].N.cb), ""] },
    { cells: [`Head for solids load at ${cw1[0].temp_C} degrees C, N (m)`,
      hcol(cw1[0].N.headForLoad), hcol(cw2[0].N.headForLoad), ""] },
    { cells: [`Head for solids load at ${cw1[0].temp_C} degrees C, N-1 (m)`,
      hcol(cw1[0].N1.headForLoad), hcol(cw2[0].N1.headForLoad), ""] },
  ], W));
  content.push(BODY(
    `Clean-bed headloss rises with water viscosity, so colder water increases it. The ` +
    `assessment is anchored on the ${model.tempMin} degrees C minimum design water ` +
    `temperature, a conservative South East Queensland basis; the source water is not ` +
    `expected to fall below this, and at warmer temperatures the head budget improves. ` +
    `The governing case is therefore the ${model.tempMin} degrees C minimum at the N-1 ` +
    `condition. There the ${d1} configuration retains ` +
    `${f2(cw1[0].N1.headForLoad)} m of head for the solids load and the ${d2} ` +
    `configuration ${f2(cw2[0].N1.headForLoad)} m; both are positive and workable, with ` +
    `${d1} the lower of the two. As the water warms to the ${cw1[2].temp_C} degrees C ` +
    `indicative summer value the ${d1} N-1 figure rises to ${f2(cw1[2].N1.headForLoad)} m. ` +
    `The ${d1} configuration therefore carries the lower temperature-and-redundancy ` +
    `reserve, but it remains hydraulically feasible across the design temperature range at ` +
    `the governing N-1 condition; the driving head and the minimum design water ` +
    `temperature should still be confirmed.`));

  // ===================================================================
  // PART B — WHOLE-OF-PLANT SYSTEM PERFORMANCE
  // ===================================================================
  content.push(...partHeader("B", "Whole-of-plant system performance",
    "The sections in Part B assess how each configuration performs in service. These " +
    "outcomes depend on upstream clarification, operating strategy and washwater " +
    "philosophy, not on filter design alone."));

  // ---- 8  Feed conditions ----
  content.push(...H1("8", "Feed conditions and chemistry", false));
  content.push(NOTE("Feed TSS delivered to the filter and the precipitate chemistry, for " +
    "each operating mode, accepted as documented by the designers."));
  content.push(sectionTable([
    { section: "Coagulation (maximum turbidity)" },
    { cells: ["Feed TSS to filter (mg/L)", bold(f1(C.D1.tss)), bold(f1(C.D2.tss)),
      `${D1} ${ratio(C.D1.tss, C.D2.tss)}x`] },
    { cells: ["Coagulant", "Ferric", "Alum", ""] },
    { cells: ["Deposit structure factor", f2(C.D1.kmult), f2(C.D2.kmult), ""] },
    { cells: ["TSS removal efficiency (%)", f0(C.D1.removal), f0(C.D2.removal), ""] },
    { cells: ["Designer run length (h)", bold(f0(C.D1.runHours)), bold(f0(C.D2.runHours)), ""] },
    { section: "100% lime softening at pH 10" },
    { cells: ["Feed TSS to filter (mg/L)", bold(f1(S.D1.tss)), bold(f1(S.D2.tss)),
      `${D2} ${ratio(S.D2.tss, S.D1.tss)}x`] },
    { cells: ["Precipitate", "CaCO3-dominant", "CaCO3 with Mg(OH)2", ""] },
    { cells: ["Deposit structure factor", f2(S.D1.kmult), f2(S.D2.kmult), "equal"] },
    { cells: ["TSS removal efficiency (%)", f0(S.D1.removal), f0(S.D2.removal), ""] },
    { cells: ["Designer run length (h)", bold(f0(S.D1.runHours)), bold(f0(S.D2.runHours)), ""] },
  ], W));
  content.push(BODY(
    `In coagulation the two filters see similar feed TSS but different coagulants. The ` +
    `deposit structure factor used in this assessment scales how favourable a precipitate's ` +
    `deposit structure is for headloss: it is distinct from the solids holding capacity K, ` +
    `and a higher factor means less headloss for the same captured mass. On that scale alum ` +
    `(${f2(C.D2.kmult)}) is the more headloss-prone coagulant and ferric (${f2(C.D1.kmult)}) ` +
    `the less, with the lime-softening precipitate (${f2(S.D1.kmult)}) the most favourable ` +
    `of the three. In lime softening the feed TSS diverges sharply: ${d1} receives ` +
    `${f1(S.D1.tss)} mg/L and ${d2} receives ${f1(S.D2.tss)} mg/L, a factor of ` +
    `${ratio(S.D2.tss, S.D1.tss)} higher. This difference is explained by the two softening ` +
    `strategies. Both designers work to the same finished-water goals, total hardness and a ` +
    `calcium carbonate precipitation potential target, but the ${d2} configuration meets the ` +
    `hardness goal by removing magnesium. Magnesium removal requires softening at higher pH ` +
    `and generates additional precipitate, including magnesium hydroxide, so more solids are ` +
    `carried to the ${d2} filters. The ${d1} route is calcium-carbonate-dominant without the ` +
    `magnesium-removal step, and carries fewer solids forward. The two feed-TSS figures are ` +
    `designer-supplied and consistent with typical ranges for softening clarification; the ` +
    `difference is a consequence of the chosen softening duties, not an unexplained ` +
    `clarifier-performance gap. The coagulant choice contributes a secondary effect, since ` +
    `ferric operates at lower pH and consumes more alkalinity, which reduces the lime ` +
    `demand; the coagulation and softening chemistry trade-off is noted here but is outside ` +
    `the scope of this filter assessment. What should be confirmed is simply that this ` +
    `difference in softening duty is intended and understood, since it carries through to ` +
    `the whole-of-plant comparison in Part B.`));
  content.push(BODY(
    `Because the ${d2} configuration removes magnesium, its lime-softening precipitate is ` +
    `not purely calcium-carbonate-dominant: it carries a magnesium hydroxide fraction, the ` +
    `least favourable precipitate for headloss. The deposit structure factor used for the ` +
    `${d2} softening head budget (${f2(S.D2.kmult)}) reflects a small assumed magnesium ` +
    `hydroxide content. The actual fraction is uncertain and could be materially higher; ` +
    `its effect on the ${d2} softening head budget is examined as a sensitivity in ` +
    `Section 11.`));
  content.push(BODY(
    `One further assumption warrants challenge. The ${d2} filter is credited with ` +
    `${f0(S.D2.removal)}% TSS removal in lime softening, against ${f0(S.D1.removal)}% for ` +
    `${d1}. For a ${f2(F2.mediaLayers.reduce((a, l) => a + l.depth, 0))} m dual-media bed ` +
    `with ${f2(layerD(F2, "anthracite"))} m of anthracite, run at a filtration velocity of ` +
    `${f1(S.D2.v_mh)} m/h, ${f0(S.D2.removal)}% is a conservative figure: a bed of that ` +
    `depth would typically be expected to achieve 95% or better on a well-formed floc. The ` +
    `${f0(S.D2.removal)}% value is most likely a conservative design assumption rather than ` +
    `a capability limit of the bed. Section 14 quantifies the implications of correcting it.`));
  content.push(BODY(
    `A general qualification applies to all of the feed assumptions above. The performance ` +
    `of both configurations, and particularly the deeper ${d2} bed, remains strongly ` +
    `dependent on upstream floc structure and settleability. A deep bed delivers its ` +
    `advantage by distributing the captured solids through the bed depth: this delays ` +
    `surface blinding and extends the run, but only where the floc is well-formed and ` +
    `robust, so that it is intercepted progressively within the upper and middle media. ` +
    `Where the floc is poorly formed or shear-sensitive, the mechanism works against the ` +
    `bed: the solids penetrate too deeply, the lower media foul, the bed becomes harder to ` +
    `clean by backwash, and runs shorten rather than lengthen. The deeper ${d2} bed ` +
    `therefore carries a real hydraulic advantage, but one that is conditional on floc ` +
    `quality: the additional depth is a benefit with good floc and a liability with poor ` +
    `floc. This is a further reason the upstream coagulation and softening basis should be ` +
    `confirmed alongside the feed TSS figures.`));

  // ---- 9  As-built operating point ----
  content.push(...H1("9", "As-built operating point", false));
  content.push(NOTE("Each configuration at its own documented feed TSS, run length and " +
    "chemistry, for both operating modes."));
  const abBlock = (label, a1, a2) => ([
    { section: label },
    { cells: ["Feed TSS (mg/L)", f1(a1.tss), f1(a2.tss), ""] },
    { cells: ["Run length (h)", f0(a1.runHours), f0(a2.runHours), ""] },
    { cells: ["K at design run (kg/m2/run)", bold(f2(a1.K)), bold(f2(a2.K)), ""] },
    { cells: ["K utilisation vs theoretical pore-fill ceiling (%)",
      f0((a1.K / a1.poreFill) * 100), f0((a2.K / a2.poreFill) * 100), ""] },
    { cells: ["Total headloss required (m)", f2(a1.totalDH), f2(a2.totalDH), ""] },
    { cells: ["Margin against available head (m)", mgn(a1.margin), mgn(a2.margin), ""] },
  ]);
  content.push(sectionTable([
    ...abBlock("Coagulation (maximum turbidity)", C.D1, C.D2),
    ...abBlock("100% lime softening", S.D1, S.D2),
  ], W));
  content.push({ image: charts.headBudget, width: 470, alignment: "center", margin: [0, 8, 0, 2] });
  content.push(CAP("Figure 2. As-built head budget, both modes. Stacked components, " +
    "appurtenances at the base, against the available driving head line."));
  content.push(BODY(
    `The ${d2} configuration is feasible with comfortable margin in both modes, ` +
    `${f2(C.D2.margin)} m in coagulation and ${f2(S.D2.margin)} m in lime softening. The ` +
    `${d1} configuration is feasible but operates with limited reserve in both, ` +
    `${f2(C.D1.margin)} m in coagulation and ${f2(S.D1.margin)} m in lime softening. ` +
    `${d1}'s coagulation point is the tightest of the four cases: its feed TSS is close to ` +
    `its lime-softening value, but ferric's lower deposit structure factor raises the solids-load ` +
    `headloss. A positive margin confirms feasibility; it does not by itself indicate ` +
    `hydraulic reserve, which is assessed in Section 11.`));

  // ---- 10  Backwash and washwater ----
  content.push(...H1("10", "Backwash and washwater balance", false));
  content.push(NOTE("Dump water, filter backwash water and filter-to-waste, at the maximum " +
    "design flow. D1 sends filter-to-waste to waste; D2 recycles it to the DAF inlet, so " +
    "D2's net water loss is lower than its total water handled."));
  const wcol = (p, hi, mid) => ({ text: pct1(p), bold: true,
    color: p < mid ? COL.sage : (p < hi ? COL.ochre : COL.rust) });
  const bwBlock = (label, a1, a2) => ([
    { section: label },
    { cells: ["Run length (h)", f0(a1.runHours), f0(a2.runHours), ""] },
    { cells: ["Dump + backwash water per cycle (m3)", f0(a1.bw.perCycle), f0(a2.bw.perCycle), ""] },
    { cells: ["Filter-to-waste per cycle (m3)", f0(a1.bw.ftwPerCycle), f0(a2.bw.ftwPerCycle), ""] },
    { cells: ["Dump + backwash water (% of plant flow)",
      wcol(a1.bw.pctFlow, 8, 5), wcol(a2.bw.pctFlow, 8, 5), ""] },
    { cells: ["Filter-to-waste (% of plant flow)",
      wcol(a1.bw.ftwPctFlow, 8, 5), wcol(a2.bw.ftwPctFlow, 8, 5), ""] },
    { cells: ["Total water handled (% of plant flow)",
      wcol(a1.bw.totalPctFlow, 12, 6), wcol(a2.bw.totalPctFlow, 12, 6), ""] },
  ]);
  content.push(sectionTable([
    ...bwBlock("Coagulation (maximum turbidity)", C.D1, C.D2),
    ...bwBlock("100% lime softening", S.D1, S.D2),
  ], W));
  content.push(BODY(
    `Dump and backwash water is the water sent to waste each cycle. On that measure the ` +
    `${d1} configuration uses ${f1(C.D1.bw.pctFlow)}% of plant flow in both modes, against ` +
    `the ${d2} configuration's ${f1(C.D2.bw.pctFlow)}% in coagulation and ` +
    `${f1(S.D2.bw.pctFlow)}% in lime softening.`));
  content.push(BODYB(
    `${d2}'s filter-to-waste recycle to the DAF inlet is not a free recovery. The ` +
    `filter-to-waste volume is ${f0(S.D2.bw.ftwPerCycle)} m3 per cycle, against ` +
    `${f0(S.D1.bw.ftwPerCycle)} m3 for ${d1}, and counting all washwater the ${d2} ` +
    `configuration handles up to ${f1(S.D2.bw.totalPctFlow)}% of plant flow in lime ` +
    `softening. Returning a stream of that size to the head of the plant adds to recycle ` +
    `hydraulics, DAF and sludge loading and pumping energy, can affect control-loop ` +
    `stability, and returns fine precipitate to the process. The net washwater performance favours ` +
    `the ${d1} configuration, but ${d2}'s washwater handling is a material design ` +
    `consideration in its own right and is carried into the decision framework and ` +
    `lifecycle implications in Part C.`));
  content.push(BODY(
    `Beyond the average loading, a large intermittent recycle stream can also introduce ` +
    `cyclic hydraulic and solids-loading disturbances into the DAF process, particularly ` +
    `during frequent filter washing under softening duty. Each return event briefly alters ` +
    `the DAF hydraulic loading rate, flocculation residence time, polymer demand and sludge ` +
    `blanket behaviour, which can produce cyclic rather than steady process behaviour. The ` +
    `operational significance of this depends on recycle equalisation, the plant control ` +
    `philosophy and the hydraulic resilience of the DAF, and it is identified here as a ` +
    `matter to be confirmed rather than assessed.`));

  // ---- 11  Sensitivity to feed deterioration ----
  content.push(...H1("11", "Sensitivity to feed deterioration", false));
  content.push(NOTE("Feed solids increased by 100%, doubling the TSS delivered to each " +
    "filter, in each operating mode. The achievable K is the lower of the head-budget limit " +
    "and the breakthrough cap; run length shortens only if the doubled-feed load exceeds " +
    "that achievable K."));
  const senBlock = (label, a1, a2) => ([
    { section: label },
    { cells: ["Doubled feed TSS (mg/L)", f1(a1.sens.tss2), f1(a2.sens.tss2), ""] },
    { cells: ["K required at design run (kg/m2/run)", bold(f2(a1.sens.kReq)), bold(f2(a2.sens.kReq)), ""] },
    { cells: ["Achievable K (kg/m2/run)", f2(a1.sens.kAch), f2(a2.sens.kAch), ""] },
    { cells: ["Binding constraint", flag(a1.sens.bind), flag(a2.sens.bind), ""] },
    { cells: ["Run length retained (h)", bold(f1(a1.sens.runRet)), bold(f1(a2.sens.runRet)), ""] },
    { cells: ["Head margin at doubled feed (m)", mgn(a1.sens.margin), mgn(a2.sens.margin), ""] },
  ]);
  content.push(sectionTable([
    ...senBlock("Coagulation, feed doubled", C.D1, C.D2),
    ...senBlock("Lime softening, feed doubled", S.D1, S.D2),
  ], W));
  content.push({ image: charts.sensitivity, width: 470, alignment: "center", margin: [0, 8, 0, 2] });
  content.push(CAP("Figure 3. Run length retained, as-built feed against feed doubled, for " +
    "all four configuration and mode combinations."));
  content.push(BODY(
    `The ${d2} configuration demonstrates greater resilience to feed deterioration in both ` +
    `modes. Under a doubled feed it remains feasible with positive head margin; in ` +
    `coagulation it is so lightly loaded that a doubled feed does not shorten its run. The ` +
    `${d1} configuration is head-constrained in both modes: a doubled feed pushes the ` +
    `required K above what the head budget allows, so its run shortens materially, to ` +
    `roughly half its design length, and little or no head margin remains. Combined with its lower ` +
    `temperature-and-redundancy reserve from Section 7, the ${d1} configuration has the ` +
    `more limited capacity of the two to absorb transient feed deterioration without loss ` +
    `of production or hydraulic margin.`));
  content.push(H2("Sensitivity to magnesium hydroxide content in the " + d2 + " softening floc"));
  content.push(NOTE("The " + d2 + " configuration removes magnesium to meet the hardness " +
    "and CCPP goals, so its lime-softening precipitate carries a magnesium hydroxide " +
    "fraction. Magnesium hydroxide is the least favourable precipitate for headloss; the " +
    "fraction is uncertain, so its effect is bounded here by a sweep. Run length held at " +
    "the design value."));
  const MG = model.mgFlocSensitivityD2;
  const mgRow = (p) => [
    `${f0(p.mgFrac * 100)}% magnesium hydroxide`,
    f2(p.kmult), f2(p.load), f2(p.totalDH),
    { text: `${p.margin >= 0 ? "+" : ""}${f2(p.margin)}`, bold: true,
      color: p.margin >= 0 ? (p.margin < 0.5 ? COL.ochre : COL.sage) : COL.rust },
  ];
  content.push(gridTable(
    ["Softening floc composition", "Deposit\nstructure factor", "Solids-load\nheadloss (m)",
     "Total headloss\nrequired (m)", "Head margin\n(m)"],
    MG.points.map(mgRow),
    [150, 86, 90, 96, 86]
  ));
  content.push(BODY(
    `As the magnesium hydroxide fraction rises, the deposit structure factor falls, from ` +
    `${f2(MG.points[0].kmult)} for a calcium-carbonate-dominant floc to ` +
    `${f2(MG.points[MG.points.length - 1].kmult)} at the high end of the sweep, and the ` +
    `solids-load headloss rises accordingly. The ${d2} lime-softening head margin reduces ` +
    `from ${f2(MG.points[0].margin)} m to ${f2(MG.points[MG.points.length - 1].margin)} m ` +
    `across the range, a swing of about ${f2(MG.marginSwing)} m. The margin remains ` +
    `positive and comfortable at every point tested, so the magnesium-removal duty erodes ` +
    `the ${d2} softening reserve but does not threaten its hydraulic feasibility. The ` +
    `report's headline ${d2} softening figures are computed on the designer's ` +
    `calcium-carbonate-dominant assumption; the true operating point lies on this sweep, ` +
    `and its position should be fixed once the designer confirms the magnesium hydroxide ` +
    `fraction in the softening precipitate.`));
  content.push(H2("Algal loading and filter-clogging risk"));
  content.push(BODY(
    `The plant design basis allows for raw water carrying up to 200,000 algae cells/mL, and ` +
    `there is evidence that filter-clogging algae are present in the source. At an assumed ` +
    `95% removal across upstream treatment, of the order of 10,000 cells/mL would reach the ` +
    `filters. This is a recognised feed-deterioration mechanism for the plant and is set ` +
    `out here for that reason.`));
  content.push(BODY(
    `Algal clogging is not captured by the solids-loading analysis in the body of this ` +
    `report, and this is an honest limitation of the comparison. The head-budget and ` +
    `solids holding capacity work is mass-based: it scales with the dry mass of solids ` +
    `captured. Algae load a filter very differently. They contribute little to solids mass ` +
    `but disproportionately to headloss, because the cells are low-density, often ` +
    `elongated, filamentous or colonial, and they deform and mat at the bed surface rather ` +
    `than distributing as a mineral floc does. The rate and severity of algal headloss are ` +
    `governed by cell morphology and species, not by the mass-based measures used here, so ` +
    `a cell count cannot be converted into a run-length or headloss figure without the ` +
    `species composition and supporting pilot or seasonal data.`));
  content.push(BODY(
    `The directional consequence for the comparison nonetheless follows from the hydraulics ` +
    `already established. A seasonal algal load is a surface-blinding transient, and algae ` +
    `tend to blind at or near the bed surface largely regardless of total bed depth. The ` +
    `${d2} bed, with its deeper and coarser anthracite layer, is expected to have greater ` +
    `tolerance to algal surface loading before terminal headloss develops, although the ` +
    `magnitude of that advantage depends strongly on algal species, morphology and the ` +
    `removal achieved by upstream treatment. The leaner ` +
    `${d1} four-layer bed, with finer media and the lower hydraulic reserve identified in ` +
    `Section 7, is the more exposed to a rapid algal headloss excursion, in the same way ` +
    `it is the more exposed to cold water and to feed deterioration. The magnitude of the ` +
    `effect is not quantified here; the characterisation needed to assess it is set out in ` +
    `Section 15.`));

  // ===================================================================
  // PART C — DECISION SUPPORT
  // ===================================================================
  content.push(...partHeader("C", "Decision support",
    "Part C draws the assessment together for the selection decision: the dependencies the " +
    "findings rest on, a risk-weighted decision framework, the operational and lifecycle " +
    "implications, and the risks and verification actions."));

  // ---- 12  Critical dependencies ----
  content.push(...H1("12", "Critical dependencies", false));
  content.push(BODY(
    `The findings in this report are conditional on the assumptions below. Each row ` +
    `identifies a finding, the dependency it rests on, and how the finding would change if ` +
    `the dependency is not met. These are the points at which the comparison could move, ` +
    `and they should be closed out through the verification actions in Section 16.`));
  content.push(gridTable(
    ["Finding", "Critical dependency", "Effect if the dependency is not met"],
    [
      [`${d1} lower whole-of-plant washwater demand`,
       "The SJHJV calcium-carbonate-dominant softening route delivers the documented low solids carryover, as a designer-supplied input consistent with typical softening ranges.",
       "If the SJHJV softening route carries more solids forward than documented, its run shortens and its washwater-demand advantage narrows."],
      [`${d2} hydraulic resilience advantage`,
       "The documented driving head is confirmed available at the filter.",
       "If the available head is lower, D2's margin reduces, though it remains above D1's."],
      [`${d1} hydraulic feasibility`,
       "Driving head as documented, and water temperature not below the design minimum.",
       "At materially reduced head or below the minimum design temperature, D1's N-1 margin erodes further; N-1 is the governing sustained redundancy condition."],
      [`${d2} filter-to-waste recycle is workable`,
       "DAF, recycle and sludge systems can accept the filter-to-waste recycle loading.",
       "If recycle loading is not acceptable, D2's washwater philosophy must be revised."],
      [`Designer run lengths are achievable`,
       "Coagulation and softening perform as assumed and the media stay clean between washes.",
       "If runs are shorter in practice, backwash frequency and water use rise for both."],
      [`Coagulation head budget as assessed`,
       "Coagulant type as assumed: ferric for D1, alum for D2.",
       "A different coagulant changes the deposit structure factor and the coagulation head budget."],
    ],
    [120, 185, 210]
  ));

  // ---- 13  Decision framework ----
  content.push(...H1("13", "Risk-weighted decision framework", false));
  content.push(BODY(
    `The two configurations are not separated by a single decisive measure. The appropriate ` +
    `choice depends on how the client weights hydraulic robustness, washwater performance, ` +
    `operational complexity and dependence on upstream performance. The matrix below sets ` +
    `out the comparison criterion by criterion; the table that follows indicates the ` +
    `direction of preference under different client priorities. The assessment does not ` +
    `recommend a single configuration.`));
  content.push(H2("Comparative assessment by criterion"));
  content.push(gridTable(
    ["Criterion", "Weighting", d1, d2],
    [
      ["Hydraulic resilience", "High", "Moderate", bold("Strong")],
      ["Temperature resilience", "High", "Moderate", bold("Strong")],
      ["Resilience to feed deterioration", "High", "Moderate to low", bold("Strong")],
      ["Risk of hydraulic constraint", "High", "Moderate", bold("Low")],
      ["Operational flexibility", "High", "Moderate", bold("Strong")],
      ["Dependence on upstream clarification", "High", "High dependency", "Moderate dependency"],
      ["Whole-of-plant washwater demand", "High", bold("Strong"), "Moderate"],
      ["Recycle and washwater loading", "Medium", "Lower", "Higher"],
      ["Operational simplicity", "Medium", bold("Strong"), "Moderate"],
    ],
    [165, 70, 140, 140]
  ));
  content.push(NOTE("Weightings and ratings are the reviewing engineer's judgement for the " +
    "purpose of structuring the decision, and are to be confirmed by the report author and " +
    "the client prior to issue. The criteria are not all independent; temperature resilience " +
    "and risk of hydraulic constraint both reflect the head-budget findings of Sections 7 " +
    "and 11."));
  content.push(H2("Indicated direction by client priority"));
  content.push(gridTable(
    ["If the client's governing priority is", "Indicated direction"],
    [
      ["Lowest current whole-of-plant washwater demand", bold(d1)],
      ["Highest hydraulic resilience", bold(d2)],
      ["Highest robustness to feed variability", bold(d2)],
      ["Lowest operational dependency on upstream clarification", bold(d2)],
      ["Lowest recycle and washwater handling complexity", bold(d1)],
      ["Lowest long-term operational risk", `${d2}, on the present evidence`],
    ],
    [320, 195]
  ));
  content.push(BODY(
    `The framework shows the decision turning on a single question: whether the client ` +
    `places greater weight on the demonstrated lower whole-of-plant washwater demand of the ${d1} ` +
    `configuration, or on the hydraulic robustness and lower upstream dependency of the ` +
    `${d2} configuration. That weighting is a client decision. The verification actions in ` +
    `Section 16 should be completed first, because several of them could move the ` +
    `washwater-demand comparison that the ${d1} position depends on.`));
  content.push(H2("Basis of the comparison"));
  content.push(BODY(
    `Capital and lifecycle cost are outside the scope of this assessment (Section 3). One ` +
    `point should nonetheless be made transparent for the decision. The greater hydraulic ` +
    `resilience of the ${d2} configuration is associated with materially greater filtration ` +
    `area, media depth, driving head and washwater handling requirement. This assessment ` +
    `compares performance and operability, not commercial value. The resilience advantage ` +
    `is therefore not without cost, and a whole-of-life assessment is needed to weigh the ` +
    `resilience and operability differences against the capital and operating commitment ` +
    `they carry; that assessment is recommended before selection.`));
  content.push(H2("Selection philosophy"));
  content.push(BODY(
    `The comparison ultimately reflects two coherent but different design philosophies, and ` +
    `the selection is best understood in those terms rather than as a contest of measures. ` +
    `The ${d1} configuration prioritises lower washwater demand and recycle burden, and ` +
    `performs well under stable, well-clarified feed conditions. The ${d2} configuration ` +
    `prioritises hydraulic resilience and operational robustness, and is better suited to ` +
    `deteriorated, cold or variable feed conditions, accepting a larger washwater and ` +
    `recycle burden in return. The right choice depends on how the client expects the plant ` +
    `to be operated over its life and on the confidence that can be placed in sustained ` +
    `upstream clarification performance.`));
  content.push(BODY(
    `Expressed as an operating philosophy, the two configurations suit different but equally ` +
    `legitimate utility approaches. The ${d1} configuration is a leaner hydraulic design ` +
    `with a lower recycle burden; it places more reliance on stable upstream clarification ` +
    `and on consistent operating discipline to keep within its hydraulic reserve. The ${d2} ` +
    `configuration is a more conservative hydraulic design with greater process buffering; ` +
    `it tolerates feed deterioration and operational variability more readily, in exchange ` +
    `for a larger washwater and recycle system to manage. Neither approach is more capable ` +
    `than the other, and choosing the leaner design does not imply a less able operator. ` +
    `The selection is properly a match between the configuration and the client's intended ` +
    `operating philosophy and risk appetite: how much process buffering the utility wants to ` +
    `build in, and how much it prefers to manage through operations. That judgement is for ` +
    `the client, informed by the verification actions in Section 16.`));

  // ---- 14  Client and lifecycle implications ----
  content.push(...H1("14", "Client and lifecycle implications", false));
  content.push(H2("Operational implications"));
  content.push(BODY(
    `The ${d1} configuration may deliver lower day-to-day washwater demand under stable ` +
    `clarified-water conditions. Its reduced hydraulic reserve, however, increases ` +
    `operational sensitivity to transient deterioration events, including algae ` +
    `breakthrough, clarifier upset, media fouling and elevated cold-water viscosity. With ` +
    `limited margin, the operating response to such events is constrained and run lengths ` +
    `shorten quickly. The ${d2} configuration carries more hydraulic margin and so absorbs ` +
    `transient events with less operational intervention.`));
  content.push(BODY(
    `The ${d2} hydraulic advantage is, however, accompanied by a materially larger ` +
    `operational burden. Handling close to ${f0(S.D2.bw.totalPctFlow)}% of plant flow as ` +
    `dump, backwash and filter-to-waste in lime softening is a significant volume to manage. ` +
    `It increases operator workload and backwash frequency, places a continuous demand on ` +
    `recycle control, and adds transient load to the DAF and the sludge-handling system ` +
    `each time a filter is washed. It also makes whole-of-plant hydraulic balancing more ` +
    `demanding, since a recycle stream of that size interacts with the inlet works. Modern ` +
    `utility practice increasingly treats operational risk as comparable in weight to ` +
    `hydraulic capacity, and on that basis the ${d2} configuration's washwater and recycle ` +
    `regime is its principal operational consideration, just as limited hydraulic reserve ` +
    `is the ${d1} configuration's. The optimisation discussion later in this section sets ` +
    `out how the ${d2} burden can be reduced.`));
  content.push(H2("Lifecycle implications"));
  content.push(BODY(
    `The deeper ${d2} media bed and lower filtration velocity are generally favourable for ` +
    `media life and for underdrain fouling risk. The larger ${d2} washwater and ` +
    `filter-to-waste volumes increase recycle pumping energy, DAF and sludge loading, and ` +
    `the return of fine precipitate to the process, which can affect chemical demand and ` +
    `process stability over the plant life. The ${d1} four-layer media arrangement requires ` +
    `confirmation that the layers restratify reliably after backwash; if they do not, ` +
    `long-term filtration performance and maintenance effort are affected. Neither ` +
    `configuration has been assessed for capital or lifecycle cost in this review, and a ` +
    `whole-of-life cost comparison is recommended before selection.`));
  content.push(BODY(
    `Lime-softening duty introduces a further set of long-term media risks that apply to ` +
    `both configurations and warrant attention in detailed design. Calcium carbonate is a ` +
    `scale-forming precipitate: where recarbonation upstream of the filters is incomplete, ` +
    `it can continue to precipitate within the bed, progressively scaling the lower media ` +
    `and the underdrain, gradually raising clean-bed headloss, and in the longer term ` +
    `cementing or coating media grains and reducing their effective porosity. Repeated ` +
    `backwashing also causes slow anthracite attrition and a gradual loss of media depth ` +
    `that is itself capacity. These mechanisms are qualitative considerations here rather ` +
    `than assessed quantities, but they bear most heavily on the ${d1} four-layer bed, ` +
    `where the sand-to-garnet interface stability discussed in Section 4 is the point most ` +
    `exposed to them. They are manageable through effective recarbonation control, sound ` +
    `air-scour and washing, and periodic media inspection and topping-up, and should be ` +
    `addressed in the operations and maintenance strategy.`));
  content.push(BODY(
    `The long-term effectiveness of both configurations depends heavily on underdrain ` +
    `hydraulic performance, which this assessment has not been able to evaluate. In ` +
    `lime-softening duty in particular, carbonate scaling or solids accumulation within ` +
    `nozzle systems or air-distribution laterals can progressively impair the uniformity ` +
    `of air and washwater delivery, leading to localised dead zones, uneven media ` +
    `expansion, reduced cleaning of the lower bed and a gradual deterioration of ` +
    `restratification performance. The effect compounds the interface and scaling ` +
    `mechanisms above, and it bears more heavily on the ${d1} four-layer bed, whose ` +
    `restratification is the more sensitive. Underdrain distribution quality is therefore ` +
    `a material detailed-design and verification item for both configurations; it is ` +
    `identified here and carried into Section 15.`));
  content.push(H2("Climate and event resilience"));
  content.push(BODY(
    `Under drought or low-demand operation both configurations operate well within their ` +
    `hydraulic envelope. The governing concern is the opposite case: the minimum design ` +
    `water temperature, peak demand, a filter out of service, and an algae or ` +
    `clarifier-upset event raising the solids load together. Section 7 shows that at the ` +
    `combined minimum-temperature N-1 condition, one filter out of service, the ${d1} ` +
    `configuration retains the lower head allowance for the solids load, around ` +
    `${f1(model.coldWater.D1[0].N1.headForLoad)} m, so its reserve against a compound event ` +
    `is the more limited of the two, though it remains positive and workable. The ${d2} ` +
    `configuration retains a larger margin, around ` +
    `${f1(model.coldWater.D2[0].N1.headForLoad)} m, under the same compound condition.`));
  content.push(H2("Operational optimisation opportunity for the " + d2 + " configuration"));
  content.push(BODY(
    `In lime softening the ${d2} configuration operates at K of ${f2(O.asBuilt.K)} ` +
    `kg/m2/run, about ${f0(O.asBuiltPctOfCeiling)}% of its ${f1(O.poreFill)} kg/m2/run ` +
    `theoretical pore-fill ceiling, so it has unused bed capacity. Its washwater handling, ` +
    `the largest operational consideration against it, can be reduced by two means that can ` +
    `be combined: running the filter closer to the breakthrough cap, and improving the ` +
    `upstream lime-` +
    `softening clarification. The table below quantifies both.`));
  const oppRow = (label, s) => [
    label, f1(s.tss), f2(s.K), f0(s.run),
    { text: pct1(s.bwPct), bold: true,
      color: s.bwPct < 5 ? COL.sage : (s.bwPct < 8 ? COL.ochre : COL.rust) },
    { text: `${s.margin >= 0 ? "+" : ""}${f2(s.margin)}`, bold: true,
      color: s.margin >= 0 ? COL.sage : COL.rust },
  ];
  content.push(gridTable(
    ["Scenario", "Feed TSS\n(mg/L)", "K\n(kg/m2/run)", "Run\n(h)", "Backwash\n(% flow)", "Head margin\n(m)"],
    [
      oppRow("As-built, lime softening", O.asBuilt),
      oppRow("Run to breakthrough cap, current feed", O.runToCap),
      oppRow("50% turbidity reduction, current K", O.turbCut),
      oppRow("50% turbidity reduction, run to cap", O.turbCutCap),
    ],
    [150, 62, 78, 50, 78, 97]
  ));
  content.push(BODY(
    `Running closer to capacity is available without a plant change and roughly halves the ` +
    `backwash penalty. Improving the softening carryover is the larger opportunity and, ` +
    `combined with the higher operating K, would bring the ${d2} configuration's washwater ` +
    `use close to ${d1}'s while retaining its intrinsic hydraulic advantages.`));
  content.push(H2("Removal efficiency: a conservative assumption for the " + d2 + " filter"));
  content.push(BODY(
    `A second opportunity concerns filtrate quality. The ${d2} filter is credited with only ` +
    `${f0(RM.asBuiltRemoval)}% TSS removal in lime softening. As noted in Section 8, that is ` +
    `conservative for a bed of its depth; the analysis here treats it as a design ` +
    `assumption to be challenged, and quantifies what higher removal would mean. The table ` +
    `holds the design run length and tests ${f0(RM.points[0].removal)}, ` +
    `${f0(RM.points[1].removal)} and ${f0(RM.points[2].removal)}% removal at the ` +
    `${f1(RM.feedTSS)} mg/L lime-softening feed.`));
  const remRow = (p) => [
    `${f0(p.removal)}% removal`,
    f1(p.capturedTSS), f2(p.K), f0(p.runHours),
    { text: `${p.margin >= 0 ? "+" : ""}${f2(p.margin)}`, bold: true,
      color: p.margin >= 0 ? COL.sage : COL.rust },
    { text: f2(p.filtrateTSS), bold: true,
      color: p.filtrateTSS < 1.5 ? COL.sage : (p.filtrateTSS < 3 ? COL.ochre : COL.rust) },
  ];
  content.push(gridTable(
    ["Removal case", "Captured solids\n(mg/L)", "K\n(kg/m2/run)", "Run\n(h)",
     "Head margin\n(m)", "Indicative\nfiltrate TSS (mg/L)"],
    RM.points.map(remRow),
    [108, 86, 80, 44, 86, 101]
  ));
  content.push(BODY(
    `Raising removal does not overload the bed. Because most of the solids are already ` +
    `captured at ${f0(RM.points[0].removal)}%, lifting removal to ` +
    `${f0(RM.points[2].removal)}% increases the captured mass by only a few per cent: the ` +
    `solids holding capacity K rises by about ${f2(RM.kRise)} kg/m2/run and the head margin ` +
    `gives up only about ${f2(RM.marginCost)} m, with the design run length retained and ` +
    `the operating point still comfortably feasible. The benefit, by contrast, is large. ` +
    `Indicative filtrate TSS falls from ${f1(RM.points[0].filtrateTSS)} mg/L at ` +
    `${f0(RM.points[0].removal)}% to ${f2(RM.points[2].filtrateTSS)} mg/L at ` +
    `${f0(RM.points[2].removal)}%, roughly a ${f0(RM.filtrateGain)}-fold reduction in solids ` +
    `passing to the clear well, with the improved barrier performance and lower downstream ` +
    `loading that follows.`));
  content.push(BODY(
    `The ${f0(RM.asBuiltRemoval)}% assumption may therefore understate the achievable ` +
    `performance of the ${d2} filter rather than describe a limitation of it, and ` +
    `confirming it is a genuine ` +
    `opportunity: materially better treated water at negligible hydraulic cost. The ` +
    `opportunity is conditional on upstream coagulation and floc quality being adequate, ` +
    `since a deep bed can only realise high removal if the solids reaching it are ` +
    `filterable. The recommendation is to challenge the ${f0(RM.asBuiltRemoval)}% figure ` +
    `with the designer, confirm the achievable removal by pilot or reference-plant data, ` +
    `and verify the coagulation basis.`));
  content.push(BODY(
    `The downstream consequences reinforce why this is worth pursuing. Lower filtrate solids ` +
    `mean less solids accumulating in the clearwater storage, a lower particulate component ` +
    `of disinfection demand, less solids carried into downstream sludge handling, and a ` +
    `wider margin against treated-water turbidity limits. Lower and more stable filtrate ` +
    `turbidity also strengthens confidence in the filtration step as a pathogen barrier. ` +
    `These consequences are described qualitatively and are not quantified here; they ` +
    `remain indicative and, as above, subject to upstream floc quality and validation.`));
  content.push(NOTE("The optimisation opportunities discussed in this section are set out " +
    "for the " + d2 + " configuration because the data available to this review allowed " +
    "them to be quantified. Equivalent opportunities may also exist for the " + d1 +
    " configuration, but sufficient operating-basis data was not available within this " +
    "review to quantify them; this asymmetry reflects data availability, not a conclusion " +
    "that only one configuration can be optimised."));

  // ---- 15  Further areas for investigation and assessment ----
  content.push(...H1("15", "Further areas for investigation and assessment", false));
  content.push(BODY(
    `This assessment is a hydraulic and solids-loading comparison. Several aspects of filter ` +
    `performance that bear on the selection have not been assessed, because they depend on ` +
    `data the designers have not yet supplied. They are set out here as a structured scope ` +
    `for the next stage rather than as findings: for each, the questions to be answered and ` +
    `the evidence required are stated, so the designers and the client can close them out ` +
    `before selection. They are distinct from the verification actions in Section 16, which ` +
    `confirm the inputs to this report; the items below extend the assessment into areas it ` +
    `has not yet covered.`));

  content.push(H2("Filtered-water quality and barrier performance"));
  content.push(BODY(
    `The report compares the two configurations on hydraulic capacity and solids holding, ` +
    `not on the quality of the water they produce or their reliability as a pathogen ` +
    `barrier. That is the most significant aspect not yet assessed, and it should be ` +
    `established before selection. Questions to be answered: what filtered-water turbidity ` +
    `does each configuration achieve, in each operating mode, through the full filter ` +
    `cycle; what particle-count performance is demonstrated; what is the turbidity peak and ` +
    `duration during ripening after backwash; what is the end-of-run breakthrough behaviour ` +
    `as terminal headloss is approached; what pathogen log-removal credit can reliably be ` +
    `claimed; and how does the return of recycled streams affect filtered-water stability. ` +
    `Evidence required: pilot-plant or reference-plant filtered-water turbidity and ` +
    `particle-count records, ripening profiles, and any validated log-removal basis. Why it ` +
    `matters: the configuration with the greater hydraulic margin is not necessarily the ` +
    `one with the more reliable filtered water, and a selection decision should rest on ` +
    `both.`));

  content.push(H2("Backwash effectiveness"));
  content.push(BODY(
    `The report establishes how much washwater each configuration uses, but not how ` +
    `effectively each bed is cleaned. Questions to be answered: what air-scour and ` +
    `water-wash rates are applied; how is the combined air-and-water sequence structured; ` +
    `is a collapse-pulse step used; what bed expansion is achieved, layer by layer; how ` +
    `uniformly are air and washwater distributed through the underdrain system; what is ` +
    `the risk of media carryover to waste; how is mudball formation controlled; how ` +
    `reliably does the bed restratify after each wash; and what does the solids-release ` +
    `profile of the washwater look like through the wash. Evidence required: the designers' ` +
    `backwash design basis, bed-expansion calculations or test data, and reference-plant ` +
    `wash performance records. Why it matters: backwash effectiveness governs long-term ` +
    `clean-bed headloss, run length and media life, and it is the central uncertainty for ` +
    `the ${d1} four-layer bed, whose interfaces are the more sensitive (Section 4).`));

  content.push(H2("Filter ripening and filter-to-waste basis"));
  content.push(BODY(
    `The ${d2} configuration commits a large filter-to-waste volume, ` +
    `${f0(S.D2.bw.ftwPerCycle)} m3 per cycle in lime softening, yet the basis for it has ` +
    `not been assessed. Questions to be answered: is filter-to-waste terminated on a fixed ` +
    `time or on a filtered-water turbidity target; what turbidity target is used; what does ` +
    `the post-backwash turbidity recovery curve look like; is the ${f0(S.D2.bw.ftwPerCycle)} ` +
    `m3 per cycle a conservative allowance or an evidence-based figure; and does ` +
    `lime-softening operation lengthen ripening because fine calcium carbonate is slower to ` +
    `be retained. Evidence required: the filter-to-waste control philosophy and turbidity ` +
    `recovery data for each configuration. Why it matters: if the filter-to-waste volume is ` +
    `conservative rather than evidence-based, part of the ${d2} washwater burden quantified ` +
    `in Section 10 may be recoverable, which would narrow one of the main differences ` +
    `between the configurations.`));

  content.push(H2("Operational control philosophy"));
  content.push(BODY(
    `How each filter is operated will influence how the differences in this report play out, ` +
    `and the intended control philosophy has not been assessed. Questions to be answered: ` +
    `will backwash be initiated on fixed time, on headloss, on filtered-water turbidity, or ` +
    `on a dual trigger; what scope does the operator have to intervene during an algae or ` +
    `clarifier-upset event; and how is the change between coagulation and lime-softening ` +
    `operation managed. Evidence required: the designers' and operator's intended control ` +
    `and operating philosophy for each configuration. Why it matters: the two ` +
    `configurations point toward different control emphasis. The ${d1} configuration ` +
    `operates with limited hydraulic reserve, so its control regime must protect run length ` +
    `and respond promptly to deterioration; the ${d2} configuration has spare bed capacity, ` +
    `so the opportunity identified in Section 14 depends on a control regime that allows ` +
    `longer runs to be realised.`));

  content.push(H2("Softening duty and a possible relaxation of the CCPP target"));
  content.push(BODY(
    `The lime-softening duty, and so the solids load carried to the filters, depends on the ` +
    `finished-water targets the plant is designed to meet. The current basis assumes a ` +
    `calcium carbonate precipitation potential target of zero. If that target were relaxed, ` +
    `for example to a positive value of the order of +5, less softening would be required, ` +
    `which would reduce the precipitate generated and the solids carried forward to the ` +
    `filters. Questions to be answered: is a relaxation of the CCPP target under ` +
    `consideration; what revised softening duty and feed TSS would result for each ` +
    `configuration; and would the magnesium-removal requirement change. Evidence required: ` +
    `the confirmed finished-water target and the revised softening basis from the process ` +
    `designers. Why it matters: a less stringent CCPP target would reduce the lime-softening ` +
    `feed solids for both configurations, and most materially for the ${d2} configuration, ` +
    `which carries the heavier softening duty. That would ease the ${d2} washwater handling ` +
    `and narrow one of the main differences between the configurations. It is identified ` +
    `here as a potential opportunity to be quantified once the finished-water basis is ` +
    `confirmed, not as a change assessed in this report.`));

  content.push(H2("Media inspection and replacement strategy"));
  content.push(BODY(
    `Granular media are a consumable asset, and how the media will be inspected and ` +
    `maintained over the plant life has not been assessed. Questions to be answered: what ` +
    `anthracite loss rate is expected from attrition and washing, and how will media depth ` +
    `be monitored and topped up; how will garnet migration and the stability of the media ` +
    `grading be managed; at what intervals will the bed be inspected and sampled; and how ` +
    `will reliable restratification be confirmed in service. Evidence required: the ` +
    `designers' media specification, expected media life and loss rates, and a media ` +
    `inspection, sampling and replacement philosophy for each configuration. Why it ` +
    `matters: a gradual drift in media depth or grading raises clean-bed headloss and ` +
    `erodes performance slowly, and it bears more heavily on the ${d1} four-layer bed, ` +
    `which has more interfaces and is the more sensitive to grading drift; a defined ` +
    `inspection and replacement strategy is needed to keep either bed performing to ` +
    `design over its life.`));

  content.push(H2("Algal loading and filter-clogging risk"));
  content.push(BODY(
    `The design basis allows for up to 200,000 algae cells/mL in the raw water and ` +
    `filter-clogging algae are known to be present, but the effect on the filters has not ` +
    `been assessed, because algal clogging depends on cell morphology rather than solids ` +
    `mass and falls outside the mass-based analysis in this report (Section 11). Questions ` +
    `to be answered: which algal species are present, and which filter-clogging forms, ` +
    `filamentous, colonial or elongated diatoms, dominate; what seasonal peak cell counts ` +
    `the 200,000 cells/mL design figure represents; what algal removal is achieved across ` +
    `upstream clarification; and what headloss and run-length impact algal loading has in ` +
    `pilot or comparable operating experience. Evidence required: raw-water algal ` +
    `monitoring data with species composition, the seasonal profile, and any pilot or ` +
    `reference-plant record of algal effect on filter runs. Why it matters: a seasonal ` +
    `algal load is a surface-blinding transient that bears more heavily on the leaner ` +
    `${d1} four-layer bed, while the deeper ${d2} bed has more capacity to absorb it; ` +
    `quantifying the loading is needed to size that difference and to confirm both ` +
    `configurations can sustain runs through an algal season.`));

  // ---- 16  Risk register and verification ----
  content.push(...H1("16", "Risk register and verification recommendations", false));
  const risks = [
    ["Lime-softening softening-duty difference", "Low",
     "The lime-softening feed TSS differs between the configurations because D2 removes " +
     "magnesium to meet the hardness and CCPP goals while D1 does not. The figures are " +
     "designer-supplied and within typical softening ranges; the residual action is to " +
     "confirm the difference in softening duty is intended and understood."],
    ["D2 magnesium hydroxide fraction in softening floc", "Medium",
     "D2's magnesium-removal duty introduces a magnesium hydroxide fraction, the least " +
     "favourable precipitate for headloss, whose size is uncertain. Section 11 shows the " +
     "D2 softening margin stays positive across the plausible range; confirm the fraction "
     + "to fix the operating point."],
    ["Filter-clogging algae in the raw water", "Medium",
     "The design basis allows up to 200,000 algae cells/mL and filter-clogging algae are " +
     "present in the source. Algal clogging is morphology-driven and outside the mass-based " +
     "analysis; it bears more heavily on the leaner D1 bed. Characterise the species mix " +
     "and seasonal behaviour and confirm the upstream removal assumption (Section 11)."],
    ["D1 redundancy margin at minimum temperature", "Low to Medium",
     "At the maximum design flow, the governing N-1 condition (one filter out of service) " +
     "and the 15 degrees C minimum design water temperature, D1 retains the lower head " +
     "allowance for solids load, around +1.2 m. It is positive and workable but the lower " +
     "reserve of the two. Confirm the driving head and the minimum design water temperature."],
    ["D2 removal efficiency assumption", "Medium",
     "The 90% TSS removal assumed for the D2 filter in lime softening is conservative for a " +
     "2.10 m dual-media bed and may understate its capability. Challenge and verify the " +
     "achievable removal; see Section 14."],
    ["D2 washwater and recycle loading", "Medium to High",
     "In lime softening D2 handles close to 20% of plant flow as dump, backwash and " +
     "filter-to-waste. Confirm the washwater recovery design and acceptable DAF and recycle " +
     "loading."],
    ["Coagulant chemistry assumptions", "Medium",
     "The coagulation analysis assumes ferric for D1 and alum for D2. The deposit structure factor, and " +
     "so the head budget, depends on this."],
    ["Feed deterioration beyond the tested range", "Medium",
     "Section 11 tests a 100% deterioration. D1 has the least head reserve at that point, " +
     "so a larger or compound deterioration would erode its margin first."],
    ["Media restratification, D1 four-layer bed", "Medium",
     "Reliable restratification of the four-layer arrangement after backwash has not been " +
     "verified and affects long-term performance and maintenance."],
  ];
  content.push({
    table: {
      widths: [135, 62, 318],
      headerRows: 1,
      body: [
        [{ text: "Risk", style: "eyebrow" }, { text: "Rating", style: "eyebrow" },
         { text: "Description and required action", style: "eyebrow" }],
        ...risks.map((r) => [
          { text: r[0], style: "cell", bold: true },
          { text: r[1], style: "cell" },
          { text: r[2], style: "cell" },
        ]),
      ],
    },
    layout: {
      hLineWidth: (i, node) => (i === 0 ? 0 : (i === 1 ? 0.8 : (i === node.table.body.length ? 0 : 0.3))),
      hLineColor: (i) => (i === 1 ? COL.ink : COL.rule),
      vLineWidth: () => 0,
      paddingTop: () => 4, paddingBottom: () => 4, paddingLeft: () => 4, paddingRight: () => 4,
    },
    margin: [0, 2, 0, 8],
  });
  content.push(H2("Independent verification recommendations"));
  content.push(BODY("The following independent verification of the inputs to this report " +
    "should be completed before it is used as a basis for configuration selection. Further " +
    "areas of assessment that extend beyond this report are set out in Section 15."));
  [
    "Independent hydraulic review confirming the plant hydraulic profile and the available " +
      "driving head, including the governing N-1 condition at the minimum design water temperature.",
    "Confirmation of the minimum design water temperature used as the head-budget basis.",
    "Confirmation that the difference in softening duty (D2 magnesium removal, D1 " +
      "calcium-carbonate-dominant) is intended, and confirmation of the magnesium hydroxide " +
      "fraction in the D2 softening precipitate (Section 11).",
    "Verification of the achievable D2 filter TSS removal, assumed conservatively at 90% " +
      "and expected to be higher subject to floc quality and validation (Section 14).",
    "Pilot or reference-plant data confirming each configuration sustains its stated run " +
      "length in each operating mode.",
    "Seasonal algal characterisation, including dominant species, cell morphology, " +
      "colonial or filamentous forms, upstream removal efficiency, and pilot or " +
      "reference-plant filter run data during algal events (Section 11).",
    "Dirty-bed terminal headloss across the design water-temperature range, from each designer.",
    "Whole-of-life operating cost modelling covering washwater, recycle pumping, chemical " +
      "and sludge implications.",
  ].forEach((t) => content.push(bullet(t)));
  content.push({ canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: COL.rule }],
    margin: [0, 8, 0, 4] });
  content.push({ text:
    "This comparative assessment supports design review and selection. It is subject " +
    "to the limitations, verification actions and further areas of assessment set out in " +
    "this report, and is not a substitute for detailed design, pilot validation or " +
    "independent clarification modelling.", style: "foot" });

  return {
    pageSize: "A4",
    pageMargins: [40, 44, 40, 48],
    info: { title: `Filter Performance Assessment, ${d1} and ${d2}`,
      author: model.preparedBy || "Filter Performance Comparator" },
    content,
    pageBreakBefore: (currentNode) => {
      // Push a section heading to the next page if it would otherwise be
      // stranded near the bottom, with its rule and opening text orphaned.
      if (currentNode.headlineLevel === 1 && currentNode.startPosition) {
        const sp = currentNode.startPosition;
        if (sp.top != null && sp.pageInnerHeight != null) {
          return sp.top > sp.pageInnerHeight - 95;
        }
      }
      return false;
    },
    footer: (currentPage, pageCount) => ({
      margin: [40, 12, 40, 0],
      columns: [
        { text: `Filter Performance Assessment   ${d1} and ${d2}`, style: "foot" },
        { text: `Revision A   |   Page ${currentPage} of ${pageCount}`, style: "foot",
          alignment: "right" },
      ],
    }),
    styles: {
      title: { fontSize: 21, bold: true, color: COL.ink },
      subtitle: { fontSize: 11, color: COL.ink500 },
      h1: { fontSize: 14, bold: true, color: COL.ink, margin: [0, 12, 0, 0] },
      h2: { fontSize: 10.5, bold: true, color: COL.rust, margin: [0, 8, 0, 3] },
      body: { fontSize: 9.5, color: COL.ink, alignment: "justify", margin: [0, 0, 0, 6], lineHeight: 1.25 },
      bodyB: { fontSize: 9.5, color: COL.ink, bold: true, alignment: "justify", margin: [0, 0, 0, 6], lineHeight: 1.25 },
      eyebrow: { fontSize: 7, bold: true, color: COL.ink500 },
      cell: { fontSize: 8, color: COL.ink },
      note: { fontSize: 8, italics: true, color: COL.ink500, margin: [0, 0, 0, 6], lineHeight: 1.2 },
      caption: { fontSize: 7.5, italics: true, color: COL.ink500, margin: [0, 2, 0, 8] },
      foot: { fontSize: 7, color: COL.ink500, lineHeight: 1.2 },
    },
    defaultStyle: { fontSize: 9.5, color: COL.ink },
  };
}

// Public entry point: builds charts, the document, and downloads the PDF.
export async function generatePdfReport(model) {
  const charts = buildAllCharts(model);
  const dd = docDefinition(model, charts);
  const pdfMakeMod = await import("pdfmake/build/pdfmake");
  const pdfFontsMod = await import("pdfmake/build/vfs_fonts");
  const pdfMake = pdfMakeMod.default || pdfMakeMod;
  const rawFonts = pdfFontsMod.default || pdfFontsMod;
  const vfs = rawFonts.pdfMake?.vfs || rawFonts.vfs || rawFonts;
  if (vfs) pdfMake.vfs = vfs;
  const fname = `Filter_Assessment_${new Date().toISOString().slice(0, 10)}.pdf`;
  pdfMake.createPdf(dd).download(fname);
}
