const express = require('express')
const { ctrlWrapper } = require('../../helpers')
const ctrl = require('../../controllers/visitorController')
const { validateBody } = require('../../middlewares')
const { schemas } = require('../../models/visitor')

const router = express.Router()

router.get('/init', ctrlWrapper(ctrl.initVisitor))

router.post(
  '/update',
  validateBody(schemas.updateVisitorSchema),
  ctrlWrapper(ctrl.updateVisitor),
)

module.exports = router
