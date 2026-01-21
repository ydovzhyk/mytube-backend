const fs = require("fs");
const path = require("path");
const { Video, QUALITY_ENUM } = require("../models/video");
const { uploadMakePublic, transcodeToQualities, RequestError, extractTagsFromDescription } = require("../helpers");

const pickMaxQuality = (qualities) => {
  const order = ["360p", "480p", "720p"];
  const sorted = [...qualities].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return sorted[sorted.length - 1] || "720p";
};

const safeUnlink = async (p) => {
  try { await fs.promises.unlink(p); } catch {}
};

const safeRmdir = async (dir) => {
  try { await fs.promises.rm(dir, { recursive: true, force: true }); } catch {}
};

async function uploadVideoController(req, res) {
  // multer.fields -> req.files.video[0], req.files.thumbnail[0]
  const videoFile = req.files?.video?.[0];
  const thumbFile = req.files?.thumbnail?.[0];

  if (!videoFile) throw RequestError(400, "Video file is required");
  if (!thumbFile) throw RequestError(400, "Thumbnail file is required");

  const { title, description = "", channelRef, isPublished } = req.body;
  if (!title || !channelRef) throw RequestError(400, "title and channelRef are required");

  const published = Boolean(isPublished === "true" || isPublished === true);

  // 1) create Video in processing
  const doc = await Video.create({
    title,
    description,
    channelRef,
    isPublished: published,
    publishedAt: published ? new Date() : null,
    status: "processing",
    thumbnailUrl: "",
    tags: extractTagsFromDescription(description),
  });

  const inputPath = videoFile.path;
  const thumbPath = thumbFile.path;

  const outDir = path.join(process.cwd(), "tmp", "transcoded", String(doc._id));

  try {
    // 2) запускаємо паралельно:
    // - transcode video
    // - upload thumbnail
    const thumbExt = path.extname(thumbFile.originalname || "") || ".jpg";
    const thumbDest = `videos/${doc._id}/thumbnail${thumbExt}`;
    const thumbContentType = thumbFile.mimetype || "image/jpeg";

    const thumbUploadPromise = uploadMakePublic(thumbPath, thumbDest, thumbContentType);
    const transcodePromise = transcodeToQualities(inputPath, outDir);

    const [thumbnailUrl, filesByQuality] = await Promise.all([thumbUploadPromise, transcodePromise]);

    // 3) upload video variants
    const sources = {};
    const qualities = [];

    for (const [q, localPath] of Object.entries(filesByQuality)) {
      if (!QUALITY_ENUM.includes(q)) continue;

      const dest = `videos/${doc._id}/${q}.mp4`;
      const url = await uploadMakePublic(localPath, dest, "video/mp4");
      sources[q] = url;
      qualities.push(q);
    }

    const availableQualities = qualities.sort((a, b) => QUALITY_ENUM.indexOf(a) - QUALITY_ENUM.indexOf(b));
    const maxQuality = pickMaxQuality(availableQualities);

    // 4) update Mongo
    doc.status = "ready";
    doc.errorMessage = "";
    doc.thumbnailUrl = thumbnailUrl;
    doc.sources = sources; // Map in schema
    doc.availableQualities = availableQualities;
    doc.maxQuality = maxQuality;

    await doc.save();

    return res.status(201).json({
      message: "Video uploaded",
      video: doc,
    });
  } catch (e) {
    doc.status = "failed";
    doc.errorMessage = e?.message || "Upload failed";
    await doc.save();

    throw RequestError(500, doc.errorMessage);
  } finally {
    // cleanup temp
    await safeUnlink(inputPath);
    await safeUnlink(thumbPath);
    await safeRmdir(outDir);
  }
}

function toVideoCardDTO(doc) {
  return {
    id: String(doc._id),
    title: doc.title,
    thumbnailUrl: doc.thumbnailUrl,
    views: doc.views,
    publishedAt: doc.publishedAt,
    createdAt: doc.createdAt,
    maxQuality: doc.maxQuality,
    availableQualities: doc.availableQualities,
    sources: doc.sources || {},
    channel: doc.channelRef && typeof doc.channelRef === "object"
      ? {
          id: String(doc.channelRef._id),
          name: doc.channelRef.name || doc.channelRef.title || "Channel",
          handle: doc.channelRef.handle || "",
          avatarUrl: doc.channelRef.avatarUrl || "",
        }
      : { id: String(doc.channelRef), name: "Channel", handle: "", avatarUrl: "" },
  };
}
async function getVideosController(req, res) {
  // /api/videos?page=1&limit=24
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(48, Math.max(1, Number(req.query.limit) || 24));
  const skip = (page - 1) * limit;

  const filter = { isPublished: true, status: "ready" };

  const [total, docs] = await Promise.all([
    Video.countDocuments(filter),
    Video.find(filter)
      .sort({ publishedAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      // якщо в Channel моделі інші поля — підправиш select
      // .populate("channelRef", "name handle avatarUrl title")
      .lean(),
  ]);

  const items = docs.map((d) => toVideoCardDTO(d));

  res.json({
    items,
    page,
    limit,
    total,
    hasMore: skip + items.length < total,
  });
}

module.exports = { uploadVideoController, getVideosController };

