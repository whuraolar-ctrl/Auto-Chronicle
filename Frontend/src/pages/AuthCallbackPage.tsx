import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest, storeAuthSession } from '../services/api';

interface AuthProfileResponse {
  profileComplete: boolean;
}

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function finishSignIn() {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const authError = params.get('error_description') ?? params.get('error');

      if (authError) {
        if (active) setError(authError.replace(/\+/g, ' '));
        return;
      }

      if (!accessToken) {
        if (active) {
          setError(
            'Google sign-in did not return an access token. Please try again.',
          );
        }
        return;
      }

      storeAuthSession({
        accessToken,
        refreshToken: refreshToken ?? undefined,
      });
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${window.location.search}`,
      );

      try {
        const profile = await apiRequest<AuthProfileResponse>(
          '/api/auth/me',
          accessToken,
        );
        if (!active) return;

        navigate(profile.profileComplete ? '/dashboard' : '/complete-profile', {
          replace: true,
        });
      } catch (requestError) {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Unable to finish signing in.',
          );
        }
      }
    }

    void finishSignIn();
    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <main className="auth-shell bg-[#fbfaf6] text-[#18352f]">
      <section className="auth-card max-w-md space-y-4">
        <h1 className="text-xl font-semibold sm:text-2xl">Finishing sign-in</h1>
        {error ? (
          <>
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
            <Link
              to="/login"
              className="inline-block text-sm text-[#36745e] hover:underline"
            >
              Return to sign in
            </Link>
          </>
        ) : (
          <p className="text-sm text-[#71807c]">
            Verifying your Google account…
          </p>
        )}
      </section>
    </main>
  );
}
