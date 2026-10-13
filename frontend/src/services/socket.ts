/**
 * ARIA Socket.IO Client Service
 * Manages a singleton socket connection to the backend for real-time events.
 * JWT token is sent in the socket handshake so the server can authenticate
 * the connection before any events are processed.
 */

import { io, type Socket } from 'socket.io-client';
import { getToken } from './auth';

const getSocketUrl = (): string => {
  if (import.meta.env.VITE_SOCKET_URL && import.meta.env.VITE_SOCKET_URL.trim()) {
    return import.meta.env.VITE_SOCKET_URL.trim().replace(/\/+$/, '');
  }
  if (import.meta.env.VITE_API_URL && import.meta.env.VITE_API_URL.trim()) {
    return import.meta.env.VITE_API_URL.trim().replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return 'https://aria-backend-2e96.onrender.com';
  }
  return 'http://localhost:5000';
};

const SOCKET_URL = getSocketUrl();

let socket: Socket | null = null;

/** Connect to the Socket.IO server (requires a valid JWT in localStorage) */
export function connectSocket(): Socket {
  if (socket?.connected) return socket;

  const token = getToken();

  socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
    // Send JWT in the handshake so the server can authenticate at connection time
    auth: { token },
  });

  socket.on('connect', () => {
    console.log('[SOCKET.IO] Connected:', socket?.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('[SOCKET.IO] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.warn('[SOCKET.IO] Connection error:', err.message);
  });

  return socket;
}

/** Disconnect from the Socket.IO server */
export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    console.log('[SOCKET.IO] Disconnected and cleaned up.');
  }
}

/** Get the current socket instance (may be null) */
export function getSocket(): Socket | null {
  return socket;
}

/** Subscribe to incidentCreated events */
export function onIncidentCreated(callback: (data: any) => void): () => void {
  const s = socket || connectSocket();
  s.on('incidentCreated', callback);
  return () => { s.off('incidentCreated', callback); };
}

/** Subscribe to incidentResolved events */
export function onIncidentResolved(callback: (data: { incidentId: string }) => void): () => void {
  const s = socket || connectSocket();
  s.on('incidentResolved', callback);
  return () => { s.off('incidentResolved', callback); };
}
