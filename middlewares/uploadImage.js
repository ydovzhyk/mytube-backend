const multer = require('multer')
const path = require('path')
const fs = require('fs')

const tmpDir = path.join(process.cwd(), 'tmp', 'uploads')
fs.mkdirSync(tmpDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, tmpDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.jpg'
    cb(null, `image-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`)
  },
})

function fileFilter(req, file, cb) {
  // очікуємо тільки поле "image"
  if (file.fieldname !== 'image') {
    return cb(Object.assign(new Error('Unexpected field'), { status: 400 }))
  }

  if (file.mimetype && file.mimetype.startsWith('image/')) return cb(null, true)

  return cb(
    Object.assign(new Error('Only image files are allowed for image'), {
      status: 400,
    }),
  )
}

const uploadImage = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 8 * 1024 * 1024, // image 8MB
  },
})

module.exports = { uploadImage }
