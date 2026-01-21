const express = require("express");
const { ctrlWrapper } = require("../../helpers");
const ctrl = require("../../controllers/authController");

const {
  validateBody,
  authorize,
  authenticateRefresh,
  authorizeOptional,
} = require("../../middlewares");
const { schemas } = require("../../models/user");
const router = express.Router();

// Register user
router.post(
  "/register",
  validateBody(schemas.registerSchema),
  ctrlWrapper(ctrl.register)
);

// Login user
router.post(
  "/login",
  validateBody(schemas.loginSchema),
  ctrlWrapper(ctrl.login)
);

// Logout user
router.post('/logout', ctrlWrapper(ctrl.logout))

// Refresh user
router.post('/refresh', authenticateRefresh, ctrlWrapper(ctrl.refresh))

// Get current user
const noStore = (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  res.set('Pragma', 'no-cache')
  res.set('Expires', '0')
  next()
}

router.get('/current', noStore, authorizeOptional, ctrlWrapper(ctrl.getUserController))

// Edit user
router.post(
  "/edit",
  authorize,
  validateBody(schemas.editUserSchema),
  ctrlWrapper(ctrl.editUserController)
);

// Delete user
router.delete(
  '/delete/:userId',
  authorize,
  ctrlWrapper(ctrl.deleteUserController)
)

module.exports = router;
