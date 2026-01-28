const Joi = require('joi')
const { Schema, model, Types } = require('mongoose')
const { handleSaveErrors } = require('../helpers')

const handleRegex = /^[a-z0-9_]+$/

const channelSchema = new Schema(
  {
    handle: {
      type: String,
      required: true,
      unique: true,
      index: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 40,
      match: handleRegex,
      immutable: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 30,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 60,
    },
    bio: { type: String, default: '', maxlength: 2000, trim: true },
    description: { type: String, default: '', maxlength: 2000, trim: true },
    avatarUrl: { type: String, default: '' },
    bannerUrl: { type: String, default: '' },
    contactEmail: { type: String, default: '', trim: true, maxlength: 120 },
    links: {
      type: [
        {
          _id: false,
          title: { type: String, default: '', trim: true, maxlength: 40 },
          url: { type: String, required: true, trim: true, maxlength: 500 },
        },
      ],
      default: [],
    },
    videosCount: { type: Number, default: 0, min: 0 },
    followersCount: { type: Number, default: 0, min: 0 },
    ownerId: { type: Types.ObjectId, ref: 'user', required: true, index: true },
  },
  { minimize: false, timestamps: true },
)

channelSchema.post('save', handleSaveErrors)

const Channel = model('channel', channelSchema)

const linkSchema = Joi.object({
  title: Joi.string().max(40).allow('').optional(),
  url: Joi.string().uri().max(500).required(),
})

const createChannelSchema = Joi.object({
  handle: Joi.string()
    .trim()
    .lowercase()
    .min(3)
    .max(40)
    .pattern(handleRegex)
    .required(),
  name: Joi.string().trim().min(2).max(30).required(),
  title: Joi.string().trim().min(2).max(60).required(),
  bio: Joi.string().trim().max(2000).allow('').optional(),
  description: Joi.string().trim().max(2000).allow('').optional(),
  avatarUrl: Joi.string().max(2_000_000).allow('').optional(),
  contactEmail: Joi.string().email().max(120).allow('').optional(),
  links: Joi.array().items(linkSchema).max(10).optional(),
})

const updateChannelSchema = Joi.object({
  handle: Joi.string()
    .trim()
    .lowercase()
    .min(3)
    .max(40)
    .pattern(handleRegex)
    .optional(),
  name: Joi.string().min(2).max(30).optional(),
  title: Joi.string().min(2).max(60).optional(),
  bio: Joi.string().max(2000).allow('').optional(),
  description: Joi.string().max(2000).allow('').optional(),
  avatarUrl: Joi.string().max(2_000_000).allow('').optional(),
  contactEmail: Joi.string().email().max(120).allow('').optional(),
  links: Joi.array().items(linkSchema).max(10).optional(),
})

module.exports = {
  Channel,
  schemas: { createChannelSchema, updateChannelSchema },
}
