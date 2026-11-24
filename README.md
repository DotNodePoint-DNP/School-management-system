# School Management System

A standalone school management system designed to manage academic, administrative, and financial operations for a school. The project uses a pnpm monorepo containing a Next.js frontend and a NestJS backend.

**Status**: Under development.

## Tech Stack

| Category         | Technology                  |
| ---------------- | --------------------------- |
| Frontend         | Next.js, React, TypeScript  |
| Backend          | NestJS, Node.js, TypeScript |
| Styling          | Tailwind CSS                |
| State Management | Zustand      |
| Data Fetching    | TanStack Query              |
| Form Validation  | React Hook Form, Zod        |
| Package Manager  | pnpm                        |
| Monorepo         | pnpm Workspaces             |
| Version Control  | Git, GitHub                 |

## Project Structure

```text
school-management-system/
├── web/                  # Next.js frontend
├── api/                  # NestJS backend
├── package.json          # Root scripts
├── pnpm-workspace.yaml   # Workspace configuration
├── pnpm-lock.yaml        # Dependency lockfile
├── .gitignore
└── README.md
```

## Prerequisites

- Node.js
- pnpm

## Getting Started

### 1. Install dependencies

From the project root, run:

```bash
pnpm install
```

### 2. Start development servers

Run both applications:

```bash
pnpm dev
```

Or start them separately in different terminals:

```bash
pnpm dev:web
```

```bash
pnpm dev:api
```

## Available Commands

| Command          | Description                         |
| ---------------- | ----------------------------------- |
| `pnpm install`   | Install dependencies                |
| `pnpm dev`       | Start frontend and backend together |
| `pnpm dev:web`   | Start the frontend                  |
| `pnpm dev:api`   | Start the backend                   |
| `pnpm build:web` | Build the frontend                  |
| `pnpm build:api` | Build the backend                   |

## Development URLs

- **Frontend:** http://localhost:3000
- **Backend:** http://localhost:3001

The backend URL assumes NestJS is configured to use port `3001`.

## Public school website

### CMS API

The CMS routes use the existing `/api/v1` prefix and response envelope. Public routes are under `/public/website`. Admin routes are under `/admin/website` and require a bearer token with `school:manage`.

| Resource | Public routes | Admin routes relative to the resource |
| --- | --- | --- |
| `entries` | `GET /entries?section=home` (also about, academics and facilities) | List, detail, create, edit, publish, delete |
| `notices` | `GET /notices?category=exam&page=1&limit=20`, `GET /notices/:slug` | List, detail, create, edit, publish, delete |
| `events` | `GET /events?filter=upcoming` or `past`, `GET /events/:slug` | List, detail, create, edit, publish, delete |
| `gallery` | `GET /gallery`, `GET /gallery/:slug` (with ordered photos) | List, detail, create, edit, publish, delete |
| `careers` | `GET /careers`, `GET /careers/:slug`, `POST /careers/:slug/apply` | List, detail, create, edit, publish, delete |
| `job-applications`, `contact-submissions` | Contact form uses `POST /contact` | `GET /`, `GET /:id`, `PATCH /:id/status` |

For each publishable resource, use `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `PATCH /:id/publish` with `{"published": true}` or `false`, and `DELETE /:id`. Admin lists and the public notice list accept `page` and `limit` (maximum 100). Slugs stay stable when titles change. Events in progress appear under upcoming events. Career deadlines are inclusive through midnight in Nepal.

Gallery batches use `POST /gallery/:id/photos` with `{"photos":[{"imageUrl":"https://example.org/photo.jpg","altText":"Science exhibition"}]}`. Use `PATCH /gallery/:id/photos/reorder` with the complete ordered `photoIds` array, or `DELETE /gallery/:id/photos` with the IDs to remove.

Send website images (JPEG/PNG) and PDFs as multipart field `file` to `POST /admin/website/files` under the API prefix. The response includes an API-relative public URL. Resolve it against the backend origin when serving the site from another host. Applications take a candidate-provided HTTPS `resumeUrl` alongside `fullName`, `email`, `phone` and optional `coverLetter`. The contact form requires `fullName`, `phone` and `message`. Leave its hidden `website` field empty. Both public submission endpoints allow five requests per IP per minute.

Run `pnpm --filter api seed:website` to insert the sample website content independently of ERP users and roles. Repeated runs preserve edited content. The standard Prisma seed includes the same samples.

### Website dashboard and public pages

Open `/dashboard/website` under Administration with the `school:manage` permission to edit content, publish drafts, manage albums and review submissions. The first published Home section in display order supplies the homepage headline, introduction and photo. The homepage also highlights About, Academics, pinned notices, upcoming events and gallery albums. Successful dashboard saves expire the corresponding public fetch tag.

Visitors can send general or admission inquiries at `/contact` and apply from a vacancy detail page using an HTTPS résumé link. Event times use Nepal time. School identity comes from the ERP profile, and Academics lists active classes.

### Earlier website API

All website API paths below are relative to `/api/v1/website`.

| Method and path | Access | Purpose |
| --- | --- | --- |
| `GET /profile` | Public | School name, tagline, location, email and establishment date |
| `GET /classes` | Public | Active class names in school order |
| `GET /sections/:section` | Public | Published entries, newest first |
| `GET /manage/:section` | `school:manage` | Published entries and drafts |
| `POST /entries` | `school:manage` | Create an entry |
| `PUT /entries/:id` | `school:manage` | Replace an entry or return it to draft |

Section keys are `home`, `about`, `academics`, `facilities`, `notices`, `events`, `gallery` and `careers`. Both list endpoints accept `page` and `pageSize` and return pagination in `meta`.

Send an authenticated request with a JSON body such as the following to create a draft. To publish it, send the full entry fields to `PUT /entries/:id` with `published` set to `true`. Setting it to `false` withdraws it. Gallery entries require an HTTPS `imageUrl`. Every image requires `imageAlt`. An optional `displayDate` uses `YYYY-MM-DD` for a notice date, event date or vacancy closing date.

```json
{
  "section": "notices",
  "title": "School office hours",
  "body": "Contact the school office for visiting hours.",
  "published": false
}
```

## License

This project is proprietary software. All rights reserved.

Unauthorized copying, modification, distribution, or use of this software without prior permission from the owner is prohibited.
