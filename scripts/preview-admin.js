// Local, disposable QA environment. No real database or Cloudinary requests.
if (process.env.NODE_ENV === "production") throw new Error("The preview must not run in production");
process.env.DATABASE_URL = "postgresql://preview:preview@localhost/preview";
process.env.DATABASE_SSL = "false";
process.env.ADMIN_USER = "preview";
process.env.ADMIN_PASSWORD = "preview-only";
process.env.ADMIN_TOKEN_SECRET = "disposable-preview-secret-at-least-32-characters";
process.env.CLOUDINARY_CLOUD_NAME = "local-preview";
process.env.CLOUDINARY_API_KEY = "local-preview";
process.env.CLOUDINARY_API_SECRET = "local-preview";
const { PGlite } = require("@electric-sql/pglite");
const crypto = require("crypto");
const { app, pool, initializeDatabase } = require("../server");
const media = require("../media");
const database = new PGlite();
const photos = new Map();
pool.query = async (sql, params) => {
  const result = await database.query(sql, params);
  return { ...result, rowCount: result.affectedRows || result.rows.length };
};
media.uploadPhoto = async (buffer) => {
  const id = crypto.randomUUID();
  photos.set(id, buffer);
  return "http://127.0.0.1:3100/preview-photos/" + id;
};
app.get("/preview-photos/:id", (req, res) => {
  const buffer = photos.get(req.params.id);
  if (!buffer) return res.sendStatus(404);
  res.type(buffer[0] === 0x89 ? "png" : "jpeg").send(buffer);
});

async function run() {
  await initializeDatabase();
  const photo = "http://127.0.0.1:3100/IMG_7146.jpeg";
  await pool.query(`INSERT INTO products (name, brand, size, price, condition, image_url, images, description)
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`, [
    "Preview — Adidas X Speedportal", "Adidas", "UK 9", 85, "Excellent", photo,
    JSON.stringify([photo]), "Local demonstration listing. Light wear on the sole; box included.",
  ]);
  const server = app.listen(3100, "127.0.0.1", () => {
    console.log("Disposable preview: http://127.0.0.1:3100 — login preview / preview-only");
  });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => {
    server.close();
    await database.close();
    process.exit(0);
  });
}
run().catch((error) => { console.error(error); process.exit(1); });
