"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Loading03Icon as Loader2,
  PrinterIcon as Printer,
} from "@hugeicons/core-free-icons";
import React, { useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "@repo/backend";
import { Order } from "./types";
import { formatDate, DATE_FORMATS } from "@/lib/date-utils";
import { formatKES } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { Button } from "@repo/ui/components/ui/button";

interface PrintReceiptProps {
  order: Order;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Helper function to mask phone number (show first 4 and last 3 digits)
const maskPhoneNumber = (phone: string): string => {
  if (!phone || phone.length < 7) return phone;
  const first4 = phone.slice(0, 4);
  const last3 = phone.slice(-3);
  const masked = "*".repeat(Math.max(0, phone.length - 7));
  return `${first4}${masked}${last3}`;
};

// Helper function to mask email (show first 2 chars of username and domain)
const maskEmail = (email: string): string => {
  if (!email || !email.includes("@")) return email;
  const [username, domain] = email.split("@");
  // The includes("@") guard above means both parts exist, but the compiler
  // cannot see it. Returning the raw email here would defeat the masking, so an
  // unparseable address is masked entirely rather than passed through.
  if (!username || !domain) return "***";
  if (username.length <= 2) {
    return `${username}***@${domain}`;
  }
  const maskedUsername = `${username.slice(0, 2)}${"*".repeat(Math.max(1, username.length - 2))}`;
  return `${maskedUsername}@${domain}`;
};

export function PrintReceipt({ order, open, onOpenChange }: PrintReceiptProps) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const orderItems = useQuery(api.data.order_items.listByOrder, {
    orderId: order._id,
  });

  // Mask sensitive information
  const maskedPhone = order.customer_phone
    ? maskPhoneNumber(order.customer_phone)
    : undefined;
  const maskedEmail = order.customer_email
    ? maskEmail(order.customer_email)
    : undefined;

  const handlePrint = () => {
    const printContent = receiptRef.current;
    if (!printContent) return;

    // Create a new window for printing
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    // Write the receipt HTML with styles optimized for thermal printers
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt - ${order.reference}</title>
          <style>
            @media print {
              @page {
                size: 80mm auto;
                margin: 0;
              }
              body {
                margin: 0;
                padding: 0;
              }
            }
            
            body {
              font-family: 'Courier New', monospace;
              width: 80mm;
              margin: 0 auto;
              padding: 5mm;
              font-size: 12px;
              line-height: 1.4;
              color: #000;
              background: #fff;
            }
            
            .receipt-header {
              text-align: center;
              margin-bottom: 10px;
              border-bottom: 2px dashed #000;
              padding-bottom: 10px;
            }
            
            .store-name {
              font-size: 18px;
              font-weight: bold;
              margin-bottom: 5px;
              text-transform: uppercase;
            }
            
            .vendor-name {
              font-size: 14px;
              font-weight: bold;
              margin: 5px 0;
            }
            
            .receipt-info {
              margin: 10px 0;
              font-size: 11px;
            }
            
            .receipt-info-row {
              display: flex;
              justify-content: space-between;
              margin: 3px 0;
            }
            
            .items-section {
              margin: 10px 0;
              border-top: 2px dashed #000;
              border-bottom: 2px dashed #000;
              padding: 10px 0;
            }
            
            .items-header {
              font-weight: bold;
              margin-bottom: 8px;
              display: flex;
              justify-content: space-between;
              border-bottom: 1px solid #000;
              padding-bottom: 5px;
            }
            
            .item-row {
              margin: 8px 0;
              font-size: 11px;
            }
            
            .item-name {
              font-weight: bold;
              margin-bottom: 2px;
            }
            
            .item-details {
              display: flex;
              justify-content: space-between;
              margin-left: 5px;
              font-size: 10px;
            }
            
            .totals-section {
              margin: 10px 0;
              font-size: 11px;
            }
            
            .total-row {
              display: flex;
              justify-content: space-between;
              margin: 5px 0;
              padding: 2px 0;
            }
            
            .total-row.grand-total {
              font-size: 14px;
              font-weight: bold;
              border-top: 2px solid #000;
              border-bottom: 2px solid #000;
              padding: 8px 0;
              margin-top: 8px;
            }
            
            .payment-info {
              margin: 10px 0;
              text-align: center;
              font-size: 11px;
              border-top: 1px dashed #000;
              padding-top: 10px;
            }
            
            .order-reference {
              text-align: center;
              margin: 15px 0 10px;
              padding: 15px 10px;
              border: 3px solid #000;
              background: #f5f5f5;
            }
            
            .order-reference-label {
              font-size: 11px;
              margin-bottom: 5px;
              font-weight: normal;
            }
            
            .order-reference-number {
              font-size: 24px;
              font-weight: bold;
              letter-spacing: 2px;
              font-family: 'Courier New', monospace;
            }
            
            .footer {
              text-align: center;
              margin-top: 15px;
              font-size: 10px;
              border-top: 2px dashed #000;
              padding-top: 10px;
            }
            
            .thank-you {
              font-size: 13px;
              font-weight: bold;
              margin: 10px 0;
            }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();

    // Trigger print after a short delay to ensure content is loaded
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  if (!orderItems) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Loading Receipt...</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center p-8">
            <HugeiconsIcon icon={Loader2} className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Receipt Preview</DialogTitle>
          <DialogDescription>
            Preview the receipt before printing
          </DialogDescription>
        </DialogHeader>

        {/* Receipt Preview */}
        <div
          className="border rounded-lg p-4 bg-white"
          style={{ fontFamily: "'Courier New', monospace" }}
        >
          <div ref={receiptRef}>
            <div className="receipt-header">
              <div className="store-name">BLINK DELIVERY</div>
              <div className="vendor-name">{order.vendor_name || "Vendor"}</div>
              <div style={{ fontSize: "10px", marginTop: "5px" }}>
                {formatDate(order.order_date, DATE_FORMATS.FULL)}
              </div>
            </div>

            <div className="receipt-info">
              <div className="receipt-info-row">
                <span>Customer:</span>
                <span>{order.customer_name || "Customer"}</span>
              </div>
              {maskedPhone && (
                <div className="receipt-info-row">
                  <span>Phone:</span>
                  <span>{maskedPhone}</span>
                </div>
              )}
              {maskedEmail && (
                <div className="receipt-info-row">
                  <span>Email:</span>
                  <span>{maskedEmail}</span>
                </div>
              )}
              <div className="receipt-info-row">
                <span>Payment Status:</span>
                <span>
                  {order.payment_status === "Paid" ? "Paid" : "Pay On Delivery"}
                </span>
              </div>
            </div>

            <div className="items-section">
              <div className="items-header">
                <span>ITEM</span>
                <span>TOTAL</span>
              </div>

              {orderItems.map((item: any, index: number) => (
                <div key={index} className="item-row">
                  <div className="item-name">{item.name}</div>
                  <div className="item-details">
                    <span>
                      {item.quantity} x {formatKES(item.price)}
                    </span>
                    <span style={{ fontWeight: "bold" }}>
                      {formatKES(item.total)}
                    </span>
                  </div>
                  {item.discount > 0 && (
                    <div
                      className="item-details"
                      style={{ color: "#666", fontSize: "9px" }}
                    >
                      <span>Discount:</span>
                      <span>-{formatKES(item.discount)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="totals-section">
              <div className="total-row">
                <span>Subtotal:</span>
                <span>{formatKES(order.subtotal_amount)}</span>
              </div>
              {order.tax_amount > 0 && (
                <div className="total-row">
                  <span>Tax:</span>
                  <span>{formatKES(order.tax_amount)}</span>
                </div>
              )}
              {order.discount_amount > 0 && (
                <div className="total-row">
                  <span>Discount:</span>
                  <span>-{formatKES(order.discount_amount)}</span>
                </div>
              )}
              <div className="total-row">
                <span>Delivery Fee:</span>
                <span>{formatKES(order.delivery_fee)}</span>
              </div>
              <div className="total-row grand-total">
                <span>TOTAL:</span>
                <span>{formatKES(order.total_amount)}</span>
              </div>
            </div>

            <div className="order-reference">
              <div className="order-reference-label">ORDER REFERENCE</div>
              <div className="order-reference-number">
                #{order.reference.slice(-6)}
              </div>
            </div>

            <div className="footer">
              <div className="thank-you">THANK YOU FOR YOUR ORDER!</div>
              <div style={{ marginTop: "8px" }}>
                For support, contact us at
                <br />
                support@blinkhub.com
              </div>
            </div>
          </div>
        </div>

        {/* Print Button */}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handlePrint}>
            <HugeiconsIcon icon={Printer} className="mr-2 h-4 w-4" />
            Print Receipt
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
