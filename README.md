# Video Agent Pro

<div align="center">

![Version](https://img.shields.io/badge/Version-3.0.0-purple?style=for-the-badge)
![Next.js](https://img.shields.io/badge/Next.js-15.1-black?style=for-the-badge&logo=next.js)
![React](https://img.shields.io/badge/React-19-blue?style=for-the-badge&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?style=for-the-badge&logo=typescript)

**AI-Powered Video Production Tool | AI 驱动的影视创作工具**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Standed/vibe-agent-pro)

[Features (中文)](#features) | [Quick Start](#quick-start) | [Deployment](#deployment) | [Usage](#usage) | [Tech Stack](#tech-stack)

</div>

---

## 🎬 Introduction

Video Agent Pro is an AI-powered video storyboard generation and editing tool built with Next.js 15 and multiple AI models (Gemini + Volcano Engine + Sora). It provides both conversational AI (Agent Mode) and fine-grained control (Pro Mode) to help creators produce videos from script to final cut.

> ⚠️ **Note**: This project requires user authentication. All data is stored in the cloud (Supabase + Cloudflare R2).

---

<a name="features"></a>

## ✨ Core Features

### 🎭 AI Storyboard Generation
- Input script and AI automatically breaks down scenes and shots
- Based on professional 8-principle storyboard rules
- Extracts shot size, camera movement, and descriptions

### 👥 Character Turnaround Generation
- AI-generated character design sheets
- Layout: 1/3 face closeup + 2/3 front/side/back views
- Pure white background, official art style
- Powered by Volcano Engine SeeDream 4.0

### 🖼️ Grid Multi-View Generation
- Generate 2×2 (4 views) or 3×3 (9 views) storyboard grids
- Multiple aspect ratios: 16:9, 4:3, 21:9, 1:1, etc.
- Style presets: Cinematic, Anime, Realistic, Cyberpunk
- Reference image support for consistency

### 🎬 Grid Slice Preview & Manual Assignment
- **GridPreviewModal**: Visual preview of full grid and individual slices
- Click to assign slices to specific shots
- Smart auto-suggestion: first N slices → first N shots
- Confirmation before updating shot data

### 🎥 Video Generation
- Image-to-Video generation (4-6 seconds)
- Powered by Volcano Engine SeeDance 1.0 Pro
- Async task processing with progress tracking

### 🤖 Dual Work Modes
- **Agent Mode**: Conversational AI control with natural language
- **Pro Mode**: Manual parameter adjustment for fine control
- Seamless mode switching

### 📍 Infinite Canvas
- Drag-and-drop scene and shot management
- Zoom (50%-200%) and pan controls
- Dot grid background
- Visual status indicators (draft/generating/done/failed)

### ✂️ Timeline Editor
- Three states: collapsed/default/expanded
- Video and audio tracks
- Time ruler with 5-second intervals
- Playhead indicator
- Preview and export buttons (UI ready)

### 🆕 Sora Video Generation (NEW)
- **Sora Orchestrator** - Automated video generation pipeline
- **Character Registration** - @username-based character consistency
- **Dynamic Aspect Ratio** - Auto-detect image ratio for optimal output
- **Smart Scene Splitting** - >15s scenes auto-split into chunks
- **Quality Control** - Mandated prompts for high-quality output
- **R2 Persistence** - Automatic upload to Cloudflare R2

### 🎵 Audio Asset Management
- Upload audio files (all formats)
- Category classification: Music / Voice / Sound Effects
- Auto-convert to Data URL for storage
- Display and delete functionality

### 🆕 User Authentication & Credits System
- **Supabase Auth Integration** - Secure user authentication
- **Three-tier Role System** - admin (free) / vip (80% off) / user (standard price)
- **Credits Management** - All AI operations consume credits
- **Auto Profile Creation** - Profile auto-created on first login
- **Session Persistence** - Cookie-based session with auto-refresh

### 🆕 Request Cancellation (AbortController)
- **Cancel AI Requests** - Stop ongoing AI operations anytime
- **Agent Mode Support** - Cancel long-running conversations
- **Clean Resource Cleanup** - Proper cleanup of network requests

### 🆕 Cloud Storage & Sync
- **Supabase Database** - PostgreSQL cloud storage for all data
- **Cloudflare R2** - Media file storage (images, videos, audio)
- **Chat History Sync** - Three-level scope (project/scene/shot)
- **Auto-sync** - Automatic data synchronization across devices

> ⚠️ Guest mode is not supported. Login is required to use all features.

---

<a name="quick-start"></a>

## 📦 Quick Start

### 1. Install Dependencies

```bash
cd finalAgent/video-agent-pro
npm install
```

### 2. Configure API Keys

Create `.env.local` file:

```env
# Gemini API (for Grid generation)
NEXT_PUBLIC_GEMINI_API_KEY=your_gemini_api_key

# Volcano Engine API
NEXT_PUBLIC_VOLCANO_API_KEY=your_volcano_api_key
NEXT_PUBLIC_VOLCANO_BASE_URL=https://ark.cn-beijing.volces.com/api/v3

# Model Endpoints (create in Volcano Engine Console)
NEXT_PUBLIC_SEEDREAM_MODEL_ID=ep-xxxxxx-xxxxx  # Image generation
NEXT_PUBLIC_SEEDANCE_MODEL_ID=ep-xxxxxx-xxxxx  # Video generation
NEXT_PUBLIC_DOUBAO_MODEL_ID=ep-xxxxxx-xxxxx    # AI conversation

# Supabase (for cloud storage and authentication)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key  # Server-side only

# Cloudflare R2 (optional, for file storage)
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=your_bucket_name
R2_PUBLIC_DOMAIN=https://your-domain.r2.dev
```

**Get API Keys:**
- **Gemini**: [Google AI Studio](https://makersuite.google.com/app/apikey)
- **Volcano Engine**: [Volcano Engine Console](https://console.volcengine.com/ark)
- **Supabase**: [Supabase Dashboard](https://app.supabase.com/) - Create a new project

### 3. Start Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

---

<a name="usage"></a>

## 🎯 Usage Guide

### Create a Project
1. Click "Create New Project" on homepage
2. Enter project name and description
3. Enter project editing page

### AI Storyboard Generation
1. Click "Script" tab in left sidebar
2. Input or paste script content
3. Click "AI Generate Storyboard"
4. AI automatically analyzes and generates scenes and shots

### Character Turnaround Generation
1. Click "Characters" tab in left sidebar
2. Click "+ Add", fill in character information
3. Enter character name, appearance, art style
4. Click "AI Generate Character Turnaround"
5. Generated image auto-added to reference library

### Grid Multi-View Generation

**Method 1: Pro Mode (Manual)**
1. Select a shot on canvas
2. Switch to "Pro" mode on right panel
3. Select "Grid Multi-View"
4. Set Grid size (2x2 or 3x3)
5. Set aspect ratio and style preset
6. Enter prompt, click "Generate Grid"
7. Manually assign slices to shots in preview modal
8. Click "Confirm Assignment"

**Method 2: Agent Mode (AI Conversation)**
1. Select shot, switch to "Agent" mode
2. Type: "Generate a grid for this shot"
3. AI automatically executes generation

### Video Generation
**Prerequisite: Shot must have Grid image**

1. Select shot with Grid image
2. Switch to "Pro" mode, select "Video Generation"
3. Enter video camera movement prompt
4. Click "Generate Video", wait 2-3 minutes

---

<a name="tech-stack"></a>

## 🛠️ Tech Stack

- **Framework**: Next.js 15.1 with App Router + Turbopack
- **Frontend**: React 19, TypeScript 5.8
- **Styling**: Tailwind CSS 3.4 (Cinema Dark theme)
- **State Management**: Zustand + Immer middleware
- **Database**: Supabase (PostgreSQL) - Cloud only, no local fallback
- **Authentication**: Supabase Auth (Email/Password + OAuth)
- **File Storage**: Cloudflare R2 (images, videos, audio)
- **AI Models**:
  - Google Gemini 3 Flash (Agent reasoning, Grid generation)
  - Volcano Engine SeeDream 4.0 (Image generation)
  - Volcano Engine SeeDance 1.0 Pro (Video generation)
  - **Sora 2** via Kaponai API (Professional video with character consistency)
  - **Jimeng** (Chinese-optimized image generation)

---

## 📂 Project Structure

```
src/
├── app/                              # Next.js App Router
│   ├── api/                          # API Routes (22+ endpoints)
│   ├── admin/                        # Admin dashboard
│   ├── auth/                         # Authentication pages
│   └── project/[id]/                 # Project editing page
├── components/                       # React components (18 directories)
│   ├── layout/                       # Layout (sidebars, panels, timeline)
│   ├── canvas/                       # Infinite canvas
│   ├── agent/                        # Agent components
│   └── chat/                         # Chat interface
├── services/                         # Business services (19+ files)
│   ├── agentService.ts               # Agent core (Function Calling)
│   ├── agentToolDefinitions.ts       # 28 Agent tools
│   ├── geminiService.ts              # Gemini Grid generation
│   ├── SoraOrchestrator.ts           # Sora video orchestration
│   ├── KaponaiService.ts             # Sora API wrapper
│   └── jimengService.ts              # Jimeng integration
├── lib/                              # Core libraries
│   ├── dataService.ts                # Unified data service (1269 lines)
│   ├── storageService.ts             # R2 file upload
│   └── auth-middleware.ts            # Authentication middleware
├── store/                            # Zustand state management
│   └── useProjectStore.ts            # Project state (674 lines)
└── types/                            # TypeScript definitions
    └── project.ts                    # Project types (512 lines)
```

---

## 📋 Pending Features

### High Priority
- Grid generation history (per scene)
- Timeline playback with sync
- Drag shots to Timeline
- Video export with audio mixing
- TTS audio generation

### Medium Priority
- Scene drag & reorder on canvas
- Timeline clip adjustment (trim, reorder)
- Payment integration for credits
- OAuth login (GitHub, Google)

For detailed feature list, see [FEATURES.md](./FEATURES.md)

---

## 📚 Documentation

- **Quick Reference for AI**: [AGENTS.md](./AGENTS.md) - Commands and best practices
- **API Architecture**: [API_ARCHITECTURE.md](./API_ARCHITECTURE.md) - API design and authentication
- **Authentication System**: [AUTHENTICATION.md](./AUTHENTICATION.md) - User auth and roles
- **Credits System**: [CREDITS_SYSTEM.md](./CREDITS_SYSTEM.md) - Credits pricing and management
- **Development Guide**: [CLAUDE.md](./CLAUDE.md) - Detailed development philosophy
- **Chat Migration**: [CHAT_STORAGE_MIGRATION.md](./CHAT_STORAGE_MIGRATION.md) - Cloud storage migration guide

---

## 🐛 Troubleshooting

### Grid Generation Failure
- Check `NEXT_PUBLIC_GEMINI_API_KEY` in `.env.local`
- Ensure network can access Google API

### Video Generation Failure
- Verify inference endpoints created in Volcano Engine Console
- Confirm endpoint_id format is correct (ep-xxxxxx-xxxxx)
- Ensure shot has Grid image

### Agent Not Responding
- Check `NEXT_PUBLIC_DOUBAO_MODEL_ID` configuration

---

<a name="deployment"></a>

## 🚀 Deployment

### Deploy to Vercel (Recommended)

Click the button below for one-click deployment:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Standed/vibe-agent-pro)

**Manual Deployment Steps**:

1. Visit [Vercel Import](https://vercel.com/new/import?s=https://github.com/Standed/vibe-agent-pro)
2. Connect your GitHub account
3. Configure environment variables (see `.env.example`)
4. Click "Deploy"

**Required Environment Variables**:
- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- R2 Storage: `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `NEXT_PUBLIC_R2_PUBLIC_URL`
- Gemini API: `GEMINI_TEXT_API_KEY`, `GEMINI_IMAGE_API_KEY`, `GEMINI_AGENT_API_KEY`
- Volcano Engine: `NEXT_PUBLIC_VOLCANO_API_KEY`, model IDs for SeeDream/SeeDance/Doubao

**Post-Deployment**:
- Auto-deploy on every push to `main` branch
- Preview deployments for PRs
- Custom domain configuration available

For detailed instructions, see [DEPLOY.md](./DEPLOY.md)

---

## 📝 Changelog

### v3.0.0 (2026-01-19)
- ✅ **Pure Cloud Architecture** - Removed guest mode, all data stored in cloud
- ✅ **28 Agent Tools** - Complete CRUD + generation + batch operations
- ✅ **Jimeng Integration** - Chinese-optimized image generation
- ✅ **Location Management** - Location reference image generation
- ✅ **Planning Mode** - Separate tool set for story conception
- ✅ **Timeline Video Sync** - Progress bar drag auto-switches shots
- ✅ **Anti-Override Sync** - Smart sync prevents overwriting user selections

### v0.6.0 (2025-12-24)
- ✅ **Sora Video Generation** - Full Sora 2 integration via Kaponai API
- ✅ **SoraOrchestrator** - Automated pipeline for character registration and video generation
- ✅ **Character Consistency** - @username-based character tracking across scenes
- ✅ **Dynamic Aspect Ratio** - Auto-detect image ratio for optimal video output
- ✅ **Smart Scene Splitting** - >15s scenes auto-split into chunks (Greedy Packing)
- ✅ **R2 Persistence** - Automatic upload to Cloudflare R2 for video storage

### v0.4.0 (2025-12-17)
- ✅ **User Authentication System** - Supabase Auth integration
- ✅ **Credits System** - Three-tier pricing (admin free, vip 80% off, user standard)
- ✅ **Request Cancellation** - AbortController support for AI requests
- ✅ **Cloud Storage** - Supabase PostgreSQL for projects and chat history
- ✅ **Chat History Sync** - Three-level scope (project/scene/shot) cloud storage

### v0.2.0 (2025-01-03)
- ✅ Character AI turnaround generation (1/3 face + 2/3 views)
- ✅ GridPreviewModal component for slice preview & manual assignment
- ✅ Pro mode Grid generation integrated with preview modal
- ✅ Audio upload functionality (music/voice/sfx)

### v0.1.0 (2025-01-03)
- ✅ Canvas zoom and pan
- ✅ Gemini API integration for Grid generation
- ✅ AI Agent conversation system (streaming output)
- ✅ AI storyboard generation (8-principle rules)
- ✅ Timeline editor

---

## 📄 License

MIT License

---

## 👨‍💻 Authors

Developed by **西羊石 Team**, assisted by Claude Code + Gemini Code.

---

**Star ⭐ this repo if you find it helpful!**
