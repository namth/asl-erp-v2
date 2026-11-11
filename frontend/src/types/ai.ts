export interface AiSuggestedAction {
  label: string;
  action_url: string;
}

export interface AiChatRequest {
  message: string;
  session_id: string;
}

export interface AiChatResponse {
  response_text: string;
  suggested_actions?: AiSuggestedAction[];
}

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  text?: string;
  content?: string;
  response_text?: string;
  suggested_actions?: AiSuggestedAction[];
  isError?: boolean;
  isPending?: boolean;
  timestamp?: string | number;
}
