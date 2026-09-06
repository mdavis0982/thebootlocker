const crypto = require("crypto");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;

const MAX_PHOTOS = 8;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

function uploadsConfigured() {
  return ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]
    .every((key) => Boolean(process.env[key]?.trim()));
}

const receivePhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 0, parts: 2 },
}).single("photo");

// Inspect file signatures as well as letting Cloudinary decode the image.
// Phone photo pickers sometimes supply an empty or generic MIME type.
function isSupportedPhoto(buffer) {
  if (buffer.length < 12) return false;
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return true;
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return true;
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return true;
  if (buffer.toString("ascii", 4, 8) !== "ftyp") return false;
  const boxEnd = Math.min(buffer.readUInt32BE(0), buffer.length, 128);
  for (let offset = 8; offset + 4 <= boxEnd; offset += 4) {
    if (offset === 12) continue;
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(buffer.toString("ascii", offset, offset + 4))) return true;
  }
  return false;
}

function uploadPhoto(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      resource_type: "image",
      public_id: "boot-locker/" + crypto.randomUUID(),
      overwrite: false,
      allowed_formats: ["jpg", "jpeg", "png", "webp", "heic", "heif"],
      format: "jpg",
      transformation: [{ width: 2000, height: 2000, crop: "limit" }, { quality: "auto" }],
      timeout: 60_000,
    }, (error, result) => {
      if (error) return reject(error);
      if (!result?.secure_url?.startsWith("https://")) return reject(new Error("Missing image URL"));
      resolve(result.secure_url);
    });
    stream.on("error", reject);
    stream.end(buffer);
  });
}

module.exports = { MAX_PHOTOS, MAX_PHOTO_BYTES, uploadsConfigured, receivePhoto, isSupportedPhoto, uploadPhoto };
