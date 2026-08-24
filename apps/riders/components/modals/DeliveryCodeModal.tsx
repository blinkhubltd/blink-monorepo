import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from "react";
import {
  View,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Keyboard,
  Platform,
  Pressable,
} from "react-native";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { VStack } from "@/components/ui/vstack";
import { HStack } from "@/components/ui/hstack";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useMutation } from "convex/react";
import { api } from "@repo/backend";
import { Id } from "@repo/backend/dataModel";
import { THEME } from "@/theme/design";

interface DeliveryCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: Id<"orders"> | null;
  riderId?: Id<"users"> | null;
  onVerified: () => void;
  existingCode?: string | null;
}

const RESEND_COOLDOWN_MS = 30_000;

export function DeliveryCodeModal({
  isOpen,
  onClose,
  orderId,
  riderId,
  onVerified,
  existingCode,
}: DeliveryCodeModalProps) {
  const [code, setCode] = useState("");
  const [touched, setTouched] = useState(false);
  const [lastResendAt, setLastResendAt] = useState<number | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]); // visual only
  const compositeRef = useRef<TextInput | null>(null); // single hidden input
  const [hasVerifiedAttempted, setHasVerifiedAttempted] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["50%", "75%", "92%"], []);

  // Derive digits from code (single source of truth)
  useEffect(() => {
    const parts = code.split("");
    setDigits(Array.from({ length: 6 }, (_, i) => parts[i] || ""));
  }, [code]);

  const handleSheetChange = useCallback(
    (index: number) => {
      if (index === -1) onClose();
    },
    [onClose]
  );

  const validation = useQuery(
    api.data.orders.checkDeliveryCode,
    code.length === 6 && orderId ? { orderId, code } : "skip"
  );

  const resendMutation = useMutation(api.data.orders.resendDeliveryCode);
  const verifyMutation = useMutation(api.data.orders.verifyDeliveryCode);

  useEffect(() => {
    if (!isOpen) {
      setCode("");
      setTouched(false);
      setVerifying(false);
      setHasVerifiedAttempted(false);
      setKeyboardHeight(0);
      return;
    }
    const t = setTimeout(() => {
      compositeRef.current?.focus();
      sheetRef.current?.snapToIndex(1);
    }, 320);
    return () => clearTimeout(t);
  }, [isOpen]);

  useEffect(() => {
    const showEvent =
      Platform.OS === "android" ? "keyboardDidShow" : "keyboardWillShow";
    const hideEvent =
      Platform.OS === "android" ? "keyboardDidHide" : "keyboardWillHide";

    const showSub = Keyboard.addListener(showEvent, (e: any) => {
      setKeyboardHeight(e.endCoordinates?.height || 0);
      sheetRef.current?.snapToIndex(2);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
      sheetRef.current?.snapToIndex(1);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // No per-box focus logic needed with single composite input.

  const canResend =
    !lastResendAt || Date.now() - lastResendAt > RESEND_COOLDOWN_MS;
  const isValid = validation?.valid && validation?.reason === "valid";
  const alreadyVerified = validation?.reason === "already_verified";

  const handleResend = useCallback(async () => {
    if (!orderId || !canResend) return;
    try {
      await resendMutation({ orderId });
      setLastResendAt(Date.now());
      Alert.alert(
        "Code Sent",
        "The delivery code has been resent to the customer."
      );
    } catch (e: any) {
      Alert.alert("Resend Failed", e.message || "Unable to resend code.");
    }
  }, [orderId, canResend, resendMutation]);

  // Auto verify when code complete and valid
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (
        code.length === 6 &&
        (isValid || alreadyVerified) &&
        !verifying &&
        !hasVerifiedAttempted
      ) {
        setHasVerifiedAttempted(true);
        if (alreadyVerified) {
          if (!cancelled) {
            onVerified();
            onClose();
          }
          return;
        }
        if (!orderId || !isValid) return;
        try {
          setVerifying(true);
          const res = await verifyMutation({
            orderId,
            code,
            riderId: riderId || undefined,
          });
          if (!cancelled && res.verified) {
            onVerified();
            onClose();
          } else if (!cancelled && !res.verified) {
            setHasVerifiedAttempted(false);
          }
        } catch (e: any) {
          if (!cancelled) {
            setHasVerifiedAttempted(false);
            Alert.alert(
              "Verification Failed",
              e.message || "Unable to verify code."
            );
          }
        } finally {
          if (!cancelled) setVerifying(false);
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [
    code,
    isValid,
    alreadyVerified,
    verifying,
    hasVerifiedAttempted,
    orderId,
    riderId,
    verifyMutation,
    onVerified,
    onClose,
  ]);

  if (!isOpen) return null;

  return (
    <View style={styles.sheetContainer} pointerEvents="box-none">
      <BottomSheet
        ref={sheetRef}
        snapPoints={snapPoints}
        index={0}
        enablePanDownToClose
        onClose={onClose}
        onChange={handleSheetChange}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.handleIndicator}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
      >
        <BottomSheetView style={styles.innerContainer}>
          <View
            style={[
              styles.scrollContent,
              { paddingBottom: 40 + (keyboardHeight > 0 ? keyboardHeight : 0) },
            ]}
          >
            {/* Header */}
            <View style={styles.header}>
              <HStack style={styles.headerContent}>
                <VStack space="xs" style={{ flex: 1 }}>
                  <Text style={styles.title}>Verify Delivery</Text>
                  <Text style={styles.subtitle}>
                    Ask the customer for their secure 6-digit delivery code
                  </Text>
                </VStack>
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={onClose}
                  style={styles.closeButton}
                >
                  <Ionicons name="close" size={20} color={THEME.colors.textSecondary} />
                </Button>
              </HStack>
            </View>

            {/* Body */}
            <View style={styles.body}>
              {existingCode && (
                <HStack space="sm" style={styles.infoCard}>
                  <Ionicons name="shield-checkmark-outline" size={20} color={THEME.colors.primary} />
                  <Text style={styles.infoText}>
                    Secure code generated and sent to customer
                  </Text>
                </HStack>
              )}

              {/* Code Input Section */}
              <VStack space="xl" style={styles.codeSection}>
                <VStack space="xs" style={styles.codeHeader}>
                  <Text style={styles.codeTitle}>Enter 6-Digit Code</Text>
                  <Text style={styles.codeSubtitle}>
                    Customer will provide their verification code
                  </Text>
                </VStack>

                <Pressable
                  style={styles.digitBoxes}
                  onPress={() => {
                    compositeRef.current?.focus();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Enter delivery verification code"
                >
                  {digits.map((d, i) => {
                    const filled = d !== "";
                    return (
                      <View
                        key={i}
                        style={[
                          styles.digitBox,
                          {
                            borderColor: filled
                              ? code.length === 6 &&
                                (isValid || alreadyVerified)
                                ? THEME.colors.success
                                : THEME.colors.primary
                              : i === code.length
                                ? THEME.colors.primary
                                : THEME.colors.border,
                            backgroundColor: filled
                              ? THEME.colors.primary + "08"
                              : THEME.colors.surface,
                            shadowColor:
                              filled || i === code.length
                                ? THEME.colors.primary
                                : "transparent",
                            shadowOpacity:
                              filled || i === code.length ? 0.15 : 0,
                            elevation: filled || i === code.length ? 2 : 0,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 24,
                            fontWeight: "500",
                            lineHeight: 32,
                            color: filled ? THEME.colors.text : THEME.colors.textSecondary,
                            textAlign: "center",
                          }}
                        >
                          {filled ? d : "·"}
                        </Text>
                      </View>
                    );
                  })}
                  <TextInput
                    ref={compositeRef}
                    value={code}
                    keyboardType="number-pad"
                    maxLength={6}
                    textContentType="oneTimeCode"
                    autoComplete="one-time-code"
                    autoCapitalize="none"
                    onChangeText={(val) => {
                      setTouched(true);
                      const sanitized = val.replace(/[^0-9]/g, "").slice(0, 6);
                      setCode(sanitized);
                      if (sanitized.length === 6) Keyboard.dismiss();
                    }}
                    style={styles.hiddenInput}
                    onFocus={() => sheetRef.current?.snapToIndex(2)}
                    accessibilityLabel="Delivery verification code"
                    // Ensures Android shows keyboard even if nearly transparent
                    importantForAccessibility="yes"
                  />
                </Pressable>

                {/* Validation feedback */}
                <View style={styles.validationContainer}>
                  {code.length === 6 && (
                    <View style={styles.validationFeedback}>
                      {validation === undefined || verifying ? (
                        <HStack space="xs" style={styles.validationRow}>
                          <ActivityIndicator
                            size="small"
                            color={THEME.colors.primary}
                          />
                          <Text style={styles.validationTextSecondary}>
                            {verifying ? "Verifying..." : "Validating..."}
                          </Text>
                        </HStack>
                      ) : isValid ? (
                        <HStack space="xs" style={styles.validationRow}>
                          <View
                            style={[
                              styles.validationIcon,
                              { backgroundColor: THEME.colors.success },
                            ]}
                          >
                            <Text style={styles.validationIconText}>✓</Text>
                          </View>
                          <Text
                            style={[
                              styles.validationText,
                              { color: THEME.colors.success },
                            ]}
                          >
                            Verified
                          </Text>
                        </HStack>
                      ) : alreadyVerified ? (
                        <HStack space="xs" style={styles.validationRow}>
                          <View
                            style={[
                              styles.validationIcon,
                              { backgroundColor: THEME.colors.success },
                            ]}
                          >
                            <Text style={styles.validationIconText}>✓</Text>
                          </View>
                          <Text
                            style={[
                              styles.validationText,
                              { color: THEME.colors.success },
                            ]}
                          >
                            Already verified
                          </Text>
                        </HStack>
                      ) : (
                        <HStack space="xs" style={styles.validationRow}>
                          <View
                            style={[
                              styles.validationIcon,
                              { backgroundColor: THEME.colors.error },
                            ]}
                          >
                            <Text style={styles.validationIconText}>✗</Text>
                          </View>
                          <Text
                            style={[
                              styles.validationText,
                              { color: THEME.colors.error },
                            ]}
                          >
                            Invalid code
                          </Text>
                        </HStack>
                      )}
                    </View>
                  )}
                </View>
              </VStack>

              {/* Resend Section */}
              <View style={styles.resendSection}>
                <TouchableOpacity
                  disabled={!canResend}
                  onPress={handleResend}
                  style={[
                    styles.resendButton,
                    {
                      opacity: canResend ? 1 : 0.6,
                      backgroundColor: canResend
                        ? THEME.colors.primary + "12"
                        : THEME.colors.surface,
                      borderColor: canResend
                        ? THEME.colors.primary + "30"
                        : THEME.colors.border,
                    },
                  ]}
                >
                  <Ionicons name="refresh-outline" size={20} color={canResend ? THEME.colors.primary : THEME.colors.textSecondary} />
                  <Text
                    style={[
                      styles.resendText,
                      {
                        color: canResend ? THEME.colors.primary : THEME.colors.textSecondary,
                      },
                    ]}
                  >
                    {canResend
                      ? "Resend Code"
                      : `Resend in ${Math.ceil(
                          (RESEND_COOLDOWN_MS -
                            (Date.now() - (lastResendAt || 0))) /
                            1000
                        )}s`}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            {keyboardHeight > 0 && <View style={{ height: 8 }} />}
          </View>
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  sheetContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "flex-end",
  },
  innerContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  sheetBackground: {
    backgroundColor: THEME.colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  handleIndicator: {
    backgroundColor: THEME.colors.border,
    width: 64,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: THEME.colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: THEME.colors.textSecondary,
    lineHeight: 20,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: THEME.colors.surfaceSecondary,
    padding: 0,
  },
  body: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: THEME.colors.primary + "08",
    borderWidth: 1,
    borderColor: THEME.colors.primary + "20",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    marginBottom: 24,
    gap: 6,
  },
  infoText: {
    fontSize: 14,
    color: THEME.colors.primary,
    fontWeight: "600",
    flex: 1,
  },
  codeSection: {
    alignItems: "center",
  },
  codeHeader: {
    alignItems: "center",
  },
  codeTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: THEME.colors.text,
    textAlign: "center",
  },
  codeSubtitle: {
    fontSize: 14,
    color: THEME.colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  digitBoxes: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginVertical: 16,
    maxWidth: "100%",
    width: "100%",
    paddingHorizontal: 10,
    minHeight: 55,
  },
  digitBox: {
    width: 45,
    height: 55,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
  },
  validationContainer: {
    height: 32,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  validationFeedback: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  validationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  validationIcon: {
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  validationIconText: {
    color: "white",
    fontSize: 14,
    fontWeight: "700",
  },
  validationText: {
    fontWeight: "600",
    fontSize: 15,
  },
  validationTextSecondary: {
    color: THEME.colors.textSecondary,
    fontSize: 14,
  },
  resendSection: {
    alignItems: "center",
    marginTop: 20,
  },
  resendButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 16,
  },
  resendText: {
    fontSize: 15,
    fontWeight: "600",
  },
  hiddenInput: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.02, // keep focusable/visible enough for some Android OEMs
  },
});
