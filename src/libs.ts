import { OpenAIEmbeddings } from '@langchain/openai'
import { Pinecone } from '@pinecone-database/pinecone'

export const embeddings = new OpenAIEmbeddings({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'text-embedding-3-small',
  dimensions: 1536
})

export const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY
})

export const ns = pc.index(process.env.PINECONE_INDEX).namespace(process.env.PINECONE_NAMESPACE)