// Clean-room test double modeling Hacker News's public comment-collapse DOM contract:
// - flat sibling tr.comtr rows with numeric indent levels on .ind[indent]
// - delegated document click listener on .clicky that stops immediate propagation
// - collapse state via tr.coll, .votelinks.nosee, .comment.noshow, and [n more]
// - GET collapse?id=<id>[&un=true] sent via XMLHttpRequest iff #logout is present
(() => {
  "use strict";

  function indentOf(row) {
    const ind = row.getElementsByClassName("ind")[0];
    if (!ind) return null;
    const depth = Number.parseFloat(ind.getAttribute("indent"));
    return Number.isNaN(depth) ? null : depth;
  }

  function nextCommentRow(row) {
    let cursor = row.nextElementSibling;
    while (cursor) {
      if (cursor.classList.contains("comtr")) return cursor;
      cursor = cursor.nextElementSibling;
    }
    return null;
  }

  function hideDescendants(parentRow) {
    const baseDepth = indentOf(parentRow);
    for (let row = nextCommentRow(parentRow); row && indentOf(row) > baseDepth; row = nextCommentRow(row)) {
      row.classList.add("noshow");
    }
  }

  function restoreDescendants(parentRow) {
    const baseDepth = indentOf(parentRow);
    for (let row = nextCommentRow(parentRow); row; row = nextCommentRow(row)) {
      const depth = indentOf(row);
      if (depth <= baseDepth) return;
      if (depth === baseDepth + 1) {
        row.classList.remove("noshow");
        if (row.classList.contains("coll")) {
          hideDescendants(row);
        } else {
          restoreDescendants(row);
        }
      }
    }
  }

  function toggleRowById(id) {
    const row = document.getElementById(id);
    const shouldCollapse = !row.classList.contains("coll");

    row.classList.toggle("coll", shouldCollapse);
    const voteLinks = row.getElementsByClassName("votelinks")[0];
    if (voteLinks) voteLinks.classList.toggle("nosee", shouldCollapse);

    const comment = row.getElementsByClassName("comment")[0];
    if (comment) comment.classList.toggle("noshow", shouldCollapse);

    const toggle = row.getElementsByClassName("togg")[0];
    if (toggle) {
      toggle.textContent = shouldCollapse
        ? `[${toggle.getAttribute("n")} more]`
        : "[\u2013]";
    }

    if (shouldCollapse) {
      hideDescendants(row);
    } else {
      restoreDescendants(row);
    }

    if (document.getElementById("logout")) {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", `collapse?id=${id}${shouldCollapse ? "" : "&un=true"}`);
      xhr.send();
    }
  }

  document.addEventListener("click", event => {
    const control = event.target.closest?.(".clicky");
    if (!control) return;

    const targetUrl = new URL(control.href, location.href);
    if (targetUrl.pathname !== "/vote" && targetUrl.pathname !== "/hide" && control.classList.contains("togg")) {
      toggleRowById(control.getAttribute("id"));
    }

    event.stopPropagation();
    event.stopImmediatePropagation();
    event.preventDefault();
  });
})();
