"use client";
import { applyEasing } from "@/utils/easing";
import type { EasingType } from "@/utils/easing";

/** Generates SVG polyline points for an easing curve preview */
function getCurvePoints(type: EasingType, size = 40, samples = 20): string {
    const pts: string[] = [];
    for (let i = 0; i <= samples; i++) {
        const t = i / samples;
        const v = applyEasing(t, type);
        const x = t * (size - 4) + 2;
        const y = (1 - v) * (size - 4) + 2; // invert Y for SVG
        pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(" ");
}

const CURVE_DEFS: { value: EasingType; label: string; desc: string }[] = [
    { value: "linear",    label: "Linear",    desc: "Constant" },
    { value: "easeIn",    label: "Ease In",   desc: "Accelerate" },
    { value: "easeOut",   label: "Ease Out",  desc: "Decelerate" },
    { value: "easeInOut", label: "Smooth",    desc: "In & Out" },
    { value: "step",      label: "Step",      desc: "Stop-motion" },
];

interface EasingCurvePickerProps {
    value: EasingType;
    onChange: (v: EasingType) => void;
}

/** P2-4.1: Visual easing curve picker — shows mini SVG previews for each easing type */
export function EasingCurvePicker({ value, onChange }: EasingCurvePickerProps) {
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-xs text-neutral-400">Tween Easing</label>
            <div className="grid grid-cols-3 gap-1.5">
                {CURVE_DEFS.map(curve => {
                    const isActive = value === curve.value;
                    return (
                        <button
                            key={curve.value}
                            title={`${curve.label} — ${curve.desc}`}
                            onClick={() => onChange(curve.value)}
                            className={`flex flex-col items-center gap-0.5 p-1.5 rounded border transition-all ${
                                isActive
                                    ? "border-indigo-500 bg-indigo-900/30 text-indigo-300"
                                    : "border-neutral-700 bg-neutral-800 text-neutral-500 hover:border-neutral-500 hover:text-neutral-300"
                            }`}
                        >
                            <svg
                                width="40" height="40"
                                viewBox="0 0 40 40"
                                className="shrink-0"
                            >
                                {/* Grid lines */}
                                <line x1="2" y1="38" x2="38" y2="38" stroke="currentColor" strokeOpacity="0.2" strokeWidth="0.5" />
                                <line x1="2" y1="2"  x2="2"  y2="38" stroke="currentColor" strokeOpacity="0.2" strokeWidth="0.5" />
                                {/* Curve */}
                                <polyline
                                    points={getCurvePoints(curve.value)}
                                    fill="none"
                                    stroke={isActive ? "#818cf8" : "currentColor"}
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                                {/* Start/end dots */}
                                <circle cx="2" cy="38" r="1.5" fill={isActive ? "#818cf8" : "currentColor"} />
                                <circle cx="38" cy="2" r="1.5" fill={isActive ? "#818cf8" : "currentColor"} />
                            </svg>
                            <span className="text-[10px] leading-tight font-medium">{curve.label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
