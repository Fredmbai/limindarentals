"use client";

import { useState, useEffect } from "react";
import { Smartphone, X, Share2 } from "lucide-react";

// ── Module-level event storage ────────────────────────────────────────────────
// The `beforeinstallprompt` event fires ONCE per session. If we store it only
// in component state it is lost whenever the component unmounts (e.g. navigation).
// Storing it here means it survives across page transitions.
let _deferredPrompt: any = null;
let _resolvedIsIOS        = false;
let _resolvedShouldShow   = false;

if (typeof window !== "undefined") {
  const ua         = navigator.userAgent;
  const isIOS      = /iPhone|iPad|iPod/.test(ua) && !(window as any).MSStream;
  const standalone = window.matchMedia("(display-mode: standalone)").matches
                     || (navigator as any).standalone === true;
  const dismissed  = !!localStorage.getItem("lr_install_dismissed");

  if (!standalone && !dismissed) {
    if (isIOS) {
      _resolvedIsIOS      = true;
      _resolvedShouldShow = true;
    }

    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      _deferredPrompt     = e;
      _resolvedShouldShow = true;
    }, { once: true });
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export function InstallBanner() {
  const [visible,      setVisible]      = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    // Sync from module-level state on mount (handles the case where the event
    // fired before this component was first mounted, e.g. after navigation).
    if (_resolvedShouldShow) setVisible(true);

    // If the prompt hasn't fired yet, wait for it.
    const onPrompt = () => setVisible(true);
    window.addEventListener("nr-install-ready", onPrompt);
    return () => window.removeEventListener("nr-install-ready", onPrompt);
  }, []);

  // Also watch the module-level flag via a short poll on first mount.
  // This handles the case where the event fires after component mount.
  useEffect(() => {
    if (visible) return;
    const id = setInterval(() => {
      if (_resolvedShouldShow) { setVisible(true); clearInterval(id); }
    }, 500);
    return () => clearInterval(id);
  }, [visible]);

  const dismiss = () => {
    localStorage.setItem("lr_install_dismissed", "1");
    setVisible(false);
  };

  const install = async () => {
    if (_resolvedIsIOS) { setShowIOSGuide(true); return; }
    if (!_deferredPrompt) return;
    _deferredPrompt.prompt();
    const { outcome } = await _deferredPrompt.userChoice;
    if (outcome === "accepted") setVisible(false);
    _deferredPrompt = null;
  };

  if (!visible) return null;

  return (
    <>
      {/* ── Fixed bottom install bar (mobile only) ────────────────────── */}
      <div
        className="install-bar"
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200,
          background: "var(--lr-primary)",
          padding: "12px 16px",
          display: "flex", alignItems: "center", gap: 12,
          boxShadow: "0 -4px 24px rgba(0,0,0,0.18)",
        }}
      >
        <div style={{
          width: 40, height: 40, flexShrink: 0,
          background: "rgba(255,255,255,0.15)", borderRadius: 10,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Smartphone size={20} color="#fff" />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: "0.875rem", fontWeight: 700, color: "#fff", lineHeight: 1.3 }}>
            Use LumindaRentals as a mobile app
          </p>
          <p style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.72)", marginTop: 1 }}>
            Faster · works offline · no App Store needed
          </p>
        </div>

        <button
          onClick={install}
          style={{
            flexShrink: 0,
            background: "#fff", color: "var(--lr-primary)",
            border: "none", borderRadius: 8,
            padding: "9px 14px",
            fontSize: "0.8rem", fontWeight: 700,
            cursor: "pointer", whiteSpace: "nowrap",
          }}
        >
          {_resolvedIsIOS ? "How to install" : "Add to Home Screen"}
        </button>

        <button
          onClick={dismiss}
          aria-label="Dismiss"
          style={{ background: "none", border: "none", cursor: "pointer", flexShrink: 0, padding: 4 }}
        >
          <X size={18} color="rgba(255,255,255,0.65)" />
        </button>
      </div>

      {/* ── iOS step-by-step guide (bottom sheet) ───────────────────────── */}
      {showIOSGuide && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "flex-end" }}>
          <div
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }}
            onClick={() => setShowIOSGuide(false)}
          />
          <div style={{
            position: "relative", zIndex: 301,
            background: "#fff", borderRadius: "20px 20px 0 0",
            padding: "24px 20px 44px", width: "100%",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
              <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: "1rem", color: "var(--lr-text-primary)" }}>
                Add to Home Screen
              </h3>
              <button onClick={() => setShowIOSGuide(false)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X size={18} color="var(--lr-text-muted)" />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {[
                {
                  n: "1",
                  text: (
                    <>Tap the <strong>Share</strong> button{" "}
                      <Share2 size={13} color="var(--lr-primary)" style={{ display: "inline", verticalAlign: "middle" }} />
                      {" "}at the bottom of Safari.</>
                  ),
                },
                {
                  n: "2",
                  text: <>Scroll down and tap <strong style={{ color: "var(--lr-primary)" }}>&ldquo;Add to Home Screen&rdquo;</strong>.</>,
                },
                {
                  n: "3",
                  text: <>Tap <strong style={{ color: "var(--lr-primary)" }}>&ldquo;Add&rdquo;</strong> — LumindaRentals appears on your home screen like a native app.</>,
                },
              ].map((step) => (
                <div key={step.n} style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                  <div style={{
                    width: 28, height: 28, flexShrink: 0,
                    background: "var(--lr-primary-light)", borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "0.8rem", fontWeight: 700, color: "var(--lr-primary)",
                  }}>
                    {step.n}
                  </div>
                  <p style={{ fontSize: "0.875rem", color: "var(--lr-text-secondary)", lineHeight: 1.65, paddingTop: 4 }}>
                    {step.text}
                  </p>
                </div>
              ))}
            </div>

            <button
              onClick={() => { setShowIOSGuide(false); dismiss(); }}
              style={{
                marginTop: 28, width: "100%",
                background: "var(--lr-primary)", color: "#fff",
                border: "none", borderRadius: 10,
                padding: "13px", fontSize: "0.9rem", fontWeight: 600, cursor: "pointer",
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      <style>{`
        @media (min-width: 1024px) { .install-bar { display: none !important; } }
      `}</style>
    </>
  );
}
