import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { App } from './App.jsx';

function renderRoute(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('application routes', () => {
  it.each([
    ['/dashboard', 'Dashboard'],
    ['/albums', 'Albums'],
    ['/albums/album-123', 'Album details'],
    ['/media', 'Media'],
    ['/media/media-123', 'Media details'],
    ['/upload', 'Upload'],
    ['/categories', 'Categories'],
    ['/tags', 'Tags'],
    ['/favorites', 'Favorites'],
    ['/search', 'Search'],
    ['/trash', 'Trash'],
    ['/settings', 'Settings'],
    ['/settings/storage', 'Storage'],
    ['/settings/image-optimization', 'Image optimization'],
  ])('renders %s inside the application shell', (path, title) => {
    renderRoute(path);
    expect(
      within(screen.getByRole('main')).getByRole('heading', { level: 1, name: title }),
    ).toBeVisible();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    expect(screen.getByRole('banner')).toBeVisible();
  });

  it('redirects the root to the dashboard', () => {
    renderRoute('/');
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps parent navigation active on detail routes', () => {
    renderRoute('/albums/album-123');
    expect(screen.getByRole('link', { name: 'Albums' })).toHaveAttribute('aria-current', 'page');
  });

  it('navigates to settings subpages', async () => {
    const user = userEvent.setup();
    renderRoute('/dashboard');
    await user.click(screen.getByRole('link', { name: 'Storage' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Storage' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Settings', exact: true })).not.toHaveAttribute(
      'aria-current',
    );
    await user.click(screen.getByRole('link', { name: 'Image optimization' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Image optimization' })).toBeVisible();
  });

  it('shows a recoverable fallback for unknown URLs', async () => {
    const user = userEvent.setup();
    renderRoute('/does-not-exist');
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Go to dashboard' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  });
});
