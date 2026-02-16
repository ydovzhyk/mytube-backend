const { Playlist } = require('../models/playlist')
const { Channel } = require('../models/channel')
const { Video } = require('../models/video')
const { uploadMakePublic, RequestError } = require('../helpers')

function parseItemsJson(itemsStr) {
  let arr
  try {
    arr = JSON.parse(String(itemsStr || '[]'))
  } catch {
    throw RequestError(400, 'items must be valid JSON')
  }
  if (!Array.isArray(arr) || !arr.length) {
    throw RequestError(400, 'items must be a non-empty array')
  }

  // normalize + validate
  const out = []
  const usedOrder = new Set()

  for (const it of arr) {
    const videoId = String(it?.videoId || '').trim()
    const order = Number(it?.order)

    if (!videoId) throw RequestError(400, 'items[].videoId is required')
    if (!Number.isFinite(order) || order <= 0)
      throw RequestError(400, 'items[].order invalid')
    if (usedOrder.has(order))
      throw RequestError(400, 'items[].order must be unique')

    usedOrder.add(order)
    out.push({ videoId, order })
  }

  out.sort((a, b) => a.order - b.order)
  return out
}

async function createPlaylistController(req, res) {
  const user = req.user
  if (!user?._id) throw RequestError(401, 'Unauthorized')

  const coverFile = req.file
  if (!coverFile) throw RequestError(400, 'Playlist cover image is required')

  const {
    channelRef,
    title,
    description = '',
    visibility = 'public',
    items,
  } = req.body
  if (!channelRef) throw RequestError(400, 'channelRef is required')

  // 1) owner-check channel
  const channel = await Channel.findById(channelRef)
    .select('_id ownerId handle')
    .lean()
  if (!channel) throw RequestError(404, 'Channel not found')
  if (String(channel.ownerId) !== String(user._id))
    throw RequestError(403, 'Forbidden')

  // 2) parse items
  const parsedItems = parseItemsJson(items) // [{videoId, order}]

  // 3) ensure videos belong to channel and are ready
  const ids = parsedItems.map((x) => x.videoId)
  const vids = await Video.find({
    _id: { $in: ids },
    channelRef: channel._id,
    status: 'ready',
  })
    .select('_id')
    .lean()

  const allowed = new Set(vids.map((v) => String(v._id)))
  const finalItems = parsedItems
    .filter((x) => allowed.has(String(x.videoId)))
    .map((x) => ({ videoId: x.videoId, order: x.order }))

  if (!finalItems.length) {
    throw RequestError(400, 'No valid videos found for this channel')
  }

  // 4) create playlist doc first (to get _id for storage path)
  const pl = await Playlist.create({
    channelRef: channel._id,
    title: String(title || '').trim(),
    description: String(description || ''),
    visibility: String(visibility || 'public'),
    items: finalItems,
    coverUrl: '',
  })

  // 5) upload cover to firebase
  const ext = require('path').extname(coverFile.originalname || '') || '.jpg'
  const dest = `playlists/${pl._id}/cover${ext}`
  const ct = coverFile.mimetype || 'image/jpeg'

  const coverUrl = await uploadMakePublic(coverFile.path, dest, ct)

  pl.coverUrl = coverUrl
  await pl.save()

  res.status(201).json({
    message: 'Playlist created',
    playlist: pl,
  })
}

module.exports = {
  createPlaylistController,
}
