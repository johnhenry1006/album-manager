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

const storageByteFields = [
  'originalBytes',
  'optimizedBytes',
  'variantBytes',
  'totalBytes',
  'estimatedSavedBytes',
];
function isSafeHost(host) {
  if (typeof host !== 'string') return false;
  try {
    const url = new URL(`https://${host}`);
    return (
      url.host === host &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === '/'
    );
  } catch {
    return false;
  }
}

/** Only public metadata and decimal byte counts enter the settings cache. */
export function readStorageSettings(value) {
  const settings = projectFields(value, [
    'providerType',
    'bucketName',
    'endpointHost',
    'objectCount',
    ...storageByteFields,
  ]);
  const validators = {
    providerType: (field) => typeof field === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(field),
    bucketName: (field) =>
      typeof field === 'string' &&
      /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(field) &&
      !field.includes('..') &&
      !/^\d+\.\d+\.\d+\.\d+$/.test(field),
    endpointHost: isSafeHost,
    objectCount: (field) => Number.isSafeInteger(field) && field >= 0,
  };
  for (const [key, field] of Object.entries(settings)) {
    if (storageByteFields.includes(key)) {
      if (typeof field !== 'string' || !/^\d+$/.test(field)) throw invalidResponse();
    } else if (field !== null && !validators[key](field)) throw invalidResponse();
  }
  return settings;
}
