const { bucket } = require('../config/firebaseConfig')

const saveMyPlaylistCover = async ({ buffer, ownerId, playlistId }) => {
  if (!buffer) return null

  const safeOwnerId = String(ownerId || 'user').trim()
  const safePlaylistId = String(playlistId || Date.now()).trim()

  const destPath = `my-playlist-covers/${safeOwnerId}/${safePlaylistId}.png`
  const normalized = destPath.replace(/^\/+/, '')

  const file = bucket.file(normalized)

  await file.save(buffer, {
    resumable: false,
    metadata: {
      contentType: 'image/png',
      cacheControl: 'public, max-age=31536000',
    },
    validation: false,
  })

  await file.makePublic()

  return `https://storage.googleapis.com/${bucket.name}/${encodeURI(normalized)}`
}

module.exports = { saveMyPlaylistCover }
