export type AiAttachmentMimeType =
  | 'text/plain'
  | 'application/pdf'
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'image/gif'
  | 'audio/wav'
  | 'audio/mp3'
  | 'audio/mpeg'
  | 'audio/ogg'
  | 'audio/aac'
  | 'audio/flac'
  | 'audio/webm'
  | 'audio/mp4';

export interface AiAttachment {
  name: string;
  mimeType: AiAttachmentMimeType;
  text?: string;
  data?: string;
}
/**
 * Modelos de datos para la interacción con el Agente de IA en Weave.
 */

export interface GeneratedAiImage {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  data: string;
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  error?: boolean;
  images?: GeneratedAiImage[];
}

export interface DocumentContextPayload {
  title?: string;
  docType?: string;
  content?: string;
}

export interface AiChatRequest {
  attachments?: AiAttachment[];
  conversationId?: string;
  model?: string;
  editTargets?: EditTarget[];
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  documentContext?: DocumentContextPayload;
  includeDocumentContext?: boolean;
  persistHistory?: boolean;
}

export interface StoredAiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  error: boolean;
  images?: GeneratedAiImage[];
}

export interface AiHistoryPage {
  messages: StoredAiMessage[];
  hasMore: boolean;
  nextBefore: number | null;
}

export interface AiChatResponse {
  edits?: DocumentEdit[];
  images?: GeneratedAiImage[];
  reply: string;
  model: string;
  provider: string;
  timestamp: string;
  userMessage?: StoredAiMessage;
  assistantMessage?: StoredAiMessage;
}

export interface AiConversation { id: string; title: string; updatedAt: string; }
export interface EditTarget { id: string; text: string; }
export interface DocumentEdit { target: string; before: string; after: string; }
