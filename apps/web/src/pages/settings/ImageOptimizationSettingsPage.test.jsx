import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { settingsQueryKeys } from '@/features/settings/index.js';
import { createQueryClient } from '@/services/queryClient.js';

import { ImageOptimizationSettingsPage } from './ImageOptimizationSettingsPage.jsx';

const initial = {
  optimizationMode: 'BALANCED',
  optimizedMaxWidth: 2560,
  optimizedMaxHeight: 2560,
  previewMaxWidth: 1600,
  previewMaxHeight: 1600,
  thumbnailSizes: [800, 400, 200],
  outputFormat: 'webp',
  balancedQuality: 80,
  highQuality: 90,
  maximumCompressionQuality: 60,
  keepOriginal: true,
};
const clients = [];
const respond = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
function setup() {
  const client = createQueryClient();
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <ImageOptimizationSettingsPage />
    </QueryClientProvider>,
  );
  return client;
}
function server() {
  let settings = initial;
  const patches = [];
  const fetch = vi.fn(async (url, options) => {
    expect(url).toBe('/api/settings/image-optimization');
    if (options.method === 'PATCH') {
      const body = JSON.parse(options.body);
      patches.push(body);
      settings = { ...settings, ...body };
    }
    return respond(settings);
  });
  vi.stubGlobal('fetch', fetch);
  return { fetch, patches };
}
async function loaded() {
  return screen.findByRole('combobox', { name: 'Optimization mode' });
}
function change(label, value) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function submit() {
  fireEvent.submit(screen.getByRole('form', { name: 'Image optimization settings' }));
}
afterEach(() => {
  clients.forEach((client) => client.clear());
  clients.length = 0;
  vi.unstubAllGlobals();
});

it('loads persisted values and explains the encoding and original preservation policies', async () => {
  server();
  setup();
  expect(screen.getByText('Loading image optimization settings…')).toBeVisible();
  expect(await loaded()).toHaveValue('BALANCED');
  expect(screen.getByLabelText('Optimized maximum width')).toHaveValue(2560);
  expect(screen.getByLabelText('Optimized maximum height')).toHaveValue(2560);
  expect(screen.getByLabelText('Preview maximum width')).toHaveValue(1600);
  expect(screen.getByLabelText('Preview maximum height')).toHaveValue(1600);
  expect(screen.getByLabelText('Thumbnail sizes')).toHaveValue('800, 400, 200');
  expect(screen.getByLabelText('Output format')).toHaveValue('webp');
  expect(screen.getByLabelText('Balanced quality')).toHaveValue(80);
  expect(screen.getByText(/not mathematically lossless/)).toBeVisible();
  expect(screen.getByText(/Original files are always preserved/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled();
});

it.each([
  ['LOSSLESS', null],
  ['BALANCED', 'Balanced quality'],
  ['HIGH_QUALITY', 'High quality'],
  ['MAX_COMPRESSION', 'Maximum compression quality'],
])('shows the applicable quality control for %s', async (mode, label) => {
  server();
  setup();
  await loaded();
  change('Optimization mode', mode);
  for (const name of ['Balanced quality', 'High quality', 'Maximum compression quality']) {
    if (name === label) expect(screen.getByLabelText(name)).toBeVisible();
    else expect(screen.queryByLabelText(name)).not.toBeInTheDocument();
  }
  if (mode === 'LOSSLESS')
    expect(screen.getByText(/pixels presented to the WebP encoder/)).toBeVisible();
});

it('saves typed partial updates and preserves quality settings for other modes', async () => {
  const { patches } = server();
  setup();
  await loaded();
  change('Optimization mode', 'HIGH_QUALITY');
  change('Optimized maximum width', '2200');
  change('Optimized maximum height', '1800');
  change('Preview maximum width', '1200');
  change('Preview maximum height', '800');
  change('Thumbnail sizes', '600, 300');
  change('High quality', '94');
  submit();
  await screen.findByText('Image optimization settings saved.');
  expect(patches).toEqual([
    {
      optimizationMode: 'HIGH_QUALITY',
      optimizedMaxWidth: 2200,
      optimizedMaxHeight: 1800,
      previewMaxWidth: 1200,
      previewMaxHeight: 800,
      thumbnailSizes: [600, 300],
      highQuality: 94,
    },
  ]);
  expect(screen.getByLabelText('High quality')).toHaveValue(94);
  expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled();
});

it.each([
  ['Optimized maximum width', '', /integer between 1 and 16383/],
  ['Preview maximum height', '0', /integer between 1 and 16383/],
  ['Balanced quality', '101', /integer between 1 and 100/],
  ['Thumbnail sizes', '400, 400', /distinct sizes/],
  ['Thumbnail sizes', '400,', /whole numbers/],
  ['Thumbnail sizes', '4e2, 200', /whole numbers/],
  ['Thumbnail sizes', '1,2,3,4,5,6,7,8,9', /1 to 8/],
])('rejects invalid %s locally without sending a PATCH', async (label, value, message) => {
  const { patches } = server();
  setup();
  await loaded();
  change(label, value);
  submit();
  expect(await screen.findByRole('alert')).toHaveTextContent(message);
  expect(patches).toEqual([]);
});

it('keeps the draft on save failure and allows retry', async () => {
  let failed = true;
  let settings = initial;
  vi.stubGlobal('fetch', async (_url, options) => {
    if (options.method === 'PATCH') {
      if (failed)
        return respond({ error: 'INTERNAL_ERROR', message: 'Internal server error' }, 500);
      settings = { ...settings, ...JSON.parse(options.body) };
    }
    return respond(settings);
  });
  setup();
  await loaded();
  change('Balanced quality', '77');
  submit();
  expect(await screen.findByRole('alert')).toHaveTextContent('Internal server error');
  expect(screen.getByLabelText('Balanced quality')).toHaveValue(77);
  failed = false;
  submit();
  await screen.findByText('Image optimization settings saved.');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('offers retry after a load failure without rendering an editable defaults form', async () => {
  let failed = true;
  vi.stubGlobal('fetch', async () =>
    failed ? respond({ error: 'HTTP_ERROR', message: 'Unavailable' }, 503) : respond(initial),
  );
  setup();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not load image optimization settings',
  );
  expect(screen.queryByRole('form')).not.toBeInTheDocument();
  failed = false;
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await loaded();
});

it('retains edits during background refresh and resets explicitly to the latest settings', async () => {
  let settings = initial;
  vi.stubGlobal('fetch', async () => respond(settings));
  const client = setup();
  await loaded();
  change('Balanced quality', '75');
  settings = { ...initial, previewMaxWidth: 900, balancedQuality: 83 };
  await client.invalidateQueries({ queryKey: settingsQueryKeys.imageOptimization() });
  expect(screen.getByLabelText('Balanced quality')).toHaveValue(75);
  fireEvent.click(screen.getByRole('button', { name: 'Reset changes' }));
  await waitFor(() => expect(screen.getByLabelText('Balanced quality')).toHaveValue(83));
  expect(screen.getByLabelText('Preview maximum width')).toHaveValue(900);
});

it('disables editing and prevents duplicate submission while saving', async () => {
  let finish;
  let settings = initial;
  const patches = [];
  vi.stubGlobal('fetch', async (_url, options) => {
    if (options.method === 'PATCH') {
      patches.push(JSON.parse(options.body));
      return new Promise((resolve) => {
        finish = () => {
          settings = { ...initial, ...patches[0] };
          resolve(respond(settings));
        };
      });
    }
    return respond(settings);
  });
  setup();
  await loaded();
  change('Balanced quality', '76');
  submit();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled());
  expect(screen.getByLabelText('Optimization mode')).toBeDisabled();
  expect(screen.getByLabelText('Balanced quality')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Reset changes' })).toBeDisabled();
  submit();
  expect(patches).toHaveLength(1);
  finish();
  await screen.findByText('Image optimization settings saved.');
});

it.each([
  ['LOSSLESS', {}],
  ['HIGH_QUALITY', { highQuality: 93 }],
])(
  'saves %s without validating or submitting an inactive invalid quality',
  async (mode, qualityPatch) => {
    const { patches } = server();
    setup();
    await loaded();
    change('Balanced quality', '');
    change('Optimization mode', mode);
    if (mode === 'HIGH_QUALITY') change('High quality', '93');
    submit();
    await screen.findByText('Image optimization settings saved.');
    expect(patches).toEqual([{ optimizationMode: mode, ...qualityPatch }]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    change('Optimization mode', 'BALANCED');
    expect(screen.getByLabelText('Balanced quality')).toHaveValue(80);
  },
);

it('does not mark inactive quality drafts as changes for the selected mode', async () => {
  server();
  setup();
  await loaded();
  change('Optimization mode', 'HIGH_QUALITY');
  change('High quality', '93');
  change('Optimization mode', 'BALANCED');
  expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled();
  change('Optimization mode', 'HIGH_QUALITY');
  expect(screen.getByLabelText('High quality')).toHaveValue(93);
});
