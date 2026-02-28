import InterpolationWorker from '../workers/interpolation.worker?worker';

/**
 * InterpolationService
 * 
 * Orchestrates the Web Worker for off-main-thread keyframe calculations.
 */
export class InterpolationService {
    private worker: Worker;
    private lastResults: Record<string, any> = {};
    private isBusy = false;
    private pendingRequest: { time: number; editorData: any } | null = null;

    constructor() {
        this.worker = new InterpolationWorker();
        this.worker.onmessage = (e) => {
            this.lastResults = e.data;
            this.isBusy = false;

            // Dispatch result for any listeners (e.g. PlaybackManager)
            window.dispatchEvent(new CustomEvent('interpolation-results', { detail: e.data }));

            // If a request was made while busy, process the latest one
            if (this.pendingRequest) {
                const req = this.pendingRequest;
                this.pendingRequest = null;
                this.requestCalculation(req.time, req.editorData);
            }
        };
        console.log('[InterpolationService] Worker initialized');
    }

    /**
     * Request a calculation from the worker.
     * Uses a "drop-frame" strategy: if the worker is busy, skip intermediate 
     * requests and only process the latest one when ready.
     */
    public requestCalculation(time: number, editorData: any, logicalWidth: number = 1920, logicalHeight: number = 1080) {
        if (this.isBusy) {
            this.pendingRequest = { time, editorData };
            return;
        }

        this.isBusy = true;
        this.worker.postMessage({
            time,
            editorData,
            logicalWidth,
            logicalHeight
        });
    }

    public getLastResults() {
        return this.lastResults;
    }

    public destroy() {
        this.worker.terminate();
    }
}

// Export singleton instance
export const interpolationService = new InterpolationService();
