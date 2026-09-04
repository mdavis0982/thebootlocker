require("dotenv").config();

const crypto = require("crypto");
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { Pool } = require("pg");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const TOKEN_LIFETIME_MS = 8 * 60 * 60 * 1000;

const requiredEnvironment = [
  "DATABASE_URL",
  "ADMIN_USER",
  "ADMIN_PASSWORD",
  "ADMIN_TOKEN_SECRET",
];
const missingEnvironment = requiredEnvironment.filter(
  (name) => !process.env[name],
);

if (missingEnvironment.length > 0) {
  console.error(
    `Missing required environment variables: ${missingEnvironment.join(", ")}`,
  );
  process.exit(1);
}

if (process.env.ADMIN_TOKEN_SECRET.length < 32) {
  console.error("ADMIN_TOKEN_SECRET must contain at least 32 characters.");
  process.exit(1);
}

const databaseConfig = {
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
};

if (process.env.DATABASE_SSL === "true") {
  databaseConfig.ssl = { rejectUnauthorized: false };
} else if (process.env.DATABASE_SSL === "false") {
  databaseConfig.ssl = false;
}

const pool = new Pool(databaseConfig);

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
        ],
        scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
        fontSrc: ["'self'", "data:", "https://cdnjs.cloudflare.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
      },
    },
  }),
);
app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public")));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again in 15 minutes." },
});

function secureCompare(actual, expected) {
  const actualBuffer = Buffer.from(String(actual));
  const expectedBuffer = Buffer.from(String(expected));

  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function signToken(payload) {
  return crypto
    .createHmac("sha256", process.env.ADMIN_TOKEN_SECRET)
    .update(payload)
    .digest("base64url");
}

function createAdminToken() {
  const payload = Buffer.from(
    JSON.stringify({ role: "admin", expiresAt: Date.now() + TOKEN_LIFETIME_MS }),
  ).toString("base64url");

  return `${payload}.${signToken(payload)}`;
}

function requireAdmin(req, res, next) {
  const authorization = req.get("authorization") || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  const [payload, signature] = token.split(".");

  if (!payload || !signature || !secureCompare(signature, signToken(payload))) {
    return res.status(401).json({ error: "Admin login required" });
  }

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (data.role !== "admin" || data.expiresAt <= Date.now()) {
      return res.status(401).json({ error: "Admin session expired" });
    }
  } catch {
    return res.status(401).json({ error: "Invalid admin session" });
  }

  next();
}

function parseProductId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function optionalText(value, maxLength) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : undefined;
}

function validateProduct(body) {
  const name = optionalText(body.name, 255);
  const brand = optionalText(body.brand, 100);
  const size = optionalText(body.size, 20);
  const condition = optionalText(body.condition, 50);
  const price = Number(body.price);
  let imageUrl = optionalText(body.image_url, 500);

  if (!name) return { error: "A product name is required" };
  if (!Number.isFinite(price) || price <= 0 || price > 1_000_000) {
    return { error: "Price must be a positive number" };
  }
  if ([brand, size, condition, imageUrl].includes(undefined)) {
    return { error: "One or more product fields are invalid or too long" };
  }

  if (imageUrl) {
    try {
      const parsed = new URL(imageUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
      imageUrl = parsed.toString();
    } catch {
      return { error: "Image URL must be a valid http or https address" };
    }
  }

  return {
    product: { name, brand, size, condition, price, imageUrl },
  };
}

app.get("/api/health", async (req, res, next) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch (error) {
    next(error);
  }
});

app.get("/api/products", async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT id, name, brand, size, price, condition, image_url, status
      FROM products
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.get("/api/products/:id", async (req, res, next) => {
  const id = parseProductId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid product ID" });

  try {
    const result = await pool.query(
      `SELECT id, name, brand, size, price, condition, image_url, status
       FROM products WHERE id = $1`,
      [id],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Product not found" });
    }
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/login", loginLimiter, (req, res) => {
  const { username = "", password = "" } = req.body || {};
  const validUser = secureCompare(username, process.env.ADMIN_USER);
  const validPassword = secureCompare(password, process.env.ADMIN_PASSWORD);

  if (!validUser || !validPassword) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  res.json({ token: createAdminToken(), expiresIn: TOKEN_LIFETIME_MS });
});

app.post("/api/products", requireAdmin, async (req, res, next) => {
  const { error, product } = validateProduct(req.body || {});
  if (error) return res.status(400).json({ error });

  try {
    const result = await pool.query(
      `INSERT INTO products (name, brand, size, price, condition, image_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        product.name,
        product.brand,
        product.size,
        product.price,
        product.condition,
        product.imageUrl,
      ],
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (databaseError) {
    next(databaseError);
  }
});

app.put("/api/products/:id", requireAdmin, async (req, res, next) => {
  const id = parseProductId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid product ID" });

  const { error, product } = validateProduct(req.body || {});
  if (error) return res.status(400).json({ error });

  try {
    const result = await pool.query(
      `UPDATE products
       SET name = $1, brand = $2, size = $3, price = $4,
           condition = $5, image_url = $6
       WHERE id = $7`,
      [
        product.name,
        product.brand,
        product.size,
        product.price,
        product.condition,
        product.imageUrl,
        id,
      ],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Product not found" });
    }
    res.json({ success: true });
  } catch (databaseError) {
    next(databaseError);
  }
});

app.patch("/api/products/:id/status", requireAdmin, async (req, res, next) => {
  const id = parseProductId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid product ID" });
  const status = req.body?.status;
  if (!["available", "reserved", "sold"].includes(status)) {
    return res.status(400).json({
      error: "Status must be available, reserved, or sold",
    });
  }

  try {
    const result = await pool.query(
      "UPDATE products SET status = $1, is_sold = $2 WHERE id = $3",
      [status, status === "sold", id],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Product not found" });
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/products/:id", requireAdmin, async (req, res, next) => {
  const id = parseProductId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid product ID" });

  try {
    const result = await pool.query("DELETE FROM products WHERE id = $1", [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Product not found" });
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.use("/api", (req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((error, req, res, next) => {
  console.error("Request failed:", error.message);
  res.status(500).json({ error: "Internal server error" });
});

async function start() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      price NUMERIC(10, 2) NOT NULL CHECK (price > 0),
      brand VARCHAR(100),
      size VARCHAR(20),
      condition VARCHAR(50),
      image_url VARCHAR(500),
      is_sold BOOLEAN NOT NULL DEFAULT FALSE,
      status VARCHAR(20) NOT NULL DEFAULT 'available',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'available'",
  );
  await pool.query(
    "UPDATE products SET status = 'sold' WHERE is_sold = TRUE AND status = 'available'",
  );

  app.listen(PORT, () => {
    console.log(`The Boot Locker is running on port ${PORT}`);
  });
}

async function shutdown() {
  await pool.end();
  process.exit(0);
}

if (require.main === module) {
  start().catch((error) => {
    console.error("Unable to start the application:", error.message);
    process.exit(1);
  });

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

module.exports = { app, pool };
