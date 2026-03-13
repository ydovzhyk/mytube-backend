const { Types } = require('mongoose')
const { MyPlaylist } = require('../models/my-playlist')
const { Playlist } = require('../models/playlist')
const { Video } = require('../models/video')
const { User } = require('../models/user')
const { RequestError } = require('../helpers')
const {
  generatePlaylistCoverImage,
} = require('../helpers/generatePlaylistCoverImage')
const { saveMyPlaylistCover } = require('../helpers/saveMyPlaylistCover')

const DEFAULT_PLAYLIST_COVER =
  'https://firebasestorage.googleapis.com/v0/b/mytube-dev.firebasestorage.app/o/my-playlist-covers%2Fdefault-cover.webp?alt=media&token=3ac02bf3-bf17-4016-bef4-e23ce9c41c49'

// ---------- helpers ----------
const toId = (v = '') => String(v).trim()

const isValidObjectId = (v) => Types.ObjectId.isValid(String(v || ''))

const uniqueValidIds = (arr = []) => {
  const seen = new Set()
  const out = []

  for (const raw of arr) {
    const id = toId(raw)
    if (!id || !isValidObjectId(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }

  return out
}

const makeItemsFromIds = (videoIds = []) =>
  videoIds.map((videoId, index) => ({
    videoId,
    order: index + 1,
    addedAt: new Date(),
  }))

const normalizeItemsCount = (playlist) => ({
  ...playlist,
  itemsCount: Array.isArray(playlist?.items) ? playlist.items.length : 0,
})

const ensureVideosExist = async (videoIds = []) => {
  if (!videoIds.length) throw RequestError(400, 'No valid videos provided')

  const foundVideos = await Video.find({ _id: { $in: videoIds } })
    .select('_id')
    .lean()

  const foundSet = new Set(foundVideos.map((v) => String(v._id)))
  const validIds = videoIds.filter((id) => foundSet.has(String(id)))

  if (!validIds.length) throw RequestError(400, 'No valid videos found')

  return validIds
}

const getSampleTitlesByVideoIds = async (videoIds = []) => {
  const ids = uniqueValidIds(videoIds).slice(0, 5)
  if (!ids.length) return []

  const videos = await Video.find({ _id: { $in: ids } })
    .select('title')
    .lean()

  return videos
    .map((video) => String(video?.title || '').trim())
    .filter(Boolean)
    .slice(0, 5)
}

const upsertUserMyPlaylistRef = async ({
  ownerId,
  playlistId,
  title,
  videoIds = [],
}) => {
  const user = await User.findById(ownerId).select('myPlaylists')
  if (!user) throw RequestError(404, 'User not found')

  const normalizedVideoIds = uniqueValidIds(videoIds)

  const idx = Array.isArray(user.myPlaylists)
    ? user.myPlaylists.findIndex(
        (it) => String(it?.playlistId) === String(playlistId),
      )
    : -1

  if (idx >= 0) {
    user.myPlaylists[idx].title = title
    user.myPlaylists[idx].videoIds = normalizedVideoIds
    user.myPlaylists[idx].at = new Date()
  } else {
    user.myPlaylists.push({
      playlistId,
      title,
      videoIds: normalizedVideoIds,
      at: new Date(),
    })
  }

  await user.save()
}

const ensureOwnerPlaylistAccess = (playlist, ownerId) => {
  if (!playlist) throw RequestError(404, 'Playlist not found')
  if (String(playlist.ownerId) !== String(ownerId)) {
    throw RequestError(403, 'Forbidden')
  }
}

// ---------- controllers ----------

// POST /api/my-playlists/create
const createMyPlaylistController = async (req, res) => {
  const ownerId = req.user?._id
  if (!ownerId) throw RequestError(401, 'Unauthorized')

  const title = String(req.body?.title || '').trim()
  const sourceQuery = String(req.body?.sourceQuery || '').trim()
  const rawVideoIds = Array.isArray(req.body?.videoIds) ? req.body.videoIds : []

  const uniqueIds = uniqueValidIds(rawVideoIds)
  const validVideoIds = await ensureVideosExist(uniqueIds)

  const items = makeItemsFromIds(validVideoIds)

  const playlist = await MyPlaylist.create({
    ownerId,
    title,
    description: '',
    coverUrl: DEFAULT_PLAYLIST_COVER,
    items,
    sourcePlaylistId: null,
    sourceQuery,
    sourceType: sourceQuery ? 'search' : 'manual',
  })

  try {
    const sampleTitles = await getSampleTitlesByVideoIds(validVideoIds)

    const imageBuffer = await generatePlaylistCoverImage({
      title,
      sourceQuery,
      sampleTitles,
    })

    if (imageBuffer) {
      const generatedCoverUrl = await saveMyPlaylistCover({
        buffer: imageBuffer,
        ownerId,
        playlistId: playlist._id,
      })

      if (generatedCoverUrl) {
        playlist.coverUrl = generatedCoverUrl
        await playlist.save()
      }
    }
  } catch (error) {
    console.error(
      'createMyPlaylistController cover generation error:',
      error.message,
    )
  }

  await upsertUserMyPlaylistRef({
    ownerId,
    playlistId: playlist._id,
    title: playlist.title,
    videoIds: validVideoIds,
  })

  const user = await User.findById(ownerId).lean()
  if (!user) throw RequestError(404, 'User not found')

  res.status(201).json({
    message: 'Playlist created',
    playlist: normalizeItemsCount(playlist.toObject()),
    user,
  })
}

// POST /api/my-playlists/add
const addToMyPlaylistController = async (req, res) => {
  const ownerId = req.user?._id
  if (!ownerId) throw RequestError(401, 'Unauthorized')

  const playlistId = toId(req.body?.playlistId)
  const rawVideoIds = Array.isArray(req.body?.videoIds) ? req.body.videoIds : []

  if (!isValidObjectId(playlistId)) {
    throw RequestError(400, 'Invalid playlist id')
  }

  const playlist = await MyPlaylist.findById(playlistId)
  ensureOwnerPlaylistAccess(playlist, ownerId)

  const uniqueIds = uniqueValidIds(rawVideoIds)
  const validVideoIds = await ensureVideosExist(uniqueIds)

  const existingVideoIds = new Set(
    (playlist.items || []).map((item) => String(item.videoId)),
  )

  let nextOrder = (playlist.items?.length || 0) + 1
  let addedCount = 0

  for (const videoId of validVideoIds) {
    if (existingVideoIds.has(String(videoId))) continue

    playlist.items.push({
      videoId,
      order: nextOrder,
      addedAt: new Date(),
    })

    existingVideoIds.add(String(videoId))
    nextOrder += 1
    addedCount += 1
  }

  await playlist.save()

  const currentVideoIds = (playlist.items || []).map((item) => item.videoId)

  await upsertUserMyPlaylistRef({
    ownerId,
    playlistId: playlist._id,
    title: playlist.title,
    videoIds: currentVideoIds,
  })

  const user = await User.findById(ownerId).lean()
  if (!user) throw RequestError(404, 'User not found')

  res.json({
    message:
      addedCount > 0
        ? 'Video added to playlist'
        : 'All selected videos are already in playlist',
    playlist: normalizeItemsCount(playlist.toObject()),
    user,
  })
}

// POST /api/my-playlists/add-playlist
const addPlaylistToMyPlaylistsController = async (req, res) => {
  const ownerId = req.user?._id
  if (!ownerId) throw RequestError(401, 'Unauthorized')

  const sourcePlaylistId = toId(req.body?.sourcePlaylistId)
  const customTitle = String(req.body?.title || '').trim()

  if (!isValidObjectId(sourcePlaylistId)) {
    throw RequestError(400, 'Invalid source playlist id')
  }

  const sourcePlaylist = await Playlist.findById(sourcePlaylistId).lean()
  if (!sourcePlaylist) throw RequestError(404, 'Source playlist not found')

  const sourceItems = Array.isArray(sourcePlaylist.items)
    ? sourcePlaylist.items
    : []

  const orderedVideoIds = sourceItems
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
    .map((item) => item.videoId)

  const uniqueIds = uniqueValidIds(orderedVideoIds)
  const validVideoIds = await ensureVideosExist(uniqueIds)

  const items = makeItemsFromIds(validVideoIds)
  const title = customTitle || sourcePlaylist.title || 'My playlist'
  const coverUrl = sourcePlaylist.coverUrl || DEFAULT_PLAYLIST_COVER

  const playlist = await MyPlaylist.create({
    ownerId,
    title,
    description: sourcePlaylist.description || '',
    coverUrl,
    items,
    sourcePlaylistId: sourcePlaylist._id,
    sourceQuery: '',
    sourceType: 'playlist',
  })

  await upsertUserMyPlaylistRef({
    ownerId,
    playlistId: playlist._id,
    title: playlist.title,
    videoIds: validVideoIds,
  })

  const user = await User.findById(ownerId).lean()
  if (!user) throw RequestError(404, 'User not found')

  res.status(201).json({
    message: 'Playlist added to my playlists',
    playlist: normalizeItemsCount(playlist.toObject()),
    user,
  })
}

// GET /api/my-playlists
const getMyPlaylistsController = async (req, res) => {
  const ownerId = req.user?._id
  if (!ownerId) throw RequestError(401, 'Unauthorized')

  const items = await MyPlaylist.find({ ownerId })
    .sort({ updatedAt: -1 })
    .lean()

  res.json({
    items: items.map(normalizeItemsCount),
  })
}

// GET /api/my-playlists/current/:playlistId
const getCurrentMyPlaylistController = async (req, res) => {
  const ownerId = req.user?._id
  if (!ownerId) throw RequestError(401, 'Unauthorized')

  const { playlistId } = req.params
  if (!isValidObjectId(playlistId)) {
    throw RequestError(400, 'Invalid playlist id')
  }

  const playlist = await MyPlaylist.findById(playlistId).populate({
    path: 'items.videoId',
    select:
      'title thumbnailUrl duration status publishedAt createdAt stats channelSnapshot sources ownerId',
  })

  ensureOwnerPlaylistAccess(playlist, ownerId)

  res.json({
    playlist: normalizeItemsCount(playlist.toObject()),
  })
}

module.exports = {
  createMyPlaylistController,
  addToMyPlaylistController,
  addPlaylistToMyPlaylistsController,
  getMyPlaylistsController,
  getCurrentMyPlaylistController,
}
