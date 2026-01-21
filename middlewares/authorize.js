const jwt = require('jsonwebtoken')
const { User } = require('../models/user')
const { SECRET_KEY } = process.env

const authorize = async (req, res, next) => {
  const accessToken = req.cookies?.accessToken

  if (!accessToken) return res.status(401).json({ message: 'Unauthorized' })

  let payload
  try {
    payload = jwt.verify(accessToken, SECRET_KEY)
  } catch {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  const user = await User.findById(payload.id)
  if (!user) return res.status(404).json({ message: 'Invalid user' })

  req.user = user
  return next()
}

module.exports = authorize