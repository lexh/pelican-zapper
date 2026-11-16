const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const { JSDOM, VirtualConsole } = require("jsdom");

const fixture = readFileSync(`${__dirname}/fixtures/thread.html`, "utf8");
const nativeScript = readFileSync(`${__dirname}/fixtures/hn-collapse-harness.js`, "utf8");
const contentScript = readFileSync(`${__dirname}/../extension/content.js`, "utf8");
const badgeSelector = ".pelican-zapper-badge";

function page(t, { native = true } = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", error => errors.push(error.message));
  const dom = new JSDOM(fixture, {
    url: "https://news.ycombinator.com/item?id=1",
    runScripts: "outside-only",
    virtualConsole,
  });
  const { window } = dom;
  const { document } = window;
  const requests = [];
  const clicks = [];
  // No fixture can make real requests, even if we accidentally click an account action.
  window.XMLHttpRequest = class {
    open(method, url) { this.request = { method, url }; }
    send() { requests.push(this.request); }
  };
  window.fetch = url => {
    requests.push({ method: "fetch", url });
    return Promise.resolve({ json: () => null });
  };
  document.addEventListener("click", event => clicks.push(event.target), true);
  if (native) window.eval(nativeScript);
  t.after(() => {
    window.close();
    assert.deepEqual(errors, [], "no DOM or native-handler errors");
  });
  const row = id => document.querySelector(`tr.comtr[id="${id}"]`);
  return {
    window, document, requests, clicks, row,
    body: id => row(id).querySelector(".commtext"),
    toggle: id => row(id).querySelector("a.togg"),
    badge: id => row(id).querySelector(badgeSelector),
    run: () => window.eval(contentScript),
  };
}

function collapsed(p, id) {
  return p.row(id).classList.contains("coll");
}

function hidden(p, id) {
  return p.row(id).classList.contains("noshow");
}

for (const text of ["pelican", "pelicans", "PELICAN", "PeLiCaNs!", "A pelican, yes.", "(pelicans)", "pelican's", "pelican-bike"]) {
  test(`matches whole word: ${text}`, t => {
    const p = page(t);
    p.body(101).textContent = text;
    p.run();
    assert.equal(collapsed(p, 101), true);
    assert.equal(p.badge(101).textContent, "pelican zapped");
    assert.equal(p.clicks.length, 1);
    assert.equal(p.clicks[0], p.toggle(101));
  });
}

for (const text of ["pelicanry", "superpelican", "pelicanship", "pelican2", "_pelican", "pelikan", "ordinary discussion", ""]) {
  test(`does not match: ${JSON.stringify(text)}`, t => {
    const p = page(t);
    p.body(101).textContent = text;
    const before = p.document.body.innerHTML;
    p.run();
    assert.equal(p.document.body.innerHTML, before);
    assert.equal(p.clicks.length, 0);
  });
}

for (const markup of [
  "<p>&gt; A PELICAN in quoted text.</p>",
  '<a href="https://example.invalid/ordinary">pelicans</a>',
  "<i>pelican</i>!",
  "peli<i>can</i>",
  "ordinary<p>pelicans</p>",
  "ordinary<br>pelican",
  "<pre>ordinary</pre>pelican",
]) {
  test(`matches body markup: ${markup}`, t => {
    const p = page(t);
    p.body(101).innerHTML = markup;
    p.run();
    assert.equal(collapsed(p, 101), true);
  });
}

for (const markup of ["peli<br>can", "peli<p>can</p>"]) {
  test(`block boundaries do not join words: ${markup}`, t => {
    const p = page(t);
    p.body(101).innerHTML = markup;
    p.run();
    assert.equal(collapsed(p, 101), false);
    assert.equal(p.clicks.length, 0);
  });
}

test("reads only own body, not metadata, hrefs, titles, navigation or reply controls", t => {
  const p = page(t);
  p.body(101).innerHTML = '<a href="https://example.invalid/pelicans" title="pelican">ordinary label</a>';
  p.row(101).querySelector(".hnuser").textContent = "pelicans";
  p.row(101).querySelector(".age").textContent = "pelican";
  p.row(101).querySelector(".navs a").textContent = "pelicans";
  p.row(101).querySelector(".reply a").textContent = "pelican";
  const before = p.document.body.innerHTML;
  p.run();
  assert.equal(p.document.body.innerHTML, before);
  assert.equal(p.clicks.length, 0);
});

test("matching child collapses its replies, not its parent or unrelated sibling", t => {
  const p = page(t);
  const links = Array.from(p.document.querySelectorAll("a"), a => a.getAttribute("href"));
  p.run();
  assert.equal(collapsed(p, 100), false);
  assert.equal(collapsed(p, 101), true);
  assert.equal(hidden(p, 102), true);
  assert.equal(collapsed(p, 102), false);
  assert.equal(hidden(p, 100), false);
  assert.equal(hidden(p, 200), false);
  assert.equal(collapsed(p, 200), false);
  assert.equal(p.row(101).querySelector(".comment").classList.contains("noshow"), true);
  assert.equal(p.badge(101).parentElement, p.row(101).querySelector(".comhead"));
  assert.equal(p.toggle(101).textContent, "[2 more]");
  assert.equal(p.toggle(101).closest(".noshow"), null);
  assert.equal(p.badge(100), null);
  assert.equal(p.badge(102), null);
  assert.deepEqual(Array.from(p.document.querySelectorAll("a"), a => a.getAttribute("href")), links);
  assert.deepEqual(p.requests, []);
});

test("pre-existing own collapse is never toggled, badged or reclaimed after expansion", async t => {
  const p = page(t);
  p.toggle(101).click(); // Native collapse before the extension runs.
  p.clicks.length = 0;
  p.run();
  p.run();
  assert.equal(collapsed(p, 101), true);
  assert.equal(hidden(p, 102), true);
  assert.equal(p.badge(101), null);
  assert.equal(p.clicks.length, 0);
  p.toggle(101).click();
  await Promise.resolve();
  p.run();
  assert.equal(collapsed(p, 101), false);
  assert.equal(p.badge(101), null);
});

test("an already-collapsed child under a collapsed parent is left alone", async t => {
  const p = page(t);
  p.body(100).textContent = "pelicans";
  p.toggle(101).click();
  p.toggle(100).click();
  p.clicks.length = 0;
  p.run();
  assert.equal(p.clicks.length, 0);
  assert.equal(p.document.querySelector(badgeSelector), null);
  p.toggle(100).click();
  await Promise.resolve();
  assert.equal(collapsed(p, 101), true);
  assert.equal(hidden(p, 102), true);
});

test("a merely hidden matching child is prepared without opening its collapsed parent", async t => {
  const p = page(t);
  p.toggle(100).click();
  p.clicks.length = 0;
  p.run();
  assert.equal(collapsed(p, 100), true);
  assert.equal(collapsed(p, 101), true);
  assert.equal(hidden(p, 101), true);
  assert.equal(p.badge(100), null);
  assert.ok(p.badge(101));
  assert.equal(p.clicks.length, 1);
  p.toggle(100).click();
  await Promise.resolve();
  assert.equal(hidden(p, 101), false);
  assert.equal(collapsed(p, 101), true);
  assert.equal(hidden(p, 102), true);
  assert.ok(p.badge(101));
});

test("nested matches preserve native collapse state and badges through ancestor expansion", async t => {
  const p = page(t);
  p.body(100).textContent = "PELICANS";
  p.body(102).textContent = "another pelican";
  p.run();
  await Promise.resolve();
  assert.deepEqual(p.clicks.map(a => a.id), ["102", "101", "100"]);
  for (const id of [100, 101, 102]) {
    assert.equal(collapsed(p, id), true);
    assert.ok(p.badge(id));
  }
  assert.equal(hidden(p, 200), false);
  p.toggle(100).click();
  await Promise.resolve();
  assert.equal(p.badge(100), null);
  assert.equal(hidden(p, 101), false);
  assert.equal(collapsed(p, 101), true);
  assert.ok(p.badge(101));
  assert.equal(hidden(p, 102), true);
  p.toggle(101).click();
  await Promise.resolve();
  assert.equal(p.badge(101), null);
  assert.equal(hidden(p, 102), false);
  assert.equal(collapsed(p, 102), true);
  assert.ok(p.badge(102));
  p.run();
  assert.equal(collapsed(p, 100), false);
  assert.equal(collapsed(p, 101), false);
});

test("manual expansion removes the badge and survives repeated initialization and later native toggles", async t => {
  const p = page(t);
  p.run();
  p.toggle(101).click();
  await Promise.resolve();
  assert.equal(collapsed(p, 101), false);
  assert.equal(hidden(p, 102), false);
  assert.equal(p.badge(101), null);
  p.run();
  p.run();
  assert.equal(collapsed(p, 101), false);
  assert.equal(p.clicks.length, 2);
  p.toggle(101).click();
  p.run();
  assert.equal(collapsed(p, 101), true);
  assert.equal(p.badge(101), null, "later manual collapse is not claimed by extension");
});

test("repeated initialization never duplicates badges or toggles back open", t => {
  const p = page(t);
  p.run();
  p.run();
  p.run();
  assert.equal(p.document.querySelectorAll(badgeSelector).length, 1);
  assert.equal(collapsed(p, 101), true);
  assert.equal(p.clicks.length, 1);
});

const malformed = {
  "missing body": p => p.body(101).remove(),
  "missing header": p => p.row(101).querySelector(".comhead").remove(),
  "missing control": p => p.toggle(101).remove(),
  "missing native clicky class": p => p.toggle(101).classList.remove("clicky"),
  "missing indent": p => p.row(101).querySelector(".ind").removeAttribute("indent"),
  "empty indent": p => p.row(101).querySelector(".ind").setAttribute("indent", ""),
  "negative indent": p => p.row(101).querySelector(".ind").setAttribute("indent", "-1"),
  "invalid indent": p => p.row(101).querySelector(".ind").setAttribute("indent", "1oops"),
  "mismatched control id": p => p.toggle(101).id = "100",
  "nonnumeric id": p => { p.row(101).id = "bad"; },
  "unsafe control destination": p => p.toggle(101).setAttribute("href", "vote?id=101&how=up"),
  "wrong native first control": p => {
    const fake = p.document.createElement("span");
    fake.className = "togg";
    p.row(101).querySelector(".default").prepend(fake);
  },
  "wrong native id resolution": p => {
    const fake = p.document.createElement("div");
    fake.id = "101";
    p.document.body.prepend(fake);
    // jsdom's getElementById resolves duplicate IDs by insertion order, while
    // browsers use tree order. Reparse so the prepended div wins.
    p.document.body.innerHTML = p.document.body.innerHTML;
    assert.equal(p.document.getElementById("101").tagName, "DIV");
  },
  "nested unexpected comment body": p => p.body(101).append(p.row(102)),
};

for (const [name, change] of Object.entries(malformed)) {
  test(`fails safely: ${name}`, t => {
    const p = page(t);
    change(p);
    const before = p.document.body.innerHTML;
    p.run();
    p.run();
    assert.equal(p.document.body.innerHTML, before);
    assert.equal(p.clicks.length, 0);
    assert.deepEqual(p.requests, []);
  });
}

test("no comment markup leaves the page unchanged", t => {
  const p = page(t);
  p.document.querySelector(".comment-tree").remove();
  const before = p.document.body.innerHTML;
  p.run();
  assert.equal(p.document.body.innerHTML, before);
});

test("missing native JavaScript leaves visibility unchanged and never adds a false badge", t => {
  const p = page(t, { native: false });
  p.run();
  p.run();
  assert.equal(collapsed(p, 101), false);
  assert.equal(hidden(p, 102), false);
  assert.equal(p.badge(101), null);
  assert.equal(p.clicks.length, 1, "failed activation is not retried repeatedly");
});

test("logged-in auto-collapse suppresses native persistence and restores every logout marker", async t => {
  const p = page(t);
  const logout = p.document.createElement("a");
  logout.id = "logout";
  logout.href = "logout?auth=fixture";
  logout.textContent = "logout";
  p.document.body.prepend(logout, logout.cloneNode(true));
  const logoutNodes = Array.from(p.document.querySelectorAll('[id="logout"]'));
  const logoutCopies = logoutNodes.map(a => a.cloneNode(true));
  p.run();
  assert.equal(collapsed(p, 101), true);
  assert.deepEqual(p.requests, []);
  assert.deepEqual(Array.from(p.document.querySelectorAll('[id="logout"]')), logoutNodes);
  assert.ok(logoutNodes.every((a, i) => a.isEqualNode(logoutCopies[i])));
  p.toggle(101).click(); // Manual clicks still trigger HN's collapse request.
  await Promise.resolve();
  assert.deepEqual(p.requests, [{ method: "GET", url: "collapse?id=101&un=true" }]);
  assert.equal(p.badge(101), null);
});

test("a failed activation restores the logout marker and does not stop other comments", t => {
  const p = page(t);
  const logout = p.document.createElement("a");
  logout.id = "logout";
  p.document.body.prepend(logout);
  p.body(200).textContent = "pelican";
  p.toggle(200).click = () => { throw new Error("unavailable control"); };
  assert.doesNotThrow(p.run);
  assert.equal(p.document.getElementById("logout"), logout);
  assert.equal(collapsed(p, 101), true);
  assert.equal(p.badge(200), null);
  assert.deepEqual(p.requests, []);
});

test("shared manifest grants only static HTTPS HN access and no extra APIs", () => {
  const manifest = JSON.parse(readFileSync(`${__dirname}/../extension/manifest.json`, "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.content_scripts, [{
    matches: ["https://news.ycombinator.com/*"],
    js: ["content.js"],
    css: ["content.css"],
    run_at: "document_idle",
  }]);
  assert.deepEqual(manifest.icons, {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "96": "icons/icon-96.png",
    "128": "icons/icon-128.png",
    "256": "icons/icon-256.png",
    "512": "icons/icon-512.png",
  });
  for (const key of ["permissions", "host_permissions", "optional_permissions", "background", "action", "options_ui", "web_accessible_resources"]) {
    assert.equal(manifest[key], undefined, key);
  }
});
