import React, { useState } from "react";
import { View, TouchableOpacity, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { ScrollView } from "@/components/ui/scroll-view";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/auth";
import { useUserData } from "@/providers/DataProvider";
import { useMutation, useQuery } from "convex/react";
import { PhoneUpdateModal } from "@/components/modals/PhoneUpdateModal";
import { PasswordChangeModal } from "@/components/modals/PasswordChangeModal";
import { VendorDetailsModal } from "@/components/modals/VendorDetailsModal";
import { DocumentUploadModal } from "@/components/modals/DocumentUploadModal";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { api } from "@repo/backend";
import { isRider } from "@/lib/roles";
import { useTheme } from "@/theme/ThemeContext";
import { useColorMode } from "@/theme/ThemeContext";
import { MenuItem } from "@/components/ui/MenuItem";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ShiftInfoCard } from "@/components/profile/ShiftInfoCard";
import { DocumentsSection } from "@/components/profile/DocumentsSection";

export default function ProfileScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { colorMode, toggleColorMode } = useColorMode();
  const { user, signOut, getUserDisplayName, getUserEmail, getUserImage } = useAuth();
  const { currentUser } = useUserData();

  const [notifications, setNotifications] = useState(currentUser?.notifications ?? true);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [documentType, setDocumentType] = useState<"id" | "license">("id");

  React.useEffect(() => {
    if (currentUser?.notifications !== undefined) {
      setNotifications(currentUser.notifications);
    }
  }, [currentUser?.notifications]);

  const updateUserPhone = useMutation(api.user.users.updateUserPhone);
  const updateNotificationSettings = useMutation(api.user.users.updateNotificationSettings);
  const updateUserImage = useMutation(api.user.users.updateUserImage);

  const vendorDetails = useQuery(
    api.data.vendors.getVendorById,
    currentUser?.rider_details?.vendor_id
      ? { vendorId: currentUser.rider_details.vendor_id }
      : "skip",
  );

  const userDocuments = useQuery(
    api.data.files.getUserDocuments,
    currentUser?._id ? { userId: currentUser._id } : "skip",
  );

  const shiftStatus = useQuery(
    api.data.shift_utils.getUserShiftStatus,
    currentUser?._id ? { userId: currentUser._id } : "skip",
  );

  const currentDay = [
    "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
  ][new Date().getDay()];

  const todaySchedule =
    shiftStatus?.schedule?.weeklySchedule?.[
      currentDay as keyof typeof shiftStatus.schedule.weeklySchedule
    ];

  const getAccountCompletion = () => {
    let completed = 0;
    const total = isRider(currentUser?.roleName) ? 6 : 4;
    if (currentUser?.image) completed++;
    if (currentUser?.phone) completed++;
    if (getUserEmail()) completed++;
    if (currentUser?.first_name && currentUser?.last_name) completed++;
    if (isRider(currentUser?.roleName)) {
      if (userDocuments?.hasIdImage) completed++;
      if (userDocuments?.hasLicenseImage) completed++;
    }
    return Math.round((completed / total) * 100);
  };

  const handleImagePicker = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "We need camera permissions to update your profile photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled && currentUser && user) {
      try {
        const base64 = result.assets[0].base64;
        if (base64) {
          await user.setProfileImage({ file: `data:image/jpeg;base64,${base64}` });
          const updatedClerkUser = await user.reload();
          if (updatedClerkUser.imageUrl) {
            await updateUserImage({ userId: currentUser._id, image: updatedClerkUser.imageUrl });
          }
          Alert.alert("Success", "Profile photo updated!");
        } else {
          await updateUserImage({ userId: currentUser._id, image: result.assets[0].uri });
          Alert.alert("Success", "Profile photo updated locally!");
        }
      } catch {
        Alert.alert("Error", "Failed to update profile photo");
      }
    }
  };

  const handlePhoneUpdate = async (phone: string) => {
    if (!currentUser) throw new Error("User not found");
    await updateUserPhone({ userId: currentUser._id, phone });
  };

  const handleNotificationToggle = async (enabled: boolean) => {
    setNotifications(enabled);
    if (currentUser) {
      try {
        await updateNotificationSettings({ userId: currentUser._id, notifications: enabled });
      } catch {
        setNotifications(!enabled);
        Alert.alert("Error", "Failed to update notification settings");
      }
    }
  };

  const displayName = getUserDisplayName();
  const email = getUserEmail();
  const userImage = getUserImage() || currentUser?.image;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingVertical: 24,
          gap: 16,
          paddingBottom: theme.TAB_BOTTOM_PADDING,
        }}
        showsVerticalScrollIndicator={false}
      >
        <ProfileHeader
          displayName={displayName}
          userImage={userImage}
          roleName={currentUser?.roleName}
          isClearanceRider={currentUser?.rider_details?.is_clearance_rider}
          accountCompletion={getAccountCompletion()}
          onImagePress={handleImagePicker}
        />

        <ShiftInfoCard
          todaySchedule={todaySchedule}
          shiftMessage={shiftStatus?.message}
          onPress={() => router.push("/shift")}
        />

        {/* Account Settings */}
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
            <Text style={{ fontSize: 17, fontWeight: "700", color: theme.colors.text }}>
              Account Settings
            </Text>
          </View>

          <MenuItem icon="mail-outline" label="Email" subtitle={email ?? undefined} hideChevron />

          <MenuItem
            icon="call-outline"
            label="Phone"
            subtitle={currentUser?.phone || "Add phone number"}
            onPress={() => setShowPhoneModal(true)}
          />

          <MenuItem
            icon="notifications-outline"
            label="Notifications"
            subtitle="Push notifications"
            hideChevron
            rightElement={
              <Switch value={notifications} onValueChange={handleNotificationToggle} />
            }
          />

          <MenuItem
            icon="moon-outline"
            label="Appearance"
            subtitle={colorMode === "dark" ? "Dark mode" : "Light mode"}
            hideChevron
            rightElement={
              <Switch value={colorMode === "dark"} onValueChange={toggleColorMode} />
            }
          />

          <MenuItem
            icon="business-outline"
            label="Assigned Vendor"
            subtitle={
              currentUser?.rider_details?.vendor_id ? "View vendor details" : "No vendor assigned"
            }
            onPress={
              currentUser?.rider_details?.vendor_id ? () => setShowVendorModal(true) : undefined
            }
          />

          <MenuItem
            icon="key-outline"
            label="Change Password"
            subtitle="Update your password"
            onPress={() => setShowPasswordModal(true)}
            showBorder={false}
          />
        </View>

        {/* Documents — riders only */}
        {isRider(currentUser?.roleName) && (
          <DocumentsSection
            userDocuments={userDocuments}
            onUploadId={() => {
              setDocumentType("id");
              setShowDocumentModal(true);
            }}
            onUploadLicense={() => {
              setDocumentType("license");
              setShowDocumentModal(true);
            }}
          />
        )}

        {/* Support */}
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
            <Text style={{ fontSize: 17, fontWeight: "700", color: theme.colors.text }}>
              Support
            </Text>
          </View>
          <MenuItem
            icon="help-circle-outline"
            label="Help & Support"
            subtitle="Get help and contact support"
            onPress={() => {}}
          />
          <MenuItem
            icon="shield-outline"
            label="Safety"
            subtitle="Guidelines and emergency contacts"
            onPress={() => {}}
            showBorder={false}
          />
        </View>

        {/* Sign Out */}
        <TouchableOpacity
          onPress={() => {
            Alert.alert("Sign Out", "Are you sure you want to sign out?", [
              { text: "Cancel", style: "cancel" },
              { text: "Sign Out", style: "destructive", onPress: signOut },
            ]);
          }}
          activeOpacity={0.8}
          style={{
            backgroundColor: theme.colors.error + "10",
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: theme.colors.error + "30",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <Ionicons name="log-out-outline" size={18} color={theme.colors.error} />
          <Text style={{ color: theme.colors.error, fontSize: 15, fontWeight: "600" }}>
            Sign Out
          </Text>
        </TouchableOpacity>

        <Text
          style={{
            textAlign: "center",
            color: theme.colors.textSecondary,
            fontSize: 12,
            fontWeight: "500",
          }}
        >
          Blink Rider v1.0.0
        </Text>
      </ScrollView>

      <PhoneUpdateModal
        isOpen={showPhoneModal}
        onClose={() => setShowPhoneModal(false)}
        currentPhone={currentUser?.phone || ""}
        onSave={handlePhoneUpdate}
      />
      <PasswordChangeModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
      />
      <VendorDetailsModal
        isOpen={showVendorModal}
        onClose={() => setShowVendorModal(false)}
        vendor={vendorDetails}
      />
      <DocumentUploadModal
        isOpen={showDocumentModal}
        onClose={() => setShowDocumentModal(false)}
        userId={currentUser?._id || ""}
        documentType={documentType}
        currentImageUrl={
          documentType === "id" ? userDocuments?.id_image : userDocuments?.license_image
        }
        onUploadSuccess={() => {}}
      />
    </SafeAreaView>
  );
}
