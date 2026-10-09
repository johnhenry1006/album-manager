import { ApiError } from '@/services/apiError.js';

function invalidResponse() {
  // Do not retain raw settings in an error cause or message.
  return new ApiError('Invalid settings response.', { code: 'INVALID_RESPONSE' });
}
function projectFields(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidResponse();
  return Object.fromEntries(
    fields.filter((field) => Object.hasOwn(value, field)).map((field) => [field, value[field]]),
  );
}
const dimensionFields = [
  'optimizedMaxWidth',
  'optimizedMaxHeight',
  'previewMaxWidth',
  'previewMaxHeight',
];
const qualityFields = ['balancedQuality', 'highQuality', 'maximumCompressionQuality'];
const imageFields = [
  'optimizationMode',
  ...dimensionFields,
  'thumbnailSizes',
  'outputFormat',
  ...qualityFields,
  'keepOriginal',
];
const isIntegerWithin = (value, maximum) =>
  Number.isInteger(value) && value >= 1 && value <= maximum;

/** Project before caching, rather than using Query select which retains the raw response. */
export function readImageOptimizationSettings(value) {
  const settings = projectFields(value, imageFields);
  if (
    !['LOSSLESS', 'BALANCED', 'HIGH_QUALITY', 'MAX_COMPRESSION'].includes(
      settings.optimizationMode,
    ) ||
    settings.outputFormat !== 'webp' ||
    settings.keepOriginal !== true ||
    dimensionFields.some((field) => !isIntegerWithin(settings[field], 16383)) ||
    qualityFields.some((field) => !isIntegerWithin(settings[field], 100)) ||
    !Array.isArray(settings.thumbnailSizes) ||
    settings.thumbnailSizes.length < 1 ||
    settings.thumbnailSizes.length > 8 ||
    new Set(settings.thumbnailSizes).size !== settings.thumbnailSizes.length ||
    Array.from(settings.thumbnailSizes).some((size) => !isIntegerWithin(size, 16383))
  )
    throw invalidResponse();
  return { ...settings, thumbnailSizes: [...settings.thumbnailSizes] };
}

/** The pending storage endpoint may expose only these public descriptive fields. */
export function readStorageSettings(value) {
  const settings = projectFields(value, ['driver', 'bucket', 'region']);
  if (Object.values(settings).some((field) => typeof field !== 'string' || !field.trim()))
    throw invalidResponse();
  return settings;
}
