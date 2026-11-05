import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, getAccessToken } from '../services/api';

type PaymentOutcome = {
  status: 'succeeded' | 'pending' | 'failed' | 'refunded';
  subscription: unknown | null;
};

export default function BillingCompletePage() {
  const [params] = useSearchParams();
  const reference = params.get('reference');
  const [status, setStatus] = useState<PaymentOutcome['status'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loginRequired, setLoginRequired] = useState(false);

  useEffect(() => {
    let active = true;

    async function verify() {
      if (!reference) {
        setError('Payment reference is missing.');
        setLoading(false);
        return;
      }

      if (!getAccessToken()) {
        setLoginRequired(true);
        setLoading(false);
        return;
      }

      try {
        const result = await api.get<PaymentOutcome>('/billing/verify', {
          params: { reference },
        });
        if (active) setStatus(result.data.status);
      } catch (err: unknown) {
        if (active) {
          const code = (err as { response?: { status?: number } }).response?.status;
          if (code === 401) setLoginRequired(true);
          else setError('Payment verification failed. Please try again.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void verify();
    return () => { active = false; };
  }, [reference]);

  const title = loading ? 'Verifying payment...' :
    loginRequired ? 'Please sign in to continue' :
    error ? 'Verification needs attention' :
    status === 'succeeded' ? 'Payment successful!' :
    status === 'pending' ? 'Payment is processing' :
    status === 'refunded' ? 'Payment refunded' :
    'Payment unsuccessful';

  const message = loading ? 'Please wait while we confirm your payment.' :
    loginRequired ? 'Sign in to verify your transaction.' :
    error || (status === 'succeeded'
      ? 'Your payment has been confirmed and your subscription updated.'
      : status === 'pending'
        ? 'Your payment has not been confirmed yet. Please check again shortly.'
        : status === 'refunded'
          ? 'This payment has been refunded.'
          : 'We could not confirm a successful payment. You can try again from pricing.');

  return (
    <main className="auth-shell bg-[#fbfaf6] text-[#18352f]">
      <section className="auth-card max-w-xl text-center">
        <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
        <p className="mt-3 text-sm text-[#71807c]" role="status">{message}</p>
        {reference && <p className="mt-4 break-all text-xs">Reference: {reference}</p>}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {loginRequired ? (
            <Link to="/login" className="rounded-lg bg-[#18352f] px-5 py-3 text-white">Sign in</Link>
          ) : status === 'succeeded' ? (
            <Link to="/dashboard" className="rounded-lg bg-[#18352f] px-5 py-3 text-white">Go to dashboard</Link>
          ) : (
            <Link to="/pricing" className="rounded-lg bg-[#18352f] px-5 py-3 text-white">Return to pricing</Link>
          )}
        </div>
      </section>
    </main>
  );
}
