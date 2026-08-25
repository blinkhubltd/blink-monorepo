import { ScrollView, View, RefreshControl, type ViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "@repo/mobile-ui/lib/utils";

interface ScreenProps extends ViewProps {
  /** Scrollable body. Set false for screens that centre their content. */
  scroll?: boolean;
  /**
   * Pull-to-refresh. Omit it and no refresh control is attached at all.
   *
   * Most screens omit it deliberately. Convex queries are live subscriptions, so
   * the data is already current and there is nothing for a pull to fetch — the
   * reference app rendered a spinner tied to a setTimeout, which is the same
   * gesture doing the same nothing, just less honestly. Pass onRefresh only
   * where there is a real non-reactive action to run.
   */
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
  /** Leaves room for the bottom nav on tab screens. */
  withTabBar?: boolean;
  contentClassName?: string;
}

export function Screen({
  children,
  className,
  contentClassName,
  scroll = true,
  onRefresh,
  refreshing = false,
  withTabBar = false,
  ...props
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const paddingBottom = (withTabBar ? 72 : 0) + Math.max(insets.bottom, 16);

  if (!scroll) {
    return (
      <View
        className={cn("flex-1 bg-background", className)}
        style={{ paddingBottom }}
        {...props}
      >
        {children}
      </View>
    );
  }

  return (
    <ScrollView
      className={cn("flex-1 bg-background", className)}
      contentContainerClassName={cn("px-screen", contentClassName)}
      contentContainerStyle={{ paddingBottom }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#FFC50B"
            colors={["#FFC50B"]}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
}
