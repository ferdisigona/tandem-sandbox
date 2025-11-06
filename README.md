# Tandem Sandbox

Tandem Sandbox is a React + Express playground for exploring WhatsApp chat analytics. Upload an exported chat log to:

- Parse messages and segment them into sessions based on timing gaps
- Summarise each session with OpenAI
- Cluster the summaries with embeddings to surface recurring themes
- View sentiment metadata and conversation insights in real time

The project is split into a Vite-powered frontend (`/src`) and an Express backend (`/server`).

## Requirements

- Node.js 20+
- npm (comes with Node)
- OpenAI API key

## Getting Started

Install dependencies for both the frontend and the backend:

```bash
npm install
cd server && npm install
```

Copy the environment templates and adjust values as needed:

```bash
cp env.example .env            # frontend API base URL (Vite style)
cp server/env.example server/.env  # backend configuration & secrets
```

### Development servers

Start the API server (defaults to port 3001):

```bash
cd server
npm run dev
```

In a separate terminal start the Vite dev server:

```bash
npm run dev
```

## Environment Variables

| Scope    | Variable                | Description | Default |
|----------|-------------------------|-------------|---------|
| Frontend | `VITE_API_BASE_URL`     | Base URL for the Express API | `http://localhost:3001` |
| Backend  | `PORT`                  | Express listen port | `3001` |
| Backend  | `OPENAI_API_KEY`        | OpenAI API key | – |
| Backend  | `OPENAI_CHAT_MODEL`     | OpenAI chat completion model | `gpt-4o-mini` |
| Backend  | `OPENAI_EMBEDDING_MODEL`| OpenAI embedding model | `text-embedding-3-small` |
| Backend  | `OPENAI_TEMPERATURE`    | Sampling temperature for OpenAI | `0.3` |

## LLM Provider

### OpenAI

1. Create an OpenAI API key and set `OPENAI_API_KEY` in `server/.env`.
2. (Optional) override `OPENAI_CHAT_MODEL`, `OPENAI_EMBEDDING_MODEL`, or `OPENAI_TEMPERATURE` to tweak behaviour.

## Project Structure

```
├── env.example
├── server/
│   ├── env.example
│   ├── config.js
│   ├── index.js
│   ├── routes/
│   └── services/
└── src/
    ├── api/
    ├── components/
    ├── utils/
    └── styles/
```

## Usage

1. Export a WhatsApp chat (text format) and upload it via the UI.
2. The frontend parses the chat (`parseWhatsapp`) and dispatches segments to the backend.
3. The backend summarises each segment, then clusters summaries using embeddings.
4. Insights and clusters render live in the `InsightsView` component.

> **Privacy tip:** store raw chat exports in a local `data/` directory (ignored by git) and avoid committing personal transcripts to the repository.

## Dependencies & Licensing

- **Frontend**: React 19, Recharts, Sentiment, Vite. All are MIT licensed.
- **Backend**: Express 5, cors, dotenv, OpenAI SDK (MIT licensed).
- **Tooling**: ESLint 9+, Vite React plugin (MIT).

The repository itself is released under the MIT License (see `LICENSE`). Ensure your usage of OpenAI complies with its terms of service.

## Costs & Security Considerations

- **OpenAI usage**: Each request to the analysis endpoints consumes tokens and incurs costs. Monitor usage through the OpenAI dashboard and consider reducing segment size or lowering concurrency if needed.
- **Rate limits**: Respect OpenAI rate limits. If you encounter 429 errors, lower concurrency (see `p-limit` usage in `analyzeSegments`) or add retry logic.
- **API credentials**: Store your OpenAI key securely (e.g., in `server/.env`). Do not hard-code secrets or commit them to version control.
- **Not production hardened**: The Express app lacks authentication, input validation, and DoS protections. Treat it as a developer sandbox unless you add proper security middleware, request quotas, and auditing.

## Testing & Quality

- **Linting**: Run `npm run lint` in the project root to apply ESLint rules across the frontend. Backend linting is not yet configured.
- **Tests**: There is no automated test suite today. If you plan to accept contributions, consider adding unit tests for the parsing utilities and integration tests around the Express routes (with mocked OpenAI calls).
- **Manual verification**: Before publishing, manually exercise the upload flow, segment analysis, and clustering endpoints with non-sensitive sample chats.

## Contributing

Pull requests and bug reports are welcome. Please open an issue to discuss significant changes.
