/**
 * ChromaDB VectorStore 관리 모듈
 * 
 * 공식 문서 참고:
 * - LangChain ChromaDB 통합: https://js.langchain.com/docs/integrations/vectorstores/chroma
 * - ChromaDB JS 클라이언트: https://docs.trychroma.com/js-client
 */

require('dotenv').config()
const { Chroma } = require('@langchain/community/vectorstores/chroma')
const { OpenAIEmbeddings } = require('@langchain/openai')
const { Document } = require('@langchain/core/documents')

// 환경 변수
const CHROMADB_URL = process.env.CHROMADB_URL || 'http://localhost:8000'
const OPENAI_API_KEY = process.env.OPENAI_API_KEY

if (!OPENAI_API_KEY) {
  console.warn('⚠️  OPENAI_API_KEY가 설정되지 않았습니다. 환경 변수를 확인하세요.')
}

// Collection 이름
const COLLECTION_NAME = 'threat_improvement_runbooks'

// OpenAI Embeddings 초기화
const embeddings = new OpenAIEmbeddings({
  openAIApiKey: OPENAI_API_KEY,
  modelName: 'text-embedding-3-small' // 또는 'text-embedding-ada-002'
})

// VectorStore 인스턴스 (지연 초기화)
let vectorStore = null

/**
 * VectorStore 초기화 및 반환
 * @returns {Promise<Chroma>} ChromaDB VectorStore 인스턴스
 */
async function getVectorStore() {
  if (!vectorStore) {
    try {
      vectorStore = await Chroma.fromExistingCollection(
        embeddings,
        {
          url: CHROMADB_URL,
          collectionName: COLLECTION_NAME
        }
      )
      console.log(`✓ ChromaDB VectorStore 연결 성공: ${COLLECTION_NAME}`)
    } catch (error) {
      // Collection이 없으면 새로 생성
      console.log(`Collection이 없습니다. 새로 생성합니다: ${COLLECTION_NAME}`)
      vectorStore = await Chroma.fromDocuments(
        [], // 빈 배열로 초기화
        embeddings,
        {
          url: CHROMADB_URL,
          collectionName: COLLECTION_NAME
        }
      )
      console.log(`✓ ChromaDB Collection 생성 완료: ${COLLECTION_NAME}`)
    }
  }
  return vectorStore
}

/**
 * 문서들을 VectorStore에 추가 (인덱싱)
 * @param {Document[]} documents - LangChain Document 배열
 * @returns {Promise<void>}
 */
async function addDocuments(documents) {
  if (!documents || documents.length === 0) {
    console.warn('⚠️  추가할 문서가 없습니다.')
    return
  }

  try {
    // 메타데이터 정규화: ChromaDB 호환 형식으로 변환
    const normalizedDocuments = documents.map(doc => {
      const normalizedMetadata = {}
      
      // 모든 메타데이터 값을 문자열로 변환 (ChromaDB 호환성)
      for (const [key, value] of Object.entries(doc.metadata)) {
        if (value === null || value === undefined) {
          normalizedMetadata[key] = ''
        } else if (typeof value === 'object') {
          // 객체나 배열은 JSON 문자열로 변환
          normalizedMetadata[key] = JSON.stringify(value)
        } else {
          normalizedMetadata[key] = String(value)
        }
      }
      
      return {
        ...doc,
        metadata: normalizedMetadata
      }
    })

    const store = await getVectorStore()
    
    // 기존 문서가 있으면 추가, 없으면 새로 생성
    if (vectorStore) {
      await store.addDocuments(normalizedDocuments)
      console.log(`✓ ${normalizedDocuments.length}개의 문서가 VectorStore에 추가되었습니다.`)
    } else {
      // 첫 인덱싱인 경우
      vectorStore = await Chroma.fromDocuments(
        normalizedDocuments,
        embeddings,
        {
          url: CHROMADB_URL,
          collectionName: COLLECTION_NAME
        }
      )
      console.log(`✓ ${normalizedDocuments.length}개의 문서로 VectorStore를 생성했습니다.`)
    }
  } catch (error) {
    console.error('❌ 문서 추가 실패:', error)
    throw error
  }
}

/**
 * 유사도 기반 문서 검색
 * @param {string} query - 검색 쿼리
 * @param {number} k - 반환할 문서 수 (기본값: 5)
 * @param {Object} filter - 메타데이터 필터 (선택사항)
 * @returns {Promise<Document[]>} 검색된 Document 배열
 */
async function similaritySearch(query, k = 5, filter = null) {
  try {
    const store = await getVectorStore()
    
    let results
    if (filter) {
      // 메타데이터 필터링이 있는 경우
      results = await store.similaritySearch(query, k, filter)
    } else {
      // 필터링 없는 경우
      results = await store.similaritySearch(query, k)
    }
    
    console.log(`✓ 검색 완료: "${query}" → ${results.length}개 결과`)
    return results
  } catch (error) {
    console.error('❌ 검색 실패:', error)
    throw error
  }
}

/**
 * MMR (Maximum Marginal Relevance) 기반 검색
 * 다양성을 고려한 검색 결과 반환
 * @param {string} query - 검색 쿼리
 * @param {number} k - 반환할 문서 수
 * @param {number} fetchK - 초기 후보 문서 수 (기본값: k * 2)
 * @param {number} lambda - 다양성 파라미터 (0~1, 기본값: 0.5)
 * @returns {Promise<Document[]>} 검색된 Document 배열
 */
async function maxMarginalRelevanceSearch(query, k = 5, fetchK = null, lambda = 0.5) {
  try {
    const store = await getVectorStore()
    const fetchKValue = fetchK || k * 2
    
    const results = await store.maxMarginalRelevanceSearch(query, {
      k,
      fetchK: fetchKValue,
      lambda
    })
    
    console.log(`✓ MMR 검색 완료: "${query}" → ${results.length}개 결과`)
    return results
  } catch (error) {
    console.error('❌ MMR 검색 실패:', error)
    throw error
  }
}

/**
 * Collection의 문서 수 확인
 * @returns {Promise<number>} 문서 수
 */
async function getCollectionCount() {
  try {
    const store = await getVectorStore()
    // ChromaDB의 collection 정보를 가져와서 count 확인
    // 실제 구현은 ChromaDB 클라이언트 API에 따라 다를 수 있음
    // 일단 기본 검색으로 확인
    const results = await store.similaritySearch('test', 1000)
    return results.length
  } catch (error) {
    console.error('❌ Collection 정보 조회 실패:', error)
    return 0
  }
}

/**
 * Collection 삭제 (주의: 모든 데이터가 삭제됩니다)
 * @returns {Promise<void>}
 */
async function deleteCollection() {
  try {
    // ChromaDB 클라이언트를 직접 사용하여 collection 삭제
    const { ChromaClient } = require('chromadb')
    const client = new ChromaClient({ path: CHROMADB_URL })
    await client.deleteCollection({ name: COLLECTION_NAME })
    vectorStore = null // 인스턴스 초기화
    console.log(`✓ Collection 삭제 완료: ${COLLECTION_NAME}`)
  } catch (error) {
    console.error('❌ Collection 삭제 실패:', error)
    throw error
  }
}

/**
 * VectorStore 연결 테스트
 * @returns {Promise<boolean>} 연결 성공 여부
 */
async function testConnection() {
  try {
    const store = await getVectorStore()
    // 간단한 검색으로 연결 테스트
    await store.similaritySearch('test', 1)
    console.log('✓ ChromaDB 연결 테스트 성공')
    return true
  } catch (error) {
    console.error('❌ ChromaDB 연결 테스트 실패:', error)
    return false
  }
}

/**
 * LangChain Retriever 생성
 * VectorStore를 Retriever 인터페이스로 변환
 * 
 * 공식 문서: https://js.langchain.com/docs/modules/data_connection/retrievers/
 * 
 * @param {Object} options - Retriever 옵션
 * @param {number} options.k - 반환할 문서 수 (기본값: 5)
 * @param {string} options.searchType - 검색 타입: "similarity" | "mmr" (기본값: "mmr")
 * @param {Object} options.searchKwargs - 검색 추가 옵션
 * @param {Object} options.filter - 메타데이터 필터
 * @returns {Promise<Retriever>} LangChain Retriever 인스턴스
 */
async function getRetriever(options = {}) {
  const {
    k = 5,
    searchType = 'mmr', // 'similarity' 또는 'mmr'
    searchKwargs = {},
    filter = null
  } = options

  try {
    const store = await getVectorStore()
    
    // 기본 MMR 파라미터 설정
    const defaultSearchKwargs = {
      fetchK: k * 2, // MMR을 위한 초기 후보 수
      lambda: 0.5 // 다양성 파라미터
    }

    // Retriever 생성
    const retriever = store.asRetriever({
      k,
      searchType,
      searchKwargs: {
        ...defaultSearchKwargs,
        ...searchKwargs,
        ...(filter && { filter }) // 필터가 있으면 추가
      }
    })

    console.log(`✓ Retriever 생성 완료: ${searchType} (k=${k})`)
    return retriever
  } catch (error) {
    console.error('❌ Retriever 생성 실패:', error)
    throw error
  }
}

module.exports = {
  getVectorStore,
  addDocuments,
  similaritySearch,
  maxMarginalRelevanceSearch,
  getCollectionCount,
  deleteCollection,
  testConnection,
  getRetriever,
  COLLECTION_NAME
}

