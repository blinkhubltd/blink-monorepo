import { View } from "react-native";
import type { Id } from "@repo/backend/dataModel";
import { Camera, ImageIcon } from "lucide-react-native";

import { Text } from "@repo/mobile-ui/components/ui/text";
import { Button } from "@repo/mobile-ui/components/ui/button";
import { Badge } from "@repo/mobile-ui/components/ui/badge";
import { Separator } from "@repo/mobile-ui/components/ui/separator";

import { SectionCard } from "./sections";
import { usePrescriptionUpload } from "../../lib/use-prescription-upload";

/**
 * Prescription upload, one shop at a time.
 *
 * ── Per shop, because review is per shop ─────────────────────────────────
 *
 * Each vendor's pharmacist reviews their own paperwork, so a basket spanning two
 * chemists needs two documents. The old checkout asked one vendor-keyed query and
 * treated the answer as the whole basket's, which meant an approval from one shop
 * cleared the other — the item that needed a pharmacist shipped without one.
 *
 * ── "Uploaded" is not "being reviewed" ───────────────────────────────────
 *
 * `uploadMyPrescription` reports whether a picker was actually assigned. When no
 * picker is available the document is stored and nobody has been asked to look at
 * it, and that says so rather than showing the same success as a routed upload.
 * The old path could not tell the difference: its assignment call was a wrong
 * string reference inside a catch that returned success regardless, so no upload
 * was ever routed and every one of them looked fine.
 */
export function PrescriptionUploadSection({
  vendors,
  onUploaded,
}: {
  /** Shops in this basket with at least one item needing a prescription. */
  vendors: {
    vendorId: Id<"vendors">;
    name: string;
    status: string | null;
    rejectionReasonId: string | null;
  }[];
  onUploaded: () => void;
}) {
  if (vendors.length === 0) return null;

  return (
    <SectionCard title="Prescriptions">
      <Text size="sm" variant="muted">
        {vendors.length === 1
          ? "One item in your basket needs a valid prescription. A pharmacist checks it before dispatch."
          : `${vendors.length} shops in your basket need a prescription. Each one is checked separately.`}
      </Text>

      {vendors.map((vendor, index) => (
        <View key={vendor.vendorId} className="gap-space-2">
          {index > 0 ? <Separator /> : null}
          <VendorRow vendor={vendor} onUploaded={onUploaded} />
        </View>
      ))}
    </SectionCard>
  );
}

function VendorRow({
  vendor,
  onUploaded,
}: {
  vendor: {
    vendorId: Id<"vendors">;
    name: string;
    status: string | null;
    rejectionReasonId: string | null;
  };
  onUploaded: () => void;
}) {
  const { state, upload, reset } = usePrescriptionUpload();

  const busy = state.kind === "picking" || state.kind === "uploading";

  // The server's status leads; a just-finished upload shows through until the
  // subscription catches up, so the row does not flick back to "needed".
  const effective =
    state.kind === "done" && vendor.status === null ? "pending" : vendor.status;

  async function pick(source: "camera" | "library") {
    await upload(vendor.vendorId, source);
    onUploaded();
  }

  return (
    <View className="gap-space-2">
      <View className="gap-space-2 flex-row items-center">
        <Text size="sm" weight="medium" numberOfLines={1} className="flex-1">
          {vendor.name}
        </Text>
        <StatusBadge status={effective} />
      </View>

      {effective === "approved" ? (
        <Text size="caption" variant="subtle">
          Cleared for dispatch.
        </Text>
      ) : effective === "pending" ? (
        <Text size="caption" variant="subtle">
          Under review. You can place the order now — it is dispatched once
          approved.
        </Text>
      ) : (
        <>
          {effective === "rejected" ? (
            <Text size="caption" variant="destructive">
              Not accepted. Upload a clearer or more recent document.
            </Text>
          ) : null}

          <View className="gap-space-2 flex-row">
            <Button
              size="sm"
              variant="outline"
              label="Take a photo"
              icon={<Camera size={16} color="#0A0E16" />}
              loading={busy}
              disabled={busy}
              onPress={() => void pick("camera")}
            />
            <Button
              size="sm"
              variant="outline"
              label="Choose a file"
              icon={<ImageIcon size={16} color="#0A0E16" />}
              loading={busy}
              disabled={busy}
              onPress={() => void pick("library")}
            />
          </View>
        </>
      )}

      {/*
        Stored but unrouted. Distinct from success on purpose: nobody has been
        asked to review it, and the customer needs to know that rather than
        waiting.
      */}
      {state.kind === "done" && !state.assigned ? (
        <View className="bg-warning-soft p-space-3 rounded-md">
          <Text size="caption">
            Received, but no pharmacist is available at this shop right now.
            Support can move it along if it stays like this.
          </Text>
        </View>
      ) : null}

      {state.kind === "error" ? (
        <View className="bg-destructive-soft gap-space-2 p-space-3 rounded-md">
          <Text size="caption" variant="destructive">
            {state.message}
          </Text>
          <Button size="sm" variant="ghost" label="Dismiss" onPress={reset} />
        </View>
      ) : null}
    </View>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (status === "approved") return <Badge variant="success" label="Approved" />;
  if (status === "rejected") {
    return <Badge variant="destructive" label="Not accepted" />;
  }
  if (status === null) return <Badge variant="warning" label="Needed" />;
  // An unknown status shows as itself rather than as cleared.
  return <Badge variant="info" label={status === "pending" ? "In review" : status} />;
}
