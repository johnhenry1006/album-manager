// Parse the supported TIFF/EXIF fields, never arbitrary metadata or executable paths.
// Optional malformed EXIF is ignored; image decoding/inspection still validates the image.
export function extractExifMetadata(exif) {
    if (!Buffer.isBuffer(exif)) return {};
    try {
        const data = exif.subarray(exif.subarray(0, 6).equals(Buffer.from('Exif\0\0')) ? 6 : 0);
        const little = data.toString('ascii', 0, 2) === 'II';
        if (!little && data.toString('ascii', 0, 2) !== 'MM') return {};
        const uint16 = (offset) => (little ? data.readUInt16LE(offset) : data.readUInt16BE(offset));
        const uint32 = (offset) => (little ? data.readUInt32LE(offset) : data.readUInt32BE(offset));
        if (uint16(2) !== 42) return {};
        function directory(offset) {
            const values = new Map();
            if (!offset) return values;
            const count = uint16(offset);
            if (count > 1024 || offset + 2 + count * 12 > data.length) throw new Error('Invalid EXIF directory');
            for (let index = 0; index < count; index++) {
                const entry = offset + 2 + index * 12;
                const tag = uint16(entry);
                const type = uint16(entry + 2);
                const length = uint32(entry + 4);
                const size = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8 }[type];
                if (!size || length > 1024 || !length) continue;
                const start = length * size <= 4 ? entry + 8 : uint32(entry + 8);
                if (start + length * size > data.length) continue;
                if (type === 2) {
                    values.set(
                        tag,
                        data
                            .toString('utf8', start, start + length)
                            .replaceAll('\0', '')
                            .trim(),
                    );
                    continue;
                }
                const numbers = [];
                for (let item = 0; item < length; item++) {
                    const position = start + item * size;
                    const denominator = type === 5 ? uint32(position + 4) : 1;
                    numbers.push(
                        type === 1
                            ? data[position]
                            : type === 3
                              ? uint16(position)
                              : denominator
                                ? uint32(position) / denominator
                                : NaN,
                    );
                }
                if (numbers.every(Number.isFinite)) values.set(tag, length === 1 ? numbers[0] : numbers);
                if (type === 5 && length === 1 && uint32(start + 4))
                    values.set(`${tag}-fraction`, `${uint32(start)}/${uint32(start + 4)}`);
            }
            return values;
        }
        const base = directory(uint32(4));
        const camera = directory(base.get(0x8769));
        const gps = directory(base.get(0x8825));
        const result = {};
        for (const [field, value] of [
            ['cameraMake', base.get(0x010f)],
            ['cameraModel', base.get(0x0110)],
            ['lens', camera.get(0xa434)],
            ['shutterSpeed', camera.get('33434-fraction')],
        ]) {
            if (typeof value === 'string' && value) result[field] = value;
        }
        for (const [field, value] of [
            ['focalLength', camera.get(0x920a)],
            ['aperture', camera.get(0x829d)],
            ['iso', camera.get(0x8827)],
        ]) {
            if (
                typeof value === 'number' &&
                Number.isFinite(value) &&
                value > 0 &&
                (field !== 'iso' || (Number.isInteger(value) && value <= 2147483647))
            )
                result[field] = value;
        }
        for (const [field, tag, reference, maximum] of [
            ['latitude', 2, 1, 90],
            ['longitude', 4, 3, 180],
        ]) {
            const parts = gps.get(tag);
            const ref = gps.get(reference);
            if (!Array.isArray(parts) || parts.length !== 3 || !['N', 'S', 'E', 'W'].includes(ref)) continue;
            const value = (parts[0] + parts[1] / 60 + parts[2] / 3600) * (['S', 'W'].includes(ref) ? -1 : 1);
            if (Math.abs(value) <= maximum) result[field] = value;
        }
        if (Object.keys(result).length) result.rawMetadata = { ...result };
        return result;
    } catch {
        return {};
    }
}
