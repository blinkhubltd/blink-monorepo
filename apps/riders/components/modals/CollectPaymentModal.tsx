import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  TouchableOpacity,
  Alert,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Modal,
  StatusBar,
  StyleSheet,
} from "react-native";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { HStack } from "@/components/ui/hstack";
import { Button, ButtonText } from "@/components/ui/button";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery, useAction } from "convex/react";
import { api } from "@repo/backend";
import { Id } from "@repo/backend/dataModel";
import { THEME } from "@/theme/design";

interface CollectPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: Id<"orders"> | null;
  customerEmail: string | null;
  customerPhone?: string | null;
  receiverPhone?: string | null;
  receiverEmail?: string | null;
  amount: number;
}

/** Normalize a Kenyan phone to +254XXXXXXXXX (no spaces). Returns raw input if not parseable. */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.startsWith("0") && digits.length === 10)
    return `+254${digits.substring(1)}`;
  if (digits.startsWith("254") && digits.length === 12) return `+${digits}`;
  if (raw.startsWith("+254") && digits.length === 12) return `+${digits}`;
  return raw.trim();
}

/** Format phone for display: +254 712 345 678 */
function formatPhoneDisplay(raw: string): string {
  const norm = normalizePhone(raw);
  const match = norm.match(/^\+254(\d{3})(\d{3})(\d{3})$/);
  if (match) return `+254 ${match[1]} ${match[2]} ${match[3]}`;
  return norm;
}

/** Validate Kenyan phone (10 local or +254 international). */
function isValidKenyanPhone(raw: string): boolean {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.startsWith("0") && digits.length === 10) return true;
  if (digits.startsWith("254") && digits.length === 12) return true;
  return false;
}

export const CollectPaymentModal: React.FC<CollectPaymentModalProps> = ({
  isOpen,
  onClose,
  orderId,
  customerEmail,
  customerPhone,
  receiverPhone,
  receiverEmail,
  amount,
}) => {
  type VerifyResult = {
    verified: boolean;
    providerStatus?: string;
    reference: string;
    skipped?: boolean;
  };

  type PayerType = "receiver" | "customer";

  const [payerType, setPayerType] = useState<PayerType>(
    receiverPhone ? "receiver" : "customer",
  );
  const [phoneInput, setPhoneInput] = useState<string>("");
  const [isPhoneEditing, setIsPhoneEditing] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const phoneRef = useRef<TextInput>(null);

  const [reference, setReference] = useState<string | null>(null);
  const [phase, setPhase] = useState<
    "select" | "initiating" | "pending" | "verifying" | "success" | "failed"
  >("select");
  const [polling, setPolling] = useState(false);
  const [lastVerifyAttempt, setLastVerifyAttempt] = useState<number | null>(
    null,
  );
  const [receiverEmailInput, setReceiverEmailInput] = useState<string>("");
  const [providerStatus, setProviderStatus] = useState<string | null>(null);

  const initiate = useAction(api.data.payments.initiatePaystackTransactionAction);
  const verify = useAction(api.data.payments.verifyPaystack);
  const paymentRecord = useQuery(
    api.data.payments.getPaymentByReference,
    reference ? { reference } : "skip",
  );

  // Sync payer selection → phone input
  useEffect(() => {
    const phone =
      payerType === "receiver" && receiverPhone
        ? receiverPhone
        : customerPhone || "";
    setPhoneInput(formatPhoneDisplay(phone));
    setPhoneError(null);
    setIsPhoneEditing(false);
  }, [payerType, receiverPhone, customerPhone]);

  // Default payer type on open
  useEffect(() => {
    setPayerType(receiverPhone ? "receiver" : "customer");
  }, [receiverPhone]);

  useEffect(() => {
    if (receiverPhone && payerType === "receiver") {
      setReceiverEmailInput(receiverEmail?.trim() || "");
    }
  }, [receiverPhone, payerType, receiverEmail]);

  const validateAndNormalize = (): string | null => {
    const raw = phoneInput.replace(/\s+/g, "");
    if (!isValidKenyanPhone(raw)) {
      setPhoneError("Enter a valid Kenyan phone number (e.g. 0712345678)");
      return null;
    }
    setPhoneError(null);
    return normalizePhone(raw);
  };

  const startPayment = useCallback(async () => {
    if (!orderId || !customerEmail) return;
    const normalized = validateAndNormalize();
    if (!normalized) return;

    const effectiveEmail =
      payerType === "receiver"
        ? receiverEmailInput.trim() ||
          `${normalized.replace(/[^0-9]/g, "")}@receiver.local`
        : customerEmail;
    try {
      setPhase("initiating");
      const resp = await initiate({
        orderId: orderId as Id<"orders">,
        payerEmail: effectiveEmail,
        payerPhone: normalized,
        channel: "mobile_money",
        payerType,
      });
      setReference(resp.reference);
      setPhase("pending");
      setPolling(true);
      Alert.alert(
        "Payment Request Sent",
        `An M-PESA prompt has been sent to ${formatPhoneDisplay(normalized)}. Ask them to check their phone and enter their PIN.`,
      );
    } catch (e: any) {
      setPhase("failed");
      Alert.alert("Payment Error", e.message || "Failed to initiate payment");
    }
  }, [
    orderId,
    customerEmail,
    phoneInput,
    payerType,
    initiate,
    receiverEmailInput,
  ]);

  useEffect(() => {
    if (!reference || !paymentRecord) return;
    if (phase === "pending") {
      if (paymentRecord.status === "Successful") setPhase("success");
      else if (paymentRecord.status === "Failed") setPhase("failed");
    }
  }, [paymentRecord, phase, reference]);

  // Poll every 10s (Paystack recommends ≥10s for pending charges), max 12 attempts (2 min)
  useEffect(() => {
    if (!polling || phase !== "pending" || !reference) return;
    let attempts = 0;
    const MAX_ATTEMPTS = 12;
    const interval = setInterval(async () => {
      attempts += 1;
      setLastVerifyAttempt(Date.now());
      try {
        const res = (await verify({ reference })) as VerifyResult;
        if (res.providerStatus) setProviderStatus(res.providerStatus);
      } catch (e) {}
      if (
        attempts >= MAX_ATTEMPTS ||
        (paymentRecord && paymentRecord.status !== "Pending")
      ) {
        clearInterval(interval);
        setPolling(false);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [polling, phase, reference, verify, paymentRecord]);

  const manualVerify = async () => {
    if (!reference) return;
    try {
      setPhase("verifying");
      const res = (await verify({ reference })) as VerifyResult;
      if (res.providerStatus) setProviderStatus(res.providerStatus);
      setPhase(res.verified ? "success" : "failed");
    } catch (e: any) {
      setPhase("failed");
      Alert.alert("Verification Failed", e.message || "Unable to verify");
    }
  };

  const handleClose = () => {
    setPhase("select");
    setReference(null);
    setPolling(false);
    setProviderStatus(null);
    setPayerType(receiverPhone ? "receiver" : "customer");
    setReceiverEmailInput("");
    setPhoneError(null);
    setIsPhoneEditing(false);
    onClose();
  };

  return (
    <Modal
      visible={isOpen}
      transparent={true}
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <StatusBar barStyle="light-content" />
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconBadge}>
                <Ionicons name="wallet-outline" size={18} color="white" />
              </View>
              <View>
                <Text style={styles.headerTitle}>Collect Payment</Text>
                <Text style={styles.headerSubtitle}>
                  Complete order delivery
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={handleClose}
              style={styles.closeButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name="close"
                size={20}
                color={THEME.colors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body}>
            <View style={styles.bodyContent}>
              {phase === "select" && (
                <VStack space="lg">
                  {/* Amount Display */}
                  <View style={styles.amountCard}>
                    <View style={styles.amountLabelRow}>
                      <Ionicons
                        name="cube-outline"
                        size={16}
                        color={THEME.colors.textTertiary}
                      />
                      <Text style={styles.amountLabel}>Order Amount</Text>
                    </View>
                    <Text style={styles.amountValue}>
                      KES {amount.toFixed(2)}
                    </Text>
                  </View>

                  {/* Payer Toggle Chips */}
                  {receiverPhone && customerPhone && (
                    <View>
                      <Text style={styles.sectionLabel}>Who will pay?</Text>
                      <View style={styles.payerToggleRow}>
                        <TouchableOpacity
                          onPress={() => setPayerType("receiver")}
                          style={[
                            styles.payerChip,
                            payerType === "receiver" && styles.payerChipActive,
                          ]}
                          activeOpacity={0.7}
                        >
                          <View style={styles.payerChipInner}>
                            <Ionicons
                              name="person-outline"
                              size={15}
                              color={
                                payerType === "receiver"
                                  ? THEME.colors.primary
                                  : THEME.colors.textTertiary
                              }
                            />
                            <Text
                              style={[
                                styles.payerChipText,
                                payerType === "receiver" &&
                                  styles.payerChipTextActive,
                              ]}
                            >
                              Recipient
                            </Text>
                          </View>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setPayerType("customer")}
                          style={[
                            styles.payerChip,
                            payerType === "customer" && styles.payerChipActive,
                          ]}
                          activeOpacity={0.7}
                        >
                          <View style={styles.payerChipInner}>
                            <Ionicons
                              name="person-outline"
                              size={15}
                              color={
                                payerType === "customer"
                                  ? THEME.colors.primary
                                  : THEME.colors.textTertiary
                              }
                            />
                            <Text
                              style={[
                                styles.payerChipText,
                                payerType === "customer" &&
                                  styles.payerChipTextActive,
                              ]}
                            >
                              Customer
                            </Text>
                          </View>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {/* Phone Number Input */}
                  <View>
                    <Text style={styles.sectionLabel}>
                      M-PESA Phone Number
                    </Text>
                    <View
                      style={[
                        styles.phoneInputWrapper,
                        isPhoneEditing && styles.phoneInputWrapperFocused,
                        phoneError && styles.phoneInputWrapperError,
                      ]}
                    >
                      <Ionicons
                        name="call-outline"
                        size={16}
                        color={THEME.colors.textSecondary}
                        style={{ marginRight: 8 }}
                      />
                      <TextInput
                        ref={phoneRef}
                        value={phoneInput}
                        onChangeText={(text) => {
                          setPhoneInput(text);
                          setPhoneError(null);
                        }}
                        editable={isPhoneEditing}
                        keyboardType="phone-pad"
                        placeholder="+254 712 345 678"
                        placeholderTextColor={THEME.colors.textTertiary}
                        onBlur={() => {
                          // Auto-format on blur
                          const raw = phoneInput.replace(/\s+/g, "");
                          if (raw) setPhoneInput(formatPhoneDisplay(raw));
                        }}
                        style={styles.phoneInput}
                      />
                      <TouchableOpacity
                        onPress={() => {
                          if (isPhoneEditing) {
                            // Done editing — format
                            const raw = phoneInput.replace(/\s+/g, "");
                            if (raw) setPhoneInput(formatPhoneDisplay(raw));
                            setIsPhoneEditing(false);
                          } else {
                            setIsPhoneEditing(true);
                            setTimeout(() => phoneRef.current?.focus(), 100);
                          }
                        }}
                        style={styles.phoneEditButton}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        {isPhoneEditing ? (
                          <Ionicons
                            name="checkmark-circle-outline"
                            size={18}
                            color={THEME.colors.primary}
                          />
                        ) : (
                          <Ionicons
                            name="create-outline"
                            size={16}
                            color={THEME.colors.textTertiary}
                          />
                        )}
                      </TouchableOpacity>
                    </View>
                    {phoneError && (
                      <View style={styles.errorRow}>
                        <Ionicons
                          name="alert-circle-outline"
                          size={13}
                          color={THEME.colors.error}
                        />
                        <Text style={styles.errorText}>{phoneError}</Text>
                      </View>
                    )}
                    <Text style={styles.helperText}>
                      An M-PESA prompt will be sent to this number
                    </Text>
                  </View>

                  {/* Email Input for Receiver */}
                  {payerType === "receiver" && receiverPhone && (
                    <View>
                      <Text style={styles.sectionLabel}>
                        Recipient Email (Optional)
                      </Text>
                      <TextInput
                        value={receiverEmailInput}
                        onChangeText={setReceiverEmailInput}
                        placeholder="email@example.com"
                        placeholderTextColor={THEME.colors.textTertiary}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        style={styles.emailInput}
                      />
                      <Text style={styles.helperText}>
                        A temporary email will be generated if left blank
                      </Text>
                    </View>
                  )}

                  {/* Action Button */}
                  <Button onPress={startPayment} style={styles.primaryButton}>
                    <ButtonText style={styles.primaryButtonText}>
                      Request Payment
                    </ButtonText>
                  </Button>
                </VStack>
              )}

              {phase === "initiating" && (
                <View style={styles.centeredPhase}>
                  <ActivityIndicator size="large" color={THEME.colors.primary} />
                  <Text style={styles.phaseText}>
                    Sending Payment Request...
                  </Text>
                  <Text style={styles.phaseSubtext}>
                    Please wait while we initiate the payment
                  </Text>
                </View>
              )}

              {phase === "pending" && (
                <VStack space="md">
                  <View style={styles.pendingCard}>
                    <View style={styles.pendingHeaderRow}>
                      <ActivityIndicator color={THEME.colors.warning} />
                      <Text style={styles.pendingTitle}>
                        Awaiting Payment Approval
                      </Text>
                    </View>
                    <Text style={styles.pendingBody}>
                      M-PESA payment request sent to{" "}
                      <Text style={styles.pendingBodyBold}>
                        {formatPhoneDisplay(phoneInput)}
                      </Text>
                      . Please ask them to check their phone and enter their
                      M-PESA PIN to approve.
                    </Text>
                  </View>

                  {reference && (
                    <View style={styles.referenceBox}>
                      <Text style={styles.referenceLabel}>
                        Transaction Reference
                      </Text>
                      <Text style={styles.referenceValue}>{reference}</Text>
                    </View>
                  )}

                  {providerStatus && (
                    <View style={styles.statusRow}>
                      <Text style={styles.statusText}>
                        Status: {providerStatus}
                      </Text>
                    </View>
                  )}

                  <View style={styles.dualButtonRow}>
                    <Button
                      onPress={manualVerify}
                      style={styles.secondaryButton}
                    >
                      <ButtonText style={styles.secondaryButtonText}>
                        Check Status
                      </ButtonText>
                    </Button>
                    <Button
                      onPress={() => {
                        setPhase("select");
                        setReference(null);
                        setPolling(false);
                        setProviderStatus(null);
                      }}
                      style={styles.outlineButton}
                    >
                      <ButtonText style={styles.outlineButtonText}>
                        Try Different Number
                      </ButtonText>
                    </Button>
                  </View>
                </VStack>
              )}

              {phase === "verifying" && (
                <View style={styles.centeredPhase}>
                  <ActivityIndicator size="large" color={THEME.colors.primary} />
                  <Text style={styles.phaseText}>Verifying Payment...</Text>
                  {providerStatus && (
                    <Text style={styles.phaseSubtext}>
                      Status: {providerStatus}
                    </Text>
                  )}
                </View>
              )}

              {phase === "success" && (
                <View style={styles.resultPhase}>
                  <View style={styles.resultIconCircleSuccess}>
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={36}
                      color={THEME.colors.success}
                    />
                  </View>
                  <Text style={styles.resultTitleSuccess}>
                    Payment Received!
                  </Text>
                  <Text style={styles.resultBody}>
                    Successfully collected{" "}
                    <Text style={styles.resultBodyBold}>
                      KES {amount.toFixed(2)}
                    </Text>{" "}
                    for this delivery.
                  </Text>
                  {reference && (
                    <View style={[styles.referenceBox, { width: "100%" }]}>
                      <Text style={styles.referenceLabel}>
                        Transaction Reference
                      </Text>
                      <Text style={styles.referenceValue}>{reference}</Text>
                    </View>
                  )}
                  <Button onPress={handleClose} style={styles.resultButton}>
                    <ButtonText style={styles.resultButtonText}>
                      Complete Delivery
                    </ButtonText>
                  </Button>
                </View>
              )}

              {phase === "failed" && (
                <View style={styles.resultPhase}>
                  <View style={styles.resultIconCircleError}>
                    <Ionicons
                      name="alert-circle-outline"
                      size={36}
                      color={THEME.colors.error}
                    />
                  </View>
                  <Text style={styles.resultTitleError}>Payment Failed</Text>
                  <Text style={styles.resultBody}>
                    {providerStatus === "abandoned"
                      ? "The customer did not complete the payment prompt sent to their phone. Please ask them to try again and enter their M-PESA PIN."
                      : "The payment could not be completed. Please verify with the customer and try again."}
                  </Text>
                  {providerStatus && (
                    <View style={[styles.referenceBox, { width: "100%" }]}>
                      <Text style={styles.referenceLabel}>
                        Reason from Paystack
                      </Text>
                      <Text style={[styles.referenceValue, styles.capitalize]}>
                        {providerStatus}
                      </Text>
                    </View>
                  )}
                  <View style={styles.dualButtonRow}>
                    <Button
                      onPress={() => {
                        setPhase("select");
                        setReference(null);
                        setPolling(false);
                        setProviderStatus(null);
                      }}
                      style={styles.secondaryButton}
                    >
                      <ButtonText style={styles.secondaryButtonText}>
                        Try Again
                      </ButtonText>
                    </Button>
                    <Button onPress={handleClose} style={styles.outlineButton}>
                      <ButtonText style={styles.outlineButtonText}>
                        Close
                      </ButtonText>
                    </Button>
                  </View>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  card: {
    backgroundColor: THEME.colors.surface,
    width: "100%",
    maxWidth: 440,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: THEME.colors.border,
    ...THEME.shadow.card,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: THEME.colors.primary + "15",
    paddingHorizontal: THEME.spacing.xl,
    paddingVertical: THEME.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: THEME.spacing.md,
    flexShrink: 1,
  },
  headerIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: THEME.colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: THEME.colors.text,
  },
  headerSubtitle: {
    fontSize: 12,
    color: THEME.colors.textTertiary,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: THEME.colors.surfaceSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  body: {
    maxHeight: 520,
  },
  bodyContent: {
    padding: THEME.spacing.xl,
  },
  amountCard: {
    backgroundColor: THEME.colors.surfaceSecondary,
    padding: THEME.spacing.lg,
    borderRadius: THEME.radius.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  amountLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: THEME.spacing.sm,
    marginBottom: THEME.spacing.sm,
  },
  amountLabel: {
    fontSize: 13,
    color: THEME.colors.textTertiary,
    fontWeight: "600",
  },
  amountValue: {
    fontSize: 28,
    fontWeight: "800",
    color: THEME.colors.text,
    letterSpacing: -0.5,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: THEME.colors.text,
    marginBottom: THEME.spacing.sm,
  },
  payerToggleRow: {
    flexDirection: "row",
    gap: THEME.spacing.sm,
  },
  payerChip: {
    flex: 1,
    paddingVertical: THEME.spacing.sm,
    paddingHorizontal: THEME.spacing.md,
    borderRadius: THEME.radius.sm,
    borderWidth: 2,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.surface,
    alignItems: "center",
  },
  payerChipActive: {
    borderColor: THEME.colors.primary,
    backgroundColor: THEME.colors.primary + "15",
  },
  payerChipInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: THEME.spacing.xs + 2,
  },
  payerChipText: {
    fontSize: 14,
    fontWeight: "600",
    color: THEME.colors.textSecondary,
  },
  payerChipTextActive: {
    color: THEME.colors.primary,
  },
  phoneInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderColor: THEME.colors.border,
    borderRadius: THEME.radius.md,
    backgroundColor: THEME.colors.surfaceSecondary,
    paddingLeft: THEME.spacing.md,
  },
  phoneInputWrapperFocused: {
    borderColor: THEME.colors.primary,
    backgroundColor: THEME.colors.surface,
  },
  phoneInputWrapperError: {
    borderColor: THEME.colors.error,
  },
  phoneInput: {
    flex: 1,
    paddingVertical: THEME.spacing.md,
    fontSize: 16,
    fontWeight: "700",
    color: THEME.colors.text,
    letterSpacing: 0.3,
  },
  phoneEditButton: {
    padding: THEME.spacing.md,
    justifyContent: "center",
    alignItems: "center",
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: THEME.spacing.xs,
    marginTop: THEME.spacing.xs,
  },
  errorText: {
    fontSize: 12,
    color: THEME.colors.error,
    lineHeight: 16,
  },
  helperText: {
    fontSize: 11,
    color: THEME.colors.textTertiary,
    marginTop: THEME.spacing.xs,
    lineHeight: 16,
  },
  emailInput: {
    borderWidth: 1,
    borderColor: THEME.colors.border,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.md,
    borderRadius: THEME.radius.md,
    fontSize: 14,
    color: THEME.colors.text,
    backgroundColor: THEME.colors.surface,
  },
  primaryButton: {
    backgroundColor: THEME.colors.primary,
    height: 48,
    borderRadius: THEME.radius.md,
    marginTop: THEME.spacing.sm,
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  primaryButtonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 15,
    textAlign: "center",
  },
  centeredPhase: {
    alignItems: "center",
    paddingVertical: THEME.spacing.xxl,
    gap: THEME.spacing.md,
  },
  phaseText: {
    fontSize: 15,
    fontWeight: "600",
    color: THEME.colors.text,
    textAlign: "center",
  },
  phaseSubtext: {
    fontSize: 13,
    color: THEME.colors.textTertiary,
    textAlign: "center",
  },
  pendingCard: {
    backgroundColor: THEME.colors.warning + "20",
    padding: THEME.spacing.lg,
    borderRadius: THEME.radius.md,
    borderLeftWidth: 4,
    borderLeftColor: THEME.colors.warning,
  },
  pendingHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: THEME.spacing.md,
    marginBottom: THEME.spacing.sm,
  },
  pendingTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: THEME.colors.text,
    flexShrink: 1,
  },
  pendingBody: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    lineHeight: 20,
  },
  pendingBodyBold: {
    fontWeight: "700",
  },
  referenceBox: {
    backgroundColor: THEME.colors.surfaceSecondary,
    padding: THEME.spacing.md,
    borderRadius: THEME.radius.sm,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  referenceLabel: {
    fontSize: 12,
    color: THEME.colors.textTertiary,
    marginBottom: THEME.spacing.xs,
  },
  referenceValue: {
    fontSize: 13,
    fontWeight: "600",
    color: THEME.colors.text,
    fontFamily: "monospace",
  },
  capitalize: {
    textTransform: "capitalize",
  },
  statusRow: {
    alignItems: "center",
    paddingVertical: THEME.spacing.xs,
  },
  statusText: {
    fontSize: 12,
    color: THEME.colors.textTertiary,
  },
  dualButtonRow: {
    flexDirection: "row",
    gap: THEME.spacing.md,
    marginTop: THEME.spacing.sm,
    width: "100%",
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: THEME.colors.primary,
    height: 44,
    borderRadius: THEME.radius.md,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 14,
    textAlign: "center",
  },
  outlineButton: {
    flex: 1,
    backgroundColor: THEME.colors.surfaceSecondary,
    height: 44,
    borderRadius: THEME.radius.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  outlineButtonText: {
    color: THEME.colors.text,
    fontWeight: "600",
    fontSize: 14,
    textAlign: "center",
  },
  resultPhase: {
    alignItems: "center",
    paddingVertical: THEME.spacing.xl,
    gap: THEME.spacing.md,
  },
  resultIconCircleSuccess: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: THEME.colors.success + "20",
    justifyContent: "center",
    alignItems: "center",
  },
  resultIconCircleError: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: THEME.colors.error + "20",
    justifyContent: "center",
    alignItems: "center",
  },
  resultTitleSuccess: {
    fontSize: 19,
    fontWeight: "800",
    color: THEME.colors.success,
    textAlign: "center",
  },
  resultTitleError: {
    fontSize: 19,
    fontWeight: "800",
    color: THEME.colors.error,
    textAlign: "center",
  },
  resultBody: {
    fontSize: 14,
    color: THEME.colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: THEME.spacing.sm,
  },
  resultBodyBold: {
    fontWeight: "700",
  },
  resultButton: {
    backgroundColor: THEME.colors.success,
    height: 48,
    borderRadius: THEME.radius.md,
    marginTop: THEME.spacing.sm,
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  resultButtonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 15,
    textAlign: "center",
  },
});
