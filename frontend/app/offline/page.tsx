export default function OfflinePage() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--lr-bg-page)",
      padding: "32px 24px",
      textAlign: "center",
      gap: "16px",
    }}>
      {/* Wifi-off icon */}
      <svg
        width="56"
        height="56"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--lr-text-muted)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="1" y1="1" x2="23" y2="23" />
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
        <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
        <circle cx="12" cy="20" r="1" fill="var(--lr-text-muted)" stroke="none" />
      </svg>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h1 style={{
          fontFamily: "'Sora', sans-serif",
          fontSize: "1.25rem",
          fontWeight: 700,
          color: "var(--lr-text-primary)",
          letterSpacing: "-0.02em",
        }}>
          You&apos;re offline
        </h1>
        <p style={{ fontSize: "0.875rem", color: "var(--lr-text-muted)", maxWidth: 280 }}>
          Check your connection and try again. Cached pages and receipts are still available.
        </p>
      </div>

      <a
        href="/"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "10px 22px",
          background: "var(--lr-primary)",
          color: "#fff",
          borderRadius: 99,
          fontSize: "0.875rem",
          fontWeight: 600,
          textDecoration: "none",
          marginTop: 4,
        }}
      >
        Try again
      </a>
    </div>
  );
}
