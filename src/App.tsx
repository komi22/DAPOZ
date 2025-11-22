import { useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import IntegratedControl from './pages/IntegratedControl'
import IdentityControl from './pages/IdentityControl'
import NetworkControl from './pages/NetworkControl'
import ProcessControl from './pages/ProcessControl'
import DataControl from './pages/DataControl'
import ZTChecklist from './pages/ZTChecklist'
import ZTEvaluation from './pages/ZTEvaluation'
import ZTAttackTest from './pages/ZTAttackTest'
import ZTPolicyDiagnosis from './pages/ZTPolicyDiagnosis'
import DiagnosisEvaluation from './pages/DiagnosisEvaluation'
import Undeveloped from './pages/Undeveloped'
import Sbom from './pages/Sbom'

import DeviceControl from './pages/DeviceControl'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  const handleLogin = () => {
    setIsAuthenticated(true)
  }

  // 로그인하지 않은 경우 로그인 화면 표시
  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />
  }

  // 로그인 후 메인 애플리케이션 표시
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/zt-policy-apply" element={<Navigate to="/zt-policy-apply/integrated" replace />} />
          <Route path="/zt-policy-apply/integrated" element={<IntegratedControl />} />
          <Route path="/zt-policy-apply/identity" element={<IdentityControl />} />
          <Route path="/zt-policy-apply/network" element={<NetworkControl />} />
          <Route path="/zt-policy-apply/process" element={<ProcessControl />} />
          <Route path="/data-control" element={<DataControl />} />
          {/* ============================================
              [디바이스 필라 추가로 새로 추가됨] 디바이스 통제 라우트
              원본 파일에는 없었던 라우트 - 디바이스 필라 기능 추가 시 새로 생성됨
              ============================================ */}
          <Route path="/zt-policy-apply/device" element={<DeviceControl />} />
          <Route path="/zt-policy-diagnosis" element={<Navigate to="/zt-policy-diagnosis/checklist" replace />} />
          <Route path="/zt-policy-diagnosis/checklist" element={<ZTChecklist />} />
          <Route path="/zt-policy-diagnosis/diagnosis-evaluation" element={<DiagnosisEvaluation />} />
          <Route path="/zt-policy-diagnosis/evaluation" element={<ZTEvaluation />} />
          <Route path="/zt-policy-diagnosis/attack-test" element={<ZTAttackTest />} />
          <Route path="/zt-policy-diagnosis/main" element={<ZTPolicyDiagnosis />} />
          <Route path="/undeveloped" element={<Undeveloped />} />
          <Route path="/zt-policy-apply/sbom" element={<Sbom />} />
        </Routes>
      </Layout>
    </Router>
  )
}

export default App
