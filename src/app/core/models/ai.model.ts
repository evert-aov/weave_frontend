/**
 * Modelos de datos para la interacción con el Agente de IA en Weave.
 */

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  error?: boolean;
}

export interface DocumentContextPayload {
  title?: string;
  docType?: string;
  content?: string;
}

export interface AiChatRequest {
  conversationId?: string;
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
}

export interface AiHistoryPage {
  messages: StoredAiMessage[];
  hasMore: boolean;
  nextBefore: number | null;
}

export interface AiChatResponse {
  edits?: DocumentEdit[];
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
