// routes/api/comments.js
const express = require('express')
const { ctrlWrapper } = require('../../helpers')
const ctrl = require('../../controllers/commentsController')
const { authorize, validate, authorizeOptional } = require('../../middlewares')
const { schemas } = require('../../models/comment')

const router = express.Router()

// CREATE: POST /comments
// body: { videoId, content, replyTo?, pin? }
router.post(
  '/',
  authorize,
  validate(schemas.createCommentSchema),
  ctrlWrapper(ctrl.createCommentController),
)

// GET BY VIDEO: GET /comments/by-video/:videoId?cursor=&limit=&includeReplies=1&repliesLimit=
router.get(
  '/by-video/:videoId',
  authorizeOptional,
  validate(schemas.getByVideoSchema),
  ctrlWrapper(ctrl.getCommentsByVideoIdController),
)

// EDIT: PATCH /comments/:id
// body: { content?, pin? }  (мінімум одне поле)
router.patch(
  '/:id',
  authorize,
  validate(schemas.editCommentSchema),
  ctrlWrapper(ctrl.editCommentController),
)

// DELETE: DELETE /comments/:id
router.delete('/:id', authorize, ctrlWrapper(ctrl.deleteCommentController))

// REACT: POST /comments/:id/react
// body: { value: 1|-1|0 }
router.post(
  '/:id/react',
  authorize,
  validate(schemas.reactCommentSchema),
  ctrlWrapper(ctrl.reactCommentController),
)

module.exports = router