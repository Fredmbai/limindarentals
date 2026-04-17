"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Home, ArrowRight, CheckCircle, CreditCard, Wrench,
  FileText, Bell, Shield, Users, Building2,
  TrendingUp, Smartphone, Star,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";

export default function LandingPage() {
  const router = useRouter();
  const user   = useAuthStore((s) => s.user);

  // Redirect logged-in users straight to their dashboard
  useEffect(() => {
    if (!user) return;
    if (user.role === "landlord")  { router.replace("/landlord/dashboard");  return; }
    if (user.role === "caretaker") { router.replace("/caretaker/dashboard"); return; }
    router.replace("/tenant/dashboard");
  }, [user, router]);

  // While redirecting show nothing so there's no flash
  if (user) return null;

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF8", fontFamily: "'DM Sans', ui-sans-serif, system-ui, sans-serif" }}>

      {/* ── Navbar ── */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(250,250,248,0.85)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(211,209,199,0.5)",
        padding: "0 24px",
      }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 34, height: 34, background: "var(--lr-primary)", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Home size={17} color="#fff" />
            </div>
            <span style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: "1.05rem", color: "var(--lr-primary)", letterSpacing: "-0.02em" }}>LumidahRentals</span>
          </div>

          {/* Nav actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Link href="/login" style={{ padding: "8px 16px", borderRadius: 8, fontSize: "0.875rem", fontWeight: 500, color: "var(--lr-text-secondary)", textDecoration: "none", transition: "color 0.15s" }}
              className="nav-link">
              Sign in
            </Link>
            <Link href="/register" className="btn-primary" style={{ textDecoration: "none", padding: "9px 18px", fontSize: "0.875rem", borderRadius: 8 }}>
              Get started <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{ position: "relative", overflow: "hidden", padding: "80px 24px 96px" }}>

        {/* Background decorations */}
        <div style={{ position: "absolute", top: -120, right: -120, width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle, rgba(15,110,86,0.08) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -80, left: -80, width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(15,110,86,0.05) 0%, transparent 70%)", pointerEvents: "none" }} />

        <div style={{ maxWidth: 1120, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }} className="hero-grid">

          {/* Left: text */}
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "var(--lr-primary-light)", border: "1px solid rgba(15,110,86,0.2)", borderRadius: 99, padding: "5px 14px", marginBottom: 24 }}>
              <Star size={12} color="var(--lr-primary)" />
              <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--lr-primary)" }}>Built for Kenya&apos;s rental market</span>
            </div>

            <h1 style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: "clamp(2.2rem, 5vw, 3.4rem)",
              fontWeight: 700,
              color: "var(--lr-text-primary)",
              lineHeight: 1.15,
              letterSpacing: "-0.03em",
              marginBottom: 22,
            }}>
              Property management<br />
              <span style={{ color: "var(--lr-primary)" }}>that actually works.</span>
            </h1>

            <p style={{ fontSize: "1.05rem", color: "var(--lr-text-muted)", lineHeight: 1.75, maxWidth: 480, marginBottom: 36 }}>
              From M-Pesa rent collection to maintenance tracking and digital agreements — LumidahRentals gives landlords, tenants and caretakers everything they need in one place.
            </p>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link href="/register" className="btn-primary" style={{ textDecoration: "none", padding: "13px 24px", fontSize: "0.9375rem", borderRadius: 10 }}>
                Start <ArrowRight size={15} />
              </Link>
              <Link href="/login" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 24px", borderRadius: 10, border: "1px solid var(--lr-border)", background: "#fff", fontSize: "0.9375rem", fontWeight: 500, color: "var(--lr-text-secondary)", textDecoration: "none", transition: "all 0.15s" }}
                className="outline-btn">
                Sign in to your account
              </Link>
            </div>

            {/* Trust badges */}
            <div style={{ display: "flex", gap: 20, marginTop: 36, flexWrap: "wrap" }}>
              {[
                { icon: <Shield size={14} color="var(--lr-primary)" />, text: "256-bit encryption" },
                { icon: <CheckCircle size={14} color="#639922" />,      text: "No setup fees" },
                { icon: <Smartphone size={14} color="#185FA5" />,       text: "M-Pesa supported" },
              ].map((b) => (
                <div key={b.text} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {b.icon}
                  <span style={{ fontSize: "0.8rem", color: "var(--lr-text-muted)", fontWeight: 500 }}>{b.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: floating cards */}
          <div style={{ position: "relative", display: "flex", justifyContent: "center", alignItems: "center" }} className="hero-cards">

            {/* Main card */}
            <div style={{
              background: "#fff", borderRadius: 20, border: "1px solid var(--lr-border)",
              boxShadow: "0 24px 64px rgba(0,0,0,0.10)", padding: "24px",
              width: "100%", maxWidth: 320, position: "relative", zIndex: 2,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <div>
                  <p style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--lr-text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Monthly revenue</p>
                  <p style={{ fontFamily: "'Sora', sans-serif", fontSize: "1.9rem", fontWeight: 700, color: "var(--lr-text-primary)", marginTop: 2 }}>KES 284K</p>
                </div>
                <div style={{ width: 44, height: 44, background: "var(--lr-primary-light)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <TrendingUp size={20} color="var(--lr-primary)" />
                </div>
              </div>
              {/* Mini bar chart */}
              <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 52, marginBottom: 16 }}>
                {[40, 65, 50, 80, 60, 90, 75].map((h, i) => (
                  <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: 4, background: i === 5 ? "var(--lr-primary)" : "var(--lr-primary-light)", transition: "height 0.3s" }} />
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <span className="badge badge-success">12 paid</span>
                <span className="badge badge-warning">2 pending</span>
                <span className="badge badge-danger">1 overdue</span>
              </div>
            </div>

            {/* Floating notification card */}
            <div style={{
              position: "absolute", top: -20, right: -16,
              background: "#fff", borderRadius: 14, border: "1px solid var(--lr-border)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.08)", padding: "12px 14px",
              display: "flex", alignItems: "center", gap: 10,
              zIndex: 3, animation: "float 4s ease-in-out infinite",
            }} className="float-card">
              <div style={{ width: 32, height: 32, background: "#EAF3DE", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <CheckCircle size={15} color="#639922" />
              </div>
              <div>
                <p style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--lr-text-primary)", marginBottom: 1 }}>Payment received</p>
                <p style={{ fontSize: "0.7rem", color: "var(--lr-text-muted)" }}>KES 18,000 · Unit 4A</p>
              </div>
            </div>

            {/* Floating maintenance card */}
            <div style={{
              position: "absolute", bottom: -16, left: -20,
              background: "#fff", borderRadius: 14, border: "1px solid var(--lr-border)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.08)", padding: "12px 14px",
              display: "flex", alignItems: "center", gap: 10,
              zIndex: 3, animation: "float 4s ease-in-out infinite 2s",
            }} className="float-card">
              <div style={{ width: 32, height: 32, background: "#FAEEDA", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Wrench size={15} color="#BA7517" />
              </div>
              <div>
                <p style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--lr-text-primary)", marginBottom: 1 }}>Maintenance resolved</p>
                <p style={{ fontSize: "0.7rem", color: "var(--lr-text-muted)" }}>Plumbing · Unit 2B</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <section style={{ background: "var(--lr-primary)", padding: "28px 24px" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, textAlign: "center" }} className="stats-bar">
          {[
            { value: "", label: "Tenants managed" },
            { value: "", label: "Properties listed" },
            { value: "", label: "Rent collected" },
            { value: "99.9%", label: "Uptime" },
          ].map((s) => (
            <div key={s.label}>
              <p style={{ fontFamily: "'Sora', sans-serif", fontSize: "clamp(1.4rem, 3vw, 1.9rem)", fontWeight: 700, color: "#fff", letterSpacing: "-0.02em" }}>{s.value}</p>
              <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.65)", marginTop: 3 }}>{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Role cards ── */}
      <section style={{ padding: "88px 24px", background: "#FAFAF8" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--lr-primary)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Built for every role</p>
            <h2 style={{ fontFamily: "'Sora', sans-serif", fontSize: "clamp(1.6rem, 4vw, 2.4rem)", fontWeight: 700, color: "var(--lr-text-primary)", letterSpacing: "-0.03em", maxWidth: 520, margin: "0 auto" }}>
              One platform, three powerful views
            </h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }} className="roles-grid">
            {[
              {
                icon: <Building2 size={22} color="var(--lr-primary)" />,
                bg: "var(--lr-primary-light)",
                title: "Landlords",
                desc: "Manage all your properties, units and tenants from a single dashboard. Track payments, review maintenance requests and generate detailed reports.",
                points: ["Real-time rent tracking", "Property & unit management", "Financial reports & analytics", "Bank transfer verification"],
                accent: "var(--lr-primary)",
              },
              {
                icon: <Users size={22} color="#185FA5" />,
                bg: "#E6F1FB",
                title: "Tenants",
                desc: "Pay rent via M-Pesa, card or bank transfer, raise maintenance issues and download digital receipts — all without calling your landlord.",
                points: ["M-Pesa & card payments", "Instant payment receipts", "Maintenance request tracking", "Digital tenancy agreement"],
                accent: "#185FA5",
              },
              {
                icon: <CheckCircle size={22} color="#639922" />,
                bg: "#EAF3DE",
                title: "Caretakers",
                desc: "Stay on top of rent collection status, resolve maintenance requests and generate monthly reports for landlords — all from your phone.",
                points: ["Rent collection overview", "Maintenance resolution", "Add & manage tenants", "Monthly collection reports"],
                accent: "#639922",
              },
            ].map((role) => (
              <div key={role.title} style={{ background: "#fff", borderRadius: 18, border: "1px solid var(--lr-border)", padding: "28px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", transition: "transform 0.2s, box-shadow 0.2s" }} className="role-card">
                <div style={{ width: 46, height: 46, background: role.bg, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
                  {role.icon}
                </div>
                <h3 style={{ fontFamily: "'Sora', sans-serif", fontSize: "1.15rem", fontWeight: 700, color: "var(--lr-text-primary)", marginBottom: 10, letterSpacing: "-0.02em" }}>{role.title}</h3>
                <p style={{ fontSize: "0.875rem", color: "var(--lr-text-muted)", lineHeight: 1.7, marginBottom: 20 }}>{role.desc}</p>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  {role.points.map((pt) => (
                    <li key={pt} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.82rem", color: "var(--lr-text-secondary)" }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: role.accent, flexShrink: 0 }} />
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features grid ── */}
      <section style={{ padding: "80px 24px", background: "linear-gradient(180deg, #F0EEE7 0%, #FAFAF8 100%)" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--lr-primary)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Everything you need</p>
            <h2 style={{ fontFamily: "'Sora', sans-serif", fontSize: "clamp(1.6rem, 4vw, 2.2rem)", fontWeight: 700, color: "var(--lr-text-primary)", letterSpacing: "-0.03em" }}>
              Packed with powerful features
            </h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }} className="features-grid">
            {[
              { icon: <CreditCard size={20} color="var(--lr-primary)" />, bg: "var(--lr-primary-light)", title: "Smart payments", desc: "Accept M-Pesa, card and bank transfers. Automatic receipts generated on every transaction." },
              { icon: <FileText size={20} color="#185FA5" />, bg: "#E6F1FB", title: "Digital agreements", desc: "Tenancy agreements signed digitally and stored securely. Download any time as PDF." },
              { icon: <Wrench size={20} color="#BA7517" />, bg: "#FAEEDA", title: "Maintenance tracking", desc: "Tenants report issues, caretakers resolve them. Full status history always available." },
              { icon: <Bell size={20} color="#639922" />, bg: "#EAF3DE", title: "Real-time notifications", desc: "Instant alerts for payments, maintenance updates and lease events — across all roles." },
              { icon: <TrendingUp size={20} color="#A32D2D" />, bg: "#FCEBEB", title: "Financial reports", desc: "Rent collection summaries, revenue trends and audit logs — exportable to CSV." },
              { icon: <Shield size={20} color="#0C447C" />, bg: "#E6F1FB", title: "Secure & private", desc: "Bank-grade 256-bit encryption. Your data never leaves Kenyan servers." },
            ].map((f) => (
              <div key={f.title} style={{ background: "#fff", borderRadius: 14, border: "1px solid var(--lr-border)", padding: "22px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                <div style={{ width: 40, height: 40, background: f.bg, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                  {f.icon}
                </div>
                <h4 style={{ fontFamily: "'Sora', sans-serif", fontSize: "0.95rem", fontWeight: 600, color: "var(--lr-text-primary)", marginBottom: 6 }}>{f.title}</h4>
                <p style={{ fontSize: "0.82rem", color: "var(--lr-text-muted)", lineHeight: 1.65 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section style={{ padding: "88px 24px", background: "#fff" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <h2 style={{ fontFamily: "'Sora', sans-serif", fontSize: "clamp(1.8rem, 4vw, 2.4rem)", fontWeight: 700, color: "var(--lr-text-primary)", letterSpacing: "-0.03em", marginBottom: 12 }}>
              Simple, transparent pricing
            </h2>
            <p style={{ fontSize: "1rem", color: "var(--lr-text-muted)", maxWidth: 520, margin: "0 auto" }}>
              No monthly subscriptions. You only pay when rent is collected.
            </p>
          </div>

          {/* Two pricing columns */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24, marginBottom: 48 }} className="pricing-grid">
            {/* Landlords */}
            <div style={{ background: "var(--lr-bg-page)", border: "1.5px solid var(--lr-border)", borderRadius: 16, padding: "32px 28px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                <div style={{ width: 36, height: 36, background: "var(--lr-primary-light)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Building2 size={18} color="var(--lr-primary)" />
                </div>
                <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: "1.05rem", color: "var(--lr-text-primary)" }}>For Landlords</h3>
              </div>
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  { text: "No monthly subscription fee",                          positive: true  },
                  { text: "2% platform fee per successful rent collection",        positive: false },
                  { text: "Small Safaricom B2B transfer fee (KES 12–152)",         positive: false },
                  { text: "Full payment breakdown on every transaction",            positive: true  },
                  { text: "Only pay when rent is collected",                        positive: true  },
                ].map((item) => (
                  <li key={item.text} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <span style={{ width: 18, height: 18, borderRadius: "50%", background: item.positive ? "var(--lr-primary-light)" : "#F4F4F2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: item.positive ? "var(--lr-primary)" : "#6B6B6B" }} />
                    </span>
                    <span style={{ fontSize: "0.875rem", color: "var(--lr-text-secondary)", lineHeight: 1.55 }}>{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Tenants */}
            <div style={{ background: "var(--lr-bg-page)", border: "1.5px solid var(--lr-border)", borderRadius: 16, padding: "32px 28px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                <div style={{ width: 36, height: 36, background: "var(--lr-primary-light)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Users size={18} color="var(--lr-primary)" />
                </div>
                <h3 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: "1.05rem", color: "var(--lr-text-primary)" }}>For Tenants</h3>
              </div>
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  { text: "Pay via M-Pesa — no extra charges from us",             positive: true  },
                  { text: "Pay via Card (Visa/Mastercard) — 2.6% processing fee",  positive: false },
                  { text: "Instant payment confirmation via SMS and email",         positive: true  },
                  { text: "Secure encrypted payments",                              positive: true  },
                ].map((item) => (
                  <li key={item.text} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <span style={{ width: 18, height: 18, borderRadius: "50%", background: item.positive ? "var(--lr-primary-light)" : "#F4F4F2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: item.positive ? "var(--lr-primary)" : "#6B6B6B" }} />
                    </span>
                    <span style={{ fontSize: "0.875rem", color: "var(--lr-text-secondary)", lineHeight: 1.55 }}>{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Benefits strip */}
          <div style={{ background: "linear-gradient(135deg, #E1F5EE, #D0F0E4)", border: "1px solid rgba(15,110,86,0.15)", borderRadius: 16, padding: "28px 32px" }}>
            <p style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "0.9rem", color: "var(--lr-primary-dark)", marginBottom: 16, textAlign: "center" }}>What you get</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }} className="benefits-grid">
              {[
                "Automated rent reminders reduce late payments",
                "Payment history and receipts always available",
                "Multiple properties, one dashboard",
                "24/7 payment processing",
              ].map((b) => (
                <div key={b} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--lr-primary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff" }} />
                  </span>
                  <span style={{ fontSize: "0.82rem", color: "#085041" }}>{b}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ padding: "88px 24px", background: "#FAFAF8" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
          <div style={{ background: "linear-gradient(135deg, #0F6E56 0%, #1D9E75 100%)", borderRadius: 24, padding: "60px 40px", position: "relative", overflow: "hidden" }}>
            {/* Decoration rings */}
            <div style={{ position: "absolute", top: -60, right: -60, width: 200, height: 200, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.1)", pointerEvents: "none" }} />
            <div style={{ position: "absolute", bottom: -40, left: -40, width: 160, height: 160, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.08)", pointerEvents: "none" }} />

            <div style={{ position: "relative", zIndex: 1 }}>
              <h2 style={{ fontFamily: "'Sora', sans-serif", fontSize: "clamp(1.6rem, 4vw, 2.2rem)", fontWeight: 700, color: "#fff", letterSpacing: "-0.03em", marginBottom: 14 }}>
                Ready to simplify your rental?
              </h2>
              <p style={{ fontSize: "1rem", color: "rgba(255,255,255,0.72)", lineHeight: 1.7, marginBottom: 32 }}>
                Join thousands of landlords and tenants already using LumidahRentals.
              </p>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                <Link href="/register" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#fff", color: "var(--lr-primary)", padding: "12px 24px", borderRadius: 10, fontWeight: 600, fontSize: "0.9375rem", textDecoration: "none", transition: "transform 0.15s" }} className="cta-white">
                  Create free account <ArrowRight size={15} />
                </Link>
                <Link href="/login" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)", padding: "12px 24px", borderRadius: 10, fontWeight: 500, fontSize: "0.9375rem", textDecoration: "none" }}>
                  Sign in
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: "1px solid var(--lr-border)", padding: "28px 24px 88px", background: "#FAFAF8" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          {/* Brand */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, background: "var(--lr-primary)", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Home size={14} color="#fff" />
            </div>
            <span style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: "0.9rem", color: "var(--lr-primary)" }}>LumidahRentals</span>
          </div>

          {/* Centre: links */}
          <div style={{ display: "flex", gap: 24 }}>
            <Link href="/login"    style={{ fontSize: "0.82rem", color: "var(--lr-text-muted)", textDecoration: "none" }}>Sign in</Link>
            <Link href="/register" style={{ fontSize: "0.82rem", color: "var(--lr-text-muted)", textDecoration: "none" }}>Register</Link>
          </div>

          {/* Right: developer credit */}
          <div style={{ fontSize: "0.78rem", color: "var(--lr-text-muted)" }}>
            Developed by{" "}
            <a
              href="https://nestiumsystems.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--lr-primary)", fontWeight: 600, textDecoration: "none" }}
            >
              Nestium Systems
            </a>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-10px); }
        }

        .nav-link:hover { color: var(--lr-text-primary) !important; }
        .outline-btn:hover { background: var(--lr-bg-page) !important; border-color: var(--lr-primary) !important; color: var(--lr-primary) !important; }
        .role-card:hover { transform: translateY(-4px); box-shadow: 0 12px 32px rgba(0,0,0,0.09) !important; }
        .cta-white:hover { transform: scale(1.02); }

        /* Mobile */
        @media (max-width: 767px) {
          .hero-grid    { grid-template-columns: 1fr !important; gap: 48px !important; }
          .hero-cards   { display: none !important; }
          .stats-bar    { grid-template-columns: repeat(2, 1fr) !important; }
          .roles-grid   { grid-template-columns: 1fr !important; }
          .features-grid { grid-template-columns: 1fr !important; }
          .float-card   { display: none !important; }
          .pricing-grid  { grid-template-columns: 1fr !important; }
          .benefits-grid { grid-template-columns: 1fr !important; }
        }
        @media (min-width: 768px) and (max-width: 1023px) {
          .hero-grid    { gap: 32px !important; }
          .roles-grid   { grid-template-columns: 1fr !important; }
          .features-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 480px) {
          .stats-bar { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}
