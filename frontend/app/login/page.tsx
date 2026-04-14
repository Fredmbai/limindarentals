"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Home, ArrowRight, Loader2 } from "lucide-react";
import { useAuthStore } from "@/store/authStore";

const schema = z.object({
  full_name: z.string().min(2, "Name must be at least 2 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});
type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const isLoading = useAuthStore((s) => s.isLoading);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [serverError, setServerError] = useState("");

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setServerError("");
    // Dismiss keyboard before navigating (important on iOS Safari)
    (document.activeElement as HTMLElement)?.blur();
    try {
      const user = await login(data.full_name, data.password, rememberMe);
      const dest =
        user?.role === "landlord"  ? "/landlord/dashboard"  :
        user?.role === "caretaker" ? "/caretaker/dashboard" :
                                     "/tenant/dashboard";
      router.push(dest);
    } catch (err: any) {
      const msg = err.message || "";
      if (msg.includes("PENDING_APPROVAL")) {
        setServerError("Your landlord account is pending admin approval. You will be notified once approved.");
      } else {
        setServerError(msg || "Login failed. Please try again.");
      }
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: "var(--lr-bg-page)" }}>

      {/* Left panel */}
      <div style={{
        display: "none",
        width: "45%",
        background: "linear-gradient(150deg, #0F6E56 0%, #085041 60%, #063D30 100%)",
        position: "relative",
        overflow: "hidden",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "48px",
      }} className="login-left">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 40, height: 40, background: "rgba(255,255,255,0.15)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(255,255,255,0.2)" }}>
            <Home size={20} color="#fff" />
          </div>
          <span style={{ fontFamily: "'Sora', sans-serif", fontSize: "1.25rem", fontWeight: 600, color: "#fff", letterSpacing: "-0.02em" }}>LumindaRentals</span>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 16, padding: "48px 0" }}>
          <h1 style={{ fontFamily: "'Sora', sans-serif", fontSize: "2.5rem", fontWeight: 700, color: "#fff", lineHeight: 1.2, letterSpacing: "-0.03em" }}>
            Rent smarter.<br />Manage better.
          </h1>
          <p style={{ fontSize: "1rem", color: "rgba(255,255,255,0.65)", lineHeight: 1.7, maxWidth: 340 }}>
            The modern platform for landlords and tenants to handle payments, agreements, and everything in between.
          </p>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 48 }}>
          {["M-Pesa payments", "Real-time tracking", "Digital agreements", "Auto receipts"].map((f) => (
            <span key={f} style={{ padding: "6px 14px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 99, fontSize: "0.8rem", color: "rgba(255,255,255,0.8)", fontWeight: 500 }}>{f}</span>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 24px" }}>
        <div style={{ width: "100%", maxWidth: 420 }} className="animate-fade-in">

          {/* Logo (mobile) */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 40 }}>
            <div style={{ width: 32, height: 32, background: "var(--lr-primary)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Home size={16} color="#fff" />
            </div>
            <span style={{ fontFamily: "'Sora', sans-serif", fontSize: "1rem", fontWeight: 600, color: "var(--lr-primary)" }}>LumindaRentals</span>
          </div>

          {/* Header */}
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontFamily: "'Sora', sans-serif", fontSize: "1.75rem", fontWeight: 700, color: "var(--lr-text-primary)", letterSpacing: "-0.03em", marginBottom: 6 }}>
              Welcome back
            </h2>
            <p style={{ fontSize: "0.9rem", color: "var(--lr-text-muted)" }}>
              Sign in to your account to continue
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} style={{ display: "flex", flexDirection: "column", gap: 20 }} noValidate>

            {serverError && (
              <div className="animate-slide-up" style={{ background: "#FCEBEB", border: "1px solid rgba(162,45,45,0.2)", borderRadius: 8, padding: "12px 14px", fontSize: "0.875rem", color: "#791F1F" }}>
                {serverError}
              </div>
            )}

            {/* Full name */}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <label className="label" htmlFor="full_name">Full name</label>
              <input
                id="full_name"
                type="text"
                placeholder="e.g. John Kamau"
                autoComplete="name"
                className={`input ${errors.full_name ? "input-error" : ""}`}
                {...register("full_name")}
              />
              {errors.full_name && <span className="error-text">{errors.full_name.message}</span>}
            </div>

            {/* Password */}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <label className="label" htmlFor="password">Password</label>
              <div style={{ position: "relative" }}>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className={`input ${errors.password ? "input-error" : ""}`}
                  style={{ paddingRight: 44 }}
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 44, background: "none", border: "none", cursor: "pointer", color: "var(--lr-text-muted)", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {errors.password && <span className="error-text">{errors.password.message}</span>}
            </div>

            {/* Remember me + Forgot password row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: "var(--lr-primary)", cursor: "pointer" }}
                />
                <span style={{ fontSize: "0.875rem", color: "var(--lr-text-secondary)" }}>Remember me</span>
              </label>
              <a href="/forgot-password" style={{ fontSize: "0.82rem", color: "var(--lr-primary)", textDecoration: "none", fontWeight: 500 }}>
                Forgot password?
              </a>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="btn-primary"
              disabled={isLoading}
              style={{ width: "100%", padding: "12px", fontSize: "0.9375rem", marginTop: 4 }}
            >
              {isLoading ? (
                <><Loader2 size={16} style={{ animation: "spin 0.8s linear infinite" }} /> Signing in...</>
              ) : (
                <>Sign in <ArrowRight size={16} /></>
              )}
            </button>
          </form>

          {/* Register link */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 24, fontSize: "0.875rem", color: "var(--lr-text-muted)" }}>
            <span>Don&apos;t have an account?</span>
            <a href="/register" style={{ color: "var(--lr-primary)", fontWeight: 500, textDecoration: "none" }}>Create account</a>
          </div>

          <p style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--lr-text-muted)", marginTop: 32 }}>
            Secured by 256-bit encryption · Kenya
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (min-width: 1024px) {
          .login-left { display: flex !important; }
        }
      `}</style>
    </div>
  );
}