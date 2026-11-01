import axios from 'axios';
import { ArrowLeft, CarFront } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AppPageLayout from '../components/AppPageLayout';
import { api } from '../services/api';

interface Vehicle {
  id: string;
  name: string | null;
  make: string;
  model: string;
  year: number;
  plate_number: string;
  mileage_km: number | null;
  next_service: string | null;
  is_archived: boolean;
}

interface ApiErrorResponse {
  message?: string | string[];
}

function errorMessage(error: unknown): string {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    if (error.response?.status === 404) return 'Vehicle not found.';
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (message) return message;
    if (!error.response) {
      return 'Unable to connect to the server. Please check your connection.';
    }
  }
  return 'Something went wrong. Please try again.';
}

function formatDate(value: string | null): string {
  if (!value) return 'Not scheduled';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
    date,
  );
}

export default function VehicleDetailPage() {
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadVehicle = useCallback(async () => {
    if (!vehicleId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/vehicles/${vehicleId}`);
      const payload = response.data?.data ?? response.data;
      setVehicle(payload as Vehicle);
    } catch (requestError: unknown) {
      setVehicle(null);
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [vehicleId]);

  useEffect(() => {
    void loadVehicle();
  }, [loadVehicle]);

  const toggleArchived = async () => {
    if (!vehicle || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(
        `/vehicles/${vehicle.id}/${vehicle.is_archived ? 'unarchive' : 'archive'}`,
      );
      await loadVehicle();
    } catch (requestError: unknown) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const title = vehicle
    ? vehicle.name?.trim() || `${vehicle.make} ${vehicle.model}`
    : 'Vehicle';

  return (
    <AppPageLayout>
      <div className="mx-auto w-full max-w-2xl space-y-5 sm:space-y-6">
        <Link
          to="/vehicles"
          className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:text-teal-900"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to vehicles
        </Link>

        {error && (
          <p
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            role="alert"
          >
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-slate-500" role="status">
            Loading vehicle...
          </p>
        ) : vehicle ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex items-start gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-teal-50">
                <CarFront
                  aria-hidden="true"
                  className="h-6 w-6 text-teal-700"
                />
              </span>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-bold text-slate-900">{title}</h1>
                <p className="mt-1 text-sm text-slate-500">
                  {vehicle.year} {vehicle.make} {vehicle.model}
                  {vehicle.is_archived ? ' · Archived' : ''}
                </p>
              </div>
              <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs text-slate-700">
                {vehicle.plate_number}
              </span>
            </div>

            <dl className="mt-6 divide-y divide-slate-100 text-sm">
              <div className="flex justify-between gap-3 py-3">
                <dt className="text-slate-500">Mileage</dt>
                <dd className="font-medium text-slate-800">
                  {vehicle.mileage_km == null
                    ? 'Not recorded'
                    : `${new Intl.NumberFormat().format(vehicle.mileage_km)} km`}
                </dd>
              </div>
              <div className="flex justify-between gap-3 py-3">
                <dt className="text-slate-500">Next service</dt>
                <dd className="font-medium text-slate-800">
                  {formatDate(vehicle.next_service)}
                </dd>
              </div>
              <div className="flex justify-between gap-3 py-3">
                <dt className="text-slate-500">Plate number</dt>
                <dd className="font-medium text-slate-800">
                  {vehicle.plate_number || 'Not provided'}
                </dd>
              </div>
            </dl>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={() => navigate(`/vehicles/${vehicle.id}/repairs/new`)}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-700"
              >
                Log repair
              </button>
              <button
                type="button"
                onClick={() => navigate(`/vehicles/${vehicle.id}/reports/new`)}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Report an issue
              </button>
              <button
                type="button"
                onClick={() => void toggleArchived()}
                disabled={busy}
                className="inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                {vehicle.is_archived ? 'Restore vehicle' : 'Archive'}
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </AppPageLayout>
  );
}
