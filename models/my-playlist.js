const Joi = require('joi')
const { Schema, model, Types } = require('mongoose')
const { handleSaveErrors } = require('../helpers')

const objectIdRegex = /^[0-9a-fA-F]{24}$/

const SOURCE_TYPE_ENUM = ['manual', 'search', 'playlist']

const myPlaylistItemSchema = new Schema(
  {
    videoId: { type: Types.ObjectId, required: true, ref: 'video' },
    order: { type: Number, required: true, min: 1 },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false },
)

const myPlaylistSchema = new Schema(
  {
    ownerId: {
      type: Types.ObjectId,
      ref: 'user',
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

    coverUrl: {
      type: String,
      default: '',
    },

    items: {
      type: [myPlaylistItemSchema],
      default: [],
    },

    sourcePlaylistId: {
      type: Types.ObjectId,
      ref: 'playlist',
      default: null,
    },

    sourceQuery: {
      type: String,
      default: '',
      trim: true,
      maxlength: 200,
    },

    sourceType: {
      type: String,
      enum: SOURCE_TYPE_ENUM,
      default: 'manual',
    },
  },
  { timestamps: true },
)

myPlaylistSchema.index({ ownerId: 1, createdAt: -1 })
myPlaylistSchema.index({ 'items.videoId': 1, updatedAt: -1 })

myPlaylistSchema.post('save', handleSaveErrors)

const MyPlaylist = model('myPlaylist', myPlaylistSchema)

const createMyPlaylistSchema = Joi.object({
  title: Joi.string().trim().min(2).max(80).required(),
  videoIds: Joi.array()
    .items(Joi.string().pattern(objectIdRegex))
    .min(1)
    .required(),
  sourceQuery: Joi.string().trim().max(200).allow('').optional(),
})

const addToMyPlaylistSchema = Joi.object({
  playlistId: Joi.string().pattern(objectIdRegex).required(),
  videoIds: Joi.array()
    .items(Joi.string().pattern(objectIdRegex))
    .min(1)
    .required(),
})

const addPlaylistToMyPlaylistsSchema = Joi.object({
  sourcePlaylistId: Joi.string().pattern(objectIdRegex).required(),
  title: Joi.string().trim().min(2).max(80).allow('').optional(),
})

const schemas = {
  createMyPlaylistSchema,
  addToMyPlaylistSchema,
  addPlaylistToMyPlaylistsSchema,
}

module.exports = {
  MyPlaylist,
  schemas,
  SOURCE_TYPE_ENUM,
}
