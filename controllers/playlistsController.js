const path = require('path')

const { Playlist } = require('../models/playlist')
const { MyPlaylist } = require('../models/my-playlist')
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

  const out = []
  const usedOrder = new Set()

  for (const it of arr) {
    const videoId = String(it?.videoId || '').trim()
    const order = Number(it?.order)

    if (!videoId) {
      throw RequestError(400, 'items[].videoId is required')
    }

    if (!Number.isFinite(order) || order <= 0) {
      throw RequestError(400, 'items[].order invalid')
    }

    if (usedOrder.has(order)) {
      throw RequestError(400, 'items[].order must be unique')
    }

    usedOrder.add(order)
    out.push({ videoId, order })
  }

  out.sort((a, b) => a.order - b.order)
  return out
}

function normalizeSearchQuery(v = '') {
  return String(v || '')
    .trim()
    .replace(/\s+/g, ' ')
}

function escapeRegex(str = '') {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function splitSearchTerms(q = '') {
  return normalizeSearchQuery(q)
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function buildPublicPlaylistSearchMatcher(q = '') {
  const terms = splitSearchTerms(q)
  if (!terms.length) return null

  const termOrFilters = terms.flatMap((term) => {
    const rx = new RegExp(escapeRegex(term), 'i')
    return [{ title: rx }, { description: rx }]
  })

  return termOrFilters.length ? { $or: termOrFilters } : null
}

function buildMyPlaylistSearchMatcher(q = '') {
  const terms = splitSearchTerms(q)
  if (!terms.length) return null

  const termOrFilters = terms.flatMap((term) => {
    const rx = new RegExp(escapeRegex(term), 'i')
    return [{ title: rx }, { description: rx }, { sourceQuery: rx }]
  })

  return termOrFilters.length ? { $or: termOrFilters } : null
}

async function loadPreviewVideosForPlaylists(
  playlists = [],
  { onlyPublished = false } = {},
) {
  const wantedIds = []

  playlists.forEach((pl) => {
    const items = Array.isArray(pl?.items) ? pl.items : []

    items
      .slice()
      .sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0))
      .forEach((it) => {
        const id = String(it?.videoId || '').trim()
        if (id) wantedIds.push(id)
      })
  })

  const uniqueIds = Array.from(new Set(wantedIds))
  if (!uniqueIds.length) return new Map()

  const findFilter = {
    _id: { $in: uniqueIds },
    status: 'ready',
  }

  if (onlyPublished) {
    findFilter.isPublished = true
  }

  const videos = await Video.find(findFilter)
    .select(
      '_id title thumbnailUrl duration stats channelSnapshot publishedAt createdAt isPublished',
    )
    .lean()

  return new Map(videos.map((v) => [String(v._id), v]))
}

async function normalizePublicPlaylists(playlists = []) {
  if (!playlists.length) return []

  const channelIds = Array.from(
    new Set(
      playlists
        .map((pl) => String(pl?.channelRef || '').trim())
        .filter(Boolean),
    ),
  )

  const channels = await Channel.find({ _id: { $in: channelIds } })
    .select('_id name handle avatarUrl')
    .lean()

  const channelMap = new Map(channels.map((ch) => [String(ch._id), ch]))
  const previewVideoMap = await loadPreviewVideosForPlaylists(playlists, {
    onlyPublished: true,
  })

  return playlists.map((pl) => {
    const items = Array.isArray(pl?.items) ? pl.items : []
    const sortedItems = items
      .slice()
      .sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0))

    const previewVideos = sortedItems
      .map((it) => previewVideoMap.get(String(it?.videoId || '')))
      .filter(Boolean)

    const channel = channelMap.get(String(pl.channelRef)) || null

    return {
      _id: pl._id,
      entityType: 'playlist',
      title: pl.title || '',
      description: pl.description || '',
      coverUrl: pl.coverUrl || previewVideos[0]?.thumbnailUrl || '',
      itemsCount: items.length,
      updatedAt: pl.updatedAt || pl.createdAt || null,
      createdAt: pl.createdAt || null,
      visibility: pl.visibility || 'public',
      channelSnapshot: channel
        ? {
            _id: channel._id,
            name: channel.name || '',
            handle: channel.handle || '',
            avatarUrl: channel.avatarUrl || '',
          }
        : null,
      sourceType: '',
      sourceQuery: '',
      sourcePlaylistId: null,
      previewVideos,
    }
  })
}

async function normalizeMyPlaylists(playlists = []) {
  if (!playlists.length) return []

  const previewVideoMap = await loadPreviewVideosForPlaylists(playlists, {
    onlyPublished: false,
  })

  return playlists.map((pl) => {
    const items = Array.isArray(pl?.items) ? pl.items : []
    const sortedItems = items
      .slice()
      .sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0))

    const previewVideos = sortedItems
      .map((it) => previewVideoMap.get(String(it?.videoId || '')))
      .filter(Boolean)

    return {
      _id: pl._id,
      entityType: 'myPlaylist',
      title: pl.title || '',
      description: pl.description || '',
      coverUrl: pl.coverUrl || previewVideos[0]?.thumbnailUrl || '',
      itemsCount: items.length,
      updatedAt: pl.updatedAt || pl.createdAt || null,
      createdAt: pl.createdAt || null,
      visibility: 'private',
      channelSnapshot: null,
      sourceType: pl.sourceType || 'manual',
      sourceQuery: pl.sourceQuery || '',
      sourcePlaylistId: pl.sourcePlaylistId || null,
      previewVideos,
    }
  })
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

  if (!channelRef) {
    throw RequestError(400, 'channelRef is required')
  }

  const channel = await Channel.findById(channelRef)
    .select('_id ownerId handle')
    .lean()

  if (!channel) {
    throw RequestError(404, 'Channel not found')
  }

  if (String(channel.ownerId) !== String(user._id)) {
    throw RequestError(403, 'Forbidden')
  }

  const parsedItems = parseItemsJson(items)
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

  const pl = await Playlist.create({
    channelRef: channel._id,
    title: String(title || '').trim(),
    description: String(description || '').trim(),
    visibility: String(visibility || 'public'),
    items: finalItems,
    coverUrl: '',
  })

  const ext = path.extname(coverFile.originalname || '') || '.jpg'
  const dest = `playlists/${pl._id}/cover${ext}`
  const contentType = coverFile.mimetype || 'image/jpeg'

  const coverUrl = await uploadMakePublic(coverFile.path, dest, contentType)

  pl.coverUrl = coverUrl
  await pl.save()

  return res.status(201).json({
    message: 'Playlist created',
    playlist: pl,
  })
}

async function searchPlaylistsController(req, res) {
  const q = normalizeSearchQuery(req.query.q)
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 2))

  if (q.length < 2) {
    return res.json({
      items: [],
      total: 0,
      page,
      limit,
      totalPages: 0,
      q,
    })
  }

  const publicMatcher = buildPublicPlaylistSearchMatcher(q)
  const myMatcher = buildMyPlaylistSearchMatcher(q)

  if (!publicMatcher && !myMatcher) {
    return res.json({
      items: [],
      total: 0,
      page,
      limit,
      totalPages: 0,
      q,
    })
  }

  const publicPlaylistsRaw = await Playlist.find({
    visibility: 'public',
    ...(publicMatcher || {}),
  })
    .select(
      '_id channelRef title description visibility coverUrl items createdAt updatedAt',
    )
    .sort({ updatedAt: -1, _id: -1 })
    .lean()

  let myPlaylistsRaw = []

  console.log('User:', req.user ? String(req.user._id) : 'null')

  if (req.user?._id) {
    myPlaylistsRaw = await MyPlaylist.find({
      ownerId: req.user._id,
      ...(myMatcher || {}),
    })
      .select(
        '_id ownerId title description coverUrl items sourcePlaylistId sourceQuery sourceType createdAt updatedAt',
      )
      .sort({ updatedAt: -1, _id: -1 })
      .lean()
  }

  const publicPlaylists = await normalizePublicPlaylists(publicPlaylistsRaw)
  const myPlaylists = await normalizeMyPlaylists(myPlaylistsRaw)

  const merged = [...publicPlaylists, ...myPlaylists].sort((a, b) => {
    const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime()
    const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime()

    if (bTime !== aTime) return bTime - aTime

    return String(b._id).localeCompare(String(a._id))
  })

  const total = merged.length
  const totalPages = total > 0 ? Math.ceil(total / limit) : 0
  const start = (page - 1) * limit
  const items = merged.slice(start, start + limit)

  console.log(`Search playlists with q="${q}", found ${total} results, returning page ${page} with ${items.length} items`)

  return res.json({
    items,
    total,
    page,
    limit,
    totalPages,
    q,
  })
}

module.exports = {
  createPlaylistController,
  searchPlaylistsController,
}
