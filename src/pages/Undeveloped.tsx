
import React from 'react'
import {Zap} from 'lucide-react'

const Undeveloped: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="flex justify-center mb-6">
          <div className="p-4 bg-gray-100 rounded-full">
            <Zap className="w-12 h-12 text-gray-400" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">실험실</h1>
        <p className="text-gray-600">준비중인 기능입니다.</p>
      </div>
    </div>
  )
}

export default Undeveloped
