import { HStack } from "./ui/hstack";
import { VStack } from "./ui/vstack";
import { Text, View } from "react-native";
import { THEME } from "@/theme/design";
import Ionicons from "@expo/vector-icons/Ionicons";

export const InfoItem = ({
  icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value?: string;
}) => {
  if (!value) return null;

  return (
    <HStack
      space="sm"
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 16,
        marginBottom: 14,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: THEME.colors.primary + "15",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 2,
        }}
      >
        <Ionicons name={icon as any} size={16} color={THEME.colors.primary} />
      </View>
      <VStack space="xs" style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 12,
            color: THEME.colors.textSecondary,
            fontWeight: "600",
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: THEME.colors.text,
            lineHeight: 20,
          }}
        >
          {value}
        </Text>
      </VStack>
    </HStack>
  );
};
