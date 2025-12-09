/**
 * LLM 관련 API 라우트
 * 
 * 공식 문서 참고:
 * - Express Router: https://expressjs.com/en/guide/routing.html
 */

const express = require('express')
const router = express.Router()

// LLM 서비스 모듈
const { chat, generateAnswerForTechnique } = require('../llm/chatService.cjs')
const { loadRunbookDocuments } = require('../llm/documentLoader.cjs')
const { addDocuments, getCollectionCount, testConnection, deleteCollection } = require('../llm/vectorStore.cjs')

/**
 * POST /api/llm/index-runbooks
 * Runbooks YAML 파일들을 ChromaDB에 인덱싱
 */
router.post('/index-runbooks', async (req, res) => {
  try {
    const { force = false } = req.body // force=true면 기존 collection 삭제 후 재인덱싱

    console.log('📚 Runbooks 인덱싱 시작...')

    // force 옵션이 있으면 기존 collection 삭제
    if (force) {
      try {
        await deleteCollection()
        console.log('✓ 기존 Collection 삭제 완료')
      } catch (error) {
        console.warn('⚠️  Collection 삭제 실패 (무시하고 계속):', error.message)
      }
    }

    // 1. YAML 파일들을 Document로 변환 (청킹 포함)
    const documents = loadRunbookDocuments()

    if (documents.length === 0) {
      return res.status(404).json({
        success: false,
        error: '인덱싱할 문서가 없습니다. runbooks 폴더를 확인하세요.'
      })
    }

    // 2. VectorStore에 추가 (청킹된 문서들)
    await addDocuments(documents)

    // 3. 인덱싱된 청크 수 확인
    const count = await getCollectionCount()

    // 원본 파일 수 계산 (중복 제거)
    const uniqueFiles = new Set(documents.map(doc => doc.metadata.source))
    const fileCount = uniqueFiles.size

    console.log(`✓ Runbooks 인덱싱 완료: ${fileCount}개 파일 → ${documents.length}개 청크`)

    res.json({
      success: true,
      message: '인덱싱이 완료되었습니다.',
      fileCount: fileCount,
      chunkCount: documents.length,
      collectionCount: count
    })
  } catch (error) {
    console.error('❌ Runbooks 인덱싱 실패:', error)
    res.status(500).json({
      success: false,
      error: error.message || '인덱싱 중 오류가 발생했습니다.',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
})

/**
 * GET /api/llm/index-status
 * 인덱싱 상태 확인
 */
router.get('/index-status', async (req, res) => {
  try {
    // ChromaDB 연결 테스트
    const isConnected = await testConnection()

    if (!isConnected) {
      return res.json({
        success: false,
        connected: false,
        indexed: false,
        message: 'ChromaDB에 연결할 수 없습니다. ChromaDB 서버가 실행 중인지 확인하세요.'
      })
    }

    // Collection 문서 수 확인
    const count = await getCollectionCount()

    res.json({
      success: true,
      connected: true,
      indexed: count > 0,
      documentCount: count,
      message: count > 0 
        ? `${count}개의 문서가 인덱싱되어 있습니다.`
        : '인덱싱된 문서가 없습니다. /api/llm/index-runbooks를 호출하여 인덱싱하세요.'
    })
  } catch (error) {
    console.error('❌ 인덱싱 상태 확인 실패:', error)
    res.status(500).json({
      success: false,
      error: error.message || '상태 확인 중 오류가 발생했습니다.'
    })
  }
})

/**
 * POST /api/llm/chat
 * 챗봇 질의응답
 * 
 * Request Body:
 * {
 *   "question": "사용자 질문",
 *   "technique_id": "T1003" (선택사항),
 *   "context": { ... } (선택사항)
 * }
 */
router.post('/chat', async (req, res) => {
  try {
    const { question, technique_id, context, filters } = req.body

    // 질문 검증
    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: '질문(question)이 필요합니다.'
      })
    }

    console.log(`💬 챗봇 질문 수신: "${question}"`)

    // 옵션 구성
    const options = {}

    // Technique ID가 있으면 해당 Technique로 필터링
    if (technique_id) {
      options.filters = {
        technique_id: technique_id
      }
      options.k = 3 // Technique ID로 필터링하면 문서 수를 줄임
    } else if (filters) {
      options.filters = filters
    }

    // 컨텍스트가 있으면 추가
    if (context) {
      options.context = context
    }

    // 답변 생성
    let result

    if (technique_id) {
      // 특정 Technique ID에 대한 질문
      result = await generateAnswerForTechnique(question, technique_id)
    } else {
      // 일반 질문
      result = await chat(question, options)
    }

    console.log(`✓ 챗봇 답변 생성 완료`)

    res.json({
      success: true,
      answer: result.answer,
      sources: result.sources || [],
      searchResult: result.searchResult || null
    })
  } catch (error) {
    console.error('❌ 챗봇 답변 생성 실패:', error)
    res.status(500).json({
      success: false,
      error: error.message || '답변 생성 중 오류가 발생했습니다.',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
})

/**
 * GET /api/llm/health
 * LLM 서비스 헬스 체크
 */
router.get('/health', async (req, res) => {
  try {
    const isConnected = await testConnection()
    const count = await getCollectionCount()

    res.json({
      success: true,
      status: 'ok',
      chromadb: {
        connected: isConnected,
        documentCount: count
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'error',
      error: error.message
    })
  }
})

module.exports = router

