const jwt = require('jsonwebtoken')
const { User } = require('../models/user')
const { SECRET_KEY } = process.env

const authorizeOptional = async (req, res, next) => {
  const accessToken = req.cookies?.accessToken
  const refreshToken = req.cookies?.refreshToken

  console.log('authorizeOptional middleware:', { accessToken, refreshToken })

  req.user = null
  req.authError = null

  if (!accessToken) {
    if (refreshToken) req.authError = 'missing'
    return next()
  }

  try {
    const payload = jwt.verify(accessToken, SECRET_KEY)
    const user = await User.findById(payload.id)
    req.user = user || null
    return next()
  } catch (err) {
    if (err?.name === 'TokenExpiredError') req.authError = 'expired'
    else req.authError = 'invalid'
    return next()
  }
}

module.exports = authorizeOptional

