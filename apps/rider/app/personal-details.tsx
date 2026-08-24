import { View } from "react-native";
import { Card } from "@repo/mobile-ui/components/ui/card";
import { Separator } from "@repo/mobile-ui/components/ui/separator";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { Screen } from "../components/Screen";
import { ScreenHeader } from "../components/ScreenHeader";
import { useCrew } from "../providers/CrewProvider";
import { roleLabel } from "../lib/roles";

interface Field {
  label: string;
  value: string;
}

function FieldList({ fields }: { fields: Field[] }) {
  return (
    <Card className="gap-space-4">
      {fields.map((field, i) => (
        <View key={field.label} className="gap-space-3">
          {i > 0 ? <Separator /> : null}
          <View className="gap-space-1">
            <Text variant="eyebrow" size="label">
              {field.label}
            </Text>
            <Text weight="medium">{field.value}</Text>
          </View>
        </View>
      ))}
    </Card>
  );
}

/**
 * Read-only for now. Crew details are maintained by the hub, so editing them
 * from the app would need an approval flow that does not exist yet — showing
 * them without an edit affordance is honest; a disabled form is not.
 */
export default function PersonalDetailsRoute() {
  const { crew } = useCrew();

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Personal details" />
      <Screen>
        <View className="gap-space-4 pb-space-7">
          <FieldList
            fields={[
              { label: "Name", value: crew?.name ?? "—" },
              { label: "Role", value: crew ? roleLabel(crew.role) : "—" },
              { label: "Hub", value: crew?.hubName ?? "—" },
            ]}
          />
          <Text variant="muted" size="sm">
            Your hub maintains these details. Contact your hub lead to change
            anything here.
          </Text>
        </View>
      </Screen>
    </View>
  );
}
