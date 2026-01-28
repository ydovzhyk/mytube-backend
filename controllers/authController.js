const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { User } = require('../models/user')
const { SECRET_KEY, REFRESH_SECRET_KEY } = process.env
const { RequestError } = require('../helpers')

const isProd = process.env.NODE_ENV === 'production'

const COOKIE_BASE = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax',
  path: '/',
}

const ACCESS_TTL_MS = 2 * 60 * 1000 // 2m
const REFRESH_TTL_MS = 24 * 60 * 60 * 1000 // 24h

const msToJwt = (ms) => `${Math.floor(ms / 1000)}s`

const ACCESS_COOKIE_OPTIONS = {
  ...COOKIE_BASE,
  maxAge: ACCESS_TTL_MS,
}

const REFRESH_COOKIE_OPTIONS = {
  ...COOKIE_BASE,
  maxAge: REFRESH_TTL_MS,
}

const setAuthCookies = (res, { accessToken, refreshToken }) => {
  if (accessToken) res.cookie('accessToken', accessToken, ACCESS_COOKIE_OPTIONS)
  if (refreshToken) res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS)
}

const clearAuthCookies = (res) => {
  res.clearCookie('accessToken', COOKIE_BASE)
  res.clearCookie('refreshToken', COOKIE_BASE)
}

const signTokens = (userId, { refresh = true } = {}) => {
  const payload = { id: userId.toString() }

  const accessToken = jwt.sign(payload, SECRET_KEY, { expiresIn: msToJwt(ACCESS_TTL_MS) })
  if (!refresh) return { accessToken }

  const refreshToken = jwt.sign(payload, REFRESH_SECRET_KEY, { expiresIn: msToJwt(REFRESH_TTL_MS) })
  return { accessToken, refreshToken }
}

// REGISTER
const register = async (req, res, next) => {
  try {
    const { name, email, password, userAvatar } = req.body

    const exists = await User.findOne({ email })
    if (exists) throw RequestError(409, 'Email in use')

    const passwordHash = await bcrypt.hash(password, 10)
    const newUser = await User.create({ name, email, passwordHash, userAvatar })

    const { accessToken, refreshToken } = signTokens(newUser._id)
    setAuthCookies(res, { accessToken, refreshToken })

    return res.status(201).json({ user: newUser })
  } catch (e) {
    next(e)
  }
}

// LOGIN
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body

    const user = await User.findOne({ email })
    if (!user) throw RequestError(400, 'Invalid email')

    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) throw RequestError(400, 'Invalid password')

    const { accessToken, refreshToken } = signTokens(user._id)
    setAuthCookies(res, { accessToken, refreshToken })

    return res.status(200).json({ user: user })
  } catch (e) {
    next(e)
  }
}

// REFRESH
const refresh = async (req, res, next) => {
  try {
    const user = req.user
    const { accessToken } = signTokens(user._id, { refresh: false })

    setAuthCookies(res, { accessToken })
    return res.status(200).json({ ok: true })
  } catch (e) {
    next(e)
  }
}

// LOGOUT
const logout = async (req, res, next) => {
  try {
    clearAuthCookies(res)
    return res.status(204).end()
  } catch (e) {
    next(e)
  }
}

// CURRENT
const getUserController = async (req, res, next) => {
  try {
    if (!req.user && (req.authError === 'expired' || req.authError === 'missing')) {
      return res.status(401).json({ code: 'ACCESS_NEED_REFRESH', message: 'Unauthorized' })
    }

    return res.status(200).json({ user: req.user ? req.user : null })
  } catch (e) {
    next(e)
  }
}

// EDIT
const editUserController = async (req, res, next) => {
  try {
    const { _id } = req.user
    const { name, userAvatar, email } = req.body

    const updatedUserData = {
      name: name ?? req.user.name,
      userAvatar: userAvatar ?? req.user.userAvatar,
      email: email ?? req.user.email,
    }

    const user = await User.findOneAndUpdate({ _id }, updatedUserData, {
      new: true,
      runValidators: true,
    })

    return res.status(200).json({ user: user, message: 'Profile updated successfully' })
  } catch (e) {
    next(e)
  }
}

// DELETE
const deleteUserController = async (req, res, next) => {
  try {
    const { userId } = req.params

    if (req.user._id.toString() !== userId) {
      return res.status(403).json({ message: 'Forbidden' })
    }

    await User.deleteOne({ _id: userId })
    clearAuthCookies(res)
    return res.status(204).end()
  } catch (e) {
    next(e)
  }
}

// GOOGLE AUTH
const googleAuthController = async (req, res, next) => {
  try {
    const origin = req.session.origin
    const { accessToken, refreshToken } = signTokens(req.user._id)
    setAuthCookies(res, { accessToken, refreshToken })

    return res.redirect(origin)
  } catch (error) {
    next(error)
  }
}

module.exports = {
  register,
  login,
  logout,
  refresh,
  getUserController,
  editUserController,
  deleteUserController,
  googleAuthController,
}


