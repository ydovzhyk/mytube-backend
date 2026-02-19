const express = require('express')
const { ctrlWrapper } = require('../../helpers')
const ctrl = require('../../controllers/videosContoller')
const { authorize, validate, authorizeOptional } = require('../../middlewares')
const { uploadVideo } = require('../../middlewares/uploadVideo')
const { schemas } = require('../../models/video')

const router = express.Router()

router.get('/', ctrlWrapper(ctrl.getVideosController))

router.post(
  '/upload',
  authorize,
  uploadVideo.fields([
    { name: 'video', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
  ]),
  ctrlWrapper(ctrl.uploadVideoController),
)

router.get(
  '/channel',
  validate(schemas.getChannelVideosQuerySchema),
  ctrlWrapper(ctrl.getChannelVideoController),
)

router.get(
  '/channel/owner',
  validate(schemas.getChannelVideosQuerySchema),
  ctrlWrapper(ctrl.getChannelVideoController),
)

router.get(
  '/picker',
  authorize,
  ctrlWrapper(ctrl.getVideosPickerController)
)

router.post(
  '/view-count/:id',
  ctrlWrapper(ctrl.videoViewController)
)

router.get(
  '/:id/similar',
  authorizeOptional,
  ctrlWrapper(ctrl.getSimilarVideosController)
)

router.post(
  '/:id/react',
  authorizeOptional,
  ctrlWrapper(ctrl.reactVideoController),
)

router.get(
  '/:id',
  authorizeOptional,
  validate(schemas.reactVideoSchema),
  ctrlWrapper(ctrl.getWatchVideoController)
)

module.exports = router
