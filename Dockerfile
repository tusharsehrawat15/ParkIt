FROM node:22-alpine

WORKDIR /app

# Install backend production dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# Copy backend and frontend source
COPY backend ./backend
COPY frontend ./frontend

WORKDIR /app/backend

EXPOSE 8000
CMD ["node", "index.js"]