
import React, { useState } from 'react'
import {Target, Shield, AlertTriangle, CheckCircle, XCircle, Play, Eye, X} from 'lucide-react'

const ZTAttackTest: React.FC = () => {
  const [selectedAttacks, setSelectedAttacks] = useState<string[]>([])
  const [attackResults, setAttackResults] = useState<any[]>([])
  const [isAttacking, setIsAttacking] = useState(false)
  const [selectedAttackDetail, setSelectedAttackDetail] = useState<any>(null)

  const ztAttacks = [
    {
      id: 'lateral_movement',
      name: '측면 이동 공격',
      category: 'ZT',
      severity: 'high',
      description: 'Zero Trust 네트워크에서 측면 이동을 시도하는 공격',
      target: '네트워크 세분화',
      method: '내부 네트워크 스캔 및 서비스 탐지'
    },
    {
      id: 'privilege_escalation',
      name: '권한 상승 공격',
      category: 'ZT',
      severity: 'high',
      description: '최소 권한 원칙을 우회하여 권한을 상승시키는 공격',
      target: '접근 제어',
      method: '취약한 서비스 및 설정 악용'
    },
    {
      id: 'identity_spoofing',
      name: '신원 스푸핑',
      category: 'ZT',
      severity: 'medium',
      description: '신뢰할 수 없는 디바이스에서 신뢰받는 신원으로 위장',
      target: '신원 검증',
      method: '인증서 위조 및 디바이스 ID 조작'
    },
    {
      id: 'policy_bypass',
      name: '정책 우회',
      category: 'ZT',
      severity: 'high',
      description: 'Zero Trust 정책을 우회하여 무단 접근 시도',
      target: '정책 엔진',
      method: '정책 로직 취약점 악용'
    }
  ]

  const cveAttacks = [
    {
      id: 'cve_2023_0001',
      name: 'CVE-2023-0001 (OpenSSL)',
      category: 'CVE',
      severity: 'critical',
      description: 'OpenSSL 라이브러리의 버퍼 오버플로우 취약점',
      target: 'TLS/SSL 통신',
      method: '악의적인 인증서를 통한 원격 코드 실행'
    },
    {
      id: 'cve_2022_1234',
      name: 'CVE-2022-1234 (Apache)',
      category: 'CVE',
      severity: 'high',
      description: 'Apache HTTP 서버의 디렉토리 순회 취약점',
      target: '웹 서버',
      method: '경로 조작을 통한 파일 시스템 접근'
    },
    {
      id: 'cve_2023_5678',
      name: 'CVE-2023-5678 (Windows)',
      category: 'CVE',
      severity: 'high',
      description: 'Windows 커널의 권한 상승 취약점',
      target: '운영체제',
      method: '시스템 호출 악용을 통한 커널 권한 획득'
    },
    {
      id: 'cve_2022_9999',
      name: 'CVE-2022-9999 (Docker)',
      category: 'CVE',
      severity: 'medium',
      description: 'Docker 컨테이너 탈출 취약점',
      target: '컨테이너 런타임',
      method: '컨테이너 격리 우회를 통한 호스트 접근'
    }
  ]

  const allAttacks = [...ztAttacks, ...cveAttacks]

  const handleAttackToggle = (attackId: string) => {
    setSelectedAttacks(prev => 
      prev.includes(attackId) 
        ? prev.filter(a => a !== attackId)
        : [...prev, attackId]
    )
  }

  const handleStartAttack = async () => {
    if (selectedAttacks.length === 0) return

    setIsAttacking(true)
    setAttackResults([])

    for (const attackId of selectedAttacks) {
      await new Promise(resolve => setTimeout(resolve, 3000))
      
      const attack = allAttacks.find(a => a.id === attackId)
      const mockResult = generateMockAttackResult(attack)
      
      setAttackResults(prev => [...prev, mockResult])
    }

    setIsAttacking(false)
  }

  const generateMockAttackResult = (attack: any) => {
    const isBlocked = Math.random() > 0.3 // 70% 차단 확률
    const detectionTime = Math.floor(Math.random() * 5) + 1 // 1-5초
    
    return {
      ...attack,
      blocked: isBlocked,
      detectionTime: detectionTime,
      timestamp: new Date().toLocaleTimeString(),
      details: {
        attempts: Math.floor(Math.random() * 10) + 1,
        sourceIP: `10.10.10.${Math.floor(Math.random() * 254) + 1}`,
        targetService: ['web-service', 'auth-service', 'data-service'][Math.floor(Math.random() * 3)],
        alertsTriggered: Math.floor(Math.random() * 5) + 1
      },
      recommendations: isBlocked ? [
        '현재 정책이 효과적으로 작동하고 있습니다',
        '지속적인 모니터링을 유지하세요',
        '정책 업데이트를 정기적으로 검토하세요'
      ] : [
        '해당 공격 벡터에 대한 정책을 강화하세요',
        '추가적인 모니터링 규칙을 설정하세요',
        '관련 시스템의 보안 패치를 확인하세요'
      ]
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-700 bg-red-100 border-red-300'
      case 'high': return 'text-orange-700 bg-orange-100 border-orange-300'
      case 'medium': return 'text-yellow-700 bg-yellow-100 border-yellow-300'
      case 'low': return 'text-green-700 bg-green-100 border-green-300'
      default: return 'text-gray-700 bg-gray-100 border-gray-300'
    }
  }

  const getCategoryColor = (category: string) => {
    return category === 'ZT' 
      ? 'text-blue-700 bg-blue-100 border-blue-300'
      : 'text-purple-700 bg-purple-100 border-purple-300'
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Target className="w-8 h-8 text-red-600 mr-3" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">ZT 공격 검증</h1>
              <p className="text-gray-600 mt-1">Zero Trust 정책의 방어 능력을 모의 공격으로 검증합니다</p>
            </div>
          </div>
        </div>
      </div>

      {/* 공격 선택 */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">공격 시나리오 선택</h2>
        
        {/* ZT 기반 공격 */}
        <div className="mb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-3">Zero Trust 기반 공격</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ztAttacks.map((attack) => (
              <div
                key={attack.id}
                className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  selectedAttacks.includes(attack.id) 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => handleAttackToggle(attack.id)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={selectedAttacks.includes(attack.id)}
                      onChange={() => handleAttackToggle(attack.id)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <h4 className="font-medium text-gray-900">{attack.name}</h4>
                  </div>
                  <div className="flex space-x-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium border ${getCategoryColor(attack.category)}`}>
                      {attack.category}
                    </span>
                    <span className={`px-2 py-1 rounded text-xs font-medium border ${getSeverityColor(attack.severity)}`}>
                      {attack.severity}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mb-2">{attack.description}</p>
                <div className="text-xs text-gray-500">
                  <span className="font-medium">대상:</span> {attack.target}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CVE 기반 공격 */}
        <div className="mb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-3">CVE 기반 공격</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {cveAttacks.map((attack) => (
              <div
                key={attack.id}
                className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  selectedAttacks.includes(attack.id) 
                    ? 'border-purple-500 bg-purple-50' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => handleAttackToggle(attack.id)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={selectedAttacks.includes(attack.id)}
                      onChange={() => handleAttackToggle(attack.id)}
                      className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                    />
                    <h4 className="font-medium text-gray-900">{attack.name}</h4>
                  </div>
                  <div className="flex space-x-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium border ${getCategoryColor(attack.category)}`}>
                      {attack.category}
                    </span>
                    <span className={`px-2 py-1 rounded text-xs font-medium border ${getSeverityColor(attack.severity)}`}>
                      {attack.severity}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mb-2">{attack.description}</p>
                <div className="text-xs text-gray-500">
                  <span className="font-medium">대상:</span> {attack.target}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">
            {selectedAttacks.length}개 공격 시나리오 선택됨
          </span>
          <button
            onClick={handleStartAttack}
            disabled={selectedAttacks.length === 0 || isAttacking}
            className="flex items-center space-x-2 bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            <Play className="w-4 h-4" />
            <span>{isAttacking ? '공격 진행 중...' : '공격 시작'}</span>
          </button>
        </div>
      </div>

      {/* 공격 진행 상태 */}
      {isAttacking && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">모의 공격 진행 중</h3>
            <p className="text-gray-600">선택하신 공격 시나리오를 실행하고 있습니다...</p>
          </div>
        </div>
      )}

      {/* 공격 결과 */}
      {attackResults.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">공격 검증 결과</h2>
          
          <div className="space-y-4">
            {attackResults.map((result, index) => (
              <div key={index} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <h3 className="font-semibold text-gray-900">{result.name}</h3>
                    <span className={`px-2 py-1 rounded text-xs font-medium border ${getCategoryColor(result.category)}`}>
                      {result.category}
                    </span>
                    <span className={`px-2 py-1 rounded text-xs font-medium border ${getSeverityColor(result.severity)}`}>
                      {result.severity}
                    </span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => setSelectedAttackDetail(result)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <div className="flex items-center space-x-2">
                      {result.blocked ? (
                        <>
                          <Shield className="w-5 h-5 text-green-600" />
                          <span className="text-green-600 font-medium">차단됨</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-5 h-5 text-red-600" />
                          <span className="text-red-600 font-medium">차단 실패</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-700">탐지 시간:</span>
                    <span className="ml-1 text-gray-600">{result.detectionTime}초</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">시도 횟수:</span>
                    <span className="ml-1 text-gray-600">{result.details.attempts}회</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">소스 IP:</span>
                    <span className="ml-1 text-gray-600">{result.details.sourceIP}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">실행 시간:</span>
                    <span className="ml-1 text-gray-600">{result.timestamp}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 공격 결과 상세 모달 */}
          {selectedAttackDetail && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">{selectedAttackDetail.name}</h3>
                  <button
                    onClick={() => setSelectedAttackDetail(null)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">공격 상세 정보</h4>
                    <p className="text-gray-600 mb-2">{selectedAttackDetail.description}</p>
                    <p className="text-sm text-gray-500"><strong>공격 방법:</strong> {selectedAttackDetail.method}</p>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">탐지 결과</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div><strong>차단 여부:</strong> {selectedAttackDetail.blocked ? '성공' : '실패'}</div>
                      <div><strong>탐지 시간:</strong> {selectedAttackDetail.detectionTime}초</div>
                      <div><strong>대상 서비스:</strong> {selectedAttackDetail.details.targetService}</div>
                      <div><strong>알림 발생:</strong> {selectedAttackDetail.details.alertsTriggered}건</div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">권장 사항</h4>
                    <ul className="space-y-1">
                      {selectedAttackDetail.recommendations.map((rec: string, index: number) => (
                        <li key={index} className="flex items-start space-x-2">
                          <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                          <span className="text-gray-700">{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 종합 결과 요약 */}
          <div className="mt-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-200">
            <h3 className="text-lg font-semibold text-blue-900 mb-4">공격 검증 요약</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-lg border border-blue-200">
                <div className="text-2xl font-bold text-green-600">
                  {attackResults.filter(r => r.blocked).length}
                </div>
                <div className="text-sm text-blue-700">차단 성공</div>
              </div>
              <div className="bg-white p-4 rounded-lg border border-blue-200">
                <div className="text-2xl font-bold text-red-600">
                  {attackResults.filter(r => !r.blocked).length}
                </div>
                <div className="text-sm text-blue-700">차단 실패</div>
              </div>
              <div className="bg-white p-4 rounded-lg border border-blue-200">
                <div className="text-2xl font-bold text-blue-600">
                  {Math.round((attackResults.filter(r => r.blocked).length / attackResults.length) * 100)}%
                </div>
                <div className="text-sm text-blue-700">방어 성공률</div>
              </div>
              <div className="bg-white p-4 rounded-lg border border-blue-200">
                <div className="text-2xl font-bold text-blue-600">
                  {Math.round(attackResults.reduce((sum, r) => sum + r.detectionTime, 0) / attackResults.length)}초
                </div>
                <div className="text-sm text-blue-700">평균 탐지 시간</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ZTAttackTest
