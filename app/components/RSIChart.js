"use client";

import { useSyncExternalStore } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  CartesianGrid,
} from "recharts";

// Recharts writes colors as SVG attributes, which can't resolve CSS custom
// properties — so the chart reads the color scheme itself and picks the same
// token values globals.css defines for each mode.
const DARK_QUERY = "(prefers-color-scheme: dark)";
function subscribeScheme(callback) {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
function useDarkScheme() {
  return useSyncExternalStore(
    subscribeScheme,
    () => window.matchMedia(DARK_QUERY).matches,
    () => false
  );
}

const THEMES = {
  light: {
    surface: "#fcfcfb",
    grid: "#e1e0d9",
    axis: "#898781",
    line: "#2a78d6",
    up: "#0ca30c",
    down: "#d03b3b",
    band: "rgba(137, 135, 129, 0.06)",
    ink: "#0b0b0b",
    ink2: "#52514e",
  },
  dark: {
    surface: "#1a1a19",
    grid: "#2c2c2a",
    axis: "#898781",
    line: "#3987e5",
    up: "#0ca30c",
    down: "#d03b3b",
    band: "rgba(137, 135, 129, 0.07)",
    ink: "#ffffff",
    ink2: "#c3c2b7",
  },
};

function makeDateFormatter(history) {
  const span =
    history.length > 1 ? history[history.length - 1].date - history[0].date : 0;
  // Beyond a year of span (weekly/monthly intervals), day-of-month is noise
  // and the year is the disambiguator.
  const opts =
    span > 370 * 86400000
      ? { month: "short", year: "2-digit" }
      : { day: "2-digit", month: "short" };
  return (ts) => new Date(ts).toLocaleDateString("en-GB", opts);
}

function ChartTooltip({ active, payload, label, theme }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg border px-2.5 py-1.5 text-xs shadow-sm"
      style={{
        backgroundColor: theme.surface,
        borderColor: theme.grid,
        color: theme.ink2,
      }}
    >
      <div>{label}</div>
      <div className="mt-0.5 font-semibold" style={{ color: theme.ink }}>
        RSI {payload[0].value.toFixed(1)}
      </div>
    </div>
  );
}

export default function RSIChart({ history, thresholds = { oversold: 30, overbought: 70 } }) {
  const dark = useDarkScheme();
  const theme = dark ? THEMES.dark : THEMES.light;

  const points = (history || []).filter((p) => p.rsi !== null && p.rsi !== undefined);
  const formatDate = makeDateFormatter(points);
  const data = points.map((p) => ({ date: formatDate(p.date), rsi: Number(p.rsi) }));

  if (data.length === 0) {
    return <p className="py-4 text-sm text-ink-3">Not enough history to plot RSI yet.</p>;
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="rsiWash" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.line} stopOpacity={0.14} />
              <stop offset="100%" stopColor={theme.line} stopOpacity={0} />
            </linearGradient>
          </defs>
          {/* Solid hairline grid, horizontal only — recessive chart chrome. */}
          <CartesianGrid stroke={theme.grid} strokeWidth={1} vertical={false} />
          {/* The 30–70 neutral band, washed just off the surface, plus dashed
              threshold rules in the status hues (dashed = a threshold, the one
              place dashing means something). */}
          <ReferenceArea
            y1={thresholds.oversold}
            y2={thresholds.overbought}
            fill={theme.band}
            strokeOpacity={0}
          />
          <ReferenceLine
            y={thresholds.overbought}
            stroke={theme.down}
            strokeDasharray="4 4"
            strokeOpacity={0.55}
          />
          <ReferenceLine
            y={thresholds.oversold}
            stroke={theme.up}
            strokeDasharray="4 4"
            strokeOpacity={0.55}
          />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: theme.axis }}
            axisLine={{ stroke: theme.grid }}
            tickLine={false}
            minTickGap={40}
            dy={4}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, thresholds.oversold, 50, thresholds.overbought, 100]}
            tick={{ fontSize: 10, fill: theme.axis }}
            axisLine={false}
            tickLine={false}
            width={30}
          />
          <Tooltip
            content={<ChartTooltip theme={theme} />}
            cursor={{ stroke: theme.axis, strokeWidth: 1, strokeOpacity: 0.4 }}
          />
          <Area
            type="monotone"
            dataKey="rsi"
            stroke={theme.line}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            fill="url(#rsiWash)"
            dot={false}
            activeDot={{ r: 4, fill: theme.line, stroke: theme.surface, strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
