// @ts-check
/* CodeSlot Wallet webview. No network access (CSP connect-src 'none');
   all data arrives via postMessage from the trusted extension host. */
(function () {
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);

  const CREDIT_USD = 0.001; // 1 credit = $0.001

  function usd(credits) {
    return "$" + (Number(credits) * CREDIT_USD).toFixed(2);
  }
  function cr(credits) {
    return Math.round(Number(credits)).toLocaleString("en-US") + " cr";
  }

  function renderBalance(d) {
    $("balance").textContent = usd(d.balance);
    $("tokens").textContent =
      cr(d.balance) + " · " + cr(d.lifetime_earned) + " earned all-time";

    const t = d.stats_today;
    $("today").textContent = t
      ? `${t.impressions} impressions · ${t.clicks} clicks · `
      : "No activity yet today.";
    if (t) {
      const b = document.createElement("b");
      b.textContent = "+" + cr(t.earned) + " (" + usd(t.earned) + ")";
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
      amt.textContent = "+" + cr(r.credits_awarded);
      li.appendChild(left);
      li.appendChild(amt);
      list.appendChild(li);
    }
  }

  window.addEventListener("message", (e) => {
    const msg = e.data || {};
    switch (msg.type) {
      case "balance":
        renderBalance(msg.data);
        $("error").hidden = true;
        break;
      case "balanceQuick":
        $("balance").textContent = usd(msg.value);
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
