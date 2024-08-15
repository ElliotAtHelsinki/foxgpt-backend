declare global {
  namespace NodeJS {
    interface ProcessEnv {
      OPENAI_API_KEY: string;
      PINECONE_API_KEY: string;
      PINECONE_INDEX: string;
      PINECONE_NAMESPACE: string;
      API_PORT: string;
    }
  }
}

export {}
