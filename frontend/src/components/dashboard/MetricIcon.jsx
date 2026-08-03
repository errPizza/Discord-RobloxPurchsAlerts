const ICONS = {
  revenue: <>
    <path d="M12 2v20" />
    <path d="M17.2 6.1c-1.2-1-2.9-1.6-5.2-1.6-3.1 0-5 1.5-5 3.7 0 5.6 10 2.1 10 7.6 0 2.2-1.9 3.7-5 3.7-2.3 0-4.2-.7-5.5-1.9" />
  </>,
  spent: <>
    <path d="m12 2.5 8.5 4.9v9.2L12 21.5l-8.5-4.9V7.4z" />
    <path d="m12 6.5 5 2.9v5.2l-5 2.9-5-2.9V9.4z" />
    <path d="M10.2 10.2h3.6v3.6h-3.6z" />
  </>,
  single: <>
    <path d="M5 8.5h14l-1 12H6z" />
    <path d="M8.5 9V7a3.5 3.5 0 0 1 7 0v2" />
    <path d="M8.5 12v.5M15.5 12v.5" />
  </>,
  bulk: <>
    <path d="M3.5 7.5h11l-.7 13h-9.6z" />
    <path d="M6 8V6.5a3 3 0 0 1 6 0V8" />
    <path d="M12.5 11.5h8l-.6 9h-6.8z" />
    <path d="M14.5 12v-1a2 2 0 0 1 4 0v1" />
  </>,
  donations: <>
    <path d="M12 9.1 9.9 7a2.8 2.8 0 0 0-4 4L12 17l6.1-6a2.8 2.8 0 0 0-4-4z" />
    <path d="M2.5 15.5h3l3.2 2.3h5.2l5-3.1a1.7 1.7 0 0 1 2.3.5 1.7 1.7 0 0 1-.5 2.3l-5.6 3.6H8.6l-3.1-1.7h-3" />
  </>,
  devProductNormal: <>
    <path d="m12 2.5 8 4.6v9.8l-8 4.6-8-4.6V7.1z" />
    <path d="m4.4 7.3 7.6 4.4 7.6-4.4M12 11.7v9.4" />
  </>,
  devProductGift: <>
    <path d="M3 9h18v12H3zM2 5h20v4H2zM12 5v16" />
    <path d="M12 5H8.5A2.5 2.5 0 1 1 11 2.5c.6 1 .8 1.8 1 2.5ZM12 5h3.5A2.5 2.5 0 1 0 13 2.5c-.6 1-.8 1.8-1 2.5Z" />
  </>,
  gamepassNormal: <>
    <path d="M4 5.5h16v5a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4z" />
    <path d="M9 8.5h6M9 12h6M9 15.5h4" />
  </>,
  gamepassGift: <>
    <path d="M3.5 7.5h17v13h-17zM2.5 4h19v3.5h-19zM12 4v16.5" />
    <path d="M12 4H8.8a2 2 0 1 1 2-2c.5.7.8 1.3 1.2 2ZM12 4h3.2a2 2 0 1 0-2-2c-.5.7-.8 1.3-1.2 2Z" />
  </>,
};

export default function MetricIcon({ type, size = 28, className = "" }) {
  return <svg className={`metric-icon ${className}`.trim()} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {ICONS[type] || ICONS.revenue}
  </svg>;
}
