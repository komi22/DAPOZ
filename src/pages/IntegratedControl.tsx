
import React, { useState, useEffect, useRef } from 'react';
import {Shield, Network, Server, Activity, Lock, Unlock, AlertTriangle, CheckCircle, XCircle, RefreshCw, Eye, EyeOff, Router, Globe, Zap} from 'lucide-react';

interface SystemStatus {
  containerConnection: boolean;
  dockerInfo: any;
  openzitiStatus: string;
  sessionInfo?: {
    isLoggedIn: boolean;
    loginTime?: string;
    timeRemaining?: string;
  };
}

interface RouterInfo {
  id: string;
  name: string;
  isOnline: boolean;
  version: string;
  enrollmentToken?: string;
}

const IntegratedControl: React.FC = () => {
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    containerConnection: false,
    dockerInfo: null,
    openzitiStatus: 'Unknown'
  });
  
  const [routers, setRouters] = useState<RouterInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isPasswordPromptVisible, setIsPasswordPromptVisible] = useState(false);
  const [loginMessage, setLoginMessage] = useState('');
  const [hasLoggedIn, setHasLoggedIn] = useState(false);
  
  const passwordInputRef = useRef<HTMLInputElement>(null);

  // 시스템 상태 확인
  const checkSystemStatus = async () => {
    try {
      const response = await fetch('/api/system/status');
      const data = await response.json();
      setSystemStatus(data);
      
      // 세션 정보가 있고 로그인된 상태라면 라우터 목록 자동 조회
      if (data.sessionInfo?.isLoggedIn && !hasLoggedIn) {
        setHasLoggedIn(true);
        // 로그인 후 1초 대기 후 페이지 새로고침
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
    } catch (err) {
      console.error('시스템 상태 확인 실패:', err);
      setError('시스템 상태 확인에 실패했습니다.');
    }
  };

  // 라우터 목록 조회
  const fetchRouters = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/openziti/routers');
      const data = await response.json();
      
      if (data.success) {
        setRouters(data.routers || []);
        
        // 로그인 세션 정보 업데이트
        if (data.sessionInfo) {
          setSystemStatus(prev => ({
            ...prev,
            sessionInfo: data.sessionInfo
          }));
          
          // 처음 로그인 성공 시 자동 새로고침
          if (data.sessionInfo.isLoggedIn && !hasLoggedIn) {
            setHasLoggedIn(true);
            setTimeout(() => {
              window.location.reload();
            }, 1000);
          }
        }
      } else {
        setError(data.message || '라우터 목록 조회에 실패했습니다.');
      }
    } catch (err) {
      console.error('라우터 조회 실패:', err);
      setError('라우터 조회 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // OpenZiti 로그인
  const handleLogin = async () => {
    if (!password.trim()) {
      setError('비밀번호를 입력해주세요.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setLoginMessage('로그인 중...');

    try {
      const response = await fetch('/api/openziti/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();
      
      if (data.success) {
        setLoginMessage('로그인 성공! 페이지를 새로고침합니다...');
        setIsPasswordPromptVisible(false);
        setPassword('');
        setHasLoggedIn(true);
        
        // 로그인 성공 후 1초 대기 후 자동 새로고침
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        setError(data.message || '로그인에 실패했습니다.');
        setLoginMessage('');
      }
    } catch (err) {
      console.error('로그인 실패:', err);
      setError('로그인 중 오류가 발생했습니다.');
      setLoginMessage('');
    } finally {
      setIsLoading(false);
    }
  };

  // 컴포넌트 마운트 시 시스템 상태 확인
  useEffect(() => {
    checkSystemStatus();
    fetchRouters();
  }, []);

  // 비밀번호 입력 필드에 포커스
  useEffect(() => {
    if (isPasswordPromptVisible && passwordInputRef.current) {
      passwordInputRef.current.focus();
    }
  }, [isPasswordPromptVisible]);

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'running':
      case 'active':
        return 'text-green-600';
      case 'stopped':
      case 'inactive':
        return 'text-red-600';
      default:
        return 'text-yellow-600';
    }
  };

  const getStatusIcon = (isOnline: boolean) => {
    return isOnline ? (
      <CheckCircle className="w-4 h-4 text-green-600" />
    ) : (
      <XCircle className="w-4 h-4 text-red-600" />
    );
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-xl p-6 text-white">
        <div className="flex items-center space-x-3">
          <Shield className="w-8 h-8" />
          <div>
            <h1 className="text-2xl font-bold">통합 제어</h1>
            <p className="text-blue-100">Zero Trust 네트워크 통합 관리</p>
          </div>
        </div>
      </div>

      {/* 시스템 상태 카드 */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800 flex items-center space-x-2">
            <Activity className="w-5 h-5" />
            <span>시스템 상태</span>
          </h2>
          <button
            onClick={checkSystemStatus}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>새로고침</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Docker 연결 상태 */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600">Docker 연결</span>
              {systemStatus.containerConnection ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <XCircle className="w-5 h-5 text-red-600" />
              )}
            </div>
            <div className="mt-2">
              <span className={`text-sm font-semibold ${
                systemStatus.containerConnection ? 'text-green-600' : 'text-red-600'
              }`}>
                {systemStatus.containerConnection ? '연결됨' : '연결 안됨'}
              </span>
            </div>
          </div>

          {/* OpenZiti 상태 */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600">OpenZiti 상태</span>
              <Network className={`w-5 h-5 ${getStatusColor(systemStatus.openzitiStatus)}`} />
            </div>
            <div className="mt-2">
              <span className={`text-sm font-semibold ${getStatusColor(systemStatus.openzitiStatus)}`}>
                {systemStatus.openzitiStatus}
              </span>
            </div>
          </div>

          {/* 세션 정보 */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600">로그인 상태</span>
              {systemStatus.sessionInfo?.isLoggedIn ? (
                <Lock className="w-5 h-5 text-green-600" />
              ) : (
                <Unlock className="w-5 h-5 text-red-600" />
              )}
            </div>
            <div className="mt-2">
              <span className={`text-sm font-semibold ${
                systemStatus.sessionInfo?.isLoggedIn ? 'text-green-600' : 'text-red-600'
              }`}>
                {systemStatus.sessionInfo?.isLoggedIn ? '로그인됨' : '로그인 필요'}
              </span>
              {systemStatus.sessionInfo?.timeRemaining && (
                <div className="text-xs text-gray-500 mt-1">
                  남은 시간: {systemStatus.sessionInfo.timeRemaining}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* OpenZiti 라우터 관리 */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800 flex items-center space-x-2">
            <Router className="w-5 h-5" />
            <span>OpenZiti Edge Router 상태</span>
          </h2>
          <div className="flex items-center space-x-3">
            {!systemStatus.sessionInfo?.isLoggedIn && (
              <button
                onClick={() => setIsPasswordPromptVisible(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                disabled={isLoading}
              >
                <Lock className="w-4 h-4" />
                <span>로그인</span>
              </button>
            )}
            <button
              onClick={fetchRouters}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span>라우터 정보 업데이트</span>
            </button>
          </div>
        </div>

        {/* 로그인 메시지 */}
        {loginMessage && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-blue-800 text-sm">{loginMessage}</p>
          </div>
        )}

        {/* 오류 메시지 */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {/* 비밀번호 입력 모달 */}
        {isPasswordPromptVisible && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
              <h3 className="text-lg font-semibold mb-4">OpenZiti 로그인</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    비밀번호
                  </label>
                  <div className="relative">
                    <input
                      ref={passwordInputRef}
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="OpenZiti 비밀번호를 입력하세요"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => {
                      setIsPasswordPromptVisible(false);
                      setPassword('');
                      setError(null);
                    }}
                    className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    disabled={isLoading}
                  >
                    취소
                  </button>
                  <button
                    onClick={handleLogin}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                    disabled={isLoading || !password.trim()}
                  >
                    {isLoading ? '로그인 중...' : '로그인'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 라우터 목록 */}
        <div className="space-y-3">
          {isLoading && routers.length === 0 ? (
            <div className="text-center py-8">
              <div className="inline-flex items-center space-x-2 text-gray-600">
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>라우터 정보를 불러오는 중...</span>
              </div>
            </div>
          ) : routers.length === 0 ? (
            <div className="text-center py-8">
              <div className="flex flex-col items-center space-y-3">
                <AlertTriangle className="w-12 h-12 text-yellow-500" />
                <div>
                  <p className="text-gray-600 font-medium">라우터 정보를 불러올 수 없습니다</p>
                  <p className="text-gray-500 text-sm mt-1">새로고침 버튼을 다시 조회하세요</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-3">
              {routers.map((router) => (
                <div key={router.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {getStatusIcon(router.isOnline)}
                      <div>
                        <h3 className="font-medium text-gray-900">{router.name}</h3>
                        <p className="text-sm text-gray-500">ID: {router.id}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-medium ${router.isOnline ? 'text-green-600' : 'text-red-600'}`}>
                        {router.isOnline ? '온라인' : '오프라인'}
                      </div>
                      <div className="text-xs text-gray-500">v{router.version}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 라우터 요약 정보 */}
        <div className="mt-6 flex items-center justify-between text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1">
              <Globe className="w-4 h-4" />
              <span>총 {routers.length}개 라우터</span>
            </span>
            <span className="flex items-center space-x-1">
              <Zap className="w-4 h-4 text-green-600" />
              <span>온라인 {routers.filter(r => r.isOnline).length}개</span>
            </span>
          </div>
          <div className="text-xs text-gray-500">
            마지막 업데이트: {new Date().toLocaleTimeString()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default IntegratedControl;
