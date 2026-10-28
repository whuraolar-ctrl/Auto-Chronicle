
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest, storeAuthSession } from '../services/api';

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const session = await apiRequest<LoginResponse>(
        '/api/auth/login',
        undefined,
        {
          method: 'POST',
          body: JSON.stringify({ identifier, password }),
        },
      );

      storeAuthSession(session);
      navigate('/dashboard', { replace: true });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to sign in.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell bg-[#fbfaf6] text-[#18352f]">
      <section className="auth-card max-w-md text-[#18352f]">
        <Link to="/" className="text-sm text-[#36745e] hover:underline">
          <ArrowLeft aria-hidden="true" className="mr-1 inline h-4 w-4" />
          Auto Chronicle
        </Link>

        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">
            Welcome back
          </h1>
          <p className="mt-2 text-sm text-[#71807c]">
            Sign in with your email, username, or phone number.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-2 text-sm">
            <span>Email, username, or phone</span>
            <input
              autoComplete="username"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              required
              className="auth-input"
            />
          </label>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-sm">
              <label htmlFor="login-password">
                <span className="font-medium">Password</span>
              </label>

              <Link
                to="/forgot-password"
                className="auth-link text-xs sm:text-sm"
              >
                Forgot password?
              </Link>
            </div>

            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
                className="auth-input pr-11"
              />

              <button
                type="button"
                onClick={() => setShowPassword((previous) => !previous)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex items-center justify-center px-3 text-[#71807c] hover:text-[#18352f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36745e] rounded-r-md"
              >
                {showPassword ? (
                  <EyeOff aria-hidden="true" className="h-5 w-5" />
                ) : (
                  <Eye aria-hidden="true" className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="auth-btn-primary"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="text-sm text-[#71807c]">
          New to Auto Chronicle?{' '}
          <Link to="/create-account" className="auth-link">
            Create an account
          </Link>
        </p>
      </section>
    </main>
  );
}
