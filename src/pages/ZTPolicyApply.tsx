
import React from 'react'
import { Link } from 'react-router-dom'
import {Layers, Network, Cpu, Server, Users, Router, ArrowRight} from 'lucide-react'

const ZTPolicyApply: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">ZT 정책 적용</h1>
        <p className="text-gray-600 mt-1">Zero Trust 보안 정책을 통합 관리하고 적용합니다</p>
      </div>

      {/* 현재 시스템 상태 - 상단으로 이동 */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">현재 시스템 상태</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
            <div className="flex items-center space-x-3">
              <Router className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-blue-600">관리 Edge Router</p>
                <p className="text-lg font-bold text-blue-900">3개</p>
                <p className="text-xs text-blue-500">모두 온라인</p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
            <div className="flex items-center space-x-3">
              <Users className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-sm font-medium text-green-600">연결된 클라이언트</p>
                <p className="text-lg font-bold text-green-900">24개</p>
                <p className="text-xs text-green-500">활성 연결</p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
            <div className="flex items-center space-x-3">
              <Server className="w-8 h-8 text-purple-600" />
              <div>
                <p className="text-sm font-medium text-purple-600">연결된 서버</p>
                <p className="text-lg font-bold text-purple-900">8개</p>
                <p className="text-xs text-purple-500">서비스 중</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 통제 모듈 선택 */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">통제 모듈 선택</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* 통합 통제 */}
          <Link
            to="/zt-policy-apply/integrated"
            className="group bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl p-6 border-2 border-indigo-200 hover:border-indigo-300 hover:shadow-lg transition-all duration-200"
          >
            <div className="flex items-center justify-between mb-4">
              <Layers className="w-12 h-12 text-indigo-600" />
              <ArrowRight className="w-5 h-5 text-indigo-400 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all duration-200" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">통합 통제</h3>
            <p className="text-sm text-gray-600 mb-3">
              모든 보안 정책을 통합하여 관리하고 적용합니다
            </p>
            <div className="flex items-center space-x-2 text-xs text-indigo-600">
              <span>• 정책 통합 관리</span>
              <span>• 자동 적용</span>
            </div>
          </Link>

          {/* 네트워크 통제 */}
          <Link
            to="/zt-policy-apply/network"
            className="group bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border-2 border-green-200 hover:border-green-300 hover:shadow-lg transition-all duration-200"
          >
            <div className="flex items-center justify-between mb-4">
              <Network className="w-12 h-12 text-green-600" />
              <ArrowRight className="w-5 h-5 text-green-400 group-hover:text-green-600 group-hover:translate-x-1 transition-all duration-200" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">네트워크 통제</h3>
            <p className="text-sm text-gray-600 mb-3">
              네트워크 연결 및 트래픽을 제어합니다
            </p>
            <div className="flex items-center space-x-2 text-xs text-green-600">
              <span>• 연결 관리</span>
              <span>• 트래픽 제어</span>
            </div>
          </Link>

          {/* 프로세스 통제 */}
          <Link
            to="/zt-policy-apply/process"
            className="group bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl p-6 border-2 border-purple-200 hover:border-purple-300 hover:shadow-lg transition-all duration-200"
          >
            <div className="flex items-center justify-between mb-4">
              <Cpu className="w-12 h-12 text-purple-600" />
              <ArrowRight className="w-5 h-5 text-purple-400 group-hover:text-purple-600 group-hover:translate-x-1 transition-all duration-200" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">프로세스 통제</h3>
            <p className="text-sm text-gray-600 mb-3">
              시스템 프로세스 및 서비스를 관리합니다
            </p>
            <div className="flex items-center space-x-2 text-xs text-purple-600">
              <span>• 프로세스 관리</span>
              <span>• 서비스 제어</span>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}

export default ZTPolicyApply
