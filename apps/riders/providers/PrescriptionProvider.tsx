import React, { createContext, useContext, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@repo/backend";
import { Id } from "@repo/backend/dataModel";
import { useAuth } from "@/lib/auth";
import { isPicker as isPickerRole } from "@/lib/roles";

interface PrescriptionContextType {
  // Data
  awaitingPrescriptions: any[];
  isLoadingPrescriptions: boolean;

  // Mutations
  updateStatus: (
    prescriptionId: Id<"prescriptions">,
    status: "pending" | "approved" | "rejected",
    notes?: string,
  ) => Promise<void>;

  updateStatusWithReason: (
    prescriptionId: Id<"prescriptions">,
    status: "pending" | "approved" | "rejected",
    rejectionReasonId?: Id<"prescriptionRejectionReasons">,
    customNotes?: string,
  ) => Promise<void>;

  uploadPrescription: (
    prescriptionDocument: Id<"_storage">,
    vendorId: Id<"vendors">,
  ) => Promise<any>;

  // Helpers
  getDocumentUrl: (storageId: Id<"_storage">) => string | null; // Note: This is tricky with hooks, might need a separate hook
}

const PrescriptionContext = createContext<PrescriptionContextType | undefined>(
  undefined,
);

export function PrescriptionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();

  // Get current user to check role and ID
  const currentUser = useQuery(api.user.users.getCurrentUser, {
    clerkId: user?.id || "",
  });

  const pickerId = currentUser?._id;
  const isPicker = isPickerRole(currentUser?.roleName);

  // Fetch prescriptions awaiting verification (only for pickers)
  const awaitingPrescriptions = useQuery(
    api.data.prescriptions.getOrdersAwaitingPrescription,
    isPicker && pickerId ? { pickerId: pickerId as Id<"users"> } : "skip",
  );

  // Mutations
  const updateStatusMutation = useMutation(
    api.data.prescriptions.updatePrescriptionStatus,
  );
  const updateStatusWithReasonMutation = useMutation(
    api.data.prescriptions.updatePrescriptionStatusWithReason,
  );
  const uploadPrescriptionMutation = useMutation(
    api.data.prescriptions.uploadPrescriptionForVerification,
  );

  const updateStatus = async (
    prescriptionId: Id<"prescriptions">,
    status: "pending" | "approved" | "rejected",
    notes?: string,
  ) => {
    await updateStatusMutation({
      prescriptionId,
      status,
      notes,
    });
  };

  const updateStatusWithReason = async (
    prescriptionId: Id<"prescriptions">,
    status: "pending" | "approved" | "rejected",
    rejectionReasonId?: Id<"prescriptionRejectionReasons">,
    customNotes?: string,
  ) => {
    await updateStatusWithReasonMutation({
      prescriptionId,
      status,
      rejectionReasonId,
      customNotes,
    });
  };

  const uploadPrescription = async (
    prescriptionDocument: Id<"_storage">,
    vendorId: Id<"vendors">,
  ) => {
    if (!user?.id) throw new Error("User not authenticated");
    return await uploadPrescriptionMutation({
      prescriptionDocument,
      vendorId,
      clerkId: user.id,
    });
  };

  // Note: getDocumentUrl cannot be easily exposed as a function here because it requires a hook call.
  // Components should use useQuery(api.data.prescriptions.getPrescriptionDocumentUrl, ...) directly or we can create a custom hook.

  const value = useMemo(
    () => ({
      awaitingPrescriptions: awaitingPrescriptions || [],
      isLoadingPrescriptions: awaitingPrescriptions === undefined && isPicker,
      updateStatus,
      updateStatusWithReason,
      uploadPrescription,
      getDocumentUrl: () => null, // Placeholder, see note above
    }),
    [awaitingPrescriptions, isPicker],
  );

  return (
    <PrescriptionContext.Provider value={value}>
      {children}
    </PrescriptionContext.Provider>
  );
}

export function usePrescriptions() {
  const context = useContext(PrescriptionContext);
  if (context === undefined) {
    throw new Error(
      "usePrescriptions must be used within a PrescriptionProvider",
    );
  }
  return context;
}

// Helper hook for document URL
export function usePrescriptionDocumentUrl(storageId?: Id<"_storage">) {
  return useQuery(
    api.data.prescriptions.getPrescriptionDocumentUrl,
    storageId ? { storageId } : "skip",
  );
}
