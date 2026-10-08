import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { Skeleton } from '@/components/ui/Skeleton.jsx';
import { Spinner } from '@/components/ui/Spinner.jsx';

import { EmptyState } from './EmptyState.jsx';
import { ErrorState } from './ErrorState.jsx';

it('displays an error and runs an optional retry action', async () => {
  const onRetry = vi.fn();
  const user = userEvent.setup();
  render(<ErrorState title="Unable to load" description="Please try again." onRetry={onRetry} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to load');
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  expect(onRetry).toHaveBeenCalledOnce();
});

it('omits the retry button when no action is provided', () => {
  render(<ErrorState />);
  expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('displays an empty state with optional content', () => {
  render(
    <EmptyState
      title="No results"
      description="Try a different search."
      action={<button>Clear search</button>}
    />,
  );
  expect(screen.getByRole('heading', { name: 'No results' })).toBeVisible();
  expect(screen.getByText('Try a different search.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Clear search' })).toBeVisible();
});

it('announces loading while hiding decorative skeletons from assistive technology', () => {
  const { container } = render(
    <>
      <Spinner label="Loading media" />
      <Skeleton />
    </>,
  );
  expect(screen.getByRole('status')).toHaveTextContent('Loading media');
  expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
});
