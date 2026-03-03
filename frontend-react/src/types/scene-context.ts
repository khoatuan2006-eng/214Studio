/**
 * Scene Context Types — Mirrors backend SceneContext from scene_analyzer.py
 */

export interface CanvasInfo {
    width: number;
    height: number;
    fps: number;
    total_duration: number;
}

export interface CharacterInfo {
    node_id: string;
    name: string;
    position_x: number;
    position_y: number;
    scale: number;
    opacity: number;
    z_index: number;
    current_pose_count: number;
    position_relative: string;       // "trái", "giữa", "phải"
    vertical_position: string;       // "trên", "giữa", "dưới"
    has_position_keyframes: boolean;
    position_keyframe_count: number;
}

export interface BackgroundInfo {
    node_id: string;
    label: string;
    asset_hash: string;
    asset_path: string;
    blur: number;
    parallax_speed: number;
}

export interface CameraInfo {
    node_id: string;
    label: string;
    action: string;
    start_x: number;
    start_y: number;
    end_x: number;
    end_y: number;
    start_zoom: number;
    end_zoom: number;
    duration: number;
    easing: string;
}

export interface ForegroundInfo {
    node_id: string;
    label: string;
    effect_type: string;
    intensity: number;
    speed: number;
    opacity: number;
    z_index: number;
}

export interface PropInfo {
    node_id: string;
    label: string;
    asset_hash: string;
    position_x: number;
    position_y: number;
    scale: number;
    opacity: number;
    rotation: number;
    z_index: number;
    position_relative: string;
}

export interface AudioInfo {
    node_id: string;
    label: string;
    audio_type: string;
    volume: number;
    start_time: number;
    loop: boolean;
}

export interface LayerEntry {
    node_id: string;
    name: string;
    type: string;
    z_index: number;
}

export interface SceneContext {
    characters: CharacterInfo[];
    background: BackgroundInfo | null;
    camera: CameraInfo | null;
    foreground: ForegroundInfo | null;
    props: PropInfo[];
    audio: AudioInfo[];
    canvas: CanvasInfo;
    layer_order: LayerEntry[];
    arrangement_description: string;
}
