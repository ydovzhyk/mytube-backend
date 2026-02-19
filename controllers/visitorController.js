const { Visitor } = require('../models/visitor')
const { RequestError } = require('../helpers')
const { nanoid } = require('nanoid')

const WATCH_HISTORY_LIMIT = 200
const REACTIONS_LIMIT = 200

const initVisitor = async (req, res) => {
  const { visitorId } = req.query || {}

  if (visitorId) {
    const existing = await Visitor.findOne({ visitorId })
    if (existing) {
      existing.lastSeenAt = new Date()
      await existing.save()
      return res.status(200).json(existing)
    }
  }

  const created = await Visitor.create({
    visitorId: nanoid(24),
    lastSeenAt: new Date(),
  })

  return res.status(201).json(created)
}

// body: { visitorId, watchedVideoId?, reactVideoId?, reactValue? }
const updateVisitor = async (req, res) => {
  const { visitorId, watchedVideoId, reactVideoId, reactValue } = req.body || {}
  if (!visitorId) throw RequestError(400, 'visitorId is required')

  const hasAny = Boolean(watchedVideoId || reactVideoId)
  if (!hasAny) throw RequestError(400, 'Nothing to update')

  const visitor = await Visitor.findOne({ visitorId })
  if (!visitor) throw RequestError(404, 'Visitor not found')

  // --- WATCH HISTORY: dedupe + newest first + limit ---
  if (watchedVideoId) {
    const idStr = String(watchedVideoId)
    const prev = Array.isArray(visitor.watchHistory) ? visitor.watchHistory : []
    const filtered = prev.filter((it) => String(it?.videoId) !== idStr)
    filtered.unshift({ videoId: watchedVideoId, watchedAt: new Date() })
    visitor.watchHistory = filtered.slice(0, WATCH_HISTORY_LIMIT)
  }

  // --- VIDEO REACTIONS: upsert/remove + newest first + limit ---
  if (reactVideoId) {
    const v = Number(reactValue)
    if (![1, -1, 0].includes(v)) throw RequestError(400, 'Invalid reactValue')

    const idStr = String(reactVideoId)
    const prev = Array.isArray(visitor.videoReactions)
      ? visitor.videoReactions
      : []
    const filtered = prev.filter((it) => String(it?.videoId) !== idStr)

    if (v === 0) {
      // remove reaction
      visitor.videoReactions = filtered.slice(0, REACTIONS_LIMIT)
    } else {
      // upsert reaction
      filtered.unshift({
        videoId: reactVideoId,
        value: v,
        reactedAt: new Date(),
      })
      visitor.videoReactions = filtered.slice(0, REACTIONS_LIMIT)
    }
  }

  visitor.lastSeenAt = new Date()
  await visitor.save()

  return res.status(200).json(visitor)
}

module.exports = {
  initVisitor,
  updateVisitor,
}
