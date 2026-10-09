import { MutationEditor } from '@/components/common/MutationEditor.jsx';

import { CategoryParentPicker } from './CategoryParentPicker.jsx';

export function CategoryForm({ editor, parentOptions }) {
  return (
    <MutationEditor
      editor={editor}
      noun="category"
      deleteDescription="Deletion is permanent and removes category assignments from media."
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
            <CategoryParentPicker
              options={parentOptions}
              value={editor.draft.parentId}
              onChange={(value) => editor.setField('parentId', value)}
            />
          </>
        )
      }
    />
  );
}
