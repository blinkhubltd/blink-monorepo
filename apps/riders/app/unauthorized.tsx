import React from "react";
import { View, StyleSheet, Image } from "react-native";
import { useRouter } from "expo-router";
import { useClerk } from "@clerk/clerk-expo";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Text } from "@/components/ui/text";
import { Button, ButtonText } from "@/components/ui/button";
import { THEME } from "@/theme/design";
import Ionicons from "@expo/vector-icons/Ionicons";

export default function UnauthorizedScreen() {
  const router = useRouter();
  const { signOut } = useClerk();

  const handleSignIn = async () => {
    await signOut();
    router.replace("/sign-in");
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Logo */}
        <Image
          source={require("@/assets/images/Blink-Riders-Icon-01.png")}
          style={styles.logo}
          resizeMode="contain"
        />

        {/* Icon */}
        <View style={styles.iconContainer}>
          <Ionicons name="shield-outline" size={40} color={THEME.colors.warning} />
        </View>

        {/* Text */}
        <View style={styles.textContainer}>
          <Text style={styles.heading}>Access Restricted</Text>
          <Text style={styles.description}>
            This app is exclusively for authorized Blink Riders and Pickers.
            Your account does not have the required role.
          </Text>
          <Text style={styles.hint}>
            Contact your administrator if you believe this is an error.
          </Text>
        </View>

        {/* Action */}
        <Button size="lg" style={styles.button} onPress={handleSignIn}>
          <ButtonText style={styles.buttonText}>
            Sign in with a different account
          </ButtonText>
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    gap: 24,
  },
  logo: {
    width: 96,
    height: 96,
    borderRadius: 16,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${THEME.colors.warning}15`,
    justifyContent: "center",
    alignItems: "center",
  },
  textContainer: {
    alignItems: "center",
    gap: 8,
  },
  heading: {
    textAlign: "center",
    color: THEME.colors.text,
    fontSize: 22,
    fontWeight: "800",
  },
  description: {
    textAlign: "center",
    fontSize: 15,
    color: THEME.colors.textSecondary,
    lineHeight: 22,
  },
  hint: {
    textAlign: "center",
    fontSize: 13,
    color: THEME.colors.textTertiary,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: THEME.colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    width: "100%",
  },
  buttonText: {
    color: THEME.buttonText.primary,
    fontWeight: "700",
    fontSize: 16,
  },
});
