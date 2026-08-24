import { useState, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@repo/backend";
import { Id } from "@repo/backend/dataModel";

interface UseDeliveryCodeOptions {
  orderId: Id<"orders"> | null;
  riderId?: Id<"users"> | null;
}

interface DeliveryCodeState {
  code: string;
  setCode: (c: string) => void;
  validation: { valid: boolean; reason: string } | undefined | null;
  verifying: boolean;
  resendCooldownMs: number;
  lastResendAt: number | null;
  canResend: boolean;
  handleResend: () => Promise<void>;
  handleVerify: () => Promise<{ verified: boolean; reason?: string } | null>;
  isValid: boolean;
  alreadyVerified: boolean;
}

const RESEND_COOLDOWN_MS = 30_000;

export function useDeliveryCode({
  orderId,
  riderId,
}: UseDeliveryCodeOptions): DeliveryCodeState {
  const [code, setCode] = useState("");
  const [lastResendAt, setLastResendAt] = useState<number | null>(null);
  const [verifying, setVerifying] = useState(false);

  const validation = useQuery(
    api.data.orders.checkDeliveryCode,
    code.length === 6 && orderId ? { orderId, code } : "skip"
  );

  const resendDeliveryCode = useMutation(api.data.orders.resendDeliveryCode);
  const verifyDeliveryCode = useMutation(api.data.orders.verifyDeliveryCode);

  const canResend =
    !lastResendAt || Date.now() - lastResendAt > RESEND_COOLDOWN_MS;
  const isValid =
    !!validation && validation.valid && validation.reason === "valid";
  const alreadyVerified = validation?.reason === "already_verified";

  const handleResend = useCallback(async () => {
    if (!orderId || !canResend) return;
    await resendDeliveryCode({ orderId });
    setLastResendAt(Date.now());
  }, [orderId, canResend, resendDeliveryCode]);

  const handleVerify = useCallback(async () => {
    if (!orderId || (!isValid && !alreadyVerified) || verifying) return null;
    try {
      setVerifying(true);
      const res = await verifyDeliveryCode({
        orderId,
        code,
        riderId: riderId || undefined,
      });
      return res;
    } finally {
      setVerifying(false);
    }
  }, [
    orderId,
    code,
    riderId,
    isValid,
    alreadyVerified,
    verifying,
    verifyDeliveryCode,
  ]);

  return {
    code,
    setCode: (val: string) => setCode(val.replace(/[^0-9]/g, "")),
    validation: validation ?? null,
    verifying,
    resendCooldownMs: RESEND_COOLDOWN_MS,
    lastResendAt,
    canResend,
    handleResend,
    handleVerify,
    isValid,
    alreadyVerified,
  };
}
