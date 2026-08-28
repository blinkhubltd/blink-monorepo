import { ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Separator } from "@repo/mobile-ui/components/ui/separator";

import { ScreenHeader } from "../../components/screen-header";
import { NotFoundState } from "../../components/states";
import { LEGAL_DOCUMENTS, isLegalDoc } from "../../lib/legal-content";

/**
 * One renderer for all three legal documents.
 *
 * Replaces `privacy-policy.tsx` (973 lines), `terms-of-service.tsx` (824) and
 * `eula.tsx` (802) — 2,599 lines of JSX doing one job, and 78 of the `space=`
 * prop conversions the migration would otherwise have to make and review.
 *
 * The version comes from `platform_settings`, so the version a customer reads
 * is the version acceptance is recorded against. The old checkout hardcoded
 * `"v1.0"` in both its acceptance calls, so bumping the setting to force
 * re-acceptance would have recorded the new agreement under the old number.
 */
export default function LegalScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();

  const settings = useQuery(api.data.platform_settings.getLegalSettings, {});

  if (!doc || !isLegalDoc(doc)) {
    return (
      <NotFoundState
        what="document"
        onBack={() => router.replace("/profile")}
      />
    );
  }

  const document = LEGAL_DOCUMENTS[doc];
  // Indexed on the known union rather than cast through a string record:
  // getLegalSettings also returns `*_updated_at` numbers, so a broad record cast
  // would have typechecked while letting a timestamp be rendered as a version.
  const version = settings ? settings[document.versionKey] : null;

  return (
    <SafeAreaView edges={["top"]} className="bg-background flex-1">
      <ScreenHeader
        title={document.title}
        subtitle={version ? `Version ${version}` : undefined}
        showCart={false}
      />

      <ScrollView contentContainerClassName="px-screen gap-space-5 pb-space-10">
        {document.sections.map((section, index) => (
          <View key={section.heading} className="gap-space-3">
            {index > 0 ? <Separator /> : null}
            <Text size="base" weight="semibold">
              {section.heading}
            </Text>
            {section.body.map((paragraph) => (
              <Text key={paragraph} size="sm" variant="muted">
                {paragraph}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
