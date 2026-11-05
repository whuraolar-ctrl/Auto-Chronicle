import axios from 'axios';
import { useEffect, useState, type SubmitEvent } from 'react';
import AppPageLayout from '../components/AppPageLayout';
import { api } from '../services/api';

interface Fleet {
  id: string;
  name: string;
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

export default function FleetManagementPage() {
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [fleetId, setFleetId] = useState('');
  const [fleetName, setFleetName] = useState('');
  const [email, setEmail] = useState('');
  const [loadingFleets, setLoadingFleets] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .get<Fleet[]>('/fleets')
      .then((response) => {
        if (!active) return;
        setFleets(response.data);
        setFleetId(response.data[0]?.id ?? '');
      })
      .catch(
        (requestError: unknown) =>
          active &&
          setError(errorMessage(requestError, 'Failed to load your fleets')),
      )
      .finally(() => active && setLoadingFleets(false));

    return () => {
      active = false;
    };
  }, []);

  const handleInvite = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!fleetId) return;

    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      await api.post(`/fleets/${fleetId}/invitations`, { email });
      setSuccess(`An invitation email was sent to ${email}.`);
      setEmail('');
    } catch (requestError: unknown) {
      setError(errorMessage(requestError, 'Failed to send fleet invitation'));
    } finally {
      setSending(false);
    }
  };

  const handleCreateFleet = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await api.post<Fleet>('/fleets', {
        name: fleetName.trim(),
      });
      setFleets((current) => [...current, response.data]);
      setFleetId(response.data.id);
      setFleetName('');
      setSuccess(
        `Fleet “${response.data.name}” is ready. You can now invite a driver.`,
      );
    } catch (requestError: unknown) {
      setError(errorMessage(requestError, 'Failed to create fleet'));
    } finally {
      setSending(false);
    }
  };

  return (
    <AppPageLayout>
      <div className="mx-auto max-w-2xl space-y-5 sm:space-y-6">
        <header>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-orange-400">
            Fleet tools
          </p>
          <h1 className="page-heading text-white">Invite a driver</h1>
          <p className="mt-2 text-sm text-gray-400">
            Create a fleet or choose one you manage, then invite a driver by
            email.
          </p>
        </header>
        <section className="space-y-4 rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-6">
          <div>
            <h2 className="font-semibold">Create a fleet</h2>
            <p className="mt-1 text-sm text-gray-400">
              Set up your fleet before sending its first driver invitation.
            </p>
          </div>
          <form
            onSubmit={handleCreateFleet}
            className="flex flex-col gap-3 sm:flex-row"
          >
            <label className="sr-only" htmlFor="fleet-name">
              Fleet name
            </label>
            <input
              id="fleet-name"
              value={fleetName}
              onChange={(event) => setFleetName(event.target.value)}
              maxLength={100}
              required
              placeholder="e.g. City delivery team"
              className="app-input min-w-0 flex-1"
            />
            <button
              type="submit"
              disabled={sending}
              className="app-primary-button disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? 'Please wait...' : 'Create fleet'}
            </button>
          </form>
        </section>
        <section className="space-y-4 rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-6">
          {loadingFleets ? (
            <p className="text-sm text-gray-400" role="status">
              Loading your fleets...
            </p>
          ) : fleets.length ? (
            <>
              <label className="block space-y-2 text-sm text-gray-300">
                Fleet
                <select
                  value={fleetId}
                  onChange={(event) => setFleetId(event.target.value)}
                  className="w-full rounded-lg border border-gray-800 bg-gray-950 px-4 py-2.5 text-sm text-gray-100"
                >
                  {fleets.map((fleet) => (
                    <option key={fleet.id} value={fleet.id}>
                      {fleet.name}
                    </option>
                  ))}
                </select>
              </label>
              <form onSubmit={handleInvite} className="space-y-3">
                <label
                  className="block space-y-2 text-sm text-gray-300"
                  htmlFor="driver-email"
                >
                  Driver email
                  <input
                    id="driver-email"
                    type="email"
                    placeholder="driver@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    className="w-full rounded-lg border border-gray-800 bg-gray-950 px-4 py-2.5 text-sm text-gray-100"
                  />
                </label>
                <button
                  type="submit"
                  disabled={sending}
                  className="rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending ? 'Sending...' : 'Send invitation'}
                </button>
              </form>
            </>
          ) : (
            <p className="text-sm text-gray-400">
              No fleets are available for this account yet.
            </p>
          )}
          {error && (
            <p className="text-sm text-red-300" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="text-sm text-emerald-300" role="status">
              {success}
            </p>
          )}
        </section>
      </div>
    </AppPageLayout>
  );
}
