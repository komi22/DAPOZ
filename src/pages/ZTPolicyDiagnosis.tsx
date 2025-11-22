
import React, { useState, useEffect } from 'react'
import ReactECharts from 'echarts-for-react'
import {Stethoscope, AlertTriangle, CheckCircle, XCircle, TrendingUp, Shield, Network, Activity, Clock, BarChart3} from 'lucide-react'

const ZTPolicyDiagnosis: React.FC = () => {
  const [threatDetection, setThreatDetection] = useState<number[]>([])

  // 위협 탐지 데이터 시뮬레이션
  useEffect(() => {
    const interval = setInterval(() => {
      setThreatDetection(Array.from({ length: 24 }, () => Math.floor(Math.random() * 10)))
    }, 5000)

    // 초기 데이터 설정
    setThreatDetection(Array.from({ length: 24 }, () => Math.floor(Math.random() * 10)))

    return () => clearInterval(interval)
  }, [])

  // 위협 탐지 차트
  const threatDetectionOption = {
    title: {
      text: '위협 탐지 현황 (24시간)',
      textStyle: { color: '#374151', fontSize: 16, fontWeight: 'bold' }
    },
    tooltip: {
      trigger: 'axis',
      formatter: '{b}시: {c}건'
    },
    xAxis: {
      type: 'category',
      data: Array.from({ length: 24 }, (_, i) => `${i}시`),
      axisLabel: { color: '#6B7280' }
    },
    yAxis: {
      type: 'value',
      name: '탐지 건수',
      axisLabel: { color: '#6B7280' }
    },
    series: [{
      data: threatDetection,
      type: 'line',
      smooth: true,
      lineStyle: { color: '#EF4444', width: 3 },
      areaStyle: { 
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(239, 68, 68, 0.3)' },
            { offset: 1, color: 'rgba(239, 68, 68, 0.05)' }
          ]
        }
      },
      symbol: 'circle',
      symbolSize: 4,
      itemStyle: { color: '#EF4444' }
    }],
    grid: { left: '10%', right: '10%', top: '15%', bottom: '15%' }
  }

  // 진단 결과 데이터
  const diagnosticResults = [
    {
      category: '네트워크 보안',
      status: 'good',
      score: 92,
      issues: [
        { type: 'success', message: 'Zero Trust 정책이 정상적으로 적용되고 있습니다.' },
        { type: 'success', message: '모든 라우터가 안전하게 연결되어 있습니다.' },
        { type: 'warning', message: '일부 클라이언트에서 지연 시간이 증가하고 있습니다.' }
      ]
    },
    {
      category: '프로세스 제어',
      status: 'warning',
      score: 78,
      issues: [
        { type: 'success', message: 'SaltStack 미니언이 정상 연결되어 있습니다.' },
        { type: 'warning', message: '일부 스케줄 작업이 지연되고 있습니다.' },
        { type: 'error', message: '프로세스 정책 위반이 3건 감지되었습니다.' }
      ]
    },
    {
      category: '접근 제어',
      status: 'good',
      score: 95,
      issues: [
        { type: 'success', message: '사용자 인증이 정상적으로 작동하고 있습니다.' },
        { type: 'success', message: '권한 기반 접근 제어가 효과적으로 작동합니다.' },
        { type: 'success', message: '무단 접근 시도가 성공적으로 차단되고 있습니다.' }
      ]
    }
  ]

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'good': return 'text-green-600 bg-green-100'
      case 'warning': return 'text-orange-600 bg-orange-100'
      case 'error': return 'text-red-600 bg-red-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'good': return CheckCircle
      case 'warning': return AlertTriangle
      case 'error': return XCircle
      default: return AlertTriangle
    }
  }

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Stethoscope className="w-8 h-8 text-blue-600 mr-3" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">ZT 정책 진단</h1>
              <p className="text-gray-600 mt-1">Zero Trust 정책의 효과성과 시스템 상태를 진단합니다</p>
            </div>
          </div>
          <div className="flex items-center space-x-2 text-sm text-gray-500">
            <Clock className="w-4 h-4" />
            <span>마지막 진단: {new Date().toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* 전체 시스템 상태 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-green-100">
              <Shield className="w-6 h-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">전체 보안 점수</p>
              <p className="text-2xl font-semibold text-green-600">88/100</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-blue-100">
              <Network className="w-6 h-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">네트워크 상태</p>
              <p className="text-2xl font-semibold text-blue-600">정상</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-orange-100">
              <AlertTriangle className="w-6 h-6 text-orange-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">탐지된 위협</p>
              <p className="text-2xl font-semibold text-orange-600">
                {threatDetection.reduce((sum, count) => sum + count, 0)}건
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-purple-100">
              <TrendingUp className="w-6 h-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">정책 효과성</p>
              <p className="text-2xl font-semibold text-purple-600">92%</p>
            </div>
          </div>
        </div>
      </div>

      {/* 위협 탐지 현황 차트 */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <ReactECharts 
          option={threatDetectionOption} 
          style={{ height: '400px' }}
          opts={{ renderer: 'canvas' }}
        />
      </div>

      {/* 상세 진단 결과 */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center">
          <BarChart3 className="w-5 h-5 mr-2" />
          상세 진단 결과
        </h3>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {diagnosticResults.map((result, index) => {
            const StatusIcon = getStatusIcon(result.status)
            return (
              <div key={index} className="border border-gray-200 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-gray-900">{result.category}</h4>
                  <div className={`p-2 rounded-full ${getStatusColor(result.status)}`}>
                    <StatusIcon className="w-5 h-5" />
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600">보안 점수</span>
                    <span className="font-semibold">{result.score}/100</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full ${
                        result.score >= 90 ? 'bg-green-500' :
                        result.score >= 70 ? 'bg-orange-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${result.score}%` }}
                    ></div>
                  </div>
                </div>

                <div className="space-y-2">
                  {result.issues.map((issue, issueIndex) => (
                    <div key={issueIndex} className="flex items-start space-x-2">
                      {issue.type === 'success' && <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />}
                      {issue.type === 'warning' && <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />}
                      {issue.type === 'error' && <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />}
                      <p className="text-sm text-gray-700">{issue.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 권장 사항 */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-200">
        <h3 className="text-lg font-semibold text-blue-900 mb-4">권장 사항</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-lg border border-blue-200">
            <h4 className="font-medium text-blue-900 mb-2">네트워크 최적화</h4>
            <p className="text-sm text-blue-700">일부 클라이언트의 지연 시간을 개선하기 위해 라우터 설정을 검토하세요.</p>
          </div>
          <div className="bg-white p-4 rounded-lg border border-blue-200">
            <h4 className="font-medium text-blue-900 mb-2">프로세스 정책 강화</h4>
            <p className="text-sm text-blue-700">프로세스 정책 위반을 줄이기 위해 더 엄격한 제어 규칙을 적용하세요.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ZTPolicyDiagnosis
