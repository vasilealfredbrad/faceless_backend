# invisiblecreator.video - AI TikTok Video Generator

Generate TikTok-format videos with AI-written scripts, natural voiceovers, and animated captions.

## Quick Start

### 1. Configure Environment

```bash
cp .env.example .env
```

Fill in your API keys:

- **GROQ_API_KEY** - Get from [console.groq.com](https://console.groq.com)
- **UNREALSPEECH_API_KEY** - Get from [unrealspeech.com](https://unrealspeech.com) (format: `Bearer your-key`)
- **SUPABASE_URL** / **SUPABASE_ANON_KEY** / **SUPABASE_SERVICE_ROLE_KEY** - From your [Supabase](https://supabase.com) project

### 2. Add Background Videos

Place your pre-cut background videos in:

```
videos/minecraft/30/   # 30-second clips
videos/minecraft/60/   # 60-second clips
```

Supported formats: `.mp4`, `.mov`, `.webm`, `.avi`, `.mkv`

### 3. Run with Docker

```bash
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000)

### Development (without Docker)

```bash
# Backend
cd backend && npm install && npm run dev

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```

Frontend runs on `:5173` with proxy to backend on `:3000`.

## How It Works

1. User enters a topic, selects duration (30s/60s), voice, and background
2. AI generates a viral TikTok script via Groq (Llama 3.3 70B)
3. Unreal Speech v8 creates a natural voiceover with word-level timestamps
4. ASS subtitles are generated with TikTok-style word highlighting
5. FFmpeg assembles the background video + audio + subtitles into a 1080x1920 MP4

## Tech Stack

- **Frontend**: React, Vite, TailwindCSS v4, Supabase Auth UI
- **Backend**: Express, TypeScript, FFmpeg
- **AI**: Groq (Llama 3.3 70B), Unreal Speech v8
- **Auth**: Supabase
- **Deploy**: Docker
