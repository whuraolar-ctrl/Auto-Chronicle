import { api, getAccessToken } from './api';

export async function downloadExpensesCsv(params: {
  month: number;
  year: number;
  months?: number;
}): Promise<void> {
  const response = await api.get<Blob>('/expenses/export', {
    params,
    responseType: 'blob',
  });

  const disposition = response.headers['content-disposition'] as string | undefined;
  const match = disposition?.match(/filename="?([^"]+)"?/i);
  const filename = match?.[1] ?? `expenses-\( {params.year}- \){params.month}.csv`;

  const url = window.URL.createObjectURL(response.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

/** Optional: only needed if you call fetch manually instead of axios. */
export function exportUrl(params: {
  month: number;
  year: number;
  months?: number;
}): string {
  const q = new URLSearchParams({
    month: String(params.month),
    year: String(params.year),
    ...(params.months != null ? { months: String(params.months) } : {}),
  });
  // api base already includes /api in many setups; adjust if needed
  return `/expenses/export?${q.toString()}`;
}

export { getAccessToken };
