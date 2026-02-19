const jwt = require('jsonwebtoken')
const { User } = require('../models/user')
const { REFRESH_SECRET_KEY } = process.env

const authenticateRefresh = async (req, res, next) => {
  const refreshToken = req.cookies?.refreshToken

  if (!refreshToken) {
    return res
      .status(401)
      .json({ code: 'NO_TOKEN', message: 'Please login again' })
  }

  let payload
  try {
    payload = jwt.verify(refreshToken, REFRESH_SECRET_KEY)
  } catch (err) {
    const code = err?.name === 'TokenExpiredError' ? 'REFRESH_EXPIRED' : 'REFRESH_INVALID'
    return res.status(401).json({ code, message: 'Please login again' })
  }

  const user = await User.findById(payload.id)
  if (!user) {
    return res.status(404).json({ code: 'USER_NOT_FOUND', message: 'Please login again' })
  }

  req.user = user
  return next()
}

module.exports = authenticateRefresh