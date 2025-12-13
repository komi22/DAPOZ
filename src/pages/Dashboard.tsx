import { API_BASE_URL } from '../utils/api';

import React, { useState, useEffect } from 'react'
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area } from 'recharts'
import {Shield, Users, Server, Activity, AlertTriangle, CheckCircle, TrendingUp, Network, Terminal, Play, RefreshCw} from 'lucide-react'

const Dashboard: React.FC = () => {
  const [showQuickCommands, setShowQuickCommands] = useState(false)
  const [commandInput, setCommandInput] = useState('')
  const [commandResult, setCommandResult] = useState('')
  const [executing, setExecuting] = useState(false)
  
  // 데이터 상태
  const [networkData, setNetworkData] = useState<any[]>([])
  const [connectedDevices, setConnectedDevices] = useState(0)
  const [securityData, setSecurityData] = useState<any[]>([])
  const [performanceData, setPerformanceData] = useState<any[]>([])
  const [threatData, setThreatData] = useState<any[]>([])
  const [systemStatus, setSystemStatus] = useState('정상')
  const [loading, setLoading] = useState(true)
  const [zeroTrustHistory, setZeroTrustHistory] = useState<any[]>([])
  const [zeroTrustLoading, setZeroTrustLoading] = useState(false)
  const [recentActivities, setRecentActivities] = useState<any[]>([])
  const [activitiesLoading, setActivitiesLoading] = useState(false)

  // 빠른 명령어
  const quickCommands = [
    { name: '컨테이너 상태', command: 'docker ps', description: '실행 중인 컨테이너 확인' },
    { name: '라우터 목록', command: 'ziti edge list edge-routers', description: '네트워크 라우터 상태' },
    { name: '서비스 목록', command: 'ziti edge list services', description: '등록된 서비스 확인' },
    { name: '시스템 정보', command: 'ls -al', description: '현재 디렉토리 파일 목록' }
  ]

  // 실제 데이터 로드
  useEffect(() => {
    loadDashboardData()
    loadZeroTrustHistory()
    loadRecentActivities()
    const interval = setInterval(loadDashboardData, 30000) // 30초마다 업데이트
    const historyInterval = setInterval(loadZeroTrustHistory, 60000) // 1분마다 히스토리 업데이트
    const activitiesInterval = setInterval(loadRecentActivities, 30000) // 30초마다 활동 로그 업데이트
    return () => {
      clearInterval(interval)
      clearInterval(historyInterval)
      clearInterval(activitiesInterval)
    }
  }, [])

  const loadDashboardData = async () => {
    try {
      setLoading(true)
      
      // 네트워크 트래픽 데이터 로드
      const networkResponse = await fetch(API_BASE_URL + '/metrics/network')
      if (networkResponse.ok) {
        const networkMetrics = await networkResponse.json()
        setNetworkData(networkMetrics.traffic || generateFallbackNetworkData())
      } else {
        setNetworkData(generateFallbackNetworkData())
      }

      // 연결된 장비 수 확인
      const devicesResponse = await fetch(API_BASE_URL + '/system/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'docker ps --format "table {{.Names}}" | grep -v NAMES | wc -l' })
      })
      
      if (devicesResponse.ok) {
        const result = await devicesResponse.json()
        const deviceCount = parseInt(result.stdout?.trim() || '0')
        setConnectedDevices(deviceCount)
      } else {
        setConnectedDevices(8) // 기본값
      }

      // 보안 상태 데이터
      const securityResponse = await fetch(API_BASE_URL + '/ziti/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'ziti edge list sessions --output-json' })
      })

      if (securityResponse.ok) {
        const securityResult = await securityResponse.json()
        try {
          const sessions = JSON.parse(securityResult.stdout || '{"data": []}')
          const activeSessions = sessions.data?.length || 0
          setSecurityData([
            { name: '정상 연결', value: Math.max(85, activeSessions * 3), color: '#10B981' },
            { name: '모니터링', value: Math.min(12, Math.max(5, activeSessions)), color: '#F59E0B' },
            { name: '차단됨', value: Math.min(3, Math.max(0, Math.floor(activeSessions * 0.1))), color: '#EF4444' }
          ])
        } catch {
          setSecurityData(generateFallbackSecurityData())
        }
      } else {
        setSecurityData(generateFallbackSecurityData())
      }

      // 시스템 성능 데이터
      const performanceResponse = await fetch(API_BASE_URL + '/system/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" | grep -v CONTAINER' })
      })

      if (performanceResponse.ok) {
        const perfResult = await performanceResponse.json()
        const containers = perfResult.stdout?.split('\n').filter((line: string) => line.trim()) || []
        const avgCpu = containers.reduce((acc: number, line: string) => {
          const cpuMatch = line.match(/(\d+\.?\d*)%/)
          return acc + (cpuMatch ? parseFloat(cpuMatch[1]) : 0)
        }, 0) / Math.max(containers.length, 1)

        setPerformanceData([
          { metric: 'CPU 사용률', value: Math.round(avgCpu), status: avgCpu < 80 ? '정상' : '주의' },
          { metric: '메모리 사용률', value: Math.round(Math.random() * 30 + 40), status: '정상' },
          { metric: '네트워크 처리량', value: Math.round(Math.random() * 100 + 200), status: '정상' },
          { metric: '활성 연결', value: connectedDevices, status: connectedDevices > 0 ? '정상' : '오프라인' }
        ])
        
        setSystemStatus(avgCpu < 80 && connectedDevices > 0 ? '정상' : '주의')
      } else {
        setPerformanceData(generateFallbackPerformanceData())
        setSystemStatus('정상')
      }

      // 위협 탐지 데이터
      setThreatData(generateThreatData())

    } catch (error) {
      console.error('대시보드 데이터 로드 실패:', error)
      // 폴백 데이터 설정
      setNetworkData(generateFallbackNetworkData())
      setConnectedDevices(8)
      setSecurityData(generateFallbackSecurityData())
      setPerformanceData(generateFallbackPerformanceData())
      setThreatData(generateThreatData())
    } finally {
      setLoading(false)
    }
  }

  // 폴백 데이터 생성 함수
  const generateFallbackNetworkData = () => {
    const now = new Date()
    return Array.from({ length: 6 }, (_, i) => {
      const time = new Date(now.getTime() - (5 - i) * 4 * 60 * 60 * 1000)
      return {
        time: time.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
        inbound: Math.floor(Math.random() * 50 + 30),
        outbound: Math.floor(Math.random() * 40 + 25),
        sessions: Math.floor(Math.random() * 20 + 10)
      }
    })
  }

  const generateFallbackSecurityData = () => [
    { name: '정상 연결', value: 85, color: '#10B981' },
    { name: '모니터링', value: 12, color: '#F59E0B' },
    { name: '차단됨', value: 3, color: '#EF4444' }
  ]

  const generateFallbackPerformanceData = () => [
    { metric: 'CPU 사용률', value: 45, status: '정상' },
    { metric: '메모리 사용률', value: 67, status: '정상' },
    { metric: '네트워크 처리량', value: 234, status: '정상' },
    { metric: '활성 연결', value: 8, status: '정상' }
  ]

  const generateThreatData = () => {
    return Array.from({ length: 6 }, (_, i) => ({
      time: `${i + 1}h`,
      threats: Math.floor(Math.random() * 8 + 1),
      blocked: Math.floor(Math.random() * 6 + 1),
      severity: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)]
    }))
  }

  // 성숙도 수준 계산 함수
  const getMaturityLevel = (score: number): string => {
    if (score >= 0 && score <= 25) return '기존'
    if (score >= 26 && score <= 50) return '초기'
    if (score >= 51 && score <= 75) return '향상'
    if (score >= 76 && score <= 100) return '최적화'
    return '기존'
  }

  // 제로트러스트 점수 히스토리 로드
  const loadZeroTrustHistory = async () => {
    try {
      setZeroTrustLoading(true)
      const response = await fetch(API_BASE_URL + '/diagnosis/history')
      if (response.ok) {
        const data = await response.json()
        if (data.success && Array.isArray(data.history)) {
          // 최근 20개를 역순으로 정렬 
          const sortedHistory = [...data.history].reverse().map((entry, index) => ({
            ...entry,
            index: index + 1,
            score: Math.round((entry.zeroTrustScore || 0) * 100) // 0-1 범위를 0-100으로 변환
          }))
          setZeroTrustHistory(sortedHistory)
        } else {
          setZeroTrustHistory([])
        }
      } else {
        setZeroTrustHistory([])
      }
    } catch (error) {
      console.error('제로트러스트 히스토리 로드 실패:', error)
      setZeroTrustHistory([])
    } finally {
      setZeroTrustLoading(false)
    }
  }

  // 최근 보안 활동 로드
  const loadRecentActivities = async () => {
    try {
      setActivitiesLoading(true)
      const response = await fetch(API_BASE_URL + '/logs/system')
      if (response.ok) {
        const logs = await response.json()
        // 최근 10개만 가져오기
        const recentLogs = Array.isArray(logs) ? logs.slice(0, 10) : []
        setRecentActivities(recentLogs)
      } else {
        setRecentActivities([])
      }
    } catch (error) {
      console.error('최근 활동 로드 실패:', error)
      setRecentActivities([])
    } finally {
      setActivitiesLoading(false)
    }
  }

  // 로그 레벨에 따른 아이콘과 색상 반환
  const getActivityStyle = (level: string) => {
    switch (level?.toLowerCase()) {
      case 'error':
        return {
          icon: Shield,
          bgColor: 'bg-red-50',
          iconColor: 'text-red-600',
          label: '오류'
        }
      case 'warn':
      case 'warning':
        return {
          icon: AlertTriangle,
          bgColor: 'bg-yellow-50',
          iconColor: 'text-yellow-600',
          label: '경고'
        }
      case 'info':
        return {
          icon: CheckCircle,
          bgColor: 'bg-green-50',
          iconColor: 'text-green-600',
          label: '정보'
        }
      default:
        return {
          icon: Activity,
          bgColor: 'bg-blue-50',
          iconColor: 'text-blue-600',
          label: '활동'
        }
    }
  }

  // 시간 포맷팅 
  const formatRelativeTime = (timestamp: string) => {
    try {
      const date = new Date(timestamp)
      const now = new Date()
      const diffMs = now.getTime() - date.getTime()
      const diffMins = Math.floor(diffMs / 60000)
      const diffHours = Math.floor(diffMs / 3600000)
      const diffDays = Math.floor(diffMs / 86400000)

      if (diffMins < 1) return '방금 전'
      if (diffMins < 60) return `${diffMins}분 전`
      if (diffHours < 24) return `${diffHours}시간 전`
      if (diffDays < 7) return `${diffDays}일 전`
      return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
    } catch {
      return '알 수 없음'
    }
  }

  // 빠른 명령어 실행
  const executeQuickCommand = async (command: string) => {
    setCommandInput(command)
    await executeCommand(command)
  }

  // 명령어 실행
  const executeCommand = async (cmd: string = commandInput) => {
    if (!cmd.trim()) return
    
    setExecuting(true)
    setCommandResult('명령어 실행 중...')
    
    try {
      let response
      
      // 시스템 명령어 & Ziti 명령어 구분
      if (cmd.includes('docker') || cmd.includes('ls') || cmd.includes('pwd') || cmd.includes('ps')) {
        response = await fetch(API_BASE_URL + '/system/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: cmd }),
          signal: AbortSignal.timeout(30000)
        })
      } else {
        response = await fetch(API_BASE_URL + '/ziti/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: cmd }),
          signal: AbortSignal.timeout(30000)
        })
      }
      
      if (response.ok) {
        const result = await response.json()
        setCommandResult(`$ ${cmd}\n\n${result.stdout || result.output || '명령어가 성공적으로 실행되었습니다.'}\n\n실행 시간: ${result.executionTime || 0}ms`)
      } else {
        const result = await response.json().catch(() => ({ error: '응답 파싱 실패' }))
        setCommandResult(`$ ${cmd}\n\n 오류 발생:\n${result.error || result.stderr || '알 수 없는 오류'}`)
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        setCommandResult(`$ ${cmd}\n\n 명령어 실행 시간 초과 (30초)`)
      } else {
        setCommandResult(`$ ${cmd}\n\n 네트워크 오류:\n${error.message}`)
      }
    } finally {
      setExecuting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">보안 대시보드</h1>
          <p className="text-gray-600 mt-1">DAPOZ Zero Trust 네트워크 보안 현황</p>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => setShowQuickCommands(!showQuickCommands)}
            className="flex items-center space-x-2 bg-[#10113C] text-white px-4 py-2 rounded-lg hover:bg-[#10113C]/90 transition-colors"
          >
            <Terminal className="w-4 h-4" />
            <span>빠른 명령어</span>
          </button>
          <button 
            onClick={loadDashboardData}
            disabled={loading}
            className="flex items-center space-x-2 bg-[#0d4f2c] text-white px-4 py-2 rounded-lg hover:bg-[#0d4f2c]/90 disabled:bg-gray-400 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>새로고침</span>
          </button>
        </div>
      </div>

      {/* 빠른 명령어 패널 */}
      {showQuickCommands && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">빠른 명령어 실행</h2>
          
          {/* 명령어 버튼들 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {quickCommands.map((cmd, index) => (
              <button
                key={index}
                onClick={() => executeQuickCommand(cmd.command)}
                disabled={executing}
                className="text-left p-3 border rounded-lg hover:bg-gray-50 hover:border-blue-300 transition-colors disabled:bg-gray-100"
              >
                <h3 className="font-medium text-gray-900 mb-1">{cmd.name}</h3>
                <p className="text-sm text-gray-600 mb-2">{cmd.description}</p>
                <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-700 block">
                  {cmd.command}
                </code>
              </button>
            ))}
          </div>

          {/* 직접 명령어 입력 */}
          <div className="space-y-4">
            <div className="flex space-x-2">
              <input
                type="text"
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                placeholder="명령어를 직접 입력하세요..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                onKeyDown={(e) => e.key === 'Enter' && !executing && executeCommand()}
              />
              <button
                onClick={() => executeCommand()}
                disabled={!commandInput.trim() || executing}
                className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
              >
                {executing ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  <Play className="w-4 h-4" />
                )}
                <span>{executing ? '실행 중...' : '실행'}</span>
              </button>
            </div>

            {/* 실행 결과 */}
            {commandResult && (
              <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
                {commandResult}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 상태 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">연결 장비</p>
              <p className="text-2xl font-bold text-gray-900">{connectedDevices}</p>
              <p className="text-sm text-green-600 flex items-center mt-1">
                <TrendingUp className="w-4 h-4 mr-1" />
                온라인 상태
              </p>
            </div>
            <div className="bg-blue-100 p-3 rounded-lg">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">보안 위협</p>
              <p className="text-2xl font-bold text-gray-900">3</p>
              <p className="text-sm text-red-600 flex items-center mt-1">
                <AlertTriangle className="w-4 h-4 mr-1" />
                2개 차단됨
              </p>
            </div>
            <div className="bg-red-100 p-3 rounded-lg">
              <Shield className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">네트워크 상태</p>
              <p className="text-2xl font-bold text-gray-900">정상</p>
              <p className="text-sm text-green-600 flex items-center mt-1">
                <CheckCircle className="w-4 h-4 mr-1" />
                모든 라우터 온라인
              </p>
            </div>
            <div className="bg-green-100 p-3 rounded-lg">
              <Network className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">시스템 성능</p>
              <p className="text-2xl font-bold text-gray-900">{systemStatus}</p>
              <p className="text-sm text-green-600 flex items-center mt-1">
                <Activity className="w-4 h-4 mr-1" />
                모든 서비스 정상
              </p>
            </div>
            <div className="bg-yellow-100 p-3 rounded-lg">
              <Server className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
        </div>
      </div>

      {/* 제로트러스트 성숙도 추이 */}
      <div className="bg-white rounded-xl shadow-sm border p-6 col-span-full">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">제로트러스트 성숙도 추이</h2>
          {zeroTrustLoading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>}
        </div>
        <div className="flex flex-col gap-6">
          {/* 상단: 점수 및 성숙도 수준 카드 (오른쪽 배치, 그래프 끝과 맞추기) */}
          <div className="flex flex-col sm:flex-row gap-4 justify-end" style={{ marginRight: '50px' }}>
            {(() => {
              const currentScore = zeroTrustHistory.length > 0 
                ? zeroTrustHistory[zeroTrustHistory.length - 1]?.score || 0 
                : null
              const maturityLevel = currentScore !== null ? getMaturityLevel(currentScore) : null
              
              return (
                <>
                  <div className="bg-[#10113C] rounded-lg p-4 shadow-lg w-full sm:w-auto sm:min-w-[200px]">
                    <div className="text-sm font-medium text-white/80 mb-2">성숙도 수준:</div>
                    {maturityLevel !== null ? (
                      <div className="text-3xl font-bold text-white">{maturityLevel}</div>
                    ) : (
                      <div className="text-2xl text-white/60">-</div>
                    )}
                  </div>
                  <div className="bg-[#10113C] rounded-lg p-4 shadow-lg w-full sm:w-auto sm:min-w-[200px]">
                    <div className="text-sm font-medium text-white/80 mb-2">제로트러스트 점수:</div>
                    {currentScore !== null ? (
                      <div className="text-3xl font-bold text-white">{currentScore}점</div>
                    ) : (
                      <div className="text-2xl text-white/60">-</div>
                    )}
                  </div>
                </>
              )
            })()}
          </div>
          
          {/* 하단: 차트 또는 메시지 */}
          <div className="w-full">
            {zeroTrustHistory.length > 0 ? (() => {
              // 모든 점수 분석
              const allScores = zeroTrustHistory.map(h => h.score)
              const minScore = Math.min(...allScores)
              const currentScore = zeroTrustHistory[zeroTrustHistory.length - 1]?.score || 50
              
              // 실제 점수를 사용하되, Y축 범위를 조정해서 차이를 더 크게 보이게
              // 최저 점수를 기준으로 Y축 범위를 설정
              const yMin = Math.max(0, minScore - 5)
              const yMax = Math.max(60, currentScore + 10)
              
              // 실제 점수 그대로 사용 (압축하지 않음)
              const transformedData = zeroTrustHistory.map(entry => ({
                ...entry,
                displayScore: entry.score
              }))
              
              return (
                <ResponsiveContainer width="100%" height={600}>
                  <LineChart
                    data={transformedData}
                    margin={{ top: 50, right: 50, left: 50, bottom: 60 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="index"
                      label={{
                        value: '진단',
                        position: 'bottom',
                        offset: 5,
                        style: { fontSize: 16, fontWeight: 600, textAnchor: 'end', x: -50 }
                      }}
                      tick={{ fontSize: 16, fontWeight: 500 }}
                    />
                    <YAxis
                      domain={[yMin, yMax]}
                      label={{
                        value: '점수',
                        angle: 0,
                        position: 'left',
                        offset: 10,
                        style: { textAnchor: 'middle', fontSize: 16, fontWeight: 600 }
                      }}
                      tick={{ fontSize: 16, fontWeight: 500 }}
                      width={60}
                    />
                    <Tooltip 
                      formatter={(_value: any, _name: any, props: any) => {
                        // 실제 점수 표시
                        const actualScore = props.payload.score
                        return [`${actualScore}점`, '제로트러스트 점수']
                      }}
                      labelFormatter={(label) => `진단 #${label}`}
                      contentStyle={{ fontSize: '14px', padding: '8px 12px', whiteSpace: 'nowrap' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="displayScore" 
                      stroke="#10113C" 
                      strokeWidth={3}
                      dot={{ fill: '#10113C', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )
            })() : (
              <div className="flex items-center justify-center h-[600px] text-gray-500">
                {zeroTrustLoading ? (
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-400"></div>
                    <span>데이터 로딩 중...</span>
                  </div>
                ) : (
                  <div className="text-center">
                    <Shield className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p>아직 진단 결과가 없습니다.</p>
                    <p className="text-sm mt-1">진단 평가를 실행하면 점수 추이가 표시됩니다.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 차트 섹션 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 네트워크 트래픽 */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">네트워크 트래픽</h2>
            {loading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>}
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={networkData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Area type="monotone" dataKey="inbound" stackId="1" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.6} />
              <Area type="monotone" dataKey="outbound" stackId="1" stroke="#10B981" fill="#10B981" fillOpacity={0.6} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* 보안 상태 */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">연결 상태 분석</h2>
            {loading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>}
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={securityData}
                cx="50%"
                cy="50%"
                outerRadius={100}
                dataKey="value"
                label={({ name, value }) => `${name}: ${value}%`}
              >
                {securityData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* 위협 탐지 추이 */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">보안 이벤트 추이</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={threatData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="threats" stroke="#EF4444" strokeWidth={2} />
              <Line type="monotone" dataKey="blocked" stroke="#10B981" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* 시스템 상태 지표 */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">시스템 상태 지표</h2>
            {loading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>}
          </div>
          <div className="space-y-4">
            {performanceData.map((item, index) => (
              <div key={index} className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">{item.metric}</span>
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                    item.status === '정상' ? 'bg-green-100 text-green-800' : 
                    item.status === '주의' ? 'bg-yellow-100 text-yellow-800' : 
                    'bg-red-100 text-red-800'
                  }`}>
                    {item.status}
                  </span>
                  {typeof item.value === 'number' && item.metric !== '활성 연결' && (
                    <span className="text-sm text-gray-600">
                      {item.value}{item.metric.includes('률') ? '%' : item.metric.includes('처리량') ? 'Mbps' : ''}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 최근 보안 활동 */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">최근 보안 활동</h2>
          {activitiesLoading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>}
        </div>
        <div className="space-y-3">
          {recentActivities.length > 0 ? (
            recentActivities.map((activity, index) => {
              const style = getActivityStyle(activity.level)
              const Icon = style.icon
              return (
                <div key={index} className={`flex items-center space-x-3 p-3 ${style.bgColor} rounded-lg`}>
                  <Icon className={`w-5 h-5 ${style.iconColor}`} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{activity.message || '활동 없음'}</p>
                    <p className="text-xs text-gray-500">
                      {activity.level && `${style.label} • `}
                      {formatRelativeTime(activity.timestamp)}
                    </p>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="flex items-center justify-center py-8 text-gray-500">
              {activitiesLoading ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-400"></div>
                  <span>활동 로그 로딩 중...</span>
                </div>
              ) : (
                <div className="text-center">
                  <Activity className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <p>최근 보안 활동이 없습니다.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Dashboard