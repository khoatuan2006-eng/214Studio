class BinaryAccumulator {
    chunks: Uint8Array[] = []
    chunk_info: { timestamp: number, duration: number, is_key: boolean, size: number }[] = []

    add_chunk(chunk: Uint8Array, info: { timestamp: number, duration: number, is_key: boolean, size: number }) {
        this.chunks.push(chunk)
        this.chunk_info.push(info)
    }

    get binary(): Uint8Array {
        const totalLength = this.chunks.reduce((acc, curr) => acc + curr.length, 0)
        const result = new Uint8Array(totalLength)
        let offset = 0
        for (const chunk of this.chunks) {
            result.set(chunk, offset)
            offset += chunk.length
        }
        return result
    }
}

const binary_accumulator = new BinaryAccumulator()
let getChunks = false
let description: Uint8Array | null = null

async function handle_chunk(chunk: EncodedVideoChunk, metadata?: EncodedVideoChunkMetadata) {
    let chunk_data = new Uint8Array(chunk.byteLength)
    chunk.copyTo(chunk_data)

    binary_accumulator.add_chunk(chunk_data, {
        timestamp: chunk.timestamp,
        duration: chunk.duration || 0,
        is_key: chunk.type === 'key',
        size: chunk_data.byteLength
    })

    if (metadata?.decoderConfig?.description) {
        description = new Uint8Array(metadata.decoderConfig.description as ArrayBuffer)
    }

    if (getChunks) {
        self.postMessage({
            action: "chunk",
            chunk: chunk_data,
            is_key: chunk.type === 'key',
            timestamp: chunk.timestamp,
            duration: chunk.duration,
            size: chunk_data.byteLength
        })
    }
}

const config: VideoEncoderConfig = {
    codec: "avc1.640034",
    // Use avcc format for easier MP4 muxing
    avc: { format: "avcc" },
    width: 1920,
    height: 1080,
    bitrate: 10_000_000,
    framerate: 60,
    bitrateMode: "quantizer"
}

const encoder = new VideoEncoder({
    output: handle_chunk,
    error: (e: any) => {
        console.error("VideoEncoder Error:", e.message)
    },
})

encoder.addEventListener("dequeue", () => {
    self.postMessage({ action: "dequeue", size: encoder.encodeQueueSize })
})

self.addEventListener("message", async message => {
    if (message.data.action === "configure") {
        config.bitrate = message.data.bitrate * 1000
        config.width = message.data.width
        config.height = message.data.height
        config.framerate = message.data.timebase
        config.bitrateMode = message.data.bitrateMode ?? "constant"
        getChunks = message.data.getChunks
        encoder.configure(config)
    }
    if (message.data.action === "encode") {
        const frame = message.data.frame as VideoFrame
        if (config.bitrateMode === "quantizer") {
            // @ts-ignore
            encoder.encode(frame, { avc: { quantizer: 20 } })
        } else {
            encoder.encode(frame)
        }
        frame.close()
    }
    if (message.data.action === "get-binary") {
        await encoder.flush()
        self.postMessage({
            action: "binary",
            binary: binary_accumulator.binary,
            chunk_info: binary_accumulator.chunk_info,
            description: description
        })
    }
})
