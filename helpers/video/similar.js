const mongoose = require('mongoose')
const { Video } = require('../../models/video')

// -------------------------
// Similar constants
// -------------------------
const SIMILAR_PAGE_SIZE = 12
const SIMILAR_MAX = 60

function escapeRegex(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// cursor = base64(JSON.stringify({ score, _id, offset }))
function encodeCursor(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64')
}

function decodeCursor(cursor) {
  if (!cursor) return null
  try {
    const raw = Buffer.from(String(cursor), 'base64').toString('utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function toObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null
}

function normalizeFilter(v) {
  const f = String(v || 'all')
    .trim()
    .toLowerCase()
  const allowed = new Set([
    'all',
    'related',
    'from_channel',
    'recent',
    'watched',
  ])
  return allowed.has(f) ? f : 'all'
}

function uniqStrings(arr) {
  const out = []
  const seen = new Set()
  for (const x of arr || []) {
    const s = String(x)
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out
}

/**
 * Similar strategy (base):
 * - score: tags*3 + titleMatch*2 + sameChannel*1
 * - sort: score desc, _id desc (stable)
 *
 * Filters:
 * - all: tags/title/channel bonus
 * - related: tags/title only (no channel bonus)
 * - from_channel: only same channel
 * - recent: like all, but ties sorted by recencyTs
 * - watched: only ids from watchedIds (no score gating)
 *
 * Extra:
 * - excludeIds: force-exclude some video ids from results (server-side stable paging)
 * - excludeInWatched: if false -> ignore excludeIds when filter=watched (so watched stays “true history”)
 */
async function buildSimilarPage({
  currentVideo,
  cursor = null,
  filter = 'all',
  watchedIds = [],
  excludeIds = [],
  excludeInWatched = false,
} = {}) {
  if (!currentVideo?._id) {
    return { items: [], hasMore: false, nextCursor: null }
  }

  const f = normalizeFilter(filter)

  const curId = String(currentVideo._id)

  const excludeStr = uniqStrings([
    curId,
    ...(excludeIds || []).map(String),
  ])

  const excludeObjIds = excludeStr.map(toObjectId).filter(Boolean)

  const baseFilter = {
    status: 'ready',
    isPublished: true,
    _id: { $ne: currentVideo._id },
  }

  const shouldApplyExclude = f !== 'watched' || Boolean(excludeInWatched)

  if (shouldApplyExclude && excludeObjIds.length) {
    baseFilter._id = {
      ...baseFilter._id,
      $nin: excludeObjIds,
    }
  }

  const tags = Array.isArray(currentVideo.tags)
    ? currentVideo.tags.slice(0, 10)
    : []

  const titleWords = String(currentVideo.title || '')
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 4)
    .slice(0, 8)

  const titleRegex = titleWords.length
    ? new RegExp(titleWords.map(escapeRegex).join('|'), 'i')
    : null

  const cur = decodeCursor(cursor)
  const afterScore = cur?.score ?? null
  const afterId = cur?._id ?? null
  const offset = Number(cur?.offset || 0)

  if (offset >= SIMILAR_MAX) {
    return { items: [], hasMore: false, nextCursor: null }
  }

  const afterObjectId = afterId ? toObjectId(afterId) : null

  // -------------------------
  // MATCH: depends on filter
  // -------------------------
  const match = { ...baseFilter }

  if (f === 'watched') {
    // watchedIds must be provided from session/user history
    const ids = (watchedIds || [])
      .map(String)
      .map(toObjectId)
      .filter(Boolean)
      .slice(0, 500)

    if (!ids.length) {
      return { items: [], hasMore: false, nextCursor: null }
    }

    const baseId = match._id || {}
    match._id = {
      ...(typeof baseId === 'object' ? baseId : {}),
      $in: ids,
      $ne: currentVideo._id,
    }
  } else if (f === 'from_channel') {
    if (!currentVideo.channelRef) {
      return { items: [], hasMore: false, nextCursor: null }
    }
    match.channelRef = currentVideo.channelRef
  } else {
    // all / related / recent
    const or = []
    if (tags.length) or.push({ tags: { $in: tags } })
    if (titleRegex) or.push({ title: titleRegex })

    // only for all/recent: include same channel as candidate source
    if ((f === 'all' || f === 'recent') && currentVideo.channelRef) {
      or.push({ channelRef: currentVideo.channelRef })
    }

    if (or.length) match.$or = or
  }

  // -------------------------
  // SCORE toggles
  // -------------------------
  const channelBonusEnabled = f === 'all' || f === 'recent'
  const useRecency = f === 'recent'

  const pipeline = [
    { $match: match },

    {
      $addFields: {
        scoreTags: tags.length
          ? { $size: { $setIntersection: ['$tags', tags] } }
          : 0,
        scoreTitle: titleRegex
          ? {
              $cond: [
                { $regexMatch: { input: '$title', regex: titleRegex } },
                1,
                0,
              ],
            }
          : 0,
        scoreChannel: channelBonusEnabled
          ? { $cond: [{ $eq: ['$channelRef', currentVideo.channelRef] }, 1, 0] }
          : 0,

        ...(useRecency
          ? {
              recencyTs: {
                $ifNull: [
                  '$publishedAt',
                  { $ifNull: ['$createdAt', new Date(0)] },
                ],
              },
            }
          : {}),
      },
    },

    {
      $addFields: {
        score: {
          $add: [
            { $multiply: ['$scoreTags', 3] },
            { $multiply: ['$scoreTitle', 2] },
            '$scoreChannel',
          ],
        },
      },
    },

    // score gating: only for all/related/recent
    ...(f === 'watched' || f === 'from_channel'
      ? []
      : [{ $match: { score: { $gt: 0 } } }]),

    // pagination "after"
    ...(afterScore != null && afterObjectId
      ? [
          {
            $match: {
              $or: [
                { score: { $lt: afterScore } },
                { score: afterScore, _id: { $lt: afterObjectId } },
              ],
            },
          },
        ]
      : []),

    // sort
    ...(useRecency
      ? [{ $sort: { score: -1, recencyTs: -1, _id: -1 } }]
      : [{ $sort: { score: -1, _id: -1 } }]),

    { $limit: Math.min(SIMILAR_PAGE_SIZE + 1, SIMILAR_MAX - offset) },
  ]

  const docs = await Video.aggregate(pipeline)

  const hasMore =
    docs.length > SIMILAR_PAGE_SIZE && offset + SIMILAR_PAGE_SIZE < SIMILAR_MAX
  const pageItems = docs.slice(0, SIMILAR_PAGE_SIZE)

  const last = pageItems[pageItems.length - 1]
  const nextCursor =
    hasMore && last
      ? encodeCursor({
          score: last.score,
          _id: String(last._id),
          offset: offset + pageItems.length,
        })
      : null

  const cleaned = pageItems.map((d) => {
    const { score, scoreTags, scoreTitle, scoreChannel, recencyTs, ...rest } = d
    return rest
  })

  return { items: cleaned, hasMore, nextCursor }
}

module.exports = {
  buildSimilarPage,
  SIMILAR_PAGE_SIZE,
  SIMILAR_MAX,
}
