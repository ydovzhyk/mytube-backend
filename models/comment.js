// models/comment.js
const { Schema, model, Types } = require('mongoose')

const CommentSchema = new Schema(
  {
    videoId: {
      type: Types.ObjectId,
      ref: 'Video',
      required: true,
      index: true,
    },

    authorId: {
      type: Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    authorChannelId: {
      type: Types.ObjectId,
      ref: 'Channel',
      required: true,
      index: true,
    },

    authorSnapshot: {
      channelId: { type: Types.ObjectId, required: true },
      handle: { type: String, required: true },
      title: { type: String, default: '' }, // Music & More
      name: { type: String, default: '' }, // Yuriy Dovzhyk (опційно)
      avatarUrl: { type: String, default: '' },
      // optional: isOwnerAtMoment: Boolean (я б НЕ зберігав, краще визначати на рендері)
    },

    text: { type: String, required: true, maxlength: 2000 },

    replyTo: { type: Types.ObjectId, ref: 'Comment', default: null },
    replyPreview: {
      commentId: { type: Types.ObjectId },
      authorName: { type: String, default: '' },
      authorHandle: { type: String, default: '' },
      authorAvatar: { type: String, default: '' },
      textShort: { type: String, default: '' },
    },

    pinnedAt: { type: Date, default: null, index: true },
    pinnedBy: { type: Types.ObjectId, ref: 'User', default: null }, // optional

    likesCount: { type: Number, default: 0 },
    dislikesCount: { type: Number, default: 0 },

    isDeleted: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

// сортування “прикріплені зверху”: pinnedAt desc, createdAt desc
CommentSchema.index({ videoId: 1, pinnedAt: -1, createdAt: -1, _id: -1 })

module.exports.Comment = model('Comment', CommentSchema)
