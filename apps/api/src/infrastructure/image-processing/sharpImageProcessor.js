import sharp from 'sharp';

import { validateImageOptimizationOptions } from '#shared/validation/imageOptimizationOptions.js';

import { extractExifMetadata } from './exifMetadata.js';
import { buildVariantSpecifications, calculateDimensions, selectWebpConfig } from './imageProcessing.utils.js';
import { ImageProcessingError, ImageProcessor } from './imageProcessor.js';

function sourceBytes(input) {
    if (!(input instanceof Uint8Array) || input.byteLength === 0) throw new TypeError('Expected encoded image bytes');
    // Snapshot inputs. No file paths or write-in-place methods are accepted.
    return Buffer.from(input);
}
export class SharpImageProcessor extends ImageProcessor {
    #limitInputPixels;
    constructor({ limitInputPixels = 100_000_000 } = {}) {
        super();
        if (!Number.isSafeInteger(limitInputPixels) || limitInputPixels < 1)
            throw new TypeError('Invalid image pixel limit');
        this.#limitInputPixels = limitInputPixels;
    }
    #pipeline(source) {
        return sharp(source, { limitInputPixels: this.#limitInputPixels, failOn: 'error' });
    }
    async #inspect(source) {
        const metadata = await this.#pipeline(source).metadata();
        // Avoid silently discarding animation or extra pages until a deliberate policy exists.
        if ((metadata.pages ?? 1) !== 1) throw new Error('Multi-page image');
        const dimensions = calculateDimensions(metadata, Math.max(metadata.width, metadata.height));
        return {
            ...dimensions,
            aspectRatio: dimensions.width / dimensions.height,
            format: metadata.format,
            mimeType:
                {
                    jpeg: 'image/jpeg',
                    png: 'image/png',
                    webp: 'image/webp',
                    gif: 'image/gif',
                    heif: 'image/avif',
                    tiff: 'image/tiff',
                    svg: 'image/svg+xml',
                }[metadata.format] ?? 'application/octet-stream',
            orientation: metadata.orientation ?? 1,
            hasAlpha: metadata.hasAlpha ?? false,
        };
    }
    async inspect(input) {
        const source = sourceBytes(input);
        try {
            return await this.#inspect(source);
        } catch {
            throw new ImageProcessingError('inspection');
        }
    }
    async extractMetadata(input) {
        const source = sourceBytes(input);
        try {
            const metadata = await this.#pipeline(source).metadata();
            return extractExifMetadata(metadata.exif);
        } catch {
            throw new ImageProcessingError('metadata extraction');
        }
    }
    async process(input, inputOptions) {
        const options = validateImageOptimizationOptions(inputOptions, { complete: true });
        const source = sourceBytes(input);
        const specifications = buildVariantSpecifications(options);
        const encoder = selectWebpConfig(options.optimizationMode, options);
        try {
            const inspected = await this.#inspect(source);
            const variants = [];
            // Bound simultaneous native decoding/encoding memory, including large originals.
            for (const specification of specifications) {
                const { data, info } = await this.#pipeline(source)
                    .autoOrient()
                    .resize({
                        width: specification.maxWidth,
                        height: specification.maxHeight,
                        fit: 'inside',
                        withoutEnlargement: true,
                    })
                    .webp(encoder)
                    .toBuffer({ resolveWithObject: true });
                variants.push({
                    ...specification,
                    maxSize: Math.max(specification.maxWidth, specification.maxHeight),
                    data,
                    width: info.width,
                    height: info.height,
                    aspectRatio: info.width / info.height,
                    fileSize: data.length,
                    format: options.outputFormat,
                    contentType: 'image/webp',
                    quality: encoder.lossless ? null : encoder.quality,
                    losslessEncoding: encoder.lossless,
                });
            }
            return { source: inspected, variants };
        } catch {
            throw new ImageProcessingError('processing');
        }
    }
}
