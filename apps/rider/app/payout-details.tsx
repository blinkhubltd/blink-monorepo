import { View } from "react-native";
import { Landmark, ShieldCheck } from "lucide-react-native";
import { Card } from "@repo/mobile-ui/components/ui/card";
import { Separator } from "@repo/mobile-ui/components/ui/separator";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { EmptyState } from "../components/EmptyState";
import { Screen } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader";
import { formatMoney } from "../lib/format";

/**
 * Payout destination and the last few payouts.
 *
 * The account itself is never editable from the crew app: changing a payout
 * destination is exactly the action an attacker wants, and the backend audit
 * found the payout chain unauthenticated. It is a hub-side operation with its
 * own verification, so this screen reads and never writes.
 */
interface Payout {
  id: string;
  paidAt: string;
  amount: number;
}

const PAYOUTS: Payout[] = [
  { id: "p1", paidAt: "Yesterday", amount: 8420 },
  { id: "p2", paidAt: "Last Friday", amount: 7960 },
];

/** Masked to the last four; the app never holds the full number. */
const ACCOUNT_MASK = "•••• 4821";
const BANK_NAME = "M-Pesa";

export default function PayoutDetailsRoute() {
  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Payout details" />
      <Screen>
        <View className="gap-space-4 pb-space-7">
          <Card className="gap-space-4">
            <View className="flex-row items-center gap-space-4">
              <View className="h-control w-control items-center justify-center rounded-pill bg-secondary">
                <Landmark size={20} strokeWidth={2} className="text-strong" />
              </View>
              <View className="flex-1">
                <Text weight="semibold" className="text-strong">
                  {BANK_NAME}
                </Text>
                <Text variant="muted" size="sm">
                  {ACCOUNT_MASK}
                </Text>
              </View>
            </View>
            <Separator />
            <View className="flex-row items-center gap-space-3">
              <ShieldCheck size={16} strokeWidth={2} className="text-success" />
              <Text variant="muted" size="sm" className="flex-1">
                Your hub manages this destination. Contact your hub lead to
                change it.
              </Text>
            </View>
          </Card>

          <Text variant="eyebrow" size="label">
            Recent payouts
          </Text>
          {PAYOUTS.length === 0 ? (
            <EmptyState
              icon={<Landmark size={32} strokeWidth={2} className="text-subtle" />}
              title="No payouts yet"
              body="Your first payout will appear here once your hub processes it."
            />
          ) : (
            <Card className="gap-space-4">
              {PAYOUTS.map((payout, i) => (
                <View key={payout.id} className="gap-space-3">
                  {i > 0 ? <Separator /> : null}
                  <View className="flex-row items-center justify-between">
                    <Text size="sm" variant="muted">
                      {payout.paidAt}
                    </Text>
                    <Text weight="semibold" size="sm" className="text-strong">
                      {formatMoney(payout.amount)}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
          )}
        </View>
      </Screen>
    </View>
  );
}
