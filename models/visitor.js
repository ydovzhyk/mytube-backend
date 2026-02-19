const Joi = require('joi')
const { Schema, model } = require('mongoose')
const { handleSaveErrors } = require('../helpers')

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

const visitorSchema = new Schema(
  {
    visitorId: {
      type: String,
      required: [true, 'visitorId is required'],
      unique: true,
      trim: true,
      minlength: 10,
      maxlength: 64,
    },

    watchHistory: { type: [watchHistoryItemSchema], default: [] },

    videoReactions: { type: [videoReactionSchema], default: [] },

    lastSeenAt: { type: Date, default: Date.now },
  },
  { minimize: false, timestamps: true },
)

visitorSchema.post('save', handleSaveErrors)
visitorSchema.index({ lastSeenAt: -1 })

const Visitor = model('visitor', visitorSchema)

const visitorIdSchema = Joi.object({
  visitorId: Joi.string().min(10).max(64).required(),
})

const updateVisitorSchema = Joi.object({
  visitorId: Joi.string().min(10).max(64).required(),
  watchedVideoId: Joi.string().hex().length(24).optional(),
  reactVideoId: Joi.string().hex().length(24).optional(),
  reactValue: Joi.number().valid(1, -1, 0).optional(),
})
  .or('watchedVideoId', 'reactVideoId')
  .and('reactVideoId', 'reactValue')

const schemas = {
  visitorIdSchema,
  updateVisitorSchema,
}

module.exports = { Visitor, schemas }
