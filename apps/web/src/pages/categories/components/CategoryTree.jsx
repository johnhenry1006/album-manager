import { EmptyState } from '@/components/common/EmptyState.jsx';
export function CategoryTree({ categories, onEdit, onDelete, disabled }) {
  if (!categories.length) return <EmptyState title="No categories yet." />;
  return (
    <ul aria-label="Categories">
      {categories.map((category) => (
        <li key={category.id}>
          <p>
            <strong>{category.name}</strong> <small>{category.slug}</small>{' '}
            <button
              type="button"
              aria-label={`Edit ${category.name}`}
              disabled={disabled}
              onClick={() => onEdit(category)}
            >
              Edit
            </button>{' '}
            <button
              type="button"
              aria-label={`Delete ${category.name}`}
              title={category.hasChildren ? 'Delete or reparent children first.' : undefined}
              disabled={disabled || category.hasChildren}
              onClick={() => onDelete(category)}
            >
              Delete
            </button>
          </p>
          {category.children?.length > 0 && (
            <CategoryTree
              categories={category.children}
              onEdit={onEdit}
              onDelete={onDelete}
              disabled={disabled}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
