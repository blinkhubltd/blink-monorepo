import * as Print from "expo-print";
import { Platform, Alert } from "react-native";
import { generateReceiptHTML } from "./receiptTemplate";

interface PrintReceiptParams {
  order: any;
  vendor?: any;
  customer?: any;
  picker?: any;
  rider?: any;
  items?: any[];
}

/**
 * Prints a receipt using expo-print
 * Works on both iOS and Android
 */
export async function printReceipt(data: PrintReceiptParams): Promise<void> {
  try {
    // Generate the HTML receipt
    const html = generateReceiptHTML({
      order: data.order,
      vendor: data.vendor,
      customer: data.customer,
      picker: data.picker,
      rider: data.rider,
      items: data.items,
    });

    // Print options for 80mm receipt (thermal printer standard)
    const printOptions = {
      html,
      width: 80 * 3.78, // 80mm in points (1mm = 3.78 points)
      height: 1122, // A4 height in points (can be adjusted)
    };

    // On iOS, this opens the print dialog
    // On Android, this uses the system print service
    await Print.printAsync(printOptions);
  } catch (error: any) {
    console.error("Print error:", error);
    Alert.alert(
      "Print Error",
      error?.message || "Failed to print receipt. Please try again.",
      [{ text: "OK" }]
    );
  }
}

/**
 * Saves receipt as a PDF file (alternative to printing)
 * Useful for preview or when printer is not available
 */
export async function saveReceiptAsPDF(
  data: PrintReceiptParams
): Promise<string | null> {
  try {
    const html = generateReceiptHTML({
      order: data.order,
      vendor: data.vendor,
      customer: data.customer,
      picker: data.picker,
      rider: data.rider,
      items: data.items,
    });

    const { uri } = await Print.printToFileAsync({
      html,
      width: 80 * 3.78,
      height: 1122,
    });

    return uri;
  } catch (error: any) {
    console.error("Save PDF error:", error);
    Alert.alert(
      "Save Error",
      error?.message || "Failed to save receipt as PDF.",
      [{ text: "OK" }]
    );
    return null;
  }
}
