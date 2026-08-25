import { HugeiconsIcon } from "@hugeicons/react";
import {
  Building02Icon as Building2,
  Call02Icon as Phone,
  Clock01Icon as Clock,
  CreditCardIcon as CreditCard,
  DollarSignIcon as DollarSign,
  Location01Icon as MapPin,
  Mail01Icon as Mail,
  NavigationIcon as Navigation,
  PackageIcon as Package,
  PercentIcon as Percent,
  User02Icon as User,
} from "@hugeicons/core-free-icons";
import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { Badge } from "@repo/ui/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import { Separator } from "@repo/ui/components/ui/separator";
import { formatKES } from "@/lib/utils";
import { ProtectedDisplayField } from "@/components/shared/ProtectedField";

interface Product {
  _id: string;
  name: string;
  price: number;
  status: "Active" | "Inactive" | "Archived";
  category_id: string;
}

interface Vendor {
  _id: string;
  name: string;
  contact: { name: string; phone: string; email: string };
  business_details?: {
    business_name: string;
    bank_code: string;
    account_number: string;
    kra_pin?: string;
  };
  address: {
    address_1?: string;
    address_2?: string;
    city?: string;
    country?: string;
  };
  coordinates: { lat: number; lng: number };
  service_radius: number;
  commission?: number;
  commission_type?: "percentage" | "fixed";
  status: "Active" | "Inactive";
  updated_at?: number;
  products?: Product[];
  schedule?: {
    is_fulltime: boolean;
    weeklySchedule?: {
      Monday?: { startTime: string; endTime: string };
      Tuesday?: { startTime: string; endTime: string };
      Wednesday?: { startTime: string; endTime: string };
      Thursday?: { startTime: string; endTime: string };
      Friday?: { startTime: string; endTime: string };
      Saturday?: { startTime: string; endTime: string };
      Sunday?: { startTime: string; endTime: string };
    };
  };
}

interface VendorDetailsDialogProps {
  vendor: Vendor | null;
  isOpen: boolean;
  onClose: () => void;
}

const getStatusColor = (status: string) =>
  status === "Active"
    ? "bg-green-100 text-green-800 border-green-200"
    : status === "Inactive"
      ? "bg-red-100 text-red-800 border-red-200"
      : "bg-gray-100 text-gray-800 border-gray-200";

const InfoItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | React.ReactNode;
}> = ({ icon, label, value }) => (
  <div className="flex items-start gap-3 py-2">
    <div className="text-muted-foreground mt-0.5">{icon}</div>
    <div className="flex-1 min-w-0">
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-medium break-words">{value}</p>
    </div>
  </div>
);

const ProductCard: React.FC<{ product: Product }> = ({ product }) => (
  <Card className="hover:shadow-md transition-shadow">
    <CardContent className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="bg-primary/10 p-2 rounded-lg shrink-0">
            <HugeiconsIcon icon={Package} className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-sm mb-1">{product.name}</h4>
            <p className="text-lg font-bold text-primary">
              {formatKES(product.price)}
            </p>
          </div>
        </div>
        {/* <Badge variant="outline" className={getStatusColor(product.status)}>
          {product.status}
        </Badge> */}
      </div>
    </CardContent>
  </Card>
);

const MapPlaceholder: React.FC<{ vendor: Vendor }> = ({ vendor }) => {
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${
    vendor.coordinates.lng - 0.01
  },${vendor.coordinates.lat - 0.01},${vendor.coordinates.lng + 0.01},${
    vendor.coordinates.lat + 0.01
  }&layer=mapnik&marker=${vendor.coordinates.lat},${vendor.coordinates.lng}`;

  return (
    <div className="relative rounded-lg overflow-hidden border bg-muted h-[250px]">
      <iframe
        width="100%"
        height="100%"
        frameBorder="0"
        scrolling="no"
        src={mapUrl}
        title="Vendor Location Map"
        className="absolute inset-0"
      />
      <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur-sm px-3 py-2 rounded-lg shadow-md border">
        <div className="flex items-center gap-2 text-xs">
          <HugeiconsIcon icon={Navigation} className="h-3 w-3 text-primary" />
          <span className="font-medium">
            {vendor.service_radius}m Service Radius
          </span>
        </div>
      </div>
    </div>
  );
};

export default function VendorDetailsDialog({
  vendor,
  isOpen,
  onClose,
}: VendorDetailsDialogProps) {
  if (!vendor) return null;

  const fullAddress = [
    vendor.address.address_1,
    vendor.address.address_2,
    vendor.address.city,
    vendor.address.country,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-3 rounded-lg">
                <HugeiconsIcon icon={Building2} className="h-6 w-6 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-2xl">{vendor.name}</DialogTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Vendor Details
                </p>
              </div>
            </div>
            <Badge
              variant="outline"
              className={`${getStatusColor(vendor.status)} text-sm px-3 py-1`}
            >
              {vendor.status}
            </Badge>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto mt-4 space-y-6 pr-2">
          {/* Contact & Location Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Contact Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <HugeiconsIcon icon={User} className="h-5 w-5" />
                  Contact Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <InfoItem
                  icon={<HugeiconsIcon icon={User} className="h-4 w-4" />}
                  label="Contact Person"
                  value={vendor.contact.name}
                />
                <Separator />
                <InfoItem
                  icon={<HugeiconsIcon icon={Phone} className="h-4 w-4" />}
                  label="Phone Number"
                  value={vendor.contact.phone}
                />
                <Separator />
                <InfoItem
                  icon={<HugeiconsIcon icon={Mail} className="h-4 w-4" />}
                  label="Email Address"
                  value={vendor.contact.email}
                />
              </CardContent>
            </Card>

            {/* Business Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <HugeiconsIcon icon={Building2} className="h-5 w-5" />
                  Business Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <InfoItem
                  icon={<HugeiconsIcon icon={Building2} className="h-4 w-4" />}
                  label="Business Name"
                  value={
                    vendor.business_details?.business_name || "Not provided"
                  }
                />
                <Separator />
                <ProtectedDisplayField
                  icon={<HugeiconsIcon icon={CreditCard} className="h-4 w-4" />}
                  label="Bank Code"
                  hasValue={!!vendor.business_details?.bank_code}
                />
                <Separator />
                <ProtectedDisplayField
                  icon={<HugeiconsIcon icon={CreditCard} className="h-4 w-4" />}
                  label="Account Number"
                  hasValue={!!vendor.business_details?.account_number}
                />
                <Separator />
                <InfoItem
                  icon={<HugeiconsIcon icon={Building2} className="h-4 w-4" />}
                  label="KRA PIN"
                  value={vendor.business_details?.kra_pin || "Not provided"}
                />
                <Separator />
                <InfoItem
                  icon={<HugeiconsIcon icon={Navigation} className="h-4 w-4" />}
                  label="Service Radius"
                  value={`${vendor.service_radius} meters`}
                />
                <Separator />
                <InfoItem
                  icon={
                    vendor.commission_type === "percentage" ? (
                      <HugeiconsIcon icon={Percent} className="h-4 w-4" />
                    ) : (
                      <HugeiconsIcon icon={DollarSign} className="h-4 w-4" />
                    )
                  }
                  label="Commission"
                  value={
                    vendor.commission
                      ? `${vendor.commission}${
                          vendor.commission_type === "percentage"
                            ? "%"
                            : " (Fixed)"
                        }`
                      : "Not set"
                  }
                />
                <Separator />
                <InfoItem
                  icon={<HugeiconsIcon icon={MapPin} className="h-4 w-4" />}
                  label="Location"
                  value={fullAddress || "Not provided"}
                />
              </CardContent>
            </Card>
          </div>

          {/* Map Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <HugeiconsIcon icon={MapPin} className="h-5 w-5" />
                Vendor Location
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MapPlaceholder vendor={vendor} />
              <div className="mt-3 text-xs text-muted-foreground bg-muted/50 p-3 rounded-md">
                <p className="font-medium mb-1">Coordinates:</p>
                <p>
                  Latitude: {vendor.coordinates.lat.toFixed(6)}, Longitude:{" "}
                  {vendor.coordinates.lng.toFixed(6)}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Schedule Section */}
          {vendor.schedule && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <HugeiconsIcon icon={Clock} className="h-5 w-5" />
                  Operating Schedule
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                    <HugeiconsIcon icon={Clock} className="h-4 w-4" />
                    <span className="font-medium">
                      {vendor.schedule.is_fulltime
                        ? "Full-time (24/7 Operations)"
                        : "Part-time (Custom Schedule)"}
                    </span>
                  </div>

                  {!vendor.schedule.is_fulltime &&
                    vendor.schedule.weeklySchedule && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Weekly Hours</p>
                        <div className="space-y-1">
                          {Object.entries(vendor.schedule.weeklySchedule).map(
                            ([day, schedule]) =>
                              schedule && (
                                <div
                                  key={day}
                                  className="grid grid-cols-[120px_1fr] gap-4 py-2 px-3 bg-muted/30 rounded-md"
                                >
                                  <span className="font-medium text-sm">
                                    {day}
                                  </span>
                                  <span className="text-sm text-muted-foreground">
                                    {schedule.startTime} - {schedule.endTime}
                                  </span>
                                </div>
                              ),
                          )}
                        </div>
                        {Object.values(vendor.schedule.weeklySchedule).every(
                          (s) => !s,
                        ) && (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            No schedule hours set
                          </p>
                        )}
                      </div>
                    )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Products Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <HugeiconsIcon icon={Package} className="h-5 w-5" />
                Linked Products
                <Badge variant="secondary" className="ml-2">
                  {vendor.products?.length || 0}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {vendor.products && vendor.products.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {vendor.products.map((product) => (
                    <ProductCard key={product._id} product={product} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <HugeiconsIcon icon={Package} className="h-12 w-12 mx-auto mb-2 opacity-40" />
                  <p className="font-medium">No products linked</p>
                  <p className="text-sm">This vendor has no products yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
