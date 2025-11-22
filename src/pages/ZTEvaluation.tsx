
import React, { useState } from 'react'
import {TrendingUp, CheckCircle, XCircle, AlertTriangle, Play, Shield, Network, FileText, BarChart3} from 'lucide-react'

const ZTEvaluation: React.FC = () => {
  const [selectedEvaluations, setSelectedEvaluations] = useState<string[]>([])
  const [evaluationResults, setEvaluationResults] = useState<any[]>([])
  const [isEvaluating, setIsEvaluating] = useState(false)

  const evaluationTypes = [
    {
      id: 'network',
      name: 'ZT 네트워크 평가',
      description: 'Zero Trust 네트워크 아키텍처 및 보안 정책 평가',
      icon: Network,
      color: 'blue'
    },
    {
      id: 'process',
      name: 'ZT 프로세스 평가',
      description: 'Zero Trust 프로세스 통제 및 모니터링 평가',
      icon: BarChart3,
      color: 'green'
    },
    {
      id: 'policy',
      name: 'ZT 정책문서 평가',
      description: 'Zero Trust 정책 문서 및 규정 준수 평가',
      icon: FileText,
      color: 'purple'
    }
  ]

  const handleEvaluationToggle = (evaluationId: string) => {
    setSelectedEvaluations(prev => 
      prev.includes(evaluationId) 
        ? prev.filter(e => e !== evaluationId)
        : [...prev, evaluationId]
    )
  }

  const handleStartEvaluation = async () => {
    if (selectedEvaluations.length === 0) return

    setIsEvaluating(true)
    setEvaluationResults([])

    // 시뮬레이션된 평가 진행
    for (const evalId of selectedEvaluations) {
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const evalType = evaluationTypes.find(e => e.id === evalId)
      const mockResult = generateMockResult(evalId, evalType?.name || '')
      
      setEvaluationResults(prev => [...prev, mockResult])
    }

    setIsEvaluating(false)
  }

  const generateMockResult = (evalId: string, evalName: string) => {
    const baseScore = Math.floor(Math.random() * 30) + 70 // 70-100 점수
    
    const mockResults: Record<string, {
      id: string
      name: string
      score: number
      status: string
      details: { category: string; score: number; status: string }[]
      recommendations: string[]
    }> = {
      network: {
        id: evalId,
        name: evalName,
        score: baseScore,
        status: baseScore >= 85 ? 'excellent' : baseScore >= 70 ? 'good' : 'warning',
        details: [
          { category: '네트워크 세분화', score: Math.floor(Math.random() * 20) + 80, status: 'good' },
          { category: 'Zero Trust 아키텍처', score: Math.floor(Math.random() * 15) + 85, status: 'excellent' },
          { category: '트래픽 모니터링', score: Math.floor(Math.random() * 25) + 75, status: 'good' },
          { category: '접근 제어', score: Math.floor(Math.random() * 20) + 80, status: 'good' }
        ],
        recommendations: [
          '마이크로 세분화 정책을 더욱 세밀하게 구성하세요',
          'East-West 트래픽 검사를 강화하세요',
          '네트워크 이상 탐지 시스템을 개선하세요'
        ]
      },
      process: {
        id: evalId,
        name: evalName,
        score: baseScore,
        status: baseScore >= 85 ? 'excellent' : baseScore >= 70 ? 'good' : 'warning',
        details: [
          { category: '프로세스 모니터링', score: Math.floor(Math.random() * 20) + 80, status: 'good' },
          { category: '자동화 수준', score: Math.floor(Math.random() * 25) + 75, status: 'good' },
          { category: '정책 적용', score: Math.floor(Math.random() * 15) + 85, status: 'excellent' },
          { category: '로그 관리', score: Math.floor(Math.random() * 30) + 70, status: 'warning' }
        ],
        recommendations: [
          '프로세스 블랙리스트 정책을 확장하세요',
          '실시간 프로세스 모니터링을 강화하세요',
          '자동화된 대응 체계를 구축하세요'
        ]
      },
      policy: {
        id: evalId,
        name: evalName,
        score: baseScore,
        status: baseScore >= 85 ? 'excellent' : baseScore >= 70 ? 'good' : 'warning',
        details: [
          { category: '정책 문서화', score: Math.floor(Math.random() * 20) + 80, status: 'good' },
          { category: '규정 준수', score: Math.floor(Math.random() * 15) + 85, status: 'excellent' },
          { category: '정책 업데이트', score: Math.floor(Math.random() * 25) + 75, status: 'good' },
          { category: '교육 및 훈련', score: Math.floor(Math.random() * 30) + 70, status: 'warning' }
        ],
        recommendations: [
          '정책 문서의 정기적 업데이트 프로세스를 수립하세요',
          '직원 대상 Zero Trust 교육을 강화하세요',
          '정책 위반 시 대응 절차를 명확히 하세요'
        ]
      }
    }

    return mockResults[evalId] || mockResults.network
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'excellent': return 'text-green-600 bg-green-100'
      case 'good': return 'text-blue-600 bg-blue-100'
      case 'warning': return 'text-orange-600 bg-orange-100'
      case 'error': return 'text-red-600 bg-red-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'excellent': return <CheckCircle className="w-5 h-5 text-[#0d4f2c]" />
      case 'good': return <CheckCircle className="w-5 h-5 text-[#0d4f2c]" />
      case 'warning': return <CheckCircle className="w-5 h-5 text-[#0d4f2c]" />
      case 'error': return <XCircle className="w-5 h-5 text-red-600" />
      default: return <AlertTriangle className="w-5 h-5 text-gray-600" />
    }
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <TrendingUp className="w-8 h-8 text-blue-600 mr-3" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">ZT 평가</h1>
              <p className="text-gray-600 mt-1">Zero Trust 구현 수준을 종합적으로 평가합니다</p>
            </div>
          </div>
        </div>
      </div>

      {/* 평가 항목 선택 */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">평가 항목 선택</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {evaluationTypes.map((evalType) => {
            const Icon = evalType.icon
            const isSelected = selectedEvaluations.includes(evalType.id)
            return (
              <div
                key={evalType.id}
                className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  isSelected 
                    ? evalType.color === 'blue' 
                      ? 'border-blue-500 bg-blue-50'
                      : evalType.color === 'green'
                      ? 'border-green-500 bg-green-50'
                      : 'border-purple-500 bg-purple-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => handleEvaluationToggle(evalType.id)}
              >
                <div className="flex items-center space-x-3 mb-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleEvaluationToggle(evalType.id)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <Icon className={`w-6 h-6 ${
                    evalType.color === 'blue' 
                      ? 'text-blue-600'
                      : evalType.color === 'green'
                      ? 'text-green-600'
                      : 'text-purple-600'
                  }`} />
                  <h3 className="font-semibold text-gray-900">{evalType.name}</h3>
                </div>
                <p className="text-sm text-gray-600">{evalType.description}</p>
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">
            {selectedEvaluations.length}개 항목 선택됨
          </span>
          <button
            onClick={handleStartEvaluation}
            disabled={selectedEvaluations.length === 0 || isEvaluating}
            className="flex items-center space-x-2 bg-[#10113C] text-white px-6 py-2 rounded-lg hover:bg-[#10113C]/90 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            <Play className="w-4 h-4" />
            <span>{isEvaluating ? '평가 진행 중...' : '평가 시작'}</span>
          </button>
        </div>
      </div>

      {/* 평가 진행 상태 */}
      {isEvaluating && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">평가 진행 중</h3>
            <p className="text-gray-600">선택하신 항목들을 평가하고 있습니다...</p>
          </div>
        </div>
      )}

      {/* 평가 결과 */}
      {evaluationResults.length > 0 && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">평가 결과</h2>
            
            {evaluationResults.map((result, index) => (
              <div key={index} className="mb-8 last:mb-0">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">{result.name}</h3>
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(result.status)}
                    <span className="text-2xl font-bold text-gray-900">{result.score}점</span>
                  </div>
                </div>

                {/* 세부 평가 결과 */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  {result.details.map((detail: any, detailIndex: number) => (
                    <div key={detailIndex} className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-gray-900">{detail.category}</h4>
                        {getStatusIcon(detail.status)}
                      </div>
                      <div className="text-2xl font-bold text-gray-900 mb-2">{detail.score}점</div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="h-2 rounded-full bg-[#0d4f2c]"
                          style={{ width: `${detail.score}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 개선 권장사항 */}
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <h4 className="font-semibold text-blue-900 mb-3">개선 권장사항</h4>
                  <ul className="space-y-2">
                    {result.recommendations.map((recommendation: string, recIndex: number) => (
                      <li key={recIndex} className="flex items-start space-x-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                        <span className="text-blue-800">{recommendation}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>

          {/* 종합 평가 요약 */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-200">
            <h3 className="text-lg font-semibold text-blue-900 mb-4">종합 평가 요약</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded-lg border border-blue-200">
                <div className="text-2xl font-bold text-blue-900">
                  {Math.round(evaluationResults.reduce((sum, result) => sum + result.score, 0) / evaluationResults.length)}점
                </div>
                <div className="text-sm text-blue-700">평균 점수</div>
              </div>
              <div className="bg-white p-4 rounded-lg border border-blue-200">
                <div className="text-2xl font-bold text-blue-900">
                  {evaluationResults.filter(r => r.status === 'excellent' || r.status === 'good').length}
                </div>
                <div className="text-sm text-blue-700">양호 이상 항목</div>
              </div>
              <div className="bg-white p-4 rounded-lg border border-blue-200">
                <div className="text-2xl font-bold text-blue-900">
                  {evaluationResults.filter(r => r.status === 'warning' || r.status === 'error').length}
                </div>
                <div className="text-sm text-blue-700">개선 필요 항목</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ZTEvaluation
