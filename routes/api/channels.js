const express = require('express')
const { ctrlWrapper } = require('../../helpers')
const ctrl = require('../../controllers/channelsController')
const { authorize } = require('../../middlewares')
const { uploadImage } = require('../../middlewares/uploadImage')

const router = express.Router()

// 1) Мої канали (dropdown / studio)
router.get('/', authorize, ctrlWrapper(ctrl.getMyChannelsController))

// 2) Створити канал
router.post(
  '/create',
  authorize,
  uploadImage.single('image'),
  ctrlWrapper(ctrl.createChannelController),
)

// 3) Перевірка унікальності handle (blur)
router.get('/check-handle', ctrlWrapper(ctrl.checkHandleController))

// 4) Отримати канал по handle (для /channel/@handle)
router.get('/by-handle/:handle', ctrlWrapper(ctrl.getChannelByHandleController))

// 5) Отримати канал по id (публічно)
router.get('/:id', ctrlWrapper(ctrl.getChannelController))

// 6) Оновити канал (універсально, включно з image через multipart)
router.patch(
  '/:id',
  authorize,
  uploadImage.single('image'),
  ctrlWrapper(ctrl.updateChannelController),
)

// 7) Видалити канал
router.delete('/:id', authorize, ctrlWrapper(ctrl.deleteChannelController))

module.exports = router
