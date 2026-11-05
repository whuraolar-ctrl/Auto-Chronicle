import { useId, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';

/* Charts for the admin dashboard, drawn with plain SVG (no chart library). */

const W = 640;
const H = 240;
const PAD = { top: 16, right: 16, bottom: 28, left: 40 };

const roundedTop = (max: number) => Math.max(4, Math.ceil(max / 4) * 4);
const cssVar = (name: string, value: string | number) =>
  ({ [name]: value }) as CSSProperties;

/* ---------- Area chart ---------- */

export interface AreaPoint {
  label: string;
  value: number;
}

interface AreaChartProps {
  data: AreaPoint[];
  color?: string;
  /** Word used in the hover tooltip, for example "sign-ups". */
  unit?: string;
}

export function AreaChart({
  data,
  color = '#ffb703',
  unit = 'sign-ups',
}: AreaChartProps) {
  const gradientId = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);

  const max = Math.max(0, ...data.map((point) => point.value));
  const top = roundedTop(max);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;
  const x = (index: number) => PAD.left + index * stepX;
  const y = (value: number) => PAD.top + innerH - (value / top) * innerH;

  let line = '';
  data.forEach((point, index) => {
    const px = x(index);
    const py = y(point.value);
    if (index === 0) {
      line += `M${px.toFixed(1)},${py.toFixed(1)}`;
    } else {
      const prevX = x(index - 1);
      const prevY = y(data[index - 1].value);
      const mid = (prevX + px) / 2;
      line += ` C${mid.toFixed(1)},${prevY.toFixed(1)} ${mid.toFixed(1)},${py.toFixed(1)} ${px.toFixed(1)},${py.toFixed(1)}`;
    }
  });
  const baseline = PAD.top + innerH;
  const area = data.length
    ? `${line} L${x(data.length - 1).toFixed(1)},${baseline} L${x(0).toFixed(1)},${baseline} Z`
    : '';

  function handleMove(event: PointerEvent<SVGSVGElement>) {
    if (data.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * W;
    const index = stepX === 0 ? 0 : Math.round((px - PAD.left) / stepX);
    setHover(Math.min(data.length - 1, Math.max(0, index)));
  }

  const labelIndexes = [...new Set([0, Math.floor((data.length - 1) / 2), data.length - 1])].filter(
    (index) => index >= 0,
  );
  const active = hover !== null ? data[hover] : null;

  return (
    <div className="adm-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${unit} over time`}
        onPointerMove={handleMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 1, 2, 3, 4].map((step) => {
          const value = (top / 4) * step;
          return (
            <g key={step}>
              <line className="adm-grid" x1={PAD.left} x2={W - PAD.right} y1={y(value)} y2={y(value)} />
              <text className="adm-axis" x={PAD.left - 8} y={y(value) + 4} textAnchor="end">
                {value}
              </text>
            </g>
          );
        })}

        {area && <path d={area} fill={`url(#${gradientId})`} className="adm-area" />}
        {line && (
          <path d={line} pathLength={1} stroke={color} fill="none" className="adm-line" />
        )}

        {hover !== null && active && (
          <g>
            <line className="adm-cross" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={baseline} />
            <circle cx={x(hover)} cy={y(active.value)} r={5} fill={color} stroke="#050505" strokeWidth={2} />
          </g>
        )}

        {labelIndexes.map((index) => (
          <text
            key={index}
            className="adm-axis"
            x={x(index)}
            y={H - 8}
            textAnchor={index === 0 ? 'start' : index === data.length - 1 ? 'end' : 'middle'}
          >
            {data[index].label}
          </text>
        ))}
      </svg>

      {max === 0 && <div className="adm-chart-empty">No {unit} in this period yet</div>}

      {hover !== null && active && (
        <div
          className="adm-tooltip"
          style={{
            left: `${(x(hover) / W) * 100}%`,
            top: `${(y(active.value) / H) * 100}%`,
          }}
        >
          <strong>{active.value}</strong> {unit}
          <span>{active.label}</span>
        </div>
      )}
    </div>
  );
}

/* ---------- Stacked bars ---------- */

export interface BarSeries {
  key: string;
  label: string;
  color: string;
  values: number[];
}

interface StackedBarsProps {
  labels: string[];
  series: BarSeries[];
}

export function StackedBars({ labels, series }: StackedBarsProps) {
  const totals = labels.map((_, index) =>
    series.reduce((sum, item) => sum + (item.values[index] ?? 0), 0),
  );
  const max = Math.max(0, ...totals);
  const top = roundedTop(max);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = labels.length ? innerW / labels.length : innerW;
  const barW = Math.max(2, slot * 0.64);
  const y = (value: number) => PAD.top + innerH - (value / top) * innerH;
  const labelIndexes = [...new Set([0, Math.floor((labels.length - 1) / 2), labels.length - 1])].filter(
    (index) => index >= 0,
  );

  return (
    <div className="adm-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Platform activity per day">
        {[0, 1, 2, 3, 4].map((step) => {
          const value = (top / 4) * step;
          return (
            <g key={step}>
              <line className="adm-grid" x1={PAD.left} x2={W - PAD.right} y1={y(value)} y2={y(value)} />
              <text className="adm-axis" x={PAD.left - 8} y={y(value) + 4} textAnchor="end">
                {value}
              </text>
            </g>
          );
        })}

        {labels.map((label, index) => {
          const barX = PAD.left + index * slot + (slot - barW) / 2;
          let stacked = 0;
          return (
            <g key={label + index} className="adm-bar" style={cssVar('--i', index)}>
              <title>
                {label}: {series.map((item) => `${item.values[index] ?? 0} ${item.label.toLowerCase()}`).join(', ')}
              </title>
              {series.map((item) => {
                const value = item.values[index] ?? 0;
                const from = stacked;
                stacked += value;
                if (value === 0) return null;
                return (
                  <rect
                    key={item.key}
                    x={barX}
                    y={y(stacked)}
                    width={barW}
                    height={Math.max(1, y(from) - y(stacked))}
                    rx={Math.min(3, barW / 2)}
                    fill={item.color}
                  />
                );
              })}
            </g>
          );
        })}

        {labelIndexes.map((index) => (
          <text
            key={index}
            className="adm-axis"
            x={PAD.left + index * slot + slot / 2}
            y={H - 8}
            textAnchor={index === 0 ? 'start' : index === labels.length - 1 ? 'end' : 'middle'}
          >
            {labels[index]}
          </text>
        ))}
      </svg>

      {max === 0 && <div className="adm-chart-empty">No activity in this period yet</div>}

      <ul className="adm-legend">
        {series.map((item) => (
          <li key={item.key}>
            <i style={{ background: item.color }} />
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Donut ---------- */

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

const DONUT_R = 42;
const DONUT_C = 2 * Math.PI * DONUT_R;

export function Donut({ segments, centerLabel }: { segments: DonutSegment[]; centerLabel: string }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  let offset = 0;

  return (
    <div className="adm-donut">
      <svg viewBox="0 0 120 120" role="img" aria-label={centerLabel}>
        <circle cx="60" cy="60" r={DONUT_R} className="adm-donut-track" />
        {total > 0 &&
          segments.map((segment) => {
            const length = (segment.value / total) * DONUT_C;
            const gap = segments.length > 1 && length > 6 ? 3 : 0;
            const circle = (
              <circle
                key={segment.label}
                cx="60"
                cy="60"
                r={DONUT_R}
                fill="none"
                stroke={segment.color}
                strokeWidth={14}
                strokeLinecap="butt"
                strokeDasharray={`${Math.max(0, length - gap)} ${DONUT_C - Math.max(0, length - gap)}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 60 60)"
                className="adm-seg"
                style={cssVar('--c', DONUT_C)}
              />
            );
            offset += length;
            return circle;
          })}
        <text x="60" y="60" textAnchor="middle" className="adm-donut-value">
          {total.toLocaleString()}
        </text>
        <text x="60" y="76" textAnchor="middle" className="adm-donut-caption">
          {centerLabel}
        </text>
      </svg>

      <ul className="adm-legend adm-legend-column">
        {segments.map((segment) => (
          <li key={segment.label}>
            <i style={{ background: segment.color }} />
            {segment.label}
            <b>{segment.value.toLocaleString()}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Funnel ---------- */

export interface FunnelStep {
  label: string;
  count: number;
}

export function Funnel({ steps }: { steps: FunnelStep[] }) {
  const first = steps[0]?.count ?? 0;

  return (
    <ol className="adm-funnel">
      {steps.map((step, index) => {
        const percent = first > 0 ? Math.min(100, (step.count / first) * 100) : 0;
        return (
          <li key={step.label}>
            <div className="adm-funnel-head">
              <span>{step.label}</span>
              <span>
                <b>{step.count.toLocaleString()}</b>
                {index > 0 && <em>{Math.round(percent)}%</em>}
              </span>
            </div>
            <div className="adm-funnel-track">
              <div
                className="adm-funnel-bar"
                style={{ ...cssVar('--i', index), width: `${Math.max(percent, step.count > 0 ? 3 : 0)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- Progress ring ---------- */

const RING_R = 46;
const RING_C = 2 * Math.PI * RING_R;

interface ProgressRingProps {
  value: number;
  max: number;
  /** Text under the number, for example "registered clients". */
  caption: string;
  color?: string;
}

export function ProgressRing({ value, max, caption, color = '#ffb703' }: ProgressRingProps) {
  const progress = max > 0 ? Math.min(1, value / max) : 0;

  return (
    <div className="adm-ring">
      <svg viewBox="0 0 120 120" role="img" aria-label={`${value} of ${max} ${caption}`}>
        <circle cx="60" cy="60" r={RING_R} className="adm-ring-track" />
        <circle
          cx="60"
          cy="60"
          r={RING_R}
          fill="none"
          stroke={color}
          strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={RING_C}
          strokeDashoffset={RING_C * (1 - progress)}
          transform="rotate(-90 60 60)"
          className="adm-ring-progress"
          style={cssVar('--c', RING_C)}
        />
        <text x="60" y="58" textAnchor="middle" className="adm-ring-value">
          {value}
          <tspan className="adm-ring-max"> / {max}</tspan>
        </text>
        <text x="60" y="76" textAnchor="middle" className="adm-ring-caption">
          {Math.round(progress * 100)}%
        </text>
      </svg>
      <p>{caption}</p>
    </div>
  );
}
