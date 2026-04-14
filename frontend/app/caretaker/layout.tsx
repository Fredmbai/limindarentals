"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";

export default function CaretakerRootLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const user     = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hydrated) return;  // wait for Zustand to finish reading from storage
    if (!user) {
      router.replace("/login");
    } else if (user.role !== "caretaker") {
      if (user.role === "landlord") router.replace("/landlord/dashboard");
      else router.replace("/tenant/dashboard");
    }
  }, [user, hydrated, router]);

  // Show nothing until hydration is complete — prevents flash + false redirect
  if (!hydrated) return null;
  if (!user || user.role !== "caretaker") return null;
  return <>{children}</>;
}
