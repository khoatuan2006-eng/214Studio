/**
 * P0-0.4: Intent-based API Client
 * 
 * Frontend client for calling intent-based backend endpoints.
 * Instead of sending full editorData, we send "intents" like
 * "create track", "add keyframe", etc.
 * 
 * Benefits:
 * - Server handles business logic (ID generation, validation, z-index calculation)
 * - Smaller payloads (just the intent, not full state)
 * - Enables other clients (CLI, Mobile) to use same logic
 */

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8001';

// ============================================================
// Types
// ============================================================

export interface TrackCreateIntent {
    project_id: string;
    name: string;
    character_id?: string;
}

export interface TrackDeleteIntent {
    project_id: string;
    track_id: string;
}

export interface ActionCreateIntent {
    project_id: string;
    track_id: string;
    asset_hash: string;
    start: number;
    end: number;
    z_index?: number;
}

export interface ActionUpdateIntent {
    project_id: string;
    action_id: string;
    start?: number;
    end?: number;
}

export interface ActionDeleteIntent {
    project_id: string;
    action_id: string;
}

export interface KeyframeCreateIntent {
    project_id: string;
    track_id: string;
    property: 'x' | 'y' | 'scale' | 'rotation' | 'opacity';
    time: number;
    value: number;
    easing?: string;
}

export interface KeyframeUpdateIntent {
    project_id: string;
    track_id: string;
    property: 'x' | 'y' | 'scale' | 'rotation' | 'opacity';
    old_time: number;
    new_time?: number;
    value?: number;
    easing?: string;
}

export interface KeyframeDeleteIntent {
    project_id: string;
    track_id: string;
    property: 'x' | 'y' | 'scale' | 'rotation' | 'opacity';
    time: number;
}

export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
}

// ============================================================
// API Client Class
// ============================================================

class IntentApiClient {
    private baseUrl: string;

    constructor(baseUrl: string = API_BASE) {
        this.baseUrl = baseUrl;
    }

    private async request<T>(
        method: string,
        path: string,
        body?: any
    ): Promise<ApiResponse<T>> {
        try {
            const response = await fetch(`${this.baseUrl}${path}`, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: body ? JSON.stringify(body) : undefined,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                return {
                    success: false,
                    error: errorData.detail || `HTTP ${response.status}`,
                };
            }

            const data = await response.json();
            return { success: true, data };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Network error',
            };
        }
    }

    // --------------------------------------------------------
    // Track Operations
    // --------------------------------------------------------

    async createTrack(intent: TrackCreateIntent): Promise<ApiResponse> {
        return this.request('POST', '/api/tracks/', intent);
    }

    async deleteTrack(projectId: string, trackId: string): Promise<ApiResponse> {
        return this.request('DELETE', `/api/tracks/${projectId}/${trackId}`);
    }

    // --------------------------------------------------------
    // Action Operations
    // --------------------------------------------------------

    async createAction(intent: ActionCreateIntent): Promise<ApiResponse> {
        return this.request('POST', '/api/actions/', intent);
    }

    async updateAction(projectId: string, actionId: string, intent: ActionUpdateIntent): Promise<ApiResponse> {
        return this.request('PUT', `/api/actions/${projectId}/${actionId}`, intent);
    }

    async deleteAction(projectId: string, actionId: string): Promise<ApiResponse> {
        return this.request('DELETE', `/api/actions/${projectId}/${actionId}`);
    }

    // --------------------------------------------------------
    // Keyframe Operations
    // --------------------------------------------------------

    async createKeyframe(intent: KeyframeCreateIntent): Promise<ApiResponse> {
        return this.request('POST', '/api/keyframes/', intent);
    }

    async updateKeyframe(intent: KeyframeUpdateIntent): Promise<ApiResponse> {
        return this.request('PUT', '/api/keyframes/', intent);
    }

    async deleteKeyframe(intent: KeyframeDeleteIntent): Promise<ApiResponse> {
        return this.request('DELETE', '/api/keyframes/', intent);
    }
}

// Export singleton instance
export const intentApi = new IntentApiClient();

// Export class for testing
export { IntentApiClient };
