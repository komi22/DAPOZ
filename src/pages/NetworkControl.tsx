import { API_BASE_URL } from '../utils/api';
import React, { useState, useEffect } from 'react';
import {Network, Router, Server, Play, CheckCircle, XCircle, Clock, ExternalLink, Settings, RefreshCw, AlertTriangle, Activity, Key, Cpu, Eye, X, LogIn} from 'lucide-react';

const NetworkControl: React.FC = () => {
  const [commandInput, setCommandInput] = useState('');
  const [executionResult, setExecutionResult] = useState('');
  const [dockerContainers, setDockerContainers] = useState<any[]>([]);
  const [systemLogs, setSystemLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [showLogs, setShowLogs] = useState(false);
  const [error, setError] = useState<string>('');

  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [authToken, setAuthToken] = useState('');
  const [loginCredentials] = useState({
    username: 'admin',
    server: '192.168.149.100:1280'
  });
  const [edgeRouters, setEdgeRouters] = useState<any[]>([]);

  const [sessionExpireTime, setSessionExpireTime] = useState<number | null>(null);
  const [sessionTimeLeft, setSessionTimeLeft] = useState<number>(0);

  const [connectionStatus, setConnectionStatus] = useState({
    backend: 'unknown',
    docker: 'unknown',
    ziti: 'unknown'
  });
  const [showToast, setShowToast] = useState(false);
  
  const [commandResults, setCommandResults] = useState<Record<string, string>>({});
  const [showResultModal, setShowResultModal] = useState(false);
  const [parsedResult, setParsedResult] = useState<any>(null);

  const SESSION_DURATION = 5 * 60 * 1000;

  useEffect(() => {
    const sessionData = localStorage.getItem('openziti_session');
    if (sessionData) {
      try {
        const session = JSON.parse(sessionData);
        if (session.expireTime && session.expireTime > Date.now()) {
          setIsAuthenticated(true);
          setAuthToken(session.authToken || '');
          setSessionExpireTime(session.expireTime);
          setConnectionStatus((prev) => ({ ...prev, ziti: 'connected' }));
        } else {
          localStorage.removeItem('openziti_session');
          setIsAuthenticated(false);
          setConnectionStatus((prev) => ({ ...prev, ziti: 'expired' }));
        }
      } catch (e) {
        localStorage.removeItem('openziti_session');
        setIsAuthenticated(false);
      }
    } else {
      setIsAuthenticated(true);
      setConnectionStatus((prev) => ({ ...prev, ziti: 'connected' }));
    }
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    
    if (isAuthenticated && sessionExpireTime) {
      interval = setInterval(() => {
        const now = Date.now();
        const timeLeft = Math.max(0, Math.floor((sessionExpireTime - now) / 1000));
        setSessionTimeLeft(timeLeft);
        
        if (timeLeft <= 0) {
          setIsAuthenticated(false);
          setAuthToken('');
          setSessionExpireTime(null);
          setConnectionStatus((prev) => ({ ...prev, ziti: 'expired' }));
          localStorage.removeItem('openziti_session');
          setExecutionResult('세션이 만료되었습니다. 다시 로그인해주세요.');
        }
      }, 1000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isAuthenticated, sessionExpireTime]);

  const saveSession = (token: string, credentials: any) => {
    const expireTime = Date.now() + SESSION_DURATION;
    const sessionData = {
      authToken: token,
      credentials: credentials,
      expireTime: expireTime,
      loginTime: Date.now()
    };
    
    localStorage.setItem('openziti_session', JSON.stringify(sessionData));
    setSessionExpireTime(expireTime);
  };

  const extendSession = () => {
    if (isAuthenticated && authToken) {
      const expireTime = Date.now() + SESSION_DURATION;
      const sessionData = {
        authToken: authToken,
        credentials: loginCredentials,
        expireTime: expireTime,
        loginTime: Date.now()
      };
      
      localStorage.setItem('openziti_session', JSON.stringify(sessionData));
      setSessionExpireTime(expireTime);
      setExecutionResult('세션이 5분 연장되었습니다.');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setShowPasswordInput(true);
    setAuthToken('');
    setSessionExpireTime(null);
    setSessionTimeLeft(0);
    setConnectionStatus((prev) => ({ ...prev, ziti: 'disconnected' }));
    localStorage.removeItem('openziti_session');
    setExecutionResult('로그아웃되었습니다.');
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const checkBackendConnection = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(API_BASE_URL + '/health', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        setConnectionStatus((prev) => ({ ...prev, backend: 'connected' }));
        setError('');
        return true;
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error: any) {
      setConnectionStatus((prev) => ({ ...prev, backend: 'disconnected' }));

      if (error.name === 'AbortError') {
        setError('백엔드 서버 연결 시간 초과 (5초)');
      } else {
        setError(`백엔드 서버 연결 실패: ${error.message}`);
      }
      return false;
    }
  };


  const fetchSystemLogs = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(API_BASE_URL + '/logs/system', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const result = await response.json();
        const logs = result.logs || result || [];
        setSystemLogs(Array.isArray(logs) ? logs : []);
      }
    } catch (error: any) {
    }
  };

  const fetchRouters = async () => {
    setRefreshing(true);
    setError('');

    try {
      const backendConnected = await checkBackendConnection();
      if (!backendConnected) {
        setExecutionResult('백엔드 서버에 연결할 수 없습니다');
        setConnectionStatus((prev) => ({ ...prev, ziti: 'error' }));
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const routerCommand = 'docker exec -i ziti-controller /var/openziti/ziti-bin/ziti edge list edge-routers';

      const response = await fetch(API_BASE_URL + '/system/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ command: routerCommand }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const result = await response.json();
        const routers = parseZitiRouterOutput(result.stdout || '');

        setEdgeRouters(routers);
        setConnectionStatus((prev) => ({ ...prev, ziti: 'connected' }));
        setLastUpdate(new Date().toLocaleString('ko-KR'));
        setExecutionResult(`라우터 상태 조회 성공: ${routers.length}개 라우터 발견\n\n${result.stdout}`);
      } else {
        const errorText = await response.text().catch(() => '응답 읽기 실패');
        setConnectionStatus((prev) => ({ ...prev, ziti: 'error' }));
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
    } catch (error: any) {
      setConnectionStatus((prev) => ({ ...prev, ziti: 'error' }));

      if (error.name === 'AbortError') {
        setError('라우터 조회 시간 초과 (15초)');
        setExecutionResult('라우터 조회 시간 초과');
      } else {
        const errorMessage = error.message || '알 수 없는 오류';
        setError(`라우터 조회 오류: ${errorMessage}`);
        setExecutionResult(`라우터 조회 실패:\n${errorMessage}`);
      }
    } finally {
      setRefreshing(false);
      await fetchSystemLogs();
    }
  };

  const parseZitiRouterOutput = (output: string) => {
    const routers: any[] = [];

    try {
      const lines = output.split('\n');
      for (const line of lines) {
        if ((line.includes('├') || line.includes('│')) && !line.includes('ID') && !line.includes('NAME')) {
          if (line.includes('│') && !line.includes('─')) {
            const parts = line.split('│').map((part) => part.trim()).filter((part) => part);

            if (parts.length >= 4) {
              const router = {
                id: parts[0] || 'unknown',
                name: parts[1] || 'unknown',
                isOnline: parts[2] === 'true',
                status: parts[2] === 'true' ? 'online' : 'offline',
                allowTransit: parts[3] === 'true',
                cost: parts[4] || '0',
                attributes: parts[5] || ''
              };
              routers.push(router);
            }
          }
        }

        if (line.includes('╰') || line.includes('results:')) {
          break;
        }
      }

      return routers;
    } catch (error) {
      return [];
    }
  };

  const fetchDockerStatus = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(API_BASE_URL + '/docker/status', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const result = await response.json();
        const containerList = result.containers || result || [];
        setDockerContainers(Array.isArray(containerList) ? containerList : []);
        setConnectionStatus((prev) => ({ ...prev, docker: 'connected' }));
      } else {
        const errorText = await response.text().catch(() => '응답 읽기 실패');
        setConnectionStatus((prev) => ({ ...prev, docker: 'error' }));
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
    } catch (error: any) {
      setConnectionStatus((prev) => ({ ...prev, docker: 'error' }));

      if (error.name === 'AbortError') {
        setError((prev) => prev + ' | Docker 조회 시간 초과 (15초)');
      } else {
        setError((prev) => prev + ` | Docker 상태 조회 실패: ${error.message}`);
      }
    }
  };

  useEffect(() => {
    const initializeData = async () => {
      try {
        const backendOk = await checkBackendConnection();

        if (backendOk) {
          await fetchSystemLogs();
          await fetchDockerStatus();
        }
      } catch (error) {
      }
    };

    initializeData();

    const interval = setInterval(async () => {
      await checkBackendConnection();
    }, 60000);

    return () => clearInterval(interval);
  }, []);


  const networkCommands = [
  {
    name: '백엔드 연결 테스트',
    command: 'curl http://localhost:3001/api/health',
    description: '백엔드 서버 연결 상태를 확인합니다',
    type: 'system'
  },
  {
    name: '라우터 상태 확인',
    command: 'docker exec -i ziti-controller /var/openziti/ziti-bin/ziti edge list edge-routers',
    description: 'OpenZiti Edge Router 상태를 확인합니다',
    type: 'ziti'
  },
  {
    name: '서비스 목록 조회',
    command: 'docker exec -i ziti-controller /var/openziti/ziti-bin/ziti edge list services',
    description: '등록된 모든 서비스를 조회합니다',
    type: 'ziti'
  },
  {
    name: '정책 목록 확인',
    command: 'docker exec -i ziti-controller /var/openziti/ziti-bin/ziti edge list service-policies',
    description: '현재 적용된 서비스 정책을 확인합니다',
    type: 'ziti'
  },
  {
    name: '클라이언트 연결 상태',
    command: 'docker exec -i ziti-controller /var/openziti/ziti-bin/ziti edge list identities',
    description: '연결된 클라이언트 Identity를 확인합니다',
    type: 'ziti'
  },
  {
    name: '네트워크 세션 조회',
    command: 'docker exec -i ziti-controller /var/openziti/ziti-bin/ziti edge list sessions',
    description: '활성 네트워크 세션을 조회합니다',
    type: 'ziti'
  },
  {
    name: 'Docker 컨테이너 확인',
    command: 'docker ps',
    description: '실행 중인 Docker 컨테이너를 확인합니다',
    type: 'system'
  },
  {
    name: 'Docker 리소스 상태',
    command: 'docker stats --no-stream',
    description: 'Docker 컨테이너 실시간 리소스 사용량을 확인합니다',
    type: 'system'
  },
  {
    name: 'ziti-controller 로그',
    command: 'docker logs ziti-controller --tail 20',
    description: 'ziti-controller 컨테이너의 최근 로그를 확인합니다',
    type: 'system'
  }];


  const parseNetworkResult = (rawResult: string, command: string) => {
    if (!rawResult || rawResult.includes('아직 실행된')) {
      return { type: 'text', data: rawResult };
    }

    const cleanRawResult = rawResult
      .replace(/명령어 실행 결과:\s*\n\$[^\n]+\n\n/g, '')
      .replace(/docker exec -i[^\n]+\n\n/g, '')
      .trim();

    if ((rawResult.includes('error') || rawResult.includes('Error') || rawResult.includes('실패') || rawResult.includes('오류')) 
        && !rawResult.includes('no identities found') && !rawResult.includes('Please log in')) {
      const errorMatch = rawResult.match(/(error|Error|실패|오류)[:\s]+([^\n]+)/i);
      return {
        type: 'error',
        summary: errorMatch ? errorMatch[2] : '명령어 실행 중 오류가 발생했습니다.',
        fullError: cleanRawResult
      };
    }

    try {
      if (command.includes('curl') || command.includes('api/health')) {
        let jsonContent = cleanRawResult;
        
        if (jsonContent.includes('HTTP/')) {
          const lines = jsonContent.split('\n');
          const jsonStartIndex = lines.findIndex(line => line.trim().startsWith('{') || line.trim().startsWith('['));
          if (jsonStartIndex >= 0) {
            jsonContent = lines.slice(jsonStartIndex).join('\n');
          }
        }
        
        const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const jsonData = JSON.parse(jsonMatch[0]);
            
            if (jsonData.message && (jsonData.status === 'ok' || jsonData.status === 'OK')) {
              return {
                type: 'health-check',
                message: jsonData.message,
                status: jsonData.status,
                timestamp: jsonData.timestamp
              };
            }
            
            return {
              type: 'json',
              data: jsonData
            };
          } catch (e) {
          }
        }
        
        if (jsonContent.includes('status') || jsonContent.includes('ok') || jsonContent.includes('success')) {
          return {
            type: 'success',
            message: '백엔드 서버 연결 성공',
            data: jsonContent
          };
        }
      }

      let jsonData: any = null;
      
      if (cleanRawResult.startsWith('{') || cleanRawResult.startsWith('[')) {
        try {
          jsonData = JSON.parse(cleanRawResult);
        } catch (e) {
        }
      }
      
      if (!jsonData) {
        const jsonMatch = cleanRawResult.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const outerJson = JSON.parse(jsonMatch[0]);
            for (const key in outerJson) {
              if (typeof outerJson[key] === 'string' && (outerJson[key].startsWith('{') || outerJson[key].startsWith('['))) {
                try {
                  outerJson[key] = JSON.parse(outerJson[key]);
                } catch (e) {
                }
              }
            }
            jsonData = outerJson;
          } catch (e) {
          }
        }
      }

      if (jsonData) {
        return {
          type: 'json',
          data: jsonData
        };
      }

      if (command.includes('list edge-routers') || command.includes('edge-routers')) {
        const lines = cleanRawResult.split('\n').filter(line => {
          const trimmed = line.trim();
          return trimmed && trimmed.length > 0 && 
                 !trimmed.includes('ID') && 
                 !trimmed.includes('NAME') &&
                 !trimmed.includes('─') &&
                 !trimmed.includes('═') &&
                 trimmed.includes('│');
        });
        
        if (lines.length > 0) {
          const routers = lines.map((line) => {
            const parts = line.split('│').map(p => p.trim()).filter(p => p);
            if (parts.length >= 5) {
              return {
                id: parts[0] || '',
                name: parts[1] || '',
                isOnline: parts[2] === 'true' || parts[2] === 'True',
                allowTransit: parts[3] === 'true' || parts[3] === 'True',
                cost: parts[4] || '0',
                attributes: parts[5] || ''
              };
            } else if (parts.length >= 3) {
              return {
                id: parts[0] || '',
                name: parts[1] || '',
                isOnline: parts[2] === 'true' || parts[2] === 'True',
                allowTransit: false,
                cost: '0',
                attributes: ''
              };
            }
            return null;
          }).filter(r => r !== null);
          
          if (routers.length > 0) {
            return {
              type: 'routers',
              data: routers
            };
          }
        }
      }

      if (command.includes('list services')) {
        const lines = cleanRawResult.split('\n').filter(line => {
          const trimmed = line.trim();
          return trimmed && trimmed.length > 0 && 
                 !trimmed.includes('ID') && 
                 !trimmed.includes('NAME') &&
                 !trimmed.includes('─') &&
                 !trimmed.includes('═') &&
                 trimmed.includes('│');
        });
        
        if (lines.length > 0) {
          const services = lines.map((line) => {
            const parts = line.split('│').map(p => p.trim()).filter(p => p);
            return {
              id: parts[0] || '',
              name: parts[1] || '',
              terminatorStrategy: parts[2] || '',
              roleAttributes: parts[3] || ''
            };
          });
          
          return {
            type: 'services',
            data: services
          };
        }
      }

      if (command.includes('list identities')) {
        const lines = cleanRawResult.split('\n').filter(line => {
          const trimmed = line.trim();
          return trimmed && trimmed.length > 0 && 
                 !trimmed.includes('ID') && 
                 !trimmed.includes('NAME') &&
                 !trimmed.includes('─') &&
                 !trimmed.includes('═') &&
                 trimmed.includes('│');
        });
        
        if (lines.length > 0) {
          const identities = lines.map((line) => {
            const parts = line.split('│').map(p => p.trim()).filter(p => p);
            return {
              id: parts[0] || '',
              name: parts[1] || '',
              type: parts[2] || '',
              attributes: parts[3] || '',
              authPolicy: parts[4] || ''
            };
          });
          
          return {
            type: 'identities',
            data: identities
          };
        }
      }

      if (command.includes('list service-policies') || command.includes('service-policies')) {
        if (cleanRawResult.includes('│') || cleanRawResult.includes('|')) {
          const allLines = cleanRawResult.split('\n');
          
          // 헤더 라인 찾기
          const headerLineIndex = allLines.findIndex(line => 
            (line.includes('│') || line.includes('|')) && 
            (line.includes('ID') || line.includes('NAME'))
          );
          
          if (headerLineIndex >= 0) {
            const dataLines = allLines.slice(headerLineIndex + 1).filter(line => {
              const trimmed = line.trim();
              if (trimmed.includes('─') || trimmed.includes('═') || trimmed.includes('-') || trimmed.includes('=')) {
                return false;
              }
              return trimmed && trimmed.length > 0 && 
                     (trimmed.includes('│') || trimmed.includes('|')) &&
                     !trimmed.match(/^[│|\s-]+$/);
            });
            
            if (dataLines.length > 0) {
              const policies = dataLines.map((line) => {
                const separator = line.includes('│') ? '│' : '|';
                const parts = line.split(separator).map(p => p.trim()).filter(p => p && !p.match(/^[-═]+$/));
                
                return {
                  id: parts[0] || '',
                  name: parts[1] || '',
                  semantic: parts[2] || '',
                  serviceRoles: parts[3] || '',
                  identityRoles: parts[4] || '',
                  postureCheckRoles: parts[5] || ''
                };
              }).filter(p => p.id || p.name);
              
              if (policies.length > 0) {
                return {
                  type: 'policies',
                  data: policies
                };
              }
            }
          }
        }
        
        if (cleanRawResult.includes('results: none') || cleanRawResult.includes('results: 0')) {
          return {
            type: 'success',
            message: '정책이 없습니다.',
            data: ''
          };
        }
      }

      if (command.includes('list sessions') || command.includes('sessions')) {
        if (cleanRawResult.includes('│') || cleanRawResult.includes('|')) {
          const allLines = cleanRawResult.split('\n');
          
          // 헤더 라인 찾기
          const headerLineIndex = allLines.findIndex(line => 
            (line.includes('│') || line.includes('|')) && 
            (line.includes('ID') || line.includes('SESSION') || line.includes('SERVICE'))
          );
          
          if (headerLineIndex >= 0) {
            const dataLines = allLines.slice(headerLineIndex + 1).filter(line => {
              const trimmed = line.trim();
              if (trimmed.includes('─') || trimmed.includes('═') || trimmed.includes('-') || trimmed.includes('=')) {
                return false;
              }
              return trimmed && trimmed.length > 0 && 
                     (trimmed.includes('│') || trimmed.includes('|')) &&
                     !trimmed.match(/^[│|\s-]+$/);
            });
            
            if (dataLines.length > 0) {
              const sessions = dataLines.map((line) => {
                const separator = line.includes('│') ? '│' : '|';
                const parts = line.split(separator).map(p => p.trim()).filter(p => p && !p.match(/^[-═]+$/));
                
                return {
                  id: parts[0] || '',
                  apiSessionId: parts[1] || '',
                  serviceName: parts[2] || '',
                  type: parts[3] || '',
                  token: parts[4] || '',
                  createdAt: parts[5] || ''
                };
              }).filter(s => s.id || s.apiSessionId);
              
              if (sessions.length > 0) {
                return {
                  type: 'sessions',
                  data: sessions
                };
              }
            }
          }
        }
        
        if (cleanRawResult.trim() === '' || 
            cleanRawResult.includes('results: none') || 
            cleanRawResult.includes('results: 0')) {
          return {
            type: 'success',
            message: '활성 세션이 없습니다.',
            data: ''
          };
        }
      }

      if (command.includes('docker ps')) {
        const lines = cleanRawResult.split('\n');
        const headerLine = lines.find(line => line.includes('CONTAINER ID'));
        
        if (headerLine) {
          const headers = headerLine.trim().split(/\s{2,}/).filter(h => h.trim());
          
          const dataLines = lines.filter(line => {
            const trimmed = line.trim();
            return trimmed && 
                   !trimmed.includes('CONTAINER ID') &&
                   !trimmed.includes('IMAGE') &&
                   !trimmed.includes('─') &&
                   trimmed.length > 0;
          });
          
          if (dataLines.length > 0) {
            const containers = dataLines.map(line => {
              const parts = line.trim().split(/\s{2,}/);
              return {
                containerId: parts[0] || '',
                image: parts[1] || '',
                command: parts[2] || '',
                created: parts[3] || '',
                status: parts[4] || '',
                ports: parts[5] || '',
                names: parts[6] || ''
              };
            });
            
            return {
              type: 'docker-ps',
              data: containers,
              headers: headers
            };
          }
        }
      }

      // Docker stats 결과 파싱
      if (command.includes('docker stats')) {
        const lines = cleanRawResult.split('\n');
        const headerLine = lines.find(line => line.includes('CONTAINER'));
        
        if (headerLine) {
          const headers = headerLine.trim().split(/\s{2,}/).filter(h => h.trim());
          const dataLines = lines.filter(line => {
            const trimmed = line.trim();
            return trimmed && 
                   !trimmed.includes('CONTAINER') &&
                   !trimmed.includes('─') &&
                   trimmed.length > 0;
          });
          
          if (dataLines.length > 0) {
            const stats = dataLines.map(line => {
              const parts = line.trim().split(/\s{2,}/);
              return {
                container: parts[0] || '',
                cpu: parts[1] || '',
                memUsage: parts[2] || '',
                memPercent: parts[3] || '',
                netIO: parts[4] || '',
                blockIO: parts[5] || '',
                pids: parts[6] || ''
              };
            });
            
            return {
              type: 'docker-stats',
              data: stats,
              headers: headers
            };
          }
        }
      }

      if (command.includes('docker logs')) {
        return {
          type: 'docker-logs',
          data: cleanRawResult
        };
      }

      if (rawResult.includes('성공') || rawResult.includes('success') || rawResult.includes('True') || rawResult.includes('true')) {
        const hasContent = cleanRawResult && cleanRawResult.length > 0 && 
                          !cleanRawResult.match(/^(성공|success|True|False|false)$/i);
        if (hasContent) {
          return {
            type: 'success',
            message: '명령어가 성공적으로 실행되었습니다.',
            data: cleanRawResult
          };
        }
        return {
          type: 'success',
          message: '명령어가 성공적으로 실행되었습니다.'
        };
      }

      return {
        type: 'text',
        data: cleanRawResult || rawResult
      };
    } catch (e) {
      return {
        type: 'text',
        data: cleanRawResult || rawResult
      };
    }
  };

  const handleShowResult = (command: string) => {
    const rawResult = commandResults[command];
    if (!rawResult) {
      setParsedResult({ type: 'text', data: '아직 실행된 명령어가 없습니다.' });
    } else {
      if (rawResult.includes('ERROR:') || rawResult.includes('Unable to run command') || 
          rawResult.includes('명령어 실행 실패') || rawResult.includes('네트워크 오류')) {
        setParsedResult({ type: 'error', summary: '명령어 실행 실패', fullError: rawResult });
      } else {
        const parsed = parseNetworkResult(rawResult, command);
        setParsedResult(parsed);
      }
    }
    setShowResultModal(true);
  };

  const handleExecuteCommandDirect = async (command: string) => {
    setLoading(true);
    setError('');

    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);

    try {
      const backendConnected = await checkBackendConnection();
      if (!backendConnected) {
        const errorMsg = '백엔드 서버에 연결할 수 없습니다. server/index.cjs가 실행 중인지 확인하세요.';
        setCommandResults(prev => ({ ...prev, [command]: errorMsg }));
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(API_BASE_URL + '/system/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: command }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      let rawOutput = '';
      
      if (response.ok) {
        const result = await response.json();
        rawOutput = result.stdout || result.output || result.stderr || '명령어가 성공적으로 실행되었습니다.';
        
        setCommandResults(prev => ({ ...prev, [command]: rawOutput }));
      } else {
        const result = await response.json().catch(() => ({ error: '응답 파싱 실패' }));
        rawOutput = `오류 발생:\n${result.error || result.stderr || '알 수 없는 오류'}\n\n해결 방법:\n1. OpenZiti 로그인이 필요할 수 있습니다\n2. ziti-controller 컨테이너 상태를 확인하세요\n3. 명령어 문법을 점검하세요`;
        setCommandResults(prev => ({ ...prev, [command]: rawOutput }));
        setError(`명령어 실행 실패: ${result.error || '알 수 없는 오류'}`);
      }
    } catch (error: any) {
      let errorMsg = '';
      if (error.name === 'AbortError') {
        errorMsg = `명령어 실행 시간 초과 (30초)`;
        setError('명령어 실행 시간 초과');
      } else {
        errorMsg = `네트워크 오류:\n${error.message}`;
        setError(`네트워크 오류: ${error.message}`);
      }
      
      setCommandResults(prev => ({ ...prev, [command]: errorMsg }));
    } finally {
      setLoading(false);
      await fetchSystemLogs();
    }
  };

  const handleExecuteCommand = async () => {
    if (!commandInput.trim()) return;

    setLoading(true);
    setExecutionResult('명령어 실행 중...');
    setError('');

    try {
      const backendConnected = await checkBackendConnection();
      if (!backendConnected) {
        setExecutionResult('백엔드 서버에 연결할 수 없습니다. server/index.cjs가 실행 중인지 확인하세요.');
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      // 모든 명령어를 시스템 명령어로 실행 (docker exec 포함)
      const response = await fetch(API_BASE_URL + '/system/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: commandInput }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const result = await response.json();

        setExecutionResult(`$ ${commandInput}\n\n${result.stdout || result.output || result.stderr || '명령어가 성공적으로 실행되었습니다.'}\n\n실행 시간: ${result.executionTime || 0}ms`);
      } else {
        const result = await response.json().catch(() => ({ error: '응답 파싱 실패' }));
        setExecutionResult(`$ ${commandInput}\n\n오류 발생:\n${result.error || result.stderr || '알 수 없는 오류'}\n\n해결 방법:\n1. OpenZiti 로그인이 필요할 수 있습니다\n2. ziti-controller 컨테이너 상태를 확인하세요\n3. 명령어 문법을 점검하세요`);
        setError(`명령어 실행 실패: ${result.error || '알 수 없는 오류'}`);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        setExecutionResult(`$ ${commandInput}\n\n명령어 실행 시간 초과 (30초)`);
        setError('명령어 실행 시간 초과');
      } else {
        setExecutionResult(`$ ${commandInput}\n\n네트워크 오류:\n${error.message}`);
        setError(`네트워크 오류: ${error.message}`);
      }
    } finally {
      setLoading(false);
      await fetchSystemLogs();
    }
  };

  const openZitiConsole = () => {
    window.open('http://localhost:1408/', '_blank');
  };

  const getConnectionStatusColor = (status: string) => {
    switch (status) {
      case 'connected':return 'text-green-600';
      case 'disconnected':return 'text-red-600';
      case 'error':return 'text-red-600';
      case 'expired':return 'text-orange-600';
      default:return 'text-gray-600';
    }
  };

  const getConnectionStatusText = (status: string) => {
    switch (status) {
      case 'connected':return '연결됨';
      case 'disconnected':return '연결 안됨';
      case 'error':return '오류';
      case 'expired':return '세션 만료';
      default:return '확인 중';
    }
  };

  // 로그인 화면 제거 - 바로 접근 가능

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">네트워크 통제</h1>
          <p className="text-gray-600 mt-1">OpenZiti를 통한 Zero Trust 네트워크 관리</p>
          <p className="text-sm text-[#10113C] mt-1">
            컨테이너: ziti-controller (localhost:1280), zac (localhost:1408)
          </p>
          <p className="text-xs text-[#10113C] mt-1">네트워크 통제 활성화</p>
          
          {/* 인증 상태 및 연결 상태 표시 */}
          <div className="flex items-center space-x-4 mt-2 text-sm">
            <div className="flex items-center space-x-1">
              <span className="text-gray-600">인증:</span>
              <span className="text-green-600 flex items-center">
                <CheckCircle className="w-4 h-4 mr-1" />
                인증됨
              </span>
              {authToken &&
              <span className="text-xs text-gray-500">
                  (Token: {authToken.substring(0, 8)}...)
                </span>
              }
              {sessionTimeLeft > 0 &&
              <span className={`text-xs px-2 py-1 rounded ${
                sessionTimeLeft < 60 ? 'bg-red-100 text-red-700' : 
                sessionTimeLeft < 180 ? 'bg-yellow-100 text-yellow-700' : 
                'bg-green-100 text-green-700'
              }`}>
                  세션: {formatTime(sessionTimeLeft)}
                </span>
              }
            </div>
            <div className="flex items-center space-x-1">
              <span className="text-gray-600">API:</span>
              <span className={getConnectionStatusColor(connectionStatus.backend)}>
                {getConnectionStatusText(connectionStatus.backend)}
              </span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="text-gray-600">Docker</span>
              <span className={getConnectionStatusColor(connectionStatus.docker)}>
                {getConnectionStatusText(connectionStatus.docker)}
              </span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="text-gray-600">OpenZiti:</span>
              <span className={getConnectionStatusColor(connectionStatus.ziti)}>
                {getConnectionStatusText(connectionStatus.ziti)}
              </span>
            </div>
          </div>
          
          {lastUpdate &&
          <p className="text-xs text-gray-500 mt-1">마지막 업데이트: {lastUpdate}</p>
          }
          {error &&
          <div className="flex items-center space-x-2 mt-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          }
        </div>
        <div className="flex space-x-2">
          {isAuthenticated && sessionTimeLeft > 0 &&
          <button
            onClick={extendSession}
            style={{ backgroundColor: '#10113C' }}
            className="flex items-center space-x-2 text-white px-4 py-2 rounded-lg hover:opacity-90 transition-opacity">
            <Clock className="w-4 h-4" />
            <span>세션 연장</span>
          </button>
          }
          <button
            onClick={handleLogout}
            style={{ backgroundColor: '#10113C' }}
            className="flex items-center space-x-2 text-white px-4 py-2 rounded-lg hover:opacity-90 transition-opacity">
            <LogIn className="w-4 h-4" />
            <span>로그아웃</span>
          </button>
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="flex items-center space-x-2 bg-gray-700 text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors">
            <Settings className="w-4 h-4" />
            <span>{showLogs ? '로그 숨기기' : '상세 로그'}</span>
          </button>
          <button
            onClick={fetchRouters}
            disabled={refreshing}
            style={{ backgroundColor: '#0d4f2c' }}
            className="flex items-center space-x-2 text-white px-4 py-2 rounded-lg hover:opacity-90 disabled:bg-gray-400 transition-opacity">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? '새로고침 중...' : '새로고침'}</span>
          </button>
          <button
            onClick={openZitiConsole}
            style={{ backgroundColor: '#10113C' }}
            className="flex items-center space-x-2 text-white px-4 py-2 rounded-lg hover:opacity-90 transition-opacity">
            <ExternalLink className="w-4 h-4" />
            <span>OpenZiti 콘솔</span>
          </button>
        </div>
      </div>

      {/* 상세 로그 패널 */}
      {showLogs &&
      <div className="bg-gray-900 text-green-400 rounded-xl p-4">
          <h3 className="text-lg font-semibold mb-3 text-white">시스템 로그 (최근 20개)</h3>
          <div className="max-h-64 overflow-y-auto space-y-1 font-mono text-sm">
            {systemLogs.slice(0, 20).map((log, index) =>
          <div key={index} className={`${
          log.level === 'error' ? 'text-red-400' :
          log.level === 'info' ? 'text-green-400' : 'text-yellow-400'}`
          }>
                <span className="text-gray-400">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                <span className={`ml-2 ${
            log.level === 'error' ? 'text-red-300' :
            log.level === 'info' ? 'text-blue-300' : 'text-yellow-300'}`
            }>[{log.level.toUpperCase()}]</span>
                <span className="ml-2">{log.message}</span>
                {log.error &&
            <div className="ml-8 text-red-300 text-xs">
                    {JSON.stringify(JSON.parse(log.error), null, 2)}
                  </div>
            }
              </div>
          )}
            {systemLogs.length === 0 &&
          <div className="text-gray-500 text-center py-4">
                시스템 로그가 없거나 로드할 수 없습니다.
              </div>
          }
          </div>
        </div>
      }

      {/* OpenZiti 컨테이너 상태 */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
          <Activity className="w-5 h-5 mr-2 text-blue-600" />
          OpenZiti 컨테이너 상태
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {dockerContainers.map((container, index) =>
          <div key={index} className="border rounded-lg p-4 bg-gray-50">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-3">
                  <div className={`w-3 h-3 rounded-full ${
                container.status === 'online' || container.status === 'running' || container.status?.includes('Up') ? 'bg-green-500' : 'bg-red-500'}`
                }></div>
                  <div>
                    <h3 className="font-medium text-gray-900 flex items-center">
                      {container.name}
                      {container.name === 'ziti-controller' &&
                    <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">CLI</span>
                    }
                    </h3>
                    <p className="text-xs text-gray-500">{container.image}</p>
                  </div>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
              container.status === 'online' || container.status === 'running' || container.status?.includes('Up') ?
              'bg-green-100 text-green-700' :
              'bg-red-100 text-red-700'}`
              }>
                  {container.status}
                </span>
              </div>
              
              {/* 실시간 리소스 사용량 */}
              <div className="mb-3 p-3 bg-blue-50 rounded-lg">
                <h4 className="text-sm font-medium text-blue-700 mb-2 flex items-center">
                  <Cpu className="w-4 h-4 mr-1" />
                  실시간 리소스 사용량
                </h4>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">CPU:</span>
                    <span className={`font-medium ${
                  container.stats?.cpu !== 'N/A' ? 'text-blue-700' : 'text-gray-500'}`
                  }>
                      {container.stats?.cpu || 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">메모리:</span>
                    <span className={`font-medium ${
                  container.stats?.memory !== 'N/A' ? 'text-blue-700' : 'text-gray-500'}`
                  }>
                      {container.stats?.memory || 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">네트워크 I/O:</span>
                    <span className={`font-medium ${
                  container.stats?.netIO !== 'N/A' ? 'text-green-700' : 'text-gray-500'}`
                  }>
                      {container.stats?.netIO || 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">디스크 I/O:</span>
                    <span className={`font-medium ${
                  container.stats?.blockIO !== 'N/A' ? 'text-green-700' : 'text-gray-500'}`
                  }>
                      {container.stats?.blockIO || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* 포트 정보 */}
              <div className="mb-3">
                <h4 className="text-sm font-medium text-gray-700 mb-2">포트 매핑</h4>
                <div className="space-y-1">
                  {container.portMappings && container.portMappings.length > 0 ?
                container.portMappings.map((port: any, portIndex: number) =>
                <div key={portIndex} className="flex items-center justify-between text-xs">
                        <span className="text-gray-600">
                          {port.host}:{port.container} ({port.protocol})
                        </span>
                        <span className={`px-2 py-1 rounded ${
                  port.connectable ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`
                  }>
                          {port.connectable ? '연결 가능' : '연결 불가'}
                        </span>
                      </div>
                ) :
                <span className="text-xs text-gray-500">포트 매핑 없음</span>
                }
                </div>
              </div>
            </div>
          )}
        </div>
        {dockerContainers.length === 0 &&
        <div className="text-center py-4 text-gray-500">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            Docker 컨테이너 정보를 불러오는 중...
          </div>
        }
      </div>

      {/* 네트워크 명령어 예시 */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">명령어 목록</h2>
        <p className="text-xs text-gray-500 mb-4">
          ziti edge login 명령어: docker exec -i ziti-controller /var/openziti/ziti-bin/ziti edge login YOUR_IP_ADDRESS:1280 -u admin -p YOUR_PASSWORD_HERE --yes
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {networkCommands.map((example, index) => (
            <div
              key={index}
              className="text-left p-4 border rounded-lg hover:bg-gray-50 hover:border-blue-300 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-medium text-gray-900">{example.name}</h3>
                <div className="flex items-center space-x-1">
                  {example.type === 'ziti' ?
                    <Server className="w-4 h-4 text-blue-600" /> :
                    <Network className="w-4 h-4 text-gray-400" />
                  }
                  <span className={`text-xs px-2 py-1 rounded ${
                    example.type === 'ziti' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                  }`}>
                    {example.type === 'ziti' ? 'OpenZiti' : 'system'}
                  </span>
                </div>
              </div>
              <p className="text-sm text-gray-600 mb-3">{example.description}</p>
              <div className="flex items-center space-x-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleExecuteCommandDirect(example.command);
                  }}
                  disabled={loading}
                  className="flex items-center space-x-1 bg-[#10113C] text-white px-3 py-1.5 rounded text-sm hover:bg-[#10113C]/90 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  <Play className="w-3 h-3" />
                  <span>실행</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleShowResult(example.command);
                  }}
                  disabled={!commandResults[example.command]}
                  className="flex items-center space-x-1 bg-gray-600 text-white px-3 py-1.5 rounded text-sm hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  <Eye className="w-3 h-3" />
                  <span>결과</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 명령어 실행 */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">명령어 실행</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              &gt; 명령어 입력
            </label>
            <div className="flex space-x-2">
              <textarea
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                rows={3}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm resize-none"
                placeholder="OpenZiti 명령어나 시스템 명령어를 입력하거나 위 예시에서 선택하세요" />
              <button
                onClick={handleExecuteCommand}
                disabled={!commandInput.trim() || loading}
                className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors self-start">
                {loading ?
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> :
                <Play className="w-4 h-4" />
                }
                <span>{loading ? '실행 중...' : '실행'}</span>
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">docker exec -i ziti-controller /var/openziti/ziti-bin/ziti 방식으로 실행됩니다</p>
          </div>

          {executionResult &&
          <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                실행 결과
              </label>
              <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
                {executionResult}
              </div>
            </div>
          }
        </div>
      </div>

      {/* 토스트 메시지 */}
      {showToast && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-[#10113C] text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-in slide-in-from-top-5">
          명령어가 실행됩니다
        </div>
      )}

      {/* 결과 보기 모달 */}
      {showResultModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowResultModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-gray-900">명령어 실행 결과</h3>
              <button
                onClick={() => setShowResultModal(false)}
                className="text-gray-500 hover:text-gray-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-gray-50 border border-gray-200 p-6 rounded-lg overflow-y-auto flex-1 min-h-[300px]">
              {parsedResult ? (
                <div className="space-y-4">
                  {/* 에러 표시 */}
                  {parsedResult.type === 'error' && (
                    <div className="border rounded-lg p-6 border-red-200 bg-red-50">
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                          <XCircle className="w-6 h-6 text-red-600" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-red-800 text-lg">오류</h4>
                          <p className="text-sm text-red-700 mt-1">{parsedResult.summary}</p>
                        </div>
                      </div>
                      {parsedResult.fullError && (
                        <div className="mt-4 bg-white rounded p-3 max-h-64 overflow-y-auto">
                          <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono">
                            {parsedResult.fullError}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 성공 메시지 */}
                  {parsedResult.type === 'success' && (
                    <div className="border rounded-lg p-6 border-green-200 bg-green-50">
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                          <CheckCircle className="w-6 h-6 text-green-600" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-green-800 text-lg">성공</h4>
                          <p className="text-sm text-green-700 mt-1">{parsedResult.message}</p>
                        </div>
                      </div>
                      {parsedResult.data && (
                        <div className="mt-4 bg-white rounded p-3 max-h-64 overflow-y-auto">
                          <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono">
                            {parsedResult.data}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 라우터 목록 */}
                  {parsedResult.type === 'routers' && parsedResult.data && (
                    <div className="border rounded-lg p-6 bg-blue-50 border-blue-200">
                      <h4 className="font-semibold text-gray-800 mb-4 text-lg flex items-center space-x-2">
                        <Router className="w-5 h-5 text-blue-600" />
                        <span>Edge Router 목록 ({parsedResult.data.length}개)</span>
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="min-w-full bg-white rounded-lg shadow-sm">
                          <thead className="bg-gray-100">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">이름</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">ID</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">상태</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Transit</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Cost</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {parsedResult.data.map((router: any, idx: number) => (
                              <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm font-medium text-gray-900">{router.name}</td>
                                <td className="px-4 py-3 text-sm text-gray-600 font-mono text-xs">{router.id}</td>
                                <td className="px-4 py-3 text-sm">
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                    router.isOnline ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                  }`}>
                                    {router.isOnline ? '온라인' : '오프라인'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-600">
                                  {router.allowTransit ? '✓' : '✗'}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-600">{router.cost}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* 서비스 목록 */}
                  {parsedResult.type === 'services' && parsedResult.data && (
                    <div className="border rounded-lg p-6 bg-purple-50 border-purple-200">
                      <h4 className="font-semibold text-gray-800 mb-4 text-lg flex items-center space-x-2">
                        <Server className="w-5 h-5 text-purple-600" />
                        <span>서비스 목록 ({parsedResult.data.length}개)</span>
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="min-w-full bg-white rounded-lg shadow-sm">
                          <thead className="bg-gray-100">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">이름</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">ID</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Terminator</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Attributes</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {parsedResult.data.map((service: any, idx: number) => (
                              <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm font-medium text-gray-900">{service.name}</td>
                                <td className="px-4 py-3 text-sm text-gray-600 font-mono text-xs">{service.id}</td>
                                <td className="px-4 py-3 text-sm text-gray-600">{service.terminatorStrategy}</td>
                                <td className="px-4 py-3 text-sm text-gray-600">{service.roleAttributes}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Identity 목록 */}
                  {parsedResult.type === 'identities' && parsedResult.data && (
                    <div className="border rounded-lg p-6 bg-indigo-50 border-indigo-200">
                      <h4 className="font-semibold text-gray-800 mb-4 text-lg flex items-center space-x-2">
                        <Key className="w-5 h-5 text-indigo-600" />
                        <span>Identity 목록 ({parsedResult.data.length}개)</span>
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="min-w-full bg-white rounded-lg shadow-sm">
                          <thead className="bg-gray-100">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">이름</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">ID</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">타입</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Auth Policy</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {parsedResult.data.map((identity: any, idx: number) => (
                              <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm font-medium text-gray-900">{identity.name}</td>
                                <td className="px-4 py-3 text-sm text-gray-600 font-mono text-xs">{identity.id}</td>
                                <td className="px-4 py-3 text-sm text-gray-600">{identity.type}</td>
                                <td className="px-4 py-3 text-sm text-gray-600">{identity.authPolicy}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* 정책 목록 */}
                  {parsedResult.type === 'policies' && parsedResult.data && (
                    <div className="border rounded-lg p-6 bg-yellow-50 border-yellow-200">
                      <h4 className="font-semibold text-gray-800 mb-4 text-lg flex items-center space-x-2">
                        <Settings className="w-5 h-5 text-yellow-600" />
                        <span>서비스 정책 목록 ({parsedResult.data.length}개)</span>
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="min-w-full bg-white rounded-lg shadow-sm">
                          <thead className="bg-gray-100">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">ID</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">이름</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Semantic</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Service Roles</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Identity Roles</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Posture Check Roles</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {parsedResult.data.map((policy: any, idx: number) => (
                              <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm text-gray-600 font-mono text-xs">{policy.id}</td>
                                <td className="px-4 py-3 text-sm font-medium text-gray-900">{policy.name}</td>
                                <td className="px-4 py-3 text-sm text-gray-600">{policy.semantic}</td>
                                <td className="px-4 py-3 text-sm text-gray-600">{policy.serviceRoles || '-'}</td>
                                <td className="px-4 py-3 text-sm text-gray-600">{policy.identityRoles || '-'}</td>
                                <td className="px-4 py-3 text-sm text-gray-600">{policy.postureCheckRoles || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* 백엔드 연결 테스트 결과 */}
                  {parsedResult.type === 'health-check' && (
                    <div className="border rounded-lg p-6 border-green-200 bg-green-50">
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                          <CheckCircle className="w-6 h-6 text-green-600" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-green-800 text-lg">백엔드 서버 상태</h4>
                          <p className="text-sm text-green-700 mt-2">{parsedResult.message}</p>
                          {parsedResult.timestamp && (
                            <p className="text-xs text-green-600 mt-1">
                              확인 시간: {new Date(parsedResult.timestamp).toLocaleString('ko-KR')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* JSON 결과 */}
                  {parsedResult.type === 'json' && parsedResult.data && (
                    <div className="border rounded-lg p-6">
                      <h4 className="font-semibold text-gray-800 mb-3">결과</h4>
                      <div className="bg-gray-900 rounded-lg p-4 max-h-96 overflow-y-auto">
                        <pre className="text-xs text-green-400 whitespace-pre-wrap font-mono">
                          {JSON.stringify(parsedResult.data, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* Docker ps 결과 */}
                  {parsedResult.type === 'docker-ps' && parsedResult.data && (
                    <div className="border rounded-lg p-6 bg-blue-50 border-blue-200">
                      <h4 className="font-semibold text-gray-800 mb-4 text-lg flex items-center space-x-2">
                        <Cpu className="w-5 h-5 text-blue-600" />
                        <span>Docker 컨테이너 ({parsedResult.data.length}개)</span>
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="min-w-full bg-white rounded-lg shadow-sm">
                          <thead className="bg-gray-100">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Container ID</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Image</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Command</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Created</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Status</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Ports</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Names</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {parsedResult.data.map((container: any, idx: number) => (
                              <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm text-gray-600 font-mono text-xs">{container.containerId}</td>
                                <td className="px-4 py-3 text-sm text-gray-900">{container.image}</td>
                                <td className="px-4 py-3 text-sm text-gray-600 font-mono text-xs">{container.command}</td>
                                <td className="px-4 py-3 text-sm text-gray-600">{container.created}</td>
                                <td className="px-4 py-3 text-sm">
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                    container.status?.includes('Up') || container.status?.includes('running') 
                                      ? 'bg-green-100 text-green-700' 
                                      : 'bg-red-100 text-red-700'
                                  }`}>
                                    {container.status}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-600 font-mono text-xs">{container.ports}</td>
                                <td className="px-4 py-3 text-sm font-medium text-gray-900">{container.names}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Docker stats 결과 */}
                  {parsedResult.type === 'docker-stats' && parsedResult.data && (
                    <div className="border rounded-lg p-6 bg-purple-50 border-purple-200">
                      <h4 className="font-semibold text-gray-800 mb-4 text-lg flex items-center space-x-2">
                        <Activity className="w-5 h-5 text-purple-600" />
                        <span>Docker 리소스 사용량 ({parsedResult.data.length}개)</span>
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="min-w-full bg-white rounded-lg shadow-sm">
                          <thead className="bg-gray-100">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Container</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">CPU</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Mem Usage</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Mem %</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Net I/O</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Block I/O</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">PIDs</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {parsedResult.data.map((stat: any, idx: number) => (
                              <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm font-medium text-gray-900">{stat.container}</td>
                                <td className="px-4 py-3 text-sm text-gray-600">{stat.cpu}</td>
                                <td className="px-4 py-3 text-sm text-gray-600">{stat.memUsage}</td>
                                <td className="px-4 py-3 text-sm text-gray-600">{stat.memPercent}</td>
                                <td className="px-4 py-3 text-sm text-gray-600">{stat.netIO}</td>
                                <td className="px-4 py-3 text-sm text-gray-600">{stat.blockIO}</td>
                                <td className="px-4 py-3 text-sm text-gray-600">{stat.pids}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Docker logs 결과 */}
                  {parsedResult.type === 'docker-logs' && parsedResult.data && (
                    <div className="border rounded-lg p-6 bg-gray-50">
                      <h4 className="font-semibold text-gray-800 mb-3">Docker 로그</h4>
                      <div className="bg-gray-900 rounded-lg p-4 max-h-96 overflow-y-auto">
                        <pre className="text-xs text-green-400 whitespace-pre-wrap font-mono">
                          {parsedResult.data}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* 세션 목록 */}
                  {parsedResult.type === 'sessions' && parsedResult.data && (
                    <div className="border rounded-lg p-6 bg-cyan-50 border-cyan-200">
                      <h4 className="font-semibold text-gray-800 mb-4 text-lg flex items-center space-x-2">
                        <Activity className="w-5 h-5 text-cyan-600" />
                        <span>네트워크 세션 목록 ({parsedResult.data.length}개)</span>
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="min-w-full bg-white rounded-lg shadow-sm">
                          <thead className="bg-gray-100">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">ID</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">API Session ID</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Service Name</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Type</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Token</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {parsedResult.data.map((session: any, idx: number) => (
                              <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm text-gray-600 font-mono text-xs">{session.id}</td>
                                <td className="px-4 py-3 text-sm text-gray-600 font-mono text-xs">{session.apiSessionId}</td>
                                <td className="px-4 py-3 text-sm font-medium text-gray-900">{session.serviceName}</td>
                                <td className="px-4 py-3 text-sm text-gray-600">{session.type}</td>
                                <td className="px-4 py-3 text-sm text-gray-600 font-mono text-xs">{session.token || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Docker 결과 (기타) */}
                  {parsedResult.type === 'docker' && parsedResult.data && (
                    <div className="border rounded-lg p-6 bg-gray-50">
                      <h4 className="font-semibold text-gray-800 mb-3">Docker 결과</h4>
                      <div className="bg-gray-900 rounded-lg p-4 max-h-96 overflow-y-auto">
                        <pre className="text-xs text-green-400 whitespace-pre-wrap font-mono">
                          {Array.isArray(parsedResult.data) ? parsedResult.data.join('\n') : parsedResult.data}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* 텍스트 결과 */}
                  {parsedResult.type === 'text' && parsedResult.data && (
                    <div className="border rounded-lg p-6">
                      <h4 className="font-semibold text-gray-800 mb-3">출력 결과</h4>
                      <div className="bg-gray-900 rounded-lg p-4 max-h-96 overflow-y-auto">
                        <pre className="text-xs text-green-400 whitespace-pre-wrap font-mono">
                          {parsedResult.data}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* 결과 없음 */}
                  {!parsedResult.data && parsedResult.type !== 'error' && parsedResult.type !== 'success' && parsedResult.type !== 'health-check' && (
                    <div className="text-center py-8 text-gray-500">
                      결과가 없습니다.
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  결과가 없습니다.
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setShowResultModal(false)}
                className="bg-[#10113C] text-white px-6 py-2 rounded-lg hover:bg-[#10113C]/90 transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>);
};

export default NetworkControl;