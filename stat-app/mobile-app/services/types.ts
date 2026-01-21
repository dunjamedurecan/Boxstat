export interface WSMessage {
  type: 'identified' | 'scan-ok' | 'session-end' | 'start-session' | 'end-session' | 'data-msg' | 'scan' | 'measurement' | 'error'|'data-req';
  userId?: string; // For user-related messages
  bagid?: number; // For bag-related messages
  success?: boolean;
  message?: string;
  data?: any; // Additional data payload (e.g., session, scan data, measurements)
  [key: string]: any;
}