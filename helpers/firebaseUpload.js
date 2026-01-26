const { bucket } = require('../config/firebaseConfig')

async function uploadMakePublic(
  localPath,
  destPath,
  contentType = 'video/mp4',
) {
  const normalized = destPath.replace(/^\/+/, '')

  await bucket.upload(localPath, {
    destination: normalized,
    resumable: false,
    metadata: {
      contentType,
      cacheControl: 'public, max-age=31536000',
    },
  })

  const file = bucket.file(normalized)
  await file.makePublic()

  return `https://storage.googleapis.com/${bucket.name}/${encodeURI(normalized)}`
}

function extractObjectPathFromPublicUrl(url) {
  if (!url) return null

  const prefix = `https://storage.googleapis.com/${bucket.name}/`
  if (!url.startsWith(prefix)) return null

  const encodedPath = url.slice(prefix.length)

  try {
    return decodeURI(encodedPath)
  } catch (e) {
    return null
  }
}

async function deleteByPublicUrl(url) {
  const objectPath = extractObjectPathFromPublicUrl(url)
  if (!objectPath) return false

  try {
    await bucket.file(objectPath).delete({ ignoreNotFound: true })
    return true
  } catch (e) {
    return false
  }
}

module.exports = { uploadMakePublic, deleteByPublicUrl }
