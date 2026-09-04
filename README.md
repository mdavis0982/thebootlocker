# The Boot Locker

A small catalogue website for browsing football boots and enquiring through
Instagram. Payments are arranged separately; this project does not process
payments.

## What the first version does

- Shows products and their price, size, condition, image, and status.
- Opens The Boot Locker's Instagram page with an enquiry message copied.
- Gives the owner a password-protected admin area.
- Lets the owner add products, delete them, and set them as Available,
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

## Product images

For this first version, the admin pastes a public image URL. Render's local
filesystem is temporary, so uploaded files should not be saved directly on the
web server. A proper image-upload service can be added after the demonstration.

## Important files

- `server.js` — API, admin authentication, and PostgreSQL queries.
- `public/index.html` — current Version 2 storefront.
- `public/styles.css` — Version 2 styling.
- `public/app.js` — Version 2 catalogue and admin behaviour.
- `public/version-1.html` and `public/version-1.js` — original design backup.
- `render.yaml` — Render deployment configuration.
- `.env.example` — example environment variables with no real secrets.
