import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest, storeAuthSession } from '../services/api';

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

const GoogleIcon = () => (
  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48" focusable="false">
    <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.8 6.1-15Z" />
    <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5.1c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.8v5.2A20 20 0 0 0 24 44Z" />
    <path fill="#FBBC05" d="M12.6 27.6a12 12 0 0 1 0-7.2v-5.2H5.8a20 20 0 0 0 0 17.6l6.8-5.2Z" />
    <path fill="#EA4335" d="M24 12c3 0 5.7 1 7.8 3.1l5.8-5.8A19.5 19.5 0 0 0 24 4 20 20 0 0 0 5.8 15.2l6.8 5.2C14.2 15.6 18.7 12 24 12Z" />
  </svg>
);

export default function LoginPage() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

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

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    setError('');

    try {
      const result = await apiRequest<{ url: string }>('/api/auth/google');
      window.location.assign(result.url);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to start Google sign-in.',
      );
      setGoogleLoading(false);
    }
  }

  return (
    <main className="auth-shell bg-[#fbfaf6] text-[#18352f]">
      <section className="auth-card max-w-md text-[#18352f]">
        <Link to="/" className="text-sm text-[#36745e] hover:underline">
          <ArrowLeft aria-hidden="true" className="mr-1 inline h-4 w-4" />
          Auto Chronicle
        </Link>
        <div className="mt-6 mb-6">
          <h1 className="text-2xl font-semibold sm:text-3xl">Welcome back</h1>
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
            
            {/* Added relative layout wrapper so the toggle button pins correctly inside the input line */}
            <div className="relative flex items-center">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
                className="auth-input w-full pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 text-[#71807c] hover:text-[#18352f] transition-colors focus:outline-none"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          
          <button type="submit" disabled={loading} className="auth-btn-primary">
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div className="flex items-center gap-4 py-4">
          <div className="h-px flex-1 bg-[#d8d9d2]" />
          <span className="text-xs font-medium uppercase tracking-wider text-[#8b9691]"> OR </span>
          <div className="h-px flex-1 bg-[#d8d9d2]" />
        </div>

        <button
          onClick={handleGoogleSignIn}
          disabled={googleLoading}
          className="w-full flex items-center justify-center gap-2 border border-[#d8d9d2] rounded-md py-2 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          {googleLoading ? (
            'Connecting...'
          ) : (
            <>
              <GoogleIcon />
              <span>Continue with Google</span>
            </>
          )}
        </button>

        <p className="mt-6 text-sm text-[#71807c] text-center">
          New to Auto Chronicle?{' '}
          <Link to="/create-account" className="auth-link font-medium text-[#36745e] hover:underline">
            Create an account
          </Link>
        </p>
      </section>
    </main>
  );
}
