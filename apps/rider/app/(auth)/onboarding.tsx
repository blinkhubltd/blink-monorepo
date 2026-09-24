import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, View } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Camera } from "lucide-react-native";
import type { Id } from "@repo/backend/dataModel";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Text } from "@repo/mobile-ui/components/ui/text";
import { cn } from "@repo/mobile-ui/lib/utils";
import {
  AuthFooterLink,
  AuthHeader,
  AuthShell,
} from "../../components/auth/auth-shell";
import { PillField } from "../../components/auth/pill-field";
import { useCrew } from "../../providers/CrewProvider";
import {
  useDocumentUpload,
  useMyRiderOnboarding,
  useSubmitMyRiderDocuments,
  type PhotoSource,
} from "../../lib/data/documents";

type Photo = { uri: string; storageId?: Id<"_storage"> } | null;

/**
 * What a newly invited rider sees after signing in: the documents their hub
 * needs before approving them — phone number, ID photo, licence photo.
 *
 * Submitting moves the gate to `pending_review`, and this screen follows it
 * to the "under review" screen on its own. Approval happens on the admin's
 * Staff page (`user/rider_onboarding.ts`).
 *
 * Photos upload the moment they are taken, but nothing is attached to the
 * account until Submit — so re-taking a blurry photo before submitting costs
 * nothing.
 */
export default function OnboardingRoute() {
  const router = useRouter();
  const { gate, signOut } = useCrew();
  const onboarding = useMyRiderOnboarding();
  const submit = useSubmitMyRiderDocuments();
  const uploadPhoto = useDocumentUpload();

  const [phone, setPhone] = useState("");
  const [idPhoto, setIdPhoto] = useState<Photo>(null);
  const [licencePhoto, setLicencePhoto] = useState<Photo>(null);
  const [uploading, setUploading] = useState<"id" | "licence" | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  // Anything already on file, once — so a rider who submitted one photo last
  // time does not have to take it again.
  useEffect(() => {
    if (prefilled || !onboarding) return;
    setPhone(onboarding.phone);
    if (onboarding.idImageUrl) setIdPhoto({ uri: onboarding.idImageUrl });
    if (onboarding.licenseImageUrl) {
      setLicencePhoto({ uri: onboarding.licenseImageUrl });
    }
    setPrefilled(true);
  }, [onboarding, prefilled]);

  // Follow the gate: submitted → under review; approved → the app.
  useEffect(() => {
    if (gate === "pending_review") router.replace("/(auth)/access-restricted");
    else if (gate === "ok") router.replace("/(tabs)");
    else if (gate === "no_session") router.replace("/(auth)/sign-in");
  }, [gate, router]);

  function choosePhoto(which: "id" | "licence") {
    const run = async (source: PhotoSource) => {
      setError(null);
      setUploading(which);
      const result = await uploadPhoto(source);
      setUploading(null);
      if (result.kind === "error") setError(result.message);
      if (result.kind !== "picked") return;
      const photo = { uri: result.uri, storageId: result.storageId };
      if (which === "id") setIdPhoto(photo);
      else setLicencePhoto(photo);
    };
    Alert.alert(which === "id" ? "ID photo" : "Licence photo", undefined, [
      { text: "Take a photo", onPress: () => void run("camera") },
      { text: "Choose from gallery", onPress: () => void run("library") },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function onSubmit() {
    setError(null);
    if (!/^\+?\d{7,15}$/.test(phone.replace(/[\s-]/g, ""))) {
      setPhoneError("Enter the phone number your hub can reach you on.");
      return;
    }
    if (!idPhoto || !licencePhoto) {
      setError("Add both photos before submitting.");
      return;
    }
    setBusy(true);
    try {
      await submit({
        phone,
        idImage: idPhoto.storageId,
        licenseImage: licencePhoto.storageId,
      });
      // The gate effect above takes it from here.
    } catch (err) {
      setError(
        err instanceof Error && "data" in err && typeof err.data === "string"
          ? err.data
          : "Could not submit. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      footer={
        <AuthFooterLink
          prompt="Not you?"
          action="Sign out"
          onPress={() => void signOut()}
        />
      }
    >
      <AuthHeader
        title="Finish setting up."
        subtitle="Your hub lead reviews these before you can take deliveries."
      />

      <View className="gap-[16px]">
        <PillField
          label="Phone number"
          placeholder="0712 345 678"
          value={phone}
          onChangeText={(t) => {
            setPhone(t);
            setPhoneError(null);
          }}
          error={phoneError}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          editable={!busy}
        />

        <PhotoTile
          label="ID photo"
          hint="The front of your national ID or passport"
          photo={idPhoto}
          uploading={uploading === "id"}
          disabled={busy || uploading !== null}
          onPress={() => choosePhoto("id")}
        />

        <PhotoTile
          label="Driving licence photo"
          hint="The side with your photo and licence number"
          photo={licencePhoto}
          uploading={uploading === "licence"}
          disabled={busy || uploading !== null}
          onPress={() => choosePhoto("licence")}
        />

        {error ? (
          <Text size="sm" variant="destructive">
            {error}
          </Text>
        ) : null}

        <Button
          label="Submit for review"
          size="ctaLg"
          full
          loading={busy}
          disabled={busy || uploading !== null || onboarding === undefined}
          onPress={() => void onSubmit()}
        />
      </View>
    </AuthShell>
  );
}

/** A tappable photo slot: the preview once taken, a prompt until then. */
function PhotoTile({
  label,
  hint,
  photo,
  uploading,
  disabled,
  onPress,
}: {
  label: string;
  hint: string;
  photo: Photo;
  uploading: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <View className="gap-[7px]">
      <Text className="text-label font-semibold text-ink-800">{label}</Text>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={photo ? `Replace ${label}` : `Add ${label}`}
        className={cn(
          "h-[140px] items-center justify-center overflow-hidden rounded-lg border bg-white active:opacity-80",
          photo ? "border-ink-200" : "border-dashed border-ink-300",
        )}
      >
        {uploading ? (
          <ActivityIndicator />
        ) : photo ? (
          <>
            <Image
              source={{ uri: photo.uri }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
            />
            <View className="absolute bottom-space-3 right-space-3 rounded-pill bg-ink-950/80 px-space-4 py-space-1">
              <Text size="caption" weight="semibold" className="text-white">
                Replace
              </Text>
            </View>
          </>
        ) : (
          <View className="items-center gap-space-2 px-space-5">
            <Camera size={24} strokeWidth={2} className="text-subtle" />
            <Text size="sm" weight="semibold" className="text-ink-950">
              Add photo
            </Text>
            <Text size="caption" className="text-center text-ink-500">
              {hint}
            </Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}
