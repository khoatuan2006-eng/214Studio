// @ts-ignore
import MP4Box from 'mp4box';
import { Compositor } from '../renderer/Compositor';

export interface ExportOptions {
    width: number;
    height: number;
    fps: number;
    bitrate?: number;
    duration: number; // in seconds
    onProgress?: (progress: number) => void;
}

export class WebCodecsExporter {
    private compositor: Compositor;
    private mp4boxfile: any;
    private videoTrackId: number | null = null;
    private encoder: VideoEncoder | null = null;

    constructor(compositor: Compositor) {
        this.compositor = compositor;
    }

    public async export(options: ExportOptions): Promise<Blob> {
        return new Promise(async (resolve, reject) => {
            try {
                this.mp4boxfile = MP4Box.createFile();

                const { width, height, fps, duration, onProgress } = options;
                const totalFrames = Math.floor(duration * fps);
                let encodedFrames = 0;

                this.encoder = new VideoEncoder({
                    output: (chunk, metadata) => {
                        this.handleChunk(chunk, metadata, fps);
                        encodedFrames++;
                        if (onProgress) {
                            onProgress(encodedFrames / totalFrames);
                        }
                    },
                    error: (e) => reject(e)
                });

                const codec = 'avc1.4d002a'; // H.264 Main Profile

                const config: VideoEncoderConfig = {
                    codec: codec,
                    width: width,
                    height: height,
                    bitrate: options.bitrate || 5_000_000, // 5Mbps default
                    framerate: fps,
                    avc: { format: 'avc' }
                };

                await this.encoder.configure(config);

                // Start rendering loop specifically for export
                // We pause the live compositor so it doesn't interfere
                this.compositor.app.ticker.stop();

                for (let i = 0; i < totalFrames; i++) {
                    const time = i / fps;

                    // Force the compositor to render the exact frame synchronously
                    // Note: Compositor class needs to expose a way to render synchronously or we wait for a tick
                    (this.compositor as any).composeFrame(time);
                    this.compositor.app.renderer.render(this.compositor.app.stage);

                    const canvas = this.compositor.app.view as HTMLCanvasElement;

                    // Create VideoFrame
                    const frame = new VideoFrame(canvas, {
                        timestamp: (i * 1000000) / fps, // microseconds
                        duration: 1000000 / fps
                    });

                    const insertKeyframe = (i % (fps * 2)) === 0; // Keyframe every 2 seconds
                    this.encoder.encode(frame, { keyFrame: insertKeyframe });

                    frame.close();

                    // Yield to event loop to allow encoder to process and avoid locking UI
                    await new Promise(r => setTimeout(r, 0));
                }

                await this.encoder.flush();

                // Mux to Blob
                const blob = this.createBlob();

                // Restore regular live Compositor loop
                this.compositor.app.ticker.start();

                resolve(blob);

            } catch (err) {
                // Ensure compositor resumes even if error
                this.compositor.app.ticker.start();
                reject(err);
            }
        });
    }

    private handleChunk(chunk: EncodedVideoChunk, metadata: EncodedVideoChunkMetadata | undefined, fps: number) {
        if (this.videoTrackId === null && metadata && metadata.decoderConfig) {
            // Initialize the track in MP4Box on first chunk
            this.videoTrackId = this.mp4boxfile.addTrack({
                timescale: fps * 1000,
                width: metadata.decoderConfig.codedWidth || 1920,
                height: metadata.decoderConfig.codedHeight || 1080,
                avcDecoderConfigRecord: metadata.decoderConfig.description,
            });
        }

        if (this.videoTrackId !== null) {
            const buffer = new ArrayBuffer(chunk.byteLength);
            chunk.copyTo(buffer);

            this.mp4boxfile.addSample(this.videoTrackId, buffer, {
                duration: chunk.duration ? (chunk.duration * fps * 1000) / 1000000 : 1000,
                dts: (chunk.timestamp * fps * 1000) / 1000000,
                cts: (chunk.timestamp * fps * 1000) / 1000000,
                is_sync: chunk.type === 'key'
            });
        }
    }

    private createBlob(): Promise<Blob> {
        return new Promise<Blob>((resolve) => {
            this.mp4boxfile.onReady = (_info: any) => {
                // Done parsing
            };
            // mp4box js doesn't have a direct "getBlob", it gives an arraybuffer via save() or segment
            // We need to use build
            const stream = this.mp4boxfile.getBuffer();
            resolve(new Blob([stream], { type: 'video/mp4' }));
        });
    }
}
