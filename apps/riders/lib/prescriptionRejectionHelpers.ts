import { useMutation } from "convex/react";
import { api } from "@repo/backend";
import { Alert } from "react-native";

/**
 * Hook to seed the system with default prescription rejection reasons.
 * This should only be called once during setup by an admin user.
 */
export const useSeedRejectionReasons = () => {
  const seedSystemRejectionReasons = useMutation(
    api.data.prescription_rejection_reasons.seedSystemRejectionReasons
  );

  const seedDefaultReasons = async () => {
    try {
      const result = await seedSystemRejectionReasons({});
      Alert.alert(
        "Success",
        `Created ${result.length} default rejection reasons`
      );
      return result;
    } catch (error: any) {
      console.error("Failed to seed rejection reasons:", error);
      Alert.alert(
        "Error",
        error.message || "Failed to create default rejection reasons"
      );
      throw error;
    }
  };

  return { seedDefaultReasons };
};

/**
 * Helper function to initialize the prescription rejection system.
 * This can be called from a settings or admin screen.
 */
export const initializePrescriptionRejectionSystem = async (
  seedFunction: () => Promise<any>
) => {
  try {
    Alert.alert(
      "Initialize System",
      "This will create the default prescription rejection reasons. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Initialize",
          style: "default",
          onPress: async () => {
            try {
              await seedFunction();
            } catch (error) {
              // Error already handled in the seed function
            }
          },
        },
      ]
    );
  } catch (error) {
    console.error("Initialization error:", error);
  }
};
