import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { inspectVideoProbe } from './videoMetadata.js';

const run = promisify(execFile);
const inputOptions = ['-protocol_whitelist', 'file', '-format_whitelist', 'mov,matroska,webm'];

export class VideoProcessingError extends Error {
    constructor(operation) {
        super(`Video ${operation} failed`);
        this.name = 'VideoProcessingError';
        this.code = 'VIDEO_PROCESSING_FAILED';
        this.statusCode = 422;
    }
}

// Same byte/variant contract as ImageProcessor. Temporary files are adapter-private;
// source and derivative object storage remain owned by the Media orchestration.
export class FfmpegVideoProcessor {
    #imageProcessor;
    #ffmpeg;
    #ffprobe;
    #timeout;
    constructor({ imageProcessor, ffmpegPath = 'ffmpeg', ffprobePath = 'ffprobe', timeoutMs = 300000 } = {}) {
        if (!imageProcessor || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1)
            throw new TypeError('Invalid video processor options');
        this.#imageProcessor = imageProcessor;
        this.#ffmpeg = ffmpegPath;
        this.#ffprobe = ffprobePath;
        this.#timeout = timeoutMs;
    }
    async #withSource(input, operation, action) {
        if (!(input instanceof Uint8Array) || !input.byteLength) throw new TypeError('Expected encoded video bytes');
        const source = Buffer.from(input);
        let directory;
        try {
            directory = await mkdtemp(join(tmpdir(), 'media-video-'));
            const path = join(directory, 'source');
            await writeFile(path, source, { mode: 0o600 });
            const { stdout } = await run(
                this.#ffprobe,
                ['-v', 'error', ...inputOptions, '-show_format', '-show_streams', '-of', 'json', path],
                { timeout: Math.min(this.#timeout, 30000), maxBuffer: 4 * 1024 ** 2 },
            );
            const probe = inspectVideoProbe(JSON.parse(stdout), source);
            return await action({ directory, path, ...probe });
        } catch {
            throw new VideoProcessingError(operation);
        } finally {
            if (directory) await rm(directory, { recursive: true, force: true });
        }
    }
    inspect(input) {
        return this.#withSource(input, 'inspection', async ({ inspected }) => inspected);
    }
    extractMetadata(input) {
        return this.#withSource(input, 'metadata extraction', async ({ metadata }) => metadata);
    }
    async #encode(args, timeout) {
        const { stderr } = await run(this.#ffmpeg, args, { timeout, maxBuffer: 1024 ** 2 });
        // Some FFmpeg versions return zero after a decoder error even with -xerror.
        // With -v error, non-empty stderr is also a failed decode, not a usable output.
        if (stderr.trim()) throw new Error('Video decoding failed');
    }
    process(input, settings) {
        return this.#withSource(input, 'processing', async ({ directory, path, inspected, videoIndex, audioIndex }) => {
            const factor = Math.min(1, 1920 / inspected.width, 1920 / inspected.height);
            const width = Math.max(2, Math.floor((inspected.width * factor) / 2) * 2);
            const height = Math.max(2, Math.floor((inspected.height * factor) / 2) * 2);
            const scale = `scale=${width}:${height},setsar=1`;
            const common = [
                '-v',
                'error',
                '-xerror',
                '-err_detect',
                'explode',
                '-nostdin',
                '-y',
                '-threads',
                '1',
                ...inputOptions,
                '-i',
                path,
            ];
            const posterPath = join(directory, 'poster.png');
            await this.#encode(
                [...common, '-map', `0:${videoIndex}`, '-frames:v', '1', '-vf', scale, '-threads', '1', posterPath],
                Math.min(this.#timeout, 30000),
            );
            const { variants } = await this.#imageProcessor.process(await readFile(posterPath), settings);
            const playbackPath = join(directory, 'playback.mp4');
            await this.#encode(
                [
                    ...common,
                    '-map',
                    `0:${videoIndex}`,
                    ...(audioIndex === undefined ? ['-an'] : ['-map', `0:${audioIndex}`]),
                    '-vf',
                    scale,
                    '-c:v',
                    'libx264',
                    '-pix_fmt',
                    'yuv420p',
                    '-preset',
                    'fast',
                    '-crf',
                    '23',
                    '-threads',
                    '1',
                    '-c:a',
                    'aac',
                    '-b:a',
                    '128k',
                    '-map_metadata',
                    '-1',
                    '-movflags',
                    '+faststart',
                    playbackPath,
                ],
                this.#timeout,
            );
            const data = await readFile(playbackPath);
            return {
                source: inspected,
                variants: [
                    {
                        type: 'OPTIMIZED',
                        name: 'playback',
                        format: 'mp4',
                        contentType: 'video/mp4',
                        width,
                        height,
                        fileSize: data.length,
                        data,
                    },
                    ...variants.filter((variant) => variant.type !== 'OPTIMIZED'),
                ],
            };
        });
    }
}
