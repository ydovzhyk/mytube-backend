// models/comment.js
const Joi = require('joi')
const { Schema, model, Types } = require('mongoose')
const { handleSaveErrors } = require('../helpers')

/* =========================
   Mongoose schema
========================= */

const replyPreviewSchema = new Schema(
  {
    commentId: { type: Types.ObjectId, ref: 'comment', required: true },
    authorHandle: { type: String, default: '', trim: true, maxlength: 60 },
    authorTitle: { type: String, default: '', trim: true, maxlength: 60 },
    authorAvatarUrl: { type: String, default: '' },
    textShort: { type: String, default: '', trim: true, maxlength: 160 },
  },
  { _id: false, minimize: false },
)

const authorSnapshotSchema = new Schema(
  {
    // ✅ канал (для owner-коментарів)
    channelId: {
      type: Types.ObjectId,
      ref: 'channel',
      required: false,
      index: true,
      default: null,
    },
    handle: {
      type: String,
      default: '',
      trim: true,
      lowercase: true,
      maxlength: 60,
    },
    title: { type: String, default: '', trim: true, maxlength: 60 },
    avatarUrl: { type: String, default: '' },

    // ✅ юзер (для всіх інших)
    name: { type: String, default: '', trim: true, maxlength: 60 },
    avatar: { type: String, default: '' },
  },
  { _id: false, minimize: false },
)

const commentSchema = new Schema(
  {
    videoId: {
      type: Types.ObjectId,
      ref: 'video',
      required: true,
      index: true,
    },

    // ✅ НОВЕ: хто написав (User)
    authorUserId: {
      type: Types.ObjectId,
      ref: 'user',
      required: true,
      index: true,
    },

    // LEGACY (старі коментарі могли мати channelId-автора)
    authorChannelId: {
      type: Types.ObjectId,
      ref: 'channel',
      required: false,
      index: true,
      default: null,
    },

    // ✅ щоб рендерити без populate
    authorSnapshot: { type: authorSnapshotSchema, required: true },

    // root comment: replyTo = null
    replyTo: {
      type: Types.ObjectId,
      ref: 'comment',
      default: null,
      index: true,
    },

    // щоб показати “у відповідь на …” навіть якщо батька видалили
    replyPreview: { type: replyPreviewSchema, default: null },

    // текст
    text: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 5000,
    },

    // реакції (агрегати)
    likesCount: { type: Number, default: 0, min: 0 },
    dislikesCount: { type: Number, default: 0, min: 0 },

    // pinning
    pinnedAt: { type: Date, default: null, index: true },

    // delete/edit flags
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },

    editedAt: { type: Date, default: null },
  },
  { minimize: false, timestamps: true },
)

// корисні індекси для вибірок
commentSchema.index({ videoId: 1, pinnedAt: -1, createdAt: -1 })
commentSchema.index({ videoId: 1, replyTo: 1, createdAt: 1 })

commentSchema.post('save', handleSaveErrors)

const Comment = model('comment', commentSchema)

/* =========================
   Joi schemas
========================= */

const objectId = Joi.string().length(24).hex()

// create root/reply (pin — тільки для owner, це перевірка в контроллері)
const createCommentSchema = Joi.object({
  videoId: objectId.required(),
  content: Joi.string().trim().min(1).max(5000).required(),
  replyTo: objectId.allow(null).optional(),
  pin: Joi.boolean().optional(),
})

// edit text OR pin/unpin (мінімум одне поле)
const editCommentSchema = Joi.object({
  content: Joi.string().trim().min(1).max(5000).optional(),
  pin: Joi.boolean().optional(),
}).or('content', 'pin')

const reactCommentSchema = Joi.object({
  value: Joi.number().valid(-1, 0, 1).required(),
})

// pagination
const getByVideoSchema = Joi.object({
  cursor: Joi.string().allow('').optional(),
  limit: Joi.number().integer().min(1).max(50).optional(),
  includeReplies: Joi.number().valid(0, 1).optional(),
  repliesLimit: Joi.number().integer().min(0).max(200).optional(),
})

module.exports = {
  Comment,
  schemas: {
    createCommentSchema,
    editCommentSchema,
    reactCommentSchema,
    getByVideoSchema,
  },
}
