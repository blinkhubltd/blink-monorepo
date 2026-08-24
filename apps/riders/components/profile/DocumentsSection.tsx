import React from "react";
import { View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Text } from "@/components/ui/text";
import { MenuItem } from "@/components/ui/MenuItem";
import { useTheme } from "@/theme/ThemeContext";

interface UserDocuments {
  hasIdImage?: boolean;
  hasLicenseImage?: boolean;
}

interface DocumentsSectionProps {
  userDocuments?: UserDocuments | null;
  onUploadId: () => void;
  onUploadLicense: () => void;
}

export function DocumentsSection({
  userDocuments,
  onUploadId,
  onUploadLicense,
}: DocumentsSectionProps) {
  const theme = useTheme();
  const bothUploaded = userDocuments?.hasIdImage && userDocuments?.hasLicenseImage;

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: theme.colors.border,
        ...theme.shadow.card,
        overflow: "hidden",
      }}
    >
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 }}>
        <Text
          style={{
            fontSize: 17,
            fontWeight: "700",
            color: theme.colors.text,
          }}
        >
          Documents
        </Text>
      </View>

      <MenuItem
        icon="card-outline"
        label="ID Card"
        subtitle={userDocuments?.hasIdImage ? "ID card uploaded" : "Upload your ID card"}
        onPress={onUploadId}
        rightElement={
          <Ionicons
            name={userDocuments?.hasIdImage ? "checkmark-circle" : "alert-circle-outline"}
            size={20}
            color={userDocuments?.hasIdImage ? theme.colors.success : theme.colors.warning}
          />
        }
      />

      <MenuItem
        icon="document-text-outline"
        label="License"
        subtitle={
          userDocuments?.hasLicenseImage ? "License uploaded" : "Upload your license"
        }
        onPress={onUploadLicense}
        showBorder={bothUploaded ? false : true}
        rightElement={
          <Ionicons
            name={
              userDocuments?.hasLicenseImage
                ? "checkmark-circle"
                : "alert-circle-outline"
            }
            size={20}
            color={
              userDocuments?.hasLicenseImage
                ? theme.colors.success
                : theme.colors.warning
            }
          />
        }
      />

      {!bothUploaded && (
        <View
          style={{
            margin: 16,
            backgroundColor: theme.colors.warning + "12",
            padding: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.colors.warning + "30",
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 10,
          }}
        >
          <Ionicons
            name="warning-outline"
            size={18}
            color={theme.colors.warning}
            style={{ marginTop: 1 }}
          />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: theme.colors.warning,
                fontSize: 13,
                fontWeight: "600",
                marginBottom: 2,
              }}
            >
              Documents Required
            </Text>
            <Text
              style={{
                color: theme.colors.textSecondary,
                fontSize: 12,
                lineHeight: 17,
              }}
            >
              Upload your ID card and license to complete your rider profile and start
              accepting deliveries.
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
