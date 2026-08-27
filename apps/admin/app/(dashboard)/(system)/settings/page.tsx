"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon as X,
  FloppyDiskIcon as Save,
  ImageIcon,
  Loading03Icon as Loader2,
  Settings01Icon as Settings,
  Upload01Icon as Upload,
} from "@hugeicons/core-free-icons";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@repo/backend";
import { Id } from "@repo/backend/dataModel";
import { useCurrentUserPermissions } from "@/lib/hooks/useCurrentUserPermissions";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import { DemoDataCard } from "./_components/demo-data-card";
import { ServiceRadiusLimitCard } from "./_components/service-radius-limit-card";
import { Checkbox } from "@repo/ui/components/ui/checkbox";
import { toast } from "sonner";
import { getConvexErrorMessage } from "@/lib/utils";

interface SettingField {
  key: string;
  label: string;
  description: string;
  unit?: string;
  /** Convert stored value to display value */
  fromStored: (v: string) => string;
  /** Convert display value to stored value */
  toStored: (v: string) => string;
  type: "number";
}

const SETTING_FIELDS: SettingField[] = [
  {
    key: "clearance_service_radius",
    label: "Clearance Service Radius",
    description:
      "Maximum distance from vendor for clearance products to be visible to customers.",
    unit: "km",
    fromStored: (v) => String(Number(v) / 1000),
    toStored: (v) => String(Number(v) * 1000),
    type: "number",
  },
  {
    key: "clearance_expiry_buffer_days",
    label: "Expiry Buffer Days",
    description:
      "Number of days before expiry to stop displaying clearance products.",
    unit: "days",
    fromStored: (v) => v,
    toStored: (v) => v,
    type: "number",
  },
  {
    key: "delivery_fee",
    label: "Normal Delivery Fee",
    description: "Delivery fee charged for normal product orders.",
    unit: "KES",
    fromStored: (v) => v,
    toStored: (v) => v,
    type: "number",
  },
  {
    key: "clearance_delivery_fee",
    label: "Clearance Delivery Fee",
    description: "Delivery fee charged for clearance product orders.",
    unit: "KES",
    fromStored: (v) => v,
    toStored: (v) => v,
    type: "number",
  },
  {
    key: "clearance_extra_vendor_fee",
    label: "Clearance Extra Vendor Fee",
    description:
      "Extra delivery fee charged per additional vendor in a clearance order.",
    unit: "KES",
    fromStored: (v) => v,
    toStored: (v) => v,
    type: "number",
  },
];

const DAYS_OF_WEEK = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;
type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

export default function SettingsPage() {
  const { isAdminUser, isLoading: permsLoading } = useCurrentUserPermissions();
  const settings = useQuery(api.data.platform_settings.getAll);
  const upsert = useMutation(api.data.platform_settings.upsert);
  const generateUploadUrl = useMutation(api.data.files.generateUploadUrl);

  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [initialized, setInitialized] = useState(false);

  // Agent payout days
  const payoutDaysSetting = settings?.find(
    (s: { key: string; value: unknown }) => s.key === "agent_payout_days",
  );
  const [selectedPayoutDays, setSelectedPayoutDays] = useState<DayOfWeek[]>([]);
  const [payoutDaysInitialized, setPayoutDaysInitialized] = useState(false);
  const [savingPayoutDays, setSavingPayoutDays] = useState(false);

  useEffect(() => {
    if (!payoutDaysSetting || payoutDaysInitialized) return;
    const days = String(payoutDaysSetting.value)
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter((d): d is DayOfWeek =>
        (DAYS_OF_WEEK as readonly string[]).includes(d),
      );
    setSelectedPayoutDays(days);
    setPayoutDaysInitialized(true);
  }, [payoutDaysSetting, payoutDaysInitialized]);

  const toggleDay = (day: DayOfWeek) => {
    setSelectedPayoutDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const handleSavePayoutDays = async () => {
    setSavingPayoutDays(true);
    try {
      await upsert({
        key: "agent_payout_days",
        value: selectedPayoutDays.join(","),
        description:
          "Comma-separated days of the week when agents can create payout requests",
      });
      toast.success("Payout days updated");
    } catch {
      toast.error("Failed to update payout days");
    } finally {
      setSavingPayoutDays(false);
    }
  };

  // Clearance card image state
  const clearanceImageSetting = settings?.find(
    (s: { key: string; value: unknown }) => s.key === "clearance_card_image",
  );
  const clearanceImageStorageId = clearanceImageSetting?.value as
    | Id<"_storage">
    | undefined;
  const clearanceImageUrl = useQuery(
    api.data.files.getImageUrl,
    clearanceImageStorageId ? { storageId: clearanceImageStorageId } : "skip",
  );
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Sync the resolved URL into preview once loaded
  useEffect(() => {
    if (clearanceImageUrl && !imagePreview && !selectedImageFile) {
      setImagePreview(clearanceImageUrl);
    }
  }, [clearanceImageUrl, imagePreview, selectedImageFile]);

  // Populate form values from fetched settings
  useEffect(() => {
    if (!settings || initialized) return;
    const map: Record<string, string> = {};
    for (const field of SETTING_FIELDS) {
      const setting = settings.find(
        (s: { key: string; value: unknown }) => s.key === field.key,
      );
      map[field.key] = setting ? field.fromStored(setting.value) : "";
    }
    setValues(map);
    setInitialized(true);
  }, [settings, initialized]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }
    setSelectedImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleImageUpload = async () => {
    if (!selectedImageFile) return;
    setUploadingImage(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": selectedImageFile.type },
        body: selectedImageFile,
      });
      const { storageId } = await result.json();
      await upsert({
        key: "clearance_card_image",
        value: storageId,
        description: "Image displayed on the clearance card on the home page",
      });
      setSelectedImageFile(null);
      toast.success("Clearance card image updated");
    } catch {
      toast.error("Failed to upload image");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveImage = async () => {
    setUploadingImage(true);
    try {
      await upsert({
        key: "clearance_card_image",
        value: "",
        description: "Image displayed on the clearance card on the home page",
      });
      setImagePreview(null);
      setSelectedImageFile(null);
      toast.success("Clearance card image removed");
    } catch {
      toast.error("Failed to remove image");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async (field: SettingField) => {
    const displayValue = values[field.key];
    if (
      !displayValue ||
      isNaN(Number(displayValue)) ||
      Number(displayValue) < 0
    ) {
      toast.error(`Invalid value for ${field.label}`);
      return;
    }

    setSaving((prev) => ({ ...prev, [field.key]: true }));
    try {
      await upsert({
        key: field.key,
        value: field.toStored(displayValue),
        description: field.description,
      });
      toast.success(`${field.label} updated`);
    } catch (error) {
      toast.error(
        getConvexErrorMessage(error, `Failed to update ${field.label}`),
      );
    } finally {
      setSaving((prev) => ({ ...prev, [field.key]: false }));
    }
  };

  if (permsLoading || !settings) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <HugeiconsIcon icon={Loader2} className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdminUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Access denied.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <HugeiconsIcon icon={Settings} className="w-7 h-7 text-muted-foreground" />
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Platform Settings
              </h1>
              <p className="text-muted-foreground">
                Configure global platform parameters
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-6">
        {/* Clearance Card Image */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Clearance Card Image</CardTitle>
            <p className="text-sm text-muted-foreground">
              Image displayed on the clearance card on the home page.
              Recommended size: 800×400px.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              {imagePreview ? (
                <div className="relative w-full max-w-md">
                  <img
                    src={imagePreview}
                    alt="Clearance card preview"
                    className="w-full h-48 object-cover rounded-lg border"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setImagePreview(null);
                      setSelectedImageFile(null);
                    }}
                    className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80"
                  >
                    <HugeiconsIcon icon={X} className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="w-full max-w-md h-48 border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-muted-foreground">
                  <HugeiconsIcon icon={ImageIcon} className="h-10 w-10 mb-2" />
                  <p className="text-sm">No image selected</p>
                </div>
              )}

              <div className="flex items-center gap-3">
                <Label
                  htmlFor="clearance-card-image"
                  className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded-md text-sm font-medium hover:bg-yellow-600"
                >
                  <HugeiconsIcon icon={Upload} className="h-4 w-4" />
                  Choose Image
                </Label>
                <input
                  id="clearance-card-image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleImageSelect}
                />
                {selectedImageFile && (
                  <Button
                    onClick={handleImageUpload}
                    disabled={uploadingImage}
                    size="sm"
                    className="bg-yellow-500 hover:bg-yellow-600 text-white"
                  >
                    {uploadingImage ? (
                      <HugeiconsIcon icon={Loader2} className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <HugeiconsIcon icon={Save} className="h-4 w-4 mr-1" />
                    )}
                    Upload & Save
                  </Button>
                )}
                {!selectedImageFile &&
                  clearanceImageSetting?.value &&
                  imagePreview && (
                    <Button
                      size="sm"
                      onClick={handleRemoveImage}
                      disabled={uploadingImage}
                      className="bg-yellow-500 hover:bg-yellow-600 text-white"
                    >
                      {uploadingImage ? (
                        <HugeiconsIcon icon={Loader2} className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <HugeiconsIcon icon={X} className="h-4 w-4 mr-1" />
                      )}
                      Remove
                    </Button>
                  )}
              </div>
              <p className="text-xs text-muted-foreground">
                JPEG, PNG, or WebP. Max 5MB.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Numeric Settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {SETTING_FIELDS.map((field) => (
            <Card key={field.key}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{field.label}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {field.description}
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-3">
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor={field.key}>
                      Value{" "}
                      {field.unit && (
                        <span className="text-muted-foreground">
                          ({field.unit})
                        </span>
                      )}
                    </Label>
                    <Input
                      id={field.key}
                      type="number"
                      min="0"
                      step="any"
                      value={values[field.key] ?? ""}
                      onChange={(e) =>
                        setValues((prev) => ({
                          ...prev,
                          [field.key]: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <Button
                    onClick={() => handleSave(field)}
                    disabled={saving[field.key]}
                    size="sm"
                    className="bg-yellow-500 hover:bg-yellow-600 text-white"
                  >
                    {saving[field.key] ? (
                      <HugeiconsIcon icon={Loader2} className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <HugeiconsIcon icon={Save} className="h-4 w-4 mr-1" />
                    )}
                    Save
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Agent Payout Days */}
        <Card className="mt-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Agent Payout Days</CardTitle>
            <p className="text-sm text-muted-foreground">
              Days of the week on which agents are allowed to submit payment
              requests.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 mb-4">
              {DAYS_OF_WEEK.map((day) => (
                <div key={day} className="flex items-center gap-2">
                  <Checkbox
                    id={`payout-day-${day}`}
                    checked={selectedPayoutDays.includes(day)}
                    onCheckedChange={() => toggleDay(day)}
                  />
                  <Label
                    htmlFor={`payout-day-${day}`}
                    className="capitalize cursor-pointer"
                  >
                    {day}
                  </Label>
                </div>
              ))}
            </div>
            <Button
              size="sm"
              onClick={handleSavePayoutDays}
              disabled={savingPayoutDays}
              className="bg-yellow-500 hover:bg-yellow-600 text-white"
            >
              {savingPayoutDays ? (
                <HugeiconsIcon icon={Loader2} className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <HugeiconsIcon icon={Save} className="h-4 w-4 mr-1" />
              )}
              Save Payout Days
            </Button>
          </CardContent>
        </Card>

        <ServiceRadiusLimitCard />

        {/* Renders only for a super admin; see DemoDataCard. */}
        <DemoDataCard />
      </div>
    </div>
  );
}
