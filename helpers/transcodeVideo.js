const fs = require("fs");
const path = require("path");
const { runCmd } = require("./runCmd");

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

const TARGET_QUALITIES = ["360p", "480p", "720p"];

// висоти + бітрейти (MVP)
const PRESETS = {
  "360p": { height: 360, vbitrate: "600k" },
  "480p": { height: 480, vbitrate: "1000k" },
  "720p": { height: 720, vbitrate: "2500k" },
};

// робимо ширину кратною 2 (ffmpeg вимога), зберігаємо aspect ratio
function scaleFilter(height) {
  return `scale=-2:${height}`;
}

async function transcodeToQualities(inputPath, outDir) {
  await fs.promises.mkdir(outDir, { recursive: true });

  const results = {};

  for (const q of TARGET_QUALITIES) {
    const { height, vbitrate } = PRESETS[q];
    const outPath = path.join(outDir, `${q}.mp4`);

    // H.264 + AAC, швидкий preset для MVP
    const args = [
      "-y",
      "-i",
      inputPath,

      // video
      "-vf",
      scaleFilter(height),
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-profile:v",
      "high",
      "-level",
      "4.0",
      "-pix_fmt",
      "yuv420p",
      "-b:v",
      vbitrate,
      "-maxrate",
      vbitrate,
      "-bufsize",
      "2M",

      // audio
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ac",
      "2",

      // web-friendly start
      "-movflags",
      "+faststart",

      outPath,
    ];

    await runCmd(FFMPEG, args);
    results[q] = outPath;
  }

  return results; // { "360p": "...\360p.mp4", ... }
}

module.exports = { transcodeToQualities, TARGET_QUALITIES };
