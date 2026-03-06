const jwt = require('jsonwebtoken')
const { User } = require('../models/user')
const { SECRET_KEY } = process.env

const authorizeOptional = async (req, res, next) => {
  const accessToken = req.cookies?.accessToken
  const refreshToken = req.cookies?.refreshToken

  req.user = null
  req.authError = null

  // 1) no access
  if (!accessToken) {
    if (refreshToken) {
      return res.status(401).json({
        message: 'Access token missing',
        code: 'ACCESS_NEED_REFRESH',
      })
    }
    return next()
  }

  try {
    const payload = jwt.verify(accessToken, SECRET_KEY)
    const user = await User.findById(payload.id)

    // token valid, but user not found -> treat as guest
    if (!user) {
      req.user = null
      req.authError = 'not_found'
      return next()
    }

    req.user = user
    return next()
  } catch (err) {
    if (refreshToken && err?.name === 'TokenExpiredError') {
      return res.status(401).json({
        message: 'Access token expired',
        code: 'ACCESS_NEED_REFRESH',
      })
    }

    if (refreshToken && err?.name !== 'TokenExpiredError') {
      return res.status(401).json({
        message: 'Access token invalid',
        code: 'ACCESS_NEED_REFRESH',
      })
    }

    req.authError = err?.name === 'TokenExpiredError' ? 'expired' : 'invalid'
    return next()
  }
}

module.exports = authorizeOptional
