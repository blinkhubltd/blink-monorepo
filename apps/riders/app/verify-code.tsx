import React, { useState } from "react";
import {
  View,
  Text,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Input, InputField } from "@/components/ui/input";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { useSignIn, useSignUp } from "@clerk/clerk-expo";
import { useRouter, useLocalSearchParams } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { THEME } from "@/theme/design";

export default function VerifyCodePage() {
  const {
    signIn,
    setActive: setActiveSignIn,
    isLoaded: isSignInLoaded,
  } = useSignIn();
  const {
    signUp,
    setActive: setActiveSignUp,
    isLoaded: isSignUpLoaded,
  } = useSignUp();
  const router = useRouter();
  const params = useLocalSearchParams();
  const verificationType = params.type as "sign-in" | "sign-up" | undefined;
  const firstName = params.firstName as string | undefined;
  const lastName = params.lastName as string | undefined;

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleVerifySignIn = async () => {
    if (!isSignInLoaded || !signIn) return;
    try {
      setLoading(true);
      let completeSignIn;
      try {
        completeSignIn = await signIn.attemptFirstFactor({
          strategy: "email_code",
          code,
        });
      } catch {
        completeSignIn = await signIn.attemptSecondFactor({
          strategy: "totp",
          code,
        });
      }
      if (completeSignIn.status === "complete") {
        await setActiveSignIn({ session: completeSignIn.createdSessionId });
        router.replace("/");
      } else {
        Alert.alert("Error", "Verification failed. Please try again.");
      }
    } catch (err: any) {
      Alert.alert("Error", err.errors?.[0]?.message || "Failed to verify code");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySignUp = async () => {
    if (!isSignUpLoaded || !signUp) return;
    try {
      setLoading(true);
      const completeSignUp = await signUp.attemptEmailAddressVerification({ code });
      if (completeSignUp.status === "complete") {
        if (firstName || lastName) {
          try {
            await signUp.update({ firstName: firstName || "", lastName: lastName || "" });
          } catch {}
        }
        await setActiveSignUp({ session: completeSignUp.createdSessionId });
        router.replace("/");
      } else {
        Alert.alert("Error", "Verification failed. Please try again.");
      }
    } catch (err: any) {
      Alert.alert("Error", err.errors?.[0]?.message || "Failed to verify email");
    } finally {
      setLoading(false);
    }
  };

  const handleVerification = () => {
    if (verificationType === "sign-up" || (signUp && !signIn)) {
      handleVerifySignUp();
    } else {
      handleVerifySignIn();
    }
  };

  const resendCode = async () => {
    try {
      setLoading(true);
      if (verificationType === "sign-up" && signUp) {
        await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
        Alert.alert("Success", "A new code has been sent to your email");
      } else {
        Alert.alert("Info", "Please request a new code from the sign-in screen");
      }
    } catch (err: any) {
      Alert.alert("Error", err.errors?.[0]?.message || "Failed to resend code");
    } finally {
      setLoading(false);
    }
  };

  const isSignUp = verificationType === "sign-up";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: THEME.colors.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              paddingHorizontal: 24,
              paddingVertical: 32,
            }}
          >
            {/* Icon */}
            <View style={{ alignItems: "center", marginBottom: 28 }}>
              <View
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 36,
                  backgroundColor: THEME.colors.primary + "20",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 20,
                }}
              >
                <Ionicons
                  name="mail-outline"
                  size={32}
                  color={THEME.colors.primary}
                />
              </View>

              <Text
                style={{
                  fontSize: 26,
                  fontWeight: "800",
                  color: THEME.colors.text,
                  textAlign: "center",
                  marginBottom: 8,
                }}
              >
                {isSignUp ? "Verify Your Email" : "Enter Verification Code"}
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: THEME.colors.textSecondary,
                  textAlign: "center",
                  lineHeight: 20,
                  paddingHorizontal: 12,
                }}
              >
                {isSignUp
                  ? "We've sent a verification code to your email address"
                  : "Enter the verification code sent to your email or authenticator app"}
              </Text>
            </View>

            {/* Card */}
            <View
              style={{
                backgroundColor: THEME.colors.surface,
                borderRadius: 20,
                padding: 24,
                borderWidth: 1,
                borderColor: THEME.colors.border,
                ...THEME.shadow.card,
                gap: 20,
              }}
            >
              {/* Code input */}
              <View>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: THEME.colors.textSecondary,
                    marginBottom: 8,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Verification Code
                </Text>
                <Input variant="outline">
                  <InputField
                    placeholder="000000"
                    value={code}
                    onChangeText={setCode}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                    style={{
                      fontSize: 28,
                      letterSpacing: 12,
                      textAlign: "center",
                      fontWeight: "700",
                      color: THEME.colors.text,
                    }}
                  />
                </Input>
                <Text
                  style={{
                    fontSize: 11,
                    color: THEME.colors.textSecondary,
                    marginTop: 6,
                    textAlign: "center",
                  }}
                >
                  Enter the 6-digit code sent to your email
                </Text>
              </View>

              {/* Verify button */}
              <TouchableOpacity
                onPress={handleVerification}
                disabled={loading || code.length !== 6}
                activeOpacity={0.85}
                style={{
                  backgroundColor:
                    code.length !== 6 || loading
                      ? THEME.colors.primary + "60"
                      : THEME.colors.primary,
                  borderRadius: 14,
                  paddingVertical: 15,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                )}
                <Text
                  style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}
                >
                  {loading ? "Verifying..." : "Verify"}
                </Text>
              </TouchableOpacity>

              {/* Resend code */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Text
                  style={{ color: THEME.colors.textSecondary, fontSize: 13 }}
                >
                  Didn't receive the code?
                </Text>
                <TouchableOpacity
                  onPress={resendCode}
                  disabled={loading}
                  activeOpacity={0.7}
                >
                  <Text
                    style={{
                      color: THEME.colors.primary,
                      fontWeight: "700",
                      fontSize: 13,
                    }}
                  >
                    Resend
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Back button */}
              <TouchableOpacity
                onPress={() => router.back()}
                activeOpacity={0.8}
                style={{
                  borderWidth: 1,
                  borderColor: THEME.colors.border,
                  borderRadius: 14,
                  paddingVertical: 13,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: THEME.colors.textSecondary,
                    fontWeight: "600",
                    fontSize: 15,
                  }}
                >
                  Back
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
