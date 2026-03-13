const OpenAI = require('openai')

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const cleanText = (v = '') =>
  String(v || '')
    .trim()
    .replace(/\s+/g, ' ')

const generatePlaylistCoverImage = async ({
  title = '',
  sourceQuery = '',
  sampleTitles = [],
}) => {
  const normalizedTitle = cleanText(title)
  const normalizedQuery = cleanText(sourceQuery)

  const normalizedSampleTitles = Array.isArray(sampleTitles)
    ? sampleTitles
        .map((item) => cleanText(item))
        .filter(Boolean)
        .slice(0, 5)
    : []

  const promptParts = [
    'Create a premium playlist cover for a modern video and music streaming platform.',
    'Style: abstract, cinematic, polished, vibrant gradients, fluid wave shapes, soft glow, premium digital artwork.',
    'No text, no letters, no words, no logos, no icons, no interface, no collage, no faces.',
    'Centered abstract composition, visually rich, suitable for a playlist cover.',
  ]

  if (normalizedTitle) {
    promptParts.push(`Playlist title mood: ${normalizedTitle}.`)
  }

  if (normalizedQuery) {
    promptParts.push(`Theme keywords: ${normalizedQuery}.`)
  }

  if (normalizedSampleTitles.length > 0) {
    promptParts.push(
      `Inspired by these titles: ${normalizedSampleTitles.join(' | ')}.`,
    )
  }

  promptParts.push(
    'The result should feel like premium official streaming-platform artwork.',
  )

  const prompt = promptParts.join(' ')

  const result = await openai.images.generate({
    model: 'gpt-image-1',
    prompt,
    size: '1024x1024',
  })

  const b64 = result?.data?.[0]?.b64_json
  if (!b64) return null

  return Buffer.from(b64, 'base64')
}

module.exports = { generatePlaylistCoverImage }
