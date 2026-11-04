import type { ReactElement, SVGProps } from "react";
import type { EffectType } from "@/lib/types";

const base: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

export const IconPen = () => (
  <svg {...base}>
    <path d="M4 20l4-1L18.5 8.5a2.1 2.1 0 0 0-3-3L5 16l-1 4z" />
  </svg>
);
export const IconSparkle = () => (
  <svg {...base}>
    <path d="M11 3l1.8 5.2L18 10l-5.2 1.8L11 17l-1.8-5.2L4 10l5.2-1.8z" />
    <path d="M19 15v6M16 18h6" />
  </svg>
);
export const IconBlocks = () => (
  <svg {...base}>
    <rect x="3" y="4" width="11" height="6" rx="2" />
    <rect x="8" y="14" width="13" height="6" rx="2" />
  </svg>
);
export const IconPlay = () => (
  <svg {...base}>
    <path d="M8 5l11 7-11 7z" />
  </svg>
);
export const IconPlayFilled = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
    <path d="M7 4.5v15l12-7.5z" />
  </svg>
);
export const IconStopFilled = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);
export const IconEraser = () => (
  <svg {...base}>
    <path d="M9 20h11" />
    <path d="M4.5 15.5l9-9a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L11 19H8z" />
  </svg>
);
export const IconUndo = () => (
  <svg {...base}>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </svg>
);
export const IconTrash = () => (
  <svg {...base}>
    <path d="M4 7h16" />
    <path d="M10 11v6M14 11v6" />
    <path d="M6 7l1 13h10l1-13" />
    <path d="M9 7V4h6v3" />
  </svg>
);
export const IconHelp = () => (
  <svg {...base}>
    <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14" />
    <path d="M12 18h.01" />
  </svg>
);
export const IconClose = () => (
  <svg {...base}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const IconPlus = () => (
  <svg {...base} strokeWidth={2.5}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconMenu = () => (
  <svg {...base}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);
export const IconSensor = () => (
  <svg {...base}>
    <path d="M7 8.5a7 7 0 0 0 0 7M17 8.5a7 7 0 0 1 0 7" />
    <path d="M4.2 5.7a11 11 0 0 0 0 12.6M19.8 5.7a11 11 0 0 1 0 12.6" />
    <circle cx="12" cy="12" r="1.8" />
  </svg>
);
export const IconTogether = () => (
  <svg {...base} width={18} height={18}>
    <path d="M5 6v12M12 6v12M19 6v12" />
  </svg>
);
export const IconSequential = () => (
  <svg {...base} width={18} height={18}>
    <path d="M5 14v4M12 10v8M19 6v12" />
  </svg>
);
export const IconWindow = () => (
  <svg {...base}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M4 12h16M12 4v16" />
  </svg>
);

const W = "#FFD98A";
const L = "#E9E7E1";

/** Small previews for the effect tiles. */
export const EFFECT_PREVIEW: Record<EffectType, () => ReactElement> = {
  glow: () => (
    <svg viewBox="0 0 56 34" fill="none" aria-hidden="true">
      <rect x="16" y="5" width="24" height="24" rx="2" fill={W} fillOpacity="0.35" stroke={W} strokeWidth="2.5" />
      <rect x="12" y="1" width="32" height="32" rx="5" stroke={W} strokeOpacity="0.3" strokeWidth="1.5" />
    </svg>
  ),
  blink: () => (
    <svg viewBox="0 0 56 34" fill="none" aria-hidden="true">
      <rect x="6" y="7" width="20" height="20" rx="2" fill={W} fillOpacity="0.5" stroke={W} strokeWidth="2" />
      <rect x="30" y="7" width="20" height="20" rx="2" stroke={L} strokeOpacity="0.4" strokeWidth="2" />
    </svg>
  ),
  chase: () => (
    <svg viewBox="0 0 56 34" fill="none" aria-hidden="true">
      <path d="M4 28L28 6l24 22" stroke={L} strokeOpacity="0.35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 22.5L22 11.5" stroke={W} strokeWidth="3" strokeLinecap="round" />
    </svg>
  ),
  fill: () => (
    <svg viewBox="0 0 56 34" fill="none" aria-hidden="true">
      <rect x="16" y="5" width="24" height="24" rx="2" fill={W} stroke={W} strokeWidth="2" />
    </svg>
  ),
  sparkle: () => (
    <svg viewBox="0 0 56 34" fill="none" stroke={W} strokeLinecap="round" aria-hidden="true">
      <path d="M18 8v8M14 12h8" strokeWidth="2" />
      <path d="M36 4v6M33 7h6" strokeWidth="1.5" />
      <path d="M34 20v10M29 25h10" strokeWidth="2.5" />
    </svg>
  ),
  line: () => (
    <svg viewBox="0 0 56 34" fill="none" aria-hidden="true">
      <rect x="16" y="5" width="24" height="24" rx="2" stroke="#FFFFFF" strokeWidth="2" />
    </svg>
  ),
  off: () => (
    <svg viewBox="0 0 56 34" fill="none" aria-hidden="true">
      <rect x="16" y="5" width="24" height="24" rx="2" stroke={L} strokeOpacity="0.25" strokeWidth="2" strokeDasharray="3 3" />
    </svg>
  ),
  wobble: () => (
    <svg viewBox="0 0 56 34" fill="none" aria-hidden="true">
      <path d="M6 17c4-6 8-6 11 0s8 6 11 0 8-6 11 0 8 6 11 0" stroke={W} strokeWidth="2.5" strokeLinecap="round">
        <animate
          attributeName="d"
          dur="0.9s"
          repeatCount="indefinite"
          values="M6 17c4-6 8-6 11 0s8 6 11 0 8-6 11 0 8 6 11 0;M6 17c4 6 8 6 11 0s8-6 11 0 8 6 11 0 8-6 11 0;M6 17c4-6 8-6 11 0s8 6 11 0 8-6 11 0 8 6 11 0"
        />
      </path>
    </svg>
  ),
  draw: () => (
    <svg viewBox="0 0 56 34" fill="none" aria-hidden="true">
      <path d="M8 26C14 6 22 6 28 17s14 11 20-9" stroke={W} strokeWidth="2.5" strokeLinecap="round" pathLength="100" strokeDasharray="100" strokeDashoffset="100">
        <animate attributeName="stroke-dashoffset" values="100;0;0" keyTimes="0;0.6;1" dur="2s" repeatCount="indefinite" />
      </path>
    </svg>
  ),
  radial: () => (
    <svg viewBox="0 0 56 34" fill="none" aria-hidden="true">
      <clipPath id="lw-rad">
        <rect x="14" y="3" width="28" height="28" rx="3" />
      </clipPath>
      <rect x="14" y="3" width="28" height="28" rx="3" stroke={L} strokeOpacity="0.5" strokeWidth="2" />
      <circle cx="28" cy="17" r="4" fill={W} clipPath="url(#lw-rad)">
        <animate attributeName="r" values="2;21;2" keyTimes="0;0.5;1" calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" dur="2.4s" repeatCount="indefinite" />
      </circle>
    </svg>
  ),
  neon: () => (
    <svg viewBox="0 0 56 34" fill="none" aria-hidden="true">
      <rect x="14" y="5" width="28" height="24" rx="12" stroke="#FF7CC8" strokeOpacity="0.35" strokeWidth="5" />
      <rect x="14" y="5" width="28" height="24" rx="12" stroke="#FFFFFF" strokeWidth="1.6">
        <animate attributeName="opacity" values="1;1;0.2;1;1;0.4;1" dur="1.6s" repeatCount="indefinite" />
      </rect>
    </svg>
  ),
  echo: () => (
    <svg viewBox="0 0 56 34" fill="none" aria-hidden="true">
      <rect x="21" y="10" width="14" height="14" rx="2" stroke={W} strokeWidth="2.2" />
      <rect x="15" y="4" width="26" height="26" rx="4" stroke={W} strokeWidth="1.4">
        <animate attributeName="opacity" values="0.9;0" dur="1.4s" repeatCount="indefinite" />
      </rect>
    </svg>
  ),
  stripes: () => (
    <svg viewBox="0 0 56 34" fill="none" aria-hidden="true">
      <clipPath id="lw-str">
        <rect x="14" y="3" width="28" height="28" rx="3" />
      </clipPath>
      <g clipPath="url(#lw-str)">
        <g>
          <path d="M0 34L34 0M10 34L44 0M20 34L54 0M30 34L64 0M40 34L74 0" stroke={W} strokeWidth="4" />
          <animateTransform attributeName="transform" type="translate" from="-10 0" to="0 0" dur="0.8s" repeatCount="indefinite" />
        </g>
      </g>
      <rect x="14" y="3" width="28" height="28" rx="3" stroke={L} strokeOpacity="0.5" strokeWidth="1.5" />
    </svg>
  ),
  confetti: () => (
    <svg viewBox="0 0 56 34" aria-hidden="true">
      <rect x="16" y="6" width="5" height="2.5" fill="#FF6B5E" transform="rotate(20 18 7)" />
      <rect x="26" y="12" width="5" height="2.5" fill="#FFE45C" transform="rotate(-30 28 13)" />
      <rect x="35" y="5" width="5" height="2.5" fill="#5CE6E0" transform="rotate(45 37 6)" />
      <rect x="20" y="20" width="5" height="2.5" fill="#B07CFF" transform="rotate(-15 22 21)" />
      <rect x="33" y="24" width="5" height="2.5" fill="#7CF29A" transform="rotate(30 35 25)" />
      <rect x="28" y="28" width="5" height="2.5" fill="#FF7CC8" transform="rotate(-40 30 29)" />
    </svg>
  ),
  flow: () => (
    <svg viewBox="0 0 56 34" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="lw-flow" x1="0" x2="1">
          <stop offset="0" stopColor="#FF6B5E" />
          <stop offset="0.25" stopColor="#FFE45C" />
          <stop offset="0.5" stopColor="#7CF29A" />
          <stop offset="0.75" stopColor="#5C9DFF" />
          <stop offset="1" stopColor="#FF7CC8" />
          <animateTransform attributeName="gradientTransform" type="translate" values="-1 0;0 0" dur="1.6s" repeatCount="indefinite" />
        </linearGradient>
      </defs>
      <path d="M6 24C14 6 22 6 28 17s14 11 22-7" stroke="url(#lw-flow)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  ),
  spiral: () => (
    <svg viewBox="0 0 56 34" fill="none" aria-hidden="true">
      <g>
        <path d="M28 17c0-3 4-3 4 0s-4 6-8 3-2-10 4-10 10 5 10 10-6 11-13 9" stroke={W} strokeWidth="2.4" strokeLinecap="round" />
        <animateTransform attributeName="transform" type="rotate" from="0 28 17" to="360 28 17" dur="2.4s" repeatCount="indefinite" />
      </g>
    </svg>
  ),
  plasma: () => (
    <svg viewBox="0 0 56 34" aria-hidden="true">
      <defs>
        <radialGradient id="lw-plasma" cx="0.3" cy="0.4" r="0.8">
          <stop offset="0" stopColor="#FF7CC8" />
          <stop offset="0.5" stopColor="#B07CFF" />
          <stop offset="1" stopColor="#5CE6E0" />
          <animate attributeName="cx" values="0.3;0.7;0.3" dur="2.4s" repeatCount="indefinite" />
        </radialGradient>
      </defs>
      <rect x="14" y="3" width="28" height="28" rx="4" fill="url(#lw-plasma)" />
    </svg>
  ),
  disco: () => (
    <svg viewBox="0 0 56 34" aria-hidden="true">
      <rect x="14" y="3" width="28" height="28" rx="3" fill="none" stroke={L} strokeOpacity="0.4" strokeWidth="1.5" />
      <circle cx="22" cy="12" r="5" fill="#FF7CC8" fillOpacity="0.8">
        <animate attributeName="cx" values="20;34;20" dur="1.8s" repeatCount="indefinite" />
      </circle>
      <circle cx="34" cy="22" r="5" fill="#5CE6E0" fillOpacity="0.8">
        <animate attributeName="cy" values="24;10;24" dur="1.5s" repeatCount="indefinite" />
      </circle>
      <circle cx="28" cy="18" r="4" fill="#FFE45C" fillOpacity="0.8">
        <animate attributeName="cx" values="34;21;34" dur="2.1s" repeatCount="indefinite" />
      </circle>
    </svg>
  ),
  glitch: () => (
    <svg viewBox="0 0 56 34" fill="none" strokeWidth="2" aria-hidden="true">
      <rect x="15" y="5" width="24" height="24" rx="2" stroke="#FF3B5C">
        <animate attributeName="x" values="15;12;15;15;17;15" dur="0.9s" repeatCount="indefinite" />
      </rect>
      <rect x="17" y="5" width="24" height="24" rx="2" stroke="#38E8FF">
        <animate attributeName="x" values="17;20;17;17;14;17" dur="0.9s" repeatCount="indefinite" />
      </rect>
      <rect x="16" y="5" width="24" height="24" rx="2" stroke="#FFFFFF" />
    </svg>
  ),
  scan: () => (
    <svg viewBox="0 0 56 34" fill="none" aria-hidden="true">
      <rect x="14" y="3" width="28" height="28" rx="3" stroke={L} strokeOpacity="0.4" strokeWidth="1.5" />
      <path d="M16 4v26" stroke={W} strokeWidth="2.5">
        <animateTransform attributeName="transform" type="translate" values="0 0;24 0" dur="1.4s" repeatCount="indefinite" />
      </path>
    </svg>
  ),
  matrix: () => (
    <svg viewBox="0 0 56 34" aria-hidden="true" fontFamily="ui-monospace, monospace" fontSize="8" fontWeight="700">
      <clipPath id="lw-mx">
        <rect x="14" y="3" width="28" height="28" rx="3" />
      </clipPath>
      <g clipPath="url(#lw-mx)" fill="#7CF29A">
        <g>
          <text x="16" y="10">1</text>
          <text x="16" y="18" fillOpacity="0.6">0</text>
          <text x="25" y="16">ア</text>
          <text x="25" y="24" fillOpacity="0.6">1</text>
          <text x="34" y="8" fillOpacity="0.6">0</text>
          <text x="34" y="20">カ</text>
          <animateTransform attributeName="transform" type="translate" values="0 -8;0 12" dur="1.2s" repeatCount="indefinite" />
        </g>
      </g>
    </svg>
  ),
  grid: () => (
    <svg viewBox="0 0 56 34" fill="none" aria-hidden="true">
      <clipPath id="lw-grid">
        <rect x="14" y="3" width="28" height="28" rx="3" />
      </clipPath>
      <g clipPath="url(#lw-grid)" stroke={W} strokeOpacity="0.7" strokeWidth="1">
        <g>
          <path d="M8 3v28M15 3v28M22 3v28M29 3v28M36 3v28M43 3v28M14 6h28M14 13h28M14 20h28M14 27h28" />
          <animateTransform attributeName="transform" type="translate" values="0 0;7 0" dur="1s" repeatCount="indefinite" />
        </g>
      </g>
      <rect x="14" y="3" width="28" height="28" rx="3" stroke={W} strokeWidth="1.8" />
    </svg>
  ),
  radar: () => (
    <svg viewBox="0 0 56 34" fill="none" aria-hidden="true">
      <circle cx="28" cy="17" r="14" stroke={W} strokeOpacity="0.5" strokeWidth="1.5" />
      <circle cx="28" cy="17" r="7" stroke={W} strokeOpacity="0.3" strokeWidth="1" />
      <g>
        <path d="M28 17L42 17A14 14 0 0 0 38 7z" fill={W} fillOpacity="0.45" />
        <path d="M28 17h14" stroke={W} strokeWidth="2" />
        <animateTransform attributeName="transform" type="rotate" from="0 28 17" to="360 28 17" dur="2s" repeatCount="indefinite" />
      </g>
    </svg>
  ),
  pixel: () => (
    <svg viewBox="0 0 56 34" aria-hidden="true">
      {[0, 1, 2, 3].flatMap((r) =>
        [0, 1, 2, 3].map((c) => (
          <rect key={`${r}${c}`} x={15 + c * 7} y={4 + r * 7} width="5" height="5" rx="1" fill={W}>
            <animate
              attributeName="opacity"
              values={(r + c) % 2 ? "1;0.15;1" : "0.15;1;0.15"}
              dur={`${0.8 + ((r * 3 + c) % 4) * 0.3}s`}
              repeatCount="indefinite"
            />
          </rect>
        )),
      )}
    </svg>
  ),
  heartbeat: () => (
    <svg viewBox="0 0 56 34" fill="none" aria-hidden="true">
      <path d="M28 29C16 21 14 14 18 9.5c3-3 7-2 10 2 3-4 7-5 10-2 4 4.5 2 11.5-10 19.5z" fill="#FF6B5E" fillOpacity="0.6" stroke="#FF6B5E" strokeWidth="2">
        <animate attributeName="fill-opacity" values="0.3;0.9;0.4;0.8;0.3;0.3" keyTimes="0;0.1;0.2;0.3;0.45;1" dur="1.1s" repeatCount="indefinite" />
      </path>
    </svg>
  ),
  shake: () => (
    <svg viewBox="0 0 56 34" fill="none" aria-hidden="true">
      <rect x="18" y="7" width="20" height="20" rx="2" stroke={W} strokeWidth="2.2">
        <animateTransform attributeName="transform" type="translate" values="0 0;-2 1;2 -1;-1 -1;1 1;0 0" dur="0.35s" repeatCount="indefinite" />
      </rect>
    </svg>
  ),
  bubbles: () => (
    <svg viewBox="0 0 56 34" fill="none" stroke="#5CE6E0" strokeWidth="1.6" aria-hidden="true">
      <circle cx="22" cy="28" r="3">
        <animate attributeName="cy" values="32;2" dur="1.8s" repeatCount="indefinite" />
      </circle>
      <circle cx="32" cy="20" r="4.5">
        <animate attributeName="cy" values="34;0" dur="2.4s" repeatCount="indefinite" />
      </circle>
      <circle cx="38" cy="12" r="2.5">
        <animate attributeName="cy" values="30;4" dur="1.5s" repeatCount="indefinite" />
      </circle>
    </svg>
  ),
  fireworks: () => (
    <svg viewBox="0 0 56 34" fill="none" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <g transform="translate(28 17)">
        <g stroke="#FFE45C">
          <path d="M0 -11v4M0 7v4M-11 0h4M7 0h4M-8 -8l3 3M5 5l3 3M8 -8l-3 3M-5 5l-3 3" />
          <animateTransform attributeName="transform" type="scale" values="0.5;1.1;1.1" dur="1.4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;1;0" dur="1.4s" repeatCount="indefinite" />
        </g>
      </g>
    </svg>
  ),
  gradient: () => (
    <svg viewBox="0 0 56 34" aria-hidden="true">
      <defs>
        <linearGradient id="lw-grad" x1="0" x2="1" spreadMethod="reflect">
          <stop offset="0" stopColor={W} />
          <stop offset="1" stopColor="#B07CFF" />
          <animateTransform attributeName="gradientTransform" type="translate" values="0 0;2 0" dur="3s" repeatCount="indefinite" />
        </linearGradient>
      </defs>
      <rect x="14" y="3" width="28" height="28" rx="3" fill="url(#lw-grad)" />
    </svg>
  ),
  text: () => (
    <svg viewBox="0 0 56 34" aria-hidden="true">
      <clipPath id="lw-txt">
        <rect x="8" y="7" width="40" height="20" rx="3" />
      </clipPath>
      <rect x="8" y="7" width="40" height="20" rx="3" fill="none" stroke={L} strokeOpacity="0.4" strokeWidth="1.5" />
      <g clipPath="url(#lw-txt)">
        <text x="50" y="21.5" fill={W} fontSize="12" fontWeight="700" fontFamily="Lexend, system-ui, sans-serif">
          Hallo ✨
          <animate attributeName="x" values="50;-10" dur="2.6s" repeatCount="indefinite" />
        </text>
      </g>
    </svg>
  ),
  number: () => (
    <svg viewBox="0 0 56 34" aria-hidden="true">
      <rect x="10" y="4" width="36" height="26" rx="3" fill="none" stroke={L} strokeOpacity="0.4" strokeWidth="1.5" />
      <text x="28" y="22" textAnchor="middle" fill={W} fontSize="14" fontWeight="700" fontFamily="Lexend, system-ui, sans-serif">
        23°
      </text>
    </svg>
  ),
  level: () => (
    <svg viewBox="0 0 56 34" aria-hidden="true">
      <clipPath id="lw-lvl">
        <rect x="20" y="3" width="16" height="28" rx="3" />
      </clipPath>
      <rect x="20" y="3" width="16" height="28" rx="3" fill="none" stroke={L} strokeOpacity="0.5" strokeWidth="1.5" />
      <rect x="20" y="17" width="16" height="14" fill="#FF6B5E" clipPath="url(#lw-lvl)">
        <animate attributeName="y" values="24;10;24" dur="3s" repeatCount="indefinite" />
        <animate attributeName="height" values="7;21;7" dur="3s" repeatCount="indefinite" />
      </rect>
    </svg>
  ),
  graph: () => (
    <svg viewBox="0 0 56 34" fill="none" aria-hidden="true">
      <rect x="8" y="4" width="40" height="26" rx="3" stroke={L} strokeOpacity="0.4" strokeWidth="1.5" />
      <path d="M10 24l6-5 5 3 6-10 5 6 6-8 6 4" stroke={W} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="44" cy="14" r="2.2" fill="#FFFFFF" />
    </svg>
  ),
  banner: () => (
    <svg viewBox="0 0 56 34" aria-hidden="true">
      <clipPath id="lw-ban">
        <rect x="12" y="3" width="32" height="28" rx="3" />
      </clipPath>
      <g clipPath="url(#lw-ban)" fontSize="6.5" fontWeight="700" fontFamily="Lexend, system-ui, sans-serif">
        <g transform="rotate(-38 28 17)">
          {[0, 1, 2, 3].map((k) => (
            <g key={k}>
              <rect x="-4" y={1 + k * 10} width="64" height="7.5" fill={W} />
              <text x="0" y={7 + k * 10} fill="#15171B">
                Hallo Hallo Hallo Hallo
                <animate attributeName="x" values={k % 2 ? "-20;0" : "0;-20"} dur="1.6s" repeatCount="indefinite" />
              </text>
            </g>
          ))}
        </g>
      </g>
    </svg>
  ),
};
