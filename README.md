# 🧭 Bhoo-Drishya — GridFS Edition

Store geotagged photos from the field and visualize them dynamically on multiple interactive base maps.

**Live demo:** https://drishya-application.onrender.com

---

## 📌 Overview

Bhoo-Drishya is a full-stack web app for collecting geotagged photos and visualizing them on an interactive map. Photos are uploaded together with a title, description, and GPS coordinates, then stored as binary data directly in **MongoDB GridFS**, with metadata queryable per user. Each account gets its own strictly isolated photo collection.

## ✨ Features

- **Account system** — sign up, sign in, forgot/reset password (via emailed or on-screen verification code), and self-service account deletion.
- **Per-user GridFS isolation** — every account gets its own `<username>.files` / `<username>.chunks` GridFS collections in MongoDB; no user can see another user's photos.
- **Three ways to set a photo's location:**
  - **EXIF auto-extraction** — GPS tags are read client-side from the image the moment it's selected.
  - **Click-to-pin** — click anywhere on the map to set coordinates.
  - **Browser geolocation** — "Use My GPS" button (note: accuracy depends on the browser/network, not true GPS).
- **Interactive Leaflet map** with 5 switchable base layers:
  - OpenStreetMap (Standard)
  - Esri World Imagery (Satellite)
  - CartoDB Dark Matter (Dark)
  - CartoDB Positron (Light)
  - OpenTopoMap (Topographic)
- **Drag-and-drop photo upload** with live preview, auto-filled title, and description field.
- **Photo gallery** — card list synced with map pins; selecting either one highlights and focuses the other.
- **Full-screen photo viewer** with GPS coordinates, file size, content type, and upload date.
- **Live MongoDB health indicator** in the header.

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 6, Tailwind CSS 4, Framer Motion (`motion`) |
| Mapping | Leaflet |
| Icons | lucide-react |
| EXIF parsing | exifreader |
| Backend | Node.js, Express 4 (served via `tsx` in dev, bundled with `esbuild` for prod) |
| Database / Storage | MongoDB + GridFS (`mongodb` driver) |
| File uploads | Multer (in-memory storage, 12 MB limit) |
| Email | Nodemailer (for password-reset codes) |

## 🚀 Getting Started

### Prerequisites

- Node.js v18+
- A MongoDB instance (local or Atlas)
- npm

### Installation

```bash
git clone https://github.com/RawatGitLab/Bhoo-Drishya-App-V1.git
cd Bhoo-Drishya-App-V1
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
MONGODB_URI=your_mongodb_connection_string
MONGODB_DB=Photos-Database
MONGODB_COLLECTION=Bhoo-Drishya-App

# Optional — enables emailing password-reset codes via Nodemailer.
# If omitted, reset codes are returned directly in the API response (dev mode).
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@Bhoo-Drishya-app.com

NODE_ENV=development
```

> ⚠️ **Security note:** `server.ts` currently contains a hardcoded fallback MongoDB connection string (used only if `MONGODB_URI` is unset) with a live username and password committed to the repository. This should be **rotated in MongoDB Atlas immediately** and removed from the source/git history — always require `MONGODB_URI` from the environment rather than falling back to an embedded credential.

### Run in development

```bash
npm run dev
```

Vite + Express run together via `tsx server.ts`. Open **http://localhost:3000**.

### Build & run in production

```bash
npm run build
npm start
```

## 📁 Project Structure

```
Bhoo-Drishya-App-V1/
├── server.ts                 # Express API: auth, health check, photo CRUD over GridFS
├── src/
│   ├── App.tsx                # App shell, state, header, lightbox, delete-account modal
│   ├── components/
│   │   ├── AuthPage.tsx        # Sign in / sign up / forgot / reset password
│   │   ├── UploadForm.tsx      # Drag-drop upload, EXIF parsing, GPS capture
│   │   ├── InteractiveMap.tsx  # Leaflet map, markers, base-layer switcher
│   │   └── PhotoGallery.tsx    # Photo card list
│   ├── data/baseMaps.ts        # Base map tile layer definitions
│   ├── types.ts                # Shared TypeScript types
│   └── main.tsx                # React entry point
├── package.json
└── vite.config.ts
```

## 🔌 API Reference

All endpoints are prefixed with `/api`.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/signup` | Create an account (`username`, `email`, `password`). Provisions per-user GridFS collections. |
| `POST` | `/auth/login` | Log in with `username` (or email) + `password`. |
| `DELETE` | `/auth/delete` | Delete the account and drop its GridFS collections (`username`). |
| `POST` | `/auth/forgot-password` | Request a 6-digit reset code for an `email`. |
| `POST` | `/auth/reset-password` | Reset password using `email`, `code`, and `newPassword`. |
| `GET` | `/health` | Returns MongoDB connection status. |
| `GET` | `/photos` | List the authenticated user's photos. Requires `x-username` header. |
| `GET` | `/photos/:id` | Stream a single photo's image bytes. |
| `POST` | `/photos` | Upload a photo (`multipart/form-data`: `photo`, `title`, `description`, `lat`, `lng`). |
| `DELETE` | `/photos/:id` | Delete a photo from GridFS. Requires `x-username` header. |

Passwords are salted and hashed server-side before storage; plaintext passwords are never persisted.

## 📸 Usage

1. **Sign up / sign in** — accounts require a username (3+ chars), a valid email, and a password (6+ chars).
2. **Upload a photo** — drag a file into the upload panel or click to browse.
3. **Set its location** — let EXIF auto-fill it, click the map, or use your browser's GPS.
4. **Publish** — the photo is stored in GridFS and instantly pinned on the map.
5. **Browse** — click a gallery card or map pin to focus on a photo; open it full-screen for details.
6. **Manage your account** — sign out anytime, or permanently delete your account and all uploaded photos from the header menu.

## 🤝 Contributing

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/AmazingFeature`.
3. Commit your changes: `git commit -m 'Add AmazingFeature'`.
4. Push to the branch: `git push origin feature/AmazingFeature`.
5. Open a Pull Request.

## 🐛 Issues

Found a bug or have a feature request? Please open an issue on the [GitHub Issues page](https://github.com/RawatGitLab/Bhoo-Drishya-App-V1/issues).

## 📝 License

This project is licensed under the MIT License — see the `LICENSE` file for details.

## 🙏 Acknowledgments

- [Leaflet](https://leafletjs.com/) and the OpenStreetMap, Esri, CARTO, and OpenTopoMap tile providers.
- [MongoDB GridFS](https://www.mongodb.com/docs/manual/core/gridfs/) for binary file storage.
- All contributors and testers.
