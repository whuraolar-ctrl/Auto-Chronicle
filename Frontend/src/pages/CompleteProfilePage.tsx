import { useState, type SubmitEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest, getAccessToken } from '../services/api';

interface ProfileForm {
  firstName: string;
  lastName: string;
  phone: string;
  username: string;
  accountType: 'personal' | 'fleet';
  acceptedTerms: boolean;
}

const initialForm: ProfileForm = {
  firstName: '',
  lastName: '',
  phone: '+234',
  username: '',
  accountType: 'personal',
  acceptedTerms: false,
};

export default function CompleteProfilePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function updateField<Key extends keyof ProfileForm>(
    key: Key,
    value: ProfileForm[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const accessToken = getAccessToken();
    if (!accessToken) {
      setError('Your session has expired. Please sign in again.');
      return;
    }

    setLoading(true);
    try {
      await apiRequest('/api/auth/complete-profile', accessToken, {
        method: 'POST',
        body: JSON.stringify(form),
      });
      navigate('/dashboard', { replace: true });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to complete your profile.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell bg-[#fbfaf6] text-[#18352f]">
      <section className="auth-card max-w-xl">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">
            Complete your profile
          </h1>
          <p className="mt-2 text-sm text-[#71807c]">
            A few details are needed to finish setting up your account.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span>First name</span>
            <input
              value={form.firstName}
              onChange={(event) => updateField('firstName', event.target.value)}
              maxLength={50}
              required
              className="w-full rounded-lg border border-[#d8d9d2] bg-[#fbfaf6] px-4 py-3 focus:border-[#36745e]"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span>Last name</span>
            <input
              value={form.lastName}
              onChange={(event) => updateField('lastName', event.target.value)}
              maxLength={50}
              required
              className="w-full rounded-lg border border-[#d8d9d2] bg-[#fbfaf6] px-4 py-3 focus:border-[#36745e]"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span>Phone (international format)</span>
            <input
              type="tel"
              value={form.phone}
              onChange={(event) => updateField('phone', event.target.value)}
              placeholder="+2348000000000"
              required
              className="w-full rounded-lg border border-[#d8d9d2] bg-[#fbfaf6] px-4 py-3 focus:border-[#36745e]"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span>Username</span>
            <input
              value={form.username}
              onChange={(event) => updateField('username', event.target.value)}
              minLength={3}
              maxLength={20}
              pattern="[A-Za-z0-9_]{3,20}"
              required
              className="w-full rounded-lg border border-[#d8d9d2] bg-[#fbfaf6] px-4 py-3 focus:border-[#36745e]"
            />
          </label>
          <label className="space-y-2 text-sm sm:col-span-2">
            <span>Account type</span>
            <select
              value={form.accountType}
              onChange={(event) =>
                updateField(
                  'accountType',
                  event.target.value as ProfileForm['accountType'],
                )
              }
              className="w-full rounded-lg border border-[#d8d9d2] bg-[#fbfaf6] px-4 py-3"
            >
              <option value="personal">Personal</option>
              <option value="fleet">Fleet</option>
            </select>
          </label>
          <label className="flex items-center gap-3 text-sm text-[#71807c] sm:col-span-2">
            <input
              type="checkbox"
              checked={form.acceptedTerms}
              onChange={(event) =>
                updateField('acceptedTerms', event.target.checked)
              }
              required
            />
            I accept the terms and privacy policy.
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-700 sm:col-span-2">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-[#36745e] px-4 py-3 font-semibold text-white disabled:opacity-60 sm:col-span-2"
          >
            {loading ? 'Saving profile...' : 'Finish setup'}
          </button>
        </form>
      </section>
    </main>
  );
}
