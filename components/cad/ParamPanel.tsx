"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import type { CadParam } from "@/lib/api";

function decimals(step: number): number {
  const s = String(step);
  return s.includes(".") ? s.split(".")[1].length : 0;
}

function format(value: number, step: number): string {
  return value.toFixed(decimals(step));
}

function clampSnap(raw: number, p: CadParam): number {
  let v = Math.min(p.max, Math.max(p.min, raw));
  if (p.step > 0) {
    v = p.min + Math.round((v - p.min) / p.step) * p.step;
    v = Math.min(p.max, Math.max(p.min, v));
    v = Number(v.toFixed(Math.max(decimals(p.step), 6)));
  }
  return v;
}

function ParamRow({
  param,
  value,
  onChange,
}: {
  param: CadParam;
  value: number;
  onChange: (name: string, value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const id = `param-${param.name}`;
  const pct = param.max > param.min ? ((value - param.min) / (param.max - param.min)) * 100 : 0;

  function commit() {
    if (draft === null) return;
    const n = Number(draft.replace(",", "."));
    setDraft(null);
    if (draft.trim() === "" || !Number.isFinite(n)) return;
    const next = clampSnap(n, param);
    if (next !== value) onChange(param.name, next);
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="min-w-0 truncate text-[13px] text-text-2">
          {param.label}
        </label>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={draft ?? format(value, param.step)}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commit();
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              setDraft(null);
              e.currentTarget.blur();
            }
          }}
          className="h-10 w-20 rounded-lg border border-line-strong bg-bg px-2 text-right font-mono text-base text-text outline-none transition-colors focus:border-accent/70 lg:h-8 lg:text-[13px]"
        />
      </div>
      <input
        type="range"
        aria-label={`${param.label} slider`}
        className="cad-range mt-1"
        min={param.min}
        max={param.max}
        step={param.step}
        value={value}
        style={{ "--pct": `${pct}%` } as React.CSSProperties}
        onChange={(e) => onChange(param.name, Number(e.target.value))}
      />
      <div className="-mt-0.5 flex justify-between font-mono text-[10px] text-text-3">
        <span>{format(param.min, param.step)}</span>
        <span>{format(param.max, param.step)}</span>
      </div>
    </div>
  );
}

export default function ParamPanel({
  params,
  values,
  error,
  onChange,
  onReset,
}: {
  params: CadParam[];
  values: Record<string, number>;
  error: string | null;
  onChange: (name: string, value: number) => void;
  onReset: () => void;
}) {
  if (params.length === 0) {
    return (
      <p className="p-4 text-[13px] leading-5 text-text-3 lg:hidden">
        Generate a part to get adjustable parameters.
      </p>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-line pl-4 pr-2">
        <h2 className="hidden font-mono text-[11px] uppercase tracking-[0.12em] text-text-3 lg:block">Parameters</h2>
        <button
          type="button"
          onClick={onReset}
          className="ml-auto flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-xs text-text-2 transition-colors hover:bg-panel-2 hover:text-text lg:h-8"
        >
          <RotateCcw className="size-3.5" aria-hidden /> Reset
        </button>
      </div>
      <div className="scroll-thin flex-1 space-y-5 overflow-y-auto p-4">
        {params.map((p) => (
          <ParamRow key={p.name} param={p} value={values[p.name] ?? p.default} onChange={onChange} />
        ))}
        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs leading-5 text-text" role="alert">
            <span className="font-medium text-danger">Build error:</span> {error}
          </div>
        )}
        <p className="text-[11px] leading-4 text-text-3">Changes rebuild locally — no AI call.</p>
      </div>
    </div>
  );
}
