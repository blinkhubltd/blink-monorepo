import React from 'react';
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import * as SecureStore from 'expo-secure-store';
import { View, Text } from 'react-native';

// Get Convex URL with fallback and validation
const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL || 'https://wary-dogfish-636.convex.cloud';
const clerkKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

console.log('Convex URL:', convexUrl);
console.log('Clerk Key exists:', !!clerkKey);

if (!convexUrl || !convexUrl.includes('convex.cloud')) {
  console.error('Invalid Convex URL:', convexUrl);
}

const convex = new ConvexReactClient(convexUrl);

const tokenCache = {
  async getToken(key: string) {
    try {
      return SecureStore.getItemAsync(key);
    } catch (err) {
      return null;
    }
  },
  async saveToken(key: string, value: string) {
    try {
      return SecureStore.setItemAsync(key, value);
    } catch (err) {
      return;
    }
  },
};

export default function ConvexClientProvider({ children }: { children: React.ReactNode }) {
  // Validate environment variables
  if (!clerkKey) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ color: 'red', fontSize: 16, textAlign: 'center' }}>
          Configuration Error: Missing Clerk Publishable Key
        </Text>
        <Text style={{ color: 'gray', fontSize: 12, marginTop: 10, textAlign: 'center' }}>
          Check your .env file for EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
        </Text>
      </View>
    );
  }

  if (!convexUrl || !convexUrl.includes('convex.cloud')) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ color: 'red', fontSize: 16, textAlign: 'center' }}>
          Configuration Error: Invalid Convex URL
        </Text>
        <Text style={{ color: 'gray', fontSize: 12, marginTop: 10, textAlign: 'center' }}>
          Current URL: {convexUrl || 'undefined'}
        </Text>
      </View>
    );
  }

  return (
    <ClerkProvider
      publishableKey={clerkKey}
      tokenCache={tokenCache}
    >
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
