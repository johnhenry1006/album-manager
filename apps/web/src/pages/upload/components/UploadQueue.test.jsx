import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { UploadQueue } from './UploadQueue.jsx';

it('paginates large queues, keeps actions available, and clamps the page after removal', () => {
  const queue = {
    items: Array.from({ length: 101 }, (_, index) => ({
      id: String(index),
      file: { name: `Photo ${index}`, size: 1024 },
      status: 'queued',
    })),
    queuedCount: 101,
    isBusy: false,
    start: vi.fn(),
    cancelAll: vi.fn(),
    clearFinished: vi.fn(),
    retry: vi.fn(),
    cancel: vi.fn(),
    remove: vi.fn(),
    resolveDuplicate: vi.fn(),
  };
  const { rerender } = render(<UploadQueue queue={queue} />);
  expect(screen.getAllByRole('listitem')).toHaveLength(50);
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  expect(screen.getByRole('listitem', { name: 'Photo 50' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
  expect(queue.remove).toHaveBeenCalledWith('100');
  rerender(<UploadQueue queue={{ ...queue, items: queue.items.slice(0, 50) }} />);
  expect(screen.getAllByRole('listitem')).toHaveLength(50);
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
});
