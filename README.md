# 🌌 MirrorMessiah

MirrorMessiah is a standalone, high-fidelity media registry, transcoding pipeline, and streaming terminal built with Next.js 14 and SQLite. It provides a secure, web-based UI and a robust Python CLI for cataloging, optimizing, and streaming browser-ready media (movies, series, and subtitles).

---

## ✨ Key Capabilities

*   🎬 **Unified Cataloging**: Supports both single-entry Movies and Episodic Series with deep metadata integration (TMDB/IMDb).
*   ⚡ **High-Performance Streaming**: Fully browser-optimized 1080p MP4 compliance using H.264 video encoding, AAC audio transcoding, and `faststart` metadata placement.
*   📦 **Feature-Sliced Architecture**: Adheres strictly to isolated domain-driven design (`src/features/movie` & `src/features/series`).
*   🎯 **Intersection Observer Scrolling**: High-performance client-side catalog grids with lag-free, observer-based infinite scrolling.
*   💬 **On-the-Fly Subtitle Conversion**: Subtitle streaming proxy automatically parses and converts `.srt` files to browser-native `WebVTT` format on-the-fly.
*   🔒 **Dual-Layer Gate Security**:
    *   `GATE_KEY`: General app entry authentication.
    *   `ADMIN_KEY`: Administrative dashboards and management tools access.

---

## 📁 Directory Structure & Clean Architecture

MirrorMessiah is structured strictly according to the **Feature-Sliced Architecture** pattern:

```
├── src/
│   ├── app/                  # App Router: Routing, pages, and layouts (default exports only)
│   ├── components/           # Generic, domain-agnostic UI primitives (named exports, kebab-case)
│   │   ├── ui/               # Form elements, toggles, dropdowns
│   ├── contexts/             # Admin and Theme context providers
│   ├── features/             # Core Domain Engine (no default exports, named exports only)
│   │   ├── movie/            # Movies domain (actions, queries, components)
│   │   └── series/           # Series domain (actions, queries, components)
│   ├── lib/                  # Database connections, authentication rules, schemas
│   └── middleware.ts         # App Route routing security
├── scripts/                  # Production utility scripts
│   ├── mm.py                 # Primary MirrorMessiah CLI utility
│   ├── convert_to_web.py     # ffmpeg video/audio transcoding engine
│   └── series_cli.py         # Episodic series scanner
└── .env.example              # Sample environment template (tracked in git)
```

---

## 🛠️ Developer Setup

### 1. Installation

Install node dependencies:
```bash
npm install
```

Ensure system transcoding dependencies are installed:
```bash
# Ubuntu/Debian
sudo apt update && sudo apt install -y ffmpeg
```

### 2. Environment Configuration

Copy the example template to create a secure local environment file (this file is ignored in Git to prevent security leaks):
```bash
cp .env.example .env
```

Edit the `.env` parameters:
*   `GATE_KEY`: General access passcode.
*   `ADMIN_KEY`: Admin panel passcode.
*   `TMDB_API_KEY`: API token for movie/series metadata scraping.
*   `MEDIA_DIR`: Path to the directory where your media drives are mounted.

### 3. Registry Compilation (Database Migration)
On the initial run, migrations will automatically compile the SQLite schema and seed default tables:
```bash
npm run build
```

---

## 💻 Python CLI Registry Workflows (`scripts/mm.py`)

MirrorMessiah is managed locally using the Python CLI. All absolute directories are loaded dynamically from the environment.

*   **Status**: Check database metadata statistics (movies, files, subtitles counts).
    ```bash
    python3 scripts/mm.py status
    ```
*   **Transcode Media**: Scan a directory for non-web-compliant files (such as `.avi`, `.mkv`) and transcode them to 1080p MP4.
    ```bash
    python3 scripts/mm.py convert "/path/to/movie-folder"
    ```
*   **Ingest / Sync Directory**: Scan the media drive, discover new titles, auto-scrape details from TMDB, and link subtitles.
    ```bash
    python3 scripts/mm.py sync "/path/to/movies"
    ```
*   **Organize**: Rename directories on disk to match database-registered structures.
    ```bash
    python3 scripts/mm.py organize
    ```
*   **System Reset**: Wipe the SQLite registry database permanently.
    ```bash
    python3 scripts/mm.py reset
    ```

---

## 🔒 Security Best Practices for GitHub Pushing

To ensure zero leakage of private credentials, keys, or local directory paths before pushing to a remote repository:

1.  **Environment Variables**: All API tokens (`TMDB_API_KEY`), access passcodes (`GATE_KEY`, `ADMIN_KEY`), and local drives mount paths (`MEDIA_DIR`) reside exclusively in `.env` or `.env.local` (which are matched in `.gitignore`).
2.  **Ignored Database**: The SQLite registry file `media.db` and backup files (`*.db.bak`) are excluded in `.gitignore` to prevent media names or paths from committing to source control.
3.  **Local Path Masking**: Frontend paths are stripped dynamically using clean RegExp rules (e.g., matching the `movies/` or `series/` folder levels) to obscure the user's hard drive structure in the web interface.