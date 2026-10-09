export const OPTIMIZATION_MODES = [
  { value: 'LOSSLESS', label: 'Lossless' },
  { value: 'BALANCED', label: 'Balanced', qualityField: 'balancedQuality' },
  { value: 'HIGH_QUALITY', label: 'High quality', qualityField: 'highQuality' },
  {
    value: 'MAX_COMPRESSION',
    label: 'Maximum compression',
    qualityField: 'maximumCompressionQuality',
  },
];
export const DIMENSION_FIELDS = [
  { name: 'optimizedMaxWidth', label: 'Optimized maximum width' },
  { name: 'optimizedMaxHeight', label: 'Optimized maximum height' },
  { name: 'previewMaxWidth', label: 'Preview maximum width' },
  { name: 'previewMaxHeight', label: 'Preview maximum height' },
];
export const QUALITY_FIELDS = [
  { name: 'balancedQuality', label: 'Balanced quality' },
  { name: 'highQuality', label: 'High quality' },
  { name: 'maximumCompressionQuality', label: 'Maximum compression quality' },
];

export function getActiveQualityField(optimizationMode) {
  const mode = OPTIMIZATION_MODES.find((item) => item.value === optimizationMode);
  return QUALITY_FIELDS.find((field) => field.name === mode?.qualityField);
}
export function hasImageOptimizationChanges(draft, baseDraft) {
  const qualityField = getActiveQualityField(draft.optimizationMode);
  const fields = [
    'optimizationMode',
    'outputFormat',
    'thumbnailSizes',
    ...DIMENSION_FIELDS.map((field) => field.name),
  ];
  if (qualityField) fields.push(qualityField.name);
  return fields.some((field) => draft[field] !== baseDraft[field]);
}

export function createImageOptimizationDraft(settings) {
  return Object.fromEntries(
    Object.entries(settings)
      .filter(([field]) => field !== 'keepOriginal')
      .map(([field, value]) => [
        field,
        field === 'thumbnailSizes' ? value.join(', ') : String(value),
      ]),
  );
}
function integer(value, maximum, label) {
  const text = value.trim();
  if (!/^\d+$/.test(text) || Number(text) < 1 || Number(text) > maximum)
    throw new Error(`${label} must be an integer between 1 and ${maximum}.`);
  return Number(text);
}
export function createImageOptimizationPatch(draft, base) {
  if (!OPTIMIZATION_MODES.some((mode) => mode.value === draft.optimizationMode))
    throw new Error('Select a supported optimization mode.');
  if (draft.outputFormat !== 'webp') throw new Error('Only WebP output is supported.');
  const values = { optimizationMode: draft.optimizationMode, outputFormat: draft.outputFormat };
  for (const field of DIMENSION_FIELDS)
    values[field.name] = integer(draft[field.name], 16383, field.label);
  const qualityField = getActiveQualityField(draft.optimizationMode);
  if (qualityField)
    values[qualityField.name] = integer(draft[qualityField.name], 100, qualityField.label);
  const sizes = draft.thumbnailSizes.split(',').map((value) => value.trim());
  if (sizes.length < 1 || sizes.length > 8) throw new Error('Enter 1 to 8 thumbnail sizes.');
  if (sizes.some((size) => !/^\d+$/.test(size)))
    throw new Error('Thumbnail sizes must be comma-separated whole numbers.');
  values.thumbnailSizes = sizes.map((size) => integer(size, 16383, 'Each thumbnail size'));
  if (new Set(values.thumbnailSizes).size !== sizes.length)
    throw new Error('Thumbnail sizes must be distinct sizes.');
  return Object.fromEntries(
    Object.entries(values).filter(
      ([field, value]) => JSON.stringify(value) !== JSON.stringify(base[field]),
    ),
  );
}
