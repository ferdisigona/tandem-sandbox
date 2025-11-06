import dotenv from "dotenv";

dotenv.config();

const config = {
  port: Number(process.env.PORT) || 3001,
  openai: {
    chatModel: process.env.OPENAI_CHAT_MODEL || process.env.OPENAI_JSON_MODEL || "gpt-4o-mini",
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
    temperature: process.env.OPENAI_TEMPERATURE
      ? Number(process.env.OPENAI_TEMPERATURE)
      : 0.3,
  },
};

export default config;

