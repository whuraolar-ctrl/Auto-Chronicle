import { Link } from 'react-router-dom';

type Props = {
  message?: string;
  compact?: boolean;
};

export default function UpgradePrompt({
  message = 'Upgrade your plan to unlock this feature.',
  compact = false,
}: Props) {
  if (compact) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '10px 14px',
          borderRadius: 10,
          background: 'rgba(255, 183, 3, 0.1)',
          border: '1px solid rgba(255, 183, 3, 0.35)',
          color: '#e8ecea',
          fontSize: 13,
        }}
      >
        <span>{message}</span>
        <Link
          to="/pricing"
          style={{
            color: '#1a1400',
            background: '#ffb703',
            padding: '6px 12px',
            borderRadius: 8,
            fontWeight: 600,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Upgrade
        </Link>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: 420,
        margin: '24px auto',
        padding: 24,
        borderRadius: 14,
        background: '#0c0e0d',
        border: '1px solid #1e2421',
        textAlign: 'center',
        color: '#e8ecea',
      }}
    >
      <h3 style={{ margin: '0 0 8px', color: '#f5f7f6' }}>Upgrade required</h3>
      <p style={{ margin: '0 0 16px', color: '#8a948f', fontSize: 14 }}>
        {message}
      </p>
      <Link
        to="/pricing"
        style={{
          display: 'inline-block',
          background: '#ffb703',
          color: '#1a1400',
          padding: '10px 18px',
          borderRadius: 10,
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        View plans
      </Link>
    </div>
  );
}
