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

## License

This project is proprietary software. All rights reserved.

Unauthorized copying, modification, distribution, or use of this software without prior permission from the owner is prohibited.
