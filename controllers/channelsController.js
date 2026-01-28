const fs = require('fs/promises')
const path = require('path')

const { Channel, schemas } = require('../models/channel')
const { User } = require('../models/user')
const { RequestError } = require('../helpers')
const {
  uploadMakePublic,
  deleteByPublicUrl,
} = require('../helpers/firebaseUpload')

// ---------- helpers ----------
const normalizeHandle = (raw = '') =>
  String(raw).trim().toLowerCase().replace(/^@+/, '')

const pick = (obj, keys) =>
  keys.reduce((acc, k) => {
    if (obj[k] !== undefined) acc[k] = obj[k]
    return acc
  }, {})

  const parseLinksFromBody = (raw) => {
    if (raw === undefined) return undefined
    if (raw === null || raw === '') return []
    if (Array.isArray(raw)) return raw

    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : []
      } catch {
        return []
      }
    }

    return []
  }

// ---------- controllers ----------

// GET /api/channels/ (authorize) -> my channels
const getMyChannelsController = async (req, res) => {
  const ownerId = req.user?._id
  if (!ownerId) throw RequestError(401, 'Unauthorized')

  const channels = await Channel.find({ ownerId })
    .sort({ createdAt: -1 })
    .lean()

  res.json({ channels })
}

// GET /api/channels/:id -> public channel by id
const getChannelController = async (req, res) => {
  const { id } = req.params

  const channel = await Channel.findById(id).lean()
  if (!channel) throw RequestError(404, 'Channel not found')

  res.json({ channel })
}

// GET /api/channels/by-handle/:handle -> public channel by handle
const getChannelByHandleController = async (req, res) => {
  const handle = normalizeHandle(req.params.handle)

  const channel = await Channel.findOne({ handle }).lean()
  if (!channel) throw RequestError(404, 'Channel not found')

  res.json({ channel })
}

// GET /api/channels/check-handle?handle=...
const checkHandleController = async (req, res) => {
  const handle = normalizeHandle(req.query.handle)

  // якщо handle пустий/закороткий — одразу unavailable (або можеш 400)
  if (!handle || handle.length < 3) {
    return res.json({ handle, available: false })
  }

  // швидкий check по regex так само як у Joi
  if (!/^[a-z0-9_]+$/.test(handle)) {
    return res.json({ handle, available: false })
  }

  const exists = await Channel.exists({ handle })
  res.json({ handle, available: !exists })
}

// POST /api/channels/create (authorize)
const createChannelController = async (req, res) => {
  const ownerId = req.user?._id
  if (!ownerId) throw RequestError(401, 'Unauthorized')

  const bannerFile = req.file // works if upload.single('banner')
  let uploadedBannerTmpPath = null
  let newBannerUrl = null
  let channel = null

  try {
    if (!bannerFile?.path) {
      throw RequestError(400, 'Banner is required')
    }
    uploadedBannerTmpPath = bannerFile.path

    const body = { ...req.body }
    body.handle = normalizeHandle(body.handle)

    // links може прийти JSON-string
    body.links = parseLinksFromBody(body.links)

    const { error, value } = schemas.createChannelSchema.validate(body)
    if (error) throw RequestError(400, error.message)

    const handleTaken = await Channel.exists({ handle: value.handle })
    if (handleTaken) throw RequestError(409, 'Handle already taken')

    channel = await Channel.create({
      ...value,
      ownerId,
    })

    const ext =
      path.extname(bannerFile.originalname || bannerFile.filename || '') ||
      '.jpg'
    const destPath = `channels/${channel._id}/banner/${Date.now()}${ext}`
    const contentType = bannerFile.mimetype || 'image/jpeg'

    newBannerUrl = await uploadMakePublic(
      bannerFile.path,
      destPath,
      contentType,
    )

    channel.bannerUrl = newBannerUrl
    await channel.save()

    await User.findByIdAndUpdate(ownerId, {
      $addToSet: { channels: channel._id },
    })

    res.status(201).json({ channel })
  } catch (e) {
    // якщо вже завантажили банер у Firebase — прибрати
    if (newBannerUrl) {
      try {
        await deleteByPublicUrl(newBannerUrl)
      } catch (_) {}
    }

    // якщо канал створили, але далі щось впало — прибрати "сироту"
    if (channel?._id && !newBannerUrl) {
      try {
        await Channel.deleteOne({ _id: channel._id })
      } catch (_) {}
    }

    throw e
  } finally {
    if (uploadedBannerTmpPath) {
      try {
        await fs.unlink(uploadedBannerTmpPath)
      } catch (_) {}
    }
  }
}

// PATCH /api/channels/:id (authorize + multipart banner optional)
const updateChannelController = async (req, res) => {
  const ownerId = req.user?._id
  if (!ownerId) throw RequestError(401, 'Unauthorized')

  const { id } = req.params

  const channel = await Channel.findById(id)
  if (!channel) throw RequestError(404, 'Channel not found')

  if (String(channel.ownerId) !== String(ownerId)) {
    throw RequestError(403, 'Forbidden')
  }

  const bannerFile = req.file

  const body = { ...req.body }
  if (body.handle !== undefined) body.handle = normalizeHandle(body.handle)

  // links: multipart -> JSON-string
  if (body.links !== undefined) {
    body.links = parseLinksFromBody(body.links)
  }

  const hasBanner = !!bannerFile?.path
  const hasBodyKeys = Object.keys(body).length > 0

  if (!hasBanner && !hasBodyKeys) {
    throw RequestError(400, 'Nothing to update')
  }

  let uploadedBannerTmpPath = null
  const oldBannerUrl = channel.bannerUrl || ''
  let newBannerUrl = null

  try {
    let value = {}
    if (hasBodyKeys) {
      const { error, value: validated } =
        schemas.updateChannelSchema.validate(body)
      if (error) throw RequestError(400, error.message)
      value = validated

      if (value.handle && value.handle !== channel.handle) {
        const taken = await Channel.exists({
          handle: value.handle,
          _id: { $ne: channel._id },
        })
        if (taken) throw RequestError(409, 'Handle already taken')
      }
    }

    const patch = pick(value, [
      'handle',
      'name',
      'title',
      'bio',
      'description',
      'avatarUrl',
      'contactEmail',
      'links',
    ])

    if (hasBanner) {
      uploadedBannerTmpPath = bannerFile.path

      const ext =
        path.extname(bannerFile.originalname || bannerFile.filename || '') ||
        '.jpg'
      const destPath = `channels/${channel._id}/banner/${Date.now()}${ext}`
      const contentType = bannerFile.mimetype || 'image/jpeg'

      newBannerUrl = await uploadMakePublic(
        bannerFile.path,
        destPath,
        contentType,
      )
      patch.bannerUrl = newBannerUrl
    }

    Object.assign(channel, patch)
    await channel.save()

    if (newBannerUrl && oldBannerUrl && oldBannerUrl !== newBannerUrl) {
      try {
        await deleteByPublicUrl(oldBannerUrl)
      } catch (_) {}
    }

    res.status(201).json({ channel })
  } catch (e) {
    if (newBannerUrl) {
      try {
        await deleteByPublicUrl(newBannerUrl)
      } catch (_) {}
    }
    throw e
  } finally {
    if (uploadedBannerTmpPath) {
      try {
        await fs.unlink(uploadedBannerTmpPath)
      } catch (_) {}
    }
  }
}

// DELETE /api/channels/:id (authorize)
const deleteChannelController = async (req, res) => {
  const ownerId = req.user?._id
  if (!ownerId) throw RequestError(401, 'Unauthorized')
  const { id } = req.params

  const channel = await Channel.findById(id)
  if (!channel) throw RequestError(404, 'Channel not found')

  if (String(channel.ownerId) !== String(ownerId)) {
    throw RequestError(403, 'Forbidden')
  }

  const bannerUrl = channel.bannerUrl || ''

  await Channel.deleteOne({ _id: channel._id })
  await User.findByIdAndUpdate(ownerId, { $pull: { channels: channel._id } })

  try {
    if (bannerUrl) await deleteByPublicUrl(bannerUrl)
  } catch (_) {}

  res.json({ message: 'Channel deleted' })
}


module.exports = {
  getMyChannelsController,
  getChannelController,
  getChannelByHandleController,
  checkHandleController,
  createChannelController,
  updateChannelController,
  deleteChannelController,
}
