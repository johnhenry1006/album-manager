import { useQueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { AppProviders } from './AppProviders.jsx';

function CacheProbe() {
  const client = useQueryClient();
  const previous = client.getQueryData(['probe']);
  client.setQueryData(['probe'], 'cached');
  return <p>{previous ?? 'empty cache'}</p>;
}

it('provides a stable query client for each app mount without sharing caches', () => {
  const first = render(
    <AppProviders>
      <CacheProbe />
    </AppProviders>,
  );
  expect(screen.getByText('empty cache')).toBeVisible();
  first.rerender(
    <AppProviders>
      <CacheProbe />
    </AppProviders>,
  );
  expect(screen.getByText('cached')).toBeVisible();
  first.unmount();
  render(
    <AppProviders>
      <CacheProbe />
    </AppProviders>,
  );
  expect(screen.getByText('empty cache')).toBeVisible();
});
