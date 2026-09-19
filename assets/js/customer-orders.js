import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { firebaseConfig } from "./firebase-config.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const page = document.querySelector("[data-customer-orders-page]");

function esc(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c])); }
function money(amount, currency="ZAR") { try { return new Intl.NumberFormat("en-ZA",{style:"currency",currency}).format(Number(amount||0)); } catch { return `${currency} ${Number(amount||0).toFixed(2)}`; } }
function date(value) { const d=new Date(String(value||"").replace(" ","T")+"Z"); return Number.isNaN(d.getTime()) ? String(value||"") : new Intl.DateTimeFormat("en-ZA",{dateStyle:"medium",timeStyle:"short"}).format(d); }

async function loadOrders(user) {
  page.innerHTML = `<div class="account-card"><div class="settings-heading"><div><p class="eyebrow">Order history</p><h1>My Orders</h1><p class="muted">View your purchases and follow their current status.</p></div><a class="button button-outline" href="account.html">Back to Account</a></div><div class="customer-orders-list" data-orders-list><p class="settings-load-status">Loading your orders…</p></div><div class="customer-order-detail" data-order-detail hidden></div></div>`;
  const list=page.querySelector("[data-orders-list]"), detail=page.querySelector("[data-order-detail]");
  try {
    const token=await user.getIdToken();
    const response=await fetch("/api/customer-orders",{headers:{Authorization:`Bearer ${token}`,Accept:"application/json"},cache:"no-store"});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||!payload.success) throw new Error(payload.error||"Unable to load your orders.");
    const orders=Array.isArray(payload.data)?payload.data:[];
    if(!orders.length){list.innerHTML='<div class="customer-orders-empty"><h3>No orders yet</h3><p class="muted">Your completed purchases will appear here.</p><a class="button button-primary" href="index.html">Start shopping</a></div>';return;}
    list.innerHTML=orders.map(o=>`<button class="customer-order-card" type="button" data-order-id="${Number(o.id)}"><span><strong>${esc(o.order_number)}</strong><small>${esc(date(o.created_at))}</small></span><span><strong>${esc(money(o.total,o.currency))}</strong><small>${esc(o.order_status)}</small></span><span class="customer-order-arrow" aria-hidden="true">→</span></button>`).join("");
    list.querySelectorAll("[data-order-id]").forEach(b=>b.addEventListener("click",()=>loadDetail(user,Number(b.dataset.orderId))));
  } catch(error) { list.innerHTML=`<p class="settings-notice">${esc(error.message||"Unable to load your orders.")}</p>`; }

  async function loadDetail(currentUser,id){
    detail.hidden=false; detail.innerHTML='<p class="settings-load-status">Loading order details…</p>'; detail.scrollIntoView({behavior:"smooth",block:"start"});
    try {
      const token=await currentUser.getIdToken();
      const response=await fetch(`/api/customer-orders?id=${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${token}`,Accept:"application/json"},cache:"no-store"});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok||!payload.success) throw new Error(payload.error||"Unable to load this order.");
      const {order,items=[]}=payload.data||{};
      detail.innerHTML=`<div class="settings-heading"><div><p class="eyebrow">Order details</p><h2>${esc(order.order_number)}</h2><p class="muted">${esc(date(order.created_at))}</p></div><button class="button button-outline button-small" type="button" data-close-order>Close</button></div><div class="customer-order-status-row"><span>Payment: <strong>${esc(order.payment_status)}</strong></span><span>Order: <strong>${esc(order.order_status)}</strong></span></div><div class="customer-order-grid"><div><p class="settings-readonly">Delivery</p><p>${esc(order.customer_full_name)}<br>${esc(order.customer_phone)}</p><p>${esc(order.shipping_address)}<br>${esc([order.shipping_city,order.shipping_province,order.shipping_postal_code].filter(Boolean).join(", "))}<br>${esc(order.shipping_country)}</p><p class="muted">${esc(order.shipping_method_name)}${order.shipping_option_name?" · "+esc(order.shipping_option_name):""}</p></div><div><p class="settings-readonly">Items</p><div class="customer-order-items">${items.map(i=>`<div class="customer-order-item"><span>${esc(i.product_name)} × ${Number(i.quantity)}</span><strong>${esc(money(i.line_total,i.currency))}</strong></div>`).join("")}</div><div class="customer-order-total"><span>Subtotal</span><strong>${esc(money(order.subtotal,order.currency))}</strong></div><div class="customer-order-total"><span>Delivery</span><strong>${esc(money(order.shipping_fee,order.currency))}</strong></div><div class="customer-order-total customer-order-grand-total"><span>Total</span><strong>${esc(money(order.total,order.currency))}</strong></div></div></div>${order.customer_notes||order.delivery_landmark?`<div class="customer-order-notes">${order.customer_notes?`<p><strong>Notes:</strong> ${esc(order.customer_notes)}</p>`:""}${order.delivery_landmark?`<p><strong>Landmark:</strong> ${esc(order.delivery_landmark)}</p>`:""}</div>`:""}`;
      detail.querySelector("[data-close-order]")?.addEventListener("click",()=>{detail.hidden=true;detail.innerHTML="";});
    } catch(error){detail.innerHTML=`<p class="settings-notice">${esc(error.message||"Unable to load this order.")}</p>`;}
  }
}
onAuthStateChanged(auth,user=>{if(user)loadOrders(user);else page.innerHTML='<div class="account-card"><p class="eyebrow">Customer account</p><h1>Sign in required</h1><p class="muted">Please sign in to view your orders.</p><a class="button button-primary" href="account.html">Go to Account</a></div>';});
