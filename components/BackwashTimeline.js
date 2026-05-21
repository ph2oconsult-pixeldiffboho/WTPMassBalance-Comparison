// components/BackwashTimeline.js
import { timelineSimulation, steadyStateOfflineMetrics, plantCapacityImpact, headlossDevelopmentRate } from "../lib/backwashDynamics";

export default function BackwashTimeline({
  designerId, filter, runHours, designFlow_MLD, sigma_g_per_L,
  dHL_dt_model, terminalHeadlossM, cleanBedHeadloss_m,
}) {
  const seq = filter.bwSequence;
  const ss = steadyStateOfflineMetrics({ runHours, seq, numFilters: filter.numFilters });
  const sim = timelineSimulation({ numFilters: filter.numFilters, runHours, seq, stepMin: 5, durationHr: 24 });
  const cap = plantCapacityImpact({ filter, designFlow_MLD, runHours, seq, ssMetrics: ss });
  const dhl = headlossDevelopmentRate({
    model: dHL_dt_model,
    dH_clean_m: cleanBedHeadloss_m,
    dH_terminal_m: terminalHeadlossM,
    runHours,
    sigma_max_g_per_L: sigma_g_per_L,
  });

  return (
    <div>
      <h4 className="font-display text-xl mb-3">{designerId} — Backwash dynamics</h4>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <SummaryBlock title="Steady-state" rows={[
          ["Run length", `${runHours.toFixed(1)} h`],
          ["Sequence duration", `${ss.sequenceMin} min`],
          ["Cycles per filter per day", ss.cyclesPerFilterPerDay.toFixed(2)],
          ["Bank BW hours/day", `${ss.bankBWHoursPerDay.toFixed(2)} h`],
          ["Avg filters in service", ss.avgFiltersInService.toFixed(2)],
          ["Schedule feasible?", ss.isSequencingFeasible ? <span className="pass" key="1">Yes</span> : <span className="fail" key="2">No — over-scheduled</span>],
        ]} />

        <SummaryBlock title="Plant capacity" rows={[
          ["BWs per day (bank)", cap.N_bws_per_day.toFixed(1)],
          ["Total BW water", `${cap.total_BW_MLD.toFixed(2)} ML/d`],
          ["Total FTW water", `${cap.total_FTW_MLD.toFixed(2)} ML/d`],
          ["Total lost to BW+FTW", `${cap.total_lost_MLD.toFixed(2)} ML/d`],
          ["Net production", `${cap.net_production_MLD.toFixed(2)} ML/d`],
          ["Capacity deficit", <span key="d" className={cap.capacity_deficit_pct > 5 ? "fail" : "pass"}>{cap.capacity_deficit_pct.toFixed(2)}%</span>],
        ]} />
      </div>

      <SummaryBlock title={`Rate of headloss development (${dhl.model === "linear" ? "Linear" : "Mints differential"})`} rows={[
        ["Model", dhl.model === "linear" ? "Linear" : "Mints σ^(2/3) differential"],
        ["Average dHL/dt", `${dhl.average_m_per_h.toFixed(4)} m/h`],
        ["Instantaneous (end of run)", `${dhl.instantaneous_m_per_h.toFixed(4)} m/h`],
        ["Clean bed ΔH", `${cleanBedHeadloss_m.toFixed(3)} m`],
        ["Terminal ΔH", `${terminalHeadlossM.toFixed(3)} m`],
      ]} />

      <div className="mt-6">
        <div className="eyebrow mb-2">24-hour filter state timeline</div>
        <TimelineChart sim={sim} />
        <p className="text-xs italic mt-2" style={{ color: "var(--ink-500)", fontFamily: "Source Serif 4, serif" }}>
          Each row is one filter. Dark = producing, rust = in backwash, ochre = queued waiting for BW slot. Initial run-end times staggered evenly across the bank.
        </p>
      </div>
    </div>
  );
}

function SummaryBlock({ title, rows }) {
  return (
    <div>
      <div className="eyebrow mb-2">{title}</div>
      <table className="data">
        <tbody>
          {rows.map(([k, v], i) => (
            <tr key={i}><td>{k}</td><td className="num">{v}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TimelineChart({ sim }) {
  if (!sim || !sim.steps || sim.steps.length === 0) return null;
  const numFilters = sim.steps[0].filterStates.length;
  const totalSteps = sim.steps.length;
  const cellW = 100 / totalSteps;

  const colourFor = (state) => {
    if (state === "producing") return "#1A1F26";
    if (state === "bw")         return "#B0451F";
    if (state === "queued")     return "#C8961A";
    return "#E8EAEE";
  };

  return (
    <div style={{ background: "var(--paper-dark)", padding: 12, border: "0.5px solid var(--ink-300)" }}>
      {Array.from({ length: numFilters }, (_, fi) => (
        <div key={fi} className="flex items-center gap-2 mb-1">
          <div className="font-mono text-xs" style={{ width: 24, color: "var(--ink-500)" }}>F{fi + 1}</div>
          <svg viewBox={`0 0 ${totalSteps} 1`} preserveAspectRatio="none" style={{ width: "100%", height: 16, display: "block" }}>
            {sim.steps.map((s, si) => {
              const state = s.filterStates[fi].state;
              return <rect key={si} x={si} y={0} width={1.02} height={1} fill={colourFor(state)} />;
            })}
          </svg>
        </div>
      ))}
      <div className="flex justify-between mt-2 font-mono text-xs" style={{ color: "var(--ink-500)" }}>
        <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>24h</span>
      </div>
      <div className="flex gap-4 mt-3 text-xs">
        <Legend colour="#1A1F26" label="Producing" />
        <Legend colour="#B0451F" label="In backwash" />
        <Legend colour="#C8961A" label="Queued for BW" />
      </div>
    </div>
  );
}

function Legend({ colour, label }) {
  return (
    <div className="flex items-center gap-2">
      <div style={{ width: 12, height: 12, background: colour }} />
      <span style={{ color: "var(--ink-700)" }}>{label}</span>
    </div>
  );
}
