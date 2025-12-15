/**
 * LLM 챗봇 서비스
 * RAG 기반 질의응답을 제공하는 모듈
 * 
 * 공식 문서 참고:
 * - LangChain Chains: https://js.langchain.com/docs/modules/chains/
 * - RetrievalQAChain: https://js.langchain.com/docs/modules/chains/popular/vector_db_qa
 * - ChatOpenAI: https://js.langchain.com/docs/integrations/llms/openai
 * - Prompt Templates: https://js.langchain.com/docs/modules/prompts/prompt_templates/
 */

require('dotenv').config()
const { ChatOpenAI } = require('@langchain/openai')
const { PromptTemplate } = require('@langchain/core/prompts')
const { StringOutputParser } = require('@langchain/core/output_parsers')
const {
  searchRelevantDocuments,
  formatSearchResultsAsContext
} = require('./ragService.cjs')

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

if (!OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY 환경 변수가 설정되지 않았습니다.')
}

const llm = new ChatOpenAI({
  openAIApiKey: OPENAI_API_KEY,
  modelName: 'gpt-4o',
  temperature: 0.3,
  maxTokens: 1500
})

const SYSTEM_PROMPT_TEMPLATE = `당신은 MITRE ATT&CK 프레임워크 기반 보안 위협 개선 전문가입니다.

## 전문 분야 및 우선순위
당신은 **주로 다음 주제에 대해 전문적으로** 답변합니다:
- MITRE ATT&CK 기반 위협 분석 및 대응
- 보안 위협 개선 방안 및 정책 설정
- Windows 이벤트 로그 기반 위협 탐지
- 보안 대책 및 단계별 설정 방법
- 위협 시나리오 및 로그 판단 근거

## 답변 규칙 및 우선순위
1. **전문 분야 질문 (최우선)**: 위의 도메인 범위와 관련된 질문에는 컨텍스트 정보를 기반으로 정확하고 상세하게 답변하세요.
   - 컨텍스트 정보가 있으면 반드시 컨텍스트의 내용만 사용하여 답변하세요
   - 컨텍스트에 있는 구체적인 내용을 그대로 인용하여 답변하세요
   - 컨텍스트가 "관련 문서를 찾을 수 없습니다"이면 "제공된 runbook에서 해당 정보를 찾을 수 없습니다"라고 답변하세요

2. **일반 질문 (제한적 답변)**: 전문 분야가 아닌 질문에도 가능한 범위에서 도움을 드리되, 간단하고 정중하게 답변하세요.
   - 일반 지식을 활용하여 간단히 답변할 수 있습니다
   - 가능하면 보안이나 기술과의 연관성을 언급하세요
   - 단, 다음 주제는 피하세요: 정치, 종교, 개인적인 의견을 요구하는 질문, 불법적이거나 비윤리적인 내용

3. **컨텍스트 활용 규칙**:
   - 컨텍스트 정보가 있고 질문이 전문 분야와 관련되면: 반드시 컨텍스트만 사용하여 답변
   - 컨텍스트 정보가 없거나 질문이 일반 질문이면: 일반 지식으로 간단히 답변 가능

## 컨텍스트 정보
다음은 MITRE ATT&CK 기반 위협 개선 runbook입니다:
{context}

## 전문 분야 질문에 대한 절대 준수 사항
전문 분야 질문에 답변할 때는 반드시 다음을 지키세요:
1. **컨텍스트 정보가 있으면**: 오직 컨텍스트 정보만 사용하여 답변하세요. 일반 지식, 학습된 정보, 추측 모두 금지입니다.
2. **컨텍스트에 없는 내용은 절대 사용하지 마세요**
3. **컨텍스트가 "관련 문서를 찾을 수 없습니다"이면**: "제공된 runbook에서 해당 정보를 찾을 수 없습니다"라고만 답변하세요
4. **컨텍스트에 질문과 관련된 정보가 없으면**: "제공된 runbook에 해당 정보가 없습니다"라고만 답변하세요
5. **답변의 모든 내용은 반드시 위의 컨텍스트에서 직접 가져온 정보여야 합니다**
6. **만약 컨텍스트에 질문과 관련된 구체적인 정보가 없다면**: 일반적인 보안 대책을 제시하지 말고 "제공된 runbook에 해당 정보가 없습니다"라고만 답변하세요

## 답변 형식 및 우선순위
1. **"상세 방안", "설정 방법", "어떻게" 등의 질문이면**:
   - 반드시 "단계별 설정 방법" 섹션의 내용을 우선적으로 사용하세요
   - 각 단계의 title과 details를 그대로 인용하여 답변하세요
   - 예: "gpedit.msc를 열어 컴퓨터 구성 → 관리 템플릿 → 시스템 → 로컬 보안 기관에서 LSA Protection을 '사용'으로 설정해 LSASS 메모리 접근을 차단한다"와 같은 구체적인 내용을 그대로 제공하세요

2. **일반적인 개선 방안 질문이면**:
   - "보안 대책 및 개선 방안" 섹션을 먼저 제공하세요
   - 그 다음 "단계별 설정 방법" 섹션을 추가로 제공하세요

3. **모든 답변에서**:
   - 컨텍스트에 있는 구체적인 내용을 그대로 사용하세요
   - 컨텍스트의 섹션 제목, 단계별 설정 방법, 정책 방향 등을 그대로 인용하세요
   - 한국어로 답변하세요
   - 답변은 전문적이면서도 이해하기 쉽게 작성하세요
   - 컨텍스트에 "단계별 설정 방법" 섹션이 있으면 반드시 포함하세요

## 답변 형식 규칙 (중요)
- 절대 마크다운 문법을 사용하지 마세요
- 제목 마크다운(###, ##, #) 사용 금지
- 굵게 마크다운(**, __) 사용 금지
- 기울임 마크다운(*, _) 사용 금지
- 코드 마크다운(백틱) 사용 금지
- 순수한 텍스트로만 답변하세요
- 번호나 항목을 나열할 때는 "1.", "2." 같은 숫자만 사용하세요
- 제목이나 강조가 필요하면 줄바꿈과 들여쓰기만 사용하세요`

const USER_PROMPT_TEMPLATE = `질문: {question}

답변 규칙:
1. 질문이 MITRE ATT&CK 기반 위협 개선과 관련된 전문 분야 질문이면:
   - 컨텍스트 정보가 있으면 반드시 컨텍스트에서만 답변을 찾아서 작성하세요
   - 컨텍스트에 없는 내용은 절대 사용하지 마세요
   - "상세 방안", "설정 방법", "어떻게" 등의 질문이면 컨텍스트의 "단계별 설정 방법" 섹션을 반드시 우선적으로 사용하여 구체적인 단계를 그대로 제공하세요
   - 컨텍스트가 "관련 문서를 찾을 수 없습니다"이면 "제공된 runbook에서 해당 정보를 찾을 수 없습니다"라고 답변하세요

2. 질문이 일반 질문이면:
   - 일반 지식을 활용하여 간단하고 정중하게 답변할 수 있습니다
   - 가능하면 보안이나 기술과의 연관성을 언급하세요

중요: 답변은 순수한 텍스트로만 작성하세요. 마크다운 문법(제목, 굵게, 기울임, 코드 등)을 절대 사용하지 마세요.

답변:`

const systemPromptTemplate = PromptTemplate.fromTemplate(SYSTEM_PROMPT_TEMPLATE)
const userPromptTemplate = PromptTemplate.fromTemplate(USER_PROMPT_TEMPLATE)
const outputParser = new StringOutputParser()

/**
 * 마크다운 문법 제거
 * 챗봇 UI에서 마크다운이 그대로 표시되지 않도록 제거
 * @param {string} text - 마크다운이 포함된 텍스트
 * @returns {string} 마크다운이 제거된 텍스트
 */
function removeMarkdown(text) {
  if (!text) return text

  let cleaned = text

  cleaned = cleaned.replace(/^#{1,6}\s+/gm, '')
  cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1')
  cleaned = cleaned.replace(/__(.+?)__/g, '$1')
  cleaned = cleaned.replace(/\*(.+?)\*/g, '$1')
  cleaned = cleaned.replace(/_(.+?)_/g, '$1')
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1')
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '')
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
  cleaned = cleaned.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '')
  cleaned = cleaned.replace(/^[\s]*[-*+]\s+/gm, '')
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')

  return cleaned.trim()
}

/**
 * RAG 기반 챗봇 답변 생성
 * @param {string} question - 사용자 질문
 * @param {Object} options - 옵션
 * @param {Object} options.context - 현재 위협 컨텍스트 (technique_id, threat_type 등)
 * @param {Object} options.filters - 메타데이터 필터
 * @param {number} options.k - 검색할 문서 수 (기본값: 5)
 * @param {boolean} options.useMMR - MMR 검색 사용 여부 (기본값: true)
 * @returns {Promise<Object>} 답변 및 관련 정보
 */
async function generateAnswer(question, options = {}) {
  const {
    context = null,
    filters = null,
    k = 5,
    useMMR = false
  } = options

  try {
    console.log(`🔍 질문 검색 시작: "${question}"`)
    const searchResult = await searchRelevantDocuments(question, {
      k,
      context,
      filters,
      useMMR
    })

    // 검색 결과가 없어도 LLM에 전달하여 질문 유형을 판단하고 답변하도록 함
    let contextText = ''
    let sources = []
    
    if (searchResult && searchResult.results.length > 0) {
      contextText = formatSearchResultsAsContext(searchResult)
      sources = searchResult.results.map(result => ({
        technique_id: result.metadata.technique_id || null,
        technique_name_kr: result.metadata.technique_name_kr || null,
        case_id: result.metadata.case_id || null,
        threat_type_kr: result.metadata.threat_type_kr || null
      }))
    } else {
      // 검색 결과가 없으면 빈 컨텍스트로 설정 (LLM이 일반 질문으로 판단)
      contextText = '관련 문서를 찾을 수 없습니다.'
      console.log('⚠️ 검색 결과가 없습니다. LLM이 질문 유형을 판단하여 답변합니다.')
    }
    
    // 컨텍스트가 비어있거나 "관련 문서를 찾을 수 없습니다"인 경우도 LLM에 전달
    // (LLM이 전문 분야 질문인지 일반 질문인지 판단하여 적절히 답변)

    const systemPrompt = await systemPromptTemplate.format({
      context: contextText
    })

    const userPrompt = await userPromptTemplate.format({
      question: question
    })

    console.log(`🤖 LLM 답변 생성 시작...`)
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]

    const response = await llm.invoke(messages)
    let answer = await outputParser.parse(response.content)
    answer = removeMarkdown(answer)

    console.log(`✓ 답변 생성 완료`)

    return {
      answer,
      sources,
      searchResult: searchResult ? {
        totalResults: searchResult.totalResults,
        searchMethod: searchResult.searchMethod
      } : null
    }
  } catch (error) {
    console.error('❌ 답변 생성 실패:', error)
    throw error
  }
}

/**
 * 특정 Technique ID에 대한 질문 처리
 * @param {string} question - 사용자 질문
 * @param {string} techniqueId - MITRE Technique ID (예: "T1003")
 * @returns {Promise<Object>} 답변 및 관련 정보
 */
async function generateAnswerForTechnique(question, techniqueId) {
  return generateAnswer(question, {
    filters: {
      technique_id: techniqueId
    },
    k: 3,
    useMMR: false
  })
}

/**
 * 대화 히스토리를 고려한 답변 생성 (향후 확장용)
 * @param {string} question - 사용자 질문
 * @param {Array} conversationHistory - 대화 히스토리 (선택사항)
 * @param {Object} options - 추가 옵션
 * @returns {Promise<Object>} 답변 및 관련 정보
 */
async function generateAnswerWithHistory(question, conversationHistory = [], options = {}) {
  return generateAnswer(question, options)
}

/**
 * 질문이 도메인 범위 내에 있는지 검증
 * MITRE ATT&CK 위협 개선 관련 질문인지 확인
 * @param {string} question - 사용자 질문
 * @returns {boolean} 도메인 관련 질문 여부
 */
function isDomainRelatedQuestion(question) {
  const domainKeywords = [
    /mitre|attack|technique|t\d{4}/i,
    /위협|threat|공격|attack/i,
    /보안|security|대책|방안|정책|policy/i,
    /이벤트|event|로그|log|탐지|detection/i,
    /runbook|룬북|가이드|guide/i,
    /개선|improvement|대응|response|대책|countermeasure/i,
    /프로세스|process|레지스트리|registry|파일|file/i,
    /credential|인증|계정|account|권한|privilege/i,
    /persistence|지속성|execution|실행|defense|방어/i,
    /lateral|측면|movement|이동|collection|수집/i,
    /exfiltration|유출|impact|영향/i
  ]

  const unrelatedKeywords = [
    /요리|음식|레시피|cooking|recipe/i,
    /여행|travel|관광|tourism/i,
    /영화|movie|드라마|drama|예능/i,
    /게임|game|스포츠|sport/i,
    /날씨|weather|기온|temperature/i,
    /주식|stock|투자|investment|코인|coin/i,
    /의학|medicine|병원|hospital|건강|health/i,
    /수학|math|물리|physics|화학|chemistry/i,
    /역사|history|문학|literature/i,
    /프로그래밍|코딩|coding|프레임워크|framework/i,
    /html|css|javascript|python|java|react|vue/i
  ]

  if (unrelatedKeywords.some(pattern => pattern.test(question))) {
    return false
  }

  return domainKeywords.some(pattern => pattern.test(question))
}

/**
 * 간단한 질문인지 확인 (인사말 등)
 * @param {string} question - 사용자 질문
 * @returns {boolean} 간단한 질문 여부
 */
function isSimpleQuestion(question) {
  const simplePatterns = [
    /^안녕/,
    /^hello/i,
    /^hi/i,
    /^반가워/i,
    /^고마워/i,
    /^감사/i
  ]

  return simplePatterns.some(pattern => pattern.test(question.trim()))
}

/**
 * 간단한 질문에 대한 빠른 응답
 * @param {string} question - 사용자 질문
 * @returns {string} 간단한 응답
 */
function getSimpleResponse(question) {
  if (/안녕|hello|hi|반가워/.test(question)) {
    return '안녕하세요! 보안 위협 개선에 대해 궁금한 점이 있으시면 언제든지 질문해주세요. MITRE ATT&CK 기반 위협 개선 방안에 대해 도움을 드릴 수 있습니다.'
  }
  if (/고마워|감사|thank/.test(question)) {
    return '천만에요! 추가로 궁금한 점이 있으시면 언제든지 질문해주세요.'
  }
  // 이스터에그: DAPOZ 솔루션 소개
  if (/dapoz.*뭐|dapoz.*무엇|dapoz.*소개|dapoz.*란|dapoz.*이란|다포즈.*뭐|다포즈.*무엇|다포즈.*소개|다포즈.*란|다포즈.*이란|what.*dapoz|what.*is.*dapoz/i.test(question)) {
    return 'DAPOZ(Diagnostics & Policy for Zero Trust)는 조직이 Zero Trust 보안 모델을 체계적으로 도입하고 관리할 수 있도록 돕는 종합 보안 솔루션입니다. Zero Trust의 7대 필라를 통한 정책 적용, 실시간 보안 진단 및 평가, MITRE ATT&CK 기반 위협 분석, AI 기반 위협 개선 지원, 실시간 모니터링 대시보드, SBOM 생성 및 관리 등의 기능을 제공합니다.'
  }
  return null
}

/**
 * 챗봇 질의응답 메인 함수
 * @param {string} question - 사용자 질문
 * @param {Object} options - 옵션
 * @param {Object} options.context - 현재 위협 컨텍스트
 * @param {Object} options.filters - 메타데이터 필터
 * @param {Array} options.conversationHistory - 대화 히스토리
 * @returns {Promise<Object>} 답변 및 관련 정보
 */
async function chat(question, options = {}) {
  if (!question || question.trim().length === 0) {
    return {
      answer: '질문을 입력해주세요.',
      sources: [],
      searchResult: null
    }
  }

  const simpleResponse = getSimpleResponse(question)
  if (simpleResponse) {
    return {
      answer: simpleResponse,
      sources: [],
      searchResult: null
    }
  }

  // 도메인 필터링 제거 - 모든 질문을 LLM에 전달하여 유연하게 처리
  return generateAnswer(question, options)
}

module.exports = {
  chat,
  generateAnswer,
  generateAnswerForTechnique,
  generateAnswerWithHistory,
  isSimpleQuestion,
  isDomainRelatedQuestion,
  getSimpleResponse
}

