require("dotenv").config();

const path = require("path");
const fs = require("fs");
const { transcodeToQualities } = require("../helpers/transcodeVideo");
const { uploadMakePublic } = require("../helpers/firebaseUpload");

(async () => {
  // поклади маленьке відео сюди
  const input = path.join(__dirname, "sample.mp4");

  if (!fs.existsSync(input)) {
    console.log("Put a video file here:", input);
    process.exit(0);
  }

  const videoId = `test-${Date.now()}`;
  const outDir = path.join(__dirname, "out", videoId);

  console.log("Transcoding...");
  const files = await transcodeToQualities(input, outDir);

  console.log("Uploading to Firebase...");
  const urls = {};
  for (const [q, filePath] of Object.entries(files)) {
    const dest = `videos/${videoId}/${q}.mp4`;
    urls[q] = await uploadMakePublic(filePath, dest, "video/mp4");
  }

  console.log("DONE URLs:", urls);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
