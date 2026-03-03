/**
 * SceneContextPanel — Hiển thị bối cảnh scene từ workflow analysis
 * 
 * Shows: character positions, background, camera, layer order, arrangement description
 */

import React from 'react';
import { useSceneAnalyzer } from '@/hooks/useSceneAnalyzer';
import {
    Users, Image, Camera, Layers, Volume2, Sparkles,
    RefreshCw, ChevronDown, ChevronRight, X, MapPin, Box
} from 'lucide-react';
import type { SceneContext, CharacterInfo } from '@/types/scene-context';

interface SceneContextPanelProps {
    onClose: () => void;
}

// ── Mini Canvas Map ──────────────────────────

function MiniCanvasMap({ context }: { context: SceneContext }) {
    const { canvas, characters, props } = context;
    const W = 200;
    const H = (canvas.height / canvas.width) * W;
    const scaleX = W / canvas.width;
    const scaleY = H / canvas.height;

    return (
        <div
            style={{
                width: W,
                height: H,
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 6,
                position: 'relative',
                overflow: 'hidden',
                margin: '0 auto 12px',
            }}
        >
            {/* Background indicator */}
            {context.background && context.background.asset_hash && (
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(135deg, #1a2a3f 0%, #0d1b2a 100%)',
                        opacity: 0.6,
                    }}
                />
            )}

            {/* Characters */}
            {characters.map((char) => {
                const cx = char.position_x * scaleX;
                const cy = char.position_y * scaleY;
                const size = Math.max(8, 12 * char.scale);
                return (
                    <div
                        key={char.node_id}
                        title={`${char.name} (${char.position_x.toFixed(0)}, ${char.position_y.toFixed(0)})`}
                        style={{
                            position: 'absolute',
                            left: cx - size / 2,
                            top: cy - size / 2,
                            width: size,
                            height: size,
                            borderRadius: '50%',
                            background: '#60a5fa',
                            border: '2px solid #93c5fd',
                            boxShadow: '0 0 6px rgba(96, 165, 250, 0.5)',
                            cursor: 'pointer',
                            zIndex: char.z_index,
                        }}
                    />
                );
            })}

            {/* Props */}
            {props.map((prop) => {
                const cx = prop.position_x * scaleX;
                const cy = prop.position_y * scaleY;
                return (
                    <div
                        key={prop.node_id}
                        title={`${prop.label} (${prop.position_x.toFixed(0)}, ${prop.position_y.toFixed(0)})`}
                        style={{
                            position: 'absolute',
                            left: cx - 4,
                            top: cy - 4,
                            width: 8,
                            height: 8,
                            borderRadius: 2,
                            background: '#f59e0b',
                            border: '1px solid #fbbf24',
                        }}
                    />
                );
            })}

            {/* Canvas size label */}
            <span
                style={{
                    position: 'absolute',
                    bottom: 2,
                    right: 4,
                    fontSize: 9,
                    color: 'rgba(255,255,255,0.4)',
                    fontFamily: 'monospace',
                }}
            >
                {canvas.width}×{canvas.height}
            </span>
        </div>
    );
}

// ── Section Component ──────────────────────────

function Section({
    icon,
    title,
    children,
    defaultOpen = true,
    badge,
}: {
    icon: React.ReactNode;
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
    badge?: string | number;
}) {
    const [isOpen, setIsOpen] = React.useState(defaultOpen);

    return (
        <div style={{ marginBottom: 8 }}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    width: '100%',
                    padding: '6px 8px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6,
                    color: '#e2e8f0',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                }}
            >
                {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                {icon}
                <span style={{ flex: 1 }}>{title}</span>
                {badge !== undefined && (
                    <span
                        style={{
                            background: 'rgba(96, 165, 250, 0.3)',
                            color: '#93c5fd',
                            fontSize: 10,
                            padding: '1px 6px',
                            borderRadius: 8,
                        }}
                    >
                        {badge}
                    </span>
                )}
            </button>
            {isOpen && (
                <div style={{ padding: '6px 8px 0 24px', fontSize: 11, color: '#94a3b8' }}>
                    {children}
                </div>
            )}
        </div>
    );
}

// ── Character Row ──────────────────────────

function CharacterRow({ char }: { char: CharacterInfo }) {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 0',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}
        >
            <div
                style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#60a5fa',
                    flexShrink: 0,
                }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#e2e8f0', fontWeight: 500, fontSize: 11 }}>
                    {char.name}
                </div>
                <div style={{ fontSize: 10, color: '#64748b' }}>
                    <MapPin size={9} style={{ display: 'inline', marginRight: 2 }} />
                    {char.position_relative}-{char.vertical_position}
                    {' · '}
                    x={char.position_x.toFixed(0)} y={char.position_y.toFixed(0)}
                    {' · '}
                    z={char.z_index}
                    {char.scale !== 1 && ` · scale=${char.scale.toFixed(1)}`}
                </div>
                {char.has_position_keyframes && (
                    <div style={{ fontSize: 10, color: '#f59e0b' }}>
                        ◇ {char.position_keyframe_count} position keyframes
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Main Panel ──────────────────────────

export default function SceneContextPanel({ onClose }: SceneContextPanelProps) {
    const { context, isLoading, error, refresh } = useSceneAnalyzer();

    return (
        <div
            style={{
                width: 280,
                background: '#0f172a',
                borderLeft: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                overflow: 'hidden',
            }}
        >
            {/* Header */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderBottom: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.03)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Layers size={14} color="#60a5fa" />
                    <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600 }}>
                        Scene Context
                    </span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                    <button
                        onClick={refresh}
                        disabled={isLoading}
                        title="Refresh"
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 4,
                            borderRadius: 4,
                            color: '#64748b',
                        }}
                    >
                        <RefreshCw size={13} className={isLoading ? 'spin' : ''} />
                    </button>
                    <button
                        onClick={onClose}
                        title="Close"
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 4,
                            borderRadius: 4,
                            color: '#64748b',
                        }}
                    >
                        <X size={13} />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflow: 'auto', padding: '10px 8px' }}>
                {/* Loading */}
                {isLoading && !context && (
                    <div style={{ textAlign: 'center', color: '#64748b', padding: 20, fontSize: 12 }}>
                        Đang phân tích scene...
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div
                        style={{
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: 6,
                            padding: '8px 10px',
                            fontSize: 11,
                            color: '#fca5a5',
                            marginBottom: 10,
                        }}
                    >
                        ⚠️ {error}
                    </div>
                )}

                {/* Context Display */}
                {context && (
                    <>
                        {/* Mini Map */}
                        <MiniCanvasMap context={context} />

                        {/* Characters */}
                        <Section
                            icon={<Users size={12} />}
                            title="Nhân vật"
                            badge={context.characters.length}
                        >
                            {context.characters.length === 0 ? (
                                <div style={{ fontStyle: 'italic', color: '#475569' }}>
                                    Chưa có nhân vật
                                </div>
                            ) : (
                                context.characters.map((char) => (
                                    <CharacterRow key={char.node_id} char={char} />
                                ))
                            )}
                        </Section>

                        {/* Background */}
                        <Section
                            icon={<Image size={12} />}
                            title="Background"
                            defaultOpen={!!context.background}
                        >
                            {context.background && context.background.asset_hash ? (
                                <div>
                                    <div style={{ color: '#e2e8f0', fontSize: 11 }}>
                                        {context.background.label}
                                    </div>
                                    {context.background.blur > 0 && (
                                        <div style={{ fontSize: 10 }}>Blur: {context.background.blur}</div>
                                    )}
                                    {context.background.parallax_speed > 0 && (
                                        <div style={{ fontSize: 10 }}>
                                            Parallax: {context.background.parallax_speed}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div style={{ fontStyle: 'italic', color: '#475569' }}>
                                    Không có background
                                </div>
                            )}
                        </Section>

                        {/* Camera */}
                        {context.camera && (
                            <Section icon={<Camera size={12} />} title="Camera">
                                <div>
                                    <div style={{ color: '#e2e8f0', fontSize: 11 }}>
                                        Action: {context.camera.action}
                                    </div>
                                    <div style={{ fontSize: 10 }}>
                                        Zoom: {context.camera.start_zoom.toFixed(1)} → {context.camera.end_zoom.toFixed(1)}
                                    </div>
                                    <div style={{ fontSize: 10 }}>
                                        Easing: {context.camera.easing}
                                    </div>
                                </div>
                            </Section>
                        )}

                        {/* Props */}
                        {context.props.length > 0 && (
                            <Section
                                icon={<Box size={12} />}
                                title="Props"
                                badge={context.props.length}
                            >
                                {context.props.map((prop) => (
                                    <div key={prop.node_id} style={{ padding: '3px 0', fontSize: 11, color: '#e2e8f0' }}>
                                        {prop.label} — {prop.position_relative} (z={prop.z_index})
                                    </div>
                                ))}
                            </Section>
                        )}

                        {/* Foreground */}
                        {context.foreground && (
                            <Section icon={<Sparkles size={12} />} title="Foreground">
                                <div>
                                    <div style={{ color: '#e2e8f0', fontSize: 11 }}>
                                        {context.foreground.effect_type}
                                    </div>
                                    <div style={{ fontSize: 10 }}>
                                        Intensity: {context.foreground.intensity.toFixed(1)} · Speed: {context.foreground.speed.toFixed(1)}
                                    </div>
                                </div>
                            </Section>
                        )}

                        {/* Audio */}
                        {context.audio.length > 0 && (
                            <Section
                                icon={<Volume2 size={12} />}
                                title="Audio"
                                badge={context.audio.length}
                            >
                                {context.audio.map((a) => (
                                    <div key={a.node_id} style={{ padding: '2px 0', fontSize: 11, color: '#e2e8f0' }}>
                                        [{a.audio_type}] {a.label} (vol: {a.volume.toFixed(1)})
                                    </div>
                                ))}
                            </Section>
                        )}

                        {/* Layer Order */}
                        <Section
                            icon={<Layers size={12} />}
                            title="Layer Order"
                            badge={context.layer_order.length}
                            defaultOpen={false}
                        >
                            {context.layer_order.map((layer, i) => (
                                <div
                                    key={layer.node_id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        padding: '3px 0',
                                        fontSize: 11,
                                    }}
                                >
                                    <span style={{ color: '#475569', fontFamily: 'monospace', width: 20 }}>
                                        {i + 1}.
                                    </span>
                                    <span
                                        style={{
                                            width: 6,
                                            height: 6,
                                            borderRadius: 2,
                                            background:
                                                layer.type === 'character' ? '#60a5fa' :
                                                    layer.type === 'background' ? '#34d399' :
                                                        layer.type === 'prop' ? '#f59e0b' :
                                                            '#a78bfa',
                                            flexShrink: 0,
                                        }}
                                    />
                                    <span style={{ color: '#e2e8f0' }}>{layer.name}</span>
                                    <span style={{ color: '#475569', fontFamily: 'monospace', fontSize: 9 }}>
                                        z={layer.z_index}
                                    </span>
                                </div>
                            ))}
                        </Section>

                        {/* Arrangement Description */}
                        <Section
                            icon={<MapPin size={12} />}
                            title="Mô tả bố cục"
                            defaultOpen={false}
                        >
                            <pre
                                style={{
                                    whiteSpace: 'pre-wrap',
                                    fontFamily: 'monospace',
                                    fontSize: 10,
                                    color: '#94a3b8',
                                    lineHeight: 1.5,
                                    margin: 0,
                                    padding: '4px 0',
                                }}
                            >
                                {context.arrangement_description}
                            </pre>
                        </Section>
                    </>
                )}

                {/* No context yet */}
                {!isLoading && !error && !context && (
                    <div style={{ textAlign: 'center', color: '#475569', padding: 20, fontSize: 12 }}>
                        Thêm nodes vào workflow để phân tích bối cảnh
                    </div>
                )}
            </div>
        </div>
    );
}
