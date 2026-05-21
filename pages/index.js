// pages/index.js
import { useState, useMemo } from "react";
import {
  DESIGNER_DEFAULTS, DESIGNER_FEED_DEFAULTS, DEFAULT_FLOW_ENVELOPE,
  pickScenarioValue, pickFeedScenario, peakFlowFromEnvelope, envelope,
  SCENARIO_COLOURS, SCENARIO_SHORT,
} from "../lib/filterDefaults";
import { assessFilter, assessFilterEnvelope } from "../lib/filterCalculations";
import { REFERENCES, PHYSICS_NOTES } from "../lib/references";
import { generateCSV } from "../lib/reportGenerator";
import { buildReportModel } from "../lib/reportBuilder";
import { generatePdfReport } from "../lib/pdfReport";
import { validateFlowEnvelope, worstSeverity } from "../lib/validation";
import {
  cleanBedHeadloss, filtrationVelocity, totalFilterArea,
  underdrainHeadloss, UNDERDRAIN_LIBRARY,
} from "../lib/filterPhysics";

import FilterDesignEditor from "../components/FilterDesignEditor";
import FeedInputsEditor from "../components/FeedInputsEditor";
import FilterAssessmentDisplay from "../components/FilterAssessmentDisplay";
import BackwashSequenceEditor from "../components/BackwashSequenceEditor";
import RedundancyMatrixDisplay from "../components/RedundancyMatrixDisplay";
import BackwashTimeline from "../components/BackwashTimeline";
import UnderdrainHeadlossChart from "../components/UnderdrainHeadlossChart";
import LikeForLikeComparison from "../components/LikeForLikeComparison";
import PrecipitateNarrative from "../components/PrecipitateNarrative";
import ScenarioSelector from "../components/ScenarioSelector";
import HeadBudgetChart from "../components/HeadBudgetChart";

const TABS = [
  { id: "inputs",       label: "Inputs" },
  { id: "filter",       label: "Filter design" },
  { id: "backwash",     label: "Backwash sequence" },
  { id: "assessment",   label: "Assessment" },
  { id: "precipitates", label: "Precipitates" },
  { id: "redundancy",   label: "Redundancy" },
  { id: "headbudget",   label: "Head budget" },
  { id: "timeline",     label: "BW timeline" },
  { id: "compare-coag", label: "Compare: coagulation" },
  { id: "compare-soft", label: "Compare: softening" },
  { id: "physics",      label: "Physics" },
  { id: "report",       label: "Report" },
];

export default function Home() {
  const [tab, setTab] = useState("inputs");

  // Flow envelope
  const [flowEnv, setFlowEnv] = useState(JSON.parse(JSON.stringify(DEFAULT_FLOW_ENVELOPE)));

  // Filter designs (geometry, fixed by design — single value)
  const [filterD1, setFilterD1] = useState(JSON.parse(JSON.stringify(DESIGNER_DEFAULTS.D1.filter)));
  const [filterD2, setFilterD2] = useState(JSON.parse(JSON.stringify(DESIGNER_DEFAULTS.D2.filter)));

  // Feed envelopes per designer
  const [feedD1, setFeedD1] = useState(JSON.parse(JSON.stringify(DESIGNER_FEED_DEFAULTS.D1)));
  const [feedD2, setFeedD2] = useState(JSON.parse(JSON.stringify(DESIGNER_FEED_DEFAULTS.D2)));

  // Scenario selector for the detail-view tabs
  const [redundancyScenario, setRedundancyScenario] = useState("avg");
  const [timelineScenario, setTimelineScenario] = useState("avg");

  // Designer display names for the report. The tool uses D1 / D2 internally;
  // these only affect the exported report. Blank falls back to the generic label.
  const [reportNameD1, setReportNameD1] = useState("");
  const [reportNameD2, setReportNameD2] = useState("");
  const [reportPreparedBy, setReportPreparedBy] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");

  // Envelope assessments
  const envelopeD1 = useMemo(() => assessFilterEnvelope({
    feed: feedD1, flowEnv, filter: filterD1,
  }), [feedD1, flowEnv, filterD1]);

  const envelopeD2 = useMemo(() => assessFilterEnvelope({
    feed: feedD2, flowEnv, filter: filterD2,
  }), [feedD2, flowEnv, filterD2]);

  // Max-flow clean-bed for the Filter design tab (single value).
  // Max design flow is the conservative basis: shows clean-bed headloss at
  // peak velocity, which is what the designer should be checking head budget
  // against. Avg flow understates the headloss the design must accommodate.
  const avgFlow = pickScenarioValue(flowEnv.designFlow_MLD, "avg");
  const maxFlow = pickScenarioValue(flowEnv.designFlow_MLD, "max");

  // Validate the flow envelope so an implausible input is flagged at source.
  const flowIssues = useMemo(
    () => validateFlowEnvelope(flowEnv.designFlow_MLD),
    [flowEnv.designFlow_MLD]
  );
  const flowSeverity = worstSeverity(flowIssues);
  const cleanBedD1 = useMemo(() => {
    const v = filtrationVelocity(maxFlow, totalFilterArea(filterD1.numFilters, filterD1.areaPerFilter_m2));
    return cleanBedHeadloss({ layers: filterD1.mediaLayers, velocity_m_s: v, equation: filterD1.cleanBedEquation, applyUCCorrection: filterD1.applyUCCorrection !== false, temp_C: filterD1.temp_C ?? 10 });
  }, [filterD1, maxFlow]);

  const cleanBedD2 = useMemo(() => {
    const v = filtrationVelocity(maxFlow, totalFilterArea(filterD2.numFilters, filterD2.areaPerFilter_m2));
    return cleanBedHeadloss({ layers: filterD2.mediaLayers, velocity_m_s: v, equation: filterD2.cleanBedEquation, applyUCCorrection: filterD2.applyUCCorrection !== false, temp_C: filterD2.temp_C ?? 10 });
  }, [filterD2, maxFlow]);

  // Terminal headloss for the timeline tab — uses the selected scenario
  const terminalD1 = useMemo(() => {
    const flow = pickScenarioValue(flowEnv.designFlow_MLD, timelineScenario);
    const v = filtrationVelocity(flow, totalFilterArea(filterD1.numFilters, filterD1.areaPerFilter_m2));
    const cb = cleanBedHeadloss({ layers: filterD1.mediaLayers, velocity_m_s: v, equation: filterD1.cleanBedEquation, applyUCCorrection: filterD1.applyUCCorrection !== false, temp_C: filterD1.temp_C ?? 10 });
    const ud = underdrainHeadloss(filterD1.underdrain, v);
    const sigma = envelopeD1[timelineScenario].sigma_g_per_L;
    const load = 0.92 * Math.pow(Math.max(0, sigma), 2/3);
    return { total: cb.total_m + ud + load + filterD1.appurtenanceLoss_m, cleanBed: cb.total_m };
  }, [filterD1, flowEnv, timelineScenario, envelopeD1]);

  const terminalD2 = useMemo(() => {
    const flow = pickScenarioValue(flowEnv.designFlow_MLD, timelineScenario);
    const v = filtrationVelocity(flow, totalFilterArea(filterD2.numFilters, filterD2.areaPerFilter_m2));
    const cb = cleanBedHeadloss({ layers: filterD2.mediaLayers, velocity_m_s: v, equation: filterD2.cleanBedEquation, applyUCCorrection: filterD2.applyUCCorrection !== false, temp_C: filterD2.temp_C ?? 10 });
    const ud = underdrainHeadloss(filterD2.underdrain, v);
    const sigma = envelopeD2[timelineScenario].sigma_g_per_L;
    const load = 0.92 * Math.pow(Math.max(0, sigma), 2/3);
    return { total: cb.total_m + ud + load + filterD2.appurtenanceLoss_m, cleanBed: cb.total_m };
  }, [filterD2, flowEnv, timelineScenario, envelopeD2]);

  const updateBWSeq = (designerId, seq) => {
    if (designerId === "D1") setFilterD1({ ...filterD1, bwSequence: seq });
    else setFilterD2({ ...filterD2, bwSequence: seq });
  };

  const updateFlowEnv = (scenario, value) => {
    setFlowEnv({
      ...flowEnv,
      designFlow_MLD: { ...flowEnv.designFlow_MLD, [scenario]: Number(value) || 0 },
    });
  };

  const downloadFile = (filename, content, mimeType = "text/plain") => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPDF = async () => {
    setPdfError("");
    setPdfBusy(true);
    try {
      const model = buildReportModel({
        filterD1, filterD2, feedD1, feedD2,
        nameD1: reportNameD1, nameD2: reportNameD2,
        preparedBy: reportPreparedBy,
      });
      await generatePdfReport(model);
    } catch (err) {
      console.error("PDF report generation failed:", err);
      setPdfError("PDF generation failed. See the browser console for details.");
    } finally {
      setPdfBusy(false);
    }
  };

  const handleDownloadCSV = () => {
    const csv = generateCSV({ flowEnv, filterD1, filterD2, feedD1, feedD2, envelopeD1, envelopeD2 });
    downloadFile(`Filter_Data_${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv");
  };

  // Filter object with BW volume populated from selected scenario (for timeline)
  // Uses the sum of drain+backwash+FTW components (with legacy scalar fallback)
  const filterWithBW = (filter, feed, scen) => {
    const fs = pickFeedScenario(feed, scen);
    return { ...filter, backwashPerCycle_m3: fs.volumePerBW_m3 };
  };

  // Redundancy scenario σ_eff (precipitate-adjusted, for consistency with head budget).
  // A single σ_eff is used across all flow rows of the matrix so the headloss
  // varies monotonically with flow; the deposit structure factor is applied to convert from
  // K-implied to the floc-density-adjusted σ used in Mints-Tien.
  const sigmaEffD1_red = envelopeD1[redundancyScenario].sigma_eff_g_per_L;
  const sigmaEffD2_red = envelopeD2[redundancyScenario].sigma_eff_g_per_L;
  const redundancyFlow = pickScenarioValue(flowEnv.designFlow_MLD, redundancyScenario);
  const peakFlow = peakFlowFromEnvelope(flowEnv);

  return (
    <div className="min-h-screen" style={{ background: "var(--paper)" }}>
      <Header />

      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="rule-thick" />
        <nav className="flex flex-wrap gap-0 no-print" style={{ borderBottom: "0.5px solid var(--ink-300)" }}>
          {TABS.map((t, idx) => (
            <div key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              {String(idx + 1).padStart(2, "0")} · {t.label}
            </div>
          ))}
        </nav>
      </div>

      <main className="max-w-7xl mx-auto px-6 lg:px-10 py-10">
        {tab === "inputs" && (
          <div>
            <SectionHeader number="01" title="Inputs" caption="Plant flows, dHL/dt model, and per-designer filter feed & backwash inputs — all with min / avg / max envelopes." />

            <div className="mb-10">
              <div className="eyebrow mb-3">Plant flow envelope (ML/d)</div>
              <div className="grid grid-cols-5 gap-6 max-w-4xl">
                {["min", "avg", "max"].map((s) => (
                  <div key={s}>
                    <div className="eyebrow mb-1" style={{ fontSize: 9, color: SCENARIO_COLOURS[s] }}>{SCENARIO_SHORT[s]}</div>
                    <input type="number" min="0" step="1"
                      value={flowEnv.designFlow_MLD[s]}
                      onChange={(e) => updateFlowEnv(s, e.target.value)}
                      style={{ width: "100%" }} />
                  </div>
                ))}
                <div>
                  <div className="eyebrow mb-1" style={{ fontSize: 9 }}>dHL/dt model</div>
                  <select value={flowEnv.dHLModel}
                    onChange={(e) => setFlowEnv({ ...flowEnv, dHLModel: e.target.value })}>
                    <option value="mints">Mints differential</option>
                    <option value="linear">Linear</option>
                  </select>
                </div>
                <div>
                  <div className="eyebrow mb-1" style={{ fontSize: 9 }}>Treated water $/ML</div>
                  <input type="number" min="0" step="100"
                    value={flowEnv.treatedWaterCost_per_ML ?? 1500}
                    onChange={(e) => setFlowEnv({ ...flowEnv, treatedWaterCost_per_ML: Number(e.target.value) || 0 })}
                    style={{ width: "100%" }} />
                </div>
              </div>
              <p className="text-xs italic mt-2 max-w-3xl" style={{ color: "var(--ink-500)", fontFamily: "Source Serif 4, serif" }}>
                Min flow represents low-demand off-peak operation; max is peak. Hydraulic redundancy peak-flow checks always use the max value of this envelope regardless of which scenario is selected for assessment. Treated-water cost is used to monetise the BW water-loss differential in the report (default $1500/ML, typical AU municipal range).
              </p>
              {flowIssues.length > 0 && (
                <div className="mt-3 max-w-3xl p-3" style={{
                  border: `1px solid ${flowSeverity === "error" ? "var(--rust)" : "#C8961A"}`,
                  background: flowSeverity === "error" ? "rgba(176,69,31,0.06)" : "rgba(200,150,26,0.08)" }}>
                  <div className="eyebrow mb-1" style={{
                    color: flowSeverity === "error" ? "var(--rust)" : "#9A7415" }}>
                    {flowSeverity === "error"
                      ? "Input error — check the flow envelope"
                      : "Check the flow envelope"}
                  </div>
                  {flowIssues.map((iss, i) => (
                    <p key={i} className="text-xs mt-1" style={{
                      fontFamily: "Source Serif 4, serif", color: "var(--ink-700)" }}>
                      {iss.message}
                    </p>
                  ))}
                </div>
              )}
            </div>

            <div className="grid lg:grid-cols-2 gap-10">
              <FeedInputsEditor designerId="D1" feed={feedD1} onChange={setFeedD1} />
              <FeedInputsEditor designerId="D2" feed={feedD2} onChange={setFeedD2} />
            </div>
          </div>
        )}

        {tab === "filter" && (
          <div>
            <SectionHeader number="02" title="Filter design" caption="Number of filters, area per filter, media stack, underdrain, clean-bed equation, driving head — fully editable for each designer. Clean-bed headloss shown at average flow." />
            <div className="grid lg:grid-cols-2 gap-10">
              <FilterDesignEditor designerId="D1" filter={filterD1} onChange={setFilterD1} />
              <FilterDesignEditor designerId="D2" filter={filterD2} onChange={setFilterD2} />
            </div>
            <div className="mt-10 grid lg:grid-cols-2 gap-10">
              <CleanBedSummary designerId="D1" filter={filterD1} cleanBed={cleanBedD1} flowMLD={maxFlow} />
              <CleanBedSummary designerId="D2" filter={filterD2} cleanBed={cleanBedD2} flowMLD={maxFlow} />
            </div>
            <div className="mt-10 grid lg:grid-cols-2 gap-10">
              {(() => {
                // Shared y-axis max across D1 and D2 underdrain charts so the
                // two are visually comparable. Take worst-case dH at each
                // design's N-2 peak condition and round up.
                const v_D1_worst = peakFlow * 1000 / (24 * 3600 * Math.max(1, (filterD1.numFilters - 2) * filterD1.areaPerFilter_m2));
                const v_D2_worst = peakFlow * 1000 / (24 * 3600 * Math.max(1, (filterD2.numFilters - 2) * filterD2.areaPerFilter_m2));
                const dH_D1_worst = underdrainHeadloss(filterD1.underdrain, v_D1_worst);
                const dH_D2_worst = underdrainHeadloss(filterD2.underdrain, v_D2_worst);
                // Also clamp to the curve range 2..16 m/h for fairness
                const dH_D1_curve_max = underdrainHeadloss(filterD1.underdrain, 16/3600);
                const dH_D2_curve_max = underdrainHeadloss(filterD2.underdrain, 16/3600);
                const sharedYMax = Math.ceil(Math.max(dH_D1_worst, dH_D2_worst, dH_D1_curve_max, dH_D2_curve_max) * 10) / 10;
                return (
                  <>
                    <UnderdrainHeadlossChart designerId="D1" filter={filterD1} flowMLD={maxFlow} peakFlowMLD={peakFlow} sharedYMax={sharedYMax} />
                    <UnderdrainHeadlossChart designerId="D2" filter={filterD2} flowMLD={maxFlow} peakFlowMLD={peakFlow} sharedYMax={sharedYMax} />
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {tab === "backwash" && (
          <div>
            <SectionHeader number="03" title="Backwash sequence" caption="Phase durations for each filter's backwash cycle. Sequencing policy: bank-wide single backwash." />
            <div className="grid lg:grid-cols-2 gap-10">
              <BackwashSequenceEditor designerId="D1" seq={filterD1.bwSequence} onChange={(s) => updateBWSeq("D1", s)} />
              <BackwashSequenceEditor designerId="D2" seq={filterD2.bwSequence} onChange={(s) => updateBWSeq("D2", s)} />
            </div>
          </div>
        )}

        {tab === "assessment" && (
          <div>
            <SectionHeader number="04" title="Filter assessment" caption="Solids load, derived run length and K, and filter loading at N/N-1/N-2 — shown for min, avg, and max scenarios side by side." />
            <div className="grid lg:grid-cols-2 gap-10">
              <FilterAssessmentDisplay designerId="D1" envelope={envelopeD1} filter={filterD1} flowEnv={flowEnv} />
              <FilterAssessmentDisplay designerId="D2" envelope={envelopeD2} filter={filterD2} flowEnv={flowEnv} />
            </div>
          </div>
        )}

        {tab === "precipitates" && (
          <div>
            <SectionHeader number="05" title="Precipitate types & K" caption="How each precipitate morphology affects filter solids-holding capacity." />
            <PrecipitateNarrative />
          </div>
        )}

        {tab === "redundancy" && (
          <div>
            <SectionHeader number="06" title="Hydraulic redundancy" caption="Total terminal headloss at N, N-1, N-2 across design / peak / BW-in-progress. σ comes from the selected scenario; peak-flow check uses the max of the flow envelope." />
            <ScenarioSelector scenario={redundancyScenario} onChange={setRedundancyScenario} label="Apply scenario" />
            <div className="grid lg:grid-cols-2 gap-10">
              <RedundancyMatrixDisplay designerId="D1" filter={filterD1} designFlow_MLD={redundancyFlow} peakFlow_MLD={peakFlow} sigma_eff_g_per_L={sigmaEffD1_red} />
              <RedundancyMatrixDisplay designerId="D2" filter={filterD2} designFlow_MLD={redundancyFlow} peakFlow_MLD={peakFlow} sigma_eff_g_per_L={sigmaEffD2_red} />
            </div>
          </div>
        )}

        {tab === "headbudget" && (
          <div>
            <SectionHeader number="07" title="Head budget vs K"
              caption="K (solids holding capacity) plotted against the terminal head required to support it. Each chart has its own dropdowns to select flow scenario (min / avg / max / all) and redundancy condition (N / N-1 / N-2 / all). The horizontal dashed line is the available driving head; the vertical line is the K observed at the selected scenario. N and N-1 should pass with margin under normal operation; N-2 is typically the capacity-limiting condition." />
            <div className="grid lg:grid-cols-2 gap-10">
              {(() => {
                // Shared x and y axes across the D1 and D2 head budget charts so the
                // two are visually comparable. The widest K range and tallest driving
                // head set the bounds, so both designs use the same scales and you can
                // read off K_max / margins on a single visual reference.
                const xMaxD1 = Math.min(Math.max(envelopeD1.max.K_kg_per_m2 * 2.2, 5.0), 10.0);
                const xMaxD2 = Math.min(Math.max(envelopeD2.max.K_kg_per_m2 * 2.2, 5.0), 10.0);
                const sharedXMax = Math.max(xMaxD1, xMaxD2);
                const sharedYMax = Math.ceil(Math.max(filterD1.drivingHead_m, filterD2.drivingHead_m) * 1.25 * 2) / 2;
                return (
                  <>
                    <HeadBudgetChart
                      designerId="D1"
                      filter={filterD1}
                      flowEnv={flowEnv}
                      envelope={envelopeD1}
                      drivingHead_m={filterD1.drivingHead_m}
                      sharedXMax={sharedXMax}
                      sharedYMax={sharedYMax}
                    />
                    <HeadBudgetChart
                      designerId="D2"
                      filter={filterD2}
                      flowEnv={flowEnv}
                      envelope={envelopeD2}
                      drivingHead_m={filterD2.drivingHead_m}
                      sharedXMax={sharedXMax}
                      sharedYMax={sharedYMax}
                    />
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {tab === "timeline" && (
          <div>
            <SectionHeader number="08" title="Backwash timeline & plant capacity" caption={`24-hour single-BW simulation, dHL/dt (${flowEnv.dHLModel === "linear" ? "linear" : "Mints differential"}), and net plant capacity for the selected scenario.`} />
            <ScenarioSelector scenario={timelineScenario} onChange={setTimelineScenario} label="Apply scenario" />
            <div className="space-y-12">
              <BackwashTimeline
                designerId="D1"
                filter={filterWithBW(filterD1, feedD1, timelineScenario)}
                runHours={envelopeD1[timelineScenario].run_hours}
                designFlow_MLD={pickScenarioValue(flowEnv.designFlow_MLD, timelineScenario)}
                sigma_g_per_L={envelopeD1[timelineScenario].sigma_g_per_L}
                dHL_dt_model={flowEnv.dHLModel}
                terminalHeadlossM={terminalD1.total}
                cleanBedHeadloss_m={terminalD1.cleanBed}
              />
              <div className="rule-thin" />
              <BackwashTimeline
                designerId="D2"
                filter={filterWithBW(filterD2, feedD2, timelineScenario)}
                runHours={envelopeD2[timelineScenario].run_hours}
                designFlow_MLD={pickScenarioValue(flowEnv.designFlow_MLD, timelineScenario)}
                sigma_g_per_L={envelopeD2[timelineScenario].sigma_g_per_L}
                dHL_dt_model={flowEnv.dHLModel}
                terminalHeadlossM={terminalD2.total}
                cleanBedHeadloss_m={terminalD2.cleanBed}
              />
            </div>
          </div>
        )}

        {tab === "compare-coag" && (
          <div>
            <SectionHeader number="09" title="Like-for-like comparison: coagulation"
              caption="Filter performance under coagulation (maximum turbidity). D1 runs ferric, D2 runs alum, so the precipitate deposit structure factor differs per design. Set both feed TSS values equal for a pure filter-design comparison; set them unequal to mirror as-built clarifier carryover." />
            <LikeForLikeComparison mode="coagulation" filterD1={filterD1} filterD2={filterD2} feedD1={feedD1} feedD2={feedD2} />
          </div>
        )}

        {tab === "compare-soft" && (
          <div>
            <SectionHeader number="09" title="Like-for-like comparison: lime softening"
              caption="Filter performance under 100% lime softening at pH 10. Both designs carry a CaCO3-dominant precipitate. Set both feed TSS values equal for a pure filter-design comparison; set them unequal (e.g. D1 11.6 vs D2 42.4) to mirror as-built clarifier carryover." />
            <LikeForLikeComparison mode="softening" filterD1={filterD1} filterD2={filterD2} feedD1={feedD1} feedD2={feedD2} />
          </div>
        )}

        {tab === "physics" && <PhysicsTab />}

        {tab === "report" && (
          <ReportTab
            onDownloadCSV={handleDownloadCSV}
            onDownloadPDF={handleDownloadPDF}
            pdfBusy={pdfBusy} pdfError={pdfError}
            reportNameD1={reportNameD1} setReportNameD1={setReportNameD1}
            reportNameD2={reportNameD2} setReportNameD2={setReportNameD2}
            reportPreparedBy={reportPreparedBy} setReportPreparedBy={setReportPreparedBy}
          />
        )}
      </main>

      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="max-w-7xl mx-auto px-6 lg:px-10 pt-10 pb-6">
      <div className="flex items-start justify-between gap-8">
        <div>
          <div className="eyebrow mb-2">Filter Performance Comparator</div>
          <h1 className="font-display text-5xl lg:text-6xl leading-none" style={{ letterSpacing: "-0.02em" }}>
            Filter loading,<br />
            <em style={{ color: "var(--rust)" }}>K-derivation & redundancy</em>
          </h1>
        </div>
        <div className="hidden lg:block text-right max-w-sm">
          <p className="font-display italic text-base leading-snug" style={{ color: "var(--ink-700)" }}>
            Inputs as min / avg / max envelopes; solids load, K, loading at N/N-1/N-2, hydraulic redundancy and plant capacity all computed for all three scenarios.
          </p>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="max-w-7xl mx-auto px-6 lg:px-10 py-10 mt-20" style={{ borderTop: "0.5px solid var(--ink-300)" }}>
      <div className="grid md:grid-cols-3 gap-8 text-xs" style={{ color: "var(--ink-500)" }}>
        <div><div className="eyebrow mb-2">About</div><p>Filter-focused performance comparator with min / avg / max envelope inputs and three-scenario outputs.</p></div>
        <div><div className="eyebrow mb-2">Method</div><p>Kozeny-Carman / Ergun / Rose; Mints (1966), Tien (1989); Crittenden et al. (2012); Kawamura (2000); manufacturer underdrain literature.</p></div>
        <div><div className="eyebrow mb-2">Disclaimer</div><p>Decision-support tool. Engineering judgement should be applied.</p></div>
      </div>
    </footer>
  );
}

function SectionHeader({ number, title, caption }) {
  return (
    <div className="mb-8">
      <div className="eyebrow mb-2">{number}</div>
      <h2 className="font-display text-4xl leading-tight" style={{ letterSpacing: "-0.015em" }}>{title}</h2>
      {caption && <p className="font-display italic text-base mt-2 max-w-2xl" style={{ color: "var(--ink-500)" }}>{caption}</p>}
      <div className="rule-thick mt-4" />
    </div>
  );
}

function CleanBedSummary({ designerId, filter, cleanBed, flowMLD }) {
  const totalArea = totalFilterArea(filter.numFilters, filter.areaPerFilter_m2);
  const v = filtrationVelocity(flowMLD, totalArea);
  const v_mh = v * 3600;
  const underdrainName = UNDERDRAIN_LIBRARY[filter.underdrain].name;
  const underdrainRefH = UNDERDRAIN_LIBRARY[filter.underdrain].typical_headloss_m;
  const underdrain_dH = underdrainHeadloss(filter.underdrain, v);
  const cleanBedPlusUnderdrain = cleanBed.total_m + underdrain_dH;
  const fractionOfDriving = filter.drivingHead_m > 0 ? (cleanBedPlusUnderdrain / filter.drivingHead_m) * 100 : 0;

  return (
    <div className="p-4" style={{ background: "var(--paper-dark)", border: "0.5px solid var(--ink-300)" }}>
      <div className="eyebrow mb-2">{designerId} — Clean bed + underdrain headloss (at max design flow, N filters)</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs tabular mb-3">
        <div>Total area</div><div className="text-right">{totalArea.toFixed(1)} m²</div>
        <div>Filtration velocity</div><div className="text-right">{v_mh.toFixed(2)} m/h</div>
      </div>
      <table className="data">
        <thead>
          <tr><th>Component</th><th>Detail</th><th className="text-right">UC corr.</th><th className="text-right">ΔH (m)</th></tr>
        </thead>
        <tbody>
          {cleanBed.layers.map((l, i) => (
            <tr key={i}>
              <td className="font-mono">Media L{i + 1}</td>
              <td>{l.media} · {l.depth_m.toFixed(2)} m · d_e {l.d_mm} mm · UC {(l.uc ?? 1.0).toFixed(2)}</td>
              <td className="num" style={{ color: l.ucCorrection > 1.01 ? "var(--rust)" : "var(--ink-500)", fontSize: 11 }}>
                ×{(l.ucCorrection ?? 1.0).toFixed(2)}
              </td>
              <td className="num">{l.dH_m.toFixed(3)}</td>
            </tr>
          ))}
          <tr style={{ borderTop: "0.5px solid var(--ink-300)" }}>
            <td className="font-mono" style={{ fontWeight: 600 }}>Media subtotal</td>
            <td style={{ fontStyle: "italic", color: "var(--ink-500)" }}>
              {cleanBed.layers.length} layer{cleanBed.layers.length === 1 ? "" : "s"}, {cleanBed.layers.reduce((a, l) => a + l.depth_m, 0).toFixed(2)} m total ·{" "}
              {cleanBed.ucCorrectionApplied === false
                ? "UC correction off"
                : (cleanBed.total_m > cleanBed.total_m_uniform * 1.01
                    ? `${(cleanBed.total_m_uniform).toFixed(3)} m before UC correction`
                    : "UC correction applied (≈ 0% net effect — UC ≈ 1.0)")}
            </td>
            <td></td>
            <td className="num" style={{ fontWeight: 600 }}>{cleanBed.total_m.toFixed(3)}</td>
          </tr>
          <tr>
            <td className="font-mono">Underdrain</td>
            <td>{underdrainName} · ref {underdrainRefH.toFixed(2)} m @ 5 m/h, scaled v²</td>
            <td></td>
            <td className="num">{underdrain_dH.toFixed(3)}</td>
          </tr>
          <tr style={{ borderTop: "1px solid var(--ink-700)", background: "rgba(176, 69, 31, 0.05)" }}>
            <td className="font-mono" style={{ fontWeight: 700 }}>Total clean bed + underdrain</td>
            <td style={{ fontStyle: "italic", color: "var(--ink-500)" }}>
              {fractionOfDriving.toFixed(0)}% of {filter.drivingHead_m.toFixed(2)} m driving head
            </td>
            <td></td>
            <td className="num" style={{ fontWeight: 700, color: cleanBedPlusUnderdrain > filter.drivingHead_m ? "var(--rust)" : "var(--ink-900)" }}>
              {cleanBedPlusUnderdrain.toFixed(3)}
            </td>
          </tr>
        </tbody>
      </table>
      {cleanBedPlusUnderdrain > filter.drivingHead_m && (
        <p className="text-xs italic mt-2" style={{ color: "var(--rust)", fontFamily: "Source Serif 4, serif" }}>
          Clean bed + underdrain alone exceeds available driving head — no budget remaining for Mints-Tien load.
        </p>
      )}
    </div>
  );
}

function PhysicsTab() {
  return (
    <div>
      <SectionHeader number="09" title="Physics & references" caption="The mathematical basis for every output." />
      <div className="max-w-3xl space-y-8 font-display">
        {Object.entries(PHYSICS_NOTES).map(([key, text]) => (
          <div key={key}>
            <div className="whitespace-pre-wrap text-[15px] leading-relaxed">
              {text.split("\n").map((line, i) => {
                if (line.startsWith("**") && line.endsWith("**")) {
                  return <h4 key={i} className="font-display text-xl mt-4 mb-2">{line.replace(/\*\*/g, "")}</h4>;
                }
                return <p key={i} className="mb-1">{line}</p>;
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="rule-thick my-10" />
      <h3 className="font-display text-3xl mb-6">References</h3>
      <ol className="space-y-3 max-w-3xl">
        {REFERENCES.map((r) => (
          <li key={r.id} className="font-display text-[15px] leading-relaxed">
            <span className="font-mono text-xs" style={{ color: "var(--rust)" }}>[{r.id}]</span>{" "}
            {r.citation}{" "}<em style={{ color: "var(--ink-500)" }}>— {r.used_for}</em>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ReportTab({ onDownloadCSV, onDownloadPDF, pdfBusy, pdfError,
                     reportNameD1, setReportNameD1, reportNameD2, setReportNameD2,
                     reportPreparedBy, setReportPreparedBy }) {
  return (
    <div>
      <SectionHeader number="10" title="Report & data export" caption="Download the consultant-grade report or the raw assessment data — covers all three scenarios." />

      <div className="mb-8 p-5 max-w-4xl" style={{ background: "var(--paper-dark)", border: "0.5px solid var(--ink-300)" }}>
        <div className="eyebrow mb-1">Report details</div>
        <p className="font-display italic text-sm mb-4" style={{ color: "var(--ink-700)" }}>
          The tool uses the neutral D1 and D2 labels throughout. The exported report can show
          real designer or firm names instead. Leave a field blank to keep the generic label.
        </p>
        <div className="grid grid-cols-2 gap-6 mb-4">
          <div>
            <div className="eyebrow mb-1" style={{ fontSize: 9, color: "var(--rust)" }}>D1 report name</div>
            <input type="text" placeholder="Designer 1"
              value={reportNameD1}
              onChange={(e) => setReportNameD1(e.target.value)}
              style={{ width: "100%", fontFamily: "Inter Tight, sans-serif", fontSize: 13, padding: "4px 6px" }} />
          </div>
          <div>
            <div className="eyebrow mb-1" style={{ fontSize: 9, color: "#3F5870" }}>D2 report name</div>
            <input type="text" placeholder="Designer 2"
              value={reportNameD2}
              onChange={(e) => setReportNameD2(e.target.value)}
              style={{ width: "100%", fontFamily: "Inter Tight, sans-serif", fontSize: 13, padding: "4px 6px" }} />
          </div>
        </div>
        <div>
          <div className="eyebrow mb-1" style={{ fontSize: 9 }}>Prepared by</div>
          <input type="text" placeholder="Name, title, organisation"
            value={reportPreparedBy}
            onChange={(e) => setReportPreparedBy(e.target.value)}
            style={{ width: "100%", fontFamily: "Inter Tight, sans-serif", fontSize: 13, padding: "4px 6px" }} />
        </div>
      </div>

      <div className="mb-6 p-8 max-w-4xl" style={{ background: "var(--paper-dark)", border: "0.5px solid var(--ink-300)" }}>
        <div className="eyebrow mb-2" style={{ color: "var(--rust)" }}>PDF report</div>
        <h3 className="font-display text-2xl mb-3">Filter performance assessment report</h3>
        <p className="font-display italic text-sm mb-5" style={{ color: "var(--ink-700)" }}>
          The full consultant report as a formatted PDF: dual-mode comparison (coagulation and
          lime softening), filter design, head budget, backwash water, sensitivity to a 100%
          feed-solids deterioration, robustness and resilience, differences and opportunities,
          and a risk register. Generated from the current filter inputs, with charts. Uses the
          designer names entered above.
        </p>
        <button className="primary" onClick={onDownloadPDF} disabled={pdfBusy}>
          {pdfBusy ? "Generating PDF…" : "Download PDF report"}
        </button>
        {pdfError && (
          <p className="text-sm mt-3" style={{ color: "var(--rust)" }}>{pdfError}</p>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-10 max-w-4xl">
        <div className="p-8" style={{ background: "var(--paper-dark)", border: "0.5px solid var(--ink-300)" }}>
          <div className="eyebrow mb-2">Data</div>
          <h3 className="font-display text-2xl mb-3">Assessment data</h3>
          <p className="font-display italic text-sm mb-5" style={{ color: "var(--ink-700)" }}>
            CSV: one row per (designer × scenario) with derived metrics and loading by N/N-1/N-2.
          </p>
          <button className="primary" onClick={onDownloadCSV}>Download .csv data</button>
        </div>
      </div>
    </div>
  );
}
