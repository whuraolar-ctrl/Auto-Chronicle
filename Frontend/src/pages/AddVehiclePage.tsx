import axios from 'axios';
import { ArrowLeft } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppPageLayout from '../components/AppPageLayout';
import { api } from '../services/api';

const VEHICLE_TYPES = [
  { value: 'car', label: 'Car' },
  { value: 'van', label: 'Van' },
  { value: 'truck', label: 'Truck' },
  { value: 'bus', label: 'Bus' },
  { value: 'motorcycle', label: 'Motorcycle' },
  { value: 'other', label: 'Other' },
] as const;

type VehicleType = (typeof VEHICLE_TYPES)[number]['value'];

function collectMessages(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectMessages);
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap(
      collectMessages,
    );
  }
  return [];
}

function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return 'Unable to connect to the server. Please check your connection.';
    }
    const data: unknown = error.response.data;
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      const details = [
        ...collectMessages(record.errors),
        ...collectMessages(record.details),
        ...collectMessages(record.message),
      ];
      const unique = Array.from(new Set(details));
      if (unique.length) return unique.join(' · ');
    }
  }
  return 'Unable to add the vehicle. Please try again.';
}

const inputClass =
  'mt-1 block min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100';

export default function AddVehiclePage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType | ''>('');
  const [mileage, setMileage] = useState('');
  const [nextService, setNextService] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    const yearNumber = Number(year);
    const maxYear = new Date().getFullYear() + 1;
    if (
      !Number.isInteger(yearNumber) ||
      yearNumber < 1900 ||
      yearNumber > maxYear
    ) {
      setError(`Enter a valid year between 1900 and ${maxYear}.`);
      return;
    }

    if (!vehicleType) {
      setError('Choose a vehicle type.');
      return;
    }

    const payload: Record<string, string | number> = {
      name: name.trim(),
      make: make.trim(),
      model: model.trim(),
      year: yearNumber,
      plateNumber: plateNumber.trim(),
      vehicleType,
    };

    if (mileage.trim()) {
      const mileageNumber = Number(mileage);
      if (!Number.isFinite(mileageNumber) || mileageNumber < 0) {
        setError('Mileage must be a number that is 0 or more.');
        return;
      }
      payload.mileageKm = Math.round(mileageNumber);
    }

    if (nextService) payload.nextService = nextService;

    setSubmitting(true);
    try {
      await api.post('/vehicles', payload);
      navigate('/vehicles');
    } catch (requestError: unknown) {
      setError(errorMessage(requestError));
      setSubmitting(false);
    }
  };

  return (
    <AppPageLayout>
      <div className="mx-auto w-full max-w-2xl space-y-5 sm:space-y-6">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:text-teal-900"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to dashboard
        </Link>

        <header>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-400">
            Your garage
          </p>
          <h1 className="page-heading">Add vehicle</h1>
          <p className="mt-2 text-sm text-slate-500">
            Enter the basics. You can log repairs and report issues afterwards.
          </p>
        </header>

        {error && (
          <p
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            role="alert"
          >
            {error}
          </p>
        )}

        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
        >
          <label className="block text-sm font-medium text-slate-700">
            Vehicle name
            <input
              type="text"
              required
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Work van"
              className={inputClass}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Make
              <input
                type="text"
                required
                maxLength={50}
                value={make}
                onChange={(event) => setMake(event.target.value)}
                placeholder="e.g. Toyota"
                className={inputClass}
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Model
              <input
                type="text"
                required
                maxLength={50}
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="e.g. Corolla"
                className={inputClass}
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Year
              <input
                type="number"
                required
                inputMode="numeric"
                value={year}
                onChange={(event) => setYear(event.target.value)}
                placeholder="e.g. 2018"
                className={inputClass}
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Plate number
              <input
                type="text"
                required
                maxLength={20}
                value={plateNumber}
                onChange={(event) => setPlateNumber(event.target.value)}
                placeholder="e.g. ABC-123DE"
                className={inputClass}
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Vehicle type
              <select
                required
                value={vehicleType}
                onChange={(event) =>
                  setVehicleType(event.target.value as VehicleType | '')
                }
                className={inputClass}
              >
                <option value="">Select a type</option>
                {VEHICLE_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Mileage in km (optional)
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={mileage}
                onChange={(event) => setMileage(event.target.value)}
                className={inputClass}
              />
            </label>

            <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
              Next service date (optional)
              <input
                type="date"
                value={nextService}
                onChange={(event) => setNextService(event.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => navigate(-1)}
              disabled={submitting}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60"
            >
              {submitting ? 'Saving...' : 'Save vehicle'}
            </button>
          </div>
        </form>
      </div>
    </AppPageLayout>
  );
}
