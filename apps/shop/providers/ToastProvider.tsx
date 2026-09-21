import { createContext, useCallback, useContext, useRef, useState } from "react";
import { View } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@repo/mobile-ui/components/ui/text";

type ToastVariant = "default" | "destructive";

interface ToastState {
  id: number;
  message: string;
  variant: ToastVariant;
}

const DURATION_MS = 2600;

type ShowToast = (message: string, variant?: ToastVariant) => void;

const ToastContext = createContext<ShowToast | null>(null);

/**
 * A brief, ephemeral status line for the outcome of an action already
 * confirmed elsewhere (a dialog, a swipe) — not a place to ask a question.
 * One at a time: a second call replaces whatever is still showing rather
 * than queuing, since two feedback lines from two rapid actions is more
 * confusing than the older one just disappearing early.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const show = useCallback<ShowToast>((message, variant = "default") => {
    if (timer.current) clearTimeout(timer.current);
    const id = Date.now();
    setToast({ id, message, variant });
    timer.current = setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, DURATION_MS);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <Animated.View
          key={toast.id}
          entering={FadeInDown.duration(180)}
          exiting={FadeOutDown.duration(150)}
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            bottom: insets.bottom + 16,
            alignItems: "center",
          }}
        >
          <View
            className={
              toast.variant === "destructive"
                ? "bg-destructive px-space-5 py-space-3 rounded-pill shadow-lg max-w-[92%]"
                : "bg-inverse px-space-5 py-space-3 rounded-pill shadow-lg max-w-[92%]"
            }
          >
            <Text
              size="sm"
              weight="medium"
              numberOfLines={2}
              className={
                toast.variant === "destructive"
                  ? "text-destructive-foreground"
                  : "text-inverse-foreground"
              }
            >
              {toast.message}
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ShowToast {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast must be used within a ToastProvider");
  return show;
}
