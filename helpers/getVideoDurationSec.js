const { execFile } = require('child_process')
const path = require('path')

function resolveFfprobePath() {
  // якщо ти вже задаєш FFMPEG_PATH на Windows — зазвичай поруч лежить ffprobe.exe
  const ffmpeg = process.env.FFMPEG_PATH
  const ffprobeEnv = process.env.FFPROBE_PATH
  if (ffprobeEnv) return ffprobeEnv

  if (ffmpeg) {
    const base = path.basename(ffmpeg).toLowerCase()
    if (base.startsWith('ffmpeg')) {
      return ffmpeg.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1')
    }
  }

  return 'ffprobe'
}

function getVideoDurationSec(filePath) {
  const FFPROBE = resolveFfprobePath()

  return new Promise((resolve, reject) => {
    execFile(
      FFPROBE,
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        filePath,
      ],
      (err, stdout) => {
        if (err) return reject(err)
        const n = Number(String(stdout || '').trim())
        if (!Number.isFinite(n) || n <= 0)
          return reject(new Error('Failed to read duration'))
        resolve(Math.round(n)) // секунди
      },
    )
  })
}

module.exports = { getVideoDurationSec }
