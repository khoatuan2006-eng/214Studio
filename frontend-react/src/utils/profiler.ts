/**
 * PerformanceProfiler
 * 
 * Captures UI and worker performance metrics.
 * Outputs summarized logs to the console as requested by the user.
 */
class PerformanceProfiler {
    private static instance: PerformanceProfiler;
    private metrics: { [key: string]: number[] } = {};
    private frameStart: number = 0;
    private readonly SAMPLE_SIZE = 100;

    private constructor() {
        console.log('%c[PERF] Profiler Initialized', 'color: #6366f1; font-weight: bold;');
    }

    public static getInstance(): PerformanceProfiler {
        if (!PerformanceProfiler.instance) {
            PerformanceProfiler.instance = new PerformanceProfiler();
        }
        return PerformanceProfiler.instance;
    }

    /**
     * Start measuring a block of code.
     */
    public start() {
        this.frameStart = performance.now();
    }

    /**
     * Stop measuring and record the duration.
     */
    public end(label: string) {
        const duration = performance.now() - this.frameStart;
        if (!this.metrics[label]) this.metrics[label] = [];
        this.metrics[label].push(duration);

        if (this.metrics[label].length >= this.SAMPLE_SIZE) {
            this.flush(label);
        }
    }

    /**
     * Log summarized metrics.
     */
    private flush(label: string) {
        const values = this.metrics[label];
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const max = Math.max(...values);

        console.log(
            `%c[PERF] ${label.padEnd(20)} | Avg: ${avg.toFixed(2)}ms | Max: ${max.toFixed(2)}ms`,
            avg > 16.6 ? 'color: #ef4444;' : 'color: #10b981;'
        );

        this.metrics[label] = [];
    }

    /**
     * Records latency from worker to main thread.
     */
    public recordWorkerLatency(sentTime: number) {
        const latency = performance.now() - sentTime;
        if (!this.metrics['WorkerLatency']) this.metrics['WorkerLatency'] = [];
        this.metrics['WorkerLatency'].push(latency);

        if (this.metrics['WorkerLatency'].length >= this.SAMPLE_SIZE) {
            this.flush('WorkerLatency');
        }
    }
}

export const profiler = PerformanceProfiler.getInstance();
