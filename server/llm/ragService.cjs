/**
 * RAG (Retrieval-Augmented Generation) 검색 서비스
 * 
 * 공식 문서 참고:
 * - LangChain Retriever: https://js.langchain.com/docs/modules/data_connection/retrievers/
 * - MMR Retriever: https://js.langchain.com/docs/modules/data_connection/retrievers/integrations/max_marginal_relevance
 */

const {
  similaritySearch,
  maxMarginalRelevanceSearch,
  getVectorStore,
  getRetriever
} = require('./vectorStore.cjs')

/**
 * 검색 쿼리 개선
 * 사용자 질문과 현재 위협 컨텍스트를 결합하여 더 정확한 검색을 수행
 * @param {string} question - 사용자 질문
 * @param {Object} context - 현재 위협 컨텍스트 (선택사항)
 * @returns {string} 개선된 검색 쿼리
 */
function enhanceQuery(question, context = null) {
  let enhancedQuery = question

  if (context) {
    const contextParts = []

    if (context.technique_id) {
      contextParts.push(`MITRE ATT&CK ${context.technique_id}`)
    }

    if (context.threat_type_kr) {
      contextParts.push(context.threat_type_kr)
    }

    if (context.technique_name_kr) {
      contextParts.push(context.technique_name_kr)
    }

    if (context.event_ids && context.event_ids.length > 0) {
      contextParts.push(`Event ID ${context.event_ids.join(', ')}`)
    }

    if (contextParts.length > 0) {
      enhancedQuery = `${question} ${contextParts.join(' ')}`
    }
  }

  return enhancedQuery
}

/**
 * 메타데이터 필터 생성
 * @param {Object} filters - 필터 조건
 * @param {string} filters.technique_id - MITRE Technique ID (예: "T1003")
 * @param {string} filters.threat_type - 위협 유형 (예: "CRED")
 * @param {string[]} filters.event_ids - 이벤트 ID 배열
 * @returns {Object|null} ChromaDB 필터 객체 또는 null
 */
function createMetadataFilter(filters) {
  if (!filters || Object.keys(filters).length === 0) {
    return null
  }

  const filterConditions = {}

  if (filters.technique_id) {
    filterConditions.technique_id = String(filters.technique_id)
  }

  if (filters.threat_type) {
    filterConditions.threat_type = String(filters.threat_type)
  }

  if (filters.event_ids && Array.isArray(filters.event_ids) && filters.event_ids.length > 0) {
    const eventIdStrings = filters.event_ids.map(id => String(id))
    filterConditions.event_ids = eventIdStrings[0]
  }

  return Object.keys(filterConditions).length > 0 ? filterConditions : null
}

/**
 * 질문에서 technique_id 추출
 * "T1003", "T1098" 등의 패턴을 찾아서 반환
 * @param {string} question - 사용자 질문
 * @returns {string|null} 추출된 technique_id 또는 null
 */
function extractTechniqueIdFromQuestion(question) {
  const match = question.match(/T\d{4}(?:\.\d{3})?/i)
  return match ? match[0].toUpperCase() : null
}

/**
 * 질문 유형 분석
 * 질문에서 키워드를 추출하여 검색 전략 결정
 * @param {string} question - 사용자 질문
 * @returns {Object} 질문 유형 정보
 */
function analyzeQuestionType(question) {
  const q = question.toLowerCase()
  
  const isDetailRequest = 
    q.includes('상세') || 
    q.includes('설정 방법') || 
    q.includes('어떻게') || 
    q.includes('방법') ||
    q.includes('단계') ||
    q.includes('구체적')
  
  const isStepRequest = 
    q.includes('step') ||
    q.includes('단계별') ||
    q.includes('설정')
  
  return {
    isDetailRequest,
    isStepRequest,
    prioritySection: isDetailRequest || isStepRequest ? 'step' : null
  }
}

/**
 * 검색 결과 확장: 같은 technique_id를 가진 모든 청크 수집
 * @param {Array} initialResults - 초기 검색 결과
 * @param {string} techniqueId - MITRE Technique ID
 * @returns {Promise<Array>} 확장된 검색 결과
 */
async function expandSearchByTechniqueId(initialResults, techniqueId) {
  if (!techniqueId) return initialResults
  
  try {
    const filter = { technique_id: String(techniqueId) }
    const searchQuery = `MITRE ATT&CK ${techniqueId}`
    const allRelatedDocs = await similaritySearch(searchQuery, 50, filter)
    
    const existingChunkIds = new Set()
    initialResults.forEach(r => {
      const chunkId = r.metadata.chunk_id || `${r.metadata.source || 'unknown'}_chunk_${r.metadata.chunk_index || 0}`
      existingChunkIds.add(chunkId)
    })
    
    const additionalDocs = allRelatedDocs
      .filter(doc => {
        const chunkId = doc.metadata.chunk_id || `${doc.metadata.source || 'unknown'}_chunk_${doc.metadata.chunk_index || 0}`
        return !existingChunkIds.has(chunkId)
      })
      .map(doc => ({
        rank: 0,
        content: doc.pageContent,
        metadata: doc.metadata,
        score: null
      }))
    
    return [...initialResults, ...additionalDocs]
  } catch (error) {
    console.error('❌ 검색 확장 실패:', error)
    return initialResults
  }
}

/**
 * 검색 결과 우선순위 재정렬
 * 질문 유형에 따라 steps 섹션을 우선 배치
 * @param {Array} results - 검색 결과
 * @param {Object} questionType - 질문 유형 정보
 * @returns {Array} 재정렬된 결과
 */
function reorderResultsByPriority(results, questionType) {
  if (!questionType.prioritySection) return results
  
  const priorityOrder = {
    'step': 1,
    'policy_direction': 2,
    'summary': 3,
    'log_reason': 4,
    'operations_guidance': 5,
    'log_fields': 6,
    'log_scenario': 7,
    'references': 8
  }
  
  return results.sort((a, b) => {
    const aSection = a.metadata.section_type || ''
    const bSection = b.metadata.section_type || ''
    
    const aPriority = priorityOrder[aSection] || 99
    const bPriority = priorityOrder[bSection] || 99
    
    if (aPriority !== bPriority) {
      return aPriority - bPriority
    }
    
    return (a.rank || 0) - (b.rank || 0)
  }).map((result, index) => ({
    ...result,
    rank: index + 1
  }))
}

/**
 * RAG 검색 수행 (LangChain Retriever 사용)
 * 
 * 공식 문서: https://js.langchain.com/docs/modules/data_connection/retrievers/
 * 
 * @param {string} question - 사용자 질문
 * @param {Object} options - 검색 옵션
 * @param {number} options.k - 반환할 문서 수 (기본값: 5)
 * @param {Object} options.context - 현재 위협 컨텍스트
 * @param {Object} options.filters - 메타데이터 필터
 * @param {boolean} options.useMMR - MMR 검색 사용 여부 (기본값: true)
 * @param {number} options.lambda - MMR 다양성 파라미터 (0~1, 기본값: 0.5)
 * @returns {Promise<Object>} 검색 결과
 */
async function searchRelevantDocuments(question, options = {}) {
  const {
    k = 5,
    context = null,
    filters = null,
    useMMR = false,
    lambda = 0.5
  } = options

  try {
    const questionType = analyzeQuestionType(question)
    const enhancedQuery = enhanceQuery(question, context)
    const metadataFilter = createMetadataFilter(filters)

    let documents
    const shouldUseMMR = useMMR && !metadataFilter

    if (shouldUseMMR) {
      documents = await maxMarginalRelevanceSearch(
        enhancedQuery,
        k,
        k * 2,
        lambda
      )
    } else {
      documents = await similaritySearch(enhancedQuery, k, metadataFilter)
    }

    let results = documents.map((doc, index) => ({
      rank: index + 1,
      content: doc.pageContent,
      metadata: doc.metadata,
      score: doc.score || null
    }))

    let techniqueId = extractTechniqueIdFromQuestion(question)
    
    if (!techniqueId && results.length > 0) {
      const techniqueIdCounts = {}
      results.forEach(r => {
        const tid = r.metadata.technique_id
        if (tid) {
          techniqueIdCounts[tid] = (techniqueIdCounts[tid] || 0) + 1
        }
      })
      const mostCommonTechId = Object.keys(techniqueIdCounts).sort((a, b) => 
        techniqueIdCounts[b] - techniqueIdCounts[a]
      )[0]
      if (mostCommonTechId) {
        techniqueId = mostCommonTechId
      }
    }
    
    if (!techniqueId) {
      techniqueId = context?.technique_id || filters?.technique_id || null
    }

    if (techniqueId && results.length > 0) {
      results = await expandSearchByTechniqueId(results, techniqueId)
    }

    results = reorderResultsByPriority(results, questionType)

    const maxResults = Math.max(k, 20)
    results = results.slice(0, maxResults)

    return {
      query: question,
      enhancedQuery,
      results,
      totalResults: results.length,
      filters: metadataFilter,
      searchMethod: shouldUseMMR ? 'MMR' : 'similarity',
      questionType,
      extractedTechniqueId: techniqueId
    }
  } catch (error) {
    console.error('❌ RAG 검색 실패:', error)
    throw error
  }
}

/**
 * 특정 Technique ID로 필터링된 검색
 * @param {string} question - 사용자 질문
 * @param {string} techniqueId - MITRE Technique ID (예: "T1003")
 * @param {number} k - 반환할 문서 수 (기본값: 3)
 * @returns {Promise<Object>} 검색 결과
 */
async function searchByTechniqueId(question, techniqueId, k = 3) {
  return searchRelevantDocuments(question, {
    k,
    filters: {
      technique_id: techniqueId
    },
    useMMR: false
  })
}

/**
 * 특정 위협 유형으로 필터링된 검색
 * @param {string} question - 사용자 질문
 * @param {string} threatType - 위협 유형 (예: "CRED")
 * @param {number} k - 반환할 문서 수 (기본값: 5)
 * @returns {Promise<Object>} 검색 결과
 */
async function searchByThreatType(question, threatType, k = 5) {
  return searchRelevantDocuments(question, {
    k,
    filters: {
      threat_type: threatType
    },
    useMMR: true
  })
}

/**
 * 이벤트 ID로 필터링된 검색
 * @param {string} question - 사용자 질문
 * @param {string[]} eventIds - 이벤트 ID 배열 (예: ["4648", "4624"])
 * @param {number} k - 반환할 문서 수 (기본값: 5)
 * @returns {Promise<Object>} 검색 결과
 */
async function searchByEventIds(question, eventIds, k = 5) {
  return searchRelevantDocuments(question, {
    k,
    filters: {
      event_ids: eventIds
    },
    useMMR: false
  })
}

/**
 * 검색 결과를 컨텍스트 문자열로 변환
 * LLM 프롬프트에 사용하기 위한 형식
 * @param {Object} searchResult - searchRelevantDocuments의 결과
 * @returns {string} 컨텍스트 문자열
 */
function formatSearchResultsAsContext(searchResult) {
  if (!searchResult || !searchResult.results || searchResult.results.length === 0) {
    return '관련 문서를 찾을 수 없습니다.'
  }

  const groupedByTechnique = {}
  searchResult.results.forEach((result) => {
    const techniqueId = result.metadata.technique_id || 'unknown'
    if (!groupedByTechnique[techniqueId]) {
      groupedByTechnique[techniqueId] = []
    }
    groupedByTechnique[techniqueId].push(result)
  })

  const contextParts = []
  
  Object.keys(groupedByTechnique).forEach((techniqueId) => {
    const docs = groupedByTechnique[techniqueId]
    const firstDoc = docs[0]
    const techniqueName = firstDoc.metadata.technique_name_kr || ''
    const caseId = firstDoc.metadata.case_id || ''
    
    contextParts.push(`\n=== [${techniqueId}] ${techniqueName} ${caseId ? `(${caseId})` : ''} ===`)
    
    const sections = {
      summary: [],
      policy_direction: [],
      step: [],
      log_reason: [],
      operations_guidance: [],
      log_fields: [],
      log_scenario: [],
      references: [],
      other: []
    }
    
    docs.forEach((doc) => {
      const sectionType = doc.metadata.section_type || 'other'
      if (sections[sectionType]) {
        sections[sectionType].push(doc)
      } else {
        sections.other.push(doc)
      }
    })
    
    if (sections.summary.length > 0) {
      contextParts.push('\n## 위협 요약')
      sections.summary.forEach(doc => {
        contextParts.push(doc.content)
      })
    }
    
    if (sections.policy_direction.length > 0) {
      contextParts.push('\n## 보안 대책 및 개선 방안')
      sections.policy_direction.forEach(doc => {
        contextParts.push(doc.content)
      })
    }
    
    if (sections.step.length > 0) {
      contextParts.push('\n## 단계별 설정 방법 (중요: 이 섹션을 우선적으로 사용하세요)')
      sections.step.forEach(doc => {
        contextParts.push(doc.content)
      })
    }
    
    if (sections.log_reason.length > 0) {
      contextParts.push('\n## 로그 판단 근거')
      sections.log_reason.forEach(doc => {
        contextParts.push(doc.content)
      })
    }
    
    if (sections.log_scenario.length > 0) {
      contextParts.push('\n## 로그 발생 시나리오')
      sections.log_scenario.forEach(doc => {
        contextParts.push(doc.content)
      })
    }
    
    if (sections.operations_guidance.length > 0) {
      contextParts.push('\n## 운영 가이드')
      sections.operations_guidance.forEach(doc => {
        contextParts.push(doc.content)
      })
    }
    
    if (sections.other.length > 0) {
      sections.other.forEach(doc => {
        contextParts.push(`\n${doc.content}`)
      })
    }
  })

  return contextParts.join('\n')
}

/**
 * 검색 결과 요약 정보 생성
 * @param {Object} searchResult - searchRelevantDocuments의 결과
 * @returns {Object} 요약 정보
 */
function summarizeSearchResults(searchResult) {
  if (!searchResult || !searchResult.results || searchResult.results.length === 0) {
    return {
      totalDocs: 0,
      techniques: [],
      threatTypes: []
    }
  }

  const techniques = new Set()
  const threatTypes = new Set()

  searchResult.results.forEach(result => {
    const meta = result.metadata
    if (meta.technique_id) {
      techniques.add(meta.technique_id)
    }
    if (meta.threat_type) {
      threatTypes.add(meta.threat_type)
    }
  })

  return {
    totalDocs: searchResult.totalResults,
    techniques: Array.from(techniques),
    threatTypes: Array.from(threatTypes),
    searchMethod: searchResult.searchMethod
  }
}

module.exports = {
  searchRelevantDocuments,
  searchByTechniqueId,
  searchByThreatType,
  searchByEventIds,
  formatSearchResultsAsContext,
  summarizeSearchResults,
  enhanceQuery,
  createMetadataFilter
}

