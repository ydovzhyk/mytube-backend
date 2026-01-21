const validateBody = require("./validateBody");
const validate = require("./validate");
const isValidId = require("./isValidId");
const authorize = require("./authorize");
const authenticateRefresh = require("./authenticateRefresh");
const authorizeOptional = require("./authorizeOptional");
const passport = require("./google-auth");
const uploaadVideo = require("./uploadVideo");

module.exports = {
  authorize,
  validateBody,
  validate,
  isValidId,
  authenticateRefresh,
  authorizeOptional,
  passport,
  uploadVideo: uploaadVideo,
};
