/**
 * 18.2: Web Worker for SHA-256 hashing
 * 
 * Offloads heavy hash computation to a background thread
 * so the UI main thread stays responsive at 60Hz.
 * 
 * Usage: hashWorker.postMessage({ type: 'hash', data: ArrayBuffer })
 * Response: { type: 'hash-result', hash: string }
 */

self.onmessage = async (e: MessageEvent) => {
    const { type, data } = e.data;

    if (type === 'hash') {
        try {
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            self.postMessage({ type: 'hash-result', hash: hashHex });
        } catch (err: any) {
            self.postMessage({ type: 'hash-error', error: err.message });
        }
    }
};
