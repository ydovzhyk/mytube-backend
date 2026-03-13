const Joi = require('joi')
const { Schema, model } = require('mongoose')
const { handleSaveErrors } = require('../helpers')

const emailRegexp = /^([^\s@]+@[^\s@]+\.[^\s@]+|\w{4}-\s?\w{5}@gmail\.com)$/

const watchHistoryItemSchema = new Schema(
  {
    videoId: { type: Schema.Types.ObjectId, ref: 'video', required: true },
    watchedAt: { type: Date, default: Date.now },
  },
  { _id: false },
)

const videoReactionSchema = new Schema(
  {
    videoId: { type: Schema.Types.ObjectId, ref: 'video', required: true },
    value: { type: Number, enum: [1, -1], required: true },
    reactedAt: { type: Date, default: Date.now },
  },
  { _id: false },
)

const commentReactionSchema = new Schema(
  {
    commentId: { type: Schema.Types.ObjectId, ref: 'comment', required: true },
    value: { type: Number, enum: [1, -1], required: true },
    reactedAt: { type: Date, default: Date.now },
  },
  { _id: false },
)

const searchHistoryItemSchema = new Schema(
  {
    q: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    at: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
)

const myPlaylistRefSchema = new Schema(
  {
    playlistId: {
      type: Schema.Types.ObjectId,
      ref: 'myPlaylist',
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    videoIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'video' }],
      default: [],
    },
    at: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
)

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'User Name is required'],
      minlength: 2,
      maxlength: 25,
      trim: true,
    },
    email: {
      type: String,
      unique: true,
      match: emailRegexp,
      trim: true,
      lowercase: true,
    },
    passwordHash: {
      type: String,
      required: [true, 'Set password for user'],
      minlength: 6,
    },
    userAvatar: {
      type: String,
      default: '',
    },
    channels: {
      type: [{ type: Schema.Types.ObjectId, ref: 'channel' }],
      default: [],
    },
    watchHistory: {
      type: [watchHistoryItemSchema],
      default: [],
    },
    videoReactions: {
      type: [videoReactionSchema],
      default: [],
    },
    commentReactions: {
      type: [commentReactionSchema],
      default: [],
    },
    searchHistory: {
      type: [searchHistoryItemSchema],
      default: [],
    },
    likedChannels: {
      type: [{ type: Schema.Types.ObjectId, ref: 'channel' }],
      default: [],
    },
    savedPlaylists: {
      type: [{ type: Schema.Types.ObjectId, ref: 'playlist' }],
      default: [],
    },
    myPlaylists: {
      type: [myPlaylistRefSchema],
      default: [],
    },
    subscribedChannels: {
      type: [{ type: Schema.Types.ObjectId, ref: 'channel' }],
      default: [],
    },
  },
  { minimize: false, timestamps: true },
)

userSchema.post('save', handleSaveErrors)

const User = model('user', userSchema)

const registerSchema = Joi.object({
  email: Joi.string().pattern(emailRegexp).required(),
  password: Joi.string().min(6).required(),
  name: Joi.string().min(2).max(25).required(),
  userAvatar: Joi.string().allow('').required(),
})

const loginSchema = Joi.object({
  email: Joi.string().pattern(emailRegexp).required(),
  password: Joi.string().min(6).required(),
})

const refreshTokenSchema = Joi.object({
  sid: Joi.string().required(),
})

const editUserSchema = Joi.object({
  name: Joi.string().min(2).max(25).optional().allow(''),
  userAvatar: Joi.string().optional().allow(''),
})

const updateUserSchema = Joi.object({
  watchedVideoId: Joi.string().hex().length(24).optional(),
  reactVideoId: Joi.string().hex().length(24).optional(),
  reactValue: Joi.number().valid(1, -1, 0).optional(),

  savedPlaylistId: Joi.string().hex().length(24).optional(),
  unsavedPlaylistId: Joi.string().hex().length(24).optional(),
  likedChannelId: Joi.string().hex().length(24).optional(),
  unlikedChannelId: Joi.string().hex().length(24).optional(),
  subscribedChannelId: Joi.string().hex().length(24).optional(),
  unsubscribedChannelId: Joi.string().hex().length(24).optional(),

  likedVideoId: Joi.string().hex().length(24).optional(),
  unlikedVideoId: Joi.string().hex().length(24).optional(),
})
  .or(
    'watchedVideoId',
    'reactVideoId',
    'savedPlaylistId',
    'unsavedPlaylistId',
    'likedChannelId',
    'unlikedChannelId',
    'subscribedChannelId',
    'unsubscribedChannelId',
    'likedVideoId',
    'unlikedVideoId',
  )
  .and('reactVideoId', 'reactValue')

const schemas = {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  editUserSchema,
  updateUserSchema,
}

module.exports = {
  User,
  schemas,
}