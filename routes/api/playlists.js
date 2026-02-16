const express = require('express')
const { ctrlWrapper } = require('../../helpers')
const { authorize, validate } = require('../../middlewares')
const { uploadImage } = require('../../middlewares/uploadImage')
const ctrl = require('../../controllers/playlistsController')
const { schemas } = require('../../models/playlist')

const router = express.Router()

router.post(
  '/create',
  authorize,
  uploadImage.single('image'),
  validate(schemas.createPlaylistSchema),
  ctrlWrapper(ctrl.createPlaylistController),
)

module.exports = router
