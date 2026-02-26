const Joi = require('joi')
const { Schema, model, Types } = require('mongoose')
const { handleSaveErrors } = require('../helpers')

const QUALITY_ENUM = ['360p', '480p', '720p']
const STATUS_ENUM = ['processing', 'ready', 'failed']
const objectIdRegex = /^[0-9a-fA-F]{24}$/

const channelSnapshotSchema = new Schema(
  {
    _id: { type: Types.ObjectId, required: true },
    handle: { type: String, required: true, trim: true, lowercase: true },
    title: { type: String, default: '', trim: true },
    name: { type: String, default: '', trim: true },
    avatarUrl: { type: String, default: '' },
  },
  { _id: false },
)

const statsSchema = new Schema(
  {
    views: { type: Number, default: 0, min: 0, index: true },
    likes: { type: Number, default: 0, min: 0 },
    dislikes: { type: Number, default: 0, min: 0 },
    comments: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
)

const videoSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, 'Video title is required'],
      minlength: 2,
      maxlength: 140,
      trim: true,
    },

    description: {
      type: String,
      default: '',
      maxlength: 5000,
      trim: true,
    },

    ownerId: {
      type: Types.ObjectId,
      ref: 'user',
      required: true,
      index: true,
    },

    channelRef: {
      type: Types.ObjectId,
      ref: 'channel',
      required: [true, 'channelRef is required'],
      index: true,
    },

    channelSnapshot: {
      type: channelSnapshotSchema,
      required: true,
    },

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

    status: {
      type: String,
      enum: STATUS_ENUM,
      default: 'processing',
      index: true,
    },

    errorMessage: {
      type: String,
      default: '',
      maxlength: 2000,
    },

    thumbnailUrl: {
      type: String,
      default: '',
    },

    availableQualities: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => (arr || []).every((q) => QUALITY_ENUM.includes(q)),
        message: 'availableQualities contains invalid quality',
      },
    },

    maxQuality: {
      type: String,
      default: '720p',
      enum: QUALITY_ENUM,
    },

    sources: {
      type: Map,
      of: String,
      default: {},
    },

    tags: {
      type: [String],
      default: [],
      set: (arr) =>
        Array.from(
          new Set(
            (arr || [])
              .map((t) => String(t).trim().toLowerCase())
              .filter(Boolean)
              .slice(0, 30),
          ),
        ),
      index: true,
    },

    duration: {
      type: Number,
      required: true,
      min: 1,
    },

    stats: {
      type: statsSchema,
      default: () => ({}),
    },
  },
  { minimize: false, timestamps: true },
)

videoSchema.index({ ownerId: 1, createdAt: -1 })
videoSchema.index({ isPublished: 1, publishedAt: -1, _id: -1 })
videoSchema.index({ channelRef: 1, createdAt: -1 })
videoSchema.index({ tags: 1, isPublished: 1, publishedAt: -1 })

videoSchema.post('save', handleSaveErrors)

const Video = model('video', videoSchema)

const createVideoSchema = Joi.object({
  title: Joi.string().min(2).max(140).required(),
  description: Joi.string().max(5000).allow('').optional(),
  channelRef: Joi.string().pattern(objectIdRegex).required(),
  isPublished: Joi.boolean().optional(),
})

const updateVideoSchema = Joi.object({
  title: Joi.string().min(2).max(140).optional(),
  description: Joi.string().max(5000).allow('').optional(),
  isPublished: Joi.boolean().optional(),
}).min(1)



const getChannelVideosQuerySchema = Joi.object({
  channelId: Joi.string().pattern(objectIdRegex).required(),
  publishedOnly: Joi.boolean().truthy('true').falsy('false').optional(),
  sort: Joi.string().valid('latest', 'popular', 'oldest').optional(),
  query: Joi.string().max(120).allow('').optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(20),
})

const reactVideoSchema = Joi.object({
  value: Joi.number().valid(1, -1, 0).required(),
  visitorId: Joi.string().min(10).max(64).optional(),
})

module.exports = {
  Video,
  schemas: { createVideoSchema, updateVideoSchema, getChannelVideosQuerySchema, reactVideoSchema },
  QUALITY_ENUM,
  STATUS_ENUM,
}
