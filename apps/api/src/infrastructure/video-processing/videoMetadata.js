function positive(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
}
function ratio(value, separator = '/') {
    const [numerator, denominator] = String(value).split(separator).map(Number);
    return positive(numerator / denominator);
}

// Check the container's own header, not its filename or declared content type.
function isoContainer(source) {
    const atoms = new Set();
    for (let offset = 0; offset + 8 <= source.length;) {
        let size = source.readUInt32BE(offset);
        const atom = source.toString('ascii', offset + 4, offset + 8);
        let headerSize = 8;
        if (size === 1) {
            if (offset + 16 > source.length) throw new Error('Truncated atom');
            size = Number(source.readBigUInt64BE(offset + 8));
            headerSize = 16;
        } else if (size === 0) size = source.length - offset;
        if (!Number.isSafeInteger(size) || size < headerSize || size > source.length - offset)
            throw new Error('Invalid atom size');
        if (atom === 'ftyp') {
            if (size < headerSize + 8) throw new Error('Invalid file type atom');
            const brand = source.toString('ascii', offset + headerSize, offset + headerSize + 4);
            if (brand === 'qt  ') return 'mov';
            // Do not treat 3GP, HEIF, audio-only or other ISO BMFF brands as MP4.
            if (/^(isom|iso[2-9]|mp4[12]|avc1|dash|M4V |M4VH|M4VP|MSNV)$/.test(brand)) return 'mp4';
            throw new Error('Unsupported ISO media brand');
        }
        atoms.add(atom);
        offset += size;
    }
    // Legacy QuickTime has no ftyp; require the movie and media-data atoms.
    if (atoms.has('moov') && atoms.has('mdat')) return 'mov';
    throw new Error('Unsupported video container');
}

function container(source) {
    if (source.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
        const header = source.subarray(0, 4096);
        const offset = header.indexOf(Buffer.from([0x42, 0x82]));
        // WebM's EBML DocType uses a one-byte size and the literal value webm.
        if (offset >= 0 && header[offset + 2] === 0x84 && header.toString('ascii', offset + 3, offset + 7) === 'webm')
            return 'webm';
    }
    return isoContainer(source);
}

export function inspectVideoProbe(probe, source) {
    const format = container(source);
    const names = probe.format?.format_name?.split(',') ?? [];
    if (!(format === 'webm' ? names.includes('webm') : names.includes('mov'))) throw new Error('Container mismatch');
    const video = probe.streams?.find((stream) => stream.codec_type === 'video' && !stream.disposition?.attached_pic);
    const duration = positive(probe.format?.duration) ?? positive(video?.duration);
    if (!video?.codec_name || !duration || !positive(video.width) || !positive(video.height))
        throw new Error('Missing video stream metadata');
    if (video.width * video.height > 100_000_000) throw new Error('Video pixel limit exceeded');
    const sampleRatio = ratio(video.sample_aspect_ratio, ':') ?? 1;
    const rotation = Number(
        video.side_data_list?.find((side) => side.rotation !== undefined)?.rotation ?? video.tags?.rotate ?? 0,
    );
    if (!Number.isFinite(rotation) || rotation % 90 !== 0) throw new Error('Unsupported video rotation');
    const rotated = Math.abs(rotation % 180) === 90;
    const squareWidth = Math.round(video.width * sampleRatio);
    const width = rotated ? video.height : squareWidth;
    const height = rotated ? squareWidth : video.height;
    if (width < 1 || width > 16384 || height < 1 || height > 16384) throw new Error('Video dimension limit exceeded');
    const audio = probe.streams.find((stream) => stream.codec_type === 'audio');
    const rawFormat = Object.fromEntries(Object.entries(probe.format).filter(([key]) => key !== 'filename'));
    return {
        inspected: {
            format,
            mimeType: format === 'mov' ? 'video/quicktime' : `video/${format}`,
            width,
            height,
            aspectRatio: width / height,
        },
        metadata: {
            duration,
            videoCodec: video.codec_name,
            audioCodec: audio?.codec_name ?? null,
            frameRate: ratio(video.avg_frame_rate) ?? ratio(video.r_frame_rate),
            bitrate: positive(probe.format?.bit_rate) ?? positive(video.bit_rate),
            rawMetadata: { ...probe, format: rawFormat },
        },
        videoIndex: video.index,
        audioIndex: audio?.index,
    };
}
