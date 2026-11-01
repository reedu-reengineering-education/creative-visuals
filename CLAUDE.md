# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Lichtwerk: projection mapping for kids (8–16). Kids trace real objects on a tablet, give the strokes light effects, and program them with Blockly blocks. Optional senseBox sensors over Web Bluetooth make the light react to the room. Next.js App Router + TypeScript + Blockly + zustand. Everything runs client-side; there is no backend.

`README.md` is partly outdated: it still describes the old static effects panel. This file is current.

UI language is German first (`de` is the master dictionary), English second. Target devices: iPad (Safari) mirrored to a projector, or laptop + separate output window.

## Commands

```bash
npm run dev          # http://localhost:3000
npm run typecheck    # tsc --noEmit — the only automated check
npm run build
npm run start -- -H 0.0.0.0   # serve on the LAN for a workshop
```

There are no tests and no linter. Verify changes with `npm run typecheck` and by running the app. `next.config.ts` has `allowedDevOrigins` for testing from an iPad on the LAN. Web Bluetooth and PWA install need HTTPS or `localhost`.

## Architecture

### Data model (`src/lib/types.ts`)
A `Project` holds `groups` (one per pen colour, named by the kids), `strokes` (points normalised to 0..1 stage space, `closed` = fillable shape, `z` = layer), `aspect`, and `program` (raw Blockly serialisation JSON). A stroke's **number** is its drawing order within its group; its **layer** (`z`) is separate, so reordering layers never renumbers.

`groupEffects` / `strokeEffects` are legacy. `migrateStaticEffects` in `src/lib/store.ts` converts them into clips of a start timeline on load. **All effects now live in the program.**

### The program is the single source of truth
Effects are expressed only as blocks in `project.program` (Blockly JSON). The pipeline:

1. **Blocks** — defined in `src/components/blocks/defs.ts` (block types are `lw_*`; dropdowns pull from `palette.ts` and `sensors.ts` at runtime).
2. **Timeline view** — `src/lib/timeline.ts` parses each hat-block script. A script made only of `effect`, `effect_one` and `wait` blocks (optionally wrapped in one `forever`) is shown as an editable timeline (`TimelineDock.tsx`, used in Effects mode, with `EffectsPanel.tsx` as the clip inspector). `parseScript` simulates the blocks to recover clips. `timelineToBlocks` regenerates the script: at every clip start or end it emits state changes, emits "off" for groups that have clips but none active, and re-emits item clips after a group statement. Editing the timeline rewrites only that script, keeping the same hat id and position. Any other script is shown as a locked "Code" tab.
3. **Compile** — Blockly JSON → `Script[]` (the JSON AST in `src/lib/program.ts`). **There are two compilers that must stay in sync:**
   - `src/lib/blockJson.ts` `compileProgramJson` works on raw JSON without Blockly. The interpreter uses it via `compileCurrentProgram()`.
   - `src/components/blocks/compile.ts` `workspaceToScripts` works on a live Blockly workspace. `CodeMode.tsx` uses it only for the `</>` code view. It is a candidate for replacement by `blockJson.ts`.
   Adding or changing a block means updating `defs.ts`, both compilers, `program.ts` (`Stmt`/`Trigger` + `programToCode`), the interpreter, and possibly `timeline.ts`.
4. **Run** — `src/lib/runtime.ts` `Interpreter` runs each script as a generator coroutine on a virtual clock (supports pause, seek, and live restart with `restartKeepingTime`). Triggers: start, key, tap, sensor condition (edge-triggered). Its output is `overrides: Record<strokeId, RuntimeOverride>` in the `useRuntime` store. Start scripts are layered below event-triggered ones. Setting the same effect again (e.g. inside `forever`) does not restart its animation. `sequential` (a 0.3 s stagger by number) is applied at render time. Timeline scripts fired by events set `clearOnEnd` so their effect disappears when they finish.
5. **Render** — `src/lib/render.ts` `renderStage` draws the project plus overrides onto a canvas each frame (`switch` over `EffectType`). The more elaborate effects live in `src/lib/fx.ts`. Colours (`rainbow`, `group`, `random`) are resolved per stroke in `palette.ts` `resolveColor`.

Adding an effect touches: `EffectType` in `types.ts`, `EFFECTS` in `palette.ts` (category, which settings it `uses`, its `dirs`, a `maxSpeed` if it flashes), the `effect.*` i18n keys, a preview in `EFFECT_PREVIEW` (`Icons.tsx`), and the render switch (plus `fx.ts` if it's elaborate).

### Effect settings (`src/lib/params.ts`)
Every effect statement carries optional `EffectParams`: speed (time multiplier), size (line-width multiplier), brightness (0..1, drawn through an offscreen layer with lower opacity), direction, a second colour, the text of `text` and the source of `number` (sensor id, `timer` or `clock`). In Blockly they live in the `SET` field of `lw_effect` / `lw_effect_one` as a JSON string holding only non-default values (`encodeParams`), so old projects need no migration. The field is `FieldSettings` in `gridFields.tsx` (shows a ⚙ summary, opens `EffectSettings.tsx`); the clip inspector uses the same component and timeline clips carry `params`. Effects that flash are capped via `maxSpeed` to stay under ~3 flashes per second (photosensitivity).

### Stores (zustand)
- `useProject` (`store.ts`): the project, undo, and autosave to localStorage key `lichtwerk.project.v1`.
- `useRuntime` (`runtime.ts`): running/paused state, overrides, compiled scripts, output-window connection.
- `useSensors` (`sensors.ts`): live values and history per channel, BLE status, discovered channels.
- `useTimelineUi` (`timelineUi.ts`): timeline UI state only.
- `useLang` (`i18n.ts`): language, stored in `lichtwerk.lang`.

`Editor.tsx` `useRuntimeDriver` owns the requestAnimationFrame program clock, keyboard input and output-window sync.

### Editor ↔ output window
`/output` (`OutputView.tsx`) only renders. The editor owns project, program and sensors and pushes them over `BroadcastChannel("lichtwerk")` (`src/lib/sync.ts`); the output sends back keys and taps. Messages are designed to go over a network relay later (iPad editor → laptop output is planned, not built).

### Sensors (`src/lib/sensors.ts`)
The BLE profile follows senseBox:bike: service `cf06a218-f68e-e0be-ad04-8ebc1eb0bc84`, device name prefix `senseBox`, one notify characteristic per phenomenon, payload = float32 little-endian values (one channel per float). Known characteristics map to channels in `CHARACTERISTICS`. Unknown ones are added at runtime as "Sensor XXXX" channels. Loudness has `uuid: null` until the firmware sends it. Safari on iPadOS has no Web Bluetooth.

### i18n (`src/lib/i18n.ts`)
`en` is typed as `typeof de`, so every new key must be added to both dictionaries or typecheck fails. Use `useT()` in components (re-renders on language change) and `t()` outside React (Blockly definitions, stores).

### Decisions to respect
These were settled with the user. Don't reopen them without being asked:
- Web app only. **No Capacitor**, no Flutter. A thin hand-written Swift wrapper is the fallback idea for iPad-only setups.
- Blockly, not a node editor.
- Kids trace live in projector space (no photo tracing, no calibration or warping), freehand with automatic cleanup.
- Groups are pen colours named by the kids, not fixed labels.
- Strokes are numbered automatically by drawing order.
- Pinned versions: Next 16, React 19, Blockly 13, zustand 5, TypeScript 5.9 (deliberately not TS 7).
- Custom Blockly renderer (a `zelos` subclass in `blocks/defs.ts`) plus visual grid pickers (`blocks/gridFields.tsx`) instead of long text dropdowns.

### Hardware constraints
- Safari on iPadOS (and every iPad browser) has no Web Bluetooth, so BLE works only in Chrome/Edge on a laptop, Android or ChromeOS. Workarounds discussed: the laptop as a BLE hub, a Wi-Fi/MQTT bridge, the Bluefy/WebBLE browsers, or a native Swift wrapper.
- A real second screen from iPad Safari needs Stage Manager on an M1+ iPad.
- An iPad mirrors to the projector, so the UI itself is projected. That is why the UI is dark ("black = no light") and why Show mode exists.
- Everything uses pointer events with `touch-action: none` on canvases and tracks. Long-press is 550 ms. A two-finger tap leaves Show mode.
- Nothing has been tested on a real iPad, projector or senseBox yet. Testing so far was headless Chromium at iPad size.

### Pending product decisions (ask before changing)
- The timeline may be too complicated for kids: simplify it (e.g. only the start tab) or replace it.
- Should a group go dark ("off") outside its clips (the current behaviour) or fall back to plain lines?

### Open gaps and TODOs
- Loudness has no BLE characteristic yet.
- No cross-device sync. The planned route is a WebSocket server or WebRTC.
- Multiple senseBoxes at once are not supported.
- Group dropdowns in blocks show a plain "●" instead of the group colour. This needs a custom field like `gridFields.tsx`.
- The C-block bottom bar is full width; the design had it shorter.
- Editing the program while an event timeline plays stops that event, because `restartKeepingTime` only respawns start scripts.
- Ideas: number strokes by position, corner-pin warp, variables, a "sensor value → brightness/colour" block, accounts and sharing.
- First candidates for unit tests: the timeline ↔ blocks roundtrip and the interpreter.

### Legacy code that can go
- `groupEffects` / `strokeEffects` and the static-effect branch in `render.ts` `resolve`. They are only used for migration and the non-running preview.
- `exampleProgram()` in `blocks/defs.ts`.
- `components/blocks/compile.ts` (see above).
- `EffectsPanel.tsx` is now the clip inspector and should be renamed.

### Tried and dropped
- **Capacitor, Flutter, pure native iOS:** the web covers laptops too and matches the team's skills.
- **Node-based visual programming:** Blockly fits the learning goal better.
- **Tracing on a photo:** perspective mismatch.
- **Polygon/point tracing:** too fiddly.
- **Fixed shape labels** (window, door, roof): only worked for houses.
- **Static per-group effects as a separate base layer under the program:** too confusing. It was replaced by the timeline-as-program model, and old projects are migrated.
- **Zelos default look and dark outlines between blocks:** replaced by the custom renderer, with a 3px gap in the background colour between stacked blocks.
- **Long text dropdowns for effects and colours:** replaced by grid pickers.
- **Blockly trash can and zoom buttons:** removed. Pinch/wheel zoom still works, and dragging a block onto the rail deletes it.

### Design reference
The look follows an early claude.ai Design canvas, "Projection Mapping MVP", with artboards Zeichnen / Effekte / Code / Show. The timeline UI was built in code without a design pass.

### Conventions
- Client-only code is marked `"use client"`. Blockly is loaded with `dynamic(..., { ssr: false })`.
- Path alias `@/*` → `src/*`.
- All styling is in `src/app/globals.css` (no CSS framework). Design tokens: Lexend, mint accent `#6EE7C8`, warm light `#FFD98A`, muted block colours with dark text.
