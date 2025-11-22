
import React, { useState } from 'react'
import {SquareCheck as CheckSquare, Square, Plus, Trash2, Shield, Network, Users, Lock} from 'lucide-react'

const ZTChecklist: React.FC = () => {
  const [checkedItems, setCheckedItems] = useState<string[]>([])
  const [newItem, setNewItem] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('Network')

  const categories = ['Network', 'Identity', 'Device', 'Application', 'Data'] as const
  type Category = typeof categories[number]

  const defaultChecklist: Record<Category, string[]> = {
    Network: [
      '네트워크 세분화 구현',
      'Zero Trust 네트워크 아키텍처 설계',
      '마이크로 세분화 정책 적용',
      '네트워크 트래픽 모니터링',
      'VPN 대체 솔루션 구현'
    ],
    Identity: [
      '다단계 인증(MFA) 구현',
      '최소 권한 원칙 적용',
      '특권 계정 관리(PAM)',
      '사용자 행위 분석(UBA)',
      '적응형 인증 구현'
    ],
    Device: [
      '디바이스 신뢰성 검증',
      '엔드포인트 보안 솔루션',
      '디바이스 규정 준수 확인',
      'BYOD 정책 수립',
      '모바일 디바이스 관리(MDM)'
    ],
    Application: [
      '애플리케이션 보안 테스트',
      'API 보안 강화',
      '마이크로서비스 보안',
      '컨테이너 보안',
      '서버리스 보안'
    ],
    Data: [
      '데이터 분류 및 라벨링',
      '데이터 암호화 (저장/전송)',
      '데이터 유출 방지(DLP)',
      '데이터 접근 제어',
      '데이터 백업 및 복구'
    ]
  }

  const [checklist, setChecklist] = useState<Record<Category, string[]>>(defaultChecklist)

  const handleItemCheck = (category: string, item: string) => {
    const itemKey = `${category}:${item}`
    setCheckedItems(prev => 
      prev.includes(itemKey) 
        ? prev.filter(i => i !== itemKey)
        : [...prev, itemKey]
    )
  }

  const handleAddItem = () => {
    if (newItem.trim()) {
      setChecklist(prev => ({
        ...prev,
        [selectedCategory]: [...(prev[selectedCategory as Category] || []), newItem.trim()]
      }))
      setNewItem('')
    }
  }

  const handleRemoveItem = (category: string, item: string) => {
    const itemKey = `${category}:${item}`
    setChecklist(prev => ({
      ...prev,
      [category]: (prev[category as Category] || []).filter((i: string) => i !== item)
    }))
    setCheckedItems(prev => prev.filter(i => i !== itemKey))
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Network': return <Network className="w-5 h-5" />
      case 'Identity': return <Users className="w-5 h-5" />
      case 'Device': return <Shield className="w-5 h-5" />
      case 'Application': return <CheckSquare className="w-5 h-5" />
      case 'Data': return <Lock className="w-5 h-5" />
      default: return <CheckSquare className="w-5 h-5" />
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Network': return 'text-blue-600 bg-blue-100'
      case 'Identity': return 'text-green-600 bg-green-100'
      case 'Device': return 'text-purple-600 bg-purple-100'
      case 'Application': return 'text-orange-600 bg-orange-100'
      case 'Data': return 'text-red-600 bg-red-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getCompletionRate = (category: string) => {
    const categoryItems = checklist[category as Category] || []
    const checkedCount = categoryItems.filter((item: string) => 
      checkedItems.includes(`${category}:${item}`)
    ).length
    return Math.round((checkedCount / categoryItems.length) * 100)
  }

  const getTotalCompletionRate = () => {
    const totalItems = Object.values(checklist).flat().length
    const totalChecked = checkedItems.length
    return Math.round((totalChecked / totalItems) * 100)
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <CheckSquare className="w-8 h-8 text-blue-600 mr-3" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">ZT 체크리스트</h1>
              <p className="text-gray-600 mt-1">Zero Trust 구현을 위한 체계적인 점검 목록</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-blue-600">{getTotalCompletionRate()}%</div>
            <div className="text-sm text-gray-500">전체 완료율</div>
          </div>
        </div>
      </div>

      {/* 카테고리별 진행률 */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {categories.map((category) => (
          <div key={category} className="bg-white rounded-lg shadow-sm p-4 border">
            <div className={`flex items-center mb-3 ${getCategoryColor(category)} rounded-lg p-2`}>
              {getCategoryIcon(category)}
              <span className="ml-2 font-medium">{category}</span>
            </div>
            <div className="text-2xl font-bold text-gray-900 mb-1">
              {getCompletionRate(category)}%
            </div>
            <div className="text-sm text-gray-500">
              {(checklist[category as Category] || []).filter((item: string) => checkedItems.includes(`${category}:${item}`)).length} / {(checklist[category as Category] || []).length}
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${getCompletionRate(category)}%` }}
              ></div>
            </div>
          </div>
        ))}
      </div>

      {/* 새 항목 추가 */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">새 체크리스트 항목 추가</h3>
        <div className="flex space-x-4">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
          <input
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder="새 체크리스트 항목을 입력하세요"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            onKeyPress={(e) => e.key === 'Enter' && handleAddItem()}
          />
          <button
            onClick={handleAddItem}
            disabled={!newItem.trim()}
            className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>추가</span>
          </button>
        </div>
      </div>

      {/* 체크리스트 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {categories.map((category) => (
          <div key={category} className="bg-white rounded-lg shadow-sm p-6">
            <div className={`flex items-center mb-4 ${getCategoryColor(category)} rounded-lg p-3`}>
              {getCategoryIcon(category)}
              <h3 className="ml-2 text-lg font-semibold">{category}</h3>
              <span className="ml-auto text-sm font-medium">
                {getCompletionRate(category)}% 완료
              </span>
            </div>
            
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {(checklist[category as Category] || []).map((item: string, index: number) => {
                const itemKey = `${category}:${item}`
                const isChecked = checkedItems.includes(itemKey)
                return (
                  <div key={index} className="flex items-center justify-between group p-2 rounded hover:bg-gray-50">
                    <div 
                      className="flex items-center space-x-3 cursor-pointer flex-1"
                      onClick={() => handleItemCheck(category, item)}
                    >
                      {isChecked ? (
                        <CheckSquare className="w-5 h-5 text-blue-600" />
                      ) : (
                        <Square className="w-5 h-5 text-gray-400" />
                      )}
                      <span className={`${isChecked ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                        {item}
                      </span>
                    </div>
                    <button
                      onClick={() => handleRemoveItem(category, item)}
                      className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 요약 */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-200">
        <h3 className="text-lg font-semibold text-blue-900 mb-4">구현 현황 요약</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-lg border border-blue-200">
            <div className="text-2xl font-bold text-blue-900">{checkedItems.length}</div>
            <div className="text-sm text-blue-700">완료된 항목</div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-blue-200">
            <div className="text-2xl font-bold text-blue-900">
              {Object.values(checklist).flat().length - checkedItems.length}
            </div>
            <div className="text-sm text-blue-700">남은 항목</div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-blue-200">
            <div className="text-2xl font-bold text-blue-900">{getTotalCompletionRate()}%</div>
            <div className="text-sm text-blue-700">전체 진행률</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ZTChecklist
