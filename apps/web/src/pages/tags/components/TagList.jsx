export function TagList({ tags, onEdit, onDelete, disabled }) {
  if (!tags.length) return <p>No tags yet.</p>;
  return (
    <ul aria-label="Tags">
      {tags.map((tag) => (
        <li key={tag.id}>
          <p>
            <strong>{tag.name}</strong> <small>{tag.slug}</small>{' '}
            <button
              type="button"
              aria-label={`Edit ${tag.name}`}
              disabled={disabled}
              onClick={() => onEdit(tag)}
            >
              Edit
            </button>{' '}
            <button
              type="button"
              aria-label={`Delete ${tag.name}`}
              disabled={disabled}
              onClick={() => onDelete(tag)}
            >
              Delete
            </button>
          </p>
        </li>
      ))}
    </ul>
  );
}
