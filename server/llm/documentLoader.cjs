/**
 * YAML Runbook 파일을 LangChain Document로 변환하는 모듈
 * 
 * 공식 문서 참고:
 * - LangChain Document: https://js.langchain.com/docs/modules/data_connection/document_loaders/
 * - LangChain Text Splitter: https://js.langchain.com/docs/modules/data_connection/document_transformers/text_splitters/
 * - js-yaml: https://github.com/nodeca/js-yaml
 */

const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')
const { Document } = require('@langchain/core/documents')
const { RecursiveCharacterTextSplitter } = require('@langchain/textsplitters')

/**
 * YAML 파일을 읽고 파싱하여 객체로 변환
 * @param {string} filePath - YAML 파일 경로
 * @returns {Object|null} 파싱된 YAML 데이터 또는 null
 */
function loadYAMLFile(filePath) {
  try {
    const fileContents = fs.readFileSync(filePath, 'utf8')
    const data = yaml.load(fileContents)
    return data
  } catch (error) {
    console.error(`YAML 파일 로드 실패: ${filePath}`, error)
    return null
  }
}

/**
 * YAML 데이터를 검색 가능한 텍스트로 변환
 * @param {Object} yamlData - 파싱된 YAML 데이터
 * @returns {string} 검색 가능한 텍스트
 */
function convertYAMLToText(yamlData) {
  const parts = []

  // 위협 요약
  if (yamlData.summary) {
    parts.push(`## 위협 요약\n${yamlData.summary}\n`)
  }

  // 위협 설명 (technique_name_kr)
  if (yamlData.technique_name_kr) {
    parts.push(`## 위협 유형: ${yamlData.technique_name_kr}\n`)
  }

  // 로그 필드
  if (yamlData.log_fields) {
    parts.push(`## 주요 로그 필드\n${yamlData.log_fields}\n`)
  }

  // 로그 판단 근거
  if (yamlData.log_reason) {
    parts.push(`## 로그 판단 근거\n${yamlData.log_reason}\n`)
  }

  // 로그 발생 시나리오
  if (yamlData.log_scenario) {
    parts.push(`## 로그 발생 시나리오\n${yamlData.log_scenario}\n`)
  }

  // 정책 방향 (개선 방안)
  if (yamlData.policy_direction) {
    parts.push(`## 보안 대책 및 개선 방안\n${yamlData.policy_direction}\n`)
  }

  // 단계별 설정 방법
  if (yamlData.steps && Array.isArray(yamlData.steps)) {
    parts.push(`## 단계별 설정 방법\n`)
    yamlData.steps.forEach((step, index) => {
      if (step.title) {
        parts.push(`### ${index + 1}. ${step.title}\n`)
      }
      if (step.details) {
        parts.push(`${step.details}\n`)
      }
    })
  }

  // 운영 가이드
  if (yamlData.operations_guidance) {
    parts.push(`## 운영 가이드\n${yamlData.operations_guidance}\n`)
  }

  // 참고 자료
  if (yamlData.references && Array.isArray(yamlData.references)) {
    parts.push(`## 참고 자료\n`)
    yamlData.references.forEach((ref) => {
      if (ref.title && ref.url) {
        parts.push(`- ${ref.title}: ${ref.url}\n`)
      }
    })
  }

  return parts.join('\n')
}

/**
 * YAML 데이터에서 메타데이터 추출
 * @param {Object} yamlData - 파싱된 YAML 데이터
 * @param {string} fileName - 파일명
 * @returns {Object} 메타데이터 객체
 */
function extractMetadata(yamlData, fileName) {
  // ChromaDB 메타데이터 형식: 문자열, 숫자, 불린만 허용
  // 배열은 문자열로 변환 (예: "4688,4624")
  const eventIdsStr = Array.isArray(yamlData.event_ids) && yamlData.event_ids.length > 0
    ? yamlData.event_ids.join(',')
    : ''
  
  return {
    case_id: String(yamlData.case_id || ''),
    threat_type: String(yamlData.threat_type || ''),
    threat_type_kr: String(yamlData.threat_type_kr || ''),
    technique_id: String(yamlData.technique_id || ''),
    technique_name_kr: String(yamlData.technique_name_kr || ''),
    event_ids: eventIdsStr, // 배열을 문자열로 변환
    source: String(fileName), // 파일명
    file_path: String(fileName) // 검색용
  }
}

/**
 * YAML 섹션 단위로 청킹하는 함수
 * Runbook YAML 구조에 최적화된 청킹 전략
 * 
 * 청킹 전략:
 * 1. 각 섹션을 독립적인 청크로 생성 (의미 단위 보존)
 * 2. 긴 섹션(policy_direction, steps 등)은 추가로 세분화
 * 3. 섹션별 메타데이터 추가로 검색 정확도 향상
 * 
 * @param {Object} yamlData - 파싱된 YAML 데이터
 * @param {Object} baseMetadata - 기본 메타데이터
 * @returns {Document[]} 청킹된 Document 배열
 */
function chunkYAMLBySections(yamlData, baseMetadata) {
  const documents = []
  let chunkIndex = 0

  /**
   * 섹션을 Document로 변환하는 헬퍼 함수
   */
  const createSectionDocument = (sectionTitle, content, sectionType) => {
    if (!content || content.trim().length === 0) {
      return null
    }

    // 긴 섹션은 추가로 세분화 (1500자 이상인 경우)
    if (content.length > 1500) {
      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1200,      // Runbook 특성상 조금 더 큰 청크 (의미 보존)
        chunkOverlap: 150,    // 오버랩 감소 (섹션 내부이므로)
        separators: ['\n\n', '\n', ' ', ''],
        keepSeparator: true
      })

      const subChunks = textSplitter.splitText(content)
      return subChunks.map((subChunk, subIndex) => {
        return new Document({
          pageContent: `${sectionTitle}\n${subChunk.trim()}`,
          metadata: {
            ...baseMetadata,
            section_type: sectionType,
            section_title: sectionTitle,
            chunk_index: chunkIndex++,
            sub_chunk_index: subIndex,
            total_sub_chunks: subChunks.length
          }
        })
      })
    } else {
      // 짧은 섹션은 하나의 청크로
      return new Document({
        pageContent: `${sectionTitle}\n${content.trim()}`,
        metadata: {
          ...baseMetadata,
          section_type: sectionType,
          section_title: sectionTitle,
          chunk_index: chunkIndex++
        }
      })
    }
  }

  // 1. 위협 요약
  if (yamlData.summary) {
    const doc = createSectionDocument('## 위협 요약', yamlData.summary, 'summary')
    if (doc) {
      Array.isArray(doc) ? documents.push(...doc) : documents.push(doc)
    }
  }

  // 2. 위협 유형 (짧은 메타 정보)
  if (yamlData.technique_name_kr) {
    const content = `위협 유형: ${yamlData.technique_name_kr}`
    const doc = createSectionDocument('## 위협 유형', content, 'technique_info')
    if (doc) {
      Array.isArray(doc) ? documents.push(...doc) : documents.push(doc)
    }
  }

  // 3. 주요 로그 필드
  if (yamlData.log_fields) {
    const doc = createSectionDocument('## 주요 로그 필드', yamlData.log_fields, 'log_fields')
    if (doc) {
      Array.isArray(doc) ? documents.push(...doc) : documents.push(doc)
    }
  }

  // 4. 로그 판단 근거
  if (yamlData.log_reason) {
    const doc = createSectionDocument('## 로그 판단 근거', yamlData.log_reason, 'log_reason')
    if (doc) {
      Array.isArray(doc) ? documents.push(...doc) : documents.push(doc)
    }
  }

  // 5. 로그 발생 시나리오
  if (yamlData.log_scenario) {
    const doc = createSectionDocument('## 로그 발생 시나리오', yamlData.log_scenario, 'log_scenario')
    if (doc) {
      Array.isArray(doc) ? documents.push(...doc) : documents.push(doc)
    }
  }

  // 6. 보안 대책 및 개선 방안 (긴 섹션 가능)
  if (yamlData.policy_direction) {
    const doc = createSectionDocument('## 보안 대책 및 개선 방안', yamlData.policy_direction, 'policy_direction')
    if (doc) {
      Array.isArray(doc) ? documents.push(...doc) : documents.push(doc)
    }
  }

  // 7. 단계별 설정 방법 (각 step을 독립 청크로)
  if (yamlData.steps && Array.isArray(yamlData.steps)) {
    yamlData.steps.forEach((step, stepIndex) => {
      if (step.title && step.details) {
        const stepContent = `### ${stepIndex + 1}. ${step.title}\n${step.details}`
        const doc = createSectionDocument('## 단계별 설정 방법', stepContent, 'step')
        if (doc) {
          Array.isArray(doc) ? documents.push(...doc) : documents.push(doc)
        }
      }
    })
  }

  // 8. 운영 가이드
  if (yamlData.operations_guidance) {
    const doc = createSectionDocument('## 운영 가이드', yamlData.operations_guidance, 'operations_guidance')
    if (doc) {
      Array.isArray(doc) ? documents.push(...doc) : documents.push(doc)
    }
  }

  // 9. 참고 자료 (하나의 청크로)
  if (yamlData.references && Array.isArray(yamlData.references)) {
    const refsContent = yamlData.references
      .filter(ref => ref.title && ref.url)
      .map(ref => `- ${ref.title}: ${ref.url}`)
      .join('\n')
    
    if (refsContent) {
      const doc = createSectionDocument('## 참고 자료', refsContent, 'references')
      if (doc) {
        Array.isArray(doc) ? documents.push(...doc) : documents.push(doc)
      }
    }
  }

  // 전체 청크 수 업데이트
  documents.forEach((doc, index) => {
    doc.metadata.total_chunks = documents.length
    doc.metadata.chunk_id = `${baseMetadata.source || 'unknown'}_chunk_${index}`
  })

  return documents
}

/**
 * 텍스트를 청킹하는 함수 (폴백용)
 * LangChain의 RecursiveCharacterTextSplitter 사용
 * 
 * @param {string} text - 청킹할 텍스트
 * @param {Object} metadata - 각 청크에 추가할 메타데이터
 * @returns {Document[]} 청킹된 Document 배열
 */
function chunkText(text, metadata) {
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1200,      // Runbook 특성에 맞게 조정
    chunkOverlap: 150,    // 오버랩 감소
    separators: ['\n\n', '\n', ' ', ''],
    keepSeparator: true
  })

  const chunks = textSplitter.splitText(text)

  return chunks.map((chunk, index) => {
    return new Document({
      pageContent: chunk.trim(),
      metadata: {
        ...metadata,
        chunk_index: index,
        total_chunks: chunks.length,
        chunk_id: `${metadata.source || 'unknown'}_chunk_${index}`
      }
    })
  })
}

/**
 * 단일 YAML 파일을 LangChain Document로 변환 (섹션 단위 청킹)
 * @param {string} filePath - YAML 파일 경로
 * @returns {Document[]} 청킹된 LangChain Document 배열
 */
function loadDocumentFromYAML(filePath) {
  const yamlData = loadYAMLFile(filePath)
  if (!yamlData) {
    return []
  }

  const fileName = path.basename(filePath)
  const metadata = extractMetadata(yamlData, fileName)

  // YAML 구조에 맞춘 섹션 단위 청킹 (의미 보존)
  const chunkedDocuments = chunkYAMLBySections(yamlData, metadata)

  return chunkedDocuments
}

/**
 * 디렉토리 내 모든 YAML 파일을 LangChain Document 배열로 변환 (청킹 포함)
 * @param {string} dirPath - YAML 파일이 있는 디렉토리 경로
 * @returns {Document[]} 청킹된 LangChain Document 배열
 */
function loadDocumentsFromDirectory(dirPath) {
  const documents = []
  let totalFiles = 0
  let totalChunks = 0

  try {
    // 디렉토리 존재 확인
    if (!fs.existsSync(dirPath)) {
      console.error(`디렉토리가 존재하지 않습니다: ${dirPath}`)
      return documents
    }

    // 디렉토리 내 파일 목록 읽기
    const files = fs.readdirSync(dirPath)

    // YAML 파일만 필터링
    const yamlFiles = files.filter(
      (file) => file.endsWith('.yml') || file.endsWith('.yaml')
    )

    // 각 YAML 파일을 Document로 변환 (청킹됨)
    yamlFiles.forEach((file) => {
      const filePath = path.join(dirPath, file)
      const chunkedDocs = loadDocumentFromYAML(filePath)
      
      if (chunkedDocs && chunkedDocs.length > 0) {
        documents.push(...chunkedDocs) // 청킹된 모든 Document 추가
        totalFiles++
        totalChunks += chunkedDocs.length
        console.log(`✓ 문서 로드 완료: ${file} (${chunkedDocs.length}개 청크)`)
      } else {
        console.warn(`⚠ 문서 로드 실패: ${file}`)
      }
    })

    console.log(`총 ${totalFiles}개 파일에서 ${totalChunks}개의 청크가 생성되었습니다.`)
  } catch (error) {
    console.error(`디렉토리 읽기 실패: ${dirPath}`, error)
  }

  return documents
}

/**
 * Runbooks 디렉토리에서 모든 문서 로드
 * 서버 기준 상대 경로로 runbooks 디렉토리 찾기
 * @returns {Document[]} LangChain Document 배열
 */
function loadRunbookDocuments() {
  // server/llm/documentLoader.cjs 기준으로
  // src/lib/llm/runbooks 경로 찾기
  const serverDir = path.join(__dirname, '..') // server/
  const projectRoot = path.join(serverDir, '..') // 프로젝트 루트
  const runbooksPath = path.join(projectRoot, 'src', 'lib', 'llm', 'runbooks')

  console.log(`Runbooks 경로: ${runbooksPath}`)
  return loadDocumentsFromDirectory(runbooksPath)
}

module.exports = {
  loadYAMLFile,
  convertYAMLToText,
  extractMetadata,
  chunkText,
  loadDocumentFromYAML,
  loadDocumentsFromDirectory,
  loadRunbookDocuments
}

