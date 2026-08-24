import { maskPhone, maskEmail } from "./privacy";
import { formatKES } from "./currency";

interface ReceiptData {
  order: {
    _id: string;
    reference?: string;
    order_date: number;
    total_amount: number;
    delivery_fee?: number;
    discount?: number;
    subtotal?: number;
    special_instructions?: string;
  };
  vendor?: {
    name: string;
  };
  customer?: {
    name: string;
    phone?: string;
    email?: string;
  };
  picker?: {
    name: string;
  };
  rider?: {
    name: string;
    phone?: string;
  };
  items?: Array<{
    name: string;
    quantity: number;
    price: number;
    unit_value?: string;
    unit_type?: string;
  }>;
}

/**
 * Generates supermarket-style receipt HTML for 80mm thermal printers
 * Width: ~300px (80mm ≈ 302px at 96 DPI)
 */
export function generateReceiptHTML(data: ReceiptData): string {
  const { order, vendor, customer, picker, rider, items = [] } = data;

  const orderRef =
    order.reference || `#${String(order._id).slice(-8).toUpperCase()}`;
  const orderDate = new Date(order.order_date);
  const dateStr = orderDate.toLocaleDateString("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const timeStr = orderDate.toLocaleTimeString("en-KE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Calculate totals
  const subtotal =
    order.subtotal ||
    items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const deliveryFee = order.delivery_fee || 0;
  const discount = order.discount || 0;
  const total = order.total_amount;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Courier New', monospace;
      width: 300px;
      padding: 10px;
      background: white;
      color: #000;
      line-height: 1.3;
    }
    
    .receipt {
      width: 100%;
    }
    
    .header {
      text-align: center;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 2px dashed #000;
    }
    
    .vendor-name {
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 5px;
      text-transform: uppercase;
    }
    
    .order-ref {
      font-size: 14px;
      margin-bottom: 3px;
    }
    
    .datetime {
      font-size: 11px;
      margin-top: 8px;
    }
    
    .section {
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px dashed #000;
    }
    
    .section-title {
      font-size: 11px;
      font-weight: bold;
      margin-bottom: 5px;
      text-transform: uppercase;
    }
    
    .info-line {
      font-size: 10px;
      margin-bottom: 2px;
    }
    
    .items-table {
      width: 100%;
      margin-bottom: 12px;
      font-size: 10px;
    }
    
    .item-row {
      margin-bottom: 6px;
    }
    
    .item-name {
      font-weight: bold;
      margin-bottom: 2px;
    }
    
    .item-details {
      display: flex;
      justify-content: space-between;
    }
    
    .totals {
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px solid #000;
    }
    
    .total-row {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      margin-bottom: 4px;
    }
    
    .total-row.grand {
      font-size: 14px;
      font-weight: bold;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 2px solid #000;
    }
    
    .footer {
      text-align: center;
      margin-top: 15px;
      padding-top: 10px;
      border-top: 2px dashed #000;
    }
    
    .reference-bold {
      font-size: 16px;
      font-weight: bold;
      margin: 10px 0;
      letter-spacing: 1px;
    }
    
    .thank-you {
      font-size: 12px;
      margin-top: 10px;
    }
    
    .privacy-note {
      font-size: 8px;
      margin-top: 8px;
      color: #666;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="receipt">
    <!-- Header -->
    <div class="header">
      <div class="vendor-name">"BLINK DELIVERIES"}</div>
      <div class="order-ref">Order: ${orderRef.slice(-6).toUpperCase()}</div>
      <div class="datetime">${dateStr} - ${timeStr}</div>
    </div>
    
    <!-- Customer Info -->
    <div class="section">
      <div class="section-title">Customer</div>
      <div class="info-line">Name: ${customer?.name || "N/A"}</div>
      <div class="info-line">Phone: ${maskPhone(customer?.phone)}</div>
      ${customer?.email ? `<div class="info-line">Email: ${maskEmail(customer.email)}</div>` : ""}
    </div>
    
    <!-- Items -->
    <div class="section">
      <div class="section-title">Items (${items.length})</div>
      <div class="items-table">
        ${items
          .map(
            (item) => `
          <div class="item-row">
            <div class="item-name">${item.name}</div>
            <div class="item-details">
              <span>${item.quantity} x ${formatKES(item.price, { showSymbol: false })}</span>
              <span>${formatKES(item.price * item.quantity)}</span>
            </div>
            ${item.unit_value && item.unit_type ? `<div class="info-line" style="font-size: 9px; color: #555;">${item.unit_value}${item.unit_type}</div>` : ""}
          </div>
        `
          )
          .join("")}
      </div>
    </div>
    
    ${
      order.special_instructions
        ? `
    <div class="section">
      <div class="section-title">Special Instructions</div>
      <div class="info-line">${order.special_instructions}</div>
    </div>
    `
        : ""
    }
    
    <!-- Totals -->
    <div class="totals">
      <div class="total-row">
        <span>Subtotal:</span>
        <span>${formatKES(subtotal)}</span>
      </div>
      ${
        deliveryFee > 0
          ? `
      <div class="total-row">
        <span>Delivery Fee:</span>
        <span>${formatKES(deliveryFee)}</span>
      </div>
      `
          : ""
      }
      ${
        discount > 0
          ? `
      <div class="total-row" style="color: #c00;">
        <span>Discount:</span>
        <span>-${formatKES(discount)}</span>
      </div>
      `
          : ""
      }
      <div class="total-row grand">
        <span>TOTAL:</span>
        <span>${formatKES(total)}</span>
      </div>
    </div>
    
    <!-- Team Info -->
    ${
      picker || rider
        ? `
    <div class="section" style="margin-top: 12px;">
      <div class="section-title">Prepared By</div>
      ${picker ? `<div class="info-line">Picker: ${picker.name}</div>` : ""}
      ${rider ? `<div class="info-line">Rider: ${rider.name}</div>` : ""}
    </div>
    `
        : ""
    }
    
    <!-- Footer -->
    <div class="footer">
      <div class="reference-bold">${orderRef}</div>
      <div class="thank-you">Thank you for your order!</div>
    </div>
  </div>
</body>
</html>
  `.trim();
}
