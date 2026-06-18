// @ts-check
/* CodeSlot Wallet webview. No network access (CSP connect-src 'none');
   all data arrives via postMessage from the trusted extension host. */
(function () {
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);

  const CREDIT_USD = 0.001; // 1 credit = $0.001
  // Display currency + live rate, pushed by the host (defaults to USD).
  const disp = { currency: "usd", rate: 1 };

  /** Whole credits → real money in the display currency. Adaptive precision so
   *  a single impression's fraction-of-a-rupee earning never shows as ₹0. */
  function money(credits) {
    const usd = Number(credits) * CREDIT_USD;
    const val = disp.currency === "inr" ? usd * disp.rate : usd;
    if (disp.currency === "inr") {
      if (val === 0) return "₹0";
      if (val >= 1) return "₹" + Math.round(val).toLocaleString("en-IN");
      return "₹" + val.toFixed(val >= 0.1 ? 2 : val >= 0.01 ? 3 : 4);
    }
    if (val === 0) return "$0.00";
    if (val >= 0.01) return "$" + val.toFixed(2);
    return "$" + val.toFixed(val >= 0.001 ? 3 : 4);
  }
  function cr(credits) {
    return Math.round(Number(credits)).toLocaleString("en-US") + " cr";
  }

  let last = null; // remember the last balance payload to re-render on currency change

  function renderBalance(d) {
    last = d;
    $("balance").textContent = money(d.balance);
    // Raw credits live on as a small secondary note under the money figure.
    $("tokens").textContent =
      cr(d.balance) + " · " + cr(d.lifetime_earned) + " earned all-time";

    const t = d.stats_today;
    $("today").textContent = t
      ? `${t.impressions} impressions · ${t.clicks} clicks · `
      : "No activity yet today.";
    if (t) {
      const b = document.createElement("b");
      b.textContent = "+" + money(t.earned);
      $("today").appendChild(b);
    }

    const list = $("recent");
    list.textContent = "";
    if (!d.recent || d.recent.length === 0) {
      const li = document.createElement("li");
      li.className = "meta";
      li.textContent = "Nothing shown yet.";
      list.appendChild(li);
      return;
    }
    for (const r of d.recent) {
      const li = document.createElement("li");
      const left = document.createElement("div");
      const name = document.createElement("div");
      name.textContent = r.advertiser_name; // textContent => no HTML injection
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = r.event_type;
      left.appendChild(name);
      left.appendChild(meta);
      const amt = document.createElement("div");
      amt.className = "amt";
      amt.textContent = "+" + money(r.credits_awarded);
      li.appendChild(left);
      li.appendChild(amt);
      list.appendChild(li);
    }
  }

  window.addEventListener("message", (e) => {
    const msg = e.data || {};
    switch (msg.type) {
      case "money":
        disp.currency = msg.currency === "inr" ? "inr" : "usd";
        disp.rate = Number(msg.rate) > 0 ? Number(msg.rate) : 1;
        if (last) renderBalance(last); // re-render with the new currency
        break;
      case "balance":
        renderBalance(msg.data);
        $("error").hidden = true;
        break;
      case "balanceQuick":
        $("balance").textContent = money(msg.value);
        break;
      case "enabled":
        $("enabled").checked = !!msg.value;
        break;
      case "error":
        $("error").hidden = false;
        $("error").textContent = msg.message;
        break;
    }
  });

  $("redeem").addEventListener("click", () => vscode.postMessage({ type: "redeem" }));
  $("refresh").addEventListener("click", () => vscode.postMessage({ type: "refresh" }));
  $("enabled").addEventListener("change", (e) =>
    vscode.postMessage({ type: "setEnabled", value: e.target.checked })
  );

  vscode.postMessage({ type: "ready" });
})();
