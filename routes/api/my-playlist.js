const express = require('express')

const { ctrlWrapper } = require('../../helpers')
const ctrl = require('../../controllers/myPlaylistController')
const { authorize, validate } = require('../../middlewares')
const { schemas } = require('../../models/my-playlist')

const router = express.Router()

router.post(
  '/create',
  authorize,
  validate(schemas.createMyPlaylistSchema),
  ctrlWrapper(ctrl.createMyPlaylistController),
)

router.post(
  '/add',
  authorize,
  validate(schemas.addToMyPlaylistSchema),
  ctrlWrapper(ctrl.addToMyPlaylistController),
)

router.post(
  '/add-playlist',
  authorize,
  validate(schemas.addPlaylistToMyPlaylistsSchema),
  ctrlWrapper(ctrl.addPlaylistToMyPlaylistsController),
)

router.get('/', authorize, ctrlWrapper(ctrl.getMyPlaylistsController))

router.get(
  '/current/:playlistId',
  authorize,
  ctrlWrapper(ctrl.getCurrentMyPlaylistController),
)

module.exports = router
