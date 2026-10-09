const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];

/** Format decimal byte strings without converting large totals to Number. */
export function formatBytes(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return '—';
  const bytes = BigInt(value);
  let unit = 0;
  let divisor = 1n;
  while (bytes >= divisor * 1024n && unit < units.length - 1) {
    unit++;
    divisor *= 1024n;
  }
  if (unit === 0) return `${bytes.toLocaleString('en-US')} B`;
  const scaled = (bytes * 10n + divisor / 2n) / divisor;
  const fraction = scaled % 10n;
  return `${(scaled / 10n).toLocaleString('en-US')}${fraction ? `.${fraction}` : ''} ${units[unit]}`;
}
