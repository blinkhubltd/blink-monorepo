"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon as AlertTriangle,
  ArrowLeftIcon as ArrowLeft,
  Mail01Icon as Mail,
  ShieldUserIcon as Shield,
} from "@hugeicons/core-free-icons";
import React from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import Link from "next/link";

export default function UnauthorizedPage() {
  const { user: clerkUser, isLoaded: clerkLoaded } = useUser();

  // Query user data from Convex directly since we're outside the AuthProvider
  const userData = useQuery(
    api.user.users.getCurrentUser,
    clerkUser?.id ? { clerkId: clerkUser.id } : "skip",
  );

  const isLoading = !clerkLoaded || (clerkUser && userData === undefined);
  const currentUser = userData;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500"></div>
      </div>
    );
  }

  const getUserMessage = () => {
    if (!currentUser) {
      return {
        title: "Access Denied",
        description:
          "Your account was not found in our system. Please contact support.",
        action: "Contact Support",
      };
    }

    return {
      title: "Access Denied",
      description:
        "Your account does not have the necessary permissions to access this area. Please contact your administrator.",
      action: "Contact Administrator",
    };
  };

  const message = getUserMessage();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-red-100">
              <HugeiconsIcon icon={AlertTriangle} className="h-8 w-8 text-red-600" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">
            {message.title}
          </CardTitle>
          <CardDescription className="text-gray-600">
            {message.description}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {currentUser && (
            <div className="bg-gray-50 p-3 rounded-lg text-sm">
              <div className="flex items-center gap-2 mb-2">
                <HugeiconsIcon icon={Shield} className="h-4 w-4 text-gray-500" />
                <span className="font-medium">Account Information</span>
              </div>
              <div className="space-y-1 text-gray-600">
                <p>
                  <strong>Email:</strong> {currentUser.email}
                </p>
                <p>
                  <strong>Role:</strong> Assigned
                </p>
                <p>
                  <strong>Status:</strong> {currentUser.status || "Active"}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Button asChild className="w-full" variant="default">
              <Link
                href="mailto:admin@blink.com?subject=Admin Access Request"
                className="flex items-center gap-2"
              >
                <HugeiconsIcon icon={Mail} className="h-4 w-4" />
                {message.action}
              </Link>
            </Button>

            <Button asChild className="w-full" variant="outline">
              <Link href="/sign-in" className="flex items-center gap-2">
                <HugeiconsIcon icon={ArrowLeft} className="h-4 w-4" />
                Back to Sign In
              </Link>
            </Button>
          </div>

          <div className="text-xs text-center text-gray-500 mt-4">
            If you believe this is an error, please contact your system
            administrator.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
