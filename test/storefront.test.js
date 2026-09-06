const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
const script = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");

async function until(predicate) {
  for (let tries = 0; tries < 200; tries++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail("Expected UI state was not reached");
}

async function setup(t, handler) {
  const dom = new JSDOM(html, { url: "http://localhost/", runScripts: "outside-only" });
  t.after(() => dom.window.close());
  const win = dom.window;
  const doc = win.document;
  win.Headers = Headers;
  win.sessionStorage.setItem("bootLockerAdminToken", "test-session");
  win.URL.createObjectURL = () => "blob:http://localhost/test-photo";
  win.URL.revokeObjectURL = () => {};
  win.HTMLElement.prototype.scrollIntoView = () => {};
  win.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  win.HTMLDialogElement.prototype.close = function () { this.open = false; };
  win.confirm = () => true;
  win.open = () => null;
  const calls = [];
  win.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    const custom = await handler?.(url, options);
    if (custom) return custom;
    if (url === "/api/admin/uploads") return Response.json({ enabled: true });
    if (url === "/api/products") return Response.json([]);
    throw new Error("Unexpected request: " + url);
  };
  win.eval(script);
  await until(() => !doc.getElementById("uploadAvailability").textContent.includes("Checking"));
  const el = (id) => doc.getElementById(id);
  function choose(names) {
    Object.defineProperty(el("productPhotos"), "files", { configurable: true,
      value: names.map((name) => new win.File(["test photo"], name, { type: "image/jpeg" })) });
    el("productPhotos").dispatchEvent(new win.Event("change", { bubbles: true }));
  }
  function submit() { el("addProductForm").dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true })); }
  return { win, doc, el, calls, choose, submit };
}

test("device picker uses existing files, previews cover choice and blocks double saves", async (t) => {
  let saves = 0;
  let saved;
  const ui = await setup(t, async (url, options) => {
    if (url === "/api/admin/photos") {
      await new Promise((resolve) => setTimeout(resolve, 15));
      return Response.json({ url: "https://example.com/" + options.body.get("photo").name }, { status: 201 });
    }
    if (url === "/api/products" && options.method === "POST") {
      saves++;
      saved = JSON.parse(options.body);
      return Response.json({ id: "12" }, { status: 201 });
    }
  });
  assert.equal(ui.el("productPhotos").hasAttribute("capture"), false);
  assert.equal(ui.el("productPhotos").multiple, true);
  ui.el("productName").value = "Phone boots";
  ui.el("productPrice").value = "85";
  ui.el("productDescription").value = "Some heel wear";
  ui.choose(["side.jpg", "sole.jpg"]);
  assert.equal(ui.doc.querySelectorAll(".photo-preview").length, 2);
  ui.doc.querySelector('[data-cover-photo="1"]').click();
  ui.submit();
  ui.submit();
  assert.equal(ui.el("productFields").disabled, true);
  await until(() => /Boot added successfully/.test(ui.el("addProductMessage").textContent));
  assert.equal(saves, 1);
  assert.deepEqual(saved.images, ["https://example.com/sole.jpg", "https://example.com/side.jpg"]);
  assert.equal(saved.description, "Some heel wear");
  assert.equal(ui.el("productName").value, "");
  assert.equal(ui.doc.querySelectorAll(".photo-preview").length, 0);
  assert.equal(ui.el("productFields").disabled, false);
  assert.doesNotMatch(ui.el("addProductMessage").textContent, /reset/);
  assert.equal(ui.calls.filter((call) => call.url === "/api/admin/photos").every((call) => !call.options.headers.has("Content-Type")), true);
});

test("failed upload retains the draft and retry skips photos already uploaded", async (t) => {
  const uploaded = [];
  let failed = false;
  let saves = 0;
  const ui = await setup(t, (url, options) => {
    if (url === "/api/admin/photos") {
      const name = options.body.get("photo").name;
      uploaded.push(name);
      if (name === "second.jpg" && !failed) {
        failed = true;
        return Response.json({ error: "Upload interrupted. Retry." }, { status: 502 });
      }
      return Response.json({ url: "https://example.com/" + name }, { status: 201 });
    }
    if (url === "/api/products" && options.method === "POST") {
      saves++;
      return Response.json({ id: "13" }, { status: 201 });
    }
  });
  ui.el("productName").value = "Keep this draft";
  ui.el("productPrice").value = "100";
  ui.choose(["first.jpg", "second.jpg"]);
  ui.submit();
  await until(() => /Upload interrupted/.test(ui.el("addProductMessage").textContent));
  assert.equal(ui.el("productName").value, "Keep this draft");
  assert.equal(ui.doc.querySelectorAll(".photo-preview").length, 2);
  assert.equal(saves, 0);
  ui.submit();
  await until(() => /Boot added successfully/.test(ui.el("addProductMessage").textContent));
  assert.deepEqual(uploaded, ["first.jpg", "second.jpg", "second.jpg"]);
  assert.equal(saves, 1);
});

test("editing loads existing photos and notes and uses PUT without uploading them again", async (t) => {
  let saved;
  const product = { id: "7", name: "Existing pair", price: "85.00", condition: "Used",
    images: ["https://example.com/one.jpg", "https://example.com/two.jpg"], description: "Original notes", status: "sold" };
  const ui = await setup(t, (url, options) => {
    if (url === "/api/products" && !options.method) return Response.json([product]);
    if (url === "/api/products/7" && options.method === "PUT") {
      saved = JSON.parse(options.body);
      return Response.json({ success: true });
    }
  });
  await until(() => ui.doc.querySelector(".edit-product-button"));
  ui.doc.querySelector(".edit-product-button").click();
  assert.equal(ui.el("productDescription").value, "Original notes");
  assert.equal(ui.el("productCondition").value, "Used");
  ui.el("productPrice").value = "80";
  ui.doc.querySelector('[data-remove-photo="0"]').click();
  ui.submit();
  await until(() => /Changes saved/.test(ui.el("addProductMessage").textContent));
  assert.deepEqual(saved.images, ["https://example.com/two.jpg"]);
  assert.equal(saved.price, 80);
  assert.equal(saved.description, "Original notes");
  assert.equal(ui.calls.some((call) => call.url === "/api/admin/photos"), false);
});

test("invalid selections leave existing photo choices intact", async (t) => {
  const ui = await setup(t);
  ui.choose(["first.jpg"]);
  ui.choose(["not-a-photo.svg"]);
  assert.equal(ui.doc.querySelectorAll(".photo-preview").length, 1);
  assert.equal(ui.el("photoMessage").hidden, false);
  ui.choose(Array.from({ length: 8 }, (_, index) => index + ".jpg"));
  assert.equal(ui.doc.querySelectorAll(".photo-preview").length, 1);
  assert.match(ui.el("photoMessage").textContent, /8 photos/);
});

test("missing image-service configuration disables photo selection but permits text-only listings", async (t) => {
  let saved;
  const ui = await setup(t, (url, options) => {
    if (url === "/api/admin/uploads") return Response.json({ enabled: false });
    if (url === "/api/products" && options.method === "POST") {
      saved = JSON.parse(options.body);
      return Response.json({ id: "14" }, { status: 201 });
    }
  });
  assert.equal(ui.el("productPhotos").disabled, true);
  assert.match(ui.el("uploadAvailability").textContent, /not connected yet/);
  ui.el("productName").value = "Listing without photos";
  ui.el("productPrice").value = "50";
  ui.submit();
  await until(() => /Boot added successfully/.test(ui.el("addProductMessage").textContent));
  assert.deepEqual(saved.images, []);
  assert.equal(ui.el("productPhotos").disabled, true);
});

test("buyers can switch gallery images, notes render as text, and clipboard failure is honest", async (t) => {
  const ui = await setup(t, (url, options) => {
    if (url === "/api/products" && !options.method) return Response.json([{ id: "8", name: "Gallery pair", price: 85,
      images: ["https://example.com/one.jpg", "https://example.com/two.jpg"],
      description: '<img src=x onerror="alert(1)">', status: "available" }]);
  });
  await until(() => ui.doc.querySelector(".view-product-button"));
  ui.doc.querySelector(".view-product-button").click();
  ui.doc.querySelectorAll(".gallery-thumbnail")[1].click();
  assert.equal(ui.el("galleryMain").querySelector("img").src, "https://example.com/two.jpg");
  assert.equal(ui.doc.querySelector(".condition-notes img"), null);
  ui.el("dialogEnquireButton").click();
  await until(() => !ui.el("enquiryHelp").hidden);
  assert.match(ui.el("enquiryHelp").textContent, /stock #8/);
  assert.doesNotMatch(ui.el("toast").textContent, /message has been copied/);
});
