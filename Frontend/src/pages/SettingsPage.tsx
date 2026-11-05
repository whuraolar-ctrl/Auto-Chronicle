import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Bell,
  CircleUserRound,
  LockKeyhole,
  Save,
  SlidersHorizontal,
} from 'lucide-react';

import AppPageLayout from '../components/AppPageLayout';
import { api } from '../services/api';

interface Preferences {
  currency: string | null;
  locale: string | null;
  timezone: string | null;
  distanceUnit: string | null;
}

interface ProfileResponse {
  preferences: Preferences;
}

const currencyDisplayNames = new Intl.DisplayNames('en', {
  type: 'currency',
});

const currencyOptions = Intl.supportedValuesOf('currency')
  .sort()
  .map((currency) => ({
    value: currency,
    label: `${currencyDisplayNames.of(currency) ?? currency} (${currency})`,
  }));

const timezoneOptions = Intl.supportedValuesOf('timeZone')
  .sort()
  .map((timezone) => ({
    value: timezone,
    label: timezone,
  }));

export default function SettingsPage() {
  const [preferences, setPreferences] = useState<Preferences>({
    currency: null,
    locale: null,
    timezone: null,
    distanceUnit: null,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    async function loadPreferences() {
      try {
        const response = await api.get<ProfileResponse>('/profile');

        setPreferences(response.data.preferences);
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : 'Unable to load your preferences.';

        setError(message);
      } finally {
        setLoading(false);
      }
    }

    void loadPreferences();
  }, []);

  function updatePreference(field: keyof Preferences, value: string) {
    setPreferences((current) => ({
      ...current,
      [field]: value,
    }));

    setError('');
    setSuccess('');
  }

  async function savePreferences(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const payload = {
        currency: preferences.currency,
        locale: preferences.locale,
        timezone: preferences.timezone,
        distanceUnit: preferences.distanceUnit,
      };

      const response = await api.patch('/profile/preferences', payload);

      if (response.data?.preferences) {
        setPreferences(response.data.preferences);
      }

      setSuccess('Your preferences have been saved.');
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unable to save your preferences.';

      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppPageLayout>
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-3">
          <Link
            to="/dashboard"
            aria-label="Back to dashboard"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#deded5] text-[#17453d] transition hover:bg-white"
          >
            <ArrowLeft size={20} />
          </Link>

          <div>
            <p className="text-xs font-bold tracking-[0.18em] text-[#36745e]">
              AUTO CHRONICLE
            </p>

            <h1 className="mt-1 text-2xl font-semibold text-[#173c36] sm:text-3xl">
              Settings
            </h1>

            <p className="mt-1 text-sm text-[#74847e]">
              Manage your account and application preferences.
            </p>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {success && (
          <div
            role="status"
            className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700"
          >
            {success}
          </div>
        )}

        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#36745e]">
            Account
          </h2>

          <div className="divide-y divide-[#deded5] overflow-hidden rounded-2xl border border-[#deded5] bg-white">
            <SettingsLink
              to="/profile"
              icon={<CircleUserRound size={21} />}
              title="Profile"
              description="Manage your personal information."
            />

            <SettingsLink
              to="/forgot-password"
              icon={<LockKeyhole size={21} />}
              title="Password and security"
              description="Reset your password."
            />
          </div>
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#36745e]">
            Preferences
          </h2>

          <div className="rounded-2xl border border-[#deded5] bg-white p-5 sm:p-6">
            <div className="mb-6 flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f5f3eb] text-[#17453d]">
                <SlidersHorizontal size={21} />
              </div>

              <div>
                <h3 className="font-semibold text-[#173c36]">
                  Application preferences
                </h3>

                <p className="mt-1 text-sm text-[#74847e]">
                  Choose how vehicle information and measurements are displayed.
                </p>
              </div>
            </div>

            {loading ? (
              <p className="text-sm text-[#74847e]">
                Loading your saved preferences...
              </p>
            ) : (
              <form onSubmit={savePreferences} className="space-y-5">
                <div>
                  <label
                    htmlFor="currency"
                    className="mb-2 block text-sm font-medium text-[#173c36]"
                  >
                    Preferred currency
                  </label>

                  <select
                    id="currency"
                    value={preferences.currency ?? ''}
                    onChange={(event) =>
                      updatePreference('currency', event.target.value)
                    }
                    required
                    className="w-full rounded-xl border border-[#deded5] bg-white px-4 py-3 text-sm text-[#173c36] outline-none focus:border-[#36745e]"
                  >
                    <option value="" disabled>
                      Select currency
                    </option>
                    {currencyOptions.map(({ value, label }) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="locale"
                    className="mb-2 block text-sm font-medium text-[#173c36]"
                  >
                    Language
                  </label>

                  <select
                    id="locale"
                    value={preferences.locale ?? ''}
                    onChange={(event) =>
                      updatePreference('locale', event.target.value)
                    }
                    required
                    className="w-full rounded-xl border border-[#deded5] bg-white px-4 py-3 text-sm text-[#173c36] outline-none focus:border-[#36745e]"
                  >
                    <option value="" disabled>
                      Select language
                    </option>
                    <option value="en">English</option>
                    <option value="en-NG">English (Nigeria)</option>
                    <option value="en-GB">English (United Kingdom)</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="timezone"
                    className="mb-2 block text-sm font-medium text-[#173c36]"
                  >
                    Time zone
                  </label>

                  <select
                    id="timezone"
                    value={preferences.timezone ?? ''}
                    onChange={(event) =>
                      updatePreference('timezone', event.target.value)
                    }
                    required
                    className="w-full rounded-xl border border-[#deded5] bg-white px-4 py-3 text-sm text-[#173c36] outline-none focus:border-[#36745e]"
                  >
                    <option value="" disabled>
                      Select time zone
                    </option>
                    {timezoneOptions.map(({ value, label }) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="distanceUnit"
                    className="mb-2 block text-sm font-medium text-[#173c36]"
                  >
                    Distance unit
                  </label>

                  <select
                    id="distanceUnit"
                    value={preferences.distanceUnit ?? ''}
                    onChange={(event) =>
                      updatePreference('distanceUnit', event.target.value)
                    }
                    required
                    className="w-full rounded-xl border border-[#deded5] bg-white px-4 py-3 text-sm text-[#173c36] outline-none focus:border-[#36745e]"
                  >
                    <option value="" disabled>
                      Select distance unit
                    </option>
                    <option value="km">Kilometres (km)</option>
                    <option value="mi">Miles (mi)</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#173C36] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[#24574E] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  <Save size={18} />
                  {saving ? 'Saving...' : 'Save preferences'}
                </button>
              </form>
            )}
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-[#deded5] bg-white p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f5f3eb] text-[#17453d]">
              <Bell size={21} />
            </div>

            <div>
              <h2 className="font-semibold text-[#173c36]">
                Notifications
              </h2>

              <p className="mt-1 text-sm leading-6 text-[#74847e]">
                View vehicle and maintenance reminders from your Dashboard.
                Notification preference controls are not available here yet.
              </p>

              <Link
                to="/dashboard"
                className="mt-2 inline-block text-sm font-semibold text-[#36745e] hover:underline"
              >
                View notifications
              </Link>
            </div>
          </div>
        </section>
      </div>
    </AppPageLayout>
  );
}

interface SettingsLinkProps {
  to: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}

function SettingsLink({
  to,
  icon,
  title,
  description,
}: SettingsLinkProps) {
  return (
    <Link
      to={to}
      className="flex items-center gap-4 p-5 transition hover:bg-[#fbfaf6]"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f5f3eb] text-[#17453d]">
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-[#173c36]">{title}</h3>

        <p className="mt-1 text-sm text-[#74847e]">{description}</p>
      </div>
    </Link>
  );
}
