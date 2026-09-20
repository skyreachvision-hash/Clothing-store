import { sendTransactionalEmail } from "./email-service.js";

function clean(value) {
  return String(value ?? "").trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/*
 * Communication orchestration layer.
 *
 * Business features call this module with a communication intent such as
 * "order confirmation". They do not choose Gmail, Resend, a domain, or any
 * other delivery provider. Delivery remains behind the email adapter.
 */
export async function sendOrderConfirmation(env, transaction, order, checkoutData) {
  const customer = checkoutData?.customer || {};
  const shipping = checkoutData?.shipping || {};
  const lineItems = Array.isArray(checkoutData?.line_items) ? checkoutData.line_items : [];
  const recipient = clean(transaction.customer_email);

  if (!recipient || !lineItems.length) {
    return { sent: false, skipped: true, reason: "Order confirmation recipient or items are missing." };
  }

  const itemRows = lineItems.map(item => {
    const quantity = Number(item.quantity || 0);
    const unitPrice = Number(item.unit_price || 0);
    const lineTotal = unitPrice * quantity;
    return "<tr><td style=\"padding:8px 0\">" + escapeHtml(item.name) + " × " + quantity + "</td><td style=\"padding:8px 0;text-align:right\">" + escapeHtml(transaction.currency) + " " + lineTotal.toFixed(2) + "</td></tr>";
  }).join("");

  const customerName = clean(customer.full_name);
  const greeting = customerName ? "Hi " + escapeHtml(customerName) + "," : "Hello,";
  const shippingText = [customer.address, customer.city, customer.province, customer.postal_code, customer.country]
    .filter(Boolean)
    .map(escapeHtml)
    .join(", ");
  const textItems = lineItems.map(item => {
    const lineTotal = Number(item.unit_price || 0) * Number(item.quantity || 0);
    return "- " + clean(item.name) + " x " + Number(item.quantity || 0) + ": " + clean(transaction.currency) + " " + lineTotal.toFixed(2);
  }).join("\n");
  const subtotal = lineItems.reduce(
    (sum, item) => sum + Number(item.unit_price || 0) * Number(item.quantity || 0),
    0
  );

  const html = "<div style=\"font-family:Arial,sans-serif;line-height:1.6;color:#222\">" +
    "<h2>Order confirmed</h2>" +
    "<p>" + greeting + "</p>" +
    "<p>Thank you for your purchase. We have received your payment and your order is now being prepared.</p>" +
    "<p><strong>Order number:</strong> " + escapeHtml(order.order_number) + "</p>" +
    "<table style=\"width:100%;border-collapse:collapse\"><tbody>" + itemRows +
    "<tr><td style=\"padding:12px 0 4px\"><strong>Subtotal</strong></td><td style=\"padding:12px 0 4px;text-align:right\"><strong>" + escapeHtml(transaction.currency) + " " + subtotal.toFixed(2) + "</strong></td></tr>" +
    "<tr><td style=\"padding:4px 0\">Delivery</td><td style=\"padding:4px 0;text-align:right\">" + escapeHtml(transaction.currency) + " " + Number(shipping.fee || 0).toFixed(2) + "</td></tr>" +
    "<tr><td style=\"padding:8px 0\"><strong>Total</strong></td><td style=\"padding:8px 0;text-align:right\"><strong>" + escapeHtml(transaction.currency) + " " + Number(transaction.amount).toFixed(2) + "</strong></td></tr>" +
    "</tbody></table>" +
    (shippingText ? "<p><strong>Delivery address:</strong><br>" + shippingText + "</p>" : "") +
    "<p>Order status: <strong>Pending</strong></p></div>";

  const text = "Order confirmed\n\n" +
    (customerName ? "Hi " + customerName + ",\n\n" : "") +
    "Thank you for your purchase. We have received your payment and your order is now being prepared.\n\n" +
    "Order number: " + clean(order.order_number) + "\n\n" +
    "Items:\n" + textItems + "\n\n" +
    "Subtotal: " + clean(transaction.currency) + " " + subtotal.toFixed(2) + "\n" +
    "Delivery: " + clean(transaction.currency) + " " + Number(shipping.fee || 0).toFixed(2) + "\n" +
    "Total: " + clean(transaction.currency) + " " + Number(transaction.amount).toFixed(2) + "\n\n" +
    (shippingText ? "Delivery address: " + [customer.address, customer.city, customer.province, customer.postal_code, customer.country].filter(Boolean).map(clean).join(", ") + "\n\n" : "") +
    "Order status: Pending";

  try {
    return await sendTransactionalEmail(env, {
      to: recipient,
      subject: "Order confirmation " + clean(order.order_number),
      html,
      text
    });
  } catch (error) {
    console.error("Order confirmation communication failed", {
      order_id: order.id,
      order_number: order.order_number,
      recipient,
      error: error?.message || String(error)
    });
    return { sent: false, failed: true, reason: error?.message || "Delivery failed." };
  }
}
