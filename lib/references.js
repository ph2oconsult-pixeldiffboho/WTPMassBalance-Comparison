// lib/references.js
export const REFERENCES = [
  { id: "MWH2012",     citation: "Crittenden, J.C., Trussell, R.R., Hand, D.W., Howe, K.J., Tchobanoglous, G. (2012). MWH's Water Treatment: Principles and Design, 3rd ed., Wiley.", used_for: "Kozeny-Carman and Ergun clean-bed equations; filter run length formulae." },
  { id: "Mints1966",   citation: "Mints, D.M. (1966). Modern theory of filtration. International Water Supply Association, Special Report No. 10.", used_for: "Specific deposit σ and σ^(2/3) terminal headloss relationship." },
  { id: "Tien1989",    citation: "Tien, C. (1989). Granular Filtration of Aerosols and Hydrosols, Butterworth.", used_for: "Pore-clogging limit σ ≈ 4 g/L above which Mints relationship becomes super-quadratic." },
  { id: "Kawamura2000",citation: "Kawamura, S. (2000). Integrated Design and Operation of Water Treatment Facilities, 2nd ed., Wiley.", used_for: "Underdrain headloss coefficients (Table 7-6), filter geometry guidance." },
  { id: "Cleasby1999", citation: "Cleasby, J.L., Logsdon, G.S. (1999). Granular bed and precoat filtration. In: Water Quality and Treatment, 5th ed., AWWA.", used_for: "Rose equation for clean-bed headloss; coagulant floc filterability." },
  { id: "Edzwald2011", citation: "Edzwald, J.K. (ed.) (2011). Water Quality and Treatment, 6th ed., AWWA/McGraw-Hill.", used_for: "Floc characteristics by coagulant type; filterability of alum vs ferric flocs." },
  { id: "AWWA-M30",    citation: "AWWA (2016). Manual M30: Precoat Filtration and Lime Softening, 3rd ed.", used_for: "CaCO₃ and Mg(OH)₂ floc properties; carryover effects on filter performance." },
  { id: "AWWA-M37",    citation: "AWWA (2011). Manual M37: Operational Control of Coagulation and Filtration Processes, 3rd ed.", used_for: "Backwash sequencing; filter floc characterisation." },
  { id: "Amirtharajah1978", citation: "Amirtharajah, A. (1978). Optimum backwashing of sand filters. Journal of Environmental Engineering, 104(EE5), 917-932.", used_for: "Backwash sequence design and FTW ripening period." },
  { id: "FWRJ-LimeSoft", citation: "Florida Water Resources Journal (2020). Lime Softening—the Forgotten Technology: Optimisation of an Existing Plant. November 2020 Tech Article.", used_for: "Case-study evidence that CaCO₃ continuing to precipitate on filter media causes rapid headloss buildup and underdrain calcification." },
  { id: "Boller-Blaser-1998", citation: "Boller, M.A., Blaser, S. (1998). Particles under stress. Water Science and Technology, 37(10), 9-29.", used_for: "Floc strength, density, and filterability theory for coagulant-derived solids." },
  { id: "Yu-2017",     citation: "Yu, W., Gregory, J., Campos, L., Graham, N. (2017). Influence of coagulation mechanisms and floc formation on filterability. Journal of Environmental Sciences, 57, 17-23.", used_for: "Comparative filter run characteristics for charge-neutralisation vs sweep-floc alum coagulation." },
];

export const PHYSICS_NOTES = {
  solidsLoad: `**Solids load into filter**
  Mass into filter (kg/d) = feed TSS (mg/L) × flow (ML/d)
The arithmetic identity comes from unit cancellation: 1 mg/L × 1 ML/d = 1 kg/d.
Solids captured by the filter = Mass × removal % / 100.`,

  filterLoading: `**Filter loading rate by redundancy condition**
At each condition the same captured solids are distributed across the in-service area:
  Loading (kg/m²/d) = Captured (kg/d) / (Filters in service × Area per filter)
The N-1 condition simulates one filter offline (for BW or maintenance), N-2 simulates two.`,

  runLengthDerivation: `**Run length derived from observed BW frequency**
User supplies total daily BW water (ML/d) and the volume used per single filter BW (m³).
  BWs per day, bank-wide = total BW (ML/d × 1000) / volume per BW (m³)
  BWs per filter per day = BWs per day / N filters
  Cycle time per filter (h) = 24 / BWs per filter per day
  Run length (h) = cycle time − sequence duration (drain + BW + fill + FTW + RTS)`,

  K_derivation: `**K — solids holding capacity per run**
  K (kg/m²/run) = Loading rate (kg/m²/d) × run length (h) / 24
K is the operating mass capture per unit filter area between backwashes.
Specific deposit σ (g/L) = K / L where L is total bed depth.
Mints-Tien relationship is valid up to σ ≈ 4 g/L; beyond this, pore clogging dominates and headloss rises super-quadratically.`,

  precipitateK: `**K varies with precipitate morphology**
Different precipitates have very different floc structures and packing densities, so the K achievable at a given terminal headloss varies substantially by feed composition.

Magnesium hydroxide — Mg(OH)₂ from lime softening forms highly gelatinous, low-density (~1.001-1.003 g/cm³) flocs with <1% dry solids. Plugs pores aggressively. K multiplier ~0.5 vs alum baseline.

Alum (Al(OH)₃) — gelatinous flocs, density 1.001-1.005 g/cm³, dry solids 0.5-2%. Filterable but compress under headloss buildup. Taken as the K baseline (1.00×).

Ferric (Fe(OH)₃) — denser and smaller than alum (density 1.005-1.015 g/cm³). Penetrates deeper into the bed, distributing the deposit more uniformly. K multiplier ~1.3 vs alum.

Calcium carbonate (CaCO₃) — dense crystalline precipitate (calcite ρ = 2.7 g/cm³, floc ρ = 1.05-1.20 g/cm³). Highest filterability when well-formed and arriving as a settled-clarifier carryover. K multiplier ~1.7 vs alum.

The effective K multiplier is the mass-weighted average across precipitate types in the feed. Note: if CaCO₃ is precipitating on the filter media (rather than arriving as a pre-formed precipitate), the effect is opposite — rapid calcification and K collapse. Effective recarbonation upstream of the filter is essential.`,

  cleanBed: `**Clean bed headloss — three equations user-selectable**
Kozeny-Carman: ΔH/L = 180·μ·(1−ε)²·v / (ρ·g·ε³·φ²·d²)
Ergun:         ΔH/L = 150·μ·(1−ε)²·v / (ρ·g·ε³·φ²·d²) + 1.75·(1−ε)·v² / (g·ε³·φ·d)
Rose:          ΔH/L = 1.067·C_D·v²·(1−ε) / (φ·g·ε⁴·d) with C_D = 24/Re + 3/√Re + 0.34
Each media layer is summed across the stack depth.

The grain diameter d is taken as the effective size d_e = d₁₀ (the sieve size passing 10% of the medium by mass), since the small grains dominate headloss.`,

  ucCorrection: `**Uniformity coefficient correction (Cleasby-Logsdon)**
Real filter media is not uniformly sized — grain sizes follow a distribution. The uniformity coefficient UC = d₆₀ / d₁₀ captures this. A perfectly uniform medium has UC = 1.0; typical filter sand has UC = 1.3-1.5; coarse graded material can be 1.7+.

The published clean-bed equations are calibrated against d₁₀, but a non-uniform medium has more fines than the d₁₀ alone implies — and those fines generate disproportionate headloss. Cleasby & Logsdon (1999) give a correction:

  ΔH_corrected = ΔH(d₁₀) × [1 + 1.3 × (UC − 1)]

At UC = 1.0 (uniform): correction factor 1.00
At UC = 1.3 (good filter sand): factor 1.39 → ~40% extra headloss
At UC = 1.5 (typical sand): factor 1.65
At UC = 1.7 (graded): factor 1.91

The correction is applied per layer with each layer's own UC. The reported ΔH already includes the UC adjustment; the unadjusted ΔH is shown in the clean-bed table notes for reference.

UC also affects K (solids holding capacity): higher UC concentrates fines at the top after backwash stratification, reducing depth utilisation and lowering K at the same headloss budget. This is captured indirectly via the observed K derived from BW frequency, not explicitly via a UC-K formula.`,

  underdrainLoss: `**Underdrain headloss**
  ΔH(v) = ΔH_ref · (v / v_ref)²  with v_ref = 5 m/h
Reference values published by manufacturers and design literature for installed all-in systems (block + cap/gravel + outlet pipework).`,

  terminalHeadloss: `**Terminal headloss check**
  ΔH_term = ΔH_clean_bed + ΔH_underdrain + ΔH_load + ΔH_appurtenances
  ΔH_load = 0.92 · σ_eff^(2/3) (Mints–Tien)
  σ_eff = (K / L_bed) / K_multiplier   where multiplier comes from the precipitate composition
Hydraulic feasibility: ΔH_term ≤ available driving head.`,

  headBudget: `**Head budget vs K (the K/head relationship)**
For a given filter geometry and flow, the terminal head ΔH required is a function of K:

  ΔH_term(K) = ΔH_clean_bed(v) + ΔH_underdrain(v) + ΔH_load(K) + ΔH_appurt

The first two terms depend only on velocity (and so on flow and number of filters in service); the third is the only one that depends on K. Since ΔH_load = 0.92 · σ_eff^(2/3) and σ_eff = K/(L · multiplier), it follows that:

  ΔH_load(K) = 0.92 · (K / (L · multiplier))^(2/3)

K rises with the 3/2 power of the load-budget head. The local slope dK/dH starts low and grows as more head is spent, until σ approaches the Mints-Tien validity limit (~4 g/L). Beyond that, pore-clogging dominates and the σ^(2/3) form under-predicts headloss.

Three operating conditions matter: N (all filters in service), N-1 (one offline), N-2 (two offline). At each, the velocity (and so clean-bed and underdrain headloss) rises. N-2 is normally the capacity-limiting condition where the plant either throttles back or accepts degraded performance. N and N-1 are the conditions where the designer's stated K must actually be deliverable.

The Head budget tab plots K vs required terminal head for all three conditions with the available driving head as a horizontal reference line. If the observed K sits above the curve for N or N-1 at the available head, the design cannot deliver the claimed performance.`,

  temperature: `**Temperature compensation**
Water temperature affects clean-bed headloss strongly through dynamic viscosity μ(T):

  μ(T) = 2.414 × 10⁻⁵ × 10^(247.8 / (T_K − 140))   Pa·s, T in Kelvin

Across the 5-25 °C range typical of municipal raw water, μ varies by ~70%:
  • 5 °C: μ ≈ 1.52 mPa·s (cold winter)
  • 10 °C: μ ≈ 1.31 mPa·s (cold conservative design baseline)
  • 15 °C: μ ≈ 1.14 mPa·s
  • 20 °C: μ ≈ 1.00 mPa·s
  • 25 °C: μ ≈ 0.89 mPa·s (warm summer)

Density ρ(T) is much weaker (varies <0.4% over 0-30 °C). In Kozeny-Carman:
  ΔH = (180 μ (1-ε)² v) / (ρ g ε³ φ² d²)
the leading driver is μ (and ρ partly cancels), so headloss scales approximately linearly with μ.

The temperature input on the Filter design tab drives μ(T) and ρ(T) through all clean-bed and Ergun viscous-term calculations. Underdrain headloss uses v² scaling against a calibrated reference (assumed at ~15 °C in manufacturer data) and is treated as temperature-independent for this app's purposes — typically a small effect.

The Mints-Tien load (0.92 σ^(2/3)) is NOT temperature-compensated here. The 0.92 coefficient was calibrated against field operating data at typical temperatures (10-20 °C); applying a separate temperature factor would double-count effects. If you need a temperature-explicit load model, derive σ at the design temperature directly.

Practical guidance:
  • Cold-water design check: use minimum sustained winter raw water temperature (often 5-8 °C in temperate climates)
  • Typical-operation check: use annual average raw water temperature
  • BW efficiency check: use warm summer temperature (lower μ = less fluidisation at the same backwash rate)`,

  redundancy: `**Redundancy matrix (N, N-1, N-2)**
At each condition × flow scenario (design / peak / +BW), filtration velocity rises since the same flow is distributed across fewer filters. Clean bed (linearly for KC, with v² in Ergun/Rose) and underdrain (v²) headlosses scale accordingly.`,

  bwSequence: `**Backwash sequence**
Each cycle consists of drain-down → BW (air + water) → fill-up → filter to waste → return to service. Total t_seq is the sum. Sequencing policy here: bank-wide single backwash — only one filter in any phase at any time.`,

  bwTimeline: `**24-hour timeline simulation**
Filters are staggered evenly across the bank. At each time step, filters that complete their run start BW; if another filter is already in BW, they queue (FIFO). Exposes peak instantaneous loading and whether the schedule is feasible.`,

  plantCapacity: `**Plant capacity impact**
  Q_lost = N_BWs/day × V_per_BW                          (water used to BW)
  Q_FTW  = N_BWs/day × v_post_bw × A × t_FTW_seconds     (water sent to waste during ripening)
  Net production = Q_design − Q_lost − Q_FTW
A deficit > 5% indicates significant production loss.`,
};
