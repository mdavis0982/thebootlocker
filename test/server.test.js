const { after, before, test } = require("node:test");
const assert = require("node:assert/strict");

process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.DATABASE_SSL = "false";
process.env.ADMIN_USER = "owner";
process.env.ADMIN_PASSWORD = "correct-horse-battery-staple";
process.env.ADMIN_TOKEN_SECRET = "test-secret-that-is-at-least-32-characters";

const { app, pool } = require("../server");

let server;
let baseUrl;

before(async () => {
  pool.query = async (sql) => {
    if (sql.includes("SELECT id, name")) {
      return {
        rows: [
          {
            id: "1",
            name: "Test boots",
            brand: "Test brand",
            size: "UK 9",
            price: "50.00",
            condition: "Used",
            image_url: null,
            status: "available",
          },
        ],
        rowCount: 1,
      };
    }
    if (sql.includes("INSERT INTO products")) {
      return { rows: [{ id: "2" }], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  };

  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, options);
}

async function logIn() {
  const response = await request("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: process.env.ADMIN_USER,
      password: process.env.ADMIN_PASSWORD,
    }),
  });
  const data = await response.json();
  return data.token;
}

test("serves the storefront", async () => {
  const response = await request("/");
  assert.equal(response.status, 200);
  assert.match(await response.text(), /The Boot Locker/);
});

test("keeps the original design available as Version 1", async () => {
  const response = await request("/version-1.html");
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Genuine Boots/);
});

test("returns the public product catalogue", async () => {
  const response = await request("/api/products");
  assert.equal(response.status, 200);
  const products = await response.json();
  assert.equal(products[0].name, "Test boots");
});

test("rejects incorrect admin credentials", async () => {
  const response = await request("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "owner", password: "wrong" }),
  });
  assert.equal(response.status, 401);
});

test("protects product creation from anonymous visitors", async () => {
  const response = await request("/api/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test", price: 50 }),
  });
  assert.equal(response.status, 401);
});

test("allows a logged-in admin to create a product", async () => {
  const token = await logIn();
  const response = await request("/api/products", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Adidas Predator",
      brand: "Adidas",
      size: "UK 9",
      price: 75,
      condition: "Used",
      image_url: "https://example.com/boots.jpg",
    }),
  });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { id: "2" });
});

test("validates product status changes", async () => {
  const token = await logIn();
  const response = await request("/api/products/1/status", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status: "missing" }),
  });
  assert.equal(response.status, 400);
});
