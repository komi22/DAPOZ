import { API_BASE_URL } from '../utils/api';

import React, { useState, useEffect, useRef } from 'react';
import {Users, Server, Play, CheckCircle, XCircle, Clock, ExternalLink, Settings, RefreshCw, AlertTriangle, Activity, Key, LogIn, Cpu, HardDrive, Lock, Unlock, Terminal, Copy, Eye, X, ChevronDown, ChevronUp, Ban, Shield} from 'lucide-react';

interface TerminalMessage {
  id: string;
  type: 'command' | 'output' | 'error';
  content: string;
  timestamp: Date;
}

interface AccessLog {
  id: string;
  timestamp: Date;
  user: string;
  sourceIp: string;
  action: string;
  resource: string;
  method: string;
  status: 'success' | 'failed' | 'blocked';
  userAgent: string;
  realm?: string;
}

interface BlockRule {
  id: string;
  type: 'user' | 'ip' | 'resource' | 'action'; // 호환성을 위해 유지하지만 사용하지 않음
  value: string; // 호환성을 위해 유지하지만 사용하지 않음
  conditions: {
    user?: string;
    ip?: string;
    resource?: string;
    action?: string;
  };
  reason: string;
  createdAt: Date;
  enabled: boolean;
}

const IdentityControl: React.FC = () => {
  const [commandInput, setCommandInput] = useState('');
  const [terminalMessages, setTerminalMessages] = useState<TerminalMessage[]>([]);
  const [dockerContainers, setDockerContainers] = useState<any[]>([]);
  const [systemLogs, setSystemLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [showLogs, setShowLogs] = useState(false);
  const [error, setError] = useState<string>('');
  const [isTerminalConnected, setIsTerminalConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [showToast, setShowToast] = useState(false);
  const [commandResults, setCommandResults] = useState<Record<string, string>>({});
  const [showResultModal, setShowResultModal] = useState(false);
  const [selectedCommandResult, setSelectedCommandResult] = useState<string>('');
  const [parsedKeycloakData, setParsedKeycloakData] = useState<any>(null);
  const [resultType, setResultType] = useState<'text' | 'json' | 'array' | 'object'>('text');
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({});
  
  // 실시간 로그 관련 상태
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<AccessLog | null>(null);
  const [blockRules, setBlockRules] = useState<BlockRule[]>([]);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [logFilter, setLogFilter] = useState<'all' | 'success' | 'failed' | 'blocked'>('all');
  const [autoRefreshLogs, setAutoRefreshLogs] = useState(true);
  const [selectedBlockTypes, setSelectedBlockTypes] = useState<Set<'user' | 'ip' | 'resource' | 'action'>>(new Set());
  const [selectedRuleIds, setSelectedRuleIds] = useState<Set<string>>(new Set());
  
  const terminalRef = useRef<HTMLDivElement>(null);
  const logsRef = useRef<HTMLDivElement>(null);
  const previousScrollTopRef = useRef<number>(0);
  const shouldMaintainScrollRef = useRef<boolean>(false);

  const [connectionStatus, setConnectionStatus] = useState({
    backend: 'unknown',
    docker: 'unknown',
    keycloak: 'unknown'
  });

  // 백엔드 연결 상태 확인
  const checkBackendConnection = async () => {
    try {
      console.log('백엔드 연결 상태 확인 시작...');

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
        const result = await response.json();
        console.log('백엔드 연결 성공:', result);
        setConnectionStatus((prev) => ({ ...prev, backend: 'connected' }));
        setError('');
        return true;
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error: any) {
      console.error('백엔드 연결 실패:', error);
      setConnectionStatus((prev) => ({ ...prev, backend: 'disconnected' }));

      if (error.name === 'AbortError') {
        setError('백엔드 서버 연결 시간 초과 (5초)');
      } else {
        setError(`백엔드 서버 연결 실패: ${error.message}`);
      }
      return false;
    }
  };

  // Docker 컨테이너 상태 조회
  const fetchDockerStatus = async () => {
    try {
      console.log('Docker 상태 조회 시작...');

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
      console.log('Docker API 응답 상태:', response.status);

      if (response.ok) {
        const result = await response.json();
        console.log('Docker 컨테이너 상태:', result);

        const containerList = result.containers || result || [];
        // Keycloak 컨테이너만 필터링
        const keycloakContainers = containerList.filter((container: any) => 
          container.name === 'keycloak' || container.image?.includes('keycloak')
        );
        
        setDockerContainers(keycloakContainers);
        setConnectionStatus((prev) => ({ 
          ...prev, 
          docker: 'connected',
          keycloak: keycloakContainers.length > 0 ? 'connected' : 'disconnected'
        }));
      } else {
        const errorText = await response.text().catch(() => '응답 읽기 실패');
        console.error('Docker API 오류:', response.status, errorText);
        setConnectionStatus((prev) => ({ ...prev, docker: 'error', keycloak: 'error' }));
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
    } catch (error: any) {
      console.error('Docker 상태 조회 실패:', error);
      setConnectionStatus((prev) => ({ ...prev, docker: 'error', keycloak: 'error' }));

      if (error.name === 'AbortError') {
        setError((prev) => prev + ' | Docker 조회 시간 초과 (15초)');
      } else {
        setError((prev) => prev + ` | Docker 상태 조회 실패: ${error.message}`);
      }
    }
  };

  // 시스템 로그 조회
  const fetchSystemLogs = async () => {
    try {
      console.log('시스템 로그 조회 시작...');

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
        console.log('시스템 로그 조회 성공:', result);

        const logs = result.logs || result || [];
        setSystemLogs(Array.isArray(logs) ? logs : []);
      } else {
        console.error('시스템 로그 조회 실패:', response.status, response.statusText);
      }
    } catch (error: any) {
      console.error('시스템 로그 조회 실패:', error);
    }
  };

  // 컴포넌트 마운트 시 차단 규칙 로드
  useEffect(() => {
    loadBlockRules();
  }, []);

  // 실시간 접근 로그 조회 - Keycloak 이벤트 로그 기반
  const fetchAccessLogs = async () => {
    try {
      console.log('=== Keycloak 이벤트 로그 조회 시작 ===');
      console.log('API 호출: http://localhost:3001/api/keycloak/execute');
      
      // 기존 백엔드 API를 사용하여 Keycloak 이벤트 조회
      const response = await fetch(API_BASE_URL + '/keycloak/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          command: 'get events --realm master'
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('=== API 응답 성공 ===');
        console.log('전체 응답:', result);
        console.log('stdout 길이:', result.stdout?.length || 0);
        console.log('stdout 내용:', result.stdout);
        console.log('stderr:', result.stderr);
        
        // stderr에 에러가 있는지 확인
        if (result.stderr && result.stderr.trim()) {
          console.error('Keycloak 명령어 실행 에러:', result.stderr);
          // 에러 메시지에 따라 사용자에게 안내
          if (result.stderr.includes('not found') || result.stderr.includes('Unknown command')) {
            console.warn('get events 명령어를 찾을 수 없습니다. Keycloak 버전을 확인하세요.');
          }
        }
        
        // JSON 파싱 시도
        let events: any[] = [];
        try {
          const output = result.stdout || '';
          
          if (!output.trim()) {
            console.log('이벤트 출력이 비어있습니다.');
            console.log('실제 접근 로그를 보려면 Keycloak 이벤트 로깅을 활성화해야 합니다.');
            console.log('Keycloak Admin Console → Realm Settings → Events → Save Events 활성화');
            // 실제 이벤트가 없으면 로그를 생성하지 않음
            return;
          }
          
          console.log('원본 출력 (처음 500자):', output.substring(0, 500));
          
          // JSON 배열 추출
          const jsonMatch = output.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            events = JSON.parse(jsonMatch[0]);
            console.log('JSON 배열 파싱 성공, 이벤트 개수:', events.length);
          } else {
            // 전체 출력이 JSON인 경우
            const trimmed = output.trim();
            if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
              events = JSON.parse(trimmed);
              console.log('전체 JSON 파싱 성공, 이벤트 개수:', events.length);
            } else {
              console.log('JSON 형식이 아닌 출력:', trimmed.substring(0, 200));
              console.log('get events 명령어가 지원되지 않거나 이벤트 로깅이 비활성화되어 있습니다.');
              console.log('실제 접근 로그를 보려면 Keycloak 이벤트 로깅을 활성화해야 합니다.');
              // 실제 이벤트가 없으면 로그를 생성하지 않음
              return;
            }
          }
          
          // 이벤트가 배열이 아닌 경우
          if (!Array.isArray(events)) {
            console.log('이벤트가 배열이 아닙니다:', typeof events);
            events = [];
          }
        } catch (e) {
          console.error('이벤트 파싱 실패:', e);
          console.error('파싱 시도한 출력:', result.stdout?.substring(0, 500));
          // 파싱 실패 시 빈 배열
          events = [];
        }
        
        if (events.length === 0) {
          console.log('Keycloak 이벤트가 없습니다.');
          console.log('실제 접근 로그를 보려면:');
          console.log('1. Keycloak Admin Console (http://localhost:8080) 접속');
          console.log('2. Realm Settings → Events 이동');
          console.log('3. "Save Events" 활성화');
          console.log('4. 원하는 이벤트 타입 선택 (LOGIN, LOGOUT, LOGIN_ERROR 등)');
          console.log('5. 실제 로그인/접근을 시도하여 이벤트 생성');
          // 실제 이벤트가 없으면 로그를 생성하지 않음
          return;
        }
        
        console.log(`실제 Keycloak 이벤트 ${events.length}개를 가져왔습니다.`);
        
        // 디버깅: 첫 번째 이벤트 데이터 구조 확인
        if (events.length > 0) {
          console.log('이벤트 데이터 샘플 (IP 주소 확인용):', JSON.stringify(events[0], null, 2));
        }
        
        // Keycloak 이벤트를 접근 로그 형식으로 변환
        const newLogs: AccessLog[] = events
          .filter((event: any) => event && event.type) // 유효한 이벤트만
          .map((event: any) => {
            // IP 주소 추출 - Keycloak 이벤트는 반드시 IP 주소를 포함해야 함
            let ipAddress: string | null = null;
            
            // Keycloak 이벤트의 일반적인 IP 주소 필드들 (우선순위 순)
            const ipFieldNames = [
              'ipAddress',      // 가장 일반적인 필드
              'ip_address',    
              'clientIp',
              'client_ip',
              'ip',
              'remoteAddress',
              'remote_address',
              'sourceIp',
              'source_ip',
              'clientAddress',
              'client_address'
            ];
            
            // 1. 이벤트 객체의 직접 필드 확인
            for (const fieldName of ipFieldNames) {
              if (event[fieldName] && typeof event[fieldName] === 'string') {
                const ip = event[fieldName].trim();
                if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
                  ipAddress = ip;
                  break;
                }
              }
            }
            
            // 2. details 객체 확인 (Keycloak은 종종 details에 IP를 저장)
            if (!ipAddress && event.details) {
              if (typeof event.details === 'object' && event.details !== null) {
                // details의 모든 키에서 IP 찾기
                for (const fieldName of ipFieldNames) {
                  if (event.details[fieldName] && typeof event.details[fieldName] === 'string') {
                    const ip = event.details[fieldName].trim();
                    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
                      ipAddress = ip;
                      break;
                    }
                  }
                }
                
                // details 객체의 모든 값에서 IP 패턴 찾기
                if (!ipAddress) {
                  for (const key in event.details) {
                    const value = event.details[key];
                    if (typeof value === 'string') {
                      const ip = value.trim();
                      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
                        ipAddress = ip;
                        break;
                      }
                    } else if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
                      const ip = value[0].trim();
                      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
                        ipAddress = ip;
                        break;
                      }
                    }
                  }
                }
              }
            }
            
            // 3. 전체 이벤트 객체를 문자열로 변환하여 IP 패턴 찾기 (최후의 수단)
            if (!ipAddress) {
              try {
                const eventString = JSON.stringify(event);
                const ipPattern = /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g;
                const matches = eventString.match(ipPattern);
                if (matches && matches.length > 0) {
                  // 첫 번째 IP 주소 사용
                  ipAddress = matches[0];
                }
              } catch (e) {
                console.error('이벤트 문자열 변환 실패:', e);
              }
            }
            
            // IP 주소를 찾지 못한 경우 - 실제 이벤트에는 반드시 있어야 함
            if (!ipAddress) {
              // 디버깅: 전체 이벤트 구조 출력
              console.error('IP 주소를 찾을 수 없습니다. 이벤트 구조:', JSON.stringify(event, null, 2));
              console.error('이벤트의 모든 키:', Object.keys(event));
              if (event.details) {
                console.error('details의 모든 키:', Object.keys(event.details));
              }
              // 임시로 N/A 표시하지만 실제로는 문제가 있는 것
              ipAddress = 'N/A';
            } else {
              console.log(`✓ IP 주소 발견: ${ipAddress} (이벤트 타입: ${event.type}, 이벤트 ID: ${event.id})`);
            }
            
            // 사용자 정보 추출
            const userId = event.userId || 
                          event.user_id || 
                          event.username ||
                          event.details?.userId ||
                          event.details?.username ||
                          'unknown';
            
            // 리소스 경로 추출
            const resourcePath = event.resourcePath || 
                                event.resource_path ||
                                event.resourceUri ||
                                event.resource_uri ||
                                event.details?.resourcePath ||
                                (event.clientId ? `/auth/realms/${event.realmId || 'master'}/clients/${event.clientId}` : '/');
            
            // 고유한 ID 생성 (이벤트 ID가 있으면 사용, 없으면 타임스탬프 + 랜덤)
            const uniqueId = event.id || `${event.time || Date.now()}-${userId}-${Math.random().toString(36).substr(2, 9)}-${Math.random().toString(36).substr(2, 9)}`;
            
            // 로그 객체 생성
            const logEntry: AccessLog = {
              id: uniqueId,
              timestamp: event.time ? new Date(event.time * 1000) : new Date(),
              user: userId,
              sourceIp: ipAddress,
              action: event.type || 'UNKNOWN',
              resource: resourcePath,
              method: event.method || event.details?.method || 'GET',
              status: (event.error || event.type?.includes('ERROR') || event.type?.includes('FAILED')) ? 'failed' : 'success',
              userAgent: event.userAgent || event.user_agent || event.details?.userAgent || 'Unknown',
              realm: event.realmId || event.realm_id || 'master'
            };
            
            // 차단 규칙 확인 (이 함수는 나중에 정의됨)
            // 차단 규칙이 적용되어야 하는 경우 상태를 'blocked'로 변경
            // 주의: 이건 로그를 표시하는 것이고, 실제 차단은 addBlockRule에서 처리됨
            
            return logEntry;
          });
        
        if (newLogs.length > 0) {
          // 차단 규칙 확인: 백엔드 API를 통해 차단 여부 확인
          const logsWithBlockStatus = await Promise.all(newLogs.map(async (log) => {
            try {
              // 백엔드에서 차단 규칙 확인
              const checkResponse = await fetch(API_BASE_URL + '/block-rules/check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  user: log.user,
                  ip: log.sourceIp,
                  resource: log.resource,
                  action: log.action
                })
              });
              
              if (checkResponse.ok) {
                const checkData = await checkResponse.json();
                if (checkData.success && checkData.blocked) {
                  // 차단 규칙에 해당하면 상태를 'blocked'로 변경
                  if (log.status === 'success') {
                    console.log(`🚫 차단된 접근 감지: ${checkData.reason}`, log);
                    return { ...log, status: 'blocked' as const };
                  }
                }
              }
            } catch (error) {
              console.error('차단 규칙 확인 중 오류:', error);
            }
            
            // 로컬 차단 규칙도 확인 (백엔드 확인 실패 시 대비)
            const shouldBlock = blockRules.some(rule => {
              if (!rule.enabled) return false;
              
              switch (rule.type) {
                case 'user':
                  return log.user === rule.value;
                case 'ip':
                  return log.sourceIp === rule.value;
                case 'resource':
                  return log.resource === rule.value || log.resource.startsWith(rule.value);
                case 'action':
                  return log.action === rule.value;
                default:
                  return false;
              }
            });
            
            if (shouldBlock && log.status === 'success') {
              return { ...log, status: 'blocked' as const };
            }
            
            return log;
          }));
          
          // 완전 누적 방식: 모든 로그를 누적
          setAccessLogs(prev => {
            // 기존 로그와 새 로그 결합
            const combined = [...logsWithBlockStatus, ...prev];
            
            // 중복 제거: 같은 ID가 있으면 제거 (이벤트는 고유 ID를 가지므로)
            const unique = combined.filter((log, index, self) => 
              index === self.findIndex(l => l.id === log.id)
            );
            
            // 시간순 정렬 (최신이 위로)
            unique.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
            
            // 최대 개수 제한 없음 - 모든 로그 유지
            // 하지만 너무 많으면 최근 1000개만 유지 (성능 고려)
            return unique.slice(0, 1000);
          });
          console.log(`${newLogs.length}개의 이벤트 로그를 추가했습니다.`);
        } else {
          console.log('이벤트가 없거나 파싱할 수 없습니다.');
        }
      } else {
        console.error('=== API 응답 실패 ===');
        console.error('HTTP 상태 코드:', response.status);
        console.error('응답 상태:', response.statusText);
        const errorText = await response.text();
        console.error('에러 내용:', errorText);
        console.error('실제 접근 로그를 가져올 수 없습니다.');
      }
    } catch (error: any) {
      console.error('=== 접근 로그 조회 예외 발생 ===');
      console.error('에러 타입:', error.name);
      console.error('에러 메시지:', error.message);
      console.error('전체 에러:', error);
      console.error('실제 접근 로그를 가져올 수 없습니다.');
    }
  };

  // 사용자 목록을 기반으로 접근 로그 생성 (fallback)
  const fetchUsersAsLogs = async () => {
    try {
      console.log('사용자 목록 기반 로그 생성 시작...');
      
      const response = await fetch(API_BASE_URL + '/keycloak/users', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        const users = result.data || [];
        
        if (users.length === 0) {
          console.log('사용자 목록도 비어있습니다.');
          return;
        }
        
        // 디버깅: 첫 번째 사용자 데이터 구조 확인
        if (users.length > 0) {
          console.log('사용자 데이터 샘플 (IP 주소 확인용):', JSON.stringify(users[0], null, 2));
        }
        
        // 사용자 데이터를 접근 로그 형식으로 변환
        const newLogs: AccessLog[] = users.map((user: any, index: number) => {
          // IP 주소 추출 - 여러 방법 시도
          let ipAddress = 'N/A';
          
          // 1. user 객체의 직접 속성 확인
          if (user.ipAddress || user.ip || user.lastLoginIp) {
            ipAddress = user.ipAddress || user.ip || user.lastLoginIp;
          }
          
          // 2. attributes 객체 확인
          if (ipAddress === 'N/A' && user.attributes) {
            // 다양한 키 이름으로 IP 찾기
            const ipKeys = ['lastLoginIp', 'ipAddress', 'last_login_ip', 'ip_address', 'loginIp', 'login_ip', 'ip', 'clientIp', 'client_ip', 'remoteAddress', 'remote_address'];
            for (const key of ipKeys) {
              if (user.attributes[key]) {
                if (Array.isArray(user.attributes[key]) && user.attributes[key][0]) {
                  const ip = user.attributes[key][0];
                  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
                    ipAddress = ip;
                    break;
                  }
                } else if (typeof user.attributes[key] === 'string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(user.attributes[key])) {
                  ipAddress = user.attributes[key];
                  break;
                }
              }
            }
            
            // attributes 전체를 순회하며 IP 패턴 찾기
            if (ipAddress === 'N/A') {
              for (const key in user.attributes) {
                const value = user.attributes[key];
                if (Array.isArray(value)) {
                  const ipMatch = value.find((v: any) => 
                    typeof v === 'string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v)
                  );
                  if (ipMatch) {
                    ipAddress = ipMatch;
                    break;
                  }
                } else if (typeof value === 'string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value)) {
                  ipAddress = value;
                  break;
                }
              }
            }
          }
          
          // 3. credentials나 다른 객체에서도 찾기
          if (ipAddress === 'N/A' && user.credentials) {
            for (const cred of user.credentials) {
              if (cred.ipAddress && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(cred.ipAddress)) {
                ipAddress = cred.ipAddress;
                break;
              }
            }
          }
          
          // 4. IP 주소를 찾지 못한 경우 N/A로 표시 (시뮬레이션 생성하지 않음)
          if (ipAddress === 'N/A') {
            // 실제 IP 주소가 없으므로 N/A 유지
            ipAddress = 'N/A';
          }
          
          // 고유한 ID 생성 (타임스탬프 + 사용자 ID + 인덱스 + 랜덤) - 중복 방지
          const uniqueId = `${Date.now()}-${user.id || index}-${index}-${Math.random().toString(36).substr(2, 9)}-${Math.random().toString(36).substr(2, 9)}`;
          
          // 각 로그에 고유한 시간 부여 (최신 로그가 위로 오도록)
          // 새로 추가되는 로그는 현재 시간을 사용하고, 인덱스에 따라 약간의 시간 차이를 둠
          const logTimestamp = new Date(Date.now() - (index * 100));
          
          return {
            id: uniqueId,
            timestamp: logTimestamp,
            user: user.username || user.email || 'unknown',
            sourceIp: ipAddress,
            action: user.enabled ? 'ACTIVE' : 'DISABLED',
            resource: `/auth/realms/${user.realm || 'master'}/users/${user.id}`,
            method: 'GET',
            status: user.enabled ? 'success' : 'blocked',
            userAgent: 'Keycloak Admin',
            realm: user.realm || 'master'
          };
        });
        
        if (newLogs.length > 0) {
          setAccessLogs(prev => {
            // 완전 누적 방식: 모든 로그를 누적 (중복 제거 없음)
            // 새 로그를 앞에 추가하여 최신 로그가 먼저 보이도록
            const combined = [...newLogs, ...prev];
            
            // 시간순 정렬 (최신이 위로) - 내림차순
            combined.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
            
            // 최대 개수 제한 없음 - 모든 로그 유지
            return combined;
          });
          console.log(`사용자 목록 기반 로그 ${newLogs.length}개 추가 완료 (총 ${accessLogs.length + newLogs.length}개)`);
        }
      } else {
        console.error('사용자 목록 조회 실패:', response.status);
      }
    } catch (error: any) {
      console.error('사용자 목록 기반 로그 생성 실패:', error);
    }
  };

  // 차단 규칙 로드 (백엔드 API에서)
  const loadBlockRules = async () => {
    try {
      const response = await fetch(API_BASE_URL + '/block-rules');
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.rules) {
          setBlockRules(data.rules.map((rule: any) => ({
            ...rule,
            createdAt: new Date(rule.createdAt),
            conditions: rule.conditions || undefined // conditions가 없으면 undefined
          })));
          console.log(`차단 규칙 ${data.rules.length}개 로드 완료`);
        }
      }
    } catch (error) {
      console.error('차단 규칙 로드 실패:', error);
    }
  };

  // 차단 규칙이 적용되어야 하는지 확인 (모든 조건을 만족해야 차단)
  const shouldBlockAccess = (log: AccessLog): boolean => {
    return blockRules.some(rule => {
      if (!rule.enabled) return false;
      
      // conditions가 있으면 모든 조건을 만족해야 차단
      if (rule.conditions) {
        const conditions = rule.conditions;
        let matches = true;
        
        if (conditions.user && log.user !== conditions.user) matches = false;
        if (conditions.ip && log.sourceIp !== conditions.ip) matches = false;
        if (conditions.resource && log.resource !== conditions.resource && !log.resource.startsWith(conditions.resource)) matches = false;
        if (conditions.action && log.action !== conditions.action) matches = false;
        
        return matches;
      }
      
      // 호환성을 위해 기존 방식도 지원
      switch (rule.type) {
        case 'user':
          return log.user === rule.value;
        case 'ip':
          return log.sourceIp === rule.value;
        case 'resource':
          return log.resource === rule.value || log.resource.startsWith(rule.value);
        case 'action':
          return log.action === rule.value;
        default:
          return false;
      }
    });
  };

  // 차단 규칙 추가
  const addBlockRule = async (log: AccessLog, selectedTypes: Set<'user' | 'ip' | 'resource' | 'action'>, reason: string) => {
    if (selectedTypes.size === 0) {
      alert('최소 하나 이상의 조건을 선택해주세요.');
      return;
    }
    
    const conditions: { user?: string; ip?: string; resource?: string; action?: string } = {};
    if (selectedTypes.has('user')) conditions.user = log.user;
    if (selectedTypes.has('ip')) conditions.ip = log.sourceIp;
    if (selectedTypes.has('resource')) conditions.resource = log.resource;
    if (selectedTypes.has('action')) conditions.action = log.action;
    
    // 호환성을 위해 첫 번째 선택된 타입을 type으로 설정
    const firstType = Array.from(selectedTypes)[0];
    const firstValue = firstType === 'user' ? log.user : firstType === 'ip' ? log.sourceIp : firstType === 'resource' ? log.resource : log.action;
    
    const newRule: BlockRule = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: firstType,
      value: firstValue,
      conditions,
      reason,
      createdAt: new Date(),
      enabled: true
    };
    
    setBlockRules(prev => [newRule, ...prev]);
    
    // 백엔드에 차단 규칙 저장
    try {
      const saveResponse = await fetch(API_BASE_URL + '/block-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newRule,
          createdAt: newRule.createdAt.toISOString()
        })
      });
      
      if (saveResponse.ok) {
        console.log('차단 규칙이 백엔드에 저장되었습니다');
      } else {
        console.error('차단 규칙 저장 실패:', await saveResponse.text());
      }
    } catch (error) {
      console.error('차단 규칙 저장 중 오류:', error);
    }
    
    setShowBlockModal(false);
    setSelectedLog(null);
    setSelectedBlockTypes(new Set());
    
    // Keycloak에 차단 규칙 적용 시도
    try {
      // 사용자 차단
      if (conditions.user) {
        // 사용자 비활성화 - 실제로 차단됨
        const response = await fetch(API_BASE_URL + '/keycloak/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            command: `update users/${log.user} --realm master -s enabled=false`
          })
        });
        if (response.ok) {
          console.log('사용자 차단 적용 완료:', log.user);
          
          // 활성 세션 종료
          try {
            const userResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                command: `get users --realm master -q username=${log.user}`
              })
            });
            
            if (userResponse.ok) {
              const userResult = await userResponse.json();
              const users = JSON.parse(userResult.stdout || '[]');
              if (users.length > 0) {
                const userId = users[0].id;
                // 사용자의 모든 세션 종료
                const logoutResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                    command: `logout-user --realm master --user-id ${userId}`
                  })
                });
                if (logoutResponse.ok) {
                  console.log('사용자 세션 종료 완료:', log.user);
                } else {
                  // logout-user 명령어가 없을 수 있으므로 sessions API 사용
                  const sessionsResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                      command: `get users/${userId}/sessions --realm master`
                    })
                  });
                  if (sessionsResponse.ok) {
                    const sessionsResult = await sessionsResponse.json();
                    const sessions = JSON.parse(sessionsResult.stdout || '[]');
                    // 각 세션 종료
                    for (const session of sessions) {
                      await fetch(API_BASE_URL + '/keycloak/execute', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                          command: `delete users/${userId}/sessions/${session.id} --realm master`
                        })
                      });
                    }
                    console.log(`${sessions.length}개 세션 종료 완료`);
                  }
                }
              }
            }
          } catch (error) {
            console.error('세션 종료 실패:', error);
          }
        } else {
          console.error('사용자 차단 실패:', await response.text());
        }
      }
      
      // IP 차단: 사용자 속성에 차단된 IP 추가
      if (conditions.ip) {
        // 먼저 사용자 ID를 찾아야 함
        if (conditions.user && conditions.user !== 'unknown') {
          try {
            // 사용자 조회
            const userResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                command: `get users --realm master -q username=${log.user}`
              })
            });
            
            if (userResponse.ok) {
              const userResult = await userResponse.json();
              const users = JSON.parse(userResult.stdout || '[]');
              if (users.length > 0) {
                const userId = users[0].id;
                // 사용자 속성에 차단된 IP 추가
                const blockResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                    command: `update users/${userId} --realm master -s 'attributes.blockedIp=["${conditions.ip}"]'`
                  })
                });
                if (blockResponse.ok) {
                  console.log('IP 차단 적용 완료:', conditions.ip);
                } else {
                  console.error('IP 차단 실패:', await blockResponse.text());
                }
              }
            }
          } catch (error) {
            console.error('IP 차단 처리 중 오류:', error);
          }
        }
        console.log('IP 차단 규칙 추가됨:', conditions.ip);
      }
      
      // 리소스 차단
      if (conditions.resource) {
        // 리소스 차단: 클라이언트의 리소스 접근 권한 제거
        // 리소스 경로에서 클라이언트 ID 추출 시도
        const clientIdMatch = conditions.resource.match(/\/clients\/([^\/]+)/);
        if (clientIdMatch) {
          const clientId = clientIdMatch[1];
          try {
            // 클라이언트 조회 및 권한 제거
            const clientResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                command: `get clients --realm master -q clientId=${clientId}`
              })
            });
            
            if (clientResponse.ok) {
              const clientResult = await clientResponse.json();
              const clients = JSON.parse(clientResult.stdout || '[]');
              if (clients.length > 0) {
                const client = clients[0];
                // 클라이언트 비활성화 또는 권한 제거
                const disableResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                    command: `update clients/${client.id} --realm master -s enabled=false`
                  })
                });
                if (disableResponse.ok) {
                  console.log('리소스 차단 적용 완료:', conditions.resource);
                } else {
                  console.error('리소스 차단 실패:', await disableResponse.text());
                }
              }
            }
          } catch (error) {
            console.error('리소스 차단 처리 중 오류:', error);
          }
        }
        console.log('리소스 차단 규칙 추가됨:', conditions.resource);
      }
      
      // 액션 차단
      if (conditions.action) {
        if (conditions.action === 'LOGIN') {
        // LOGIN 액션 차단: 모든 활성 세션 종료
        try {
          // 모든 사용자의 세션 조회 및 종료
          const usersResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              command: `get users --realm master`
            })
          });
          
          if (usersResponse.ok) {
            const usersResult = await usersResponse.json();
            const users = JSON.parse(usersResult.stdout || '[]');
            
            let sessionCount = 0;
            for (const user of users) {
              try {
                // 각 사용자의 세션 조회
                const sessionsResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                    command: `get users/${user.id}/sessions --realm master`
                  })
                });
                
                if (sessionsResponse.ok) {
                  const sessionsResult = await sessionsResponse.json();
                  const sessions = JSON.parse(sessionsResult.stdout || '[]');
                  
                  // 각 세션 종료
                  for (const session of sessions) {
                    try {
                      await fetch(API_BASE_URL + '/keycloak/execute', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                          command: `delete users/${user.id}/sessions/${session.id} --realm master`
                        })
                      });
                      sessionCount++;
                    } catch (error) {
                      console.error(`세션 종료 실패 (${session.id}):`, error);
                    }
                  }
                }
              } catch (error) {
                console.error(`사용자 세션 조회 실패 (${user.username}):`, error);
              }
            }
            
            console.log(`LOGIN 차단 적용 완료: ${sessionCount}개 세션 종료`);
          }
        } catch (error) {
          console.error('LOGIN 차단 처리 중 오류:', error);
        }
        
        }
        
        // 사용자 속성에 차단된 액션 추가
        if (conditions.user && conditions.user !== 'unknown') {
          try {
            const userResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                command: `get users --realm master -q username=${conditions.user}`
              })
            });
            
            if (userResponse.ok) {
              const userResult = await userResponse.json();
              const users = JSON.parse(userResult.stdout || '[]');
              if (users.length > 0) {
                const userId = users[0].id;
                // 사용자 속성에 차단된 액션 추가
                const blockResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                    command: `update users/${userId} --realm master -s 'attributes.blockedAction=["${conditions.action}"]'`
                  })
                });
                if (blockResponse.ok) {
                  console.log('액션 차단 적용 완료:', conditions.action);
                } else {
                  console.error('액션 차단 실패:', await blockResponse.text());
                }
              }
            }
          } catch (error) {
            console.error('액션 차단 처리 중 오류:', error);
          }
        }
        console.log('액션 차단 규칙 추가됨:', conditions.action);
      }
    } catch (error) {
      console.error('차단 규칙 적용 실패:', error);
    }
    
    console.log('차단 규칙 추가:', newRule);
  };

  // 차단 규칙 토글
  const toggleBlockRule = async (ruleId: string) => {
    const updatedRules = blockRules.map(rule => 
      rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule
    );
    setBlockRules(updatedRules);
    
    // 토글된 규칙과 관련된 로그의 상태 업데이트
    const toggledRule = updatedRules.find(r => r.id === ruleId);
    if (toggledRule) {
      setAccessLogs(prev => prev.map(log => {
        // 이 규칙이 이 로그를 차단하는지 확인
        const isBlockedByThisRule = (() => {
          if (!toggledRule.enabled) return false;
          
          // conditions가 있으면 모든 조건을 만족해야 차단
          if (toggledRule.conditions) {
            const conditions = toggledRule.conditions;
            let matches = true;
            
            if (conditions.user && log.user !== conditions.user) matches = false;
            if (conditions.ip && log.sourceIp !== conditions.ip) matches = false;
            if (conditions.resource && log.resource !== conditions.resource && !log.resource.startsWith(conditions.resource)) matches = false;
            if (conditions.action && log.action !== conditions.action) matches = false;
            
            return matches;
          }
          
          // 호환성을 위해 기존 방식도 지원
          switch (toggledRule.type) {
            case 'user':
              return log.user === toggledRule.value;
            case 'ip':
              return log.sourceIp === toggledRule.value;
            case 'resource':
              return log.resource === toggledRule.value || log.resource.startsWith(toggledRule.value);
            case 'action':
              return log.action === toggledRule.value;
            default:
              return false;
          }
        })();
        
        // 규칙이 활성화되었고 이 로그를 차단하면
        if (toggledRule.enabled && isBlockedByThisRule && log.status === 'success') {
          return { ...log, status: 'blocked' as const };
        }
        
        // 규칙이 비활성화되었고 이 규칙에 의해 차단되었으면
        if (!toggledRule.enabled && log.status === 'blocked') {
          // 다른 활성 차단 규칙 확인
          const stillBlocked = updatedRules.some(rule => {
            if (!rule.enabled || rule.id === ruleId) return false;
            
            // conditions가 있으면 모든 조건을 만족해야 차단
            if (rule.conditions) {
              const conditions = rule.conditions;
              let matches = true;
              
              if (conditions.user && log.user !== conditions.user) matches = false;
              if (conditions.ip && log.sourceIp !== conditions.ip) matches = false;
              if (conditions.resource && log.resource !== conditions.resource && !log.resource.startsWith(conditions.resource)) matches = false;
              if (conditions.action && log.action !== conditions.action) matches = false;
              
              return matches;
            }
            
            // 호환성을 위해 기존 방식도 지원
            switch (rule.type) {
              case 'user':
                return log.user === rule.value;
              case 'ip':
                return log.sourceIp === rule.value;
              case 'resource':
                return log.resource === rule.value || log.resource.startsWith(rule.value);
              case 'action':
                return log.action === rule.value;
              default:
                return false;
            }
          });
          
          // 다른 규칙에 의해 차단되지 않으면 원래 상태로 복원
          if (!stillBlocked) {
            return { ...log, status: 'success' as const };
          }
        }
        
        return log;
      }));
    }
    
    // 백엔드에 업데이트 저장
    if (toggledRule) {
      try {
        const response = await fetch(`/block-rules/${ruleId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enabled: toggledRule.enabled,
            createdAt: toggledRule.createdAt.toISOString()
          })
        });
        if (response.ok) {
          console.log('차단 규칙 업데이트 완료');
        }
      } catch (error) {
        console.error('차단 규칙 업데이트 실패:', error);
      }
    }
  };

  // 차단 규칙 삭제
  const deleteBlockRule = async (ruleId: string) => {
    // 삭제할 규칙 찾기
    const ruleToDelete = blockRules.find(rule => rule.id === ruleId);
    
    // Keycloak에서 차단 정책 제거
    if (ruleToDelete) {
      try {
        // 먼저 Keycloak 인증 확인 및 재인증
        try {
          const loginResponse = await fetch(API_BASE_URL + '/keycloak/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          if (loginResponse.ok) {
            console.log('Keycloak 인증 완료');
          }
        } catch (error) {
          console.warn('Keycloak 인증 실패 (계속 진행):', error);
        }
        // conditions가 있으면 모든 조건에 대한 정책 제거
        if (ruleToDelete.conditions) {
          const conditions = ruleToDelete.conditions;
          
          // 사용자 차단 해제
          if (conditions.user) {
            // 먼저 username으로 조회 시도
            let userId: string | null = null;
            const response = await fetch(API_BASE_URL + '/keycloak/execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                command: `get users --realm master -q username=${conditions.user}`
              })
            });
            
            if (response.ok) {
              const userResult = await response.json();
              const users = JSON.parse(userResult.stdout || '[]');
              if (users.length > 0) {
                userId = users[0].id;
              }
            }
            
            // username으로 찾지 못했으면 모든 사용자 조회해서 찾기
            if (!userId) {
              const allUsersResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  command: `get users --realm master`
                })
              });
              
              if (allUsersResponse.ok) {
                const allUsersResult = await allUsersResponse.json();
                const allUsers = JSON.parse(allUsersResult.stdout || '[]');
                const foundUser = allUsers.find((u: any) => 
                  u.username === conditions.user || 
                  u.id === conditions.user ||
                  u.email === conditions.user
                );
                if (foundUser) {
                  userId = foundUser.id;
                }
              }
            }
            
            if (userId) {
              // 사용자 활성화 (최대 3번 재시도)
              let activated = false;
              for (let attempt = 0; attempt < 3; attempt++) {
                const enableResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                    command: `update users/${userId} --realm master -s enabled=true`
                  })
                });
                
                if (enableResponse.ok) {
                  // 활성화 확인
                  await new Promise(resolve => setTimeout(resolve, 500)); // 0.5초 대기
                  const verifyResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                      command: `get users/${userId} --realm master`
                    })
                  });
                  
                  if (verifyResponse.ok) {
                    const verifyResult = await verifyResponse.json();
                    const userDetail = JSON.parse(verifyResult.stdout || '{}');
                    if (userDetail.enabled) {
                      activated = true;
                      console.log('사용자 활성화 확인됨:', conditions.user);
                      break;
                    }
                  }
                }
                
                if (attempt < 2) {
                  console.log(`사용자 활성화 재시도 ${attempt + 1}/2...`);
                  await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 대기 후 재시도
                }
              }
              
              if (!activated) {
                console.error('사용자 활성화 최종 실패:', conditions.user);
                // 마지막 시도: 모든 사용자 조회해서 해당 사용자 찾아서 활성화
                try {
                  const allUsersResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                      command: `get users --realm master`
                    })
                  });
                  
                  if (allUsersResponse.ok) {
                    const allUsersResult = await allUsersResponse.json();
                    const allUsers = JSON.parse(allUsersResult.stdout || '[]');
                    const foundUser = allUsers.find((u: any) => 
                      (u.username === conditions.user || u.id === conditions.user || u.email === conditions.user) && !u.enabled
                    );
                    
                    if (foundUser) {
                      await fetch(API_BASE_URL + '/keycloak/execute', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                          command: `update users/${foundUser.id} --realm master -s enabled=true`
                        })
                      });
                      console.log('사용자 활성화 최종 재시도 완료:', conditions.user);
                    }
                  }
                } catch (error) {
                  console.error('사용자 활성화 최종 재시도 실패:', error);
                }
              }
            } else {
              console.error('사용자를 찾을 수 없습니다:', conditions.user);
              // 사용자를 찾지 못했어도 모든 비활성화된 사용자 중에서 찾아서 활성화 시도
              try {
                const allUsersResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                    command: `get users --realm master`
                  })
                });
                
                if (allUsersResponse.ok) {
                  const allUsersResult = await allUsersResponse.json();
                  const allUsers = JSON.parse(allUsersResult.stdout || '[]');
                  const foundUser = allUsers.find((u: any) => 
                    (u.username === conditions.user || u.id === conditions.user || u.email === conditions.user) && !u.enabled
                  );
                  
                  if (foundUser) {
                    await fetch(API_BASE_URL + '/keycloak/execute', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ 
                        command: `update users/${foundUser.id} --realm master -s enabled=true`
                      })
                    });
                    console.log('사용자 활성화 완료 (전체 조회 후):', conditions.user);
                  }
                }
              } catch (error) {
                console.error('사용자 활성화 실패:', error);
              }
            }
            
            // IP 차단 해제 (사용자가 있는 경우)
            if (conditions.ip && userId) {
                  try {
                    const userDetailResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ 
                        command: `get users/${userId} --realm master`
                      })
                    });
                    
                    if (userDetailResponse.ok) {
                      const userDetailResult = await userDetailResponse.json();
                      const userDetail = JSON.parse(userDetailResult.stdout || '{}');
                      
                      // IP 속성 제거 또는 업데이트
                      let updatedIps: string[] = [];
                      if (userDetail.attributes && userDetail.attributes.blockedIp) {
                        const blockedIps = Array.isArray(userDetail.attributes.blockedIp) 
                          ? userDetail.attributes.blockedIp 
                          : [userDetail.attributes.blockedIp];
                        updatedIps = blockedIps.filter((ip: string) => ip !== conditions.ip);
                      }
                      
                      // IP 속성 업데이트 (비어있으면 제거)
                      const updateResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                          command: updatedIps.length > 0 
                            ? `update users/${userId} --realm master -s 'attributes.blockedIp=${JSON.stringify(updatedIps)}'`
                            : `update users/${userId} --realm master -s 'attributes.blockedIp=[]'`
                        })
                      });
                      if (updateResponse.ok) {
                        console.log(`사용자 ${conditions.user}의 IP 차단 해제 완료: ${conditions.ip}`);
                      }
                    }
                  } catch (error) {
                    console.error('IP 차단 해제 실패:', error);
                  }
                }
            
            // 액션 차단 해제 (사용자가 있는 경우)
            if (conditions.action && userId) {
              try {
                const userDetailResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                    command: `get users/${userId} --realm master`
                  })
                });
                
                if (userDetailResponse.ok) {
                  const userDetailResult = await userDetailResponse.json();
                  const userDetail = JSON.parse(userDetailResult.stdout || '{}');
                  
                  // 액션 속성 제거 또는 업데이트
                  let updatedActions: string[] = [];
                  if (userDetail.attributes && userDetail.attributes.blockedAction) {
                    const blockedActions = Array.isArray(userDetail.attributes.blockedAction) 
                      ? userDetail.attributes.blockedAction 
                      : [userDetail.attributes.blockedAction];
                    updatedActions = blockedActions.filter((action: string) => action !== conditions.action);
                  }
                  
                  // 액션 속성 업데이트 (비어있으면 제거)
                  const updateResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                      command: updatedActions.length > 0
                        ? `update users/${userId} --realm master -s 'attributes.blockedAction=${JSON.stringify(updatedActions)}'`
                        : `update users/${userId} --realm master -s 'attributes.blockedAction=[]'`
                    })
                  });
                  if (updateResponse.ok) {
                    console.log(`사용자 ${conditions.user}의 액션 차단 해제 완료: ${conditions.action}`);
                  }
                }
              } catch (error) {
                console.error('액션 차단 해제 실패:', error);
              }
            }
          }
          
          // IP만 차단된 경우 (사용자가 없는 경우)
          if (conditions.ip && !conditions.user) {
            const usersResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                command: `get users --realm master`
              })
            });
            
            if (usersResponse.ok) {
              const usersResult = await usersResponse.json();
              const users = JSON.parse(usersResult.stdout || '[]');
              
              for (const user of users) {
                try {
                  // 사용자 상세 정보 가져오기
                  const userDetailResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                      command: `get users/${user.id} --realm master`
                    })
                  });
                  
                  if (userDetailResponse.ok) {
                    const userDetailResult = await userDetailResponse.json();
                    const userDetail = JSON.parse(userDetailResult.stdout || '{}');
                    
                    let updatedIps: string[] = [];
                    if (userDetail.attributes && userDetail.attributes.blockedIp) {
                      const blockedIps = Array.isArray(userDetail.attributes.blockedIp) 
                        ? userDetail.attributes.blockedIp 
                        : [userDetail.attributes.blockedIp];
                      updatedIps = blockedIps.filter((ip: string) => ip !== conditions.ip);
                    }
                    
                    // IP 속성 업데이트 (비어있으면 제거)
                    const updateResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ 
                        command: updatedIps.length > 0
                          ? `update users/${user.id} --realm master -s 'attributes.blockedIp=${JSON.stringify(updatedIps)}'`
                          : `update users/${user.id} --realm master -s 'attributes.blockedIp=[]'`
                      })
                    });
                    if (updateResponse.ok) {
                      console.log(`사용자 ${user.username}의 IP 차단 해제 완료: ${conditions.ip}`);
                    }
                  }
                } catch (error) {
                  console.error(`사용자 ${user.username} IP 차단 해제 실패:`, error);
                }
              }
            }
          }
          
          // 액션만 차단된 경우 (사용자가 없는 경우)
          if (conditions.action && !conditions.user) {
            const usersResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                command: `get users --realm master`
              })
            });
            
            if (usersResponse.ok) {
              const usersResult = await usersResponse.json();
              const users = JSON.parse(usersResult.stdout || '[]');
              
              for (const user of users) {
                try {
                  // 사용자 상세 정보 가져오기
                  const userDetailResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                      command: `get users/${user.id} --realm master`
                    })
                  });
                  
                  if (userDetailResponse.ok) {
                    const userDetailResult = await userDetailResponse.json();
                    const userDetail = JSON.parse(userDetailResult.stdout || '{}');
                    
                    let updatedActions: string[] = [];
                    if (userDetail.attributes && userDetail.attributes.blockedAction) {
                      const blockedActions = Array.isArray(userDetail.attributes.blockedAction) 
                        ? userDetail.attributes.blockedAction 
                        : [userDetail.attributes.blockedAction];
                      updatedActions = blockedActions.filter((action: string) => action !== conditions.action);
                    }
                    
                    // 액션 속성 업데이트 (비어있으면 제거)
                    const updateResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ 
                        command: updatedActions.length > 0
                          ? `update users/${user.id} --realm master -s 'attributes.blockedAction=${JSON.stringify(updatedActions)}'`
                          : `update users/${user.id} --realm master -s 'attributes.blockedAction=[]'`
                      })
                    });
                    if (updateResponse.ok) {
                      console.log(`사용자 ${user.username}의 액션 차단 해제 완료: ${conditions.action}`);
                    }
                  }
                } catch (error) {
                  console.error(`사용자 ${user.username} 액션 차단 해제 실패:`, error);
                }
              }
            }
          }
          
          // 리소스 차단 해제
          if (conditions.resource) {
            const clientIdMatch = conditions.resource.match(/\/clients\/([^\/]+)/);
            if (clientIdMatch) {
              const clientId = clientIdMatch[1];
              try {
                const clientResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                    command: `get clients --realm master -q clientId=${clientId}`
                  })
                });
                
                if (clientResponse.ok) {
                  const clientResult = await clientResponse.json();
                  const clients = JSON.parse(clientResult.stdout || '[]');
                  if (clients.length > 0) {
                    const client = clients[0];
                    // 클라이언트 활성화
                    const enableResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ 
                        command: `update clients/${client.id} --realm master -s enabled=true`
                      })
                    });
                    if (enableResponse.ok) {
                      console.log('리소스 차단 해제 완료:', conditions.resource);
                    }
                  }
                }
              } catch (error) {
                console.error('리소스 차단 해제 실패:', error);
              }
            }
          }
        } else if (ruleToDelete.type === 'user') {
          // 기존 단일 조건 방식 (호환성)
          // 사용자 차단 해제: 사용자 다시 활성화
          let userId: string | null = null;
          const response = await fetch(API_BASE_URL + '/keycloak/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              command: `get users --realm master -q username=${ruleToDelete.value}`
            })
          });
          
          if (response.ok) {
            const userResult = await response.json();
            const users = JSON.parse(userResult.stdout || '[]');
            if (users.length > 0) {
              userId = users[0].id;
            }
          }
          
          // username으로 찾지 못했으면 모든 사용자 조회해서 찾기
          if (!userId) {
            const allUsersResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                command: `get users --realm master`
              })
            });
            
            if (allUsersResponse.ok) {
              const allUsersResult = await allUsersResponse.json();
              const allUsers = JSON.parse(allUsersResult.stdout || '[]');
              const foundUser = allUsers.find((u: any) => 
                u.username === ruleToDelete.value || 
                u.id === ruleToDelete.value ||
                u.email === ruleToDelete.value
              );
              if (foundUser) {
                userId = foundUser.id;
              }
            }
          }
          
          if (userId) {
            // 사용자 활성화 (최대 3번 재시도)
            let activated = false;
            for (let attempt = 0; attempt < 3; attempt++) {
              const enableResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  command: `update users/${userId} --realm master -s enabled=true`
                })
              });
              
              if (enableResponse.ok) {
                // 활성화 확인
                await new Promise(resolve => setTimeout(resolve, 500)); // 0.5초 대기
                const verifyResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                    command: `get users/${userId} --realm master`
                  })
                });
                
                if (verifyResponse.ok) {
                  const verifyResult = await verifyResponse.json();
                  const userDetail = JSON.parse(verifyResult.stdout || '{}');
                  if (userDetail.enabled) {
                    activated = true;
                    console.log('사용자 활성화 확인됨:', ruleToDelete.value);
                    break;
                  }
                }
              }
              
              if (attempt < 2) {
                console.log(`사용자 활성화 재시도 ${attempt + 1}/2...`);
                await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 대기 후 재시도
              }
            }
            
            if (!activated) {
              console.error('사용자 활성화 최종 실패:', ruleToDelete.value);
              // 마지막 시도: 모든 사용자 조회해서 해당 사용자 찾아서 활성화
              try {
                const allUsersResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                    command: `get users --realm master`
                  })
                });
                
                if (allUsersResponse.ok) {
                  const allUsersResult = await allUsersResponse.json();
                  const allUsers = JSON.parse(allUsersResult.stdout || '[]');
                  const foundUser = allUsers.find((u: any) => 
                    (u.username === ruleToDelete.value || u.id === ruleToDelete.value || u.email === ruleToDelete.value) && !u.enabled
                  );
                  
                  if (foundUser) {
                    await fetch(API_BASE_URL + '/keycloak/execute', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ 
                        command: `update users/${foundUser.id} --realm master -s enabled=true`
                      })
                    });
                    console.log('사용자 활성화 최종 재시도 완료:', ruleToDelete.value);
                  }
                }
              } catch (error) {
                console.error('사용자 활성화 최종 재시도 실패:', error);
              }
            }
          } else {
            console.error('사용자를 찾을 수 없습니다:', ruleToDelete.value);
            // 사용자를 찾지 못했어도 모든 비활성화된 사용자 중에서 찾아서 활성화 시도
            try {
              const allUsersResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  command: `get users --realm master`
                })
              });
              
              if (allUsersResponse.ok) {
                const allUsersResult = await allUsersResponse.json();
                const allUsers = JSON.parse(allUsersResult.stdout || '[]');
                const foundUser = allUsers.find((u: any) => 
                  (u.username === ruleToDelete.value || u.id === ruleToDelete.value || u.email === ruleToDelete.value) && !u.enabled
                );
                
                if (foundUser) {
                  await fetch(API_BASE_URL + '/keycloak/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                      command: `update users/${foundUser.id} --realm master -s enabled=true`
                    })
                  });
                  console.log('사용자 활성화 완료 (전체 조회 후):', ruleToDelete.value);
                }
              }
            } catch (error) {
              console.error('사용자 활성화 실패:', error);
            }
          }
        } else if (ruleToDelete.type === 'ip') {
          // IP 차단 해제: 사용자 속성에서 차단된 IP 제거
          // 해당 IP가 차단된 모든 사용자 찾기
          const usersResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              command: `get users --realm master`
            })
          });
          
          if (usersResponse.ok) {
            const usersResult = await usersResponse.json();
            const users = JSON.parse(usersResult.stdout || '[]');
            
            for (const user of users) {
              try {
                // 사용자 속성 확인
                if (user.attributes && user.attributes.blockedIp) {
                  const blockedIps = Array.isArray(user.attributes.blockedIp) 
                    ? user.attributes.blockedIp 
                    : [user.attributes.blockedIp];
                  
                  if (blockedIps.includes(ruleToDelete.value)) {
                    // 차단된 IP 제거
                    const updatedIps = blockedIps.filter((ip: string) => ip !== ruleToDelete.value);
                    const updateResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ 
                        command: `update users/${user.id} --realm master -s 'attributes.blockedIp=${JSON.stringify(updatedIps)}'`
                      })
                    });
                    if (updateResponse.ok) {
                      console.log(`사용자 ${user.username}의 IP 차단 해제 완료`);
                    }
                  }
                }
              } catch (error) {
                console.error(`사용자 ${user.username} IP 차단 해제 실패:`, error);
              }
            }
          }
        } else if (ruleToDelete.type === 'resource') {
          // 리소스 차단 해제: 클라이언트 다시 활성화
          const clientIdMatch = ruleToDelete.value.match(/\/clients\/([^\/]+)/);
          if (clientIdMatch) {
            const clientId = clientIdMatch[1];
            try {
              const clientResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  command: `get clients --realm master -q clientId=${clientId}`
                })
              });
              
              if (clientResponse.ok) {
                const clientResult = await clientResponse.json();
                const clients = JSON.parse(clientResult.stdout || '[]');
                if (clients.length > 0) {
                  const client = clients[0];
                  // 클라이언트 활성화
                  const enableResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                      command: `update clients/${client.id} --realm master -s enabled=true`
                    })
                  });
                  if (enableResponse.ok) {
                    console.log('리소스 차단 해제 완료:', ruleToDelete.value);
                  }
                }
              }
            } catch (error) {
              console.error('리소스 차단 해제 실패:', error);
            }
          }
        } else if (ruleToDelete.type === 'action') {
          // 액션 차단 해제: 사용자 속성에서 차단된 액션 제거
          const usersResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              command: `get users --realm master`
            })
          });
          
          if (usersResponse.ok) {
            const usersResult = await usersResponse.json();
            const users = JSON.parse(usersResult.stdout || '[]');
            
            for (const user of users) {
              try {
                // 사용자 속성 확인
                if (user.attributes && user.attributes.blockedAction) {
                  const blockedActions = Array.isArray(user.attributes.blockedAction) 
                    ? user.attributes.blockedAction 
                    : [user.attributes.blockedAction];
                  
                  if (blockedActions.includes(ruleToDelete.value)) {
                    // 차단된 액션 제거
                    const updatedActions = blockedActions.filter((action: string) => action !== ruleToDelete.value);
                    const updateResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ 
                        command: `update users/${user.id} --realm master -s 'attributes.blockedAction=${JSON.stringify(updatedActions)}'`
                      })
                    });
                    if (updateResponse.ok) {
                      console.log(`사용자 ${user.username}의 액션 차단 해제 완료`);
                    }
                  }
                }
              } catch (error) {
                console.error(`사용자 ${user.username} 액션 차단 해제 실패:`, error);
              }
            }
          }
        }
      } catch (error) {
        console.error('Keycloak 차단 정책 제거 실패:', error);
      }
    }
    
    const updatedRules = blockRules.filter(rule => rule.id !== ruleId);
    setBlockRules(updatedRules);
    
    // 차단 규칙 삭제 후 모든 비활성화된 사용자 자동 활성화
    try {
      console.log('모든 비활성화된 사용자 활성화 시도...');
      // Keycloak 인증 재확인 (admin 계정이 비활성화되어 있으면 실패할 수 있음)
      try {
        const loginResponse = await fetch(API_BASE_URL + '/keycloak/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        const loginResult = await loginResponse.json();
        if (loginResult.stderr && loginResult.stderr.includes('Account disabled')) {
          console.warn('admin 계정이 비활성화되어 있어 사용자 활성화를 수행할 수 없습니다. Keycloak 관리 콘솔에서 직접 활성화하세요.');
          return; // admin 계정이 비활성화되어 있으면 조기 종료
        }
      } catch (error) {
        console.warn('Keycloak 인증 실패:', error);
      }
      
      const usersResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          command: `get users --realm master`
        })
      });
      
      if (usersResponse.ok) {
        const usersResult = await usersResponse.json();
        const users = JSON.parse(usersResult.stdout || '[]');
        
        let activatedCount = 0;
        for (const user of users) {
          try {
            // 사용자 상세 정보 확인
            const userDetailResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                command: `get users/${user.id} --realm master`
              })
            });
            
            if (userDetailResponse.ok) {
              const userDetailResult = await userDetailResponse.json();
              const userDetail = JSON.parse(userDetailResult.stdout || '{}');
              
              if (!userDetail.enabled) {
                // 사용자 활성화 (최대 2번 재시도)
                let activated = false;
                for (let attempt = 0; attempt < 2; attempt++) {
                  const enableResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                      command: `update users/${user.id} --realm master -s enabled=true`
                    })
                  });
                  
                  if (enableResponse.ok) {
                    await new Promise(resolve => setTimeout(resolve, 300));
                    // 확인
                    const verifyResponse = await fetch(API_BASE_URL + '/keycloak/execute', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ 
                        command: `get users/${user.id} --realm master`
                      })
                    });
                    
                    if (verifyResponse.ok) {
                      const verifyResult = await verifyResponse.json();
                      const verifyDetail = JSON.parse(verifyResult.stdout || '{}');
                      if (verifyDetail.enabled) {
                        activated = true;
                        activatedCount++;
                        console.log(`사용자 활성화: ${user.username || user.id}`);
                        break;
                      }
                    }
                  }
                  
                  if (attempt < 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                  }
                }
                
                if (!activated) {
                  console.warn(`사용자 활성화 실패: ${user.username || user.id}`);
                }
              }
            }
          } catch (error) {
            console.error(`사용자 활성화 실패 (${user.username}):`, error);
          }
        }
        
        if (activatedCount > 0) {
          console.log(`총 ${activatedCount}명의 사용자가 활성화되었습니다.`);
        } else {
          console.log('활성화할 사용자가 없습니다.');
        }
      }
    } catch (error) {
      console.error('사용자 활성화 실패:', error);
    }
    
    // 삭제된 규칙과 관련된 로그의 상태 업데이트
    setAccessLogs(prev => prev.map(log => {
      // 삭제된 규칙이 이 로그를 차단했는지 확인
      const wasBlockedByDeletedRule = ruleToDelete && (() => {
        if (!ruleToDelete.enabled) return false;
        
        // conditions가 있으면 모든 조건을 만족해야 차단
        if (ruleToDelete.conditions) {
          const conditions = ruleToDelete.conditions;
          let matches = true;
          
          if (conditions.user && log.user !== conditions.user) matches = false;
          if (conditions.ip && log.sourceIp !== conditions.ip) matches = false;
          if (conditions.resource && log.resource !== conditions.resource && !log.resource.startsWith(conditions.resource)) matches = false;
          if (conditions.action && log.action !== conditions.action) matches = false;
          
          return matches;
        }
        
        // 호환성을 위해 기존 방식도 지원
        switch (ruleToDelete.type) {
          case 'user':
            return log.user === ruleToDelete.value;
          case 'ip':
            return log.sourceIp === ruleToDelete.value;
          case 'resource':
            return log.resource === ruleToDelete.value || log.resource.startsWith(ruleToDelete.value);
          case 'action':
            return log.action === ruleToDelete.value;
          default:
            return false;
        }
      })();
      
      // 삭제된 규칙에 의해 차단되었고, 다른 활성 규칙에 의해 차단되지 않으면 상태를 원래대로 복원
      if (wasBlockedByDeletedRule && log.status === 'blocked') {
        // 다른 활성 차단 규칙 확인
        const stillBlocked = updatedRules.some(rule => {
          if (!rule.enabled) return false;
          
          // conditions가 있으면 모든 조건을 만족해야 차단
          if (rule.conditions) {
            const conditions = rule.conditions;
            let matches = true;
            
            if (conditions.user && log.user !== conditions.user) matches = false;
            if (conditions.ip && log.sourceIp !== conditions.ip) matches = false;
            if (conditions.resource && log.resource !== conditions.resource && !log.resource.startsWith(conditions.resource)) matches = false;
            if (conditions.action && log.action !== conditions.action) matches = false;
            
            return matches;
          }
          
          // 호환성을 위해 기존 방식도 지원
          switch (rule.type) {
            case 'user':
              return log.user === rule.value;
            case 'ip':
              return log.sourceIp === rule.value;
            case 'resource':
              return log.resource === rule.value || log.resource.startsWith(rule.value);
            case 'action':
              return log.action === rule.value;
            default:
              return false;
          }
        });
        
        // 다른 규칙에 의해 차단되지 않으면 원래 상태로 복원 (성공으로)
        if (!stillBlocked) {
          return { ...log, status: 'success' as const };
        }
      }
      
      return log;
    }));
    
    // 백엔드에서 삭제
    try {
      const response = await fetch(`/block-rules/${ruleId}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        console.log('차단 규칙 삭제 완료');
      }
    } catch (error) {
      console.error('차단 규칙 삭제 실패:', error);
    }
  };

  // 모든 접근 로그 삭제
  const clearAllAccessLogs = () => {
    if (window.confirm('모든 접근 로그를 삭제하시겠습니까?')) {
      setAccessLogs([]);
      console.log('모든 접근 로그가 삭제되었습니다.');
    }
  };

  // 로그 필터링
  const getFilteredLogs = () => {
    if (logFilter === 'all') return accessLogs;
    return accessLogs.filter(log => log.status === logFilter);
  };

  // 터미널 메시지 추가
  const addTerminalMessage = (type: 'command' | 'output' | 'error', content: string) => {
    const message: TerminalMessage = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      content,
      timestamp: new Date()
    };
    setTerminalMessages(prev => [...prev, message]);
  };

  // 터미널 스크롤
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalMessages]);

  // 로그 스크롤 - 새 로그 추가 시 스크롤 위치 유지
  useEffect(() => {
    if (logsRef.current) {
      const currentScrollTop = logsRef.current.scrollTop;
      
      // 사용자가 스크롤을 움직였는지 확인 (이전 위치와 다르면)
      if (Math.abs(currentScrollTop - previousScrollTopRef.current) > 5) {
        // 사용자가 스크롤을 움직였고 맨 위가 아니면 스크롤 위치 유지
        if (currentScrollTop > 10) {
          shouldMaintainScrollRef.current = true;
        }
      }
      
      // 스크롤 위치를 유지해야 하는 경우
      if (shouldMaintainScrollRef.current && previousScrollTopRef.current > 10) {
        // 이전 스크롤 위치로 복원
        requestAnimationFrame(() => {
          if (logsRef.current) {
            logsRef.current.scrollTop = previousScrollTopRef.current;
          }
        });
      } else {
        // 스크롤 유지하지 않으면 현재 위치 저장
        previousScrollTopRef.current = currentScrollTop;
      }
    }
  }, [accessLogs]);
  
  // 스크롤 이벤트 리스너 - 사용자가 스크롤할 때 위치 저장
  useEffect(() => {
    const handleScroll = () => {
      if (logsRef.current) {
        previousScrollTopRef.current = logsRef.current.scrollTop;
        // 사용자가 스크롤하면 유지 모드 활성화
        if (logsRef.current.scrollTop > 10) {
          shouldMaintainScrollRef.current = true;
        } else {
          shouldMaintainScrollRef.current = false;
        }
      }
    };
    
    const logsElement = logsRef.current;
    if (logsElement) {
      logsElement.addEventListener('scroll', handleScroll);
      return () => logsElement.removeEventListener('scroll', handleScroll);
    }
  }, []);

  // Keycloak 쉘 연결
  const connectToKeycloakShell = async () => {
    if (isTerminalConnected) {
      addTerminalMessage('output', 'Keycloak 쉘이 이미 연결되어 있습니다.');
      return;
    }

    setLoading(true);
    addTerminalMessage('command', 'docker exec -it keycloak bash');

    try {
      const backendConnected = await checkBackendConnection();
      if (!backendConnected) {
        addTerminalMessage('error', '백엔드 서버에 연결할 수 없습니다');
        return;
      }

      setIsTerminalConnected(true);
      setSessionId(Date.now().toString());
      addTerminalMessage('output', 'Keycloak 컨테이너에 연결되었습니다.');
      addTerminalMessage('output', 'root@keycloak:/opt/keycloak# ');
      
      // 자동 로그인 실행
      setTimeout(() => {
        executeKeycloakLogin();
      }, 1000);

    } catch (error: any) {
      console.error('Keycloak 쉘 연결 실패:', error);
      addTerminalMessage('error', `연결 실패: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Keycloak 자동 로그인
  const executeKeycloakLogin = async () => {
    const loginCommand = '/opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user admin --password admin';
    
    addTerminalMessage('command', loginCommand);
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(API_BASE_URL + '/system/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: `docker exec -i keycloak ${loginCommand}` }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const result = await response.json();
        addTerminalMessage('output', result.stdout || '로그인 성공');
        if (result.stderr) {
          addTerminalMessage('error', result.stderr);
        }
        addTerminalMessage('output', 'root@keycloak:/opt/keycloak# ');
      } else {
        const result = await response.json().catch(() => ({ error: '응답 파싱 실패' }));
        addTerminalMessage('error', `로그인 실패: ${result.error || '알 수 없는 오류'}`);
      }
    } catch (error: any) {
      addTerminalMessage('error', `로그인 오류: ${error.message}`);
    }
  };

  // 명령어 실행
  const executeCommand = async () => {
    if (!commandInput.trim()) return;
    if (!isTerminalConnected) {
      addTerminalMessage('error', '먼저 Keycloak 쉘에 연결하세요.');
      return;
    }

    const fullCommand = commandInput.startsWith('/opt/keycloak/bin/kcadm.sh') 
      ? commandInput 
      : `/opt/keycloak/bin/kcadm.sh ${commandInput}`;

    addTerminalMessage('command', fullCommand);
    setLoading(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(API_BASE_URL + '/system/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: `docker exec -i keycloak ${fullCommand}` }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const result = await response.json();
        if (result.stdout) {
          addTerminalMessage('output', result.stdout);
        }
        if (result.stderr) {
          addTerminalMessage('error', result.stderr);
        }
        addTerminalMessage('output', 'root@keycloak:/opt/keycloak# ');
      } else {
        const result = await response.json().catch(() => ({ error: '응답 파싱 실패' }));
        addTerminalMessage('error', `명령어 실행 실패: ${result.error || '알 수 없는 오류'}`);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        addTerminalMessage('error', '명령어 실행 시간 초과 (30초)');
      } else {
        addTerminalMessage('error', `네트워크 오류: ${error.message}`);
      }
    } finally {
      setLoading(false);
      setCommandInput('');
    }
  };

  // 터미널 초기화
  const clearTerminal = () => {
    setTerminalMessages([]);
  };

  // 터미널 연결 해제
  const disconnectTerminal = () => {
    setIsTerminalConnected(false);
    setSessionId('');
    addTerminalMessage('output', 'Keycloak 쉘 연결이 해제되었습니다.');
  };

  // 컴포넌트 마운트 시 초기화
  useEffect(() => {
    const initializeData = async () => {
      console.log('신원접근 통제 페이지 초기화 시작...');

      try {
        const backendOk = await checkBackendConnection();

        if (backendOk) {
          await fetchSystemLogs();
          await fetchDockerStatus();
          await fetchAccessLogs(); // 접근 로그 초기 로드
        } else {
          console.log('백엔드 연결 실패로 인해 다른 API 호출 생략');
        }
      } catch (error) {
        console.error('초기화 중 오류:', error);
      }

      console.log('신원접근 통제 페이지 초기화 완료');
    };

    initializeData();

    const interval = setInterval(async () => {
      console.log('자동 업데이트: 백엔드 연결 상태 확인...');
      await checkBackendConnection();
    }, 60000);

    // 실시간 로그 자동 새로고침
    const logInterval = setInterval(() => {
      if (autoRefreshLogs) {
        fetchAccessLogs();
      }
    }, 5000); // 5초마다 새로고침

    return () => {
      clearInterval(interval);
      clearInterval(logInterval);
    };
  }, [autoRefreshLogs]);

  const getConnectionStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'text-green-600';
      case 'disconnected': return 'text-red-600';
      case 'error': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getConnectionStatusText = (status: string) => {
    switch (status) {
      case 'connected': return '연결됨';
      case 'disconnected': return '연결 안됨';
      case 'error': return '오류';
      default: return '확인 중';
    }
  };

  // Keycloak 명령어 예시
  const keycloakCommands = [
    {
      name: '사용자 목록 조회',
      command: 'get users',
      description: '등록된 모든 사용자를 조회합니다'
    },
    {
      name: '렐름 목록 조회',
      command: 'get realms',
      description: '모든 렐름을 조회합니다'
    },
    {
      name: '클라이언트 목록 조회',
      command: 'get clients',
      description: '등록된 클라이언트를 조회합니다'
    },
    {
      name: '역할 목록 조회',
      command: 'get roles',
      description: '모든 역할을 조회합니다'
    },
    {
      name: '그룹 목록 조회',
      command: 'get groups',
      description: '모든 그룹을 조회합니다'
    },
    {
      name: '사용자 생성',
      command: 'create users -s username=newuser -s enabled=true',
      description: '새 사용자를 생성합니다'
    },
    {
      name: '사용자 비밀번호 설정',
      command: 'set-password --username newuser --new-password password123',
      description: '사용자 비밀번호를 설정합니다'
    },
    {
      name: '역할 생성',
      command: 'create roles -s name=new-role -s description="New Role"',
      description: '새 역할을 생성합니다'
    },
    {
      name: '사용자에게 역할 할당',
      command: 'add-roles --uusername newuser --rolename new-role',
      description: '사용자에게 역할을 할당합니다'
    }
  ];

  const handleCommandSelect = (command: string) => {
    setCommandInput(command);
  };

  // 명령어 직접 실행 (토스트 포함)
  const handleExecuteCommandDirect = async (command: string) => {
    if (!isTerminalConnected) {
      addTerminalMessage('error', '먼저 Keycloak 쉘에 연결하세요.');
      return;
    }

    // 토스트 메시지 표시
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);

    const fullCommand = command.startsWith('/opt/keycloak/bin/kcadm.sh') 
      ? command 
      : `/opt/keycloak/bin/kcadm.sh ${command}`;

    addTerminalMessage('command', fullCommand);
    setLoading(true);

    let rawOutput = '';

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(API_BASE_URL + '/system/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: `docker exec -i keycloak ${fullCommand}` }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const result = await response.json();
        if (result.stdout) {
          addTerminalMessage('output', result.stdout);
          rawOutput = result.stdout; // 원본 출력 저장
        } else if (result.stderr) {
          addTerminalMessage('error', result.stderr);
          rawOutput = result.stderr; // 에러 출력 저장
        } else {
          rawOutput = '명령어가 실행되었지만 출력이 없습니다.';
        }
        addTerminalMessage('output', 'root@keycloak:/opt/keycloak# ');
      } else {
        const result = await response.json().catch(() => ({ error: '응답 파싱 실패' }));
        const errorMsg = `명령어 실행 실패: ${result.error || '알 수 없는 오류'}`;
        addTerminalMessage('error', errorMsg);
        rawOutput = errorMsg;
      }
    } catch (error: any) {
      let errorMsg = '';
      if (error.name === 'AbortError') {
        errorMsg = '명령어 실행 시간 초과 (30초)';
      } else {
        errorMsg = `네트워크 오류: ${error.message}`;
      }
      addTerminalMessage('error', errorMsg);
      rawOutput = errorMsg;
    } finally {
      setLoading(false);
      // 결과 저장 - 원본 출력을 저장 (파싱을 위해)
      setCommandResults(prev => ({ ...prev, [command]: rawOutput }));
    }
  };

  // 결과 파싱 (Keycloak 명령어 결과를 구조화)
  const parseKeycloakResult = (rawResult: string, command: string): string => {
    if (!rawResult || rawResult.includes('아직 실행된')) {
      return rawResult;
    }

    // 원본 결과에서 불필요한 프롬프트 제거
    const cleanRawResult = rawResult
      .replace(/root@keycloak[^#]*#\s*/g, '')
      .replace(/명령어:\s*[^\n]+\n\n/g, '')
      .replace(/출력:\s*/g, '')
      .trim();

    // 비밀번호 설정이나 역할 할당 같은 명령어는 출력이 없으면 성공으로 간주
    if (command.includes('set-password') || command.includes('add-roles')) {
      if (!cleanRawResult || cleanRawResult.trim() === '' || 
          cleanRawResult === '명령어가 실행되었지만 출력이 없습니다.') {
        if (command.includes('set-password')) {
          return '사용자 비밀번호가 성공적으로 설정되었습니다.';
        } else if (command.includes('add-roles')) {
          return '역할이 성공적으로 할당되었습니다.';
        }
        return '명령어가 성공적으로 실행되었습니다.';
      }
    }

    try {
      // JSON 형식인 경우 파싱 시도
      const jsonMatch = rawResult.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed)) {
            return `총 ${parsed.length}개 항목\n\n${parsed.map((item: any, idx: number) => {
              if (typeof item === 'string') return `${idx + 1}. ${item}`;
              return `${idx + 1}. ${JSON.stringify(item, null, 2)}`;
            }).join('\n\n')}`;
          } else if (typeof parsed === 'object') {
            return Object.entries(parsed).map(([key, value]) => {
              if (typeof value === 'object') {
                return `${key}:\n${JSON.stringify(value, null, 2)}`;
              }
              return `${key}: ${value}`;
            }).join('\n\n');
          }
        } catch (e) {
          // JSON 파싱 실패 시 원본 반환
        }
      }

      // 성공 메시지 추출 (다양한 패턴)
      const successPatterns = [
        /Created|created|생성됨/i,
        /Updated|updated|업데이트됨/i,
        /Deleted|deleted|삭제됨/i,
        /Password.*set|비밀번호.*설정/i,
        /Role.*added|역할.*할당/i,
        /assigned|할당됨/i,
        /success|성공/i
      ];
      
      for (const pattern of successPatterns) {
        if (pattern.test(rawResult)) {
          if (command.includes('set-password')) {
            return '사용자 비밀번호가 성공적으로 설정되었습니다.';
          } else if (command.includes('add-roles')) {
            return '역할이 성공적으로 할당되었습니다.';
          } else if (command.includes('create')) {
            return '항목이 성공적으로 생성되었습니다.';
          } else if (command.includes('update')) {
            return '정보가 성공적으로 업데이트되었습니다.';
          } else if (command.includes('delete')) {
            return '항목이 성공적으로 삭제되었습니다.';
          }
          return '명령어가 성공적으로 실행되었습니다.';
        }
      }

      // 에러 메시지 추출
      if (rawResult.includes('error') || rawResult.includes('Error') || 
          rawResult.includes('실패') || rawResult.includes('Failed') ||
          rawResult.includes('not found') || rawResult.includes('존재하지 않음') ||
          rawResult.includes('already exists') || rawResult.includes('이미 존재')) {
        const errorMatch = rawResult.match(/(error|Error|실패|Failed|not found|존재하지 않음|already exists|이미 존재)[:\s]+([^\n]+)/i);
        if (errorMatch && errorMatch[2]) {
          return `오류: ${errorMatch[2].trim()}`;
        }
        // 에러 키워드만 있는 경우
        if (rawResult.includes('not found') || rawResult.includes('존재하지 않음')) {
          return '오류: 요청한 항목을 찾을 수 없습니다.';
        }
        if (rawResult.includes('already exists') || rawResult.includes('이미 존재')) {
          return '오류: 이미 존재하는 항목입니다.';
        }
        return '명령어 실행 중 오류가 발생했습니다.';
      }

      // 파싱 실패 시 원본 반환 (정리된 형태)
      return cleanRawResult || rawResult;
    } catch (e) {
      // 예외 발생 시 원본 반환
      return cleanRawResult || rawResult;
    }
  };

  // 결과 보기
  const handleShowResult = (command: string) => {
    const rawResult = commandResults[command];
    if (!rawResult || rawResult.trim() === '') {
      setSelectedCommandResult('아직 실행된 명령어가 없습니다.');
      setResultType('text');
      setParsedKeycloakData(null);
      setShowResultModal(true);
      return;
    }
    
    // 명령어 실행 실패 에러인지 확인
    if (rawResult.includes('ERROR:') || rawResult.includes('Unable to run command') || 
        rawResult.includes('명령어 실행 실패') || rawResult.includes('네트워크 오류')) {
      setSelectedCommandResult(`명령어 실행 실패\n\n${rawResult}`);
      setResultType('text');
      setParsedKeycloakData(null);
      setShowResultModal(true);
      return;
    }
    
    // JSON 형식인 경우 파싱
    const jsonMatch = rawResult.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setParsedKeycloakData(parsed);
          setResultType('array');
          setSelectedCommandResult('');
          setShowResultModal(true);
          return;
        } else if (typeof parsed === 'object' && parsed !== null && Object.keys(parsed).length > 0) {
          setParsedKeycloakData(parsed);
          setResultType('object');
          setSelectedCommandResult('');
          setShowResultModal(true);
          return;
        }
      } catch (e) {
        console.error('JSON 파싱 실패:', e);
        // JSON 파싱 실패 시 원본 텍스트로 표시
      }
    }
    
    // JSON이 아니거나 파싱 실패한 경우 텍스트로 표시
    const parsedResult = parseKeycloakResult(rawResult, command);
    if (!parsedResult || parsedResult.trim() === '') {
      // 파싱 결과가 비어있으면 원본 표시
      setSelectedCommandResult(rawResult);
    } else {
      setSelectedCommandResult(parsedResult);
    }
    setResultType('text');
    setParsedKeycloakData(null);
    setShowResultModal(true);
  };

  const openKeycloakConsole = () => {
    window.open('http://localhost:8080', '_blank');
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">신원접근 통제</h1>
          <p className="text-gray-600 mt-1">Keycloak을 통한 신원 및 접근 관리</p>
          <p className="text-sm text-[#10113C] mt-1">
            컨테이너: keycloak (localhost:8080)
          </p>
          <p className="text-xs text-[#10113C] mt-1">신원접근 통제 활성화</p>
          
          {/* 연결 상태 표시 */}
          <div className="flex items-center space-x-4 mt-2 text-sm">
            <div className="flex items-center space-x-1">
              <span className="text-gray-600">API:</span>
              <span className={getConnectionStatusColor(connectionStatus.backend)}>
                {getConnectionStatusText(connectionStatus.backend)}
              </span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="text-gray-600">Docker:</span>
              <span className={getConnectionStatusColor(connectionStatus.docker)}>
                {getConnectionStatusText(connectionStatus.docker)}
              </span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="text-gray-600">Keycloak:</span>
              <span className={getConnectionStatusColor(connectionStatus.keycloak)}>
                {getConnectionStatusText(connectionStatus.keycloak)}
              </span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="text-gray-600">터미널:</span>
              <span className={isTerminalConnected ? 'text-green-600' : 'text-gray-600'}>
                {isTerminalConnected ? '연결됨' : '연결 안됨'}
              </span>
            </div>
          </div>
          
          {lastUpdate && (
            <p className="text-xs text-gray-500 mt-1">마지막 업데이트: {lastUpdate}</p>
          )}
          {error && (
            <div className="flex items-center space-x-2 mt-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => setShowLogs(!showLogs)}
            style={{ backgroundColor: '#10113C' }}
            className="flex items-center space-x-2 text-white px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
          >
            <Settings className="w-4 h-4" />
            <span>{showLogs ? '로그 숨기기' : '상세 로그'}</span>
          </button>
          <button
            onClick={fetchDockerStatus}
            disabled={refreshing}
            style={{ backgroundColor: refreshing ? undefined : '#0d4f2c' }}
            className="flex items-center space-x-2 text-white px-4 py-2 rounded-lg hover:opacity-90 disabled:bg-gray-400 transition-opacity"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? '새로고침 중...' : '새로고침'}</span>
          </button>
          <button
            onClick={openKeycloakConsole}
            style={{ backgroundColor: '#10113C' }}
            className="flex items-center space-x-2 text-white px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Keycloak 콘솔</span>
          </button>
        </div>
      </div>

      {/* 상세 로그 패널 */}
      {showLogs && (
        <div className="bg-gray-900 text-green-600 rounded-xl p-4">
          <h3 className="text-lg font-semibold mb-3 text-white">시스템 로그 (최근 20개)</h3>
          <div className="max-h-64 overflow-y-auto space-y-1 font-mono text-sm">
            {systemLogs.slice(0, 20).map((log, index) => (
              <div key={index} className={`${
                log.level === 'error' ? 'text-red-400' :
                log.level === 'info' ? 'text-green-600' : 'text-yellow-400'
              }`}>
                <span className="text-gray-400">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                <span className={`ml-2 ${
                  log.level === 'error' ? 'text-red-300' :
                  log.level === 'info' ? 'text-blue-300' : 'text-yellow-300'
                }`}>[{log.level.toUpperCase()}]</span>
                <span className="ml-2">{log.message}</span>
                {log.error && (
                  <div className="ml-8 text-red-300 text-xs">
                    {JSON.stringify(JSON.parse(log.error), null, 2)}
                  </div>
                )}
              </div>
            ))}
            {systemLogs.length === 0 && (
              <div className="text-gray-500 text-center py-4">
                시스템 로그가 없거나 로드할 수 없습니다.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Keycloak 컨테이너 상태 */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
          <Activity className="w-5 h-5 mr-2 text-blue-500" />
          Keycloak 컨테이너 상태
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {dockerContainers.map((container, index) => (
            <div key={index} className="border rounded-lg p-4 bg-gray-50">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-3">
                  <div className={`w-3 h-3 rounded-full ${
                    container.status === 'online' || container.status === 'running' || container.status?.includes('Up') ? 'bg-green-600' : 'bg-red-500'
                  }`}></div>
                  <div>
                    <h3 className="font-medium text-gray-900 flex items-center">
                      {container.name}
                      <span className="ml-2 px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">IAM</span>
                    </h3>
                    <p className="text-xs text-gray-500">{container.image}</p>
                  </div>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  container.status === 'online' || container.status === 'running' || container.status?.includes('Up') ?
                  'bg-green-50 text-green-600' :
                  'bg-red-100 text-red-700'
                }`}>
                  {container.status}
                </span>
              </div>
              
              {/* 실시간 리소스 사용량 */}
              <div className="mb-3 p-3 bg-[#10113C]/10 rounded-lg">
                <h4 className="text-sm font-medium text-[#10113C] mb-2 flex items-center">
                  <Cpu className="w-4 h-4 mr-1 text-[#10113C]" />
                  실시간 리소스 사용량
                </h4>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">CPU:</span>
                    <span className={`font-medium ${
                      container.stats?.cpu !== 'N/A' ? 'text-[#10113C]' : 'text-gray-500'
                    }`}>
                      {container.stats?.cpu || 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">메모리:</span>
                    <span className={`font-medium ${
                      container.stats?.memory !== 'N/A' ? 'text-[#10113C]' : 'text-gray-500'
                    }`}>
                      {container.stats?.memory || 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">네트워크 I/O:</span>
                    <span className={`font-medium ${
                      container.stats?.netIO !== 'N/A' ? 'text-green-600' : 'text-gray-500'
                    }`}>
                      {container.stats?.netIO || 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">디스크 I/O:</span>
                    <span className={`font-medium ${
                      container.stats?.blockIO !== 'N/A' ? 'text-green-600' : 'text-gray-500'
                    }`}>
                      {container.stats?.blockIO || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* 포트 정보 */}
              <div className="mb-3">
                <h4 className="text-sm font-medium text-gray-700 mb-2">포트 매핑</h4>
                <div className="space-y-1">
                  {container.portMappings && container.portMappings.length > 0 ? (
                    container.portMappings.map((port: any, portIndex: number) => (
                      <div key={portIndex} className="flex items-center justify-between text-xs">
                        <span className="text-gray-600">
                          {port.host}:{port.container} ({port.protocol})
                        </span>
                        <span className={`px-2 py-1 rounded ${
                          port.connectable ? 'bg-green-50 text-green-600' : 'bg-red-100 text-red-700'
                        }`}>
                          {port.connectable ? '연결 가능' : '연결 불가'}
                        </span>
                      </div>
                    ))
                  ) : (
                    <span className="text-xs text-gray-500">포트 매핑 없음</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        {dockerContainers.length === 0 && (
          <div className="text-center py-4 text-gray-500">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            Keycloak 컨테이너 정보를 불러오는 중...
          </div>
        )}
      </div>

      {/* 인터랙티브 터미널 */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center">
            <Terminal className="w-5 h-5 mr-2 text-blue-500" />
            Keycloak 인터랙티브 터미널
          </h2>
          <div className="flex space-x-2">
            {!isTerminalConnected ? (
              <button
                onClick={connectToKeycloakShell}
                disabled={loading}
                style={{ backgroundColor: loading ? undefined : '#10113C' }}
                className="flex items-center space-x-2 text-white px-4 py-2 rounded-lg hover:opacity-90 disabled:bg-gray-400 transition-opacity"
              >
                <LogIn className="w-4 h-4" />
                <span>{loading ? '연결 중...' : '쉘 연결'}</span>
              </button>
            ) : (
              <>
                <button
                  onClick={clearTerminal}
                  style={{ backgroundColor: '#10113C' }}
                  className="flex items-center space-x-2 text-white px-3 py-2 rounded-lg hover:opacity-90 transition-opacity"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>지우기</span>
                </button>
                <button
                  onClick={disconnectTerminal}
                  className="flex items-center space-x-2 bg-red-600 text-white px-3 py-2 rounded-lg hover:bg-red-700 transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                  <span>연결 해제</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* 터미널 화면 */}
        <div 
          ref={terminalRef}
          className="bg-gray-900 text-[#10113C] rounded-lg p-4 h-80 overflow-y-auto font-mono text-sm"
        >
          {terminalMessages.length === 0 ? (
            <div className="text-gray-500 text-center py-8">
              Keycloak 쉘에 연결하여 시작하세요.
            </div>
          ) : (
            terminalMessages.map((message) => (
              <div key={message.id} className={`mb-1 ${
                message.type === 'command' ? 'text-yellow-400' :
                message.type === 'error' ? 'text-red-400' : 'text-[#10113C]'
              }`}>
                {message.type === 'command' && <span className="text-blue-400">$ </span>}
                <span className="whitespace-pre-wrap">{message.content}</span>
              </div>
            ))
          )}
        </div>

        {/* 명령어 입력 */}
        {isTerminalConnected && (
          <div className="mt-4">
            <div className="flex space-x-2">
              <div className="flex-1 flex items-center bg-gray-100 rounded-lg px-3 py-2">
                <span className="text-gray-600 font-mono text-sm mr-2">/opt/keycloak/bin/kcadm.sh</span>
                <input
                  type="text"
                  value={commandInput}
                  onChange={(e) => setCommandInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && executeCommand()}
                  className="flex-1 bg-transparent border-none outline-none font-mono text-sm"
                  placeholder="명령어를 입력하세요..."
                  disabled={loading}
                />
              </div>
              <button
                onClick={executeCommand}
                disabled={!commandInput.trim() || loading}
                style={{ backgroundColor: (!commandInput.trim() || loading) ? undefined : '#10113C' }}
                className="flex items-center space-x-2 text-white px-4 py-2 rounded-lg hover:opacity-90 disabled:bg-gray-300 disabled:cursor-not-allowed transition-opacity"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  <Play className="w-4 h-4" />
                )}
                <span>{loading ? '실행 중...' : '실행'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 실시간 접근 로그 모니터링 */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center">
            <Eye className="w-5 h-5 mr-2 text-blue-600" />
            실시간 접근 로그
            {accessLogs.length > 0 && (
              <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm font-medium">
                {accessLogs.length}개
              </span>
            )}
          </h2>
          <div className="flex items-center space-x-2">
            <button
              onClick={clearAllAccessLogs}
              className="flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors bg-red-100 text-red-700 hover:bg-red-200"
              title="모든 접근 로그 삭제"
            >
              <XCircle className="w-4 h-4" />
              <span>로그 삭제</span>
            </button>
            <button
              onClick={() => setAutoRefreshLogs(!autoRefreshLogs)}
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors ${
                autoRefreshLogs ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${autoRefreshLogs ? 'animate-spin' : ''}`} />
              <span>{autoRefreshLogs ? '자동 새로고침 ON' : '자동 새로고침 OFF'}</span>
            </button>
            <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setLogFilter('all')}
                className={`px-3 py-1 rounded text-sm ${
                  logFilter === 'all' ? 'bg-white shadow-sm' : 'text-gray-600'
                }`}
              >
                전체
              </button>
              <button
                onClick={() => setLogFilter('success')}
                className={`px-3 py-1 rounded text-sm ${
                  logFilter === 'success' ? 'bg-white shadow-sm text-green-600' : 'text-gray-600'
                }`}
              >
                성공
              </button>
              <button
                onClick={() => setLogFilter('failed')}
                className={`px-3 py-1 rounded text-sm ${
                  logFilter === 'failed' ? 'bg-white shadow-sm text-red-600' : 'text-gray-600'
                }`}
              >
                실패
              </button>
              <button
                onClick={() => setLogFilter('blocked')}
                className={`px-3 py-1 rounded text-sm ${
                  logFilter === 'blocked' ? 'bg-white shadow-sm text-orange-600' : 'text-gray-600'
                }`}
              >
                차단
              </button>
            </div>
          </div>
        </div>

        {/* 로그 테이블 */}
        <div ref={logsRef} className="overflow-x-auto max-h-96 overflow-y-auto">
          {getFilteredLogs().length === 0 ? (
            <div className="text-center py-12">
              <Eye className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">접근 로그가 없습니다</h3>
              <p className="text-sm text-gray-600 mb-4">
                실제 접근 로그를 보려면 Keycloak 이벤트 로깅을 활성화해야 합니다.
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left max-w-2xl mx-auto">
                <p className="text-sm font-medium text-blue-900 mb-2">1단계: Keycloak 이벤트 로깅 활성화</p>
                <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside mb-4">
                  <li>Keycloak Admin Console (<a href="http://localhost:8080" target="_blank" rel="noopener noreferrer" className="underline font-medium">http://localhost:8080</a>) 접속</li>
                  <li>관리자 계정으로 로그인</li>
                  <li>좌측 메뉴에서 <strong>Realm Settings</strong> 클릭</li>
                  <li><strong>Events</strong> 탭 선택</li>
                  <li><strong>"Save Events"</strong> 토글을 ON으로 변경</li>
                  <li>이벤트 타입 선택: <strong>LOGIN</strong>, <strong>LOGOUT</strong>, <strong>LOGIN_ERROR</strong> 등 체크</li>
                  <li><strong>Save</strong> 버튼 클릭</li>
                </ol>
                
                <p className="text-xs text-blue-700 mt-3">
                  이벤트 생성 후 위의 <strong>"자동 새로고침"</strong> 버튼이 켜져 있으면 자동으로 로그가 표시됩니다.

                </p>
              </div>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">시간</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">사용자</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">액션</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">리소스</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">작업</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {getFilteredLogs().map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => setSelectedLog(log)}
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600">
                      {log.timestamp.toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center">
                        <Users className="w-4 h-4 mr-2 text-gray-400" />
                        <span className="font-medium text-gray-900">{log.user}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{log.sourceIp}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 truncate max-w-xs">
                      {log.resource}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        log.status === 'success' ? 'bg-green-100 text-green-700' :
                        log.status === 'failed' ? 'bg-red-100 text-red-700' :
                        'bg-orange-100 text-orange-700'
                      }`}>
                        {log.status === 'success' ? '성공' : log.status === 'failed' ? '실패' : '차단'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLog(log);
                          setShowBlockModal(true);
                        }}
                        className="flex items-center space-x-1 text-red-600 hover:text-red-700"
                      >
                        <Ban className="w-4 h-4" />
                        <span className="text-xs">차단</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 로그 상세 모달 */}
      {selectedLog && !showBlockModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setSelectedLog(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-2xl w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-gray-900">접근 로그 상세</h3>
              <button onClick={() => setSelectedLog(null)} className="text-gray-400 hover:text-gray-600">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">시간</label>
                  <p className="text-gray-900">{selectedLog.timestamp.toLocaleString()}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">상태</label>
                  <p>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      selectedLog.status === 'success' ? 'bg-green-100 text-green-700' :
                      selectedLog.status === 'failed' ? 'bg-red-100 text-red-700' :
                      'bg-orange-100 text-orange-700'
                    }`}>
                      {selectedLog.status === 'success' ? '성공' : selectedLog.status === 'failed' ? '실패' : '차단'}
                    </span>
                  </p>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-500">사용자</label>
                <p className="text-gray-900">{selectedLog.user}</p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-500">소스 IP</label>
                <p className="text-gray-900">{selectedLog.sourceIp}</p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-500">액션</label>
                <p className="text-gray-900">{selectedLog.action}</p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-500">리소스</label>
                <p className="text-gray-900 break-all">{selectedLog.resource}</p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-500">메서드</label>
                <p className="text-gray-900">{selectedLog.method}</p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-500">User Agent</label>
                <p className="text-gray-900 text-sm">{selectedLog.userAgent}</p>
              </div>
              
              {selectedLog.realm && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Realm</label>
                  <p className="text-gray-900">{selectedLog.realm}</p>
                </div>
              )}
            </div>
            
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                닫기
              </button>
              <button
                onClick={() => setShowBlockModal(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <Ban className="w-4 h-4" />
                <span>차단 규칙 추가</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 차단 규칙 추가 모달 */}
      {showBlockModal && selectedLog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => {
          setShowBlockModal(false);
          setSelectedBlockTypes(new Set());
        }}>
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-gray-900">차단 규칙 추가</h3>
              <button onClick={() => {
                setShowBlockModal(false);
                setSelectedBlockTypes(new Set());
              }} className="text-gray-400 hover:text-gray-600">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <div className="space-y-4">
              <p className="text-sm text-gray-600">차단할 항목을 선택하세요 (여러 개 선택 가능):</p>
              
              <label className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedBlockTypes.has('user')}
                  onChange={(e) => {
                    const newSet = new Set(selectedBlockTypes);
                    if (e.target.checked) {
                      newSet.add('user');
                    } else {
                      newSet.delete('user');
                    }
                    setSelectedBlockTypes(newSet);
                  }}
                  className="mt-1 w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900">사용자 차단</div>
                  <div className="text-sm text-gray-600 mt-1 break-words overflow-wrap-anywhere">사용자: {selectedLog.user}</div>
                </div>
              </label>
              
              <label className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedBlockTypes.has('ip')}
                  onChange={(e) => {
                    const newSet = new Set(selectedBlockTypes);
                    if (e.target.checked) {
                      newSet.add('ip');
                    } else {
                      newSet.delete('ip');
                    }
                    setSelectedBlockTypes(newSet);
                  }}
                  className="mt-1 w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900">IP 주소 차단</div>
                  <div className="text-sm text-gray-600 mt-1 break-words overflow-wrap-anywhere">IP: {selectedLog.sourceIp}</div>
                </div>
              </label>
              
              <label className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedBlockTypes.has('resource')}
                  onChange={(e) => {
                    const newSet = new Set(selectedBlockTypes);
                    if (e.target.checked) {
                      newSet.add('resource');
                    } else {
                      newSet.delete('resource');
                    }
                    setSelectedBlockTypes(newSet);
                  }}
                  className="mt-1 w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900">리소스 차단</div>
                  <div className="text-sm text-gray-600 mt-1 break-words overflow-wrap-anywhere">리소스: {selectedLog.resource}</div>
                </div>
              </label>
              
              <label className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedBlockTypes.has('action')}
                  onChange={(e) => {
                    const newSet = new Set(selectedBlockTypes);
                    if (e.target.checked) {
                      newSet.add('action');
                    } else {
                      newSet.delete('action');
                    }
                    setSelectedBlockTypes(newSet);
                  }}
                  className="mt-1 w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900">액션 차단</div>
                  <div className="text-sm text-gray-600 mt-1 break-words overflow-wrap-anywhere">액션: {selectedLog.action}</div>
                </div>
              </label>
              
              {selectedBlockTypes.size > 0 && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm font-medium text-blue-900 mb-1">선택된 조건:</p>
                  <p className="text-xs text-blue-700">
                    {Array.from(selectedBlockTypes).map(type => {
                      const labels: Record<string, string> = {
                        'user': '사용자',
                        'ip': 'IP',
                        'resource': '리소스',
                        'action': '액션'
                      };
                      return labels[type];
                    }).join(' + ')} 조합으로 차단됩니다
                  </p>
                </div>
              )}
            </div>
            
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowBlockModal(false);
                  setSelectedBlockTypes(new Set());
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => {
                  if (selectedBlockTypes.size === 0) {
                    alert('최소 하나 이상의 조건을 선택해주세요.');
                    return;
                  }
                  addBlockRule(selectedLog, selectedBlockTypes, '조합 차단 규칙');
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                차단 규칙 추가
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 차단 규칙 관리 */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center">
            <Shield className="w-5 h-5 mr-2 text-red-600" />
            차단 규칙 ({blockRules.length})
          </h2>
        </div>
        
        {blockRules.length > 0 ? (
          <>
            {selectedRuleIds.size > 0 && (
              <div className="mb-3 flex items-center justify-end space-x-2">
                <button
                  onClick={async () => {
                    // 선택된 규칙 일괄 삭제
                    for (const ruleId of selectedRuleIds) {
                      await deleteBlockRule(ruleId);
                    }
                    setSelectedRuleIds(new Set());
                  }}
                  className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm flex items-center space-x-1"
                >
                  <X className="w-4 h-4" />
                  <span>선택 삭제 ({selectedRuleIds.size})</span>
                </button>
                <button
                  onClick={() => setSelectedRuleIds(new Set())}
                  className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm"
                >
                  선택 해제
                </button>
              </div>
            )}
            
            <div className="mb-3 flex items-center space-x-2">
              <input
                type="checkbox"
                checked={selectedRuleIds.size === blockRules.length && blockRules.length > 0}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedRuleIds(new Set(blockRules.map(r => r.id)));
                  } else {
                    setSelectedRuleIds(new Set());
                  }
                }}
                className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
              />
              <span className="text-sm text-gray-600">전체 선택</span>
              {selectedRuleIds.size > 0 && (
                <span className="text-sm text-gray-500">({selectedRuleIds.size}개 선택됨)</span>
              )}
            </div>
            
            <div className="space-y-3">
              {blockRules.map((rule) => (
                <div key={rule.id} className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={selectedRuleIds.has(rule.id)}
                    onChange={(e) => {
                      const newSet = new Set(selectedRuleIds);
                      if (e.target.checked) {
                        newSet.add(rule.id);
                      } else {
                        newSet.delete(rule.id);
                      }
                      setSelectedRuleIds(newSet);
                    }}
                    className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center flex-wrap gap-2">
                      {rule.conditions ? (
                        // 여러 조건 조합
                        Object.entries(rule.conditions).map(([key, value]) => {
                          if (!value) return null;
                          const labels: Record<string, { label: string; color: string }> = {
                            'user': { label: '사용자', color: 'bg-purple-100 text-purple-700' },
                            'ip': { label: 'IP', color: 'bg-blue-100 text-blue-700' },
                            'resource': { label: '리소스', color: 'bg-green-100 text-green-700' },
                            'action': { label: '액션', color: 'bg-orange-100 text-orange-700' }
                          };
                          const info = labels[key];
                          if (!info) return null;
                          return (
                            <span key={key} className={`px-2 py-1 rounded text-xs font-medium ${info.color}`}>
                              {info.label}: {String(value).length > 30 ? String(value).substring(0, 30) + '...' : value}
                            </span>
                          );
                        })
                      ) : (
                        // 기존 단일 조건 (호환성)
                        <>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            rule.type === 'user' ? 'bg-purple-100 text-purple-700' :
                            rule.type === 'ip' ? 'bg-blue-100 text-blue-700' :
                            rule.type === 'resource' ? 'bg-green-100 text-green-700' :
                            'bg-orange-100 text-orange-700'
                          }`}>
                            {rule.type === 'user' ? '사용자' : rule.type === 'ip' ? 'IP' : rule.type === 'resource' ? '리소스' : '액션'}
                          </span>
                          <span className="font-medium text-gray-900">{rule.value}</span>
                        </>
                      )}
                      {!rule.enabled && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">비활성</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{rule.reason}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      생성: {rule.createdAt.toLocaleString()}
                    </p>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => toggleBlockRule(rule.id)}
                      className={`p-2 rounded-lg transition-colors ${
                        rule.enabled ? 'bg-green-100 text-green-600 hover:bg-green-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                      title={rule.enabled ? '비활성화' : '활성화'}
                    >
                      {rule.enabled ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => deleteBlockRule(rule.id)}
                      className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                      title="삭제"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <Shield className="w-12 h-12 mx-auto mb-3 text-gray-400" />
            <p>등록된 차단 규칙이 없습니다.</p>
          </div>
        )}
      </div>

      {/* 명령어 예시 */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Keycloak 명령어 예시</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {keycloakCommands.map((example, index) => (
            <div
              key={index}
              className="text-left p-4 border rounded-lg hover:bg-gray-50 hover:border-blue-300 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-medium text-gray-900">{example.name}</h3>
                <Copy className="w-4 h-4 text-gray-400" />
              </div>
              <p className="text-sm text-gray-600 mb-3">{example.description}</p>
              <div className="flex items-center space-x-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleExecuteCommandDirect(example.command);
                  }}
                  disabled={!isTerminalConnected || loading}
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
              {resultType === 'array' && Array.isArray(parsedKeycloakData) ? (
                <div className="space-y-4">
                  <div className="text-sm text-gray-600 mb-4">
                    총 {parsedKeycloakData.length}개 항목
                  </div>
                  {parsedKeycloakData.map((item: any, idx: number) => {
                    const itemKey = `item-${idx}`;
                    const criticalFields = ['realm', 'id', 'name', 'enabled', 'displayName', 'username'];
                    const allEntries = Object.entries(item).filter(([_, v]) => v !== null && v !== undefined);
                    const criticalEntries = allEntries.filter(([k]) => criticalFields.includes(k));
                    const otherEntries = allEntries.filter(([k]) => !criticalFields.includes(k));
                    const isItemExpanded = expandedDetails[itemKey] || false;
                    
                    // 중요한 필드가 없으면 처음 3개 필드라도 보여주기
                    const fieldsToShow = criticalEntries.length > 0 ? criticalEntries : allEntries.slice(0, 3).filter(([_, v]) => typeof v !== 'object');
                    const fieldsToHide = criticalEntries.length > 0 ? otherEntries : allEntries.slice(3);
                    
                    return (
                      <div key={idx} className="border rounded-lg p-4 bg-white hover:shadow-md transition-all">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-2">
                              <span className="text-xs font-semibold text-gray-500">항목 #{idx + 1}</span>
                              {item.id && (
                                <span className="text-xs px-2 py-1 rounded bg-blue-100 border border-blue-300 text-blue-700">
                                  ID: {item.id}
                                </span>
                              )}
                              {item.username && (
                                <span className="text-xs px-2 py-1 rounded bg-green-100 border border-green-300 text-green-700">
                                  {item.username}
                                </span>
                              )}
                              {item.name && (
                                <span className="text-xs px-2 py-1 rounded bg-purple-100 border border-purple-300 text-purple-700">
                                  {item.name}
                                </span>
                              )}
                            </div>
                            {item.name && !item.username && (
                              <h4 className="font-semibold text-gray-900 mb-1">{item.name}</h4>
                            )}
                            {item.username && (
                              <h4 className="font-semibold text-gray-900 mb-1">{item.username}</h4>
                            )}
                          </div>
                        </div>
                        
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          {/* 중요한 필드만 먼저 표시 */}
                          <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                            {fieldsToShow.map(([key, value]: [string, any]) => {
                              if (typeof value === 'object' && value !== null) return null;
                              
                              return (
                                <div key={key} className="bg-blue-50 -mx-2 px-2 py-1 rounded">
                                  <span className="text-gray-700 font-medium">{key}:</span>
                                  <span className="ml-2 text-gray-900">
                                    {typeof value === 'boolean' ? (value ? '✓' : '✗') : String(value)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                          
                          {/* 나머지 필드는 접을 수 있게 */}
                          {fieldsToHide.length > 0 && (
                            <div className="border-t border-gray-200 pt-3">
                              <button
                                onClick={() => setExpandedDetails(prev => ({ ...prev, [itemKey]: !isItemExpanded }))}
                                className="flex items-center space-x-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
                              >
                                {isItemExpanded ? (
                                  <>
                                    <ChevronUp className="w-4 h-4" />
                                    <span>상세 정보 숨기기</span>
                                  </>
                                ) : (
                                  <>
                                    <ChevronDown className="w-4 h-4" />
                                    <span>상세 정보 보기 ({fieldsToHide.length}개 필드)</span>
                                  </>
                                )}
                              </button>
                              
                              {isItemExpanded && (
                                <div className="mt-3 grid grid-cols-2 gap-2 text-sm pl-2 border-l-2 border-gray-200">
                                  {fieldsToHide.map(([key, value]: [string, any]) => {
                                    if (value === null || value === undefined) return null;
                                    
                                    // 객체나 배열인 경우
                                    if (typeof value === 'object' && !Array.isArray(value)) {
                                      const subKey = `${itemKey}-${key}`;
                                      const isSubExpanded = expandedDetails[subKey] || false;
                                      return (
                                        <div key={key} className="col-span-2">
                                          <button
                                            onClick={() => setExpandedDetails(prev => ({ ...prev, [subKey]: !isSubExpanded }))}
                                            className="flex items-center space-x-2 text-sm text-gray-700 hover:text-gray-900"
                                          >
                                            {isSubExpanded ? (
                                              <ChevronUp className="w-3 h-3" />
                                            ) : (
                                              <ChevronDown className="w-3 h-3" />
                                            )}
                                            <span className="font-medium">{key}:</span>
                                            <span className="text-xs text-gray-500">(객체)</span>
                                          </button>
                                          {isSubExpanded && (
                                            <div className="ml-6 mt-2 space-y-1">
                                              {Object.entries(value).map(([subKey, subValue]: [string, any]) => (
                                                <div key={subKey} className="text-sm">
                                                  <span className="text-gray-600">{subKey}:</span>
                                                  <span className="ml-2 text-gray-900">
                                                    {typeof subValue === 'boolean' ? (subValue ? '✓' : '✗') : 
                                                     typeof subValue === 'object' ? JSON.stringify(subValue) : 
                                                     String(subValue)}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    }
                                    
                                    if (Array.isArray(value)) {
                                      const subKey = `${itemKey}-${key}`;
                                      const isSubExpanded = expandedDetails[subKey] || false;
                                      return (
                                        <div key={key} className="col-span-2">
                                          <button
                                            onClick={() => setExpandedDetails(prev => ({ ...prev, [subKey]: !isSubExpanded }))}
                                            className="flex items-center space-x-2 text-sm text-gray-700 hover:text-gray-900"
                                          >
                                            {isSubExpanded ? (
                                              <ChevronUp className="w-3 h-3" />
                                            ) : (
                                              <ChevronDown className="w-3 h-3" />
                                            )}
                                            <span className="font-medium">{key}:</span>
                                            <span className="text-xs text-gray-500">({value.length}개)</span>
                                          </button>
                                          {isSubExpanded && (
                                            <div className="ml-6 mt-2 space-y-1">
                                              {value.map((item: any, subIdx: number) => (
                                                <div key={subIdx} className="text-sm text-gray-700">
                                                  • {typeof item === 'object' ? JSON.stringify(item) : String(item)}
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    }
                                    
                                    return (
                                      <div key={key}>
                                        <span className="text-gray-600">{key}:</span>
                                        <span className="ml-2 text-gray-900">
                                          {typeof value === 'boolean' ? (value ? '✓' : '✗') : String(value)}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : resultType === 'object' && parsedKeycloakData ? (
                <div className="space-y-4">
                  <div className="border rounded-lg p-4 bg-white">
                    <div className="space-y-3">
                      {(() => {
                        // 진짜 중요한 필드만 정의 (최소한의 핵심 정보)
                        const criticalFields = ['realm', 'id', 'name', 'enabled', 'displayName'];
                        const allEntries = Object.entries(parsedKeycloakData).filter(([_, v]) => v !== null && v !== undefined);
                        const criticalEntries = allEntries.filter(([k]) => criticalFields.includes(k));
                        const otherEntries = allEntries.filter(([k]) => !criticalFields.includes(k));
                        const isAllExpanded = expandedDetails['__all__'] || false;
                        
                        // 중요한 필드가 없으면 처음 5개 필드라도 보여주기
                        const fieldsToShow = criticalEntries.length > 0 ? criticalEntries : allEntries.slice(0, 5);
                        const fieldsToHide = criticalEntries.length > 0 ? otherEntries : allEntries.slice(5);
                        
                        return (
                          <>
                            {/* 중요한 필드만 먼저 표시 */}
                            {fieldsToShow.map(([key, value]: [string, any]) => {
                              // 객체나 배열이면 건너뛰기 (중요 필드로 표시하지 않음)
                              if (typeof value === 'object' && value !== null) {
                                return null;
                              }
                              
                              return (
                                <div key={key} className="flex items-start border-t border-gray-200 pt-3 first:pt-0 first:border-t-0 bg-blue-50 -mx-4 px-4 py-2 rounded">
                                  <span className="text-sm font-semibold text-gray-900 min-w-[150px]">{key}:</span>
                                  <span className="text-sm text-gray-900 flex-1">
                                    {typeof value === 'boolean' ? (
                                      <span className={`px-2 py-1 rounded ${value ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        {value ? '✓ 활성화' : '✗ 비활성화'}
                                      </span>
                                    ) : (
                                      String(value)
                                    )}
                                  </span>
                                </div>
                              );
                            })}
                            
                            {/* 나머지 모든 필드는 접을 수 있게 */}
                            {fieldsToHide.length > 0 && (
                              <div className="border-t border-gray-200 pt-3">
                                <button
                                  onClick={() => setExpandedDetails(prev => ({ ...prev, '__all__': !isAllExpanded }))}
                                  className="flex items-center space-x-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
                                >
                                  {isAllExpanded ? (
                                    <>
                                      <ChevronUp className="w-4 h-4" />
                                      <span>상세 정보 숨기기</span>
                                    </>
                                  ) : (
                                    <>
                                      <ChevronDown className="w-4 h-4" />
                                      <span>상세 정보 보기 ({fieldsToHide.length}개 필드)</span>
                                    </>
                                  )}
                                </button>
                                
                                {isAllExpanded && (
                                  <div className="mt-3 space-y-3 pl-2 border-l-2 border-gray-200">
                                    {fieldsToHide.map(([key, value]: [string, any]) => {
                                      const isExpanded = expandedDetails[key] || false;
                                      
                                      // 객체인 경우
                                      if (typeof value === 'object' && !Array.isArray(value)) {
                                        return (
                                          <div key={key} className="border-t border-gray-100 pt-2 first:pt-0 first:border-t-0">
                                            <button
                                              onClick={() => setExpandedDetails(prev => ({ ...prev, [key]: !isExpanded }))}
                                              className="flex items-center space-x-2 text-sm text-gray-700 hover:text-gray-900 mb-1"
                                            >
                                              {isExpanded ? (
                                                <ChevronUp className="w-3 h-3" />
                                              ) : (
                                                <ChevronDown className="w-3 h-3" />
                                              )}
                                              <span className="font-medium">{key}:</span>
                                              <span className="text-xs text-gray-500">(객체)</span>
                                            </button>
                                            {isExpanded && (
                                              <div className="ml-6 mt-2 space-y-1">
                                                {Object.entries(value).map(([subKey, subValue]: [string, any]) => (
                                                  <div key={subKey} className="text-sm">
                                                    <span className="text-gray-600">{subKey}:</span>
                                                    <span className="ml-2 text-gray-900">
                                                      {typeof subValue === 'boolean' ? (subValue ? '✓' : '✗') : 
                                                       typeof subValue === 'object' ? JSON.stringify(subValue) : 
                                                       String(subValue)}
                                                    </span>
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      }
                                      
                                      // 배열인 경우
                                      if (Array.isArray(value)) {
                                        return (
                                          <div key={key} className="border-t border-gray-100 pt-2 first:pt-0 first:border-t-0">
                                            <button
                                              onClick={() => setExpandedDetails(prev => ({ ...prev, [key]: !isExpanded }))}
                                              className="flex items-center space-x-2 text-sm text-gray-700 hover:text-gray-900 mb-1"
                                            >
                                              {isExpanded ? (
                                                <ChevronUp className="w-3 h-3" />
                                              ) : (
                                                <ChevronDown className="w-3 h-3" />
                                              )}
                                              <span className="font-medium">{key}:</span>
                                              <span className="text-xs text-gray-500">({value.length}개)</span>
                                            </button>
                                            {isExpanded && (
                                              <div className="ml-6 mt-2 space-y-1">
                                                {value.map((item: any, idx: number) => (
                                                  <div key={idx} className="text-sm text-gray-700">
                                                    • {typeof item === 'object' ? JSON.stringify(item) : String(item)}
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      }
                                      
                                      // 단순 값인 경우
                                      return (
                                        <div key={key} className="flex items-start border-t border-gray-100 pt-2 first:pt-0 first:border-t-0">
                                          <span className="text-sm font-medium text-gray-700 min-w-[150px]">{key}:</span>
                                          <span className="text-sm text-gray-900 flex-1">
                                            {typeof value === 'boolean' ? (
                                              <span className={`px-2 py-1 rounded ${value ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                {value ? '✓ 활성화' : '✗ 비활성화'}
                                              </span>
                                            ) : (
                                              String(value)
                                            )}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-gray-800 text-sm leading-relaxed whitespace-pre-wrap break-words font-mono">
                  {selectedCommandResult ? (
                    <div className="space-y-2">
                      {selectedCommandResult.split('\n').map((line, idx) => {
                        // 에러 메시지 강조
                        if (line.includes('오류') || line.includes('ERROR') || line.includes('Error') || line.includes('실패')) {
                          return (
                            <div key={idx} className="bg-red-50 border-l-4 border-red-500 p-3 rounded">
                              <div className="flex items-start">
                                <span className="text-red-800">{line}</span>
                              </div>
                            </div>
                          );
                        }
                        // 성공 메시지 강조
                        if (line.includes('성공') || line.includes('success')) {
                          return (
                            <div key={idx} className="bg-green-50 border-l-4 border-green-500 p-3 rounded">
                              <span className="text-green-800">{line}</span>
                            </div>
                          );
                        }
                        // 헤더 스타일링
                        if (line.includes('총') && line.includes('개 항목')) {
                          return (
                            <div key={idx} className="font-semibold text-gray-900 text-base mb-2 mt-4 first:mt-0">
                              {line}
                            </div>
                          );
                        }
                        // 일반 텍스트
                        return (
                          <div key={idx} className="text-gray-700">
                            {line || '\u00A0'}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    '결과가 없습니다.'
                  )}
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
    </div>
  );
};

export default IdentityControl;