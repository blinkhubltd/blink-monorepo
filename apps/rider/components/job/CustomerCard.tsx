import { View } from "react-native";
import { Icon } from "@repo/mobile-ui/components/ui/icon";
import { Text } from "@repo/mobile-ui/components/ui/text";

import { ContactButtons } from "./ContactButtons";
import { initials } from "../../lib/format";

/**
 * Who the order is for, how to reach them, and where the door is.
 *
 * `showContact` is off once a delivery is done: calling a customer about an
 * order that has already arrived is not something the screen should invite.
 * The customer's own instruction, when they left one, sits under the address
 * in the soft brand wash — it is the line a rider most needs at the gate.
 */
export function CustomerCard({
  name,
  phone,
  address,
  note,
  showContact = true,
  children,
}: {
  name: string;
  phone: string | null;
  address: string;
  note?: string | null;
  showContact?: boolean;
  /** Extra rows at the foot of the card, e.g. the rating on a delivered order. */
  children?: React.ReactNode;
}) {
  return (
    <View className="gap-[14px] rounded-lg border border-border bg-card p-space-5">
      <View className="flex-row items-center justify-between gap-space-4">
        <View className="flex-1 flex-row items-center gap-space-4">
          <View className="size-[44px] items-center justify-center rounded-pill bg-secondary">
            <Text size="base" weight="bold" className="text-strong">
              {initials(name)}
            </Text>
          </View>
          <View className="flex-1">
            <Text size="h4" weight="bold" numberOfLines={1} className="text-strong">
              {name}
            </Text>
            <Text size="sm" variant="subtle" numberOfLines={1}>
              {showContact ? (phone ?? "No number on file") : address}
            </Text>
          </View>
        </View>
        {showContact ? <ContactButtons phone={phone} name={name} /> : null}
      </View>

      {showContact ? (
        <View className="flex-row items-start gap-[10px] border-t border-border pt-[14px]">
          <View className="pt-[2px]">
            <Icon name="location-outline" size={17} tone="body" />
          </View>
          <Text size="sm" weight="semibold" className="flex-1 text-strong">
            {address}
          </Text>
        </View>
      ) : null}

      {showContact && note ? (
        <View className="rounded-md border border-blink-200 bg-accent px-[14px] py-space-4">
          <Text size="sm" className="text-foreground">
            &ldquo;{note}&rdquo;
          </Text>
        </View>
      ) : null}

      {children}
    </View>
  );
}
