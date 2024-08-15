import { __prod__ } from '@/src/constants'
import { embeddings, ns } from '@/src/libs'
import * as cheerio from 'cheerio'
import express from 'express'
import http from 'http'
import cron from 'node-cron'

const app = express()
http.createServer(app)

app.use(express.json())

app.listen(parseInt(process.env.API_PORT), () => {
  if (!__prod__) {
    console.log(`Server started on localhost:${process.env.API_PORT}.`)
  }
  else {
    console.log(`Server started at ${process.env.BACKEND_ORIGIN}.`)
  }
})

app.get('/', (_, res) => {
  res.send('Welcome to Express.')
})

app.post('/query', async (req, res) => {
  let keywords = []
  if (!req.body.keywords || req.body.keywords.length == 0) {
    keywords.push('Latest news')
  }
  else {
    keywords = req.body.keywords
  }
  const embedding = (await embeddings.embedQuery(JSON.stringify(keywords)))

  const result = await ns.query({
    topK: req.body.topK,
    vector: embedding,
    includeValues: true,
    includeMetadata: true
  })

  const payloads = result.matches.map(m => {
    const url = m.id
    const obj = JSON.parse(m.metadata?.payload as string)
    return { ...obj, url }
  })

  res.json(payloads)
})

cron.schedule('0 0 * * *', async () => {
  const htmlContent = await (await fetch('https://www.foxnews.com/world')).text()

  const $ = cheerio.load(htmlContent)

  const articleURLs: string[] = []
  $('article a').each((_, element) => {
    let url = $(element).attr('href')
    if (url && url.startsWith('/')) {
      url = `https://www.foxnews.com${url}`
      if (!url.startsWith('https://www.foxnews.com/video/') && !articleURLs.includes(url)) {
        articleURLs.push(url)
      }
    }
  })

  const newArticleURLs = []

  for (let i = 0;i < articleURLs.length;i++) {
    const url = articleURLs[i]
    const result = await ns.query({ id: url, topK: 1 })
    if (result.matches.length == 0) {
      newArticleURLs.push(url)
    }
  }

  const objects: { url: string, json: string }[] = []
  const contentStrings: string[] = []

  for (let i = 0;i < newArticleURLs.length;i++) {
    const url = newArticleURLs[i]
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

  await ns.upsert(objects.map((o, i, _) => ({ id: o.url, values: vectorEmbeddings[i], metadata: { payload: o.json } })))
})