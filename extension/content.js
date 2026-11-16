(() => {
  "use strict";

  const rule = /\bpelicans?\b/i;
  const checked = "data-pelican-zapper-checked";

  // HN renders replies as flat sibling tr.comtr rows, not nested elements, and
  // hn.js looks up rows by getElementById and controls by first class match.
  function commentParts(row) {
    const body = row.querySelector(".commtext");
    const header = row.querySelector(".comhead");
    const comment = row.getElementsByClassName("comment")[0];
    const control = row.getElementsByClassName("togg")[0];
    const indent = row.getElementsByClassName("ind")[0];

    if ([body, header, comment, control, indent].some(
      element => !element || element.closest("tr.comtr") !== row,
    )) return null;

    if (
      !/^\d+$/.test(row.id) ||
      document.getElementById(row.id) !== row ||
      body.parentElement !== comment ||
      row.querySelector("tr.comtr") ||
      body.querySelector(".commtext") ||
      !header.contains(control) ||
      !control.matches("a.togg.clicky") ||
      control.id !== row.id ||
      control.getAttribute("href") !== "javascript:void(0)" ||
      !/^\d+$/.test(control.getAttribute("n") ?? "") ||
      !/^\d+$/.test(indent.getAttribute("indent") ?? "")
    ) return null;

    return { body, header, comment, control };
  }

  function bodyText(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    const text = [...node.childNodes].map(bodyText).join("");
    // Break words at block and <br> tags while keeping inline markup like
    // peli<i>can</i> intact. Reading textContent also works on hidden rows.
    return /^(P|BR|PRE|BLOCKQUOTE)$/.test(node.nodeName) ? `\n${text}\n` : text;
  }

  function collapseLocally(control) {
    // hn.js sends collapse?id=... only when #logout is in the DOM. Because click()
    // dispatches synchronously, stripping id="logout" around it keeps the toggle local.
    const logoutMarkers = [...document.querySelectorAll('[id="logout"]')];
    for (const element of logoutMarkers) element.removeAttribute("id");
    try {
      control.click();
    } finally {
      for (const element of logoutMarkers) element.id = "logout";
    }
  }

  // At document_idle, HN's end-of-page hn.js has already registered its click
  // handler. Walk bottom-up so nested matches collapse before an ancestor hides
  // them and stay collapsed if that ancestor is later expanded.
  const rows = [...document.querySelectorAll("tr.athing.comtr")].reverse();
  for (const row of rows) {
    if (row.hasAttribute(checked)) continue;
    const parts = commentParts(row);
    if (!parts || !rule.test(bodyText(parts.body))) continue;

    // Mark before checking .coll so pre-collapsed and manually expanded rows stay
    // untouched if the script runs again.
    row.setAttribute(checked, "true");
    const { header, comment, control } = parts;
    if (row.classList.contains("coll") || comment.classList.contains("noshow")) continue;

    try {
      collapseLocally(control);
    } catch {
      continue;
    }
    if (!row.classList.contains("coll") || !comment.classList.contains("noshow")) continue;

    const badge = document.createElement("span");
    badge.className = "pelican-zapper-badge";
    badge.textContent = "pelican zapped";
    header.append(badge);

    // hn.js calls stopImmediatePropagation() on toggle clicks, so watch the row's
    // class attribute to detect when the user expands it.
    const observer = new MutationObserver(() => {
      if (!row.classList.contains("coll")) {
        badge.remove();
        observer.disconnect();
      }
    });
    observer.observe(row, { attributes: true, attributeFilter: ["class"] });
  }
})();
