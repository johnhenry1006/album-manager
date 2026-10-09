import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { ImageFallback } from './ImageFallback.jsx';
import { ImagePlaceholder } from './ImagePlaceholder.jsx';
import { ResponsiveImage } from './ResponsiveImage.jsx';

const variants = [
  { type: 'THUMBNAIL', width: 320, height: 240, url: '/thumb.webp' },
  { type: 'PREVIEW', width: 1600, height: 1200, url: '/preview.webp' },
  { type: 'ORIGINAL', width: 4000, height: 3000, url: '/original.jpg' },
];

it('renders responsive derivatives with lazy loading, async decoding, alt and reserved dimensions', () => {
  const { container } = render(
    <ResponsiveImage
      variants={variants}
      alt="A mountain"
      width={800}
      height={600}
      sizes="(max-width: 600px) 100vw, 400px"
    />,
  );
  const image = screen.getByRole('img', { name: 'A mountain' });
  expect(image).toHaveAttribute('src', '/thumb.webp');
  expect(image).toHaveAttribute('srcset', '/thumb.webp 320w, /preview.webp 1600w');
  expect(image).toHaveAttribute('sizes', '(max-width: 600px) 100vw, 400px');
  expect(image).toHaveAttribute('loading', 'lazy');
  expect(image).toHaveAttribute('decoding', 'async');
  expect(image).toHaveAttribute('width', '800');
  expect(image).toHaveAttribute('height', '600');
  expect(parseFloat(container.firstChild.style.aspectRatio)).toBeCloseTo(4 / 3);
  expect(container.firstChild).toHaveAttribute('aria-busy', 'true');
  expect(container.querySelector('[data-image-placeholder]')).toBeInTheDocument();
});

it('removes the loading placeholder on load and preserves reserved space', () => {
  const onLoad = vi.fn();
  const { container } = render(
    <ResponsiveImage variants={variants} alt="Mountain" onLoad={onLoad} />,
  );
  const before = container.firstChild.style.aspectRatio;
  fireEvent.load(screen.getByRole('img', { name: 'Mountain' }));
  expect(container.querySelector('[data-image-placeholder]')).not.toBeInTheDocument();
  expect(container.firstChild).toHaveAttribute('aria-busy', 'false');
  expect(container.firstChild.style.aspectRatio).toBe(before);
  expect(onLoad).toHaveBeenCalledOnce();
});

it('shows an accessible error fallback without fetching another source or original', () => {
  const onError = vi.fn();
  const { container } = render(
    <ResponsiveImage variants={variants} alt="Mountain" onError={onError} />,
  );
  fireEvent.error(screen.getByRole('img', { name: 'Mountain' }));
  expect(container.querySelector('img')).not.toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Mountain' })).toHaveTextContent('Image unavailable');
  expect(container.querySelector('[data-image-placeholder]')).not.toBeInTheDocument();
  expect(container.firstChild).toHaveAttribute('aria-busy', 'false');
  expect(onError).toHaveBeenCalledOnce();
});

it('resets loading state for new variants after both success and error', () => {
  const { container, rerender } = render(<ResponsiveImage variants={variants} alt="Image" />);
  fireEvent.load(screen.getByRole('img', { name: 'Image' }));
  rerender(
    <ResponsiveImage
      variants={[{ type: 'PREVIEW', url: '/next.webp', width: 800, height: 400 }]}
      alt="Next"
    />,
  );
  expect(container.querySelector('[data-image-placeholder]')).toBeInTheDocument();
  fireEvent.error(screen.getByRole('img', { name: 'Next' }));
  rerender(
    <ResponsiveImage
      variants={[{ type: 'THUMBNAIL', url: '/third.webp', width: 200, height: 200 }]}
      alt="Third"
    />,
  );
  expect(screen.getByRole('img', { name: 'Third' })).toHaveAttribute('src', '/third.webp');
  expect(container.querySelector('[data-image-placeholder]')).toBeInTheDocument();
});

it('accepts compact gallery thumbnails and explicit aspect ratio', () => {
  const { container } = render(
    <ResponsiveImage
      thumbnails={[{ name: 'small', width: 200, height: 100, url: '/gallery.webp' }]}
      aspectRatio={2}
      alt="Gallery"
    />,
  );
  expect(screen.getByRole('img', { name: 'Gallery' })).toHaveAttribute(
    'srcset',
    '/gallery.webp 200w',
  );
  expect(parseFloat(container.firstChild.style.aspectRatio)).toBe(2);
});

it('shows fallback without an image request when only originals or invalid variants exist', () => {
  const { container } = render(
    <ResponsiveImage variants={[variants[2]]} src="/original.jpg" alt="Unavailable" />,
  );
  expect(container.querySelector('img')).not.toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Unavailable' })).toHaveTextContent('Image unavailable');
});

it('does not treat explicitly original descriptors in thumbnails as safe', () => {
  const { container } = render(<ResponsiveImage thumbnails={[variants[2]]} />);
  expect(container.querySelector('img')).not.toBeInTheDocument();
});

it('keeps decorative loading and error states hidden from assistive technology', () => {
  const { container, rerender } = render(<ImagePlaceholder />);
  expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  rerender(<ImageFallback alt="" />);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
});

it('reserves a valid default box when dimensions are unavailable or invalid', () => {
  const { container } = render(
    <ResponsiveImage variants={null} width={0} height={-2} aspectRatio={NaN} />,
  );
  expect(parseFloat(container.firstChild.style.aspectRatio)).toBe(1);
  expect(container.querySelector('img')).not.toBeInTheDocument();
});

it('shows images already loaded from the browser cache without waiting for another load event', () => {
  const complete = vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
  const naturalWidth = vi
    .spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get')
    .mockReturnValue(320);
  try {
    const { container } = render(<ResponsiveImage variants={variants} alt="Cached" />);
    expect(container.querySelector('[data-image-placeholder]')).not.toBeInTheDocument();
    expect(container.firstChild).toHaveAttribute('aria-busy', 'false');
    expect(screen.getByRole('img', { name: 'Cached' })).toHaveStyle({ opacity: 1 });
  } finally {
    complete.mockRestore();
    naturalWidth.mockRestore();
  }
});

it('shows a cached failure rather than leaving the loading placeholder indefinitely', () => {
  const complete = vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
  const naturalWidth = vi
    .spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get')
    .mockReturnValue(0);
  try {
    const { container } = render(<ResponsiveImage variants={variants} alt="Broken" />);
    expect(container.querySelector('[data-image-placeholder]')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Broken' })).toHaveTextContent('Image unavailable');
  } finally {
    complete.mockRestore();
    naturalWidth.mockRestore();
  }
});

it('keeps a loaded image visible when equivalent descriptors are recreated', () => {
  const { container, rerender } = render(<ResponsiveImage variants={variants} alt="Stable" />);
  fireEvent.load(screen.getByRole('img', { name: 'Stable' }));
  rerender(
    <ResponsiveImage
      variants={variants.map((variant) => ({ ...variant }))}
      alt="Updated description"
    />,
  );
  expect(container.querySelector('[data-image-placeholder]')).not.toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Updated description' })).toHaveStyle({ opacity: 1 });
});

it('updates sizes after resize without remounting the loaded image', () => {
  const { container, rerender } = render(<ResponsiveImage variants={variants} sizes="200px" />);
  const image = container.querySelector('img');
  fireEvent.load(image);
  rerender(<ResponsiveImage variants={variants} sizes="300px" />);
  expect(container.querySelector('img')).toBe(image);
  expect(image).toHaveAttribute('sizes', '300px');
  expect(container.querySelector('[data-image-placeholder]')).not.toBeInTheDocument();
});
