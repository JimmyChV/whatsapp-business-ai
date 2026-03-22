import { io } from 'socket.io-client';

export const createSocketClient = (apiUrl = '', socketAuthToken = '') => io(apiUrl, {
  autoConnect: false,
  auth: socketAuthToken ? { token: socketAuthToken } : undefined
});
