const Joi = require("joi");
const { Schema, model, Types } = require("mongoose");
const { handleSaveErrors } = require("../helpers");

const QUALITY_ENUM = ["360p", "480p", "720p"];
const STATUS_ENUM = ["processing", "ready", "failed"];

const videoSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, "Video title is required"],
      minlength: 2,
      maxlength: 140,
      trim: true,
    },

    description: {
      type: String,
      default: "",
      maxlength: 5000,
      trim: true,
    },

    // прив'язка до каналу
    channelRef: {
      type: Types.ObjectId,
      ref: "channel",
      required: [true, "channelRef is required"],
      index: true,
    },

    // публікація
    isPublished: {
      type: Boolean,
      default: false,
      index: true,
    },

    publishedAt: {
      type: Date,
      default: null,
      index: true,
    },

    // стан пайплайна (upload → transcode → firebase)
    status: {
      type: String,
      enum: STATUS_ENUM,
      default: "processing",
      index: true,
    },

    errorMessage: {
      type: String,
      default: "",
      maxlength: 2000,
    },

    // URL прев'ю
    thumbnailUrl: {
      type: String,
      default: "",
    },

    // Якісні варіанти + максимум
    availableQualities: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => arr.every((q) => QUALITY_ENUM.includes(q)),
        message: "availableQualities contains invalid quality",
      },
    },

    maxQuality: {
      type: String,
      default: "720p",
      enum: QUALITY_ENUM,
    },

    // Прямі public URLs до Firebase варіантів
    // (заповнює бекенд після upload)
    sources: {
      type: Map,
      of: String,
      default: {},
    },

    views: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },

    tags: {
      type: [String],
      default: [],
      set: (arr) =>
        Array.from(
          new Set((arr || [])
          .map((t) => String(t).trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 30)
          )
        ),
    },

    count: {
      likes: { type: Number, default: 0, min: 0 },
      comments: { type: Number, default: 0, min: 0 },
    },
  },
  { minimize: false, timestamps: true }
);

// індекси під фіди
videoSchema.index({ isPublished: 1, publishedAt: -1, _id: -1 });
videoSchema.index({ channelRef: 1, createdAt: -1 });
videoSchema.index({ tags: 1, isPublished: 1, publishedAt: -1 })

videoSchema.post("save", handleSaveErrors);

const Video = model("video", videoSchema);

// Joi (для запиту з фронта)
const createVideoSchema = Joi.object({
  title: Joi.string().min(2).max(140).required(),
  description: Joi.string().max(5000).allow("").optional(),
  channelRef: Joi.string().required(),
  isPublished: Joi.boolean().optional(), // якщо true — сервер сам виставить publishedAt
});

// Joi (для редагування базових полів)
const updateVideoSchema = Joi.object({
  title: Joi.string().min(2).max(140).optional(),
  description: Joi.string().max(5000).allow("").optional(),
  isPublished: Joi.boolean().optional(),
}).min(1);

module.exports = {
  Video,
  schemas: { createVideoSchema, updateVideoSchema },
  QUALITY_ENUM,
  STATUS_ENUM,
};



