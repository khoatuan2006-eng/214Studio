/**
 * 18.2: Utility functions for offloading work to Web Workers
 * 
 * Provides a clean async interface for hash computation and
 * a generic "yield to main thread" pattern for long-running loops.
 */

/**
 * 18.2: Utility functions for offloading work to Web Workers
 * 
 * Provides a clean async interface for hash computation with a Worker Pool
 * to avoid initialization overhead, plus a robust "yield to main thread" pattern.
 */

// 18.2: Persistent Worker Pool (simple version with 1 reusable worker)
let hashWorker: Worker | null = null;
const hashQueue: Array<{
    data: ArrayBuffer;
    resolve: (hash: string) => void;
    reject: (err: Error) => void;
    transfer: ArrayBuffer[];
}> = [];
let isWorkerBusy = false;

function getHashWorker() {
    if (!hashWorker) {
        hashWorker = new Worker(
            new URL('../workers/hash.worker.ts', import.meta.url),
            { type: 'module' }
        );

        hashWorker.onmessage = (e: MessageEvent) => {
            const { type, hash, error } = e.data;
            const currentItem = hashQueue.shift();

            if (currentItem) {
                if (type === 'hash-result') {
                    currentItem.resolve(hash);
                } else {
                    currentItem.reject(new Error(error || 'Hash failed'));
                }
            }

            isWorkerBusy = false;
            processNextHash();
        };

        hashWorker.onerror = () => {
            const currentItem = hashQueue.shift();
            if (currentItem) currentItem.reject(new Error('Worker error'));
            isWorkerBusy = false;
            processNextHash();
        };
    }
    return hashWorker;
}

function processNextHash() {
    if (isWorkerBusy || hashQueue.length === 0) return;

    isWorkerBusy = true;
    const item = hashQueue[0]; // peek
    const worker = getHashWorker();
    worker.postMessage({ type: 'hash', data: item.data }, item.transfer);
}

/**
 * Compute SHA-256 hash in a persistent Web Worker.
 */
export async function hashBufferInWorker(buffer: ArrayBuffer): Promise<string> {
    return new Promise((resolve, reject) => {
        hashQueue.push({
            data: buffer,
            resolve,
            reject,
            transfer: [buffer]
        });
        processNextHash();
    });
}

/**
 * Compute SHA-256 hash of a File in a persistent Web Worker.
 */
export async function hashFileInWorker(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    return hashBufferInWorker(buffer);
}

/**
 * 18.2: Yield control back to the main thread for one frame.
 * Fix for Safari: requestIdleCallback is not supported, and setTimeout(0) 
 * can be too aggressive. Uses MessageChannel for a true macrotask yield.
 */
export function yieldToMain(): Promise<void> {
    return new Promise(resolve => {
        // Preference 1: requestIdleCallback (smooth if supported)
        if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(() => resolve(), { timeout: 16 });
            return;
        }

        // Preference 2: MessageChannel (true macrotask, better than setTimeout for Safari)
        const channel = new MessageChannel();
        channel.port1.onmessage = () => resolve();
        channel.port2.postMessage(undefined);
    });
}
