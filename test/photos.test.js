const { before, after, test } = require("node:test");
const assert = require("node:assert/strict");
const { PGlite } = require("@electric-sql/pglite");

process.env.DATABASE_URL = "postgresql://test:test@localhost/test";
process.env.DATABASE_SSL = "false";
process.env.ADMIN_USER = "test-owner";
process.env.ADMIN_PASSWORD = "test-password";
process.env.ADMIN_TOKEN_SECRET = "local-test-secret-with-at-least-32-characters";
process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
process.env.CLOUDINARY_API_KEY = "test-key";
process.env.CLOUDINARY_API_SECRET = "test-secret";
const { app, pool, initializeDatabase } = require("../server");
const media = require("../media");
const database = new PGlite();
let server, baseUrl, token, createdId;
let uploadCalls = 0;
const cover = "https://example.com/cover.jpg";
const detail = "https://example.com/detail.jpg";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");

before(async () => {
  pool.query = async (sql, params) => {
    const result = await database.query(sql, params);
    return { ...result, rowCount: result.affectedRows || result.rows.length };
  };
  // Start with the original schema and a sold listing to exercise upgrades.
  await database.exec(`CREATE TABLE products (
    id BIGSERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, price NUMERIC(10,2) NOT NULL,
    brand VARCHAR(100), size VARCHAR(20), condition VARCHAR(50), image_url VARCHAR(500),
    is_sold BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  ); INSERT INTO products (name, price, image_url, is_sold) VALUES ('Original pair', 75, '${cover}', TRUE);`);
  await initializeDatabase();
  await initializeDatabase();
  media.uploadPhoto = async (buffer) => {
    uploadCalls++;
    assert.deepEqual(buffer, png);
    return cover;
  };
  server = await new Promise((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  baseUrl = "http://127.0.0.1:" + server.address().port;
  const login = await fetch(baseUrl + "/api/admin/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "test-owner", password: "test-password" }),
  });
  token = (await login.json()).token;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await database.close();
  await pool.end();
});

function request(path, method = "GET", body, authorized = true) {
  const headers = authorized ? { Authorization: "Bearer " + token } : {};
  if (body && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
  return fetch(baseUrl + "/api" + path, { method, headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
}

function photoForm(buffer = png, type = "image/png", name = "boots.png") {
  const body = new FormData();
  body.append("photo", new Blob([buffer], { type }), name);
  return body;
}

test("database upgrade preserves legacy photo and sold status across restarts", async () => {
  const response = await request("/products/1");
  const product = await response.json();
  assert.deepEqual(product.images, [cover]);
  assert.equal(product.description, "");
  assert.equal(product.status, "sold");
});

test("creation and editing persist gallery order and condition notes in PostgreSQL", async () => {
  const response = await request("/products", "POST", {
    name: "Phone listing", price: 85, images: [cover, detail], description: "Small mark on heel.\nBox included.",
  });
  assert.equal(response.status, 201);
  createdId = (await response.json()).id;
  let product = await (await request("/products/" + createdId)).json();
  assert.deepEqual(product.images, [cover, detail]);
  assert.equal(product.image_url, cover);
  assert.equal(product.description, "Small mark on heel.\nBox included.");
  await request("/products/" + createdId + "/status", "PATCH", { status: "reserved" });
  const edited = await request("/products/" + createdId, "PUT", {
    name: "Updated boots", price: 80, images: [detail, cover], description: "Updated condition.",
  });
  assert.equal(edited.status, 200);
  product = await (await request("/products/" + createdId)).json();
  assert.equal(product.price, "80.00");
  assert.equal(product.image_url, detail);
  assert.deepEqual(product.images, [detail, cover]);
  assert.equal(product.status, "reserved");
  assert.equal(product.description, "Updated condition.");
});

test("omitted gallery and notes stay intact while an explicit empty gallery removes photos", async () => {
  await request("/products/" + createdId, "PUT", { name: "Price correction", price: 79 });
  let product = await (await request("/products/" + createdId)).json();
  assert.deepEqual(product.images, [detail, cover]);
  assert.equal(product.description, "Updated condition.");
  await request("/products/" + createdId, "PUT", { name: "No photos", price: 79, images: [], description: "" });
  await initializeDatabase();
  product = await (await request("/products/" + createdId)).json();
  assert.deepEqual(product.images, []);
  assert.equal(product.image_url, null);
  assert.equal(product.description, "");
});

test("legacy image URL requests remain compatible", async () => {
  const response = await request("/products", "POST", { name: "Legacy", price: 50, image_url: cover });
  const id = (await response.json()).id;
  const product = await (await request("/products/" + id)).json();
  assert.deepEqual(product.images, [cover]);
});

test("gallery and notes validation rejects invalid input without inserting records", async () => {
  for (const body of [
    { images: Array(9).fill(cover) }, { images: ["javascript:alert(1)"] },
    { images: ["data:image/png;base64,abc"] }, { images: ["https://user:pass@example.com/a.jpg"] },
    { images: [null] }, { images: "bad" }, { description: "x".repeat(3001) }, { description: {} },
  ]) {
    const response = await request("/products", "POST", { name: "Invalid", price: 10, ...body });
    assert.equal(response.status, 400);
  }
});

test("photo endpoints require admin authentication before processing a file", async () => {
  assert.equal((await request("/admin/uploads", "GET", undefined, false)).status, 401);
  assert.equal((await request("/admin/photos", "POST", photoForm(), false)).status, 401);
  assert.equal(uploadCalls, 0);
});

test("uploads report unconfigured storage and never expose credentials", async () => {
  const key = process.env.CLOUDINARY_API_SECRET;
  delete process.env.CLOUDINARY_API_SECRET;
  try {
    const config = await (await request("/admin/uploads")).json();
    assert.equal(config.enabled, false);
    assert.equal((await request("/admin/photos", "POST", photoForm())).status, 503);
    assert.equal(uploadCalls, 0);
  } finally { process.env.CLOUDINARY_API_SECRET = key; }
  const config = await (await request("/admin/uploads")).json();
  assert.deepEqual(config, { enabled: true, maxPhotos: 8, maxBytes: 10485760 });
});

test("a valid device photo is forwarded and returns only its public URL", async () => {
  const response = await request("/admin/photos", "POST", photoForm());
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { url: cover });
  assert.equal(uploadCalls, 1);
});

test("oversized, missing, disguised and multiple files are rejected before provider upload", async () => {
  assert.equal((await request("/admin/photos", "POST", photoForm(Buffer.alloc(10485761)))).status, 413);
  assert.equal((await request("/admin/photos", "POST", photoForm(Buffer.from("<svg onload='alert(1)'></svg>")))).status, 400);
  assert.equal((await request("/admin/photos", "POST", new FormData())).status, 400);
  const two = photoForm();
  two.append("photo", new Blob([png], { type: "image/png" }), "other.png");
  assert.equal((await request("/admin/photos", "POST", two)).status, 400);
  assert.equal(uploadCalls, 1);
});

test("provider failure becomes a useful error without leaking account details", async () => {
  media.uploadPhoto = async () => { throw new Error("secret provider details"); };
  const response = await request("/admin/photos", "POST", photoForm());
  assert.equal(response.status, 502);
  const body = await response.text();
  assert.match(body, /retry/);
  assert.doesNotMatch(body, /secret provider/);
});
