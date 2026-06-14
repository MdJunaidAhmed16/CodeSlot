"use client";

// Loads Razorpay Checkout and opens it for an order. On success, the backend
// webhook credits the wallet; the client just polls/refreshes afterwards.
type RazorpayResult = { provider: string; order_id?: string; key_id?: string; amount_minor?: number; currency?: string };

let loading: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (typeof window !== "undefined" && (window as unknown as { Razorpay?: unknown }).Razorpay) {
    return Promise.resolve();
  }
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Failed to load Razorpay"));
      document.body.appendChild(s);
    });
  }
  return loading;
}

export async function openRazorpay(r: RazorpayResult, onDone: () => void): Promise<void> {
  await loadScript();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Razorpay = (window as any).Razorpay;
  const rzp = new Razorpay({
    key: r.key_id,
    order_id: r.order_id,
    amount: r.amount_minor,
    currency: r.currency,
    name: "CodeSlot",
    description: "Wallet top-up",
    handler: () => setTimeout(onDone, 1500), // webhook credits server-side
    theme: { color: "#f5c518" },
  });
  rzp.open();
}
