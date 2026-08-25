"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@repo/backend";

const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.blink.app";
const APP_STORE_URL = "https://apps.apple.com/app/blink/id6740044279";

type Platform = "android" | "ios" | "unknown";

function detectPlatform(): Platform {
  if (typeof window === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return "unknown";
}

/* ── SVG brand icons (standard badge style) ─────────────────────── */

function GooglePlayIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M3.61 1.814A1.823 1.823 0 0 0 3 3.232v17.536c0 .548.248 1.037.61 1.418L3.68 22.12l9.9-9.9v-.44L3.68 1.88l-.07-.066Z" />
      <path d="M17.445 15.955l-3.865-3.865v-.44l3.865-3.865.087.05 4.58 2.602c1.308.743 1.308 1.96 0 2.703l-4.58 2.602-.087.213Z" />
      <path d="m3.68 22.12 9.9-9.9 3.865 3.865-13.1 7.443c-.455.26-.942.28-1.372.12l.707-1.528Z" />
      <path d="m3.68 1.88 13.1 7.443-3.865 3.865L3.016 3.289c.43-.16.917-.14 1.372.12l-.707 1.528-.001-.001v-.001l-.001-.001V3.88l.001.001V1.88Z" />
    </svg>
  );
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11Z" />
    </svg>
  );
}

/* ── Main component ─────────────────────────────────────────────── */

export default function RedirectPage() {
  const params = useParams();
  const code = params.code as string;
  const [showFallback, setShowFallback] = useState(false);
  const [platform] = useState<Platform>(() => detectPlatform());

  const incrementScanCount = useMutation(api.data.marketing.incrementScanCount);

  const redirectUrl =
    platform === "ios"
      ? APP_STORE_URL
      : platform === "android"
        ? PLAY_STORE_URL
        : null;

  const handleScan = useCallback(async () => {
    // Persist agent code for attribution
    try {
      localStorage.setItem("agentCode", code);
    } catch {}
    try {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 30);
      document.cookie = `agentCode=${code}; expires=${expiryDate.toUTCString()}; path=/; SameSite=Lax`;
    } catch {}

    // Increment scan count (non-blocking – still redirect on failure)
    try {
      await incrementScanCount({ agentCode: code });
    } catch (err) {
      console.warn("Failed to increment scan count:", err);
    }

    // Auto-redirect for known platforms
    if (redirectUrl) {
      window.location.href = redirectUrl;
      // Show fallback after a delay in case redirect doesn't fire
      setTimeout(() => setShowFallback(true), 2500);
    } else {
      setShowFallback(true);
    }
  }, [code, incrementScanCount, redirectUrl]);

  useEffect(() => {
    if (code) handleScan();
    else setShowFallback(true);
  }, [code, handleScan]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="w-full max-w-md text-center">
        {/* Brand */}
        <h1 className="text-5xl font-extrabold tracking-tight text-gray-900 mb-1">
          Blink
        </h1>
        <p className="text-base text-gray-500 mb-8">
          Your everyday delivery app
        </p>

        {/* Redirecting indicator */}
        {!showFallback && (
          <div className="mb-8">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-amber-200 border-t-amber-600" />
            <p className="text-sm text-gray-500">
              Redirecting you to the store…
            </p>
          </div>
        )}

        {/* Fallback store buttons (always visible when showFallback or after timeout) */}
        {showFallback && (
          <div className="flex flex-col gap-4 mb-8">
            {/* Google Play button */}
            <a
              href={PLAY_STORE_URL}
              className="flex items-center justify-center gap-3 rounded-xl bg-black px-6 py-4 text-white transition-transform active:scale-[0.97] hover:bg-gray-900"
            >
              <GooglePlayIcon className="h-7 w-7 shrink-0" />
              <span className="text-left">
                <span className="block text-[11px] leading-tight text-gray-300 uppercase tracking-wide">
                  Get it on
                </span>
                <span className="block text-lg font-bold leading-tight">
                  Google Play
                </span>
              </span>
            </a>

            {/* App Store button */}
            <a
              href={APP_STORE_URL}
              className="flex items-center justify-center gap-3 rounded-xl bg-black px-6 py-4 text-white transition-transform active:scale-[0.97] hover:bg-gray-900"
            >
              <AppleIcon className="h-7 w-7 shrink-0" />
              <span className="text-left">
                <span className="block text-[11px] leading-tight text-gray-300 uppercase tracking-wide">
                  Download on the
                </span>
                <span className="block text-lg font-bold leading-tight">
                  App Store
                </span>
              </span>
            </a>
          </div>
        )}

        {/* Referral badge */}
        {code && (
          <div className="inline-block rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            Referred by agent{" "}
            <span className="font-bold text-amber-900">{code}</span>
          </div>
        )}
      </div>
    </div>
  );
}
