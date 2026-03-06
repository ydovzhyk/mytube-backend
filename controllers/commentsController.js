const { Types } = require('mongoose')
const { Comment } = require('../models/comment')
const { Video } = require('../models/video')
const { Channel } = require('../models/channel')
const { User } = require('../models/user')
const { RequestError } = require('../helpers')

/* ================= helpers ================= */

const toInt = (v, def) => {
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) ? n : def
}

const toBool = (v) => {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v === 1
  if (typeof v === 'string')
    return v.trim() === '1' || v.trim().toLowerCase() === 'true'
  return false
}

const safeStr = (v) => String(v || '').trim()

const isValidId = (id) => Types.ObjectId.isValid(String(id || '').trim())

const textShort = (s = '', max = 160) => {
  const x = String(s || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (x.length <= max) return x
  return x.slice(0, max).trim()
}

// Cursor: base64(JSON({pinnedAt, createdAt, id}))
function encodeCursor(doc) {
  if (!doc) return ''
  const payload = {
    pinnedAt: doc?.pinnedAt ? new Date(doc.pinnedAt).toISOString() : null,
    createdAt: doc?.createdAt ? new Date(doc.createdAt).toISOString() : null,
    id: String(doc?._id || ''),
  }
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')
}

function decodeCursor(cursor = '') {
  try {
    const raw = Buffer.from(String(cursor || ''), 'base64').toString('utf8')
    const obj = JSON.parse(raw)
    const id = String(obj?.id || '').trim()
    const createdAt = obj?.createdAt ? new Date(obj.createdAt) : null
    const pinnedAt = obj?.pinnedAt ? new Date(obj.pinnedAt) : null

    if (!id || !Types.ObjectId.isValid(id)) return null
    if (createdAt && Number.isNaN(createdAt.getTime())) return null
    if (pinnedAt && Number.isNaN(pinnedAt.getTime())) return null

    return { id, createdAt, pinnedAt }
  } catch {
    return null
  }
}

function normalizeOldValue(found) {
  const v = Number(found?.value || 0)
  return v === 1 || v === -1 ? v : 0
}

function getDelta(oldV, newV) {
  const delta = { likes: 0, dislikes: 0 }
  if (oldV === newV) return delta
  if (oldV === 1) delta.likes -= 1
  if (oldV === -1) delta.dislikes -= 1
  if (newV === 1) delta.likes += 1
  if (newV === -1) delta.dislikes += 1
  return delta
}

function buildAuthorSnapshotFromUser(user) {
  if (!user?._id) return null
  return {
    // User snapshot
    name: String(user.name || '').trim(),
    avatar: String(user.userAvatar || '').trim(),

    // keep channel-ish fields empty (frontend може читати title/handle)
    title: '',
    handle: '',
    avatarUrl: '',
    channelId: null,
  }
}

function buildAuthorSnapshotFromChannelSnapshot(snap) {
  if (!snap) return null
  return {
    // Channel snapshot
    channelId: snap?.channelId || snap?._id || snap?.id || null,
    handle: String(snap?.handle || '')
      .trim()
      .toLowerCase(),
    title: String(snap?.title || '').trim(),
    avatarUrl: String(snap?.avatarUrl || snap?.avatar || '').trim(),

    // keep user-ish fields empty
    name: '',
    avatar: '',
  }
}

async function ensureVideoExists(videoId) {
  if (!isValidId(videoId)) throw RequestError(400, 'Invalid videoId')

  // IMPORTANT: беремо також channelSnapshot, щоб owner міг коментити як канал
  const v = await Video.findById(videoId)
    .select(
      '_id ownerId status isPublished channelSnapshot channelId channelRef',
    )
    .lean()

  if (!v) throw RequestError(404, 'Video not found')
  return v
}

// Legacy support: якщо в старих коментарях був authorChannelId,
// дозволяємо edit/delete якщо цей channel належить юзеру.
async function ensureChannelOwnedByUser(channelId, userId) {
  const cid = String(channelId || '').trim()
  const uid = String(userId || '').trim()
  if (!cid || !Types.ObjectId.isValid(cid)) return false
  if (!uid) return false

  const ch = await Channel.findById(cid).select('_id ownerId').lean()
  if (!ch) return false
  return String(ch.ownerId || '') === uid
}

/* ================= controllers ================= */

// POST /comments
async function createCommentController(req, res) {
  const userId = req.user?._id
  if (!userId) throw RequestError(401, 'Unauthorized')

  const { videoId, content, replyTo = null, pin = false } = req.body || {}
  if (!videoId) throw RequestError(400, 'videoId is required')

  const video = await ensureVideoExists(videoId)

  const text = String(content || '').trim()
  if (!text) throw RequestError(400, 'content is required')

  const me = await User.findById(userId).select('_id name userAvatar').lean()
  if (!me) throw RequestError(404, 'User not found')

  const isOwner = String(video?.ownerId || '') === String(userId)

  // ✅ Нова логіка:
  // - owner коментить як channel (video.channelSnapshot)
  // - всі інші — як user
  const ownerChannelSnap = video?.channelSnapshot || null

  // ✅ якщо channelSnapshot раптом відсутній — не ламаємось, коментимо як user
  const authorSnapshot =
    isOwner && ownerChannelSnap
      ? buildAuthorSnapshotFromChannelSnapshot(ownerChannelSnap)
      : buildAuthorSnapshotFromUser(me)

  if (!authorSnapshot) throw RequestError(400, 'Cannot build author snapshot')

  const isReply = Boolean(replyTo)
  const replyToId = isReply ? String(replyTo) : null

  let replyPreview = null

  if (isReply) {
    if (!isValidId(replyToId)) throw RequestError(400, 'Invalid replyTo')

    const parent = await Comment.findOne({ _id: replyToId, videoId })
      .select('_id authorSnapshot text isDeleted')
      .lean()

    if (!parent) throw RequestError(404, 'Parent comment not found')

    const pSnap = parent?.authorSnapshot || {}

    const previewName = String(pSnap?.title || pSnap?.name || '').trim()
    const previewAvatar = String(pSnap?.avatarUrl || pSnap?.avatar || '').trim()

    replyPreview = {
      commentId: parent._id,
      authorHandle: String(pSnap?.handle || '')
        .trim()
        .toLowerCase(),
      authorTitle: previewName,
      authorAvatarUrl: previewAvatar,
      textShort: parent?.isDeleted
        ? 'Comment deleted'
        : textShort(parent?.text || '', 160),
    }
  }

  // pin allowed only for video owner and only for root comments
  let pinnedAt = null
  const wantPin = Boolean(pin)

  if (wantPin) {
    if (isReply) throw RequestError(400, 'Only root comments can be pinned')
    if (!isOwner) throw RequestError(403, 'Only video owner can pin comments')

    const pinnedCount = await Comment.countDocuments({
      videoId,
      replyTo: null,
      pinnedAt: { $ne: null },
      isDeleted: false,
    })

    if (pinnedCount >= 3)
      throw RequestError(400, 'Pinned comments limit reached (3)')

    pinnedAt = new Date()
  }

  // ✅ Якщо owner пише як channel — збережемо channelId і в authorChannelId (корисно для legacy/адмін логіки)
  const authorChannelId =
    isOwner && ownerChannelSnap
      ? ownerChannelSnap?.channelId ||
        ownerChannelSnap?._id ||
        ownerChannelSnap?.id ||
        null
      : null

  const doc = await Comment.create({
    videoId,

    // ✅ автор — user (обов'язково по схемі)
    authorUserId: userId,

    // ✅ додатково: канал автора (якщо owner пише як канал)
    authorChannelId,

    // ✅ Snapshot для рендера без populate
    authorSnapshot,

    replyTo: isReply ? replyToId : null,
    replyPreview,

    text,
    pinnedAt,

    isDeleted: false,
    deletedAt: null,
    editedAt: null,

    likesCount: 0,
    dislikesCount: 0,
  })

  return res.status(201).json({ comment: doc })
}
// async function createCommentController(req, res) {
//   const userId = req.user?._id
//   if (!userId) throw RequestError(401, 'Unauthorized')

//   const { videoId, content, replyTo = null, pin = false } = req.body || {}
//   if (!videoId) throw RequestError(400, 'videoId is required')

//   const video = await ensureVideoExists(videoId)

//   const text = String(content || '').trim()
//   if (!text) throw RequestError(400, 'content is required')

//   const me = await User.findById(userId).select('_id name userAvatar').lean()
//   if (!me) throw RequestError(404, 'User not found')

//   const isOwner = String(video?.ownerId || '') === String(userId)

//   // ✅ Нова логіка:
//   // - owner коментить як channel (video.channelSnapshot)
//   // - всі інші — як user
//   const ownerChannelSnap = video?.channelSnapshot || null

//   const authorSnapshot =
//     isOwner && ownerChannelSnap
//       ? buildAuthorSnapshotFromChannelSnapshot(ownerChannelSnap)
//       : buildAuthorSnapshotFromUser(me)

//   if (!authorSnapshot) throw RequestError(400, 'Cannot build author snapshot')

//   const isReply = Boolean(replyTo)
//   const replyToId = isReply ? String(replyTo) : null

//   let replyPreview = null

//   if (isReply) {
//     if (!isValidId(replyToId)) throw RequestError(400, 'Invalid replyTo')

//     const parent = await Comment.findOne({ _id: replyToId, videoId })
//       .select('_id authorSnapshot text isDeleted')
//       .lean()

//     if (!parent) throw RequestError(404, 'Parent comment not found')

//     const pSnap = parent?.authorSnapshot || {}

//     const previewName = String(pSnap?.title || pSnap?.name || '').trim()

//     const previewAvatar = String(pSnap?.avatarUrl || pSnap?.avatar || '').trim()

//     replyPreview = {
//       commentId: parent._id,
//       authorHandle: String(pSnap?.handle || '')
//         .trim()
//         .toLowerCase(),
//       authorTitle: previewName,
//       authorAvatarUrl: previewAvatar,
//       textShort: parent?.isDeleted
//         ? 'Comment deleted'
//         : textShort(parent?.text || '', 160),
//     }
//   }

//   // pin allowed only for video owner and only for root comments
//   let pinnedAt = null
//   const wantPin = Boolean(pin)

//   if (wantPin) {
//     if (isReply) throw RequestError(400, 'Only root comments can be pinned')
//     if (!isOwner) throw RequestError(403, 'Only video owner can pin comments')

//     const pinnedCount = await Comment.countDocuments({
//       videoId,
//       replyTo: null,
//       pinnedAt: { $ne: null },
//       isDeleted: false,
//     })

//     if (pinnedCount >= 3)
//       throw RequestError(400, 'Pinned comments limit reached (3)')

//     pinnedAt = new Date()
//   }

//   const doc = await Comment.create({
//     videoId,

//     // ✅ Нове: автор — user
//     authorUserId: me._id,

//     // ✅ Snapshot для рендера без populate
//     authorSnapshot,

//     replyTo: isReply ? replyToId : null,
//     replyPreview,

//     text,
//     pinnedAt,

//     isDeleted: false,
//     deletedAt: null,
//     editedAt: null,

//     likesCount: 0,
//     dislikesCount: 0,

//     // legacy field (не обов'язково) — залишаємо null
//     authorChannelId: null,
//   })

//   return res.status(201).json({ comment: doc })
// }

// GET /comments/by-video/:videoId?cursor=&limit=&includeReplies=1&repliesLimit=
// ✅ authorizeOptional is expected on route, so req.user may exist.
// ✅ we mix in myReaction if user is logged-in.
async function getCommentsByVideoIdController(req, res) {
  const videoId = String(req.params.videoId || '').trim()
  if (!isValidId(videoId)) throw RequestError(400, 'Invalid videoId')

  const limit = Math.min(50, Math.max(1, toInt(req.query.limit, 10)))
  const includeReplies = toBool(req.query.includeReplies)
  const repliesLimit = Math.min(
    200,
    Math.max(0, toInt(req.query.repliesLimit, 50)),
  )
  const cursorStr = safeStr(req.query.cursor)

  const cursor = cursorStr ? decodeCursor(cursorStr) : null

  // sort: pinnedAt desc, createdAt desc, _id desc
  const sort = { pinnedAt: -1, createdAt: -1, _id: -1 }
  const baseFilter = { videoId }
  const rootsFilter = { ...baseFilter, replyTo: null }

  if (cursor) {
    const lastId = new Types.ObjectId(cursor.id)
    const lastCreatedAt = cursor.createdAt || null
    const lastPinnedAt = cursor.pinnedAt || null

    if (!lastPinnedAt) {
      rootsFilter.pinnedAt = null
      if (lastCreatedAt) {
        rootsFilter.$or = [
          { createdAt: { $lt: lastCreatedAt } },
          { createdAt: lastCreatedAt, _id: { $lt: lastId } },
        ]
      } else {
        rootsFilter._id = { $lt: lastId }
      }
    } else {
      const or = []
      or.push({ pinnedAt: { $lt: lastPinnedAt } })
      or.push({ pinnedAt: null })

      if (lastCreatedAt) {
        or.push({
          pinnedAt: lastPinnedAt,
          $or: [
            { createdAt: { $lt: lastCreatedAt } },
            { createdAt: lastCreatedAt, _id: { $lt: lastId } },
          ],
        })
      } else {
        or.push({ pinnedAt: lastPinnedAt, _id: { $lt: lastId } })
      }

      rootsFilter.$or = or
    }
  }

  // fetch limit+1 to compute hasMore
  const roots = await Comment.find(rootsFilter)
    .sort(sort)
    .limit(limit + 1)
    .lean()

  const hasMore = roots.length > limit
  const pageRoots = hasMore ? roots.slice(0, limit) : roots

  let items = pageRoots

  if (includeReplies && repliesLimit > 0 && pageRoots.length) {
    const rootIds = pageRoots.map((c) => c._id)

    const repliesAll = await Comment.find({
      videoId,
      replyTo: { $in: rootIds },
    })
      .sort({ createdAt: 1, _id: 1 })
      .lean()

    const byParent = new Map()
    for (const r of repliesAll) {
      const pid = String(r.replyTo || '')
      if (!pid) continue
      const arr = byParent.get(pid) || []
      if (arr.length >= repliesLimit) continue
      arr.push(r)
      byParent.set(pid, arr)
    }

    const flat = []
    for (const root of pageRoots) {
      flat.push(root)
      const rid = String(root._id)
      const reps = byParent.get(rid) || []
      for (const rr of reps) flat.push(rr)
    }

    items = flat
  }

  // ✅ Mix in myReaction if logged-in
  const userId = req.user?._id
  if (userId && items.length) {
    const actor = await User.findById(userId)
      .select('_id commentReactions')
      .lean()

    const list = Array.isArray(actor?.commentReactions)
      ? actor.commentReactions
      : []

    const map = new Map()
    for (const r of list) {
      const cid = String(r?.commentId || '')
      if (!cid) continue
      map.set(cid, normalizeOldValue(r))
    }

    items = items.map((c) => {
      const cid = String(c?._id || '')
      const mine = map.get(cid) ?? 0
      return { ...c, myReaction: mine }
    })
  } else if (items.length) {
    // гості: стабільно віддаємо 0 (щоб фронт не мав undefined)
    items = items.map((c) => ({ ...c, myReaction: 0 }))
  }

  const nextCursor = hasMore
    ? encodeCursor(pageRoots[pageRoots.length - 1])
    : ''

  res.set('Cache-Control', 'no-store')
  res.json({ items, nextCursor, hasMore })
}

// PATCH /comments/:id  (body: { content?, pin? })
async function editCommentController(req, res, next) {
  try {
    const userId = req.user?._id
    if (!userId) throw RequestError(401, 'Unauthorized')

    const id = String(req.params.id || '').trim()
    if (!isValidId(id)) throw RequestError(400, 'Invalid comment id')

    const wantContent = Object.prototype.hasOwnProperty.call(
      req.body || {},
      'content',
    )
    const wantPin = Object.prototype.hasOwnProperty.call(req.body || {}, 'pin')

    if (!wantContent && !wantPin) throw RequestError(400, 'Nothing to update')

    // 1) дістаємо комент ОДИН раз для перевірок
    const comment = await Comment.findById(id)
      .select(
        '_id videoId authorUserId authorChannelId replyTo pinnedAt isDeleted text',
      )
      .lean()

    if (!comment) throw RequestError(404, 'Comment not found')
    if (comment.isDeleted) throw RequestError(400, 'Comment is deleted')

    // content edit: only comment author (USER) + legacy channel support
    if (wantContent) {
      const authorUserId = comment?.authorUserId
        ? String(comment.authorUserId)
        : ''

      if (authorUserId) {
        if (authorUserId !== String(userId))
          throw RequestError(403, 'Forbidden')
      } else {
        const legacyChannelId = String(comment?.authorChannelId || '')
        const ok = await ensureChannelOwnedByUser(legacyChannelId, userId)
        if (!ok) throw RequestError(403, 'Forbidden')
      }

      const nextText = String(req.body.content || '').trim()
      if (!nextText) throw RequestError(400, 'content is required')

      // ❗️ВАЖЛИВО: теж НЕ save(), бо legacy doc без authorUserId впаде
      const updated = await Comment.findOneAndUpdate(
        { _id: id },
        { $set: { text: nextText, editedAt: new Date() } },
        { new: true }, // runValidators не потрібно
      ).lean()

      return res.json({ comment: updated })
    }

    // 2) pin/unpin: only video owner, only root
    if (wantPin) {
      const pin = Boolean(req.body.pin)

      if (comment.replyTo)
        throw RequestError(400, 'Only root comments can be pinned')

      const video = await ensureVideoExists(comment.videoId)
      const isOwner = String(video?.ownerId || '') === String(userId)
      if (!isOwner) throw RequestError(403, 'Only video owner can pin comments')

      if (pin) {
        const pinnedCount = await Comment.countDocuments({
          videoId: comment.videoId,
          replyTo: null,
          pinnedAt: { $ne: null },
          isDeleted: false,
          _id: { $ne: comment._id },
        })
        if (pinnedCount >= 3)
          throw RequestError(400, 'Pinned comments limit reached (3)')
      }

      const updated = await Comment.findOneAndUpdate(
        { _id: id },
        { $set: { pinnedAt: pin ? new Date() : null } },
        { new: true },
      ).lean()

      return res.json({ comment: updated })
    }

    throw RequestError(400, 'Nothing to update')
  } catch (e) {
    next(e)
  }
}

// DELETE /comments/:id (soft delete)
async function deleteCommentController(req, res, next) {
  try {
    const userId = req.user?._id
    if (!userId) throw RequestError(401, 'Unauthorized')

    const id = String(req.params.id || '').trim()
    if (!isValidId(id)) throw RequestError(400, 'Invalid comment id')

    const comment = await Comment.findById(id)
    if (!comment) throw RequestError(404, 'Comment not found')

    if (comment.isDeleted) {
      return res.json({ message: 'Comment deleted' })
    }

    // only author can delete (USER) + legacy support
    const authorUserId = comment?.authorUserId
      ? String(comment.authorUserId)
      : ''

    if (authorUserId) {
      if (authorUserId !== String(userId)) throw RequestError(403, 'Forbidden')
    } else {
      const legacyChannelId = String(comment?.authorChannelId || '')
      const ok = await ensureChannelOwnedByUser(legacyChannelId, userId)
      if (!ok) throw RequestError(403, 'Forbidden')
    }

    comment.isDeleted = true
    comment.deletedAt = new Date()
    comment.pinnedAt = null

    await comment.save()

    res.json({ message: 'Comment deleted' })
  } catch (e) {
    next(e)
  }
}

// POST /comments/:id/react  (body: { value: 1|-1|0 })
async function reactCommentController(req, res, next) {
  try {
    const userId = req.user?._id
    if (!userId) throw RequestError(401, 'Unauthorized')

    const commentId = String(req.params.id || '').trim()
    if (!Types.ObjectId.isValid(commentId))
      throw RequestError(400, 'Invalid comment id')

    const { value } = req.body || {}
    const newValue = Number(value) // 1 | -1 | 0
    if (![1, -1, 0].includes(newValue))
      throw RequestError(400, 'Invalid reaction value')

    const comment = await Comment.findById(commentId)
      .select('_id videoId likesCount dislikesCount isDeleted')
      .lean()

    if (!comment) throw RequestError(404, 'Comment not found')
    if (comment.isDeleted) throw RequestError(400, 'Comment is deleted')

    const actor = await User.findById(userId)
      .select('_id commentReactions')
      .lean()
    if (!actor) throw RequestError(404, 'User not found')

    const reactions = Array.isArray(actor.commentReactions)
      ? actor.commentReactions
      : []
    const found = reactions.find(
      (r) => String(r.commentId) === String(commentId),
    )
    const oldValue = normalizeOldValue(found)

    const delta = getDelta(oldValue, newValue)

    // update user reactions
    if (newValue === 0) {
      await User.updateOne(
        { _id: actor._id },
        { $pull: { commentReactions: { commentId } } },
      )
    } else {
      const setObj = {
        'commentReactions.$.value': newValue,
        'commentReactions.$.reactedAt': new Date(),
      }

      const upd1 = await User.updateOne(
        { _id: actor._id, 'commentReactions.commentId': commentId },
        { $set: setObj },
      )

      if (upd1.matchedCount === 0) {
        await User.updateOne(
          { _id: actor._id },
          {
            $push: {
              commentReactions: {
                commentId,
                value: newValue,
                reactedAt: new Date(),
              },
            },
          },
        )
      }
    }

    // update comment counters
    const inc = {}
    if (delta.likes) inc.likesCount = delta.likes
    if (delta.dislikes) inc.dislikesCount = delta.dislikes

    const updated = Object.keys(inc).length
      ? await Comment.findOneAndUpdate(
          { _id: commentId },
          { $inc: inc },
          {
            new: true,
            projection: { _id: 1, likesCount: 1, dislikesCount: 1 },
          },
        ).lean()
      : await Comment.findById(commentId)
          .select('_id likesCount dislikesCount')
          .lean()

    if (!updated) throw RequestError(404, 'Comment not found')

    const updatedUser = await User.findById(userId)
      .select('_id commentReactions')
      .lean()

    res.json({
      commentId,
      likesCount: updated?.likesCount ?? 0,
      dislikesCount: updated?.dislikesCount ?? 0,
      commentReactions: updatedUser?.commentReactions || [],
    })
  } catch (e) {
    next(e)
  }
}

module.exports = {
  createCommentController,
  getCommentsByVideoIdController,
  editCommentController,
  deleteCommentController,
  reactCommentController,
}
