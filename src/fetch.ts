import * as cheerio from 'cheerio'
import { embeddings, ns, pc } from '@/src/libs'
import * as fs from 'fs/promises'
import path, { dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const htmlContent = await (await fetch('https://www.foxnews.com/world')).text()

const $ = cheerio.load(htmlContent)

const articleURLs: string[] = []
$('article a').each((_, element) => {
  let url = $(element).attr('href')
  if (url && url.startsWith('/')) {
    // Ensure it is a full URL, Fox News uses relative URLs
    url = `https://www.foxnews.com${url}`
    if (!url.startsWith('https://www.foxnews.com/video/') && !articleURLs.includes(url)) {
      articleURLs.push(url)
    }
  }
})

const objects: { url: string, json: string }[] = []
const contentStrings: string[] = []

for (let i = 0;i < articleURLs.length;i++) {
  const url = articleURLs[i]
  console.log(`Fetching ${url}`)
  const html = await (await fetch(url)).text()

  const $ = cheerio.load(html)

  const scriptTags = $('script[type="application/ld+json"]')

  let extractedData: { headline?: string, articleBody?: string, datePublished?: string, dateModified?: string, description?: string } = {}

  scriptTags.each((_, element) => {
    const jsonScriptTag = $(element).html()
    if (jsonScriptTag) {
      try {
        const jsonData = JSON.parse(jsonScriptTag)

        if (jsonData.headline && jsonData.articleBody && jsonData.datePublished && jsonData.dateModified && jsonData.description) {
          extractedData = {
            headline: jsonData.headline,
            articleBody: jsonData.articleBody,
            datePublished: jsonData.datePublished,
            dateModified: jsonData.dateModified,
            description: jsonData.description
          }
          contentStrings.push(JSON.stringify(extractedData))
          objects.push({ json: JSON.stringify(extractedData), url })
        }
      } catch (error) {
        console.error('Failed to parse JSON:', error)
      }
    }
  })
}

const vectorEmbeddings = await embeddings.embedDocuments(contentStrings)
await fs.writeFile(path.join(__dirname, './embeddings.json'), JSON.stringify(vectorEmbeddings))

const indexes = (await pc.listIndexes()).indexes
if (!indexes || !indexes.find(i => i.name == process.env.PINECONE_INDEX)) {
  console.log(await pc.createIndex({
    name: process.env.PINECONE_INDEX,
    metric: 'cosine',
    dimension: 1536,
    spec: {
      serverless: {
        cloud: 'aws',
        region: 'us-east-1'
      }
    }
  }))
}

await ns.upsert(objects.map((o, i, _) => ({ id: o.url, values: vectorEmbeddings[i], metadata: { payload: o.json } })))
