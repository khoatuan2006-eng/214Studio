import React, { useMemo, useCallback } from 'react';
import { PROVINCES } from './vietnam-provinces';

export interface VietnamMapProps {
    /** Which provinces are highlighted */
    highlightedProvinces: string[];
    /** Callback when a province is clicked */
    onProvinceClick?: (provinceId: string) => void;
    /** Zoom level: 1.0 = full map, 3.0+ = zoomed in */
    zoomLevel?: number;
    /** Camera center X (0-1000) */
    cameraX?: number;
    /** Camera center Y (0-1000) */
    cameraY?: number;
    /** Province highlight color */
    highlightColor?: string;
    /** Default province fill color */
    defaultColor?: string;
    /** Province border color */
    borderColor?: string;
    /** Background color */
    backgroundColor?: string;
    /** Whether the map is interactive (clickable) */
    interactive?: boolean;
    /** CSS className */
    className?: string;
    /** Inline width/height */
    width?: number | string;
    height?: number | string;
}

const FULL_VIEW = { x: 0, y: 0, w: 1000, h: 2100 };

export const VietnamMap: React.FC<VietnamMapProps> = ({
    highlightedProvinces,
    onProvinceClick,
    zoomLevel = 1.0,
    cameraX = 500,
    cameraY = 1000,
    highlightColor = '#ef4444',
    defaultColor = '#1e3a5f',
    borderColor = '#334155',
    backgroundColor = '#0a1628',
    interactive = true,
    className = '',
    width = '100%',
    height = '100%',
}) => {
    // Calculate viewBox based on zoom & camera position
    const viewBox = useMemo(() => {
        const vw = FULL_VIEW.w / zoomLevel;
        const vh = FULL_VIEW.h / zoomLevel;
        const vx = Math.max(0, Math.min(cameraX - vw / 2, FULL_VIEW.w - vw));
        const vy = Math.max(0, Math.min(cameraY - vh / 2, FULL_VIEW.h - vh));
        return `${vx} ${vy} ${vw} ${vh}`;
    }, [zoomLevel, cameraX, cameraY]);

    const handleClick = useCallback((id: string) => {
        if (interactive && onProvinceClick) {
            onProvinceClick(id);
        }
    }, [interactive, onProvinceClick]);

    const isHighlighted = useCallback((id: string) => {
        return highlightedProvinces.includes(id);
    }, [highlightedProvinces]);

    return (
        <svg
            viewBox={viewBox}
            width={width}
            height={height}
            className={className}
            style={{ backgroundColor }}
            xmlns="http://www.w3.org/2000/svg"
        >
            {/* Map title */}
            <text
                x="500" y="2070"
                textAnchor="middle"
                fill="rgba(255,255,255,0.15)"
                fontSize="24"
                fontFamily="sans-serif"
                fontWeight="bold"
            >
                VIỆT NAM
            </text>

            {/* Province paths */}
            {PROVINCES.map((province) => {
                const highlighted = isHighlighted(province.id);
                return (
                    <g key={province.id} data-province-id={province.id}>
                        {/* Province shape */}
                        <path
                            d={province.svgPath}
                            fill={highlighted ? highlightColor : defaultColor}
                            stroke={highlighted ? '#ffffff' : borderColor}
                            strokeWidth={highlighted ? 3 : 1}
                            style={{
                                cursor: interactive ? 'pointer' : 'default',
                                transition: 'fill 0.3s ease, stroke 0.3s ease, stroke-width 0.2s ease',
                                filter: highlighted ? 'drop-shadow(0 0 8px rgba(239, 68, 68, 0.6))' : 'none',
                            }}
                            onClick={() => handleClick(province.id)}
                            onMouseEnter={(e) => {
                                if (interactive && !highlighted) {
                                    (e.target as SVGPathElement).style.fill = adjustBrightness(defaultColor, 1.4);
                                    (e.target as SVGPathElement).style.strokeWidth = '2';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (interactive && !highlighted) {
                                    (e.target as SVGPathElement).style.fill = defaultColor;
                                    (e.target as SVGPathElement).style.strokeWidth = '1';
                                }
                            }}
                        />
                        {/* Province label (only show when zoomed in enough or highlighted) */}
                        {(zoomLevel >= 2.0 || highlighted) && (
                            <text
                                x={province.centerX}
                                y={province.centerY}
                                textAnchor="middle"
                                dominantBaseline="central"
                                fill={highlighted ? '#ffffff' : 'rgba(255,255,255,0.6)'}
                                fontSize={highlighted ? 14 : 10}
                                fontFamily="sans-serif"
                                fontWeight={highlighted ? 'bold' : 'normal'}
                                style={{
                                    pointerEvents: 'none',
                                    textShadow: highlighted ? '0 1px 4px rgba(0,0,0,0.8)' : 'none',
                                }}
                            >
                                {province.name}
                            </text>
                        )}
                    </g>
                );
            })}
        </svg>
    );
};

// ── Utility ──
function adjustBrightness(hex: string, factor: number): string {
    const r = Math.min(255, Math.round(parseInt(hex.slice(1, 3), 16) * factor));
    const g = Math.min(255, Math.round(parseInt(hex.slice(3, 5), 16) * factor));
    const b = Math.min(255, Math.round(parseInt(hex.slice(5, 7), 16) * factor));
    return `rgb(${r}, ${g}, ${b})`;
}

export default VietnamMap;
