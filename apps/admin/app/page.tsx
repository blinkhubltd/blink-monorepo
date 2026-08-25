"use client";

import React, { useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import Link from "next/link";

export default function Home() {
  const { user: clerkUser, isLoaded: clerkLoaded } = useUser();
  const { user, isLoading: authLoading, isAuthorized } = useAuth();
  const router = useRouter();

  // Redirect logged-in users based on their access level
  useEffect(() => {
    if (clerkLoaded && !authLoading && clerkUser) {
      // If we have clerk user but no database user yet, wait for it to load
      if (!user) {
        return;
      }

      // Check if user is authorized to access the dashboard
      if (isAuthorized) {
        // Both ADMIN and MANAGER users get redirected to insights
        // This matches the middleware logic and permissions system
        router.push("/insights");
      } else {
        // Unauthorized users (CUSTOMER, PICKER, RIDER) get redirected to unauthorized page
        router.push("/unauthorized");
      }
    }
  }, [clerkLoaded, authLoading, clerkUser, user, isAuthorized, router]);

  // Show loading state while checking authentication
  if (!clerkLoaded || authLoading) {
    return (
      <div className="min-h-screen grid place-items-center p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // If user is not authenticated, show the landing page
  if (!clerkUser) {
    return (
      <div className="min-h-screen grid place-items-center p-8 bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center space-y-6 max-w-md">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-gray-900">Blink Admin</h1>
            <p className="text-gray-600">
              Administrative panel for Blink Hub management.
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6">
            <p className="text-sm text-gray-500 mb-4">
              Access restricted to authorized administrators only.
            </p>
            <Link
              href="/sign-in"
              className="inline-flex items-center justify-center w-full gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              Sign In to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // If user is authenticated, they will be redirected to insights
  // Show loading state during redirect
  return (
    <div className="min-h-screen grid place-items-center p-8">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  );
}
