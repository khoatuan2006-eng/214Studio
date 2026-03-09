/**
 * useSceneAnalyzer — Hook to analyze workflow scene context
 * 
 * Calls the backend /api/scene/analyze endpoint with current workflow data.
 * Debounced to avoid spamming on rapid changes (drag, node edits).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useWorkflowStore } from '@/stores/useWorkflowStore';
import { API_BASE } from '@/config/api';
import type { SceneContext } from '@/types/scene-context';

interface UseSceneAnalyzerResult {
    context: SceneContext | null;
    isLoading: boolean;
    error: string | null;
    refresh: () => void;
}

const DEBOUNCE_MS = 500;

export function useSceneAnalyzer(): UseSceneAnalyzerResult {
    const [context, setContext] = useState<SceneContext | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const nodes = useWorkflowStore((s) => s.nodes);
    const edges = useWorkflowStore((s) => s.edges);

    const fetchAnalysis = useCallback(async () => {
        // Cancel any in-flight request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        const controller = new AbortController();
        abortControllerRef.current = controller;

        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch(`${API_BASE}/scene/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nodes, edges }),
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(`Analysis failed: ${response.status}`);
            }

            const data: SceneContext = await response.json();
            setContext(data);
        } catch (err: any) {
            if (err.name === 'AbortError') return; // Cancelled, ignore
            setError(err.message || 'Unknown error');
        } finally {
            setIsLoading(false);
        }
    }, [nodes, edges]);

    // Debounced auto-refresh when workflow changes
    useEffect(() => {
        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
        }

        debounceTimer.current = setTimeout(() => {
            fetchAnalysis();
        }, DEBOUNCE_MS);

        return () => {
            if (debounceTimer.current) {
                clearTimeout(debounceTimer.current);
            }
        };
    }, [fetchAnalysis]);

    // Cleanup abort controller on unmount
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    return {
        context,
        isLoading,
        error,
        refresh: fetchAnalysis,
    };
}
