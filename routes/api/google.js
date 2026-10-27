const express = require("express");

const { ctrlWrapper } = require("../../helpers");
const ctrl = require("../../controllers/authController");

const { passport } = require("../../middlewares");
const router = express.Router();

const rememberOrigin = (req, res, next) => {
  const raw = req.query.origin
  if (!raw) return next()

  // express already decodes query; keep safe if double-encoded
  let origin = String(raw)
  try {
    origin = decodeURIComponent(origin)
  } catch {
    // keep as-is
  }

  req.session.origin = origin
  // ensure cookie is written before redirect to Google
  req.session.save((err) => {
    if (err) return next(err)
    next()
  })
}

router.get(
  "/",
  rememberOrigin,
  passport.authenticate("google", { scope: ["email", "profile"] })
);

router.get(
  "/callback",
  passport.authenticate("google", { session: false }),
  ctrlWrapper(ctrl.googleAuthController)
);

module.exports = router;
