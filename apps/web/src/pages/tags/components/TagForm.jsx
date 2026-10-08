import { MutationEditor } from '@/components/common/MutationEditor.jsx';

export function TagForm({ editor }) {
  return (
    <MutationEditor
      editor={editor}
      noun="tag"
      deleteDescription="Deletion is permanent and removes tag assignments from media."
      fields={
        editor.draft && (
          <>
            <p>
              <label>
                Name{' '}
                <input
                  name="name"
                  required
                  maxLength={255}
                  pattern={'[^\\r\\n\\u0000]+'}
                  value={editor.draft.name}
                  onChange={(event) => editor.setField('name', event.target.value)}
                />
              </label>
            </p>
            <p>
              <label>
                Slug{' '}
                <input
                  name="slug"
                  maxLength={255}
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  value={editor.draft.slug}
                  onChange={(event) => editor.setField('slug', event.target.value)}
                />
              </label>
            </p>
            <p>Leave the slug blank to generate it on creation or preserve it on update.</p>
          </>
        )
      }
    />
  );
}
