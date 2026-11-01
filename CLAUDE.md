# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Lichtwerk: projection mapping for kids (8–16). Kids trace real objects on a tablet, give the strokes light effects, and program them with Blockly blocks. Optional senseBox sensors over Web Bluetooth make the light react to the room. Next.js App Router + TypeScript + Blockly + zustand. Everything runs client-side; there is no backend.

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

**All effects live in the program.** Older projects are brought up to date on load and import by `src/lib/migrate.ts` (`migrateProject`): static per-group/per-stroke effects become clips of a start timeline, old blocks are rewritten (`lw_on_sensor` → `lw_when`, field-based `lw_if`/`lw_if_else` → `lw_if_then(_else)`, `lw_on_tap` → button 1), and merged effects are mapped (`depth` → `echo` inwards, `breathe` → `glow`, `water` → `level`), and a `number` effect with a sensor source becomes a `lw_show_value` block. So the rest of the code only knows current blocks and effects; when you remove or merge something, add a mapping there.

### The program is the single source of truth
Effects are expressed only as blocks in `project.program` (Blockly JSON). The pipeline:

1. **Blocks** — defined in `src/components/blocks/defs.ts` (block types are `lw_*`; dropdowns pull from `palette.ts` and `sensors.ts` at runtime).
2. **Timeline view** — `src/lib/timeline.ts` parses each hat-block script. A script made only of `effect`, `effect_one` and `wait` blocks (optionally wrapped in one `forever`) is a timeline. Effects mode (`TimelineDock.tsx`, with `ClipInspector.tsx`) shows **one "Wenn Start" timeline** (tabs only appear if an older program has several; "Neue Show" only if it has none): it is the no-code path (enough for primary school), everything interactive (buttons, keys, sensors, variables) is programmed in Code mode. `parseScript` simulates the blocks to recover clips. `timelineToBlocks` regenerates the script: at every clip start or end it emits state changes, emits "off" for groups that have clips but none active, and re-emits item clips after a group statement. Editing the timeline rewrites only that script, keeping the same hat id and position.
3. **Compile** — Blockly JSON → `Script[]` (the JSON AST in `src/lib/program.ts`) by `src/lib/blockJson.ts` `compileProgramJson`, the only compiler (the interpreter and the `</>` code view both use it). Value inputs compile to `Expr` (numbers, variables, sensor readings, random, arithmetic, comparisons, and/or/not); an empty input falls back to its shadow, then to 0 / false. Adding or changing a block means updating `defs.ts` (block + toolbox), `blockJson.ts`, `program.ts` (`Stmt`/`Expr`/`Trigger` + `programToCode`), the interpreter, and possibly `timeline.ts`.
4. **Run** — `src/lib/runtime.ts` `Interpreter` runs each script as a generator coroutine on a virtual clock (supports pause, seek, and live restart with `restartKeepingTime`). Triggers: start, key, on-screen button, `when` ("Wenn ⟨Bedingung⟩", starts each time the condition turns true), and `while` ("Solange ⟨Bedingung⟩"): the script starts when the condition turns true and is cleared (threads, layer, links, live numbers) when it turns false, so the shapes fall back to the Effects baseline. Variables live in the interpreter (by Blockly variable id, reset on every start, mirrored to `useRuntime.vars` for the variable monitor). `show` ("Zeige … auf …") sets the `number` effect with `params.value` and keeps re-evaluating its expression every tick while it is visible. Its output is `overrides: Record<strokeId, RuntimeOverride>` in the `useRuntime` store. Start scripts are layered below event-triggered ones. Setting the same effect again (e.g. inside `forever`) does not restart its animation. `sequential` (a 0.3 s stagger by number) is applied at render time. Timeline-shaped scripts fired by key/button/`when` set `clearOnEnd` so their effect disappears when they finish. Shapes without any effect (or while nothing runs) render as a plain white line.
5. **Render** — `src/lib/render.ts` `renderStage` draws the project plus overrides onto a canvas each frame (`switch` over `EffectType`). The more elaborate effects live in `src/lib/fx.ts`. Colours (`rainbow`, `group`, `random`) are resolved per stroke in `palette.ts` `resolveColor`.

Adding an effect touches: `EffectType` in `types.ts`, `EFFECTS` in `palette.ts` (category, which settings it `uses` incl. `amount`/`source`, its `dirs`, a `maxSpeed` if it flashes), the `effect.*` i18n keys, a preview in `EFFECT_PREVIEW` (`Icons.tsx`), and the render switch (plus `fx.ts` if it's elaborate).

### Effect settings (`src/lib/params.ts`)
Every effect statement carries optional `EffectParams`: speed (time multiplier), size (line-width multiplier), brightness (0..1, drawn through an offscreen layer with lower opacity), direction, a second colour, the text of `text`/`banner`, the `amount` of particles and the source of `number` (`timer` or `clock`). In Blockly they live in the `SET` field of `lw_effect` / `lw_effect_one` as a JSON string holding only non-default values (`encodeParams`), so old projects need no migration. The field is `FieldSettings` in `gridFields.tsx` (shows a ⚙ summary, opens `EffectSettings.tsx`); the clip inspector uses the same component and timeline clips carry `params`. Effects that flash are capped via `maxSpeed` to stay under ~3 flashes per second (photosensitivity).

### Stores (zustand)
- `useProject` (`store.ts`): the project, undo, and autosave to localStorage key `lichtwerk.project.v1`.
- `useRuntime` (`runtime.ts`): running/paused state, overrides, compiled scripts, output-window connection.
- `useSensors` (`sensors.ts`): live values and history per channel, BLE status, discovered channels.
- `useTimelineUi` (`timelineUi.ts`): timeline UI state only.
- `useLang` (`i18n.ts`): language, stored in `lichtwerk.lang`.

`Editor.tsx` `useRuntimeDriver` owns the requestAnimationFrame program clock, keyboard input and output-window sync.

### Effects = baseline, Code = what the data does to it
Workshop idea (2–4 h): kids program the senseBox (senseBox Blockly, fixed characteristic UUIDs, raw values only), then connect it and decide in Lichtwerk's Code mode how the data changes the projection. Effects mode is the baseline look (and all an iPad without Web Bluetooth gets). Code adds on top, per group:
- **Switches:** `Wenn ⟨Lautstärke > 70⟩` runs once each time it becomes true; `Solange ⟨Temperatur > 20⟩` → an effect that only lasts while the condition holds.
- **Links ("dimmer"):** `lw_link` = `Verbinde ⟨Wert⟩ von a bis b → [Tempo|Größe|Helligkeit|Farbe|Füllstand|Menge|Kurve] von [Gruppe]: x bis y`. The "x bis y" fields depend on the chosen setting (`LINK_RANGE` in `defs.ts`), so the block rebuilds its `RANGE` input when `PROP` changes and saves the choice as `extraState` (Blockly loads extra state before field values). A link is a `link` statement that, once run, stays active until its script is cleared; it modifies whatever effect is shown (from any layer) in `Interpreter.applyLinks` instead of setting a new one. Values are mapped linearly and clamped (a > b inverts), quantised to avoid churn; colours blend through the rainbow (`blendHue`: hue unwrapped at 300° so blue → red runs cyan, green, yellow like a thermometer, never through magenta); an unknown value (no sensor) leaves the baseline untouched. Speed changes keep the animation phase (`speedState`). A link block lying on the canvas without a hat is compiled as its own start script, so it is "always on".
- **Data effects:** data only comes in through code, never from a hidden sensor setting. In Effects they work without data and their settings show a hint (`EffectDef.hint`) on how to connect them: `level` ("Füllstand", category "Fläche", four directions, on lines a progress bar) fills up by itself like water until a `Verbinde … → Füllstand` link sets `params.level` (linked levels glide, `shownLevel` in `render.ts`); `graph` ("Kurve") stays empty until a `Verbinde … → Kurve` link feeds it: the link samples its mapped output twice a second into `params.series` (last 60 values), and "x bis y" sets how high in the shape the curve goes; `number` ("Zahl") shows stopwatch or clock (`source` is only `timer` / `clock`), sensor values are shown with `Zeige ⟨Wert⟩ auf …`.
- **Menge** (`params.amount`, 0..1, 0.5 = normal) sets how many particles sparkle, confetti, disco, matrix, pixel, bubbles and fireworks draw; it is both an effect setting and a link target.

### Teaching concepts in Code mode
Code mode is where the curriculum concepts live (GI Bildungsstandards Sek I 2025, NRW Informatik 5/6, BW Aufbaukurs 7: sequence, branching, loops, variables, testing, sensors). Target: grades 5–7. Blocks: `lw_if_then(_else)` with a Boolean input, `lw_wait_until`, `lw_repeat_until`, `lw_compare`, `lw_logic`, `lw_not`, `lw_arith`, `lw_random`, `lw_num`, `lw_sensor_value`, variables (`lw_var_get/set/change`, Blockly's variable model, dynamic toolbox category `variablesFlyout`), `lw_show_value`, `lw_on_button`, `lw_when` and `lw_while`.

Input for programs must work on every setup: an iPad in Show mode has no keyboard, and with a projector nobody taps the wall. So the main interactive trigger is the **on-screen button pad** (`ButtonPad.tsx`, `src/lib/buttons.ts`): only buttons the program uses appear, in the Code preview and as an overlay in Show mode, and keys 1–4 press them too. Testing without hardware: the sensor dialog has sliders for every channel while no senseBox is connected, and the Code preview shows live variable values.

### Editor ↔ output window
`/output` (`OutputView.tsx`) only renders. The editor owns project, program and sensors and pushes them over `BroadcastChannel("lichtwerk")` (`src/lib/sync.ts`); the output sends back key presses. Messages are designed to go over a network relay later (iPad editor → laptop output is planned, not built).

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
- Should a group go dark ("off") outside its clips (the current behaviour) or fall back to plain lines?

### Open gaps and TODOs
- Loudness has no BLE characteristic yet.
- No cross-device sync. The planned route is a WebSocket server or WebRTC.
- Multiple senseBoxes at once are not supported.
- Group dropdowns in blocks show a plain "●" instead of the group colour. This needs a custom field like `gridFields.tsx`.
- The C-block bottom bar is full width; the design had it shorter.
- Editing the program while an event timeline plays stops that event, because `restartKeepingTime` only respawns start scripts.
- Ideas: number strokes by position, corner-pin warp, accounts and sharing.
- First candidates for unit tests: the timeline ↔ blocks roundtrip and the interpreter.
- Align `CHARACTERISTICS` in `sensors.ts` with the workshop's senseBox Blockly UUID blocks (list still needed).
- Code-mode ideas not built yet: state blocks for automata (traffic light, GI SA-4), live block highlighting / step mode for debugging, a Struktogramm view, mission cards for workshops.
- Editing the program while it runs restarts it, which also resets all variables.

### Tried and dropped
- **Capacitor, Flutter, pure native iOS:** the web covers laptops too and matches the team's skills.
- **Node-based visual programming:** Blockly fits the learning goal better.
- **Tracing on a photo:** perspective mismatch.
- **Polygon/point tracing:** too fiddly.
- **Fixed shape labels** (window, door, roof): only worked for houses.
- **Static per-group effects as a separate base layer under the program:** too confusing. It was replaced by the timeline-as-program model, and old projects are migrated.
- **Zelos default look and dark outlines between blocks:** replaced by the custom renderer, with a 3px gap in the background colour between stacked blocks.
- **Long text dropdowns for effects and colours:** replaced by grid pickers.
- **Tapping as a program event ("Wenn getippt"):** doesn't work with a projector or a laptop output window; replaced by the on-screen buttons.
- **Duplicate effects:** Tiefe (= Echo inwards), Atmen (= Leuchten), Wasser (= Füllstand "von selbst") were merged. Effect categories: Linie, Licht, Fläche, Teilchen, Trippy, Technik, Text & Daten.
- **Blockly trash can and zoom buttons:** removed. Pinch/wheel zoom still works, and dragging a block onto the rail deletes it.

### Design reference
The look follows an early claude.ai Design canvas, "Projection Mapping MVP", with artboards Zeichnen / Effekte / Code / Show. The timeline UI was built in code without a design pass.

### Conventions
- Client-only code is marked `"use client"`. Blockly is loaded with `dynamic(..., { ssr: false })`.
- Path alias `@/*` → `src/*`.
- All styling is in `src/app/globals.css` (no CSS framework). Design tokens: Lexend, mint accent `#6EE7C8`, warm light `#FFD98A`, muted block colours with dark text.
