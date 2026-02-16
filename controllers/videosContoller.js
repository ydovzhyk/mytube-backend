const fs = require('fs')
const path = require('path')
const { User } = require('../models/user')

const { Video, QUALITY_ENUM } = require('../models/video')
const { Channel } = require('../models/channel')
const { Playlist } = require('../models/playlist')
const { buildSimilarPage } = require('../helpers/video/similar')

const {
  uploadMakePublic,
  transcodeToQualities,
  RequestError,
  extractTagsFromDescription,
  getVideoDurationSec,
} = require('../helpers')

// -------------------------
// Upload helpers
// -------------------------
const pickMaxQuality = (qualities) => {
  const order = ['360p', '480p', '720p']
  const sorted = [...qualities].sort(
    (a, b) => order.indexOf(a) - order.indexOf(b),
  )
  return sorted[sorted.length - 1] || '720p'
}

const safeUnlink = async (p) => {
  try {
    await fs.promises.unlink(p)
  } catch {}
}

const safeRmdir = async (dir) => {
  try {
    await fs.promises.rm(dir, { recursive: true, force: true })
  } catch {}
}

// -------------------------
// Controllers
// -------------------------
async function uploadVideoController(req, res) {
  const videoFile = req.files?.video?.[0]
  const thumbFile = req.files?.thumbnail?.[0]

  if (!videoFile) throw RequestError(400, 'Video file is required')
  if (!thumbFile) throw RequestError(400, 'Thumbnail file is required')

  const { title, description = '', channelRef, isPublished } = req.body
  if (!title || !channelRef)
    throw RequestError(400, 'title and channelRef are required')

  const published = Boolean(isPublished === 'true' || isPublished === true)

  // файли (оголосили ОДИН раз)
  const inputPath = videoFile.path
  const thumbPath = thumbFile.path

  // 0) fetch channel and build snapshot
  const channel = await Channel.findById(channelRef).lean()
  if (!channel) throw RequestError(404, 'Channel not found')

  const channelSnapshot = {
    _id: channel._id,
    handle: String(channel.handle || '')
      .trim()
      .toLowerCase(),
    title: String(channel.title || '').trim(),
    name: String(channel.name || '').trim(),
    avatarUrl: String(channel.avatarUrl || ''),
  }

  if (!channelSnapshot.handle) throw RequestError(400, 'Channel has no handle')

  // 1) duration ДО create (поки файл існує)
  let durationSec = 0
  try {
    durationSec = await getVideoDurationSec(inputPath)
  } catch (e) {
    throw RequestError(400, 'Cannot read video duration')
  }

  // 2) create Video in processing
  const doc = await Video.create({
    title,
    description,
    channelRef: channel._id,
    channelSnapshot,
    isPublished: published,
    publishedAt: published ? new Date() : null,
    status: 'processing',
    thumbnailUrl: '',
    tags: extractTagsFromDescription(description),
    stats: { views: 0, likes: 0, comments: 0 },
    duration: durationSec,
  })

  const outDir = path.join(process.cwd(), 'tmp', 'transcoded', String(doc._id))

  try {
    const thumbExt = path.extname(thumbFile.originalname || '') || '.jpg'
    const thumbDest = `videos/${doc._id}/thumbnail${thumbExt}`
    const thumbContentType = thumbFile.mimetype || 'image/jpeg'

    const thumbUploadPromise = uploadMakePublic(
      thumbPath,
      thumbDest,
      thumbContentType,
    )
    const transcodePromise = transcodeToQualities(inputPath, outDir)

    const [thumbnailUrl, filesByQuality] = await Promise.all([
      thumbUploadPromise,
      transcodePromise,
    ])

    const sources = {}
    const qualities = []

    for (const [q, localPath] of Object.entries(filesByQuality)) {
      if (!QUALITY_ENUM.includes(q)) continue
      const dest = `videos/${doc._id}/${q}.mp4`
      const url = await uploadMakePublic(localPath, dest, 'video/mp4')
      sources[q] = url
      qualities.push(q)
    }

    const availableQualities = qualities.sort(
      (a, b) => QUALITY_ENUM.indexOf(a) - QUALITY_ENUM.indexOf(b),
    )
    const maxQuality = pickMaxQuality(availableQualities)

    doc.status = 'ready'
    doc.errorMessage = ''
    doc.thumbnailUrl = thumbnailUrl
    doc.sources = sources
    doc.availableQualities = availableQualities
    doc.maxQuality = maxQuality

    await doc.save()

    if (doc.isPublished) {
      await Channel.updateOne(
        { _id: channel._id, videos: { $ne: doc._id } },
        { $addToSet: { videos: doc._id }, $inc: { videosCount: 1 } },
      )
    }

    return res.status(201).json({ message: 'Video uploaded', video: doc })
  } catch (e) {
    doc.status = 'failed'
    doc.errorMessage = e?.message || 'Upload failed'
    await doc.save()
    throw RequestError(500, doc.errorMessage)
  } finally {
    await safeUnlink(inputPath)
    await safeUnlink(thumbPath)
    await safeRmdir(outDir)
  }
}

async function getVideosController(req, res) {
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(48, Math.max(1, Number(req.query.limit) || 24))
  const skip = (page - 1) * limit

  const filter = { isPublished: true, status: 'ready' }

  const [total, docs] = await Promise.all([
    Video.countDocuments(filter),
    Video.find(filter)
      .sort({ publishedAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ])

  const items = docs

  res.json({
    items,
    page,
    limit,
    total,
    hasMore: skip + items.length < total,
  })
}

const toBool = (v) => {
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') return v.toLowerCase() === 'true'
  return undefined
}

const toInt = (v, def) => {
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) && n > 0 ? n : def
}

async function getChannelVideoController(req, res, next) {
  try {
    const {
      channelId,
      publishedOnly,
      sort = 'latest',
      query = '',
      page = '1',
      limit = '20',
    } = req.query

    if (!channelId) throw RequestError(400, 'channelId is required')

    const pageNum = toInt(page, 1)
    const limitNum = Math.min(toInt(limit, 20), 50)
    const skip = (pageNum - 1) * limitNum

    const filter = { channelRef: channelId, status: 'ready' }

    const pubOnly = toBool(publishedOnly)
    if (pubOnly === true) filter.isPublished = true

    const q = String(query || '').trim()
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      filter.$or = [{ title: rx }, { description: rx }, { tags: rx }]
    }

    let sortObj = { createdAt: -1 }
    if (sort === 'popular') sortObj = { 'stats.views': -1, createdAt: -1 }
    if (sort === 'oldest') sortObj = { createdAt: 1 }

    const [items, total] = await Promise.all([
      Video.find(filter).sort(sortObj).skip(skip).limit(limitNum).lean(),
      Video.countDocuments(filter),
    ])

    res.json({
      items,
      page: pageNum,
      limit: limitNum,
      total,
    })
  } catch (e) {
    next(e)
  }
}

// Get videos picker for channel owner
async function getVideosPickerController(req, res, next) {
  try {
    const user = req.user
    if (!user?._id) throw RequestError(401, 'Unauthorized')

    const { channelId } = req.query
    if (!channelId) throw RequestError(400, 'channelId is required')

    const channel = await Channel.findById(channelId).select('ownerId').lean()
    if (!channel) throw RequestError(404, 'Channel not found')

    const ownerId = channel?.ownerId
    if (!ownerId) throw RequestError(403, 'Channel has no owner binding')

    const ownerStr = String(ownerId)
    const userStr = String(user._id)

    if (ownerStr !== userStr) {
      throw RequestError(403, 'Forbidden')
    }

    const docs = await Video.find({ channelRef: channelId, status: 'ready' })
      .sort({ createdAt: -1, _id: -1 })
      .lean()

    res.json({ items: docs })
  } catch (e) {
    next(e)
  }
}

async function videoViewController(req, res) {
  const { id } = req.params
  if (!id) throw RequestError(400, 'Video id is required')

  const filter = { _id: id, status: 'ready', isPublished: true }

  const updated = await Video.findOneAndUpdate(
    filter,
    { $inc: { 'stats.views': 1 } },
    { new: true, projection: { _id: 1, 'stats.views': 1 } },
  ).lean()

  if (!updated) throw RequestError(404, 'Video not found')

  res.json({
    ok: true,
    videoId: String(updated._id),
    views: updated?.stats?.views ?? 0,
  })
}

async function getWatchVideoController(req, res) {
  const { id } = req.params
  const filter = String(req.query.filter || 'all').trim()

  if (!id) throw RequestError(400, 'Video id is required')

  // 1) currentVideo
  const currentVideo = await Video.findOne({
    _id: id,
    status: 'ready',
    isPublished: true,
  }).lean()

  if (!currentVideo) throw RequestError(404, 'Video not found')

  // 2) AUTO playlist context (no list param anymore)
  let playlistItems = []
  let playlistMeta = null
  let usedListId = null

  const isLoggedIn = Boolean(req.user?._id)

  // guest: only public
  // logged-in: allow public + unlisted (optional; if you don't need unlisted -> remove $in)
  const visibilityMatch = isLoggedIn
    ? { $in: ['public', 'unlisted'] }
    : 'public'

  const buildPlaylistPayload = async (pl) => {
    const idsInOrder = (pl.items || [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((it) => String(it.videoId || ''))
      .filter(Boolean)

    if (!idsInOrder.length) return null

    const vids = await Video.find({
      _id: { $in: idsInOrder },
      status: 'ready',
      isPublished: true,
    }).lean()

    const map = new Map(vids.map((v) => [String(v._id), v]))
    const items = idsInOrder.map((vid) => map.get(vid)).filter(Boolean)

    if (!items.length) return null

    return {
      meta: {
        _id: pl._id,
        title: pl.title || '',
        description: pl.description || '',
        coverUrl: pl.coverUrl || '',
      },
      items,
    }
  }

  const pl = await Playlist.findOne({
    visibility: visibilityMatch,
    channelRef: currentVideo.channelRef,
    'items.videoId': currentVideo._id,
  })
    .sort({ updatedAt: -1, _id: -1 })
    .lean()

  if (pl) {
    const payload = await buildPlaylistPayload(pl)
    if (payload) {
      playlistMeta = payload.meta
      playlistItems = payload.items
      usedListId = String(pl._id)
    }
  }

  // 3) similar (first page)
  // exclude playlist videos for stable UX/paging:
  // - for watched: DO NOT exclude by default (history should show true watched)
  const playlistIds = Array.isArray(playlistItems)
    ? playlistItems.map((v) => String(v?._id || '')).filter(Boolean)
    : []

  const isWatched = String(filter).toLowerCase() === 'watched'
  const excludeIds = isWatched ? [] : playlistIds

  const {
    items: similarVideos,
    hasMore,
    nextCursor,
  } = await buildSimilarPage({
    currentVideo,
    cursor: null,
    filter,
    watchedIds: [], // (watch endpoint doesn't build watched list; watched filter is handled by /similar endpoint)
    excludeIds,
    excludeInWatched: false,
  })

  res.set('Cache-Control', 'no-store')

  res.json({
    currentVideo,
    playlist: playlistMeta ? { ...playlistMeta, items: playlistItems } : null,
    playlistContext: usedListId ? { listId: usedListId, source: 'auto' } : null,
    similarVideos,
    similar: { hasMore, nextCursor },
  })
}

async function getSimilarVideosController(req, res) {
  const { id } = req.params
  const userId = req.user?._id

  const cursor = String(req.query.cursor || '').trim() || null
  const filter = String(req.query.filter || 'all').trim()

  // watchedIds from query (guest/session)
  const watchedIdsFromQuery = String(req.query.watchedIds || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  if (!id) throw RequestError(400, 'Video id is required')

  const currentVideo = await Video.findOne({
    _id: id,
    status: 'ready',
    isPublished: true,
  }).lean()

  if (!currentVideo) throw RequestError(404, 'Video not found')

  // -------------------------
  // watchedIds resolve (only for filter=watched)
  // -------------------------
  let watchedIds = watchedIdsFromQuery

  if (
    String(filter).toLowerCase() === 'watched' &&
    !watchedIds.length &&
    userId
  ) {
    const user = await User.findById(userId).select('watchHistory').lean()
    const hist = Array.isArray(user?.watchHistory) ? user.watchHistory : []
    watchedIds = hist.map((x) => String(x?.videoId || '')).filter(Boolean)
  }

  // -------------------------
  // AUTO exclude playlist videos for NON-watched filters
  // (same logic idea as getWatchVideoController)
  // -------------------------
  const isWatched = String(filter).toLowerCase() === 'watched'
  let excludeIds = []

  if (!isWatched) {
    const isLoggedIn = Boolean(req.user?._id)

    const visibilityMatch = isLoggedIn
      ? { $in: ['public', 'unlisted'] }
      : 'public'

    // шукаємо останній плейлист цього каналу, який містить це відео
    const pl = await Playlist.findOne({
      visibility: visibilityMatch,
      channelRef: currentVideo.channelRef,
      'items.videoId': currentVideo._id,
    })
      .select('items.videoId') // нам не треба тягнути все
      .sort({ updatedAt: -1, _id: -1 })
      .lean()

    if (pl?.items?.length) {
      excludeIds = pl.items
        .map((it) => String(it?.videoId || ''))
        .filter(Boolean)
    }
  }

  // -------------------------
  // build page
  // -------------------------
  const result = await buildSimilarPage({
    currentVideo,
    cursor,
    filter,
    watchedIds,
    excludeIds, // ✅ тепер all/related/recent/from_channel завжди без playlist
    excludeInWatched: false,
  })

  // ordering watched by history order
  if (isWatched) {
    const order = new Map()
    watchedIds.forEach((vid, idx) => order.set(String(vid), idx))

    result.items.sort((a, b) => {
      const ai = order.get(String(a?._id)) ?? 999999
      const bi = order.get(String(b?._id)) ?? 999999
      return ai - bi
    })
  }

  res.set('Cache-Control', 'no-store')
  res.json(result)
}


module.exports = {
  uploadVideoController,
  getVideosController,
  getChannelVideoController,
  getVideosPickerController,
  videoViewController,
  getWatchVideoController,
  getSimilarVideosController,
}
