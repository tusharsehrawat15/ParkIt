if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("SW registration failed:", err);
    });
  });
}

let deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;

  const installBtn = document.getElementById("installAppBtn");
  if (installBtn) {
    installBtn.classList.remove("hidden");
  }
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  const installBtn = document.getElementById("installAppBtn");
  if (installBtn) {
    installBtn.classList.add("hidden");
  }
});

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("#installAppBtn");
  if (!btn || !deferredInstallPrompt) return;

  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  if (outcome === "accepted") {
    btn.classList.add("hidden");
  }
  deferredInstallPrompt = null;
});