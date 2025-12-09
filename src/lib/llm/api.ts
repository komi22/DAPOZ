/**
 * LLM 챗봇 API 클라이언트
 * 
 * 기존 api.ts 패턴을 따라 구현
 */

import api from '../../utils/api'

// LLM API 응답 타입 정의
export interface ChatResponse {
  success: boolean
  answer: string
  sources?: Array<{
    technique_id?: string | null
    technique_name_kr?: string | null
    case_id?: string | null
    threat_type_kr?: string | null
  }>
  searchResult?: {
    totalResults: number
    searchMethod: string
  } | null
  error?: string
}

export interface IndexStatusResponse {
  success: boolean
  connected: boolean
  indexed: boolean
  documentCount: number
  message: string
  error?: string
}

export interface IndexRunbooksResponse {
  success: boolean
  message: string
  indexedCount: number
  collectionCount: number
  error?: string
}

export interface ChatRequest {
  question: string
  technique_id?: string
  context?: {
    technique_id?: string
    threat_type_kr?: string
    technique_name_kr?: string
    event_ids?: string[]
  }
  filters?: {
    technique_id?: string
    threat_type?: string
    event_ids?: string[]
  }
}

// LLM API
export const llmApi = {
  /**
   * 챗봇 질의응답
   * @param question - 사용자 질문
   * @param options - 추가 옵션 (technique_id, context, filters)
   * @returns Promise<ChatResponse>
   */
  chat: (question: string, options?: {
    technique_id?: string
    context?: ChatRequest['context']
    filters?: ChatRequest['filters']
  }): Promise<ChatResponse> => {
    return api.post('/llm/chat', {
      question,
      ...options
    }).then(res => res.data)
  },

  /**
   * Runbooks 인덱싱
   * @returns Promise<IndexRunbooksResponse>
   */
  indexRunbooks: (): Promise<IndexRunbooksResponse> => {
    return api.post('/llm/index-runbooks').then(res => res.data)
  },

  /**
   * 인덱싱 상태 확인
   * @returns Promise<IndexStatusResponse>
   */
  getIndexStatus: (): Promise<IndexStatusResponse> => {
    return api.get('/llm/index-status').then(res => res.data)
  },

  /**
   * 헬스 체크
   * @returns Promise<any>
   */
  health: () => {
    return api.get('/llm/health').then(res => res.data)
  }
}

