import React, { useState, useCallback, useMemo } from "react";
import {
  Alert,
  Modal,
  View,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Text,
  TextInput,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useAuth } from "@/lib/auth";
import { useUser } from "@clerk/clerk-expo";
import Ionicons from "@expo/vector-icons/Ionicons";
import { THEME } from "@/theme/design";

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

interface PasswordChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Memoized PasswordInput component to prevent re-renders
const PasswordInput = React.memo(
  ({
    value,
    onChangeText,
    placeholder,
    show,
    onToggleShow,
    error,
    label,
    autoFocus = false,
  }: {
    value: string;
    onChangeText: (text: string) => void;
    placeholder: string;
    show: boolean;
    onToggleShow: () => void;
    error?: string;
    label: string;
    autoFocus?: boolean;
  }) => {
    const [isFocused, setIsFocused] = useState(false);

    const handleFocus = useCallback(() => setIsFocused(true), []);
    const handleBlur = useCallback(() => setIsFocused(false), []);

    return (
      <View style={{ marginBottom: 20 }}>
        <Text
          style={{
            fontSize: 15,
            fontWeight: "600",
            color: error ? THEME.colors.error : THEME.colors.text,
            marginBottom: 10,
            lineHeight: 20,
          }}
        >
          {label}
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: THEME.colors.surface,
            borderWidth: 1.5,
            borderColor: error
              ? THEME.colors.error
              : isFocused
                ? THEME.colors.primary
                : THEME.colors.border,
            borderRadius: 14,
            paddingHorizontal: 16,
            height: 52,
          }}
        >
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={THEME.colors.textSecondary}
            secureTextEntry={!show}
            autoComplete="password"
            autoFocus={autoFocus}
            onFocus={handleFocus}
            onBlur={handleBlur}
            style={{
              flex: 1,
              fontSize: 16,
              color: THEME.colors.text,
              height: "100%",
              paddingVertical: 0,
            }}
          />
          <TouchableOpacity
            onPress={onToggleShow}
            style={{
              padding: 10,
              marginLeft: 8,
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {show ? (
              <Ionicons name="eye-off-outline" size={22} color={THEME.colors.textSecondary} />
            ) : (
              <Ionicons name="eye-outline" size={22} color={THEME.colors.textSecondary} />
            )}
          </TouchableOpacity>
        </View>
        {error && (
          <Text
            style={{
              fontSize: 13,
              color: THEME.colors.error,
              marginTop: 6,
              fontWeight: "500",
              lineHeight: 18,
            }}
          >
            {error}
          </Text>
        )}
      </View>
    );
  }
);

export function PasswordChangeModal({
  isOpen,
  onClose,
}: PasswordChangeModalProps) {
  const { user } = useUser();

  const [step, setStep] = useState<"verify" | "change">("verify");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Visibility toggles
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Loading states
  const [verifying, setVerifying] = useState(false);
  const [updating, setUpdating] = useState(false);

  // Error states
  const [verifyError, setVerifyError] = useState("");
  const [errors, setErrors] = useState<{
    newPassword?: string;
    confirmPassword?: string;
  }>({});

  // Memoized callbacks to prevent re-renders
  const handleCurrentPasswordChange = useCallback(
    (text: string) => {
      setCurrentPassword(text);
      if (verifyError) setVerifyError("");
    },
    [verifyError]
  );

  const handleNewPasswordChange = useCallback(
    (text: string) => {
      setNewPassword(text);
      if (errors.newPassword) {
        setErrors((prev) => ({ ...prev, newPassword: undefined }));
      }
    },
    [errors.newPassword]
  );

  const handleConfirmPasswordChange = useCallback(
    (text: string) => {
      setConfirmPassword(text);
      if (errors.confirmPassword) {
        setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
      }
    },
    [errors.confirmPassword]
  );

  const toggleCurrentPassword = useCallback(() => {
    setShowCurrentPassword((prev) => !prev);
  }, []);

  const toggleNewPassword = useCallback(() => {
    setShowNewPassword((prev) => !prev);
  }, []);

  const toggleConfirmPassword = useCallback(() => {
    setShowConfirmPassword((prev) => !prev);
  }, []);

  const validateNewPassword = useCallback(() => {
    const newErrors: typeof errors = {};

    if (!newPassword.trim()) {
      newErrors.newPassword = "New password is required";
    } else if (newPassword.length < 8) {
      newErrors.newPassword = "Password must be at least 8 characters long";
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
      newErrors.newPassword =
        "Password must contain at least one uppercase letter, one lowercase letter, and one number";
    }

    if (!confirmPassword.trim()) {
      newErrors.confirmPassword = "Please confirm your new password";
    } else if (newPassword !== confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [newPassword, confirmPassword]);

  const handleVerifyPassword = async () => {
    if (!currentPassword.trim()) {
      setVerifyError("Please enter your current password");
      return;
    }

    setVerifying(true);
    setVerifyError("");

    try {
      if (!user) {
        throw new Error("User not found");
      }

      // Test the current password by attempting to update with the same password
      await user.updatePassword({
        currentPassword,
        newPassword: currentPassword, // Use same password to test
      });

      // If we get here, the current password is correct
      setStep("change");
    } catch (error: any) {
      console.error("Password verification error:", error);

      if (
        error?.message?.includes("current_password_invalid") ||
        error?.errors?.[0]?.message?.includes("current_password_invalid")
      ) {
        setVerifyError("Current password is incorrect");
      } else {
        setVerifyError("Failed to verify password. Please try again.");
      }
    } finally {
      setVerifying(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!validateNewPassword()) return;

    setUpdating(true);

    try {
      if (!user) {
        throw new Error("User not found");
      }

      // Update password using Clerk
      await user.updatePassword({
        currentPassword,
        newPassword,
      });

      Alert.alert("Success", "Your password has been updated successfully!", [
        { text: "OK", onPress: handleClose },
      ]);
    } catch (error: any) {
      console.error("Password change error:", error);

      let errorMessage = "Failed to update password. Please try again.";

      if (error?.errors?.[0]?.message) {
        errorMessage = error.errors[0].message;
      } else if (error?.message?.includes("password_invalid")) {
        errorMessage = "New password does not meet requirements";
      }

      Alert.alert("Error", errorMessage);
    } finally {
      setUpdating(false);
    }
  };

  const handleClose = useCallback(() => {
    // Reset all state
    setStep("verify");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setErrors({});
    setVerifyError("");
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    onClose();
  }, [onClose]);

  const handleBackToVerify = useCallback(() => {
    setStep("verify");
  }, []);

  // Memoized password strength calculations
  const passwordStrength = useMemo(() => {
    if (!newPassword) return 0;
    let strength = 0;
    if (newPassword.length >= 8) strength += 25;
    if (/[a-z]/.test(newPassword)) strength += 25;
    if (/[A-Z]/.test(newPassword)) strength += 25;
    if (/\d/.test(newPassword)) strength += 25;
    return strength;
  }, [newPassword]);

  const strengthColor = useMemo(() => {
    if (passwordStrength < 50) return THEME.colors.error;
    if (passwordStrength < 75) return "#FF8C00";
    return THEME.colors.success;
  }, [passwordStrength]);

  const strengthText = useMemo(() => {
    if (passwordStrength < 50) return "Weak";
    if (passwordStrength < 75) return "Good";
    return "Strong";
  }, [passwordStrength]);

  // Memoized password requirements
  const passwordRequirements = useMemo(
    () => [
      {
        text: "At least 8 characters",
        met: newPassword.length >= 8,
      },
      {
        text: "One lowercase letter",
        met: /[a-z]/.test(newPassword),
      },
      {
        text: "One uppercase letter",
        met: /[A-Z]/.test(newPassword),
      },
      { text: "One number", met: /\d/.test(newPassword) },
    ],
    [newPassword]
  );

  return (
    <Modal
      visible={isOpen}
      transparent={true}
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <StatusBar
        backgroundColor="rgba(0, 0, 0, 0.8)"
        barStyle="light-content"
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            justifyContent: "center",
            paddingHorizontal: 20,
          }}
        >
          <TouchableOpacity
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
            activeOpacity={1}
            onPress={handleClose}
          />

          {/* Modal Content */}
          <View
            style={{
              backgroundColor: THEME.colors.background,
              borderRadius: 20,
              maxWidth: 420,
              width: "100%",
              alignSelf: "center",
              maxHeight: screenHeight * 0.85,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.3,
              shadowRadius: 20,
              elevation: 12,
            }}
          >
            {/* Header Section */}
            <View
              style={{
                paddingHorizontal: 24,
                paddingTop: 28,
                paddingBottom: 20,
                alignItems: "center",
                borderBottomWidth: 1,
                borderBottomColor: THEME.colors.border + "25",
              }}
            >
              {/* Close Button */}
              <TouchableOpacity
                onPress={handleClose}
                style={{
                  position: "absolute",
                  top: 16,
                  right: 16,
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: THEME.colors.surfaceSecondary,
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 1,
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={20} color={THEME.colors.textSecondary} />
              </TouchableOpacity>

              {/* Security Icon */}
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: THEME.colors.primary + "15",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 18,
                }}
              >
                <Ionicons name="shield-checkmark-outline" size={32} color={THEME.colors.primary} />
              </View>

              {/* Title */}
              <Text
                style={{
                  fontSize: 24,
                  fontWeight: "700",
                  color: THEME.colors.text,
                  textAlign: "center",
                  marginBottom: 6,
                  lineHeight: 32,
                }}
              >
                {step === "verify" ? "Verify Identity" : "Create New Password"}
              </Text>

              {/* Subtitle */}
              <Text
                style={{
                  fontSize: 16,
                  color: THEME.colors.textSecondary,
                  textAlign: "center",
                  lineHeight: 22,
                  paddingHorizontal: 10,
                }}
              >
                {step === "verify"
                  ? "Enter your current password to continue"
                  : "Choose a strong password for your account"}
              </Text>
            </View>

            {/* Form Content */}
            <ScrollView
              contentContainerStyle={{
                padding: 24,
                minHeight: 220,
              }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {step === "verify" ? (
                // Step 1: Verify Current Password
                <View>
                  <PasswordInput
                    label="Current Password"
                    value={currentPassword}
                    onChangeText={handleCurrentPasswordChange}
                    placeholder="Enter your current password"
                    show={showCurrentPassword}
                    onToggleShow={toggleCurrentPassword}
                    error={verifyError}
                    autoFocus={true}
                  />

                  {/* Info Box */}
                  <View
                    style={{
                      backgroundColor: THEME.colors.primary + "10",
                      padding: 18,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: THEME.colors.primary + "20",
                      marginTop: 4,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 15,
                        color: THEME.colors.text,
                        textAlign: "center",
                        lineHeight: 22,
                        fontWeight: "500",
                      }}
                    >
                      🔐 We need to verify your identity before allowing you to
                      change your password.
                    </Text>
                  </View>
                </View>
              ) : (
                // Step 2: Create New Password
                <>
                  <PasswordInput
                    label="New Password"
                    value={newPassword}
                    onChangeText={handleNewPasswordChange}
                    placeholder="Enter your new password"
                    show={showNewPassword}
                    onToggleShow={toggleNewPassword}
                    error={errors.newPassword}
                    autoFocus={true}
                  />

                  {/* Password Strength Indicator */}
                  {newPassword.length > 0 && (
                    <View style={{ marginBottom: 20, marginTop: -12 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 10,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "600",
                            color: THEME.colors.textSecondary,
                          }}
                        >
                          Password Strength
                        </Text>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "700",
                            color: strengthColor,
                          }}
                        >
                          {strengthText}
                        </Text>
                      </View>
                      <View
                        style={{
                          height: 5,
                          backgroundColor: THEME.colors.border + "40",
                          borderRadius: 3,
                          overflow: "hidden",
                        }}
                      >
                        <View
                          style={{
                            height: "100%",
                            width: `${passwordStrength}%`,
                            backgroundColor: strengthColor,
                            borderRadius: 3,
                          }}
                        />
                      </View>
                    </View>
                  )}

                  <PasswordInput
                    label="Confirm New Password"
                    value={confirmPassword}
                    onChangeText={handleConfirmPasswordChange}
                    placeholder="Confirm your new password"
                    show={showConfirmPassword}
                    onToggleShow={toggleConfirmPassword}
                    error={errors.confirmPassword}
                  />

                  {/* Password Requirements */}
                  <View
                    style={{
                      backgroundColor: THEME.colors.surface,
                      padding: 18,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: THEME.colors.border + "30",
                      marginBottom: 4,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: "600",
                        color: THEME.colors.text,
                        marginBottom: 14,
                      }}
                    >
                      Password Requirements:
                    </Text>

                    {passwordRequirements.map((req, index) => (
                      <View
                        key={index}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          marginBottom: 10,
                        }}
                      >
                        <View
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 9,
                            backgroundColor: req.met
                              ? THEME.colors.success
                              : THEME.colors.border + "40",
                            alignItems: "center",
                            justifyContent: "center",
                            marginRight: 12,
                          }}
                        >
                          {req.met && (
                            <Ionicons name="checkmark-circle-outline" size={11} color="white" />
                          )}
                        </View>
                        <Text
                          style={{
                            fontSize: 14,
                            color: req.met
                              ? THEME.colors.success
                              : THEME.colors.textSecondary,
                            fontWeight: req.met ? "500" : "400",
                            lineHeight: 20,
                          }}
                        >
                          {req.text}
                        </Text>
                      </View>
                    ))}
                  </View>
                </>
              )}
            </ScrollView>

            {/* Action Buttons */}
            <View
              style={{
                paddingHorizontal: 24,
                paddingBottom: 24,
                paddingTop: 20,
                borderTopWidth: 1,
                borderTopColor: THEME.colors.border + "25",
              }}
            >
              {step === "verify" ? (
                // Step 1 Buttons
                <>
                  <TouchableOpacity
                    onPress={handleVerifyPassword}
                    disabled={verifying || !currentPassword.trim()}
                    style={{
                      backgroundColor:
                        verifying || !currentPassword.trim()
                          ? THEME.colors.primary + "60"
                          : THEME.colors.primary,
                      paddingVertical: 16,
                      borderRadius: 14,
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 14,
                      flexDirection: "row",
                    }}
                  >
                    <Text
                      style={{
                        color: "white",
                        fontSize: 17,
                        fontWeight: "600",
                        marginRight: verifying ? 0 : 8,
                      }}
                    >
                      {verifying ? "Verifying..." : "Continue"}
                    </Text>
                    {!verifying && <Ionicons name="arrow-forward-outline" size={20} color="white" />}
                  </TouchableOpacity>
                </>
              ) : (
                // Step 2 Buttons
                <>
                  <TouchableOpacity
                    onPress={handleUpdatePassword}
                    disabled={updating}
                    style={{
                      backgroundColor: updating
                        ? THEME.colors.primary + "60"
                        : THEME.colors.primary,
                      paddingVertical: 16,
                      borderRadius: 14,
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 14,
                    }}
                  >
                    <Text
                      style={{
                        color: "white",
                        fontSize: 17,
                        fontWeight: "600",
                      }}
                    >
                      {updating ? "Updating Password..." : "Update Password"}
                    </Text>
                  </TouchableOpacity>

                  {/* Back Button */}
                  <TouchableOpacity
                    onPress={handleBackToVerify}
                    disabled={updating}
                    style={{
                      backgroundColor: THEME.colors.surface,
                      paddingVertical: 14,
                      borderRadius: 14,
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 10,
                      borderWidth: 1,
                      borderColor: THEME.colors.border,
                    }}
                  >
                    <Text
                      style={{
                        color: THEME.colors.text,
                        fontSize: 15,
                        fontWeight: "500",
                      }}
                    >
                      Back to Verification
                    </Text>
                  </TouchableOpacity>
                </>
              )}

              {/* Cancel Button */}
              <TouchableOpacity
                onPress={handleClose}
                disabled={verifying || updating}
                style={{
                  backgroundColor: "transparent",
                  paddingVertical: 10,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    color: THEME.colors.textSecondary,
                    fontSize: 15,
                    fontWeight: "500",
                  }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
