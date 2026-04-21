# Media Admin Interface

A Next.js 14 admin interface for managing movie metadata in an SQLite database. This interface provides a clean, responsive web UI for editing movie information, particularly poster/thumbnail paths.

## Features

- 🎬 **Movie Management**: Browse, search, and edit movie metadata
- 🔍 **Search & Pagination**: Client-side search with responsive pagination
- 🖼️ **Poster Management**: Edit thumbnail paths with live preview
- 🔒 **Simple Authentication**: Header-based admin key authentication
- 📱 **Responsive Design**: Works on desktop and mobile devices
- 🎨 **Modern UI**: Built with Tailwind CSS and clean design principles
- 🗄️ **Dynamic Schema**: Automatically detects if thumbnail column exists

## Database Schema Support

The interface works with the following database schema:

```sql
-- Required tables
libraries(id, name, root_path, created_at)
movies(id, title, year, quality, imdb_id, tmdb_id, created_at, updated_at)
files(id, library_id, movie_id, path, size_bytes, container, added_at)

-- Optional: movies.thumbnail column (automatically detected)
-- If present: movies.thumbnail (TEXT) - editable via UI
-- If absent: thumbnail field is hidden gracefully
```

## Quick Start

### 1. Installation

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.local.example .env.local
```

### 2. Configuration

Edit `.env.local`:

```bash
# Required: Set a strong admin key
GATE_KEY=your-secret-admin-key-here

# Optional: Set base URL (defaults to http://localhost:3000)
NEXTAUTH_URL=http://localhost:3000
```

### 3. Database Setup

Ensure your `media.db` SQLite database is in the project root with the required schema.

### 4. Poster Directory

```bash
# Create poster directory (already exists)
mkdir -p public/posters
```

### 5. Run Development Server

```bash
npm run dev
```

Visit `http://localhost:3000/admin` to access the admin interface.

## Usage Guide

### Admin Dashboard

- **URL**: `/admin`
- **Features**: Admin key status, navigation, setup instructions

### Movies List

- **URL**: `/admin/movies`
- **Features**: 
  - Search movies by title, year, or quality
  - Responsive grid layout with poster previews
  - Pagination (12 movies per page)
  - Edit buttons for each movie

### Movie Editor

- **URL**: `/admin/movies/[id]`
- **Features**:
  - Edit all movie metadata fields
  - Live poster preview
  - Form validation
  - Success/error feedback
  - Admin key management

### Editable Fields

- **Title** (required): Movie display name
- **Year**: Release year (1800-2100 or null)
- **Quality**: Video quality indicator (e.g., "1080p", "4K", "BluRay")
- **IMDB ID**: IMDB identifier for external linking
- **TMDB ID**: The Movie Database identifier
- **Thumbnail**: Poster image path (if column exists)

### Thumbnail/Poster Handling

The interface supports flexible poster management:

1. **Relative Paths**: `posters/movie.jpg` → served from `/public/posters/movie.jpg`
2. **Absolute URLs**: `https://example.com/poster.jpg` → used as-is
3. **Fallback**: Missing/invalid posters show placeholder image

## API Endpoints

### GET /api/movies
Returns list of all movies with file information.

**Response:**
```json
{
  "movies": [
    {
      "id": 1,
      "title": "Movie Title",
      "year": 2023,
      "quality": "1080p",
      "imdb_id": "tt1234567",
      "tmdb_id": "12345",
      "thumbnail": "posters/movie.jpg",
      "file_path": "/path/to/movie.mp4",
      "created_at": "2023-01-01T00:00:00Z",
      "updated_at": "2023-01-01T00:00:00Z"
    }
  ],
  "total": 1
}
```

### GET /api/movies/[id]
Returns single movie by ID.

**Response:**
```json
{
  "movie": {
    "id": 1,
    "title": "Movie Title",
    "year": 2023,
    "quality": "1080p",
    "imdb_id": "tt1234567",
    "tmdb_id": "12345",
    "thumbnail": "posters/movie.jpg",
    "created_at": "2023-01-01T00:00:00Z",
    "updated_at": "2023-01-01T00:00:00Z"
  }
}
```

### PATCH /api/movies/[id]
Updates movie fields. Requires `x-admin-key` header.

**Headers:**
```
Content-Type: application/json
x-admin-key: your-admin-key
```

**Request Body:**
```json
{
  "title": "Updated Title",
  "year": 2024,
  "quality": "4K",
  "imdb_id": "tt7654321",
  "tmdb_id": "54321",
  "thumbnail": "posters/updated.jpg"
}
```

## Security Notes

⚠️ **Important**: This interface is designed for **local intranet use only**.

- Uses simple header-based authentication
- No rate limiting or advanced security features
- Admin key is stored in localStorage (client-side)
- **Do not expose to public internet without additional security measures**

## Technical Details

### Architecture

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Database**: SQLite via better-sqlite3
- **Styling**: Tailwind CSS
- **Authentication**: Environment variable + header validation

### File Structure

```
├── app/
│   ├── admin/                 # Admin pages
│   │   ├── page.tsx          # Dashboard
│   │   └── movies/           # Movie management
│   ├── api/                  # API routes
│   │   └── movies/           # Movie CRUD endpoints
│   ├── globals.css           # Global styles
│   └── layout.tsx            # Root layout
├── components/               # React components
│   ├── AdminMovieForm.tsx    # Movie edit form
│   └── MoviesList.tsx        # Movie list with search
├── lib/                      # Utilities
│   ├── auth.ts              # Authentication helpers
│   ├── db.ts                # Database connection & types
│   └── schema.ts            # Schema detection & queries
├── public/
│   ├── posters/             # Poster images directory
│   └── placeholder.svg      # Fallback poster image
└── media.db                 # SQLite database
```

### Key Features Implementation

1. **Dynamic Schema Detection**: Uses `PRAGMA table_info(movies)` to detect thumbnail column
2. **Responsive Design**: Mobile-first approach with Tailwind CSS
3. **Client-side Search**: Real-time filtering without server requests
4. **Error Handling**: Comprehensive error handling with user feedback
5. **Image Fallbacks**: Graceful handling of missing/broken poster images

## Development

### Build for Production

```bash
npm run build
npm start
```

### Linting

```bash
npm run lint
```

### Adding New Features

The codebase is structured for easy extension:

- Add new API routes in `app/api/`
- Create new pages in `app/admin/`
- Add reusable components in `components/`
- Extend database helpers in `lib/`

## Troubleshooting

### Common Issues

1. **Admin key not working**: Check `.env.local` file and restart server
2. **Database not found**: Ensure `media.db` is in project root
3. **Posters not loading**: Check file paths and `public/posters/` directory
4. **Build errors**: Run `npm install` and check TypeScript errors

### Debug Mode

Set `NODE_ENV=development` for detailed error messages and logging.

## License

This project is designed for personal/internal use. Modify and distribute as needed for your specific requirements.

---

**Security Reminder**: This interface is intended for local network use only. Implement proper authentication and security measures before exposing to external networks.