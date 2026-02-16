const Joi = require('joi')
const { Schema, model, Types } = require('mongoose')
const { handleSaveErrors } = require('../helpers')

const objectIdRegex = /^[0-9a-fA-F]{24}$/

const VISIBILITY_ENUM = ['public', 'unlisted', 'private']

const playlistItemSchema = new Schema(
  {
    videoId: { type: Types.ObjectId, required: true, ref: 'video' },
    order: { type: Number, required: true, min: 1 },
  },
  { _id: false },
)

const playlistSchema = new Schema(
  {
    channelRef: {
      type: Types.ObjectId,
      ref: 'channel',
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },

    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: 5000,
    },

    visibility: {
      type: String,
      enum: VISIBILITY_ENUM,
      default: 'public',
      index: true,
    },

    coverUrl: { type: String, default: '' },

    items: {
      type: [playlistItemSchema],
      default: [],
    },
  },
  { timestamps: true },
)

playlistSchema.index({ channelRef: 1, createdAt: -1 })
playlistSchema.index({ 'items.videoId': 1, updatedAt: -1 })
playlistSchema.index({ visibility: 1, updatedAt: -1 })

playlistSchema.post('save', handleSaveErrors)

const Playlist = model('playlist', playlistSchema)

const createPlaylistSchema = Joi.object({
  channelRef: Joi.string().pattern(objectIdRegex).required(),
  title: Joi.string().min(2).max(80).required(),
  description: Joi.string().max(5000).allow('').optional(),
  visibility: Joi.string()
    .valid(...VISIBILITY_ENUM)
    .optional(),
  items: Joi.string().required(),
})

module.exports = {
  Playlist,
  schemas: { createPlaylistSchema },
  VISIBILITY_ENUM,
}
