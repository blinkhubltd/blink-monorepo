import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  StatusBar,
  Alert,
  Image as RNImage,
  Platform,
} from "react-native";
import { VStack } from "@/components/ui/vstack";
import { HStack } from "@/components/ui/hstack";
import { Button, ButtonText } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Card } from "@/components/ui/card";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSignIn, useOAuth, useUser } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { KeyboardAvoidingView } from "@/components/ui/keyboard-avoiding-view";
import { ScrollView } from "@/components/ui/scroll-view";
import { Spinner } from "@/components/ui/spinner";
import { GoogleIcon } from "@/components/icons/GoogleIcon";
import { LinearGradient } from "expo-linear-gradient";
import { THEME } from "@/theme/design";
import { isRider, isPicker } from "@/lib/roles";

export default function SignInPage() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const { startOAuthFlow } = useOAuth({
    strategy: "oauth_google",
  });
  const { user: clerkUser } = useUser();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingRole, setCheckingRole] = useState(false);
  const [showAccessDenied, setShowAccessDenied] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  // Query user role from Convex when we have a signed-in user
  const convexUser = useQuery(
    api.user.users.getCurrentUser,
    clerkUser?.id
      ? {
          clerkId: clerkUser.id,
        }
      : "skip",
  );
  const userRole = useQuery(
    api.user.users.getUserRole,
    email
      ? {
          email,
        }
      : "skip",
  );

  // Check role when user data is loaded after successful authentication
  React.useEffect(() => {
    if (clerkUser?.id && convexUser !== undefined) {
      if (!convexUser) {
        // User not found in Convex database
        setShowAccessDenied(true);
        setLoading(false);
        return;
      }
      if (!isRider(convexUser.roleName) && !isPicker(convexUser.roleName)) {
        // User exists but doesn't have Rider or Picker role
        setShowAccessDenied(true);
        setLoading(false);
        return;
      }

      // Route based on role
      if (isRider(convexUser.roleName)) {
        router.replace("/(tabs)/deliveries");
      } else if (isPicker(convexUser.roleName)) {
        router.replace("/(picker-tabs)/orders");
      }
      setLoading(false);
    }
  }, [convexUser, clerkUser, checkingRole, router]);
  const handleEmailSignIn = async () => {
    if (!isLoaded) return;
    try {
      setLoading(true);
      setShowAccessDenied(false);
      // Allow both Rider and Picker roles
      if (userRole && !isRider(userRole) && !isPicker(userRole)) {
        setShowAccessDenied(true);
        setLoading(false);
        return;
      }
      const completeSignIn = await signIn.create({
        identifier: email,
        password,
      });
      if (completeSignIn.status === "complete") {
        await setActive({
          session: completeSignIn.createdSessionId,
        });
      }
    } catch (err: any) {
      Alert.alert(
        "Sign In Error",
        err.errors?.[0]?.message || "Failed to sign in",
      );
      console.error(JSON.stringify(err, null, 2));
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setShowAccessDenied(false);
      setCheckingRole(true);

      const { createdSessionId, setActive } = await startOAuthFlow();
      if (createdSessionId) {
        setActive!({
          session: createdSessionId,
        });
        // Role checking will happen in useEffect after successful authentication
        // The useEffect will handle the user role validation and redirects
      }
    } catch (err: any) {
      Alert.alert(
        "Sign In Error",
        err.errors?.[0]?.message || "Failed to sign in with Google",
      );
      setLoading(false);
      setCheckingRole(false);
    }
  };

  // If access is denied, show access denied screen
  if (showAccessDenied) {
    return (
      <View style={styles.container}>
        <StatusBar
          barStyle="dark-content"
          backgroundColor={THEME.colors.background}
        />
        <SafeAreaView style={styles.safeArea}>
          <VStack style={styles.accessDeniedContainer} space="lg">
            {/* Logo */}
            <View style={styles.logoContainer}>
              <RNImage
                source={require("@/assets/images/Blink-Riders-Icon-01.png")}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>

            {/* Access Denied Message */}
            <VStack space="md" style={styles.accessDeniedContent}>
              <Heading size="2xl" style={styles.accessDeniedTitle}>
                Access Restricted
              </Heading>
              <Text style={styles.accessDeniedText}>
                This application is exclusively for authorized Blink Riders and
                Pickers.
              </Text>
              <Text style={styles.accessDeniedSubtext}>
                If you believe this is an error, please contact your
                administrator.
              </Text>
            </VStack>

            {/* Back to Sign In Button */}
            <Button
              onPress={() => {
                setShowAccessDenied(false);
                setEmail("");
                setPassword("");
              }}
              style={styles.backButton}
            >
              <ButtonText style={styles.backButtonText}>
                Back to Sign In
              </ButtonText>
            </Button>
          </VStack>
        </SafeAreaView>
      </View>
    );
  }
  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={THEME.colors.background}
      />
      <LinearGradient
        colors={[
          THEME.colors.background,
          THEME.colors.surfaceSecondary,
          "#F0F0F0",
        ]}
        style={styles.gradientBackground}
      >
        <SafeAreaView style={styles.safeArea}>
          <KeyboardAvoidingView style={styles.keyboardView} behavior="padding">
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <VStack space="xl" style={styles.mainContainer}>
                {/* Header Section */}
                <VStack space="lg" style={styles.headerSection}>
                  {/* Logo */}
                  <View style={styles.logoContainer}>
                    <RNImage
                      source={require("@/assets/images/Blink-Riders-Icon-01.png")}
                      style={styles.logo}
                      resizeMode="contain"
                    />
                  </View>

                  <VStack space="sm" style={styles.titleContainer}>
                    <Heading size="3xl" style={styles.title}>
                      Welcome to Blink
                    </Heading>
                    <Text style={styles.subtitle}>
                      Exclusive access for authorized users
                    </Text>
                  </VStack>
                </VStack>

                {/* Main Sign-In Card */}
                <Card style={styles.signInCard}>
                  <VStack space="lg">
                    {/* Google Sign-In Button */}
                    <TouchableOpacity
                      onPress={handleGoogleSignIn}
                      disabled={loading || checkingRole}
                      style={[
                        styles.googleButton,
                        (loading || checkingRole) && styles.buttonDisabled,
                      ]}
                      activeOpacity={0.8}
                    >
                      <View style={styles.googleButtonInner}>
                        {loading || checkingRole ? (
                          <Spinner
                            size="small"
                            color={THEME.colors.textSecondary}
                          />
                        ) : (
                          <GoogleIcon size={20} />
                        )}
                        <Text style={styles.googleButtonText}>
                          {loading
                            ? "Signing in..."
                            : checkingRole
                              ? "Verifying access..."
                              : "Continue with Google"}
                        </Text>
                      </View>
                    </TouchableOpacity>

                    {/* Divider */}
                    <HStack space="md" style={styles.dividerContainer}>
                      <View style={styles.dividerLine} />
                      <Text style={styles.dividerText}>or</Text>
                      <View style={styles.dividerLine} />
                    </HStack>

                    {/* Form Inputs */}
                    <VStack space="lg">
                      {/* Email Input */}
                      <VStack space="xs">
                        <Text style={styles.inputLabel}>Email Address</Text>
                        <View
                          style={[
                            styles.inputRow,
                            isEmailFocused && styles.inputRowFocused,
                          ]}
                        >
                          <Ionicons
                            name="mail-outline"
                            size={18}
                            color={
                              isEmailFocused
                                ? THEME.colors.primary
                                : THEME.colors.textSecondary
                            }
                            style={styles.inputIcon}
                          />
                          <TextInput
                            placeholder="Enter your email"
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoCorrect={false}
                            autoComplete="email"
                            textContentType="emailAddress"
                            returnKeyType="next"
                            onSubmitEditing={() => passwordRef.current?.focus()}
                            onFocus={() => setIsEmailFocused(true)}
                            onBlur={() => setIsEmailFocused(false)}
                            style={styles.inputField}
                            placeholderTextColor={THEME.colors.textSecondary}
                          />
                        </View>
                      </VStack>

                      {/* Password Input */}
                      <VStack space="xs">
                        <Text style={styles.inputLabel}>Password</Text>
                        <View
                          style={[
                            styles.inputRow,
                            isPasswordFocused && styles.inputRowFocused,
                          ]}
                        >
                          <Ionicons
                            name="lock-closed-outline"
                            size={18}
                            color={
                              isPasswordFocused
                                ? THEME.colors.primary
                                : THEME.colors.textSecondary
                            }
                            style={styles.inputIcon}
                          />
                          <TextInput
                            ref={passwordRef}
                            placeholder="Enter your password"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry={!showPassword}
                            autoCapitalize="none"
                            autoCorrect={false}
                            autoComplete="password"
                            textContentType="password"
                            returnKeyType="done"
                            onSubmitEditing={handleEmailSignIn}
                            onFocus={() => setIsPasswordFocused(true)}
                            onBlur={() => setIsPasswordFocused(false)}
                            style={styles.inputField}
                            placeholderTextColor={THEME.colors.textSecondary}
                          />
                          <TouchableOpacity
                            onPress={() => setShowPassword((prev) => !prev)}
                            style={styles.inputEndButton}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          >
                            <Ionicons
                              name={showPassword ? "eye-off-outline" : "eye-outline"}
                              size={18}
                              color={THEME.colors.textSecondary}
                            />
                          </TouchableOpacity>
                        </View>
                      </VStack>
                    </VStack>

                    {/* Sign In Button */}
                    <Button
                      onPress={handleEmailSignIn}
                      disabled={loading || checkingRole || !email || !password}
                      style={[
                        styles.signInButton,
                        (loading || checkingRole || !email || !password) &&
                          styles.buttonDisabled,
                      ]}
                    >
                      <HStack space="lg" style={styles.buttonContent}>
                        <ButtonText style={styles.signInButtonText}>
                          {loading
                            ? "Signing In..."
                            : checkingRole
                              ? "Verifying..."
                              : "Sign In"}
                        </ButtonText>
                        {(loading || checkingRole) && (
                          <Spinner size="small" color={THEME.buttonText.primary} />
                        )}
                      </HStack>
                    </Button>
                  </VStack>
                </Card>

                {/* Footer */}
                <Text style={styles.footer}>
                  Authorized access only • Blink Riders
                </Text>
              </VStack>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  gradientBackground: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 40,
    justifyContent: "center",
  },
  mainContainer: {
    flex: 1,
    justifyContent: "center",
    maxWidth: 400,
    alignSelf: "center",
    width: "100%",
  },
  headerSection: {
    alignItems: "center",
    marginBottom: 32,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  logo: {
    width: 96,
    height: 96,
    borderRadius: 16,
  },
  titleContainer: {
    alignItems: "center",
  },
  title: {
    color: THEME.colors.text,
    textAlign: "center",
    fontWeight: "800",
    letterSpacing: 1,
  },
  subtitle: {
    color: THEME.colors.textSecondary,
    textAlign: "center",
    fontSize: 16,
    lineHeight: 24,
    marginTop: 8,
  },
  signInCard: {
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.radius.lg,
    padding: 24,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  googleButton: {
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.radius.md,
    paddingVertical: 14,
    paddingHorizontal: 20,
    minHeight: 50,
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
  },
  googleButtonInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  buttonContent: {
    alignItems: "center",
    justifyContent: "center",
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: THEME.colors.text,
    letterSpacing: 0.3,
  },
  dividerContainer: {
    alignItems: "center",
    marginVertical: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: THEME.colors.border,
    opacity: 0.6,
  },
  dividerText: {
    fontSize: 14,
    color: THEME.colors.textSecondary,
    fontWeight: "500",
    paddingHorizontal: 16,
    backgroundColor: THEME.colors.surface,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: THEME.colors.text,
    marginBottom: 2,
    letterSpacing: 0.3,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: THEME.radius.md,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.surface,
    height: 52,
    paddingHorizontal: 14,
  },
  inputRowFocused: {
    borderColor: THEME.colors.primary,
  },
  inputIcon: {
    marginRight: 10,
  },
  inputEndButton: {
    marginLeft: 8,
    padding: 4,
  },
  inputField: {
    flex: 1,
    height: "100%",
    fontSize: 16,
    color: THEME.colors.text,
    paddingVertical: 0,
    borderWidth: 0,
    ...Platform.select({
      web: { outlineStyle: "none" as any },
      default: {},
    }),
  },
  signInButton: {
    backgroundColor: THEME.colors.primary,
    borderRadius: THEME.radius.md,
    paddingVertical: 16,
    marginTop: 16,
    minHeight: 44,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  signInButtonText: {
    color: THEME.buttonText.primary,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
    shadowOpacity: 0.1,
  },
  footer: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    textAlign: "center",
    marginTop: 32,
    letterSpacing: 0.5,
  },
  // Access Denied Styles
  accessDeniedContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 40,
    backgroundColor: THEME.colors.background,
  },
  accessDeniedContent: {
    alignItems: "center",
    maxWidth: 350,
  },
  accessDeniedTitle: {
    color: THEME.colors.text,
    textAlign: "center",
    fontWeight: "800",
    marginBottom: 8,
  },
  accessDeniedText: {
    color: THEME.colors.text,
    textAlign: "center",
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 8,
  },
  accessDeniedSubtext: {
    color: THEME.colors.textSecondary,
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
  },
  backButton: {
    backgroundColor: THEME.colors.primary,
    borderRadius: THEME.radius.md,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 24,
    minHeight: 44,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  backButtonText: {
    color: THEME.buttonText.primary,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
    textAlign: "center",
  },
});
