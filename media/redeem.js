// @ts-check
/* CodeSlot Redeem webview — 3-step flow. No network access (CSP). The API key
   is requested natively by the extension host, never typed into this window. */
(function () {
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);

  const state = {
    step: 1,
    models: [],
    creditUsd: 0.001, // 1 credit = $0.001
    feeRate: 0.05,
    minCredits: 5000,
    balanceCredits: 0,
    currency: "usd", // display currency for the balance line
    rate: 1, // live USD→INR when currency is INR
    model: null,
    amountCredits: 0,
    key: null,
  };

  function money(n) {
    return "$" + (Math.round(Number(n) * 100) / 100).toFixed(2);
  }
  function usd(credits) {
    return money(Number(credits) * state.creditUsd);
  }
  // The developer's balance in their display currency (₹ uses the live rate).
  // The redemption breakdown itself stays in USD — the OpenRouter key is USD.
  function bal(credits) {
    const inUsd = Number(credits) * state.creditUsd;
    if (state.currency === "inr") {
      return "₹" + Math.round(inUsd * state.rate).toLocaleString("en-IN");
    }
    return money(inUsd);
  }
  function cr(credits) {
    return Math.round(Number(credits)).toLocaleString("en-US") + " cr";
  }
  function belowMin() {
    return state.amountCredits < state.minCredits;
  }

  function showStep(n) {
    state.step = n;
    for (const s of [1, 2, 3]) {
      $("step" + s).hidden = s !== n;
    }
    const next = $("next");
    if (n === 1) {
      next.textContent = "Next →";
      next.disabled = !state.model;
    } else if (n === 2) {
      next.textContent = "Confirm Amount →";
      next.disabled = belowMin();
      renderAmount();
    } else {
      next.textContent = "🔒 Redeem Now";
      next.disabled = false;
      $("cfModel").textContent = state.model ? state.model.name : "—";
      $("cfValue").textContent = usd(state.amountCredits) + " · " + cr(state.amountCredits);
    }
  }

  function renderModels() {
    const grid = $("models");
    grid.textContent = "";
    for (const m of state.models) {
      const btn = document.createElement("button");
      btn.className = "model" + (state.model && state.model.id === m.id ? " selected" : "");
      btn.type = "button";

      const name = document.createElement("div");
      name.className = "name";
      name.textContent = m.name;
      const vendor = document.createElement("div");
      vendor.className = "vendor";
      vendor.textContent = m.vendor;
      btn.appendChild(name);
      btn.appendChild(vendor);

      if (m.freeTier) {
        const tag = document.createElement("span");
        tag.className = "free";
        tag.textContent = "FREE TIER";
        btn.appendChild(tag);
      }
      const check = document.createElement("span");
      check.className = "check";
      check.textContent = "✓";
      btn.appendChild(check);

      btn.addEventListener("click", () => {
        state.model = m;
        renderModels();
        $("next").disabled = false;
      });
      grid.appendChild(btn);
    }
  }

  // Chips are expressed in dollars ($5/$10/$25/all); convert to whole credits.
  function setAmount(v) {
    const max = state.balanceCredits;
    let credits;
    if (v === "all") {
      credits = max;
    } else {
      credits = Math.round(Number(v) / state.creditUsd); // dollars → credits
    }
    if (!isFinite(credits) || credits < 0) credits = 0;
    state.amountCredits = Math.min(credits, max);
    renderAmount();
    $("next").disabled = belowMin();
  }

  function renderAmount() {
    const grossUsd = state.amountCredits * state.creditUsd;
    $("amountBig").textContent = grossUsd.toFixed(2);
    const fee = grossUsd * state.feeRate;
    $("bdCredits").textContent = usd(state.amountCredits) + " (" + cr(state.amountCredits) + ")";
    $("bdFee").textContent = "-" + money(fee);
    $("bdNet").textContent = money(grossUsd - fee);
    // Minimum hint.
    const hint = $("minHint");
    if (hint) {
      hint.hidden = !belowMin();
      hint.textContent =
        "Minimum redemption is " + cr(state.minCredits) + " (~" + usd(state.minCredits) + ").";
    }
    for (const c of document.querySelectorAll(".chip")) {
      c.classList.remove("active");
    }
  }

  window.addEventListener("message", (e) => {
    const msg = e.data || {};
    if (msg.type === "init") {
      state.models = msg.models || [];
      state.balanceCredits = Number(msg.balanceCredits) || 0;
      state.feeRate = Number(msg.feeRate) || 0.05;
      state.minCredits = Number(msg.minCredits) || 5000;
      state.creditUsd = Number(msg.creditUsd) || 0.001;
      state.currency = msg.currency === "inr" ? "inr" : "usd";
      state.rate = Number(msg.rate) > 0 ? Number(msg.rate) : 1;
      $("bal").textContent = bal(state.balanceCredits) + " (" + cr(state.balanceCredits) + ")";
      renderModels();
    } else if (msg.type === "busy") {
      $("next").disabled = !!msg.value;
      $("next").textContent = msg.value ? "Processing…" : "🔒 Redeem Now";
    } else if (msg.type === "result") {
      const s = $("status");
      s.hidden = false;
      s.className = "status " + (msg.ok ? "ok" : "err");
      s.textContent = msg.message;
      if (msg.ok && typeof msg.newBalance === "number") {
        state.balanceCredits = msg.newBalance;
        $("bal").textContent = bal(state.balanceCredits) + " (" + cr(state.balanceCredits) + ")";
      }
      if (msg.ok && typeof msg.key === "string") {
        state.key = msg.key;
        showKey(msg);
      }
    }
  });

  function showKey(msg) {
    // Reveal the key box and hide the step/footer controls.
    for (const s of [1, 2, 3]) $("step" + s).hidden = true;
    $("next").hidden = true;
    const box = $("keybox");
    box.hidden = false;
    $("keyField").value = msg.key;
    const credit = typeof msg.credit === "number" ? money(msg.credit) : "";
    $("keySub").textContent =
      (msg.keyName ? msg.keyName + " · " : "") +
      (credit ? credit + " credit limit · copied to clipboard" : "copied to clipboard");
  }

  function bindKeyBox() {
    $("keyReveal").addEventListener("click", () => {
      const f = $("keyField");
      f.type = f.type === "password" ? "text" : "password";
    });
    $("keyCopy").addEventListener("click", () => {
      if (state.key) vscode.postMessage({ type: "copyKey", key: state.key });
    });
  }

  $("next").addEventListener("click", () => {
    if (state.step === 1 && state.model) showStep(2);
    else if (state.step === 2 && !belowMin()) showStep(3);
    else if (state.step === 3) {
      vscode.postMessage({
        type: "confirm",
        model: state.model.id,
        amount: state.amountCredits, // whole credits
      });
    }
  });

  document.body.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.dataset.back) showStep(Number(t.dataset.back));
    if (t.dataset.amt) {
      setAmount(t.dataset.amt);
      t.classList.add("active");
    }
  });

  bindKeyBox();
  showStep(1);
  vscode.postMessage({ type: "ready" });
})();
