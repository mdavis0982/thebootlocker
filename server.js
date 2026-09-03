const express = require("express");
const mysql = require("mysql2");
const bcrypt = require("bcrypt");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ========== DATABASE ==========
// Use DATABASE_URL from environment (Render) or fallback to local
const db = mysql.createConnection(
  process.env.DATABASE_URL || {
    host: "localhost",
    user: "root",
    password: "root",
    database: "boot_locker",
    port: 8889,
  },
);

db.connect((err) => {
  if (err) {
    console.error("❌ DB connection failed:", err);
    process.exit(1);
  }
  console.log("✅ DB connected successfully");

  // ===== CREATE TABLE IF NOT EXISTS =====
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      brand VARCHAR(100),
      size VARCHAR(20),
      condition VARCHAR(50),
      image_url VARCHAR(500),
      is_sold BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  db.query(createTableSQL, (err) => {
    if (err) {
      console.error("⚠️ Table creation warning:", err.message);
    } else {
      console.log("✅ Products table ready");
    }
  });
});

// ========== MIDDLEWARE ==========
app.use(express.json());
app.use(express.static("public"));

// CORS – allow all origins (fine for demo)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS",
  );
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ========== ROUTES ==========

// ---- Health check ----
app.get("/", (req, res) => {
  res.json({ status: "The Boot Locker API is running 🚀" });
});

// ---- Get all products ----
app.get("/api/products", (req, res) => {
  const sql = `
    SELECT id, name, brand, size, price, condition, image_url, is_sold 
    FROM products 
    ORDER BY created_at DESC
  `;
  db.query(sql, (err, results) => {
    if (err) {
      console.error("❌ Get products error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(results);
  });
});

// ---- Get single product ----
app.get("/api/products/:id", (req, res) => {
  const sql = "SELECT * FROM products WHERE id = ?";
  db.query(sql, [req.params.id], (err, results) => {
    if (err) {
      console.error("❌ Get product error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }
    res.json(results[0]);
  });
});

// ---- ADMIN LOGIN ----
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;
  // For demo – in production, use env vars and bcrypt
  const adminUser = process.env.ADMIN_USER || "admin";
  const adminPass = process.env.ADMIN_PASS || "boot123";

  if (username === adminUser && password === adminPass) {
    return res.json({ success: true, message: "Logged in" });
  }
  res.status(401).json({ error: "Invalid credentials" });
});

// ---- CREATE product ----
app.post("/api/products", (req, res) => {
  const { name, brand, size, price, condition, image_url } = req.body;

  if (!name || !price) {
    return res.status(400).json({ error: "Name and price are required" });
  }
  if (isNaN(price) || price < 0) {
    return res.status(400).json({ error: "Price must be a positive number" });
  }

  const sql = `
    INSERT INTO products (name, brand, size, price, condition, image_url) 
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  db.query(
    sql,
    [
      name,
      brand || null,
      size || null,
      price,
      condition || null,
      image_url || null,
    ],
    (err, result) => {
      if (err) {
        console.error("❌ Create product error:", err);
        return res.status(500).json({ error: "Failed to add product" });
      }
      res.status(201).json({
        success: true,
        id: result.insertId,
        message: "Product added successfully",
      });
    },
  );
});

// ---- UPDATE product ----
app.put("/api/products/:id", (req, res) => {
  const { name, brand, size, price, condition, image_url, is_sold } = req.body;

  if (!name || !price) {
    return res.status(400).json({ error: "Name and price are required" });
  }

  const sql = `
    UPDATE products 
    SET name = ?, brand = ?, size = ?, price = ?, condition = ?, image_url = ?, is_sold = ?
    WHERE id = ?
  `;
  db.query(
    sql,
    [
      name,
      brand || null,
      size || null,
      price,
      condition || null,
      image_url || null,
      is_sold === undefined ? 0 : is_sold ? 1 : 0,
      req.params.id,
    ],
    (err) => {
      if (err) {
        console.error("❌ Update product error:", err);
        return res.status(500).json({ error: "Failed to update product" });
      }
      res.json({ success: true, message: "Product updated successfully" });
    },
  );
});

// ---- DELETE product ----
app.delete("/api/products/:id", (req, res) => {
  const sql = "DELETE FROM products WHERE id = ?";
  db.query(sql, [req.params.id], (err) => {
    if (err) {
      console.error("❌ Delete product error:", err);
      return res.status(500).json({ error: "Failed to delete product" });
    }
    res.json({ success: true, message: "Product deleted successfully" });
  });
});

// ---- MARK AS SOLD ----
app.patch("/api/products/:id/sold", (req, res) => {
  const sql = "UPDATE products SET is_sold = 1 WHERE id = ?";
  db.query(sql, [req.params.id], (err) => {
    if (err) {
      console.error("❌ Mark sold error:", err);
      return res.status(500).json({ error: "Failed to mark as sold" });
    }
    res.json({ success: true, message: "Product marked as sold" });
  });
});

// ========== ERROR HANDLING ==========
app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ========== START SERVER ==========
app.listen(PORT, () => {
  console.log(`🚀 The Boot Locker API running on port ${PORT}`);
  console.log(
    `📦 Database: ${process.env.DATABASE_URL ? "Render (production)" : "Local"}`,
  );
});
