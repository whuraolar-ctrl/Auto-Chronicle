import { ArrowLeft, Check } from 'lucide-react';
import { useRef, useState, type SubmitEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CurrencyCodes } from 'validator/lib/isISO4217';
import { apiRequest, getAccessToken, getApiUrl } from '../services/api';

type Currency = string;

interface RepairResponse {
  id: string;
}

interface RepairPart {
  partName: string;
  amount: string;
}

const currencies = [...CurrencyCodes]
  .sort((a, b) => (a === 'NGN' ? -1 : b === 'NGN' ? 1 : a.localeCompare(b)))
  .map((code) => ({
    value: code,
    label: `${code} · ${
      new Intl.NumberFormat('en', {
        style: 'currency',
        currency: code,
        currencyDisplay: 'narrowSymbol',
      })
        .formatToParts(0)
        .find((part) => part.type === 'currency')?.value ?? code
    }`,
  }));

export default function RepairsPage() {
  const navigate = useNavigate();
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const receiptInput = useRef<HTMLInputElement>(null);
  const submissionKey = useRef<{ signature: string; key: string } | null>(null);

  const [description, setDescription] = useState('');
  const [provider, setProvider] = useState('');
  const [currency, setCurrency] = useState<Currency>('NGN');
  const [amount, setAmount] = useState('');
  const [parts, setParts] = useState<RepairPart[]>([]);
  const [repairDate, setRepairDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [receipt, setReceipt] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    setError('');
    setSuccess('');

    if (!vehicleId) {
      setError('No vehicle was selected. Please open a vehicle first.');
      return;
    }

    const parsedAmount = Number(amount);

    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      setError('Enter a valid repair cost.');
      return;
    }

    if (!description.trim() || !repairDate) {
      setError('Please complete all required fields.');
      return;
    }

    const repairParts: { partName: string; amount: number }[] = [];
    for (const part of parts) {
      const partName = part.partName.trim();
      const partAmount = Number(part.amount);
      if (!partName && !part.amount) continue;
      if (
        !partName ||
        !part.amount ||
        !Number.isFinite(partAmount) ||
        partAmount < 0
      ) {
        setError(
          'Enter both a part name and a valid part cost, or remove the empty part.',
        );
        return;
      }
      repairParts.push({ partName, amount: partAmount });
    }

    if (
      repairParts.reduce((sum, part) => sum + part.amount, 0) > parsedAmount
    ) {
      setError('Part costs cannot exceed the total repair cost.');
      return;
    }

    if (receipt) {
      const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];

      if (!allowedTypes.includes(receipt.type)) {
        setError('Receipt must be a JPG, PNG or PDF file.');
        return;
      }

      if (receipt.size > 5 * 1024 * 1024) {
        setError('Receipt must be 5 MB or smaller.');
        return;
      }
    }

    setLoading(true);

    try {
      const accessToken = getAccessToken();
      if (!accessToken) {
        throw new Error('Your session has expired. Please log in again.');
      }

      const repairData = {
        workPerformed: description.trim(),
        providerName: provider.trim() || undefined,
        currency,
        amount: parsedAmount,
        repairDate,
        parts: repairParts.length ? repairParts : undefined,
      };
      const signature = JSON.stringify(repairData);
      if (submissionKey.current?.signature !== signature) {
        submissionKey.current = { signature, key: crypto.randomUUID() };
      }

      const repair = await apiRequest<RepairResponse>(
        `/api/vehicles/${encodeURIComponent(vehicleId)}/repairs`,
        accessToken,
        {
          method: 'POST',
          headers: {
            'Idempotency-Key': submissionKey.current.key,
          },
          body: JSON.stringify(repairData),
        },
      );

      const repairId = repair.id;

      if (receipt && repairId) {
        const formData = new FormData();

        formData.append('file', receipt);

        const uploadResponse = await fetch(
          getApiUrl(`/api/repairs/${encodeURIComponent(repairId)}/receipt`),
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            body: formData,
          },
        );

        if (!uploadResponse.ok) {
          throw new Error(
            'The repair was saved, but the receipt upload failed. Open the saved repair and try uploading the receipt again.',
          );
        }
      }

      setSuccess("Repair saved to your car's story.");
      submissionKey.current = null;

      setDescription('');
      setProvider('');
      setAmount('');
      setParts([]);
      setReceipt(null);

      if (receiptInput.current) {
        receiptInput.current.value = '';
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to save the repair. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.page} className="repairs-page">
      <div style={styles.container}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          style={styles.backButton}
          aria-label="Go back"
        >
          <ArrowLeft aria-hidden="true" className="h-5 w-5" />
        </button>

        <p style={styles.brand}>AUTO CHRONICLE</p>

        <h1 style={styles.title}>I fixed something</h1>

        <p style={styles.subtitle}>
          A quick record now can save a headache later.
        </p>

        <form onSubmit={handleSubmit}>
          <label style={styles.label} htmlFor="description">
            What was done?
          </label>

          <input
            id="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="e.g. Front brake pads replaced"
            maxLength={2000}
            required
            style={styles.input}
          />

          <label style={styles.label} htmlFor="provider">
            Who did it?
          </label>

          <input
            id="provider"
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
            placeholder="Garage, mechanic or me"
            maxLength={200}
            style={styles.input}
          />

          <div style={styles.fieldsRow}>
            <div style={styles.field}>
              <label style={styles.label} htmlFor="currency">
                Currency
              </label>

              <select
                id="currency"
                value={currency}
                onChange={(event) =>
                  setCurrency(event.target.value as Currency)
                }
                style={styles.input}
              >
                {currencies.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.field}>
              <label style={styles.label} htmlFor="amount">
                Cost
              </label>

              <input
                id="amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                required
                style={styles.input}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label} htmlFor="repairDate">
                Date
              </label>

              <input
                id="repairDate"
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={repairDate}
                onChange={(event) => setRepairDate(event.target.value)}
                required
                style={styles.input}
              />
            </div>
          </div>

          <section
            aria-labelledby="repair-parts-heading"
            style={styles.partsSection}
          >
            <div style={styles.partsHeader}>
              <div>
                <h2 id="repair-parts-heading" style={styles.partsTitle}>
                  Parts used
                </h2>
                <p style={styles.partsHint}>
                  Optional cost breakdown; part costs are included in the total.
                </p>
              </div>
              <button
                type="button"
                style={styles.addPartButton}
                onClick={() =>
                  setParts((current) => [
                    ...current,
                    { partName: '', amount: '' },
                  ])
                }
              >
                Add part
              </button>
            </div>
            {parts.map((part, index) => (
              <div key={index} style={styles.partRow}>
                <label style={styles.field}>
                  <span style={styles.partLabel}>Part name</span>
                  <input
                    value={part.partName}
                    onChange={(event) =>
                      setParts((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, partName: event.target.value }
                            : item,
                        ),
                      )
                    }
                    maxLength={100}
                    placeholder="e.g. Brake pads"
                    style={styles.input}
                  />
                </label>
                <label style={styles.field}>
                  <span style={styles.partLabel}>Cost ({currency})</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={part.amount}
                    onChange={(event) =>
                      setParts((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, amount: event.target.value }
                            : item,
                        ),
                      )
                    }
                    placeholder="0.00"
                    style={styles.input}
                  />
                </label>
                <button
                  type="button"
                  style={styles.removePartButton}
                  onClick={() =>
                    setParts((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                  aria-label={`Remove part ${index + 1}`}
                >
                  Remove
                </button>
              </div>
            ))}
          </section>

          <button
            type="button"
            style={styles.receiptButton}
            onClick={() => receiptInput.current?.click()}
          >
            <span style={styles.receiptIcon}>▣</span>

            <span style={styles.receiptText}>
              <strong>Add receipt photo</strong>
              <small>Optional · JPG, PNG or PDF</small>
              {receipt && <small>Selected: {receipt.name}</small>}
            </span>

            <span style={styles.plus}>+</span>
          </button>

          <input
            ref={receiptInput}
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            hidden
            onChange={(event) => setReceipt(event.target.files?.[0] ?? null)}
          />

          <div style={styles.infoBox}>
            <span style={styles.receiptIcon}>▤</span>

            <div>
              <strong>Receipts stay with your car.</strong>
              <p>Easy to find when you sell or claim.</p>
            </div>
          </div>

          {error && (
            <p role="alert" style={styles.error}>
              {error}
            </p>
          )}

          {success && (
            <p role="status" style={styles.success}>
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.submitButton,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? (
              'Saving...'
            ) : (
              <>
                Save to car&apos;s story
                <Check aria-hidden="true" className="ml-2 inline h-4 w-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#fbfaf6',
    color: '#18352f',
    padding: '28px 18px',
    boxSizing: 'border-box',
    fontFamily: 'Arial, sans-serif',
  },

  container: {
    maxWidth: '760px',
    margin: '0 auto',
    paddingBottom: '35px',
  },

  backButton: {
    width: '58px',
    height: '58px',
    borderRadius: '18px',
    background: '#ffffff',
    border: '1px solid #deded8',
    color: '#18352f',
    fontSize: '30px',
    cursor: 'pointer',
  },

  brand: {
    color: '#36745e',
    fontWeight: 700,
    letterSpacing: '3px',
    marginTop: '22px',
  },

  title: {
    fontSize: 'clamp(34px, 7vw, 54px)',
    fontWeight: 500,
    margin: '12px 0',
  },

  subtitle: {
    color: '#71807c',
    fontSize: '18px',
    lineHeight: 1.5,
    marginBottom: '38px',
  },

  label: {
    display: 'block',
    fontWeight: 700,
    fontSize: '17px',
    margin: '24px 0 12px',
  },

  input: {
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
    padding: '18px 16px',
    background: '#ffffff',
    border: '1px solid #d8d9d2',
    borderRadius: '14px',
    color: '#18352f',
    fontSize: '16px',
  },

  fieldsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '12px',
    marginTop: '10px',
  },

  partsSection: {
    marginTop: '28px',
  },

  partsHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
  },

  partsTitle: {
    fontSize: '17px',
    fontWeight: 700,
  },

  partsHint: {
    color: '#71807c',
    fontSize: '13px',
    marginTop: '4px',
  },

  addPartButton: {
    border: '1px solid #36745e',
    borderRadius: '10px',
    background: '#ffffff',
    color: '#18352f',
    padding: '9px 12px',
    cursor: 'pointer',
    flexShrink: 0,
  },

  partRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) auto',
    alignItems: 'end',
    gap: '10px',
    marginTop: '12px',
  },

  partLabel: {
    display: 'block',
    fontWeight: 600,
    fontSize: '13px',
    marginBottom: '8px',
  },

  removePartButton: {
    border: 0,
    background: 'transparent',
    color: '#9b3e31',
    padding: '12px 4px',
    cursor: 'pointer',
  },

  field: {
    minWidth: 0,
  },

  receiptButton: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    textAlign: 'left',
    marginTop: '30px',
    padding: '20px',
    border: '2px dashed #b8c3bf',
    borderRadius: '16px',
    background: 'transparent',
    cursor: 'pointer',
    boxSizing: 'border-box',
    color: '#18352f',
  },

  receiptIcon: {
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    width: '52px',
    height: '52px',
    borderRadius: '14px',
    background: '#d6e8eb',
    fontSize: '25px',
  },

  receiptText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '7px',
    flex: 1,
    overflowWrap: 'anywhere',
  },

  plus: {
    fontSize: '30px',
  },

  infoBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    marginTop: '24px',
    padding: '20px',
    borderRadius: '16px',
    background: '#eaf3ed',
  },

  error: {
    color: '#a52626',
    background: '#fff0ed',
    padding: '12px',
    borderRadius: '10px',
  },

  success: {
    color: '#176747',
    background: '#e7f7ec',
    padding: '12px',
    borderRadius: '10px',
  },

  submitButton: {
    width: '100%',
    marginTop: '45px',
    padding: '22px 16px',
    border: 'none',
    borderRadius: '16px',
    background: '#153f36',
    color: '#ffffff',
    fontSize: '18px',
    fontWeight: 700,
    cursor: 'pointer',
  },
};
