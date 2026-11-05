import axios from 'axios';
import { CarFront, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState, type SubmitEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import AppPageLayout from '../components/AppPageLayout';
import { api } from '../services/api';

interface Vehicle {
  id: string;
  name: string;
  make: string;
  model: string;
  year: number;
  plate_number: string;
  mileage_km: number | null;
  next_service: string | null;
  is_archived: boolean;
  vehicle_number?: string | null;
  vin?: string | null;
  vehicle_type?: string;
  registration_country?: string | null;
  fuel_type?: string | null;
  transmission?: string | null;
  colour?: string | null;
  assigned_driver?: string | null;
  ownership?: string | null;
  last_serviced?: string | null;
  insurance_expiry?: string | null;
}

interface VehicleForm {
  name: string;
  plateNumber: string;
  vehicleNumber: string;
  vin: string;
  make: string;
  model: string;
  year: string;
  vehicleType: string;
  registrationCountry: string;
  fuelType: string;
  transmission: string;
  colour: string;
  assignedDriver: string;
  ownership: string;
  mileageKm: string;
  lastServiced: string;
  insuranceExpiry: string;
  nextService: string;
}

interface VehicleListResponse {
  data: Vehicle[];
  meta: {
    page: number;
    total: number;
    totalPages: number;
  };
}

function errorMessage(
  error: unknown,
  fallback = 'Unable to load your vehicles.',
): string {
  if (!axios.isAxiosError<{ message?: string | string[] }>(error)) {
    return fallback;
  }
  const message = error.response?.data?.message;
  return Array.isArray(message)
    ? message.join(', ')
    : message || error.message || fallback;
}

function formatServiceDate(value: string | null): string {
  if (!value) return 'No service date set';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return `Service due ${new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
  }).format(date)}`;
}

function emptyForm(): VehicleForm {
  return {
    name: '',
    plateNumber: '',
    vehicleNumber: '',
    vin: '',
    make: '',
    model: '',
    year: '',
    vehicleType: 'car',
    registrationCountry: 'Nigeria',
    fuelType: '',
    transmission: '',
    colour: '',
    assignedDriver: '',
    ownership: '',
    mileageKm: '',
    lastServiced: '',
    insuranceExpiry: '',
    nextService: '',
  };
}

function formFor(vehicle: Vehicle): VehicleForm {
  return {
    name: vehicle.name ?? '',
    plateNumber: vehicle.plate_number ?? '',
    vehicleNumber: vehicle.vehicle_number ?? '',
    vin: vehicle.vin ?? '',
    make: vehicle.make ?? '',
    model: vehicle.model ?? '',
    year: String(vehicle.year ?? ''),
    vehicleType: vehicle.vehicle_type ?? 'car',
    registrationCountry: vehicle.registration_country ?? '',
    fuelType: vehicle.fuel_type ?? '',
    transmission: vehicle.transmission ?? '',
    colour: vehicle.colour ?? '',
    assignedDriver: vehicle.assigned_driver ?? '',
    ownership: vehicle.ownership ?? '',
    mileageKm: vehicle.mileage_km === null ? '' : String(vehicle.mileage_km),
    lastServiced: vehicle.last_serviced ?? '',
    insuranceExpiry: vehicle.insurance_expiry ?? '',
    nextService: vehicle.next_service ?? '',
  };
}

export default function VehiclesPage() {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [archived, setArchived] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [form, setForm] = useState<VehicleForm>(emptyForm);
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingVehicle, setDeletingVehicle] = useState<Vehicle | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadVehicles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<VehicleListResponse>('/vehicles', {
        params: { page: 1, limit: 50, archived },
      });
      setVehicles(response.data.data);
    } catch (requestError: unknown) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [archived]);

  useEffect(() => {
    void loadVehicles();
  }, [loadVehicles]);

  const toggleArchived = async (vehicle: Vehicle) => {
    setError(null);
    try {
      await api.patch(
        `/vehicles/${vehicle.id}/${vehicle.is_archived ? 'unarchive' : 'archive'}`,
      );
      await loadVehicles();
    } catch (requestError: unknown) {
      setError(errorMessage(requestError, 'Unable to update vehicle status.'));
    }
  };

  const openCreateForm = () => {
    setEditingVehicleId(null);
    setForm(emptyForm());
    setFormMode('create');
    setError(null);
  };

  const openEditForm = (vehicle: Vehicle) => {
    setEditingVehicleId(vehicle.id);
    setForm(formFor(vehicle));
    setFormMode('edit');
    setError(null);
  };

  const closeForm = () => {
    setFormMode(null);
    setEditingVehicleId(null);
  };

  const handleDeleteVehicle = async () => {
    if (!deletingVehicle) return;
    setDeleting(true);
    setError(null);
    try {
      await api.delete(`/vehicles/${deletingVehicle.id}`);
      setDeletingVehicle(null);
      await loadVehicles();
    } catch (requestError: unknown) {
      setError(errorMessage(requestError, 'Unable to delete the vehicle.'));
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveVehicle = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = {
      ...form,
      year: Number(form.year),
      mileageKm: form.mileageKm ? Number(form.mileageKm) : null,
      vehicleNumber: form.vehicleNumber || null,
      vin: form.vin || null,
      registrationCountry: form.registrationCountry || 'Nigeria',
      fuelType: form.fuelType || null,
      transmission: form.transmission || null,
      colour: form.colour || null,
      assignedDriver: form.assignedDriver || null,
      ownership: form.ownership || null,
      lastServiced: form.lastServiced || null,
      insuranceExpiry: form.insuranceExpiry || null,
      nextService: form.nextService || null,
    };

    setSavingVehicle(true);
    setError(null);
    try {
      if (formMode === 'edit' && editingVehicleId) {
        await api.patch(`/vehicles/${editingVehicleId}`, payload);
      } else {
        await api.post('/vehicles', payload);
      }
      closeForm();
      await loadVehicles();
    } catch (requestError: unknown) {
      setError(errorMessage(requestError, 'Unable to save vehicle details.'));
    } finally {
      setSavingVehicle(false);
    }
  };

  const updateForm = (field: keyof VehicleForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  return (
    <AppPageLayout>
      <div className="space-y-5 sm:space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-400">
              Your garage
            </p>
            <h1 className="page-heading">Vehicles</h1>
            <p className="mt-2 text-sm text-gray-400">
              Keep vehicle details, repairs, and upcoming service in one place.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-500">
              <input
                type="checkbox"
                checked={archived}
                onChange={(event) => setArchived(event.target.checked)}
                className="h-4 w-4 accent-green-800"
              />
              Show archived
            </label>
            {!archived && (
              <button
                type="button"
                onClick={openCreateForm}
                className="app-primary-button"
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
                Add vehicle
              </button>
            )}
          </div>
        </header>

        {formMode && (
          <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4 sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">
                  {formMode === 'create'
                    ? 'Add a vehicle'
                    : 'Edit vehicle details'}
                </h2>
                <p className="mt-1 text-sm text-gray-400">
                  Update the details saved in your garage.
                </p>
              </div>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white"
                aria-label="Close vehicle form"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={handleSaveVehicle}
              className="grid gap-4 sm:grid-cols-2"
            >
              <label className="space-y-2 text-sm">
                <span className="block font-medium">Vehicle name</span>
                <input
                  value={form.name}
                  onChange={(event) => updateForm('name', event.target.value)}
                  maxLength={100}
                  required
                  className="app-input"
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="block font-medium">
                  Registration / plate number
                </span>
                <input
                  value={form.plateNumber}
                  onChange={(event) =>
                    updateForm('plateNumber', event.target.value)
                  }
                  maxLength={20}
                  required
                  className="app-input"
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="block font-medium">Make</span>
                <input
                  value={form.make}
                  onChange={(event) => updateForm('make', event.target.value)}
                  maxLength={50}
                  required
                  className="app-input"
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="block font-medium">Model</span>
                <input
                  value={form.model}
                  onChange={(event) => updateForm('model', event.target.value)}
                  maxLength={50}
                  required
                  className="app-input"
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="block font-medium">Year</span>
                <input
                  type="number"
                  min="1900"
                  max={new Date().getFullYear() + 1}
                  value={form.year}
                  onChange={(event) => updateForm('year', event.target.value)}
                  required
                  className="app-input"
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="block font-medium">Vehicle type</span>
                <select
                  value={form.vehicleType}
                  onChange={(event) =>
                    updateForm('vehicleType', event.target.value)
                  }
                  className="app-input"
                >
                  <option value="car">Car</option>
                  <option value="van">Van</option>
                  <option value="truck">Truck</option>
                  <option value="bus">Bus</option>
                  <option value="motorcycle">Motorcycle</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span className="block font-medium">Vehicle number</span>
                <input
                  value={form.vehicleNumber}
                  onChange={(event) =>
                    updateForm('vehicleNumber', event.target.value)
                  }
                  maxLength={30}
                  className="app-input"
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="block font-medium">VIN</span>
                <input
                  value={form.vin}
                  onChange={(event) => updateForm('vin', event.target.value)}
                  maxLength={30}
                  className="app-input"
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="block font-medium">Registration country</span>
                <input
                  value={form.registrationCountry}
                  onChange={(event) =>
                    updateForm('registrationCountry', event.target.value)
                  }
                  className="app-input"
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="block font-medium">Fuel type</span>
                <select
                  value={form.fuelType}
                  onChange={(event) =>
                    updateForm('fuelType', event.target.value)
                  }
                  className="app-input"
                >
                  <option value="">Not set</option>
                  <option value="petrol">Petrol</option>
                  <option value="diesel">Diesel</option>
                  <option value="electric">Electric</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span className="block font-medium">Transmission</span>
                <select
                  value={form.transmission}
                  onChange={(event) =>
                    updateForm('transmission', event.target.value)
                  }
                  className="app-input"
                >
                  <option value="">Not set</option>
                  <option value="automatic">Automatic</option>
                  <option value="manual">Manual</option>
                  <option value="cvt">CVT</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span className="block font-medium">Colour</span>
                <input
                  value={form.colour}
                  onChange={(event) => updateForm('colour', event.target.value)}
                  maxLength={30}
                  className="app-input"
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="block font-medium">Assigned driver</span>
                <input
                  value={form.assignedDriver}
                  onChange={(event) =>
                    updateForm('assignedDriver', event.target.value)
                  }
                  maxLength={100}
                  className="app-input"
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="block font-medium">Ownership</span>
                <select
                  value={form.ownership}
                  onChange={(event) =>
                    updateForm('ownership', event.target.value)
                  }
                  className="app-input"
                >
                  <option value="">Not set</option>
                  <option value="owned">Owned</option>
                  <option value="leased">Leased</option>
                  <option value="company">Company</option>
                  <option value="financed">Financed</option>
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span className="block font-medium">Mileage (km)</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.mileageKm}
                  onChange={(event) =>
                    updateForm('mileageKm', event.target.value)
                  }
                  className="app-input"
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="block font-medium">Last serviced</span>
                <select
                  value={form.lastServiced}
                  onChange={(event) =>
                    updateForm('lastServiced', event.target.value)
                  }
                  className="app-input"
                >
                  <option value="">Not set</option>
                  <option value="under_6_months">Under 6 months ago</option>
                  <option value="6_12_months">6–12 months ago</option>
                  <option value="over_a_year">Over a year ago</option>
                  <option value="not_sure">Not sure</option>
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span className="block font-medium">Insurance expiry</span>
                <input
                  type="date"
                  value={form.insuranceExpiry}
                  onChange={(event) =>
                    updateForm('insuranceExpiry', event.target.value)
                  }
                  className="app-input"
                />
              </label>
              <label className="space-y-2 text-sm">
                <span className="block font-medium">Next service</span>
                <input
                  type="date"
                  value={form.nextService}
                  onChange={(event) =>
                    updateForm('nextService', event.target.value)
                  }
                  className="app-input"
                />
              </label>
              <div className="flex gap-3 sm:col-span-2">
                <button
                  type="submit"
                  disabled={savingVehicle}
                  className="app-primary-button disabled:opacity-50"
                >
                  {savingVehicle
                    ? 'Saving...'
                    : formMode === 'create'
                      ? 'Save vehicle'
                      : 'Save changes'}
                </button>
                <button
                  type="button"
                  onClick={closeForm}
                  className="app-secondary-button"
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        )}

        {error && (
          <p
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            role="alert"
          >
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-gray-400" role="status">
            Loading vehicles...
          </p>
        ) : vehicles.length ? (
          <ul className="grid gap-4 lg:grid-cols-2">
            {vehicles.map((vehicle) => (
              <li
                key={vehicle.id}
                className="rounded-2xl border border-gray-800 bg-gray-900 p-4 shadow-sm sm:p-5"
              >
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-green-50 text-xl">
                    <CarFront
                      aria-hidden="true"
                      className="h-6 w-6 text-green-800"
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h2 className="font-semibold">
                          {vehicle.name || `${vehicle.make} ${vehicle.model}`}
                        </h2>
                        <p className="mt-1 text-xs text-gray-500">
                          {vehicle.year} {vehicle.make} {vehicle.model}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg border border-gray-800 bg-gray-950 px-2.5 py-1 font-mono text-xs">
                          {vehicle.plate_number}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditForm(vehicle)}
                            aria-label={`Edit ${vehicle.name || vehicle.model}`}
                            title="Edit vehicle"
                            className="group grid h-9 w-9 place-items-center rounded-xl border border-gray-800 bg-gray-950 text-gray-400 transition-all duration-200 hover:-translate-y-0.5 hover:border-green-700 hover:bg-green-800 hover:text-white hover:shadow-lg hover:shadow-green-900/40 active:scale-95"
                          >
                            <Pencil
                              aria-hidden="true"
                              className="h-4 w-4 transition-transform duration-300 group-hover:rotate-[-8deg]"
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingVehicle(vehicle)}
                            aria-label={`Delete ${vehicle.name || vehicle.model}`}
                            title="Delete vehicle"
                            className="group grid h-9 w-9 place-items-center rounded-xl border border-gray-800 bg-gray-950 text-gray-400 transition-all duration-200 hover:-translate-y-0.5 hover:border-red-800 hover:bg-red-900 hover:text-white hover:shadow-lg hover:shadow-red-900/40 active:scale-95"
                          >
                            <Trash2
                              aria-hidden="true"
                              className="h-4 w-4 transition-transform duration-300 group-hover:rotate-8"
                            />
                          </button>
                        </div>
                      </div>
                    </div>
                    <p className="mt-4 text-xs text-gray-500">
                      {vehicle.mileage_km === null
                        ? 'Mileage not set'
                        : `${new Intl.NumberFormat().format(vehicle.mileage_km)} km`}
                      <span className="mx-2 text-gray-300">·</span>
                      {formatServiceDate(vehicle.next_service)}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/vehicles/${vehicle.id}/repairs/new`)
                        }
                        className="app-secondary-button"
                      >
                        Log repair
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/vehicles/${vehicle.id}/reports/new`)
                        }
                        className="app-secondary-button"
                      >
                        Report an issue
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleArchived(vehicle)}
                        className="app-text-button"
                      >
                        {vehicle.is_archived ? 'Restore vehicle' : 'Archive'}
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <section className="rounded-2xl border border-dashed border-gray-800 bg-gray-900 px-5 py-12 text-center">
            <span className="text-3xl" aria-hidden="true">
              <CarFront
                aria-hidden="true"
                className="mx-auto h-8 w-8 text-green-800"
              />
            </span>
            <h2 className="mt-3 font-semibold">
              {archived ? 'No archived vehicles' : 'Your garage is ready'}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
              {archived
                ? 'Vehicles you archive will appear here.'
                : 'There are no vehicles to show yet. Add one to start keeping its story.'}
            </p>
          </section>
        )}
      </div>

      {deletingVehicle && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-vehicle-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => !deleting && setDeletingVehicle(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-red-950 text-red-400">
                <Trash2 aria-hidden="true" className="h-6 w-6" />
              </span>
              <div>
                <h2
                  id="delete-vehicle-title"
                  className="text-lg font-semibold"
                >
                  Delete this vehicle?
                </h2>
                <p className="mt-2 text-sm text-gray-400">
                  You're about to permanently delete{' '}
                  <strong className="text-gray-200">
                    {deletingVehicle.name ||
                      `${deletingVehicle.make} ${deletingVehicle.model}`}
                  </strong>{' '}
                  ({deletingVehicle.plate_number}) and all of its history. This
                  cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setDeletingVehicle(null)}
                disabled={deleting}
                className="rounded-xl border border-gray-800 px-5 py-3 text-sm font-medium text-gray-300 transition hover:bg-gray-800 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteVehicle()}
                disabled={deleting}
                className="rounded-xl bg-red-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-800 disabled:opacity-60"
              >
                {deleting ? 'Deleting...' : 'Yes, delete vehicle'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppPageLayout>
  );
}
