import { pathToFileURL } from 'node:url';

import { SharpImageProcessor } from '#infrastructure/image-processing/index.js';
import { FfmpegVideoProcessor } from '#infrastructure/video-processing/ffmpegVideoProcessor.js';

import { createMediaProcessingJob } from './mediaProcessing.job.js';
import { createMediaProcessingWorker } from './mediaProcessing.worker.js';
import { startMediaWorker } from './mediaWorker.server.js';

export function startMediaProcessingWorker(options = {}) {
    return startMediaWorker({
        ...options,
        createJob: (dependencies) => {
            const imageProcessor = new SharpImageProcessor();
            return createMediaProcessingJob({
                ...dependencies,
                imageProcessor,
                videoProcessor: new FfmpegVideoProcessor({ imageProcessor }),
            });
        },
        createWorker: createMediaProcessingWorker,
    });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    startMediaProcessingWorker().catch(() => {
        console.error('Media processing worker startup failed');
        process.exitCode = 1;
    });
}
