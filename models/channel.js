const Joi = require("joi");
const { Schema, model, Types } = require("mongoose");
const { handleSaveErrors } = require("../helpers");

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
    },
    bio: { type: String, default: "", maxlength: 2000, trim: true },
    avatarPath: { type: String, default: "" },
    bannerPath: { type: String, default: "" },

    ownerId: { type: Types.ObjectId, ref: "user", required: true, index: true },
  },
  { minimize: false, timestamps: true }
);

channelSchema.post("save", handleSaveErrors);

const Channel = model("channel", channelSchema);

const createChannelSchema = Joi.object({
  handle: Joi.string().min(3).max(40).required(),
  bio: Joi.string().max(2000).allow("").optional(),
  avatarPath: Joi.string().allow("").optional(),
  bannerPath: Joi.string().allow("").optional(),
});

const updateChannelSchema = Joi.object({
  handle: Joi.string().min(3).max(40).optional(),
  bio: Joi.string().max(2000).allow("").optional(),
  avatarPath: Joi.string().allow("").optional(),
  bannerPath: Joi.string().allow("").optional(),
}).min(1);

module.exports = { Channel, schemas: { createChannelSchema, updateChannelSchema } };

