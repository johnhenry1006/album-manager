import { useId } from 'react';

import styles from './AlbumList.module.css';

export function AlbumListHeader({ total, create }) {
  const id = useId();
  return (
    <section aria-label="Album actions">
      <div className={styles.header}>
        <p>
          {total === undefined
            ? 'Your album collections'
            : `${total} ${total === 1 ? 'album' : 'albums'}`}
        </p>
        {!create.isCreating && (
          <button type="button" onClick={create.openCreate}>
            Create album
          </button>
        )}
      </div>
      {create.isCreating && (
        <form
          className={styles.createForm}
          onSubmit={create.submitCreate}
          aria-label="Create album"
        >
          <h2>Create album</h2>
          <label className={styles.field} htmlFor={`${id}-name`}>
            Album name
            <input
              id={`${id}-name`}
              autoFocus
              required
              maxLength={255}
              value={create.draft.name}
              disabled={create.isPending}
              onChange={(event) => create.setDraftField('name', event.target.value)}
            />
          </label>
          <label className={styles.field} htmlFor={`${id}-description`}>
            Description
            <textarea
              id={`${id}-description`}
              maxLength={5000}
              value={create.draft.description}
              disabled={create.isPending}
              onChange={(event) => create.setDraftField('description', event.target.value)}
            />
          </label>
          <label className={styles.field} htmlFor={`${id}-visibility`}>
            Album visibility
            <select
              id={`${id}-visibility`}
              value={create.draft.visibility}
              disabled={create.isPending}
              onChange={(event) => create.setDraftField('visibility', event.target.value)}
            >
              <option value="PRIVATE">Private</option>
              <option value="PUBLIC">Public</option>
            </select>
          </label>
          {create.error && <p role="alert">{create.error}</p>}
          <div className={styles.actions}>
            <button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Saving…' : 'Save album'}
            </button>
            <button type="button" disabled={create.isPending} onClick={create.cancelCreate}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
