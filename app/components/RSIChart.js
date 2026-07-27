"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from "recharts";

function formatDate(ts) {
  return new Date(ts).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

export default function RSIChart({ history }) {
  const data = (history || [])
    .filter((p) => p.rsi !== null && p.rsi !== undefined)
    .map((p) => ({ date: formatDate(p.date), rsi: Number(p.rsi.toFixed(2)) }));

  if (data.length === 0) {
    return (
      <p className="text-sm text-zinc-500 py-4">
        Not enough history to plot RSI yet.
      </p>
    );
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={30} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} width={30} />
          <Tooltip />
          <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="4 4" />
          <ReferenceLine y={30} stroke="#22c55e" strokeDasharray="4 4" />
          <Line
            type="monotone"
            dataKey="rsi"
            stroke="#2563eb"
            dot={false}
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
