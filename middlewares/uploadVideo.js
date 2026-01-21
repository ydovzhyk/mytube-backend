const multer = require("multer");
const path = require("path");
const fs = require("fs");

const tmpDir = path.join(process.cwd(), "tmp", "uploads");
fs.mkdirSync(tmpDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, tmpDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "") || (file.fieldname === "thumbnail" ? ".jpg" : ".mp4");
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  // video field
  if (file.fieldname === "video") {
    if (file.mimetype && file.mimetype.startsWith("video/")) return cb(null, true);
    return cb(Object.assign(new Error("Only video files are allowed"), { status: 400 }));
  }

  // thumbnail field
  if (file.fieldname === "thumbnail") {
    if (file.mimetype && file.mimetype.startsWith("image/")) return cb(null, true);
    return cb(Object.assign(new Error("Only image files are allowed for thumbnail"), { status: 400 }));
  }

  return cb(Object.assign(new Error("Unexpected field"), { status: 400 }));
}

const uploadVideo = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // загальний ліміт на кожен файл
  },
});

module.exports = { uploadVideo };


