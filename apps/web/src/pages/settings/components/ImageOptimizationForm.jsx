import {
  DIMENSION_FIELDS,
  getActiveQualityField,
  OPTIMIZATION_MODES,
} from '../utils/imageOptimizationForm.js';
import styles from './ImageOptimizationForm.module.css';

export function ImageOptimizationForm({ form }) {
  const { draft, isDirty, isSaving, error, notice, setField, reset, submit } = form;
  const qualityField = getActiveQualityField(draft.optimizationMode);
  return (
    <form
      className={styles.form}
      aria-label="Image optimization settings"
      onSubmit={submit}
      noValidate
    >
      <fieldset disabled={isSaving} className={styles.fields}>
        <legend>Optimization settings</legend>
        <label className={styles.field}>
          Optimization mode
          <select
            value={draft.optimizationMode}
            onChange={(event) => setField('optimizationMode', event.target.value)}
          >
            {OPTIMIZATION_MODES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <p className={styles.help}>
          Lossy modes target visually high quality, not mathematically lossless output. They trade
          some pixel accuracy for smaller files.
        </p>
        {draft.optimizationMode === 'LOSSLESS' && (
          <p className={styles.help}>
            LOSSLESS preserves the pixels presented to the WebP encoder. Resizing, orientation
            normalization and metadata removal can still change the image from its original form.
            Lossy quality values do not apply.
          </p>
        )}
        {qualityField && (
          <>
            <label className={styles.field}>
              {qualityField.label}
              <input
                type="number"
                min="1"
                max="100"
                step="1"
                required
                aria-describedby="optimization-quality-help"
                name={qualityField.name}
                value={draft[qualityField.name]}
                onChange={(event) => setField(qualityField.name, event.target.value)}
              />
            </label>
            <p id="optimization-quality-help" className={styles.help}>
              1–100. Higher values favor quality over smaller files.
            </p>
          </>
        )}
        <fieldset className={styles.dimensions}>
          <legend>Maximum dimensions (pixels)</legend>
          <div className={styles.grid}>
            {DIMENSION_FIELDS.map((field) => (
              <label key={field.name} className={styles.field}>
                {field.label}
                <input
                  type="number"
                  min="1"
                  max="16383"
                  step="1"
                  required
                  name={field.name}
                  value={draft[field.name]}
                  onChange={(event) => setField(field.name, event.target.value)}
                />
              </label>
            ))}
          </div>
          <p className={styles.help}>
            Images fit within these bounds, preserve their aspect ratio, and are never enlarged.
          </p>
        </fieldset>
        <label className={styles.field}>
          Thumbnail sizes
          <input
            type="text"
            name="thumbnailSizes"
            required
            value={draft.thumbnailSizes}
            onChange={(event) => setField('thumbnailSizes', event.target.value)}
            aria-describedby="thumbnail-size-help"
          />
        </label>
        <p id="thumbnail-size-help" className={styles.help}>
          Enter 1–8 distinct sizes in pixels, separated by commas. Each size must be 1–16383.
        </p>
        <label className={styles.field}>
          Output format
          <select value={draft.outputFormat} disabled>
            <option value="webp">WebP</option>
          </select>
        </label>
        <p className={styles.help}>
          WebP is the supported output format. Original files are always preserved.
        </p>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <div className={styles.actions}>
        <button type="submit" disabled={!isDirty || isSaving}>
          {isSaving ? 'Saving…' : 'Save settings'}
        </button>
        <button type="button" onClick={reset} disabled={!isDirty || isSaving}>
          Reset changes
        </button>
      </div>
      <p className={styles.help}>
        Saved settings apply to subsequent processing jobs. Existing images are not regenerated
        automatically.
      </p>
    </form>
  );
}
