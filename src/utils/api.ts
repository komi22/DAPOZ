// src/utils/api.ts
import axios from 'axios'

/**
 * API 기본 URL 계산
 * - VITE_API_BASE_URL 이 있으면 그 값 사용
 * - 없으면 현재 브라우저 origin 기준으로 포트만 3001로 바꾸고 /api 붙임
 *   예) http://localhost:5173        -> http://localhost:3001/api
 *       http://61.72.143.248:5173   -> http://61.72.143.248:3001/api
 */
function getApiBaseUrl(): string {
  const envUrl =
    (import.meta as any).env?.VITE_API_BASE_URL as string | undefined
  if (envUrl && envUrl.trim().length > 0) {
    return envUrl.replace(/\/$/, '') // 끝에 / 있으면 제거
  }

  if (typeof window !== 'undefined' && window.location) {
    const url = new URL(window.location.origin)

    // Vite 개발 서버 포트 5173 → 백엔드 포트 3001
    if (url.port === '5173') {
      url.port = '3001'
    }

    return `${url.origin}/api`
  }

  // 마지막 fallback (SSR 같은 특수 상황)
  return 'http://localhost:3001/api'
}

export const API_BASE_URL = getApiBaseUrl()

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
})

// OpenZiti API
export const zitiApi = {
  getRouters: () => api.get('/ziti/routers'),
  executeCommand: (command: string) => api.post('/ziti/execute', { command }),
}

// SaltStack API
export const saltApi = {
  getTargets: () => api.get('/salt/targets'),
  getProcesses: (target: string) => api.post('/salt/processes', { target }),
  executeCommand: (command: string, targets: string[]) =>
    api.post('/salt/execute', { command, targets }),
  executeState: (stateName: string, targets: string[]) =>
    api.post('/salt/state', { stateName, targets }),
  addSchedule: (
    target: string,
    name: string,
    command: string,
    interval: number,
    type: string,
  ) => api.post('/salt/schedule/add', { target, name, command, interval, type }),
  getSchedule: (target: string) => api.get(`/salt/schedule/${target}`),

  // 키 관리 API
  getKeys: () => api.get('/salt/keys'),
  acceptKey: (keyId: string) => api.post('/salt/keys/accept', { keyId }),
  acceptAllKeys: () => api.post('/salt/keys/accept-all'),
  rejectKey: (keyId: string) => api.post('/salt/keys/reject', { keyId }),
  deleteKey: (keyId: string) => api.post('/salt/keys/delete', { keyId }),

  // 핑 테스트 API
  pingTarget: (target: string) => api.post('/salt/ping', { target }),
  pingAll: () => api.post('/salt/ping-all'),
}

// 로그 및 메트릭 API
export const metricsApi = {
  getLogs: () => api.get('/logs'),
  getNetworkMetrics: () => api.get('/metrics/network'),
}

// 정책 API
export const policyApi = {
  getPolicies: () => api.get('/policies'),
  applyPolicies: (policyIds: string[]) =>
    api.post('/policies/apply', { policyIds }),
}

// 디바이스 필라 API
export const deviceApi = {
  getDeviceInfo: (target: string) => api.post('/device/info', { target }),
  getAllDeviceInfo: () => api.get('/device/info/all'),
  executeCommand: (command: string, targets: string[]) =>
    api.post('/device/execute', { command, targets }),
  addSecuritySchedule: (scheduleType: string) =>
    api.post('/device/schedule/security', { scheduleType }),
  addAllSecuritySchedules: () => api.post('/device/schedule/all'),
  getScheduleList: () => api.get('/device/schedule/list'),
  setDepartment: (target: string, department: string) =>
    api.post('/device/department', { target, department }),
  getDepartment: (target: string) =>
    api.get(`/device/department/${target}`),
}

export default api