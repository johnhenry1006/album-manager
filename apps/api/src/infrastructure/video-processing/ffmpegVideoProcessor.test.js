import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import sharp from 'sharp';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { SharpImageProcessor } from '#infrastructure/image-processing/index.js';
import { ImageOptimizationSettingsService } from '#modules/settings/index.js';

import { FfmpegVideoProcessor } from './ffmpegVideoProcessor.js';

const run = promisify(execFile);
let directory;
const sources = {};
const processor = new FfmpegVideoProcessor({ imageProcessor: new SharpImageProcessor() });
beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'video-test-'));
    for (const format of ['mp4', 'mov', 'webm']) {
        const path = join(directory, `source.${format}`);
        await run('ffmpeg', [
            '-v',
            'error',
            '-y',
            '-f',
            'lavfi',
            '-i',
            'color=c=red:s=96x64:r=10:d=0.4',
            '-f',
            'lavfi',
            '-i',
            'sine=frequency=440:duration=0.4',
            '-c:v',
            format === 'webm' ? 'libvpx-vp9' : 'libx264',
            '-threads',
            '1',
            '-c:a',
            format === 'webm' ? 'libopus' : 'aac',
            path,
        ]);
        sources[format] = await readFile(path);
    }
    await run('ffmpeg', [
        '-v',
        'error',
        '-y',
        '-display_rotation',
        '90',
        '-i',
        join(directory, 'source.mp4'),
        '-c',
        'copy',
        join(directory, 'rotated.mp4'),
    ]);
    sources.rotated = await readFile(join(directory, 'rotated.mp4'));
    await run('ffmpeg', [
        '-v',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'sine=duration=0.1',
        '-c:a',
        'aac',
        join(directory, 'audio.mp4'),
    ]);
    sources.audio = await readFile(join(directory, 'audio.mp4'));
    await run('ffmpeg', [
        '-v',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc=s=95x63:r=10:d=0.2',
        '-vf',
        'setsar=2',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv444p',
        '-threads',
        '1',
        join(directory, 'silent.mp4'),
    ]);
    sources.silent = await readFile(join(directory, 'silent.mp4'));
}, 20000);
afterAll(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
});

it.each(['mp4', 'mov', 'webm'])('inspects real %s content and extracts typed video metadata', async (format) => {
    expect(await processor.inspect(sources[format])).toMatchObject({
        format,
        mimeType: format === 'mov' ? 'video/quicktime' : `video/${format}`,
        width: 96,
        height: 64,
        aspectRatio: 1.5,
    });
    const metadata = await processor.extractMetadata(sources[format]);
    expect(metadata.duration).toBeGreaterThan(0);
    expect(metadata.frameRate).toBe(10);
    expect(metadata.videoCodec).toBe(format === 'webm' ? 'vp9' : 'h264');
    expect(metadata.audioCodec).toBe(format === 'webm' ? 'opus' : 'aac');
    expect(metadata.rawMetadata.streams.length).toBe(2);
    expect(metadata.rawMetadata.format).not.toHaveProperty('filename');
});
it('generates browser playback, poster and thumbnails from a rotated video', async () => {
    expect(await processor.inspect(sources.rotated)).toMatchObject({ width: 64, height: 96 });
    const settings = await new ImageOptimizationSettingsService({
        repository: { findByKey: async () => null },
    }).getSettings();
    const { variants } = await processor.process(sources.rotated, settings);
    const playback = variants.find(({ name }) => name === 'playback');
    expect(playback).toMatchObject({
        type: 'OPTIMIZED',
        format: 'mp4',
        contentType: 'video/mp4',
        width: 64,
        height: 96,
    });
    expect(await processor.extractMetadata(playback.data)).toMatchObject({ videoCodec: 'h264', audioCodec: 'aac' });
    expect(variants.filter(({ type }) => type === 'THUMBNAIL').length).toBeGreaterThan(0);
    const poster = variants.find(({ type }) => type === 'PREVIEW');
    expect(await sharp(poster.data).metadata()).toMatchObject({ format: 'webp', width: 64, height: 96 });
    expect(variants.filter(({ type }) => type === 'OPTIMIZED')).toHaveLength(1);
}, 20000);
it('rejects damaged and audio-only inputs with sanitized errors', async () => {
    for (const input of [Buffer.from('not a video'), sources.audio]) {
        await expect(processor.inspect(input)).rejects.toMatchObject({
            code: 'VIDEO_PROCESSING_FAILED',
            statusCode: 422,
        });
    }
});
it('rejects image bytes and remote playlists instead of treating them as video', async () => {
    const image = await sharp({ create: { width: 4, height: 4, channels: 3, background: 'red' } })
        .png()
        .toBuffer();
    for (const input of [image, Buffer.from('#EXTM3U\n#EXTINF:1\nhttps://example.com/video.ts')]) {
        await expect(processor.inspect(input)).rejects.toMatchObject({ code: 'VIDEO_PROCESSING_FAILED' });
    }
});

it('normalizes sample aspect ratio and odd dimensions for silent video playback', async () => {
    const inspected = await processor.inspect(sources.silent);
    expect(inspected).toMatchObject({ width: 190, height: 63 });
    const settings = await new ImageOptimizationSettingsService({
        repository: { findByKey: async () => null },
    }).getSettings();
    const { variants } = await processor.process(sources.silent, settings);
    const playback = variants.find(({ name }) => name === 'playback');
    expect(playback.width % 2).toBe(0);
    expect(playback.height % 2).toBe(0);
    expect(await processor.extractMetadata(playback.data)).toMatchObject({ audioCodec: null, videoCodec: 'h264' });
    expect((await processor.inspect(playback.data)).aspectRatio).toBe(playback.width / playback.height);
}, 20000);

it('removes private temporary files after an encoder failure and preserves input bytes', async () => {
    const before = (await readdir(tmpdir())).filter((name) => name.startsWith('media-video-')).sort();
    const original = Buffer.from(sources.mp4);
    const broken = new FfmpegVideoProcessor({
        imageProcessor: new SharpImageProcessor(),
        ffmpegPath: join(directory, 'missing-ffmpeg'),
    });
    await expect(broken.process(sources.mp4, {})).rejects.toThrow('Video processing failed');
    expect(sources.mp4).toEqual(original);
    expect((await readdir(tmpdir())).filter((name) => name.startsWith('media-video-')).sort()).toEqual(before);
});

it('rejects corruption in later video frames even when the header and first frame are valid', async () => {
    const path = join(directory, 'damaged.mp4');
    await run('ffmpeg', [
        '-v',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc=s=96x64:r=10:d=3',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-threads',
        '1',
        '-movflags',
        '+faststart',
        path,
    ]);
    const damaged = await readFile(path);
    const payload = damaged.indexOf(Buffer.from('mdat')) + 4;
    expect(payload).toBeGreaterThan(4);
    damaged.fill(0, payload + Math.floor((damaged.length - payload) / 2));
    expect(await processor.inspect(damaged)).toMatchObject({ format: 'mp4' });
    const settings = await new ImageOptimizationSettingsService({
        repository: { findByKey: async () => null },
    }).getSettings();
    await expect(processor.process(damaged, settings)).rejects.toMatchObject({ code: 'VIDEO_PROCESSING_FAILED' });
}, 20000);

it('rejects a real 3GP container disguised as MP4', async () => {
    const path = join(directory, 'unsupported.3gp');
    await run('ffmpeg', ['-v', 'error', '-y', '-i', join(directory, 'source.mp4'), '-an', '-c:v', 'copy', path]);
    await expect(processor.inspect(await readFile(path))).rejects.toMatchObject({ code: 'VIDEO_PROCESSING_FAILED' });
});

it('recognizes legacy MOV without an ftyp atom and MP4 with a leading free atom', async () => {
    const mov = Buffer.from(sources.mov);
    expect(mov.toString('ascii', 4, 8)).toBe('ftyp');
    mov.write('free', 4, 'ascii');
    expect(await processor.inspect(mov)).toMatchObject({ format: 'mov', mimeType: 'video/quicktime' });
    const ftypSize = sources.mp4.readUInt32BE(0);
    const freeSize = sources.mp4.readUInt32BE(ftypSize);
    expect(sources.mp4.toString('ascii', ftypSize + 4, ftypSize + 8)).toBe('free');
    const reordered = Buffer.concat([
        sources.mp4.subarray(ftypSize, ftypSize + freeSize),
        sources.mp4.subarray(0, ftypSize),
        sources.mp4.subarray(ftypSize + freeSize),
    ]);
    expect(await processor.inspect(reordered)).toMatchObject({ format: 'mp4', mimeType: 'video/mp4' });
});
