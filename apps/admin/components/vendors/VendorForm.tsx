"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Building02Icon as Building2,
  Cancel01Icon as X,
  Clock01Icon as Clock,
  ImageIcon,
  Loading03Icon as Loader2,
  Location01Icon as MapPin,
  NavigationIcon as Navigation,
} from "@hugeicons/core-free-icons";
import { useState, useEffect } from "react";
import { useForm, Control } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "convex/react";
import { api } from "@repo/backend";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components/ui/form";
import { Input } from "@repo/ui/components/ui/input";
import { Button } from "@repo/ui/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import { Switch } from "@repo/ui/components/ui/switch";
import GooglePlacesInput from "@/components/ui/GooglePlacesInput";
import ServiceCenterMapPicker from "@/components/vendors/ServiceCenterMapPicker";
import { Label } from "@repo/ui/components/ui/label";
import { validateServiceCenterWithinRadius } from "@/lib/validators";
import { ProtectedFormField } from "@/components/shared/ProtectedField";

const dayScheduleSchema = z.object({
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
});

const vendorSchema = z.object({
  name: z.string().min(2, "Vendor name is required"),
  industry_id: z.string().optional(),
  contact: z.object({
    name: z.string().min(2, "Contact name is required"),
    phone: z.string().min(7, "Phone number is required"),
    email: z.string().email("Invalid email"),
  }),
  business_details: z.object({
    business_name: z.string().min(2, "Business name is required"),
    bank_code: z.string().min(1, "Bank code is required"),
    account_number: z.string().min(1, "Account number is required"),
    kra_pin: z.string().optional(),
  }),
  address: z.object({
    address_1: z.string().min(2, "Address line 1 is required"),
    address_2: z.string().optional(),
    city: z.string().min(2, "City is required"),
    country: z.string().min(2, "Country is required"),
  }),
  coordinates: z.object({
    lat: z
      .number()
      .min(-90)
      .max(90)
      .refine((val) => val !== 0, {
        message: "Please select a location using the map search",
      }),
    lng: z
      .number()
      .min(-180)
      .max(180)
      .refine((val) => val !== 0, {
        message: "Please select a location using the map search",
      }),
  }),
  service_center: z.optional(
    z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    }),
  ),
  service_radius: z.number().min(1, "Service radius must be at least 1"),
  commission: z.number().min(0, "Commission must be at least 0"),
  commission_type: z.enum(["percentage", "fixed"]),
  status: z.enum(["Active", "Inactive"]),
  schedule: z
    .object({
      is_fulltime: z.boolean(),
      weeklySchedule: z.optional(
        z.object({
          Monday: z.optional(dayScheduleSchema),
          Tuesday: z.optional(dayScheduleSchema),
          Wednesday: z.optional(dayScheduleSchema),
          Thursday: z.optional(dayScheduleSchema),
          Friday: z.optional(dayScheduleSchema),
          Saturday: z.optional(dayScheduleSchema),
          Sunday: z.optional(dayScheduleSchema),
        }),
      ),
    })
    .refine(
      (data) => {
        // If not fulltime, at least one day schedule should be provided
        if (!data.is_fulltime && data.weeklySchedule) {
          const hasAnySchedule = Object.values(data.weeklySchedule).some(
            (day) => day !== undefined,
          );
          return hasAnySchedule;
        }
        return true;
      },
      {
        message: "At least one day schedule is required for part-time vendors",
      },
    ),
});

export type VendorFormValues = z.infer<typeof vendorSchema>;

interface VendorFormProps {
  defaultValues?: VendorFormValues;
  onSubmit: (
    data: VendorFormValues & { image?: string },
  ) => Promise<void> | void;
  submitLabel?: string;
  onCancel?: () => void;
  existingImageUrl?: string | null;
}

export default function VendorForm({
  defaultValues,
  onSubmit,
  submitLabel = "Save Vendor",
  onCancel,
  existingImageUrl,
}: VendorFormProps) {
  const [loading, setLoading] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [serviceCenterMapCenter, setServiceCenterMapCenter] = useState<
    { lat: number; lng: number } | null
  >(null);
  const [validationError, setValidationError] = useState<string>("");
  const [hasInitialBankDetails] = useState({
    bank_code: !!defaultValues?.business_details?.bank_code,
    account_number: !!defaultValues?.business_details?.account_number,
  });

  // Image upload state
  const generateUploadUrl = useMutation(api.data.files.generateUploadUrl);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(
    existingImageUrl ?? null,
  );

  // Fetch industries
  const industriesData = useQuery(api.data.industry.getActiveIndustries, {
    limit: 100,
  });

  // The platform-wide ceiling from Settings — the SAME query the backend
  // mutation validates against, so what this form shows is never out of step
  // with what saving will actually accept. `updateVendor`/`addVendor` remain
  // the authority; this is purely so the rejection is not a surprise typed
  // into a field that looked unconstrained.
  const serviceRadiusLimit = useQuery(
    api.data.platform_settings.getVendorServiceRadiusLimit,
    {},
  );

  const form = useForm<VendorFormValues>({
    resolver: zodResolver(vendorSchema),
    defaultValues: defaultValues ?? {
      name: "",
      industry_id: undefined,
      contact: { name: "", phone: "", email: "" },
      business_details: {
        business_name: "",
        bank_code: "",
        account_number: "",
        kra_pin: "",
      },
      address: { address_1: "", address_2: "", city: "", country: "Kenya" },
      coordinates: { lat: 0, lng: 0 },
      service_center: undefined,
      service_radius: 1000,
      commission: 0,
      commission_type: "percentage" as const,
      status: "Active" as const,
      schedule: {
        is_fulltime: true,
        weeklySchedule: undefined,
      },
    },
  });

  // Set initial location display if editing existing vendor
  useEffect(() => {
    if (defaultValues?.address) {
      const addressParts = [
        defaultValues.address.address_1,
        defaultValues.address.address_2,
        defaultValues.address.city,
        defaultValues.address.country,
      ].filter(Boolean);
      setSelectedLocation(addressParts.join(", "));
    }
  }, [defaultValues]);

  const handlePlaceSelect = (place: any) => {
    // Autofill vendor name if not already set and place has a valid name
    const currentName = form.getValues("name");
    if ((!currentName || currentName.trim() === "") && place.placeName) {
      form.setValue("name", place.placeName);
    }

    // Update address fields
    form.setValue("address.address_1", place.addressComponents.address_1);
    form.setValue("address.address_2", place.addressComponents.address_2 || "");
    form.setValue("address.city", place.addressComponents.city);
    form.setValue("address.country", place.addressComponents.country);

    // Update coordinates
    form.setValue("coordinates.lat", place.coordinates.lat);
    form.setValue("coordinates.lng", place.coordinates.lng);

    // Update display
    setSelectedLocation(place.address);

    // Clear validation error when location changes
    setValidationError("");
  };

  const handleServiceCenterSearch = (place: any) => {
    // Search only pans the map — it does not move the pin or set coordinates
    setServiceCenterMapCenter({
      lat: place.coordinates.lat,
      lng: place.coordinates.lng,
    });
  };

  const handleSubmit = async (values: VendorFormValues) => {
    // Validate service center distance before submission
    const validation = validateServiceCenterWithinRadius(
      values.service_center,
      values.coordinates,
      values.service_radius,
    );

    if (!validation.isValid) {
      setValidationError(validation.message || "Validation failed");
      return;
    }

    setLoading(true);
    setValidationError("");
    try {
      // Upload image if a new file was selected
      let imageStorageId: string | undefined;
      if (selectedImageFile) {
        const uploadUrl = await generateUploadUrl();
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": selectedImageFile.type },
          body: selectedImageFile,
        });
        const { storageId } = await result.json();
        imageStorageId = storageId;
      }

      await onSubmit({
        ...values,
        ...(imageStorageId ? { image: imageStorageId } : {}),
      });
      form.reset();
      setSelectedLocation("");
      setServiceCenterMapCenter(null);
      setSelectedImageFile(null);
      setImagePreview(null);
    } catch (err) {
      console.error("Vendor form submit error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {/* Vendor Name */}
        <FormField
          control={form.control as Control<VendorFormValues>}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Vendor Name *</FormLabel>
              <FormControl>
                <Input placeholder="Enter vendor name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control as Control<VendorFormValues>}
          name="industry_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Industry</FormLabel>
              <Select
                onValueChange={(value) => {
                  if (value === "__none__") {
                    field.onChange(undefined);
                  } else {
                    field.onChange(value);
                  }
                }}
                value={field.value ?? "__none__"}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an industry (optional)" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {industriesData?.data?.map((industry: any) => (
                    <SelectItem key={industry._id} value={industry._id}>
                      {industry.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
              <p className="text-xs text-muted-foreground">
                Categorize the vendor by industry type
              </p>
            </FormItem>
          )}
        />

        {/* Vendor Logo */}
        <div className="space-y-2">
          <Label>Vendor Logo</Label>
          <div className="flex items-center gap-4">
            {imagePreview ? (
              <div className="relative w-20 h-20 rounded-lg border overflow-hidden">
                <img
                  src={imagePreview}
                  alt="Vendor logo"
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSelectedImageFile(null);
                    setImagePreview(null);
                  }}
                  className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 hover:bg-black/80"
                >
                  <HugeiconsIcon icon={X} className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="w-20 h-20 rounded-lg border-2 border-dashed flex items-center justify-center text-muted-foreground">
                <HugeiconsIcon icon={ImageIcon} className="w-8 h-8" />
              </div>
            )}
            <div>
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="w-auto text-sm"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 5 * 1024 * 1024) {
                    setValidationError("Image must be less than 5MB");
                    return;
                  }
                  setSelectedImageFile(file);
                  setImagePreview(URL.createObjectURL(file));
                }}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Displayed as vendor logo on the mobile app. Max 5MB.
              </p>
            </div>
          </div>
        </div>

        {/* Contact Info */}
        <div className="space-y-3">
          <h3 className="font-medium text-sm">Contact Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField
              control={form.control as Control<VendorFormValues>}
              name="contact.name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact Person *</FormLabel>
                  <FormControl>
                    <Input placeholder="Contact person name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control as Control<VendorFormValues>}
              name="contact.phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone *</FormLabel>
                  <FormControl>
                    <Input placeholder="+254-XXX-XXXXXX" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control as Control<VendorFormValues>}
              name="contact.email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email *</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="email@example.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Business Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <HugeiconsIcon icon={Building2} className="h-5 w-5" />
              Business Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-start items-start gap-2">
              <FormField
                control={form.control as Control<VendorFormValues>}
                name="business_details.business_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter business name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control as Control<VendorFormValues>}
                name="business_details.bank_code"
                render={({ field }) => (
                  <ProtectedFormField
                    label="Bank Code *"
                    placeholder="e.g. 01"
                    field={field}
                    hasValue={hasInitialBankDetails.bank_code}
                  />
                )}
              />

              <FormField
                control={form.control as Control<VendorFormValues>}
                name="business_details.account_number"
                render={({ field }) => (
                  <ProtectedFormField
                    label="Account Number *"
                    placeholder="Enter account number"
                    field={field}
                    hasValue={hasInitialBankDetails.account_number}
                  />
                )}
              />
            </div>

            <div className="flex justify-center items-center gap-4">
              <FormField
                control={form.control as Control<VendorFormValues>}
                name="business_details.kra_pin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>KRA PIN (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. A000000000A" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Location & Service */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <HugeiconsIcon icon={MapPin} className="h-5 w-5" />
              Location & Service Area
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Google Places Search */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Search Vendor Location *
              </label>
              <GooglePlacesInput
                onPlaceSelect={handlePlaceSelect}
                placeholder="Search for vendor location on Google Maps..."
                initialValue={selectedLocation}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Search and select the vendor's exact location to auto-fill
                address and coordinates
              </p>
              {form.watch("coordinates.lat") === 0 &&
                form.watch("coordinates.lng") === 0 && (
                  <div className="p-2 bg-orange-50 border border-orange-200 rounded text-sm text-orange-700 mt-2">
                    ⚠️ Please search and select a location from Google Maps to
                    proceed
                  </div>
                )}
            </div>

            {/* Selected Location Display */}
            {selectedLocation &&
              form.watch("coordinates.lat") !== 0 &&
              form.watch("coordinates.lng") !== 0 && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <HugeiconsIcon icon={MapPin} className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-green-800 mb-1">
                        Location Selected
                      </p>
                      <p className="text-sm text-green-700">
                        {selectedLocation}
                      </p>
                      <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-green-600">
                        <span>
                          Lat: {form.watch("coordinates.lat").toFixed(6)}
                        </span>
                        <span>
                          Lng: {form.watch("coordinates.lng").toFixed(6)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            {/* Manual Address Fields (Auto-filled by Places) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control as Control<VendorFormValues>}
                name="address.address_1"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address Line 1 *</FormLabel>
                    <FormControl>
                      <Input placeholder="Street address" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control as Control<VendorFormValues>}
                name="address.address_2"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address Line 2</FormLabel>
                    <FormControl>
                      <Input placeholder="Apartment, suite, etc." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control as Control<VendorFormValues>}
                name="address.city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City *</FormLabel>
                    <FormControl>
                      <Input placeholder="City" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control as Control<VendorFormValues>}
                name="address.country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country *</FormLabel>
                    <FormControl>
                      <Input placeholder="Country" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Service Center Location (Optional) */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <HugeiconsIcon icon={Building2} className="h-4 w-4" />
                <label className="text-sm font-medium">
                  Service Center Location (Optional)
                </label>
              </div>
              <GooglePlacesInput
                onPlaceSelect={handleServiceCenterSearch}
                placeholder="Search to jump the map to an area..."
                initialValue=""
              />
              <p className="text-xs text-muted-foreground">
                Search to jump the map to an area, then drag the pin (or click
                the map) to place the exact service center within your
                service radius.
              </p>
              <ServiceCenterMapPicker
                center={form.watch("coordinates")}
                radius={form.watch("service_radius")}
                value={form.watch("service_center")}
                panTo={serviceCenterMapCenter}
                onChange={(coords) => {
                  form.setValue("service_center", coords, {
                    shouldValidate: true,
                  });
                  setValidationError("");
                }}
                onClear={() => {
                  form.setValue("service_center", undefined);
                  setValidationError("");
                }}
              />
            </div>

            {/* Service Radius */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control as Control<VendorFormValues>}
                name="service_radius"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <HugeiconsIcon icon={Navigation} className="h-4 w-4" />
                      Service Radius (m) *
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={serviceRadiusLimit}
                        placeholder="10"
                        {...field}
                        onChange={(e) =>
                          field.onChange(parseInt(e.target.value) || 1)
                        }
                      />
                    </FormControl>
                    <FormMessage />
                    {serviceRadiusLimit !== undefined &&
                    field.value > serviceRadiusLimit ? (
                      <p className="text-destructive text-xs">
                        Exceeds the platform limit of{" "}
                        {serviceRadiusLimit.toLocaleString("en-KE")} m — saving
                        will be rejected. Raise the limit on Settings first.
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Delivery area radius from this location
                        {serviceRadiusLimit !== undefined
                          ? ` — up to ${serviceRadiusLimit.toLocaleString("en-KE")} m`
                          : ""}
                      </p>
                    )}
                  </FormItem>
                )}
              />

              {/* Manual Coordinates (Auto-filled by Places) */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Coordinates (Auto-filled)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <FormField
                    control={form.control as Control<VendorFormValues>}
                    name="coordinates.lat"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            type="number"
                            step="any"
                            placeholder="Latitude"
                            {...field}
                            onChange={(e) =>
                              field.onChange(parseFloat(e.target.value) || 0)
                            }
                            className="text-xs"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control as Control<VendorFormValues>}
                    name="coordinates.lng"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            type="number"
                            step="any"
                            placeholder="Longitude"
                            {...field}
                            onChange={(e) =>
                              field.onChange(parseFloat(e.target.value) || 0)
                            }
                            className="text-xs"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Coordinates are auto-filled when you select a location above
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Commission */}
        <div className="space-y-3">
          <h3 className="font-medium text-sm">Commission Settings</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control as Control<VendorFormValues>}
              name="commission"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Commission Amount *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      placeholder="0.00"
                      {...field}
                      onChange={(e) =>
                        field.onChange(parseFloat(e.target.value) || 0)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control as Control<VendorFormValues>}
              name="commission_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Commission Type *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                      <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Schedule */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <HugeiconsIcon icon={Clock} className="h-5 w-5" />
              Vendor Schedule
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control as Control<VendorFormValues>}
              name="schedule.is_fulltime"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">
                      Full-time Vendor
                    </FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Enable if vendor operates 24/7. Disable to set specific
                      weekly hours.
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {!form.watch("schedule.is_fulltime") && (
              <div className="space-y-3">
                <p className="text-sm font-medium">Weekly Schedule</p>
                <p className="text-xs text-muted-foreground">
                  Set operating hours for each day. Leave empty for days vendor
                  is closed.
                </p>
                {[
                  "Monday",
                  "Tuesday",
                  "Wednesday",
                  "Thursday",
                  "Friday",
                  "Saturday",
                  "Sunday",
                ].map((day) => (
                  <div
                    key={day}
                    className="grid grid-cols-[120px_1fr_1fr] gap-4 items-start"
                  >
                    <div className="text-sm font-medium pt-2">{day}</div>
                    <FormField
                      control={form.control as Control<VendorFormValues>}
                      name={`schedule.weeklySchedule.${day}.startTime` as any}
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input
                              type="time"
                              placeholder="Start time"
                              {...field}
                              value={field.value || ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control as Control<VendorFormValues>}
                      name={`schedule.weeklySchedule.${day}.endTime` as any}
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input
                              type="time"
                              placeholder="End time"
                              {...field}
                              value={field.value || ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status */}
        <FormField
          control={form.control as Control<VendorFormValues>}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {validationError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700 font-medium">
              {validationError}
            </p>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={loading}>
            {loading && <HugeiconsIcon icon={Loader2} className="mr-2 h-4 w-4 animate-spin" />}
            {submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}
