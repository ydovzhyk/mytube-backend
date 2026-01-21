const { bucket } = require("../config/firebaseConfig");

async function uploadMakePublic(localPath, destPath, contentType = "video/mp4") {
  const normalized = destPath.replace(/^\/+/, "");

  await bucket.upload(localPath, {
    destination: normalized,
    resumable: false,
    metadata: {
      contentType,
      cacheControl: "public, max-age=31536000",
    },
  });

  const file = bucket.file(normalized);
  await file.makePublic();

  return `https://storage.googleapis.com/${bucket.name}/${encodeURI(normalized)}`;
}

module.exports = { uploadMakePublic };
