const Joi = require("joi");
const { Schema, model } = require("mongoose");
const { handleSaveErrors } = require("../helpers");

const emailRegexp = /^([^\s@]+@[^\s@]+\.[^\s@]+|\w{4}-\s?\w{5}@gmail\.com)$/

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'User Name is required'],
      minlength: 2,
      maxlength: 25,
    },
    email: {
      type: String,
      unique: true,
      match: emailRegexp,
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
  },
  { minimize: false, timestamps: true }
)

userSchema.post("save", handleSaveErrors);

const User = model("user", userSchema);

const registerSchema = Joi.object({
  email: Joi.string().pattern(emailRegexp).required(),
  password: Joi.string().min(6).required(),
  name: Joi.string().required(),
  userAvatar: Joi.string().required(),
})

const loginSchema = Joi.object({
  email: Joi.string().pattern(emailRegexp).required(),
  password: Joi.string().min(6).required(),
});

const refreshTokenSchema = Joi.object({
  sid: Joi.string().required(),
});

const editUserSchema = Joi.object({
  name: Joi.string().min(2).max(25).optional().allow(""),
  email: Joi.string().optional().allow(""),
  userAvatar: Joi.string().optional().allow(""),
});

const schemas = {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  editUserSchema,
}

module.exports = {
  User,
  schemas,
};
