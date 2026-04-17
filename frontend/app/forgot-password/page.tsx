"use client";

import { useState, useRef, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Home, ArrowRight, ArrowLeft, Loader2, CheckCircle, Eye, EyeOff } from "lucide-react";
import api from "@/lib/api";

type Step = "request" | "verify" | "reset" | "done";

export default function ForgotPasswordPage() {
  const router = useRouter();

  const [step, setStep]               = useState<Step>("request");
  const [identifier, setIdentifier]   = useState("");
  const [foundName, setFoundName]     = useState("");
  const [otp, setOtp]                 = useState(["", "", "", "", "", ""]);
  const [resetToken, setResetToken]   = useState("");
  const [password, setPassword]       = useState("");
  const [confirm, setConfirm]         = useState("");
  const [showPass, setShowPass]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // ── Step 1: request OTP ─────────────────────────────────────────────────

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!identifier.trim()) { setError("Enter your phone number or email."); return; }
    setLoading(true);
    try {
      const res = await api.post("/api/auth/forgot-password/", { identifier: identifier.trim() });
      setFoundName(res.data.full_name || "");
      setStep("verify");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: verify OTP ──────────────────────────────────────────────────

  function handleOtpChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const next = [...otp];
    next[index] = value.slice(-1);
    setOtp(next);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
  }

  function handleOtpKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const next = [...otp];
    text.split("").forEach((ch, i) => { next[i] = ch; });
    setOtp(next);
    otpRefs.current[Math.min(text.length, 5)]?.focus();
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const code = otp.join("");
    if (code.length < 6) { setError("Enter the full 6-digit code."); return; }
    setLoading(true);
    try {
      const res = await api.post("/api/auth/verify-reset-otp/", { identifier, otp: code });
      setResetToken(res.data.reset_token);
      if (res.data.full_name) setFoundName(res.data.full_name);
      setStep("reset");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Invalid or expired code.");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 3: set new password ─────────────────────────────────────────────

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8)       { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm)       { setError("Passwords do not match."); return; }
    if (/^\d+$/.test(password))    { setError("Password cannot be all numbers."); return; }
    setLoading(true);
    try {
      await api.post("/api/auth/reset-password/", { reset_token: resetToken, new_password: password });
      setStep("done");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to reset password. Please start over.");
    } finally {
      setLoading(false);
    }
  }

  // ── Shared layout ────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--lr-bg-page)", padding: "32px 24px" }}>
      <div style={{ width: "100%", maxWidth: 420 }} className="animate-fade-in">

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 40 }}>
          <div style={{ width: 32, height: 32, background: "var(--lr-primary)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Home size={16} color="#fff" />
          </div>
          <span style={{ fontFamily: "'Sora', sans-serif", fontSize: "1rem", fontWeight: 600, color: "var(--lr-primary)" }}>LumidahRentals</span>
        </div>

        {/* ── STEP 1: enter identifier ── */}
        {step === "request" && (
          <>
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontFamily: "'Sora', sans-serif", fontSize: "1.75rem", fontWeight: 700, color: "var(--lr-text-primary)", letterSpacing: "-0.03em", marginBottom: 6 }}>
                Forgot password?
              </h2>
              <p style={{ fontSize: "0.9rem", color: "var(--lr-text-muted)", lineHeight: 1.6 }}>
                Enter the phone number or email address linked to your account. We&apos;ll send you a verification code.
              </p>
            </div>

            <form onSubmit={handleRequest} style={{ display: "flex", flexDirection: "column", gap: 20 }} noValidate>
              {error && <ErrorBox message={error} />}

              <div style={{ display: "flex", flexDirection: "column" }}>
                <label className="label" htmlFor="identifier">Phone number or email</label>
                <input
                  id="identifier"
                  type="text"
                  placeholder="0712 345 678 or email@example.com"
                  autoComplete="username"
                  className={`input ${error ? "input-error" : ""}`}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  autoFocus
                />
              </div>

              <button type="submit" className="btn-primary" disabled={loading} style={{ width: "100%", padding: "12px" }}>
                {loading ? <><Loader2 size={16} style={{ animation: "spin 0.8s linear infinite" }} /> Sending code...</> : <>Send code <ArrowRight size={16} /></>}
              </button>
            </form>

            <div style={{ textAlign: "center", marginTop: 24 }}>
              <button onClick={() => router.push("/login")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.875rem", color: "var(--lr-text-muted)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                <ArrowLeft size={14} /> Back to login
              </button>
            </div>
          </>
        )}

        {/* ── STEP 2: enter OTP ── */}
        {step === "verify" && (
          <>
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontFamily: "'Sora', sans-serif", fontSize: "1.75rem", fontWeight: 700, color: "var(--lr-text-primary)", letterSpacing: "-0.03em", marginBottom: 6 }}>
                Enter verification code
              </h2>
              {foundName && (
                <div style={{ background: "var(--lr-primary-light)", border: "1px solid rgba(15,110,86,0.15)", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: "0.875rem", color: "var(--lr-text-primary)" }}>
                  Account found: <strong>{foundName}</strong>
                </div>
              )}
              <p style={{ fontSize: "0.9rem", color: "var(--lr-text-muted)", lineHeight: 1.6 }}>
                A 6-digit code was sent to <strong>{identifier}</strong>. It expires in 10 minutes.
              </p>
            </div>

            <form onSubmit={handleVerify} style={{ display: "flex", flexDirection: "column", gap: 24 }} noValidate>
              {error && <ErrorBox message={error} />}

              {/* OTP boxes */}
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }} onPaste={handleOtpPaste}>
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { otpRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    style={{
                      width: 48, height: 56,
                      textAlign: "center",
                      fontSize: "1.5rem",
                      fontWeight: 700,
                      fontFamily: "'Sora', sans-serif",
                      border: `2px solid ${digit ? "var(--lr-primary)" : "var(--lr-border)"}`,
                      borderRadius: 10,
                      background: digit ? "var(--lr-primary-light)" : "#fff",
                      color: "var(--lr-text-primary)",
                      outline: "none",
                      transition: "all 0.15s",
                    }}
                  />
                ))}
              </div>

              <button type="submit" className="btn-primary" disabled={loading} style={{ width: "100%", padding: "12px" }}>
                {loading ? <><Loader2 size={16} style={{ animation: "spin 0.8s linear infinite" }} /> Verifying...</> : <>Verify code <ArrowRight size={16} /></>}
              </button>
            </form>

            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button
                onClick={() => { setStep("request"); setOtp(["", "", "", "", "", ""]); setError(""); }}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.875rem", color: "var(--lr-text-muted)", display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                <ArrowLeft size={14} /> Try a different number
              </button>
            </div>
          </>
        )}

        {/* ── STEP 3: new password ── */}
        {step === "reset" && (
          <>
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontFamily: "'Sora', sans-serif", fontSize: "1.75rem", fontWeight: 700, color: "var(--lr-text-primary)", letterSpacing: "-0.03em", marginBottom: 6 }}>
                Set new password
              </h2>
              {foundName && (
                <div style={{ background: "var(--lr-primary-light)", border: "1px solid rgba(15,110,86,0.15)", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: "0.875rem", color: "var(--lr-text-primary)" }}>
                  Username: <strong>{foundName}</strong>
                </div>
              )}
              <p style={{ fontSize: "0.9rem", color: "var(--lr-text-muted)" }}>
                Choose a strong password. You have 15 minutes to complete this step.
              </p>
            </div>

            <form onSubmit={handleReset} style={{ display: "flex", flexDirection: "column", gap: 20 }} noValidate>
              {error && <ErrorBox message={error} />}

              <div style={{ display: "flex", flexDirection: "column" }}>
                <label className="label" htmlFor="new-password">New password</label>
                <div style={{ position: "relative" }}>
                  <input
                    id="new-password"
                    type={showPass ? "text" : "password"}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    className="input"
                    style={{ paddingRight: 44 }}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)} style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 44, background: "none", border: "none", cursor: "pointer", color: "var(--lr-text-muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <PasswordStrength password={password} />
              </div>

              <div style={{ display: "flex", flexDirection: "column" }}>
                <label className="label" htmlFor="confirm-password">Confirm password</label>
                <div style={{ position: "relative" }}>
                  <input
                    id="confirm-password"
                    type={showConfirm ? "text" : "password"}
                    placeholder="Repeat your password"
                    autoComplete="new-password"
                    className={`input ${confirm && confirm !== password ? "input-error" : ""}`}
                    style={{ paddingRight: 44 }}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                  <button type="button" onClick={() => setShowConfirm(v => !v)} style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 44, background: "none", border: "none", cursor: "pointer", color: "var(--lr-text-muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {confirm && confirm !== password && (
                  <span className="error-text">Passwords do not match</span>
                )}
              </div>

              <button type="submit" className="btn-primary" disabled={loading} style={{ width: "100%", padding: "12px" }}>
                {loading ? <><Loader2 size={16} style={{ animation: "spin 0.8s linear infinite" }} /> Resetting...</> : <>Reset password <ArrowRight size={16} /></>}
              </button>
            </form>
          </>
        )}

        {/* ── DONE ── */}
        {step === "done" && (
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--lr-primary-light)", border: "2px solid var(--lr-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CheckCircle size={32} color="var(--lr-primary)" />
            </div>
            <div>
              <h2 style={{ fontFamily: "'Sora', sans-serif", fontSize: "1.5rem", fontWeight: 700, color: "var(--lr-text-primary)", marginBottom: 8 }}>
                Password reset!
              </h2>
              <p style={{ fontSize: "0.9rem", color: "var(--lr-text-muted)" }}>
                Your password has been updated. You can now sign in.
              </p>
              {foundName && (
                <p style={{ fontSize: "0.875rem", color: "var(--lr-text-muted)", marginTop: 6 }}>
                  Username: <strong style={{ color: "var(--lr-text-primary)" }}>{foundName}</strong>
                </p>
              )}
            </div>
            <button
              onClick={() => router.push("/login")}
              className="btn-primary"
              style={{ padding: "11px 32px", marginTop: 8 }}
            >
              Go to login <ArrowRight size={16} />
            </button>
          </div>
        )}

        <p style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--lr-text-muted)", marginTop: 40 }}>
          Secured by 256-bit encryption · Kenya
        </p>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ── Small reusable components ────────────────────────────────────────────────

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="animate-slide-up" style={{ background: "#FCEBEB", border: "1px solid rgba(162,45,45,0.2)", borderRadius: 8, padding: "12px 14px", fontSize: "0.875rem", color: "#791F1F" }}>
      {message}
    </div>
  );
}

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const score = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;

  const levels = ["Weak", "Fair", "Good", "Strong"];
  const colors = ["#C0392B", "#E67E22", "#2980B9", "var(--lr-primary)"];

  return (
    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", gap: 4 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 99, background: i < score ? colors[score - 1] : "var(--lr-border)", transition: "background 0.2s" }} />
        ))}
      </div>
      <span style={{ fontSize: "0.75rem", color: colors[score - 1] || "var(--lr-text-muted)" }}>
        {score > 0 ? levels[score - 1] : ""}
      </span>
    </div>
  );
}
