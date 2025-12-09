import { API_BASE_URL } from '../utils/api';
import React, { useState } from 'react'
import {SearchCheck, Download, Upload, FileSpreadsheet, Calculator, TrendingUp, CheckCircle} from 'lucide-react'
import * as XLSX from 'xlsx' // Excel 파싱

interface UploadedFile {
  name: string
  type: 'checklist' | 'asset'
  file: File
}

interface EvaluationResult {
  totalScore: number              // 서버 zeroTrustScore(0~1) * 100 → 정수 점수
  maturityLevel: string
  maturityDescription: string
  breakdown: {
    maturity: number              // 체크리스트 비율 
    asset: number                 // 위험 점수
    threatModeling: number
    threatScenario: number
  }
}

interface ThreatReportStoredResult {
  evaluationResult: EvaluationResult | null
  detectedScenarios: string[]
}

const DiagnosisEvaluation: React.FC = () => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [evaluationResult, setEvaluationResult] = useState<EvaluationResult | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  // 개별 표시용
  const [checklistScore, setChecklistScore] = useState<number | null>(null)
  const [assetScore, setAssetScore] = useState<number | null>(null)
  const [assetLTotal, setAssetLTotal] = useState<number | null>(null)

  const [finalSheetValue, setFinalSheetValue] = useState<number | string | null>(null)
  const [finalSheetError, setFinalSheetError] = useState<string | null>(null)

  // 서버 응답의 보조 필드 표시용 상태
  const [serverDetected, setServerDetected] = useState<string[]>([])
  const [serverThreatScore, setServerThreatScore] = useState<number | null>(null)       // 0~1
  const [serverChecklistScore, setServerChecklistScore] = useState<number | null>(null) // 0~1
  const [serverZeroTrustScore, setServerZeroTrustScore] = useState<number | null>(null) // 0~1

  // 성숙도 레벨 정의
  const maturityLevels = [
    { level: '기존', range: '0-25점', description: 'Zero Trust 개념이 도입되지 않은 전통적인 보안 환경', color: 'red', bgColor: 'bg-red-50', textColor: 'text-red-700', borderColor: 'border-red-200' },
    { level: '초기', range: '26-50점', description: 'Zero Trust 개념을 도입하기 시작한 초기 단계', color: 'orange', bgColor: 'bg-orange-50', textColor: 'text-orange-700', borderColor: 'border-orange-200' },
    { level: '향상', range: '51-75점', description: 'Zero Trust 정책이 부분적으로 구현된 발전 단계', color: 'blue', bgColor: 'bg-[#10113C]/10', textColor: 'text-[#10113C]', borderColor: 'border-[#10113C]/20' },
    { level: '최적화', range: '76-100점', description: 'Zero Trust가 완전히 구현되고 최적화된 단계', color: 'green', bgColor: 'bg-green-50', textColor: 'text-green-700', borderColor: 'border-green-200' }
  ]

  // 파일 다운로드
  const handleDownload = (_fileType: 'checklist' | 'asset') => {
    const link = document.createElement('a')
    link.href = `/templates/check.xlsx`
    link.download = 'check.xlsx'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // 업로드
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, fileType: 'checklist' | 'asset') => {
    const file = event.target.files?.[0]
    if (!file) return

    // 파일 확장자 확인
    const fileName = file.name.toLowerCase()
    const hasValidExtension = fileName.endsWith('.xlsx') || fileName.endsWith('.xls')
    
    // MIME 타입 확인
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'application/octet-stream', // 일부 브라우저에서 빈 타입으로 인식
      '' 
    ]
    
    // 확장자 또는 MIME 타입 중 하나라도 유효하면 통과
    if (!hasValidExtension && !allowedTypes.includes(file.type)) {
      alert('Excel 파일(.xlsx, .xls)만 업로드 가능합니다.')
      return
    }

    const filteredFiles = uploadedFiles.filter(f => f.type !== fileType)
    const newFile: UploadedFile = { name: file.name, type: fileType, file }
    setUploadedFiles([...filteredFiles, newFile])

    if (fileType === 'checklist') setChecklistScore(null)
    if (fileType === 'asset') { setAssetScore(null); setAssetLTotal(null) }

    try {
      setFinalSheetError(null)
      setFinalSheetValue(null)
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const sheet = workbook.Sheets['Final']
      if (!sheet) {
        setFinalSheetError('업로드된 파일에서 "Final" 시트를 찾을 수 없습니다.')
        return
      }
      const targetCell = sheet['B1']
      if (!targetCell || targetCell.v === undefined || targetCell.v === null) {
        setFinalSheetError('"Final" 시트의 B1 셀에 값이 없습니다.')
        return
      }
      setFinalSheetValue(targetCell.v)
    } catch (err) {
      console.error(err)
      setFinalSheetError('Excel 파일을 해석하는 중 오류가 발생했습니다.')
    }
  }

  const handleFileRemove = (fileType: 'checklist' | 'asset') => {
    setUploadedFiles(uploadedFiles.filter(f => f.type !== fileType))
    if (fileType === 'checklist') setChecklistScore(null)
    if (fileType === 'asset') { setAssetScore(null); setAssetLTotal(null) }
    setFinalSheetValue(null)
    setFinalSheetError(null)
  }

  // 유틸
  const toNumber = (raw: any): number | null => {
    if (raw === null || raw === undefined) return null
    if (typeof raw === 'number') return Number.isNaN(raw) ? null : raw
    if (typeof raw === 'string') {
      const cleaned = raw.replace(/,/g, '').trim()
      if (cleaned === '') return null
      const n = parseFloat(cleaned)
      return Number.isNaN(n) ? null : n
    }
    return null
  }

  // 자산표 L열 합계
  const computeAssetLColumnSum = async (file: File): Promise<number> => {
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    let grandTotal = 0

    workbook.SheetNames.forEach((sheetName) => {
      const ws = workbook.Sheets[sheetName]
      if (!ws || !ws['!ref']) return
      const range = XLSX.utils.decode_range(ws['!ref'])
      const L_COL_INDEX = 11

      const countedRows = new Set<number>()
      let foundAny = false

      for (let r = range.s.r; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          const addr = XLSX.utils.encode_cell({ c, r })
          const cell = ws[addr]
          if (!cell || cell.v == null) continue
          const text = String(cell.v).replace(/\s+/g, '')
          if (/최종자산중요도/.test(text)) {
            const rightAddr = XLSX.utils.encode_cell({ c: c + 1, r })
            const rightCell = ws[rightAddr]
            const num = rightCell ? toNumber(rightCell.v) : null
            if (num !== null && !countedRows.has(r)) {
              grandTotal += num
              countedRows.add(r)
              foundAny = true
            }
          }
        }
      }

      if (!foundAny) {
        for (let r = range.s.r; r <= range.e.r; r++) {
          const lAddr = XLSX.utils.encode_cell({ c: L_COL_INDEX, r })
          const lCell = ws[lAddr]
          const num = lCell ? toNumber(lCell.v) : null
          if (num !== null) grandTotal += num
        }
      }
    })

    return grandTotal
  }

  const analyzeChecklist = async (): Promise<number> => {
    await new Promise(resolve => setTimeout(resolve, 300))
    return Math.floor(Math.random() * 40) + 60 // 60-100
  }

  const analyzeAsset = async (file: File): Promise<{ score: number, lTotal: number }> => {
    const lTotal = await computeAssetLColumnSum(file)
    const score = lTotal
    return { score, lTotal }
  }

  const handleAnalyze = async () => {
    if (uploadedFiles.length !== 1) {
      alert('성숙도/자산 체크리스트 파일을 업로드해주세요.')
      return
    }

    setIsAnalyzing(true)
    setEvaluationResult(null)
    setServerDetected([])
    setServerThreatScore(null)
    setServerChecklistScore(null)
    setServerZeroTrustScore(null)

    try {
      const checklist = await analyzeChecklist()
      setChecklistScore(checklist)

      const assetFile = uploadedFiles.find(f => f.type === 'asset')
      if (assetFile) {
        const { score, lTotal } = await analyzeAsset(assetFile.file)
        setAssetScore(score)
        setAssetLTotal(lTotal)
      }

      // Final!B1 값을 0~1 범위로 한 번만 정규화
      let payloadScore = (typeof finalSheetValue === 'number')
        ? finalSheetValue
        : parseFloat(String(finalSheetValue))

      if (!Number.isFinite(payloadScore)) {
        payloadScore = 0
      } else if (payloadScore > 1) {
        payloadScore = payloadScore / 100
      } else if (payloadScore < 0) {
        payloadScore = 0
      } else if (payloadScore > 1) {
        payloadScore = 1
      }

      const resp = await fetch(API_BASE_URL + '/diagnosis/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklistScore: payloadScore }) 
      })
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => null)
        throw new Error(errJson?.error || '진단 API 호출 실패')
      }
      const data = await resp.json()

      // 서버 응답 상태 업데이트
      setServerDetected(data?.detectedScenarios || [])
      setServerThreatScore(typeof data?.threatScore === 'number' ? data.threatScore : null)
      setServerChecklistScore(typeof data?.checklistScore === 'number' ? data.checklistScore : null)
      setServerZeroTrustScore(typeof data?.zeroTrustScore === 'number' ? data.zeroTrustScore : null)

      // UI 상단 카드에 맞게 변환
      const zeroTrustPct = Math.round((data?.zeroTrustScore || 0) * 100)

      // 서버 maturity.level '기존(Traditional)' 
      const rawLevel: string = data?.maturity?.level || ''
      const mappedLevel =
        rawLevel.includes('기존') ? '기존' :
        rawLevel.includes('초기') ? '초기' :
        rawLevel.includes('향상') ? '향상' :
        rawLevel.includes('최적화') ? '최적화' :
        rawLevel

      setEvaluationResult({
        totalScore: zeroTrustPct,
        maturityLevel: mappedLevel,
        maturityDescription: data?.maturity?.meaning || '',
        breakdown: {
          // 서버 값으로 구성
          maturity: Math.max(0, Math.min(100, Math.round((data?.checklistScore || 0) * 100))),
          asset: Math.max(0, Math.min(100, Math.round((data?.threatScore || 0) * 100))),
          threatModeling: 0,
          threatScenario: 0
        }
      })

      // 위협 개선 리포팅에서 사용할 최근 진단 결과를 브라우저에 저장
      try {
        const stored: ThreatReportStoredResult = {
          evaluationResult: {
            totalScore: zeroTrustPct,
            maturityLevel: mappedLevel,
            maturityDescription: data?.maturity?.meaning || '',
            breakdown: {
              maturity: Math.max(0, Math.min(100, Math.round((data?.checklistScore || 0) * 100))),
              asset: Math.max(0, Math.min(100, Math.round((data?.threatScore || 0) * 100))),
              threatModeling: 0,
              threatScenario: 0
            }
          },
          detectedScenarios: Array.isArray(data?.detectedScenarios)
            ? data.detectedScenarios
            : []
        }

        if (typeof window !== 'undefined') {
          window.localStorage.setItem('dapo:lastDiagnosisResult', JSON.stringify(stored))
        }
      } catch (e) {
        console.warn('마지막 진단 결과 저장 실패(무시 가능):', e)
      }
    } catch (e) {
      console.error('분석 중 오류:', e)
      alert((e as Error).message || '분석 중 오류가 발생했습니다.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const getMaturityLevelStyle = (level: string) => {
    const levelInfo = maturityLevels.find(l => l.level === level)
    return levelInfo || maturityLevels[0]
  }

  const formatNumber = (n: number) => new Intl.NumberFormat().format(n)

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center">
          <SearchCheck className="w-8 h-8 text-blue-600 mr-3" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">진단 평가</h1>
            <p className="text-gray-600 mt-1">성숙도 체크리스트와 자산표를 기반으로 Zero Trust 성숙도를 진단합니다</p>
          </div>
        </div>
      </div>

      {/* 템플릿 다운로드 */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">1단계: 템플릿 파일 다운로드</h2>
        <p className="text-gray-600 mb-6">이 성숙도와 자산표를 기입하여 제출해주세요</p>
        <div className="flex justify-center">
          <div className="border border-gray-200 rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center mb-3">
              <FileSpreadsheet className="w-6 h-6 text-[#10113C] mr-2" />
              <h3 className="font-semibold text-gray-900">성숙도/자산 체크리스트</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">Zero Trust 구현 현황과 자산 정보를 기록할 수 있는 통합 체크리스트입니다.</p>
            <button
              onClick={() => handleDownload('checklist')}
              className="flex items-center space-x-2 bg-[#10113C] text-white px-4 py-2 rounded-lg hover:bg-[#10113C]/90 transition-colors w-full justify-center"
            >
              <Download className="w-4 h-4" />
              <span>다운로드</span>
            </button>
          </div>
        </div>
      </div>

      {/* 업로드 */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">2단계: 작성된 파일 업로드</h2>
        <p className="text-gray-600 mb-6">작성이 완료된 파일을 업로드해주세요.</p>

        <div className="flex justify-center">
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 w-full max-w-md">
            <div className="text-center">
              <FileSpreadsheet className="w-16 h-16 text-[#10113C] mx-auto mb-4" />
              <h3 className="font-semibold text-gray-900 mb-2">성숙도/자산 체크리스트</h3>

              {uploadedFiles.find(f => f.type === 'checklist') ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-center space-x-2 text-[#10113C]">
                    <CheckCircle className="w-5 h-5" />
                    <span className="text-sm font-medium">
                      {uploadedFiles.find(f => f.type === 'checklist')?.name}
                    </span>
                  </div>
                  <button
                    onClick={() => handleFileRemove('checklist')}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    파일 제거
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500">Excel 파일을 선택해주세요</p>
                  <label className="inline-block bg-[#10113C] text-white px-4 py-2 rounded-lg hover:bg-[#10113C]/90 cursor-pointer transition-colors">
                    <Upload className="w-4 h-4 inline mr-2" />
                    파일 선택
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={(e) => handleFileUpload(e, 'checklist')}
                      className="hidden"
                    />
                  </label>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Final!B1 표시 */}
        {(finalSheetValue !== null || finalSheetError) && (
          <div className="mt-6 bg-white rounded-lg shadow-sm p-6 border border-indigo-200">
            <h3 className="text-xl font-semibold text-gray-900 mb-2">체크리스트 진단 점수</h3>
            {finalSheetError ? (
              <p className="text-red-600">{finalSheetError}</p>
            ) : (
              <p className="text-gray-800 text-3xl font-bold">{String(finalSheetValue)}</p>
            )}
          </div>
        )}

        {/* 분석 버튼 */}
        <div className="mt-6 text-center">
          <button
            onClick={handleAnalyze}
            disabled={uploadedFiles.length !== 1 || isAnalyzing}
            className="flex items-center space-x-2 bg-purple-600 text-white px-8 py-3 rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors mx-auto"
          >
            <Calculator className="w-5 h-5" />
            <span>{isAnalyzing ? '분석 진행 중...' : '분석 시작'}</span>
          </button>

          {uploadedFiles.length !== 1 && (
            <p className="text-sm text-gray-500 mt-2">파일을 업로드해야 분석을 시작할 수 있습니다.</p>
          )}
        </div>
      </div>

      {/* 진행 상태 */}
      {isAnalyzing && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="text-center">
            <div className="inline-block relative w-20 h-20">
              <div className="absolute inset-0 border-8 border-purple-200 rounded-full"></div>
              <div className="absolute inset-0 border-8 border-transparent border-t-purple-600 rounded-full animate-spin"></div>
              <div className="absolute inset-2 border-8 border-transparent border-t-indigo-500 rounded-full animate-spin" style={{ animationDuration: '1.5s' }}></div>
              <div className="absolute inset-4 border-8 border-transparent border-t-purple-400 rounded-full animate-spin" style={{ animationDuration: '2s' }}></div>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2 mt-6">파일 분석 중</h3>
            <p className="text-gray-600">업로드된 파일들을 분석하여 Zero Trust 성숙도를 계산하고 있습니다...</p>
            <div className="mt-4 space-y-2 text-sm text-gray-500">
              <p>• 성숙도 체크리스트 분석</p>
              <p>• 자산표 데이터 처리 (최종 자산 중요도 인접 셀 합계 계산)</p>
              <p>• 위협 모델링 가중치 계산</p>
              <p>• 위협 시나리오 가중치 적용</p>
            </div>
          </div>
        </div>
      )}

      {/* 결과 */}
      {evaluationResult && (
        <div className="space-y-6">
          {/* 종합 결과 */}
          <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-6 border border-purple-200">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">총 진단 결과</h2>
              <div className="text-6xl font-bold text-purple-600 mb-4">{evaluationResult.totalScore}점</div>
            </div>

            {/* Zero Trust 성숙도 단계 - 총 진단 결과 바로 아래 배치 */}
            <div className="max-w-3xl mx-auto mb-6">
              <div className={`text-center p-6 rounded-lg ${getMaturityLevelStyle(evaluationResult.maturityLevel).bgColor} ${getMaturityLevelStyle(evaluationResult.maturityLevel).borderColor} border-2 shadow-md`}>
                <div className="flex items-center justify-center mb-3">
                  <TrendingUp className={`w-8 h-8 mr-3 ${getMaturityLevelStyle(evaluationResult.maturityLevel).textColor}`} />
                  <span className={`text-3xl font-bold ${getMaturityLevelStyle(evaluationResult.maturityLevel).textColor}`}>
                    {evaluationResult.maturityLevel} 단계
                  </span>
                </div>
                <p className={`text-lg ${getMaturityLevelStyle(evaluationResult.maturityLevel).textColor}`}>{evaluationResult.maturityDescription}</p>
              </div>
            </div>

            {/* 서버 세부 수치 */}
            <div className="max-w-3xl mx-auto mt-4 text-sm text-gray-700 bg-white rounded-lg p-4 border border-gray-200">
              <ul className="space-y-2">
                <li className="flex justify-between"><span className="font-medium">탐지된 위협 시나리오:</span> <span className="text-gray-900">{serverDetected.length ? serverDetected.join(', ') : '없음'}</span></li>
                <li className="flex justify-between"><span className="font-medium">위험 점수(threatScore):</span> <span className="text-gray-900">{serverThreatScore ?? '-'}</span></li>
                <li className="flex justify-between"><span className="font-medium">체크리스트 진단 점수:</span> <span className="text-gray-900">{serverChecklistScore ?? '-'}</span></li>
                <li className="flex justify-between border-t pt-2 mt-2"><span className="font-bold">제로트러스트 진단 점수(= 체크리스트 × 위험):</span> <span className="text-purple-600 font-bold">{serverZeroTrustScore ?? '-'}</span></li>
              </ul>
            </div>
          </div>


          {/* 개별 파일 결과 카드 - 자산표 */}
          {assetScore !== null && (
            <div className="bg-white rounded-lg shadow-sm p-6 border border-[#10113C]/20">
              <h3 className="text-xl font-semibold text-gray-900 mb-2">자산표 분석 결과(로컬)</h3>
              <p className="text-gray-600 mb-1">각 시트에서 '최종 자산 중요도' 텍스트 오른쪽 셀의 값을 합산했습니다. (미탐색 시 L열 전체 스캔)</p>
              {assetLTotal !== null && (
                <p className="text-sm text-gray-500 mb-4">합계: <span className="font-semibold text-[#10113C]">{formatNumber(assetLTotal)}</span></p>
              )}
              <div className="text-3xl font-bold text-[#10113C]">{assetScore.toFixed(2)}</div>
            </div>
          )}

          {/* 세부 점수 분석 - 3개 카드 통합 */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-6 text-center">세부 점수 분석</h3>

            {/* 2개 점수 카드 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="bg-gradient-to-br from-[#10113C]/10 to-[#10113C]/5 rounded-lg p-6 border-2 border-[#10113C]/30 shadow-md">
                <h4 className="font-bold text-[#10113C] text-lg mb-3">체크리스트</h4>
                <div className="text-5xl font-bold text-[#10113C] mb-3">{evaluationResult.breakdown.maturity}점</div>
                <div className="w-full bg-[#10113C]/20 rounded-full h-3">
                  <div
                    className="h-3 rounded-full bg-[#10113C]"
                    style={{ width: `${evaluationResult.breakdown.maturity}%` }}
                  ></div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-6 border-2 border-orange-300 shadow-md">
                <h4 className="font-bold text-orange-900 text-lg mb-3">위협 시나리오</h4>
                {serverThreatScore === 1 ? (
                  <div>
                    <div className="text-3xl font-bold text-orange-900 mb-3">발견된 위협이 없으므로 1을 곱합니다.</div>
                  </div>
                ) : (
                  <>
                    <div className="text-5xl font-bold text-orange-900 mb-3">{evaluationResult.breakdown.asset}점</div>
                    <div className="w-full bg-orange-200 rounded-full h-3">
                      <div
                        className="h-3 rounded-full bg-gradient-to-r from-orange-500 to-orange-700"
                        style={{ width: `${evaluationResult.breakdown.asset}%` }}
                      ></div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* 제로트러스트 진단 점수 계산 시각화 */}
            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-8 border-2 border-purple-300 shadow-lg">
              <h4 className="text-center text-xl font-bold text-gray-900 mb-6">제로트러스트 진단 점수 계산</h4>
              <div className="flex flex-col md:flex-row items-center justify-center md:space-x-3 space-y-4 md:space-y-0">
                <div className="text-center bg-[#10113C]/20 rounded-lg p-4 border-2 border-[#10113C]/40 shadow-md min-w-[120px]">
                  <div className="text-3xl font-bold text-[#10113C]">{evaluationResult.breakdown.maturity}</div>
                  <div className="text-xs text-[#10113C] mt-1 font-semibold">체크리스트</div>
                </div>
                <div className="text-4xl text-purple-600 font-bold">×</div>
                <div className="text-center bg-orange-100 rounded-lg p-4 border-2 border-orange-400 shadow-md min-w-[120px]">
                  {serverThreatScore === 1 ? (
                    <>
                      <div className="text-2xl font-bold text-orange-700">1</div>
                      <div className="text-xs text-orange-600 mt-1 font-semibold">위협 없음</div>
                    </>
                  ) : (
                    <>
                      <div className="text-3xl font-bold text-orange-700">{evaluationResult.breakdown.asset}</div>
                      <div className="text-xs text-orange-600 mt-1 font-semibold">위협 시나리오</div>
                    </>
                  )}
                </div>
                <div className="text-4xl text-purple-600 font-bold">=</div>
                <div className="text-center bg-gradient-to-br from-purple-100 to-indigo-100 rounded-lg p-6 border-4 border-purple-500 shadow-2xl min-w-[160px]">
                  <div className="text-5xl font-bold text-purple-700">{evaluationResult.totalScore}</div>
                  <div className="text-sm text-purple-600 mt-2 font-bold">최종 점수</div>
                </div>
              </div>
            </div>
          </div>

          {/* 단계 설명 */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-6">성숙도 단계별 설명</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {maturityLevels.map((level, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg border-2 ${level.bgColor} ${level.borderColor} ${
                    level.level === evaluationResult.maturityLevel ? 'ring-2 ring-offset-2 ring-purple-500' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className={`font-bold ${level.textColor}`}>{level.level}</h4>
                    {level.level === evaluationResult.maturityLevel && (
                      <CheckCircle className="w-5 h-5 text-purple-600" />
                    )}
                  </div>
                    <div className={`text-sm ${level.textColor} mb-2`}>{level.range}</div>
                    <p className={`text-sm ${level.textColor}`}>{level.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DiagnosisEvaluation