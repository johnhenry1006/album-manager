import { EmptyState } from '@/components/common/EmptyState.jsx';

export function MediaEmptyState({
  title = 'No media yet',
  description = 'No media to display.',
  action,
}) {
  return <EmptyState title={title} description={description} action={action} />;
}
