# MirrorMessiah - Project Baseline

## Overview
MirrorMessiah is a standalone, high-fidelity media registry and streaming terminal.

## Architecture
- **Framework**: Next.js 14 (App Router)
- **Database**: SQLite (via better-sqlite3)
- **Design System**: Thrumaforge Clean Architecture (Feature-based)
- **Compliance**: STRICT 1080p MP4 (Browser optimized)
- **Security**: JWT-based session management via The Gate

## Core Commands (Python CLI)
The project is managed via the unified CLI at \`cli/messiah.py\`.

- **Full Re-seed**: \`python3 cli/messiah.py full --root /path/to/movies\`
- **Update Registry**: \`python3 cli/messiah.py scan --root /path/to/movies\`
- **Cleanup Duplicates**: \`python3 cli/messiah.py cleanup\`
- **Sync Assets**: \`python3 cli/messiah.py sync\`
- **Reset System**: \`python3 cli/messiah.py reset\`

## Environment
- **GATE_KEY**: Managed via \`.env.local\`
- **Asset Proxy**: Serves linked posters directly from movie directories
