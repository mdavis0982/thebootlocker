# The Boot Locker

A small catalogue website for browsing football boots and enquiring through
Instagram. Payments are arranged separately; this project does not process
payments.

## What the first version does

- Shows products with price, size, condition notes, a photo gallery, and status.
- Opens The Boot Locker's Instagram page with an enquiry message copied.
- Gives the owner a password-protected admin area.
- Lets the owner add and edit products, delete them, and set them as Available,
  Reserved, or Sold.
- Stores product data in PostgreSQL.
- Serves the website and API from one Node.js service.

## How the database connection works

The database address and password do **not** belong in GitHub. Render supplies
the private address to the app through an environment variable named
`DATABASE_URL`.

The server creates the `products` table automatically when it starts. You do
not need to paste SQL into the Render dashboard.

## Deploy on Render

The repository includes a `render.yaml` Blueprint that describes the website
and PostgreSQL database.

1. Push this project to GitHub.
2. In Render, choose **New > Blueprint**.
3. Connect the GitHub repository.
4. Render will read `render.yaml` and propose one web service and one database.
5. Enter private values for `ADMIN_USER` and `ADMIN_PASSWORD` when prompted.
6. Create the services and wait for the first deployment.

Render generates `ADMIN_TOKEN_SECRET` and connects `DATABASE_URL`
automatically. Never commit the real admin password or database URL.

The free Render web service sleeps after a period of inactivity, so the first
page load can be slow. Free Render PostgreSQL databases are temporary and are
appropriate for this demonstration, not permanent shop data.

## Run locally

You need Node.js 18 or newer and a local PostgreSQL database.

1. Copy `.env.example` to `.env`.
2. Change the values in `.env` to match your local PostgreSQL database.
3. Set a long admin password and a random secret of at least 32 characters.
4. Run `npm install`.
5. Run `npm test` to check the important API and login behaviour.
6. Run `npm start`.
7. Open <http://localhost:3000>.

The `.env` file is ignored by Git.

## Storefront versions

After starting the app locally:

- Current Version 2 homepage: <http://localhost:3000/>
- Original Version 1 design: <http://localhost:3000/version-1.html>

Version 2 is the main storefront. Version 1 remains available as a backup and
for comparison.

## Product photos and editing

The stock manager lets the owner select existing photos from a phone's photo
library or a computer's file picker. It does not request camera access. Select up
to 8 JPG, PNG, WebP, HEIC or HEIF photos, with a maximum of 10 MB per photo.
Browser/OS photo pickers may still offer their own camera option.

Photos are previewed before saving. Use **Make cover** to choose the catalogue
image, or **Remove** to take a photo out of the listing. Add written description
and condition notes, then save. **Edit** loads a listing's existing details and
photos; saving preserves its Available/Reserved/Sold status.

Uploads occur when the listing is saved, one at a time. If an upload fails, the
form retains its text and photos in the current tab; retrying skips photos that
already uploaded successfully. Drafts do not survive closing/reloading the page.
Saving is disabled while a request is in progress to prevent double clicks.

### Connect Cloudinary in Render

1. Create a Cloudinary account and locate its cloud name, API key and API secret.
2. In the Render web service's **Environment** settings, add:
   - `CLOUDINARY_CLOUD_NAME`
   - `CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`
3. Save the environment settings and deploy the branch containing this feature.
4. Refresh the site, sign in to Admin and check that the photo picker is enabled.
5. Select a real photo, save a listing, refresh and verify the photo is still
   present. Also test a HEIC photo from the owner's actual phone if used.

Keep credentials in Render's environment settings or a local ignored `.env`.
Never put them in the frontend, GitHub or chat. No unsigned upload preset is
needed: the authenticated server uploads to Cloudinary using the Node SDK.
See [Cloudinary's Node upload documentation](https://cloudinary.com/documentation/node_image_and_video_upload).

Credentials are optional at startup. Until all three are configured, photo
selection is disabled and the stock manager explains that uploads are not yet
connected. Existing product images, editing and the catalogue still work.

Uploads are limited to administrators and rate-limited. The server checks file
signatures and size, then Cloudinary decodes the image, converts it to JPEG and
limits its dimensions to 2000 × 2000. Some browsers cannot preview HEIC locally;
these show a placeholder until uploaded. Photos are public product images.
Files pass through server memory and are not written to Render's temporary disk.

Removing a photo or deleting a listing removes its database reference, but **does
not delete the original Cloudinary asset**. Cancelled/failed listings may also
leave uploaded assets there. Keep an eye on usage and remove unused assets in
Cloudinary only after checking they aren't used by another listing. This avoids
accidentally destroying shared photos.

### Database upgrade and verification

Startup adds `images` (JSONB) and `description` columns without dropping existing
data, and copies each legacy `image_url` into its gallery. The first gallery
photo is also kept in `image_url` for Version 1 compatibility. Re-running the
upgrade preserves existing galleries and status. Take a database backup before
deploying schema changes to a shop with real inventory.

`npm test` covers the API, migrations and persistence using an in-memory
PostgreSQL engine (PGlite), plus form behaviour using jsdom. Photo provider calls
are simulated: these tests do not verify Cloudinary credentials, account quotas
or real HEIC conversion. Perform the live upload check above after configuration.

For a disposable local browser preview, run `npm run preview:admin`, then open
<http://127.0.0.1:3100> and sign in with `preview` / `preview-only`. This preview
binds to localhost, uses its own in-memory database and photo storage, and sends
no requests to Cloudinary or the real database. Everything resets when stopped.
Its photo storage does not perform Cloudinary's format conversion. Never deploy
this preview command; the production start command remains `npm start`.

## Important files

- `server.js` — API, admin authentication, and PostgreSQL queries.
- `media.js` — authenticated photo-upload parsing, validation and Cloudinary storage.
- `public/index.html` — current Version 2 storefront.
- `public/styles.css` — Version 2 styling.
- `public/app.js` — Version 2 catalogue and admin behaviour.
- `public/version-1.html` and `public/version-1.js` — original design backup.
- `render.yaml` — Render deployment configuration.
- `.env.example` — example environment variables with no real secrets.
