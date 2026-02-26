// opiniones.js — Popup de contacto y copiado de email
window.CotoSorter = window.CotoSorter || {};

window.CotoSorter.opiniones = (function () {
  "use strict";

  const CONTACT_EMAIL = "facundoezequielmartinez@gmail.com";

  function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }

    return new Promise((resolve, reject) => {
      const helper = document.createElement("textarea");
      helper.value = text;
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      helper.style.pointerEvents = "none";
      document.body.appendChild(helper);
      helper.focus();
      helper.select();

      try {
        const ok = document.execCommand("copy");
        document.body.removeChild(helper);
        if (ok) resolve();
        else reject(new Error("execCommand copy failed"));
      } catch (err) {
        document.body.removeChild(helper);
        reject(err);
      }
    });
  }

  function showOpinionesPopup() {
    const existing = document.querySelector(".coto-sorter-opiniones-overlay");
    if (existing) return;

    const overlay = document.createElement("div");
    overlay.className = "coto-sorter-opiniones-overlay";

    const modal = document.createElement("div");
    modal.className = "coto-sorter-opiniones-modal";

    const text = document.createElement("p");
    text.className = "coto-sorter-opiniones-text";
    text.textContent =
      "Gracias por usar mi extension! " +
      "Tenes consejos, mejoras o viste algun bug? " +
      "Mandamelo a mi email asi lo tengo en cuenta!";

    const emailLabel = document.createElement("label");
    emailLabel.className = "coto-sorter-opiniones-label";
    emailLabel.textContent = "Email:";

    const emailInput = document.createElement("input");
    emailInput.className = "coto-sorter-opiniones-email";
    emailInput.type = "text";
    emailInput.readOnly = true;
    emailInput.value = CONTACT_EMAIL;

    const status = document.createElement("span");
    status.className = "coto-sorter-opiniones-status";

    const copyAndNotify = () => {
      copyTextToClipboard(CONTACT_EMAIL)
        .then(() => {
          status.textContent = "Email copiado";
        })
        .catch(() => {
          status.textContent = "No se pudo copiar";
        });
      emailInput.select();
    };

    emailInput.addEventListener("click", copyAndNotify);
    emailInput.addEventListener("focus", () => emailInput.select());

    const closeBtn = document.createElement("button");
    closeBtn.className = "coto-sorter-btn coto-sorter-opiniones-close";
    closeBtn.textContent = "Cerrar";

    const close = () => overlay.remove();
    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });

    modal.appendChild(text);
    modal.appendChild(emailLabel);
    modal.appendChild(emailInput);
    modal.appendChild(status);
    modal.appendChild(closeBtn);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    setTimeout(() => emailInput.focus(), 0);
  }

  return { showOpinionesPopup };
})();
