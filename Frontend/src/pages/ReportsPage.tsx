import axios from 'axios';
import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import AppPageLayout from '../components/AppPageLayout';
import { api } from '../services/api';

interface DriverReport {
  id: string;
  vehicleId: string;
  reportedBy: string;
  issueId?: string | null;
  issueStatus?: 'reported' | 'being_checked' | 'being_fixed' | 'fixed' | null;
  category: string;
  severity: string;
  timing: string;
  description: string | null;
  status: 'new' | 'logged' | 'dismissed';
  createdAt: string;
}

interface ReportListResponse {
  data: DriverReport[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

function errorMessage(error: unknown, fallback: string): string {
  if (!axios.isAxiosError<{ message?: string | string[] }>(error)) {
    return fallback;
  }
  const message = error.response?.data?.message;
  return Array.isArray(message)
    ? message.join(', ')
    : message || error.message || fallback;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}

export default function ReportsPage() {
  const location = useLocation();
  const [reports, setReports] = useState<DriverReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyReportId, setBusyReportId] = useState<string | null>(null);
  const [notice] = useState(
    (location.state as { notice?: string } | null)?.notice ?? null,
  );

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<ReportListResponse>('/driver-reports', {
        params: { page: 1, limit: 20 },
      });
      setReports(response.data.data);
    } catch (requestError: unknown) {
      setError(errorMessage(requestError, 'Failed to load driver reports'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchReports();
  }, [fetchReports]);

  const handleAction = async (
    reportId: string,
    action: 'convert' | 'dismiss' | 'under_review' | 'fixed',
    issueId?: string | null,
  ) => {
    setBusyReportId(reportId);
    setActionError(null);
    try {
      if (action === 'under_review' || action === 'fixed') {
        if (!issueId) {
          throw new Error('This report is not linked to an issue yet.');
        }
        await api.patch(`/issues/${issueId}/status`, {
          status: action === 'under_review' ? 'being_checked' : 'fixed',
        });
      } else {
        await api.post(`/driver-reports/${reportId}/${action}`);
      }
      await fetchReports();
    } catch (requestError: unknown) {
      setActionError(
        errorMessage(requestError, `Failed to ${action} driver report`),
      );
    } finally {
      setBusyReportId(null);
    }
  };

  if (loading) {
    return (
      <AppPageLayout>
        <p className="text-sm text-gray-400 sm:text-base" role="status">
          Loading driver reports...
        </p>
      </AppPageLayout>
    );
  }

  return (
    <AppPageLayout>
      <div className="space-y-5 sm:space-y-6">
        <header>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-orange-400">
            Fleet activity
          </p>
          <h1 className="page-heading">Driver reports</h1>
        </header>

        {notice && (
          <p
            className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
            role="status"
          >
            {notice}
          </p>
        )}
        {error && (
          <p
            className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300"
            role="alert"
          >
            {error}
          </p>
        )}
        {actionError && (
          <p
            className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300"
            role="alert"
          >
            {actionError}
          </p>
        )}

        {!error && (
          <div className="space-y-4">
            {reports.length ? (
              reports.map((report) => (
                <article
                  key={report.id}
                  className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-5"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-gray-800 px-2 py-1 font-mono text-xs text-gray-300">
                          Vehicle {report.vehicleId.slice(0, 8)}
                        </span>
                        <span className="text-sm font-semibold text-orange-300">
                          {report.category}
                        </span>
                        <span className="rounded-full bg-gray-800 px-2.5 py-1 text-[10px] uppercase tracking-wide text-gray-300">
                          {report.status}
                        </span>
                      </div>
                      <p className="mt-3 text-sm text-gray-300">
                        {report.description ||
                          'No additional details provided.'}
                      </p>
                      <p className="mt-2 text-xs text-gray-500">
                        {report.severity.replaceAll('_', ' ')} ·{' '}
                        {report.timing.replaceAll('_', ' ')} ·{' '}
                        {formatDate(report.createdAt)}
                      </p>
                    </div>

                    {report.status === 'new' && (
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            void handleAction(report.id, 'convert')
                          }
                          disabled={busyReportId !== null}
                          className="rounded-lg bg-orange-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {busyReportId === report.id
                            ? 'Working...'
                            : 'Convert to issue'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void handleAction(report.id, 'dismiss')
                          }
                          disabled={busyReportId !== null}
                          className="rounded-lg border border-gray-700 px-3 py-2 text-xs text-gray-300 transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                    {report.status === 'logged' && report.issueId && (
                      <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                        {report.issueStatus === 'fixed' ? (
                          <span className="rounded-lg bg-green-100 px-3 py-2 text-xs font-semibold text-green-800">
                            Fixed and closed
                          </span>
                        ) : (
                          <>
                            <p className="text-xs text-gray-400">
                              {report.issueStatus === 'reported'
                                ? 'Choose how to track this report.'
                                : 'This issue is still open.'}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {report.issueStatus === 'reported' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleAction(
                                      report.id,
                                      'under_review',
                                      report.issueId,
                                    )
                                  }
                                  disabled={busyReportId !== null}
                                  className="rounded-lg border border-gray-700 px-3 py-2 text-xs text-gray-300 transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Mark under review
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  void handleAction(
                                    report.id,
                                    'fixed',
                                    report.issueId,
                                  )
                                }
                                disabled={busyReportId !== null}
                                className="rounded-lg bg-green-700 px-3 py-2 text-xs font-medium text-white transition hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Mark fixed and close
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <p className="rounded-xl border border-dashed border-gray-800 px-4 py-10 text-center text-sm text-gray-500">
                No driver reports found.
              </p>
            )}
          </div>
        )}
      </div>
    </AppPageLayout>
  );
}
