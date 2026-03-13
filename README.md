# 🚀 Modern Real-Time Messenger

A modern, fast, and secure web messenger built on the principles of scalable, high-performance applications. This project combines strict typing, real-time interaction via WebSockets, and reliable JWT authentication.

## ✨ Key Features

- **⚡ Real-Time Core:** Instant message delivery, "Online / Offline" statuses, and "typing..." indicators powered by Socket.IO.
- **🛡️ Advanced Auth (Silent Refresh):** Utilizes short-lived Access tokens in memory (Zustand) and HTTP-Only Refresh tokens. Implements background "silent" token refreshing without dropping the active WebSocket connection.
- **📜 Cursor-based Pagination:** Infinite, smooth chat history scrolling. Instead of vulnerable timestamp-based sorting (`createdAt`), it uses secure pagination by unique message `id` to completely eliminate duplicate entries.
- **🎨 Modern Flat Design:** The UI is built using the latest **Tailwind CSS v4** (CSS-first engine). It features a soft color palette (Indigo/Slate), rounded shapes, and smart date separators ("Today", "Yesterday").
- **🔒 Type Safety:** The entire project is written in TypeScript with strict data interfaces (`Message`, `User`, `JwtPayload`) — achieving a complete zero-`any` codebase.

---

## 🛠️ Tech Stack

### Frontend
- **Framework:** [Next.js](https://nextjs.org/) (App Router)
- **UI & Styling:** [Tailwind CSS v4](https://tailwindcss.com/) (CSS-first engine), [Lucide React](https://lucide.dev/) (Icons)
- **State Management:** [Zustand](https://zustand-demo.pmnd.rs/) (Global auth state)
- **Network & Real-time:** [Axios](https://axios-http.com/) (with Interceptors), [Socket.IO Client](https://socket.io/)
- **Language:** TypeScript

### Backend
- **Framework:** [NestJS](https://nestjs.com/)
- **Database & ORM:** PostgreSQL + [Prisma](https://www.prisma.io/)
- **Real-time:** WebSockets (`@nestjs/websockets` + custom WsJwt Guards)
- **Auth:** `@nestjs/jwt`, Passport.js, HTTP-Only Cookies
- **Language:** TypeScript

---

## 🧠 Architectural Decisions

### 1. Background Token Refresh (Silent Refresh)
To prevent WebSocket connection drops caused by expired tokens (which have a 15-minute lifespan), the frontend runs a background interval that silently makes a POST request to `/auth/refresh` every 14 minutes. The newly issued token is then seamlessly injected into Zustand and the Socket client.

### 2. WebSocket Security (WsJwtGuard)
Socket connections are protected by a custom Guard. If a token is invalid during a `sendMessage` or `typing` event, the server actively rejects the payload. User connection statuses are accurately tracked via a `Map<userId, Set<socketIds>>`, ensuring that a user is only marked as "Offline" when they have closed **all** of their active browser tabs.

### 3. Optimistic UI
Outgoing messages appear on the screen instantly after the user clicks "Send", before receiving network confirmation from the database. To prevent React key conflicts during re-renders, composite temporary keys (e.g., `temp-{index}-{timestamp}`) are utilized.

---

## 🚀 Installation & Setup

### Prerequisites
- Node.js (v18+)
- PostgreSQL (or Docker for spinning up a local database)
