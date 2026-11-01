# Lichtwerk

Projection mapping for kids (8–16): trace real objects on a tablet, give them light effects and program them with blocks. Optional senseBox sensors (BLE) make the light react to the room.

Built with Next.js (App Router), TypeScript, Blockly and zustand. Everything runs in the browser, so there's no backend yet. Next.js leaves room for authentication or sharing projects later.

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

For a workshop, build once and serve it on the local network:

```bash
npm run build
npm run start -- -H 0.0.0.0   # open http://<laptop-ip>:3000 on the iPads
```

> Web Bluetooth and "Add to Home Screen" need a secure context (HTTPS or `localhost`). On the local network, put the app behind HTTPS (e.g. `caddy`, `mkcert` or a deployed URL).

## The four modes

| Mode | What kids do |
| --- | --- |
| **Zeichnen / Draw** | Pick a pen colour (= group) and trace the edges they see on the wall. Strokes are smoothed, closed automatically when the end meets the start, and straightened when they're almost straight. Every stroke in a group gets a number (drawing order). Long-press or double-click a colour to rename it ("Bücher", "Stufen", …). Long-press (or right-click) a shape for the shape menu: layer order (to front / forward / backward / to back), give it an effect, delete. Layers are separate from the numbers, so reordering never renumbers a group. |
| **Effekte / Effects** | Tap a stroke, then pick an effect (glow, blink, chase, fill, water, sparkle, line, off), a colour (incl. *rainbow by number*) and *all at once* vs *one by one*. Applies to the whole group or only to this number. |
| **Code** | Blockly with five categories: events (start, key, tap), loops (*for each of group one by one*, repeat, forever), wait, effects, sensors. The </> button shows the program as JavaScript-like code for older kids. Changing blocks while the program runs restarts it (live coding). |
| **Show** | Only light, no UI. Starts the program. Tap with two fingers or press Esc to go back. |

## Setups

* **iPad + projector (mirroring):** works on every iPad. The interface is projected while drawing, so it's dark and minimal. Use *Show* for the clean result.
* **Laptop + projector:** Menu → *Open output window*. In Chrome/Edge the window is placed on the second screen automatically (Window Management API); click it for fullscreen. Editor and output sync via `BroadcastChannel` (same browser, same device).
* **iPad editor + laptop output** (planned): needs a small WebSocket/WebRTC relay. The sync messages in `src/lib/sync.ts` are designed so they can go over the network later.

## Sensors (senseBox, BLE)

The BLE profile comes from **senseBox:bike** (`sensebox/senseBox-bike-Arduino`, `reedu-reengineering-education/sensebox-bike-flutter`):

* Service `cf06a218-f68e-e0be-ad04-8ebc1eb0bc84`, device name prefix `senseBox`
* One characteristic per phenomenon. Payload = float32 values, little endian, via notify.
* Temperature, humidity, fine dust (PM1/2.5/4/10), distance (+ right) and acceleration are mapped in `src/lib/sensors.ts`.
* **Loudness has no characteristic in the bike profile yet.** It's in the list with `uuid: null`, so it shows no value for now. Add the UUID there once the firmware sends one.
* Unknown characteristics in the service still show up as "Sensor XXXX".

**Safari on iPadOS has no Web Bluetooth.** Connect the senseBox from Chrome/Edge on a laptop (or Android/ChromeOS). Possible next steps for iPad-only setups: a Wi-Fi/MQTT bridge, or a thin native Swift wrapper.

## Project structure

```
src/
  app/                 Next.js routes: / (editor), /output (projector window), manifest
  components/
    Editor.tsx         modes, top bar, runtime driver (program clock, keys, sync)
    Stage.tsx          letterboxed canvas, drawing / erasing / selecting
    DrawTools.tsx      tool rail, pen colours (= groups), rename dialog
    EffectsPanel.tsx   effect / colour / timing / layer / group for the selected stroke
    ShapeMenu.tsx      long-press menu: layers, effect, delete
    CodeMode.tsx       Blockly workspace, preview, code view
    blocks/defs.ts     block definitions, toolbox, theme, example program
    blocks/compile.ts  blocks -> JSON program (also headless)
    SensorPanel.tsx    BLE connect, live values
    OutputView.tsx     projector window
  lib/
    types.ts           project model (strokes, groups, effects)
    geometry.ts        smoothing, auto-close, simplification, hit testing
    render.ts          canvas renderer for all effects
    program.ts         program AST + "show as code"
    runtime.ts         interpreter (coroutines, events, sensor triggers)
    sensors.ts         BLE profile, connection, sensor store
    store.ts           project store (zustand), undo, localStorage
    sync.ts            BroadcastChannel protocol, output window
    i18n.ts            German / English
```

Projects are saved automatically in the browser (localStorage) and can be exported or imported as JSON from the menu.

## Ideas / next steps

* Network sync (iPad editor -> laptop output) via a small WebSocket server or WebRTC
* Number strokes by position (left -> right) as an alternative to drawing order
* Corner-pin warping for a whole drawing (when the projector moves)
* More blocks: variables, sensor value -> brightness/colour mapping, sounds
* Accounts / sharing projects (Next.js route handlers + auth)
