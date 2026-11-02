import axios from 'axios';
import {
  ArrowLeft,
  Camera,
  ChevronRight,
  LockKeyhole,
  LogOut,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type SubmitEvent,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppPageLayout from '../components/AppPageLayout';
import { api } from '../services/api';
import { supabase } from '../services/supabase';
interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  username: string | null;
  account_type?: string | null;
  avatar_url?: string | null;
}
interface ProfileUpdateResponse {
  message: string;
  profile: {
    avatarUrl: string | null;
  };
}
interface MeResponse {
  id: string;
  email?: string;
  profileComplete: boolean;
  profile: UserProfile | null;
}
interface ProfileStatistics {
  activeVehicles: number;
  archivedVehicles: number;
  totalVehicles: number;
  driverReports: number;
  resolvedIssues: number;
}
interface ProfileForm {
  firstName: string;
  lastName: string;
  username: string;
  phone: string;
}
function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) {
      return message.join(', ');
    }
    if (typeof message === 'string') {
      return message;
    }
    if (!error.response) {
      return 'Unable to connect to Auto Chronicle. Check your connection and try again.';
    }
    return error.message || 'Something went wrong.';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}
function getAccountType(value: string | null | undefined): string {
  if (!value) {
    return 'Account';
  }
  if (value.toLowerCase() === 'personal') {
    return 'Personal account';
  }
  if (value.toLowerCase() === 'fleet') {
    return 'Fleet account';
  }
  return value;
}
function getInitials(profile: UserProfile): string {
  const first = profile.first_name?.trim().charAt(0) ?? '';
  const last = profile.last_name?.trim().charAt(0) ?? '';
  return `${first}${last}`.toUpperCase() || '?';
}
export default function ProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [statistics, setStatistics] = useState<ProfileStatistics | null>(null);
  const [statisticsError, setStatisticsError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState<ProfileForm>({
    firstName: '',
    lastName: '',
    username: '',
    phone: '',
  });
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const populateForm = useCallback((value: UserProfile) => {
    setForm({
      firstName: value.first_name ?? '',
      lastName: value.last_name ?? '',
      username: value.username ?? '',
      phone: value.phone ?? '',
    });
  }, []);
  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get<MeResponse>('/auth/me');
      if (!response.data.profileComplete || !response.data.profile) {
        navigate('/complete-profile', { replace: true });
        return;
      }
      const currentProfile = response.data.profile;
      setProfile(currentProfile);
      populateForm(currentProfile);
      setStatisticsError('');
      try {
        const statisticsResponse = await api.get<ProfileStatistics>(
          '/profile/statistics',
        );
        setStatistics(statisticsResponse.data);
      } catch (statisticsLoadError) {
        setStatistics(null);
        setStatisticsError(getErrorMessage(statisticsLoadError));
      }
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [navigate, populateForm]);
  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);
  function handleFieldChange(field: keyof ProfileForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setError('');
    setSuccess('');
  }
  function cancelEditing() {
    if (profile) {
      populateForm(profile);
    }
    setEditing(false);
    setError('');
    setSuccess('');
  }
  async function handleSave(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) {
      return;
    }
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const username = form.username.trim();
    const phone = form.phone.trim();
    if (!firstName || !lastName) {
      setError('First name and last name are required.');
      return;
    }
    if (username && !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      setError(
        'Username must be 3–20 characters and contain only letters, numbers, or underscores.',
      );
      return;
    }
    if (phone && !/^\+[1-9]\d{7,14}$/.test(phone)) {
      setError(
        'Enter your phone number in international format, for example +2348012345678.',
      );
      return;
    }
    const updates: Record<string, string> = {};
    if (firstName !== profile.first_name) {
      updates.firstName = firstName;
    }
    if (lastName !== profile.last_name) {
      updates.lastName = lastName;
    }
    if (username !== (profile.username ?? '')) {
      updates.username = username;
    }
    if (phone !== (profile.phone ?? '')) {
      updates.phone = phone;
    }
    if (Object.keys(updates).length === 0) {
      setSuccess('Your profile is already up to date.');
      setEditing(false);
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const response = await api.patch<{
        message: string;
        profile: UserProfile;
      }>('/auth/me', updates);
      setProfile(response.data.profile);
      populateForm(response.data.profile);
      setEditing(false);
      setSuccess(response.data.message);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file || !profile) {
      return;
    }

    if (!supabase) {
      setError(
        'Profile image uploads are not configured. Please contact support.',
      );
      event.target.value = '';
      return;
    }

    const extensionsByType: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };
    const extension = extensionsByType[file.type];

    if (!file.type.startsWith('image/') || !extension) {
      setError('Choose a JPEG, PNG, or WebP image.');
      event.target.value = '';
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('Your profile picture must be 5 MB or smaller.');
      event.target.value = '';
      return;
    }

    setUploadingAvatar(true);
    setError('');
    setSuccess('');

    try {
      const path = `${profile.id}/avatar-${Date.now()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from('profile-avatars')
        .upload(path, file, {
          upsert: false,
          contentType: file.type,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data } = supabase.storage
        .from('profile-avatars')
        .getPublicUrl(path);

      const response = await api.patch<ProfileUpdateResponse>('/profile', {
        avatarUrl: data.publicUrl,
      });

      setProfile((currentProfile) =>
        currentProfile
          ? {
              ...currentProfile,
              avatar_url: response.data.profile.avatarUrl ?? data.publicUrl,
            }
          : currentProfile,
      );
      setSuccess('Profile picture updated successfully.');
    } catch (uploadError) {
      setError(getErrorMessage(uploadError));
    } finally {
      setUploadingAvatar(false);

      if (avatarInputRef.current) {
        avatarInputRef.current.value = '';
      }
    }
  }

  async function handleLogout() {
    try {
      await api.post('/auth/logout');
    } catch {
      // Clear the local session even if the server request fails.
    } finally {
      localStorage.removeItem('sb-auth-token');
      navigate('/login', { replace: true });
    }
  }

  if (loading) {
    return (
      <AppPageLayout>
        {' '}
        <div className="flex min-h-[50vh] items-center justify-center">
          {' '}
          <div role="status" className="text-center">
            {' '}
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-[#dce6df] border-t-[#17453d]" />{' '}
            <p className="text-sm text-[#74847e]">
              {' '}
              Loading your profile...{' '}
            </p>{' '}
          </div>{' '}
        </div>{' '}
      </AppPageLayout>
    );
  }
  if (!profile) {
    return (
      <AppPageLayout>
        {' '}
        <section className="mx-auto max-w-xl rounded-2xl border border-[#deded5] bg-white p-6 sm:p-8">
          {' '}
          <h1 className="text-2xl font-semibold text-[#173c36]">
            {' '}
            Profile unavailable{' '}
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#74847e]">
            {' '}
            {error || 'We could not load your profile. Please try again.'}{' '}
          </p>
          <button
            type="button"
            onClick={() => void loadProfile()}
            className="mt-6 rounded-xl bg-[#17453d] px-5 py-3 font-semibold text-white hover:bg-[#10382f]"
          >
            {' '}
            Try again{' '}
          </button>{' '}
        </section>{' '}
      </AppPageLayout>
    );
  }
  const fullName = `${profile.first_name} ${profile.last_name}`.trim();
  return (
    <AppPageLayout>
      {' '}
      <div className="mx-auto max-w-5xl pb-8">
        {' '}
        {/* Profile banner */}{' '}
        <section className="relative overflow-hidden rounded-t-3xl bg-[#153f36] px-5 pb-20 pt-6 text-white sm:px-8 sm:pt-8">
          {' '}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-10 -top-12 h-52 w-52 rounded-full bg-white/5 sm:h-64 sm:w-64"
          />
          <div className="relative flex items-center justify-between gap-4">
            {' '}
            <button
              type="button"
              onClick={() => navigate(-1)}
              aria-label="Go back"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/40 bg-white/15 text-white transition hover:bg-white/30"
            >
              <ArrowLeft aria-hidden="true" className="h-5 w-5" />
            </button>
            <p className="text-center text-xs font-bold tracking-[0.2em] sm:text-sm">
              {' '}
              AUTO CHRONICLE{' '}
            </p>
            <button
              type="button"
              onClick={() => {
                setEditing(true);
                setSuccess('');
                setError('');
              }}
              className="rounded-xl border border-[#f5f3eb] bg-[#f5f3eb] px-4 py-2 text-sm font-semibold text-[#173c36] transition hover:bg-white"
            >
              {' '}
              Edit{' '}
            </button>{' '}
          </div>{' '}
        </section>
        {/* Profile identity */}{' '}
        <section className="relative -mt-12 px-4 sm:px-8">
          {' '}
          <div className="flex flex-col items-center text-center">
            {' '}
            <div className="relative">
              <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-[5px] border-[#f5f3eb] bg-[#f2a08a] text-3xl font-semibold text-[#173c36] shadow-sm sm:h-32 sm:w-32">
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={`${fullName}'s profile`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  getInitials(profile)
                )}
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarUpload}
                aria-label="Choose a profile picture"
              />
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
                aria-label="Change profile picture"
                className="absolute bottom-0 right-0 flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-[#17453d] text-white shadow-md disabled:opacity-60"
              >
                <Camera size={18} />
              </button>
            </div>
            {uploadingAvatar && (
              <p className="mt-2 text-sm text-[#74847e]">
                Uploading profile picture...
              </p>
            )}
            <h1 className="mt-4 break-words text-2xl font-semibold tracking-tight text-[#173c36] sm:text-3xl">
              {' '}
              {fullName || 'Your profile'}{' '}
            </h1>
            <p className="mt-2 text-sm text-[#74847e] sm:text-base">
              {' '}
              {getAccountType(profile.account_type)}{' '}
            </p>
            {profile.username && (
              <p className="mt-1 text-sm text-[#74847e]">
                {' '}
                @{profile.username}{' '}
              </p>
            )}{' '}
          </div>{' '}
        </section>
        {/* Status messages */}{' '}
        {(error || success) && (
          <div
            role={error ? 'alert' : 'status'}
            className={`mx-4 mt-6 rounded-xl border px-4 py-3 text-sm sm:mx-8 ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-800'}`}
          >
            {' '}
            {error || success}{' '}
          </div>
        )}
        {/* Profile statistics */}{' '}
        <section
          aria-label="Account statistics"
          className="mx-4 mt-8 grid grid-cols-3 divide-x divide-[#deded5] border-y border-[#deded5] py-5 sm:mx-8 sm:py-7"
        >
          {' '}
          <Link
            to="/vehicles"
            className="px-2 text-center transition hover:opacity-70"
          >
            {' '}
            <p className="text-2xl font-bold text-[#173c36] sm:text-3xl">
              {' '}
              {statistics === null ? '—' : statistics.activeVehicles}{' '}
            </p>{' '}
            <p className="mt-1 text-xs text-[#74847e] sm:text-sm">
              {' '}
              Vehicles{' '}
            </p>{' '}
          </Link>
          <Link
            to="/reports"
            className="px-2 text-center transition hover:opacity-70"
          >
            {' '}
            <p className="text-2xl font-bold text-[#173c36] sm:text-3xl">
              {' '}
              {statistics === null ? '—' : statistics.driverReports}{' '}
            </p>{' '}
            <p className="mt-1 text-xs text-[#74847e] sm:text-sm">
              {' '}
              Reports filed{' '}
            </p>{' '}
          </Link>
          <div
            className="px-2 text-center"
            title={
              statistics
                ? `${statistics.totalVehicles} total vehicles, including ${statistics.archivedVehicles} archived`
                : undefined
            }
          >
            <p className="text-2xl font-bold text-[#173c36] sm:text-3xl">
              {statistics === null ? '—' : statistics.resolvedIssues}
            </p>
            <p className="mt-1 text-xs text-[#74847e] sm:text-sm">
              Issues resolved
            </p>
          </div>{' '}
        </section>
        {statisticsError && (
          <p role="status" className="mx-4 mt-2 text-sm text-[#74847e] sm:mx-8">
            Profile statistics are unavailable: {statisticsError}
          </p>
        )}
        {/* Personal information */}{' '}
        <section className="mt-8 px-4 sm:px-8">
          {' '}
          <p className="text-xs font-bold tracking-[0.18em] text-[#36745e] sm:text-sm">
            {' '}
            PERSONAL DETAILS{' '}
          </p>
          <h2 className="mt-2 text-2xl font-medium tracking-tight text-[#173c36] sm:text-3xl">
            {' '}
            Your information{' '}
          </h2>
          <form
            onSubmit={handleSave}
            className="mt-6 rounded-2xl border border-[#deded5] bg-white p-4 shadow-sm sm:p-6"
          >
            {' '}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {' '}
              <div>
                {' '}
                <label
                  htmlFor="firstName"
                  className="mb-2 block text-sm font-medium text-[#74847e]"
                >
                  {' '}
                  First name{' '}
                </label>
                <input
                  id="firstName"
                  autoComplete="given-name"
                  maxLength={50}
                  value={form.firstName}
                  disabled={!editing || saving}
                  onChange={(event) =>
                    handleFieldChange('firstName', event.target.value)
                  }
                  className="w-full rounded-xl border border-[#deded5] bg-[#fbfaf6] px-4 py-3 text-[#173c36] outline-none transition focus:border-[#36745e] focus:ring-2 focus:ring-[#36745e]/15 disabled:cursor-default disabled:bg-[#f5f3eb]"
                />{' '}
              </div>
              <div>
                {' '}
                <label
                  htmlFor="lastName"
                  className="mb-2 block text-sm font-medium text-[#74847e]"
                >
                  {' '}
                  Last name{' '}
                </label>
                <input
                  id="lastName"
                  autoComplete="family-name"
                  maxLength={50}
                  value={form.lastName}
                  disabled={!editing || saving}
                  onChange={(event) =>
                    handleFieldChange('lastName', event.target.value)
                  }
                  className="w-full rounded-xl border border-[#deded5] bg-[#fbfaf6] px-4 py-3 text-[#173c36] outline-none transition focus:border-[#36745e] focus:ring-2 focus:ring-[#36745e]/15 disabled:cursor-default disabled:bg-[#f5f3eb]"
                />{' '}
              </div>
              <div>
                {' '}
                <label
                  htmlFor="username"
                  className="mb-2 block text-sm font-medium text-[#74847e]"
                >
                  {' '}
                  Username{' '}
                </label>
                <input
                  id="username"
                  autoComplete="username"
                  maxLength={20}
                  value={form.username}
                  disabled={!editing || saving}
                  onChange={(event) =>
                    handleFieldChange('username', event.target.value)
                  }
                  className="w-full rounded-xl border border-[#deded5] bg-[#fbfaf6] px-4 py-3 text-[#173c36] outline-none transition focus:border-[#36745e] focus:ring-2 focus:ring-[#36745e]/15 disabled:cursor-default disabled:bg-[#f5f3eb]"
                />{' '}
              </div>
              <div>
                {' '}
                <label
                  htmlFor="phone"
                  className="mb-2 block text-sm font-medium text-[#74847e]"
                >
                  {' '}
                  Phone number{' '}
                </label>
                <input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="+2348012345678"
                  value={form.phone}
                  disabled={!editing || saving}
                  onChange={(event) =>
                    handleFieldChange('phone', event.target.value)
                  }
                  className="w-full rounded-xl border border-[#deded5] bg-[#fbfaf6] px-4 py-3 text-[#173c36] outline-none transition focus:border-[#36745e] focus:ring-2 focus:ring-[#36745e]/15 disabled:cursor-default disabled:bg-[#f5f3eb]"
                />{' '}
              </div>
              <div className="sm:col-span-2">
                {' '}
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-medium text-[#74847e]"
                >
                  {' '}
                  Email address{' '}
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={profile.email}
                  disabled
                  className="w-full cursor-not-allowed rounded-xl border border-[#deded5] bg-[#f5f3eb] px-4 py-3 text-[#74847e]"
                />
                <p className="mt-2 text-xs leading-5 text-[#74847e]">
                  {' '}
                  Email changes require a separate verification process.{' '}
                </p>{' '}
              </div>{' '}
            </div>
            {editing && (
              <div className="mt-6 flex flex-col-reverse gap-3 border-t border-[#deded5] pt-5 sm:flex-row sm:justify-end">
                {' '}
                <button
                  type="button"
                  onClick={cancelEditing}
                  disabled={saving}
                  className="rounded-xl border border-[#deded5] px-5 py-3 font-medium text-[#173c36] transition hover:bg-[#f5f3eb] disabled:opacity-60"
                >
                  {' '}
                  Cancel{' '}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-[#17453d] px-5 py-3 font-semibold text-white transition hover:bg-[#10382f] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {' '}
                  {saving ? 'Saving changes...' : 'Save changes'}{' '}
                </button>{' '}
              </div>
            )}{' '}
          </form>{' '}
        </section>
        {/* Account settings */}
        <section className="mt-9 px-4 sm:px-8">
          <p className="text-xs font-bold tracking-[0.18em] text-[#36745e] sm:text-sm">
            ACCOUNT SETTINGS
          </p>

          <div className="mt-4 divide-y divide-[#deded5] border-y border-[#deded5]">
            <Link
              to="/forgot-password"
              className="flex items-center justify-between gap-4 py-5 transition hover:opacity-70"
            >
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-xl text-[#17453d]">
                  <LockKeyhole aria-hidden="true" className="h-5 w-5" />
                </div>

                <div>
                  <h3 className="font-semibold text-[#173c36]">
                    Security &amp; privacy
                  </h3>
                  <p className="mt-1 text-sm text-[#74847e]">
                    Password and sign-in protection
                  </p>
                </div>
              </div>

              <span aria-hidden="true" className="text-2xl text-[#173c36]">
                <ChevronRight aria-hidden="true" className="h-5 w-5" />
              </span>
            </Link>

            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center justify-between gap-4 py-5 text-left transition hover:opacity-70"
            >
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-xl text-[#17453d]">
                  <LogOut aria-hidden="true" className="h-5 w-5" />
                </div>

                <div>
                  <h3 className="font-semibold text-[#173c36]">Sign out</h3>

                  <p className="mt-1 text-sm text-[#74847e]">
                    Sign out of your Auto Chronicle account
                  </p>
                </div>
              </div>

              <span aria-hidden="true" className="text-2xl text-[#173c36]">
                <ChevronRight aria-hidden="true" className="h-5 w-5" />
              </span>
            </button>
          </div>
        </section>
        {/* Vehicle shortcuts */}
        <section className="mt-9 px-4 sm:px-8">
          <p className="text-xs font-bold tracking-[0.18em] text-[#36745e] sm:text-sm">
            YOUR AUTO CHRONICLE
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Link
              to="/vehicles"
              className="rounded-2xl border border-[#deded5] bg-white p-5 transition hover:border-[#36745e]"
            >
              <h3 className="font-semibold text-[#173c36]">My vehicles</h3>

              <p className="mt-2 text-sm text-[#74847e]">
                View and manage your vehicles.
              </p>
            </Link>

            <Link
              to="/reports"
              className="rounded-2xl border border-[#deded5] bg-white p-5 transition hover:border-[#36745e]"
            >
              <h3 className="font-semibold text-[#173c36]">Story entries</h3>

              <p className="mt-2 text-sm text-[#74847e]">
                View your vehicle reports.
              </p>
            </Link>
          </div>
        </section>
      </div>
    </AppPageLayout>
  );
}
