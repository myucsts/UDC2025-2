# Repository Guidelines

## Project Structure & Module Organization
The repository centers on `web/`, a Vite-powered React + TypeScript app. Front-end source lives in `web/src`, with core logic in `web/src/lib` (CSV parsing, geospatial utilities, Leaflet setup) and entry points in `App.tsx` and `main.tsx`. Static assets and map data ship from `web/public`, where `data/cooling-shelters.csv` is the canonical dataset and `data/cooling-shelters.sample.csv` supports local runs. Build artifacts land in `web/dist`; agent scripts belong under `web/scripts` so they can reuse TypeScript helpers via relative imports.

## Build, Test, and Development Commands
Run `npm install` inside `web/` once per environment. Use `npm run dev` for the hot-reloading dev server at `http://localhost:5173`, and `npm run build` to produce the release bundle (TypeScript project references then Vite build to `dist/`). `npm run preview` serves the built bundle for smoke checks. Enforce lint rules with `npm run lint`, and refresh open-data inputs using `npm run data:pull` (respects `COOLING_SHELTER_SOURCE_*` overrides).

## Coding Style & Naming Conventions
Code is TypeScript-first with ES modules; prefer named exports from feature modules and PascalCase React components. Follow the existing 2-space indent, trailing semicolons, and single quotes enforced by ESLint (`@eslint/js`, `typescript-eslint`, React Hooks plugins). Domain types live in `types.ts`; reuse them instead of redeclaring literals. Keep map configuration and parsing utilities inside `lib/` to separate side effects from UI components.

## Testing Guidelines
Automated testing is not yet configured; changes should ship with manual verification notes covering data fetch, location flow, and map rendering. When introducing tests, place Vitest specs alongside modules (e.g., `web/src/lib/geo.test.ts`) and mock fetch calls to avoid external OSRM usage. Target at least smoke coverage for routing helpers and CSV parsing before merging substantial logic.

## Data & Configuration Tips
Before running `npm run data:pull`, confirm the network can reach the Saitama open-data portal; when it cannot, point `COOLING_SHELTER_SOURCE_URL` to a mirrored CSV and set `COOLING_SHELTER_SOURCE_ENCODING` to match upstream encoding (Shift_JIS by default). Never commit personal data exports—only the sanitized CSVs under `public/data/`.

## Commit & Pull Request Guidelines
History is sparse, so adopt concise, imperative commits (e.g., `Add shelter search fallback handling`). Each pull request should describe the user impact, note any data or environment changes, list manual test steps, and attach relevant screenshots (map view, error modals) when UI changes are involved. Link to tracked issues and request review once lint/build succeed locally.
