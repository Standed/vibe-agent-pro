# Video Agent Pro

<div align="center">

![Version](https://img.shields.io/badge/Version-0.4.0-purple?style=for-the-badge)
![Next.js](https://img.shields.io/badge/Next.js-15.5.6-black?style=for-the-badge&logo=next.js)
![React](https://img.shields.io/badge/React-19-blue?style=for-the-badge&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8.2-blue?style=for-the-badge&logo=typescript)

**AI-Powered Video Production Tool | AI 驱动的影视创作工具**

[Features (中文)](#features) | [Quick Start](#quick-start) | [Usage](#usage) | [Tech Stack](#tech-stack)

</div>

---

## 🎬 Introduction

Video Agent Pro is an AI-powered video storyboard generation and editing tool built with Next.js 15 and multiple AI models (Gemini + Volcano Engine). It provides both conversational AI and fine-grained control modes to help creators produce videos from script to final cut.

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
- **Supabase Database** - PostgreSQL cloud storage for projects
- **Chat History Sync** - Three-level scope (project/scene/shot)
- **IndexedDB Fallback** - Local storage for offline access
- **Auto-sync** - Automatic data synchronization

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

- **Framework**: Next.js 15.5.6 with App Router + Turbopack
- **Frontend**: React 19, TypeScript 5.8.2
- **Styling**: Tailwind CSS 3.4 (Cinema Dark theme)
- **State Management**: Zustand + Immer middleware
- **Database**: Supabase (PostgreSQL) + Dexie.js (IndexedDB fallback)
- **Authentication**: Supabase Auth (Email/Password + OAuth)
- **File Storage**: Cloudflare R2
- **AI Models**:
  - Google Gemini 2.0 Flash (Grid generation, text generation)
  - Volcano Engine SeeDream 4.0 (Image generation)
  - Volcano Engine SeeDance 1.0 Pro (Video generation)
  - Volcano Engine Doubao Pro (AI conversation)

---

## 📂 Project Structure

```
src/
├── app/                              # Next.js App Router
│   ├── layout.tsx                    # Root layout
│   ├── page.tsx                      # Homepage
│   ├── project/[id]/page.tsx         # Project editing page
│   └── globals.css                   # Global styles
├── components/                       # React components
│   ├── layout/                       # Layout components
│   │   ├── LeftSidebar.tsx           # Left sidebar (Script/Characters/Scenes/Audio)
│   │   ├── RightPanel.tsx            # Right panel (Agent/Pro modes)
│   │   ├── ProPanel.tsx              # Pro mode control panel
│   │   ├── AgentPanel.tsx            # Agent conversation panel
│   │   └── Timeline.tsx              # Timeline editor
│   ├── canvas/                       # Canvas components
│   │   └── InfiniteCanvas.tsx        # Infinite canvas
│   └── grid/                         # Grid components
│       └── GridPreviewModal.tsx      # Grid slice preview & assignment
├── services/                         # AI services
│   ├── geminiService.ts              # Gemini API integration
│   ├── volcanoEngineService.ts       # Volcano Engine API
│   ├── storyboardService.ts          # AI storyboard generation
│   └── agentService.ts               # AI Agent conversation
├── store/                            # Zustand state management
│   └── useProjectStore.ts            # Project state
├── types/                            # TypeScript type definitions
│   └── project.ts                    # Project types
└── lib/                              # Utility libraries
    └── db.ts                         # IndexedDB database
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

## 📝 Changelog

### v0.4.0 (2025-12-17)
- ✅ **User Authentication System** - Supabase Auth integration
- ✅ **Credits System** - Three-tier pricing (admin free, vip 80% off, user standard)
- ✅ **Request Cancellation** - AbortController support for AI requests
- ✅ **Cloud Storage** - Supabase PostgreSQL for projects and chat history
- ✅ **Chat History Sync** - Three-level scope (project/scene/shot) cloud storage
- ✅ **Auto Profile Creation** - Profile auto-created with role-based credits
- ✅ **authenticatedFetch** - Unified API client with auto authentication
- ✅ **API Gateway** - Centralized Supabase API route

### v0.2.0 (2025-01-03)
- ✅ Character AI turnaround generation (1/3 face + 2/3 views)
- ✅ GridPreviewModal component for slice preview & manual assignment
- ✅ Pro mode Grid generation integrated with preview modal
- ✅ Audio upload functionality (music/voice/sfx)
- ✅ Enhanced character, scene, audio resource management UI
- ✅ Optimized workflow: prepare assets → generate Grid → assign slices

### v0.1.0 (2025-01-03)
- ✅ Canvas zoom and pan
- ✅ Gemini API integration for Grid generation
- ✅ Volcano Engine integration for video generation
- ✅ AI Agent conversation system (streaming output)
- ✅ AI storyboard generation (8-principle rules)
- ✅ Timeline editor
- ✅ Removed all mock responses, using real AI interactions

---

## 📄 License

MIT License

---

## 👨‍💻 Authors

Developed by **西羊石 Team**, assisted by Claude Code.

Reference Projects:
- **finalAgent** - UI/UX design
- **directordeck** - Grid generation
- **long_video_gen** - Video generation workflow

---

**Star ⭐ this repo if you find it helpful!**
