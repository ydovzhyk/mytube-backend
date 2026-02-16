const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { User } = require('../models/user')
const { SECRET_KEY, REFRESH_SECRET_KEY } = process.env
const { RequestError } = require('../helpers')

const isProd = process.env.NODE_ENV === 'production'
const WATCH_HISTORY_LIMIT = 200

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

// REGISTER NEW USER
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

// LOGIN EXISTING USER
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

// REFRESH ACCESS TOKEN
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

// LOGOUT USER
const logout = async (req, res, next) => {
  try {
    clearAuthCookies(res)
    return res.status(204).end()
  } catch (e) {
    next(e)
  }
}

// CURRENT USER
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

// EDIT USER (profile info like name, avatar, email)
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

// UPDATE USER (watched videos, liked videos/channels, saved playlists, etc.)
const updateUserController = async (req, res) => {
  const userId = req.user?._id
  if (!userId) throw RequestError(401, 'Unauthorized')

  const {
    watchedVideoId,
    likedVideoId,
    unlikedVideoId,
    savedPlaylistId,
    unsavedPlaylistId,
    likedChannelId,
    unlikedChannelId,
    subscribedChannelId,
    unsubscribedChannelId,
  } = req.body || {}

  const hasAny =
    watchedVideoId ||
    likedVideoId ||
    unlikedVideoId ||
    savedPlaylistId ||
    unsavedPlaylistId ||
    likedChannelId ||
    unlikedChannelId ||
    subscribedChannelId ||
    unsubscribedChannelId

  if (!hasAny) throw RequestError(400, 'Nothing to update')

  const user = await User.findById(userId)
  if (!user) throw RequestError(404, 'User not found')

  // --- WATCH HISTORY: dedupe + newest first + limit ---
  if (watchedVideoId) {
    const idStr = String(watchedVideoId)
    const prev = Array.isArray(user.watchHistory) ? user.watchHistory : []
    const filtered = prev.filter((it) => String(it?.videoId) !== idStr)
    filtered.unshift({ videoId: watchedVideoId, watchedAt: new Date() })
    user.watchHistory = filtered.slice(0, WATCH_HISTORY_LIMIT)
  }

  // --- LIKED VIDEOS ---
  if (likedVideoId) {
    const idStr = String(likedVideoId)
    const arr = Array.isArray(user.likedVideos) ? user.likedVideos : []
    if (!arr.some((x) => String(x) === idStr)) arr.push(likedVideoId)
    user.likedVideos = arr
  }
  if (unlikedVideoId) {
    const idStr = String(unlikedVideoId)
    user.likedVideos = (user.likedVideos || []).filter(
      (x) => String(x) !== idStr,
    )
  }

  // --- LIKED CHANNELS ---
  if (likedChannelId) {
    const idStr = String(likedChannelId)
    const arr = Array.isArray(user.likedChannels) ? user.likedChannels : []
    if (!arr.some((x) => String(x) === idStr)) arr.push(likedChannelId)
    user.likedChannels = arr
  }
  if (unlikedChannelId) {
    const idStr = String(unlikedChannelId)
    user.likedChannels = (user.likedChannels || []).filter(
      (x) => String(x) !== idStr,
    )
  }

  // --- SAVED PLAYLISTS ---
  if (savedPlaylistId) {
    const idStr = String(savedPlaylistId)
    const arr = Array.isArray(user.savedPlaylists) ? user.savedPlaylists : []
    if (!arr.some((x) => String(x) === idStr)) arr.push(savedPlaylistId)
    user.savedPlaylists = arr
  }
  if (unsavedPlaylistId) {
    const idStr = String(unsavedPlaylistId)
    user.savedPlaylists = (user.savedPlaylists || []).filter(
      (x) => String(x) !== idStr,
    )
  }

  // --- SUBSCRIBED CHANNELS ---
  if (subscribedChannelId) {
    const idStr = String(subscribedChannelId)
    const arr = Array.isArray(user.subscribedChannels)
      ? user.subscribedChannels
      : []
    if (!arr.some((x) => String(x) === idStr)) arr.push(subscribedChannelId)
    user.subscribedChannels = arr
  }
  if (unsubscribedChannelId) {
    const idStr = String(unsubscribedChannelId)
    user.subscribedChannels = (user.subscribedChannels || []).filter(
      (x) => String(x) !== idStr,
    )
  }

  await user.save()

  res.json({ user: user })
}

// DELETE USER
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
  updateUserController,
}


