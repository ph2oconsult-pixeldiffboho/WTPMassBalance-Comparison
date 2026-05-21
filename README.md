# Filter Performance Comparator

Side-by-side comparison of two filter designs (Designer 1 vs Designer 2) for a water treatment plant.

## What it does

Given for each designer:
- **Feed TSS** (mg/L) — TSS into the filter from upstream treatment
- **Filter TSS removal %** — fraction of feed TSS captured by the filter
- **Total daily BW volume** (ML/d) and **volume per BW** (m³/filter)
- **Precipitate composition** — mass fractions of alum / ferric / CaCO₃ / Mg(OH)₂ / other

Plus filter geometry (number of filters, area per filter, media stack, underdrain, driving head, clean-bed equation, backwash sequence), the app derives:

- **Solids load and captured** (kg/d)
- **Filter loading rate at N, N-1, N-2** (kg/m²/d) — same load distributed across fewer filters
- **Filter run length** (h) — from BW frequency
- **K, solids holding capacity** (kg/m²/run) — derived from loading × run/24
- **K multiplier** from precipitate composition (alum-baseline framework)
- **σ specific deposit** (g/L) — K / bed depth
- **Hydraulic redundancy matrix** — terminal headloss at N/N-1/N-2 across design/peak/+BW conditions
- **Backwash 24-hour timeline** with single-BW policy and queue handling
- **Plant capacity impact** — net production after BW + FTW losses
- **dHL/dt** rate of headloss development (linear or Mints differential)

## Tabs

1. **Inputs** — plant flows, dHL/dt model, per-designer filter feed & backwash, precipitate composition
2. **Filter design** — full geometry editor + clean-bed summary + underdrain ΔH chart
3. **Backwash sequence** — phase durations (drain, BW, fill, FTW, RTS)
4. **Assessment** — derived solids load, run length, observed K, alum-equivalent K, loading by redundancy
5. **Precipitates** — narrative descriptions of each precipitate type and its impact on K
6. **Redundancy** — hydraulic check at N/N-1/N-2 × design/peak/+BW
7. **BW timeline** — 24-hour simulation, dHL/dt, plant capacity
8. **Physics** — equations and references
9. **Report** — Markdown report + CSV data export

## Defaults

- **Designer 1** (RGMF): 8 × 80.7 m², tri-media 0.80 m, block+IMS underdrain, 1.20 m driving head
- **Designer 2** (DMF): 6 × 121.6 m², dual-media 2.10 m (1.4 anth + 0.7 sand), block+IMS underdrain, 4.77 m driving head

All defaults are editable in the UI.

## Method

Kozeny-Carman / Ergun / Rose clean-bed equations; Mints (1966) and Tien (1989) for σ^(2/3) terminal headloss; Crittenden et al. (2012); Kawamura (2000); manufacturer underdrain literature for installed headloss values.

## Deployment

```bash
npm install
npm run dev      # local development at http://localhost:3000
npx next build   # production build
vercel --prod    # deploy to Vercel
```

## Aesthetic

Editorial engineering journal: Source Serif 4 / Inter Tight / JetBrains Mono on warm paper background with rust accents. Numbered tabs, hard rules, no card grids, no rounded boxes.

## Disclaimer

Decision-support tool. Engineering judgement should be applied.
