/**
 * 위협 개선 리포팅 챗봇 컴포넌트
 * 팝업/모달 형태의 RAG 기반 LLM 챗봇
 */

import React, { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, Loader2, Bot, User } from 'lucide-react'
import { llmApi, ChatResponse } from '../lib/llm/api'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  sources?: ChatResponse['sources']
}

interface ThreatChatbotProps {
  /** 모달 열림/닫힘 상태 */
  isOpen: boolean
  /** 모달 닫기 핸들러 */
  onClose: () => void
  /** 현재 선택된 위협 정보 (선택사항) */
  selectedThreat?: {
    technique_id?: string
    threat_type?: string
    threat_type_kr?: string
    technique_name_kr?: string
    event_ids?: string[]
  } | null
}

const ThreatChatbot: React.FC<ThreatChatbotProps> = ({
  isOpen,
  onClose,
  selectedThreat = null
}) => {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const welcomeMessage: Message = {
        id: 'welcome',
        role: 'assistant',
        content: selectedThreat
          ? `안녕하세요! ${selectedThreat.technique_name_kr || selectedThreat.technique_id || '이 위협'}에 대한 개선 방안에 대해 질문해주세요. MITRE ATT&CK 기반 위협 개선 runbook을 참고하여 답변드리겠습니다.`
          : '안녕하세요! 보안 위협 개선에 대해 궁금한 점이 있으시면 언제든지 질문해주세요. MITRE ATT&CK 기반 위협 개선 방안에 대해 도움을 드릴 수 있습니다.',
        timestamp: new Date()
      }
      setMessages([welcomeMessage])
    }
  }, [isOpen, selectedThreat])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)
    setError(null)

    try {
      const response = await llmApi.chat(userMessage.content, {
        technique_id: selectedThreat?.technique_id,
        context: selectedThreat ? {
          technique_id: selectedThreat.technique_id,
          threat_type_kr: selectedThreat.threat_type_kr,
          technique_name_kr: selectedThreat.technique_name_kr,
          event_ids: selectedThreat.event_ids
        } : undefined
      })

      if (response.success) {
        const assistantMessage: Message = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: response.answer,
          timestamp: new Date(),
          sources: response.sources
        }
        setMessages(prev => [...prev, assistantMessage])
      } else {
        throw new Error(response.error || '답변 생성에 실패했습니다.')
      }
    } catch (err: any) {
      console.error('챗봇 오류:', err)
      setError(err.message || '답변 생성 중 오류가 발생했습니다.')
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: '죄송합니다. 답변 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const exampleQuestions = [
    'T1003 자격증명덤프에 대한 상세 개선 방안 알려줘',
    'T1098 계정 조작 방어 방법',
    '자격 증명 덤프 공격 설정 방법',
    'T1003 로그 판단 근거 알려줘'
  ]

  const handleExampleClick = (example: string) => {
    setInput(example)
    inputRef.current?.focus()
  }

  if (!isOpen) return null

  return (
    <>
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-50"
        onClick={onClose}
      >
        <div
          className="fixed bottom-6 right-6 bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col z-50"
          style={{ height: 'calc(100vh - 6rem)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-t-xl">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <Bot className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">위협 개선 AI 챗봇</h3>
                <p className="text-xs text-white/80">MITRE ATT&CK 기반 개선 방안 질의응답</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {selectedThreat && (
            <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100">
              <div className="flex items-center space-x-2 text-sm">
                <span className="text-indigo-700 font-semibold">현재 위협:</span>
                <span className="text-indigo-900">
                  {selectedThreat.technique_id && `MITRE ${selectedThreat.technique_id}`}
                  {selectedThreat.technique_name_kr && ` - ${selectedThreat.technique_name_kr}`}
                </span>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`flex items-start space-x-2 max-w-[80%] ${
                    message.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      message.role === 'user'
                        ? 'bg-purple-600'
                        : 'bg-indigo-100'
                    }`}
                  >
                    {message.role === 'user' ? (
                      <User className="w-4 h-4 text-white" />
                    ) : (
                      <Bot className="w-4 h-4 text-indigo-600" />
                    )}
                  </div>

                  <div
                    className={`rounded-lg px-4 py-2 ${
                      message.role === 'user'
                        ? 'bg-purple-600 text-white'
                        : 'bg-white border border-gray-200 text-gray-900'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">
                      {message.content}
                    </p>

                    <p
                      className={`text-xs mt-1 ${
                        message.role === 'user' ? 'text-purple-100' : 'text-gray-400'
                      }`}
                    >
                      {message.timestamp.toLocaleTimeString('ko-KR', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="flex items-start space-x-2 max-w-[80%]">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg px-4 py-2">
                    <div className="flex items-center space-x-2">
                      <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                      <span className="text-sm text-gray-500">답변 생성 중...</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
            <p className="text-xs text-gray-600 mb-2 font-medium">질문 예시:</p>
            <div className="flex flex-wrap gap-2">
              {exampleQuestions.map((example, idx) => (
                <button
                  key={idx}
                  onClick={() => handleExampleClick(example)}
                  className="text-xs px-3 py-1.5 bg-white border border-gray-300 rounded-lg hover:bg-purple-50 hover:border-purple-300 hover:text-purple-700 transition-colors text-gray-700"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 border-t border-gray-200 bg-white rounded-b-xl">
            <div className="flex items-end space-x-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="위협 개선에 대해 질문해주세요..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                rows={2}
                disabled={isLoading}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Shift + Enter로 줄바꿈, Enter로 전송
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

export default ThreatChatbot

