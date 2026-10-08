import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { VirtualMediaGrid } from '../index.js';

let width;
const observers = new Set();
beforeEach(() => {
  width = 620;
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(() => width);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(300);
  HTMLElement.prototype.scrollTo = function ({ top }) {
    this.scrollTop = top;
  };
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback) {
        this.callback = callback;
        observers.add(this);
      }
      observe() {}
      unobserve() {
        observers.delete(this);
      }
      disconnect() {
        observers.delete(this);
      }
    },
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  observers.clear();
  delete HTMLElement.prototype.scrollTo;
});

const mediaItems = (count) =>
  Array.from({ length: count }, (_, i) => ({
    id: `m${i}`,
    originalFilename: `Photo ${i}`,
    width: 800,
    height: 600,
    thumbnails: [{ name: 'small', width: 200, height: 150, url: `/thumb-${i}.webp` }],
    variants: [{ type: 'ORIGINAL', width: 800, height: 600, url: `/original-${i}.jpg` }],
  }));

it('exposes controlled selection independently of activation and disables it during actions', async () => {
  const onToggleSelection = vi.fn();
  const onActivate = vi.fn();
  const items = mediaItems(1);
  const { rerender } = render(
    <VirtualMediaGrid
      items={items}
      isSelected={() => true}
      onToggleSelection={onToggleSelection}
      onActivate={onActivate}
    />,
  );
  const checkbox = await screen.findByRole('checkbox', { name: 'Select Photo 0' });
  expect(checkbox).toBeChecked();
  fireEvent.click(checkbox);
  expect(onToggleSelection).toHaveBeenCalledWith('m0');
  expect(onActivate).not.toHaveBeenCalled();
  rerender(
    <VirtualMediaGrid
      items={items}
      isSelected={() => false}
      onToggleSelection={onToggleSelection}
      selectionDisabled
    />,
  );
  expect(screen.getByRole('checkbox')).toBeDisabled();
  expect(screen.getByRole('checkbox')).not.toBeChecked();
});

it('mounts a bounded number of cards for 10000 items and maps scroll offsets to later rows', async () => {
  const { container } = render(
    <VirtualMediaGrid
      items={mediaItems(10000)}
      height={300}
      minColumnWidth={200}
      gap={10}
      overscan={1}
    />,
  );
  await waitFor(() =>
    expect(container.querySelectorAll('[data-media-id]').length).toBeGreaterThan(0),
  );
  expect(container.querySelectorAll('[data-media-id]').length).toBeLessThanOrEqual(12);
  expect(container.querySelector('[data-media-id="m0"]')).toBeInTheDocument();
  const viewport = screen.getByRole('region', { name: 'Media gallery' });
  fireEvent.scroll(viewport, { target: { scrollTop: 21000 } });
  await waitFor(() =>
    expect(container.querySelector('[data-media-id="m0"]')).not.toBeInTheDocument(),
  );
  expect(container.querySelector('[data-media-id="m300"]')).toBeInTheDocument();
  expect(container.querySelectorAll('[data-media-id]').length).toBeLessThanOrEqual(15);
  for (const image of container.querySelectorAll('img'))
    expect(image.getAttribute('src')).toMatch(/^\/thumb-/);
});

it('updates columns and virtual row geometry when the container is resized', async () => {
  const { container } = render(
    <VirtualMediaGrid items={mediaItems(20)} minColumnWidth={200} gap={10} height={300} />,
  );
  await waitFor(() =>
    expect(container.querySelector('[data-column-count="3"]')).toBeInTheDocument(),
  );
  act(() => {
    width = 410;
    for (const observer of observers) observer.callback([]);
  });
  await waitFor(() =>
    expect(container.querySelector('[data-column-count="2"]')).toBeInTheDocument(),
  );
  expect(container.querySelector('[data-media-id="m0"]')).toBeInTheDocument();
});

it('requests another page near the end, prevents duplicate requests and waits for in-flight requests', async () => {
  const onLoadMore = vi.fn(() => Promise.resolve());
  const items = mediaItems(6);
  const { rerender } = render(
    <VirtualMediaGrid
      items={items}
      hasNextPage
      isFetchingNextPage
      onLoadMore={onLoadMore}
      height={300}
    />,
  );
  expect(onLoadMore).not.toHaveBeenCalled();
  rerender(<VirtualMediaGrid items={items} hasNextPage onLoadMore={onLoadMore} height={300} />);
  await waitFor(() => expect(onLoadMore).toHaveBeenCalledOnce());
  rerender(
    <VirtualMediaGrid items={[...items]} hasNextPage onLoadMore={onLoadMore} height={300} />,
  );
  expect(onLoadMore).toHaveBeenCalledOnce();
  rerender(
    <VirtualMediaGrid items={mediaItems(9)} hasNextPage onLoadMore={onLoadMore} height={300} />,
  );
  await waitFor(() => expect(onLoadMore).toHaveBeenCalledTimes(2));
});

it('does not fetch away from the end or when pagination is exhausted', async () => {
  const onLoadMore = vi.fn();
  const { rerender, container } = render(
    <VirtualMediaGrid items={mediaItems(100)} hasNextPage onLoadMore={onLoadMore} height={300} />,
  );
  await waitFor(() => expect(container.querySelector('[data-media-id]')).toBeInTheDocument());
  expect(onLoadMore).not.toHaveBeenCalled();
  rerender(
    <VirtualMediaGrid
      items={mediaItems(3)}
      hasNextPage={false}
      onLoadMore={onLoadMore}
      height={300}
    />,
  );
  expect(onLoadMore).not.toHaveBeenCalled();
});

it('shows media empty state and keeps activation under caller control', async () => {
  const onActivate = vi.fn();
  const { rerender } = render(<VirtualMediaGrid items={[]} />);
  expect(screen.getByRole('heading', { name: 'No media yet' })).toBeInTheDocument();
  const items = mediaItems(1);
  rerender(<VirtualMediaGrid items={items} onActivate={onActivate} />);
  const button = await screen.findByRole('button', { name: 'Open Photo 0' });
  fireEvent.click(button);
  expect(onActivate).toHaveBeenCalledWith(items[0]);
});

it('uses configurable overscan without mounting the full collection', async () => {
  const items = mediaItems(1000);
  const { container, rerender } = render(
    <VirtualMediaGrid items={items} minColumnWidth={200} gap={10} overscan={0} height={300} />,
  );
  await waitFor(() => expect(container.querySelectorAll('[data-media-id]')).toHaveLength(6));
  rerender(
    <VirtualMediaGrid items={items} minColumnWidth={200} gap={10} overscan={3} height={300} />,
  );
  await waitFor(() => expect(container.querySelectorAll('[data-media-id]')).toHaveLength(15));
});

it('requests the next page when scrolling near the last loaded rows', async () => {
  const onLoadMore = vi.fn();
  const { container } = render(
    <VirtualMediaGrid
      items={mediaItems(30)}
      minColumnWidth={200}
      gap={10}
      height={300}
      hasNextPage
      onLoadMore={onLoadMore}
    />,
  );
  await waitFor(() => expect(container.querySelector('[data-media-id]')).toBeInTheDocument());
  expect(onLoadMore).not.toHaveBeenCalled();
  fireEvent.scroll(screen.getByRole('region', { name: 'Media gallery' }), {
    target: { scrollTop: 1790 },
  });
  await waitFor(() => expect(onLoadMore).toHaveBeenCalledOnce());
});

it('does not loop or leak unhandled rejections when the caller fails to load a page', async () => {
  const onLoadMore = vi.fn(() => Promise.reject(new Error('Offline')));
  const items = mediaItems(3);
  const { rerender, container } = render(
    <VirtualMediaGrid items={items} hasNextPage onLoadMore={onLoadMore} />,
  );
  await waitFor(() => expect(onLoadMore).toHaveBeenCalledOnce());
  await waitFor(() => expect(container.firstChild).toHaveAttribute('aria-busy', 'false'));
  rerender(<VirtualMediaGrid items={[...items]} hasNextPage onLoadMore={onLoadMore} />);
  expect(onLoadMore).toHaveBeenCalledOnce();
});

it('shows initial loading instead of the empty state', () => {
  render(<VirtualMediaGrid items={[]} isLoading />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading media');
  expect(screen.queryByRole('heading', { name: 'No media yet' })).not.toBeInTheDocument();
});

it('continues pagination when an overlapping page advances the cursor without adding unique items', async () => {
  const onLoadMore = vi.fn(() => Promise.resolve());
  const items = mediaItems(3);
  const { rerender, container } = render(
    <VirtualMediaGrid items={items} hasNextPage nextCursor="cursor-one" onLoadMore={onLoadMore} />,
  );
  await waitFor(() => expect(onLoadMore).toHaveBeenCalledOnce());
  await waitFor(() => expect(container.firstChild).toHaveAttribute('aria-busy', 'false'));
  rerender(
    <VirtualMediaGrid items={items} hasNextPage nextCursor="cursor-two" onLoadMore={onLoadMore} />,
  );
  await waitFor(() => expect(onLoadMore).toHaveBeenCalledTimes(2));
});
