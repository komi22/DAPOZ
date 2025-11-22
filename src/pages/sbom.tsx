import { API_BASE_URL } from '../utils/api';
import React, { useEffect, useMemo, useState } from 'react'
import { Play, Download, MonitorSmartphone, Trash2, Square } from 'lucide-react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

type ResultFile = { id: string; filename: string; createdAt: string }
type JobStatus = 'idle' | 'queued' | 'running' | 'done' | 'error' | 'cancelled'

// ===== API helpers =====
const BASE = API_BASE_URL;  // 백엔드 서버 포트

async function startSourceScan(body: {
  sourcePath?: string
  repoUrl?: string
  branch?: string
  subdir?: string
  mode?: 'SOURCE'
  authType?: 'none' | 'token'
  authValue?: string
  outputFormat?: 'excel' | 'csv' | 'yaml' | 'opossum' | 'spdx-tag' | 'spdx-yaml' | 'spdx-json' | 'spdx-xml'
  runnerId?: string
}) {
  try {
    const r = await fetch(`${BASE}/sbom/source/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    
    if (!r.ok) {
      let errorMsg = `HTTP ${r.status}: ${r.statusText}`
      try {
        const errorData = await r.json()
        errorMsg = errorData.error || errorData.message || errorMsg
      } catch {}
      throw new Error(errorMsg)
    }
    
    return await r.json()
  } catch (e: any) {
    const errorMsg = e?.message || e?.toString() || 'start scan failed'
    console.error('SBOM scan request failed:', errorMsg, e)
    throw new Error(errorMsg)
  }
}

async function getJobStatus(jobId: string) {
  const r = await fetch(`${BASE}/sbom/jobs/${jobId}/status`)
  if (!r.ok) throw new Error('status failed')
  return r.json()
}

async function cancelJob(jobId: string) {
  const r = await fetch(`${BASE}/sbom/jobs/${jobId}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!r.ok) {
    const errorData = await r.json().catch(() => ({}))
    throw new Error(errorData.error || `HTTP ${r.status}: ${r.statusText}`)
  }
  return r.json()
}

async function listResults() {
  const r = await fetch(`${BASE}/sbom/results`)
  if (!r.ok) throw new Error('results failed')
  return r.json()
}

async function monthlyStats() {
  const r = await fetch(`${BASE}/sbom/stats/monthly`)
  if (!r.ok) throw new Error('stats failed')
  return r.json()
}

function downloadUrl(resultId: string) {
  return `${BASE}/sbom/results/${resultId}/download`
}

async function deleteResult(resultId: string) {
  const r = await fetch(`${BASE}/sbom/results/${resultId}`, {
    method: 'DELETE',
  })
  if (!r.ok) {
    const errorData = await r.json().catch(() => ({}))
    throw new Error(errorData.error || `HTTP ${r.status}: ${r.statusText}`)
  }
  return r.json()
}

// ===== UI bits =====
const StatusBadge: React.FC<{ status: JobStatus }> = ({ status }) => {
  const map: Record<JobStatus, { text: string; cls: string }> = {
    idle:   { text: '대기',   cls: 'bg-slate-100 text-slate-700' },
    queued: { text: '대기열', cls: 'bg-yellow-100 text-yellow-700' },
    running:{ text: '진행 중',cls: 'bg-blue-50 text-blue-700' },
    done:   { text: '완료',   cls: 'bg-green-50 text-green-700' },
    error:  { text: '오류',   cls: 'bg-red-50 text-red-700' },
    cancelled: { text: '취소됨', cls: 'bg-orange-50 text-orange-700' },
  }
  const { text, cls } = map[status]
  return <span className={`px-2 py-1 rounded-md text-xs font-medium ${cls}`}>{text}</span>
}

const SbomPage: React.FC = () => {
  // 서버 직접 실행 모드에서는 Runner 선택 불필요 (하위 호환성을 위해 유지)

  // source scan form
  const [sourcePath, setSourcePath] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [branch, setBranch]   = useState('')
  const [subdir, setSubdir]   = useState('')
  const [mode, setMode]       = useState<'SOURCE'>('SOURCE')
  const [authType, setAuthType] = useState<'none' | 'token'>('none')
  const [authValue, setAuthValue] = useState('')
  const [outputFormat, setOutputFormat] = useState<'excel' | 'csv' | 'yaml' | 'opossum' | 'spdx-tag' | 'spdx-yaml' | 'spdx-json' | 'spdx-xml'>('opossum')

  // job state
  const [installedCount, setInstalledCount] = useState<number>(0) // 백엔드에서 meta 전송 시 반영 (패키지 수)
  const [pathCount, setPathCount] = useState<number>(0)           // 파일 수
  const [dirCount, setDirCount] = useState<number>(0)             // 디렉토리 수
  const [progress, setProgress] = useState<number>(0)             // 진행률 
  const [logLines, setLogLines] = useState<string[]>([])
  const [status, setStatus] = useState<JobStatus>('idle')
  const [jobId, setJobId] = useState<string | null>(null)

  // results / stats
  const [results, setResults] = useState<ResultFile[]>([])
  const [stats, setStats] = useState<{ month: string; count: number }[]>([])
  const [refreshTick, setRefreshTick] = useState(0)
  const [deletingFile, setDeletingFile] = useState<string | null>(null)

  // 서버 직접 실행 모드에서는 Runner 목록 불필요

  // load results / stats
  useEffect(() => {
    (async () => {
      const [r, m] = await Promise.all([listResults(), monthlyStats()])
      setResults(r)
      setStats(m)
    })()
  }, [refreshTick])

  // start scan
  const handleStart = async () => {
    if (status === 'running') return
    if (!repoUrl.trim()) {
      setStatus('error')
      setLogLines((p) => [...p, '에러: repoUrl을 입력하세요'])
      return
    }

    setStatus('queued')
    setLogLines(['스캔 요청 전송'])

    try {
      const resp = await startSourceScan({
        runnerId: 'server', 
        repoUrl: repoUrl.trim(),
        branch: branch.trim() || undefined,
        subdir: subdir.trim() || undefined,
        mode,
        authType: authType !== 'none' ? authType : undefined,
        authValue: authValue.trim() || undefined,
        outputFormat,
      })
      setJobId(resp.jobId)
      setInstalledCount(resp.meta?.installedCount ?? 0)
      setPathCount(resp.meta?.pathCount ?? 0)
      setDirCount(resp.meta?.dirCount ?? 0)
      setProgress(resp.meta?.progress ?? 0)
      setLogLines((p) => [...p, `Job #${resp.jobId} 시작.`])
      setStatus('running')
    } catch (e: any) {
      setStatus('error')
      const errorMsg = e?.message || e?.toString() || '요청 실패'
      console.error('Scan start error:', e)
      setLogLines((p) => [...p, `에러: ${errorMsg}`])
      setLogLines((p) => [...p, `에러 상세: ${JSON.stringify(e, null, 2)}`])
      if (e?.response) {
        try {
          const errorData = await e.response.json()
          setLogLines((p) => [...p, `서버 응답: ${JSON.stringify(errorData)}`])
        } catch {}
      }
    }
  }

  // cancel scan
  const handleCancel = async () => {
    if (!jobId || (status !== 'running' && status !== 'queued')) return
    try {
      await cancelJob(jobId)
      setStatus('cancelled')
      setLogLines((p) => [...p, '작업이 취소되었습니다.'])
    } catch (e: any) {
      const errorMsg = e?.message || e?.toString() || '취소 실패'
      console.error('Cancel error:', e)
      setLogLines((p) => [...p, `취소 실패: ${errorMsg}`])
    }
  }

  // poll job status
  useEffect(() => {
    if (!jobId || (status !== 'running' && status !== 'queued')) return
    const t = setInterval(async () => {
      try {
        const s = await getJobStatus(jobId)
        if (s.logAppend && s.logAppend.length) {
          setLogLines((prev) => {
            const newLogs = s.logAppend.filter((log: string) => !prev.includes(log))
            return newLogs.length > 0 ? [...prev, ...newLogs] : prev
          })
        }
        if (typeof s.installedCount === 'number') setInstalledCount(s.installedCount)
        if (typeof s.pathCount === 'number') setPathCount(s.pathCount)
        if (typeof s.dirCount === 'number') setDirCount(s.dirCount)
        if (typeof s.progress === 'number') setProgress(s.progress)
        setStatus(s.status)
        if (s.status === 'done' || s.status === 'error' || s.status === 'cancelled') {
          clearInterval(t)
          setRefreshTick((n) => n + 1)
        }
      } catch {}
    }, 1500)
    return () => clearInterval(t)
  }, [jobId, status])

  const rightTopPills = useMemo(() => (
    <div className="flex items-center gap-2">
      <StatusBadge status="done" />
      <StatusBadge status="running" />
      <StatusBadge status="idle" />
    </div>
  ), [])

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-3xl font-bold">SBOM 생성</h1>
        <p className="text-slate-600">
          FossLight Scanner를 이용한 <b>소스코드</b> SBOM 생성 (SOURCE / DEPENDENCY)
        </p>
      </div>

      {/* Top: scan panel (서버 직접 실행 모드) */}
      <div className="grid grid-cols-1 gap-6">
        {/* Scan Panel */}
        <div className="bg-white rounded-2xl shadow p-5 border relative">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">소스코드 SBOM Scan</h2>
            {rightTopPills}
          </div>

          {/* form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
            <div className="col-span-1 md:col-span-2">
              <label className="text-xs text-slate-600">Repository URL (https:// or ssh)</label>
              <input
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                placeholder="https://github.com/org/repo.git"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-slate-600">Branch (옵션)</label>
              <input
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                placeholder="main"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-slate-600">Subdirectory (옵션)</label>
              <input
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                placeholder="예: src/ 또는 app/"
                value={subdir}
                onChange={(e) => setSubdir(e.target.value)}
              />
            </div>
            <div className="col-span-1 md:col-span-2">
              <label className="text-xs text-slate-600">인증 방법</label>
              <select
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                value={authType}
                onChange={(e) => setAuthType(e.target.value as 'none' | 'token')}
              >
                <option value="none">인증 없음 (Public Repository)</option>
                <option value="token">Personal Access Token (HTTPS, Private Repository)</option>
              </select>
            </div>
            {authType === 'token' && (
              <div className="col-span-1 md:col-span-2">
                <label className="text-xs text-slate-600">Personal Access Token (GitHub)</label>
                <input
                  type="password"
                  className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  value={authValue}
                  onChange={(e) => setAuthValue(e.target.value)}
                />
                <div className="text-xs text-slate-500 mt-1">
                  GitHub → Settings → Developer settings → Personal access tokens → Generate new token (classic)
                </div>
              </div>
            )}
            <div>
              <label className="text-xs text-slate-600">출력 포맷</label>
              <select
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                value={outputFormat}
                onChange={(e) => setOutputFormat(e.target.value as 'excel' | 'csv' | 'yaml' | 'opossum' | 'spdx-tag' | 'spdx-yaml' | 'spdx-json' | 'spdx-xml')}
              >
                <optgroup label="일반 포맷">
                  <option value="opossum">Opossum</option>
                  <option value="excel">Excel</option>
                  <option value="csv">CSV</option>
                  <option value="yaml">YAML</option>
                </optgroup>
                <optgroup label="SPDX 포맷">
                  <option value="spdx-json">SPDX JSON</option>
                  <option value="spdx-yaml">SPDX YAML</option>
                  <option value="spdx-tag">SPDX Tag</option>
                  <option value="spdx-xml">SPDX XML</option>
                </optgroup>
              </select>
            </div>
          </div>

          {/* meta */}
          <div className="grid grid-cols-2 gap-4 mt-4">
            <InfoStat label="파일/항목 수" value={pathCount} />
            <InfoStat label="디렉토리 수" value={dirCount} />
          </div>

          {/* progress bar */}
          {(status === 'running' || status === 'queued') && progress > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-slate-600">진행률</span>
                <span className="text-sm font-medium text-blue-700">{progress}%</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2.5">
                <div
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* action */}
          <div className="mt-4 flex items-center gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={handleStart}
                disabled={status === 'running' || status === 'queued'}
                className="inline-flex items-center justify-center gap-2 h-10 px-4 min-w-[120px] rounded-lg bg-[#10113C] text-white text-sm font-medium hover:bg-[#10113C]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Play className="w-4 h-4" /> 스캔 시작
              </button>
              {(status === 'running' || status === 'queued') && (
                <button
                  onClick={handleCancel}
                  className="inline-flex items-center justify-center gap-2 h-10 px-4 min-w-[100px] rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900 transition-colors"
                >
                  <Square className="w-4 h-4" /> 중단
                </button>
              )}
            </div>
            <div className="text-sm text-slate-600 flex items-center gap-2">
              <MonitorSmartphone className="w-4 h-4" />
              실행 환경: 서버 (로컬 실행)
            </div>
            <div className="ml-auto">
              <StatusBadge status={status} />
            </div>
          </div>

          {/* logs */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-slate-600">오류창 / 진행 로그</span>
            </div>
            <div className="h-56 bg-black text-green-300 font-mono text-xs p-3 rounded-lg overflow-auto">
              {logLines.length === 0 ? (
                <div className="text-slate-400">로그가 여기에 표시됩니다</div>
              ) : (
                logLines.map((l, i) => <div key={i}>$ {l}</div>)
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom: results / stats */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Results */}
        <div className="bg-white rounded-2xl shadow p-5 border">
          <h2 className="text-lg font-semibold mb-4">SBOM 생성</h2>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left w-1/2">파일명</th>
                  <th className="px-3 py-2 text-left">생성일시</th>
                  <th className="px-3 py-2 text-center w-36">다운로드</th>
                  <th className="px-3 py-2 text-center w-24">삭제</th>
                </tr>
              </thead>
              <tbody>
                {results.map(r => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2 break-all max-w-md">{r.filename}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.createdAt}</td>
                    <td className="px-3 py-2 text-center">
                      <a
                        href={downloadUrl(r.id)}
                        className="inline-flex items-center justify-center gap-1.5 h-8 px-3 min-w-[100px] rounded-md border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors whitespace-nowrap"
                      >
                        <Download className="w-4 h-4" /> 다운로드
                      </a>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={async () => {
                          if (!confirm(`파일 "${r.filename}"을 삭제하시겠습니까?`)) return
                          setDeletingFile(r.id)
                          try {
                            await deleteResult(r.id)
                            setRefreshTick(t => t + 1) // 목록 새로고침
                          } catch (e: any) {
                            alert(`삭제 실패: ${e?.message || 'Unknown error'}`)
                          } finally {
                            setDeletingFile(null)
                          }
                        }}
                        disabled={deletingFile === r.id}
                        className="inline-flex items-center justify-center gap-1.5 h-8 px-3 min-w-[80px] rounded-md border border-red-300 text-red-700 text-sm font-medium hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <Trash2 className="w-4 h-4" /> {deletingFile === r.id ? '삭제 중' : '삭제'}
                      </button>
                    </td>
                  </tr>
                ))}
                {results.length === 0 && (
                  <tr><td className="px-3 py-3 text-slate-500" colSpan={4}>아직 생성된 파일이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Monthly Stats */}
        <div className="bg-white rounded-2xl shadow p-5 border">
          <h2 className="text-lg font-semibold mb-4">전체 시스템 모니터링</h2>
          <div className="text-sm text-slate-500 mb-2">월 별 SBOM 생성 건 수</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="count" dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}

const InfoStat: React.FC<{ label: string; value: number | string }> = ({ label, value }) => (
  <div className="border rounded-xl p-3">
    <div className="text-xs text-slate-500">{label}</div>
    <div className="text-2xl font-semibold mt-1">{value}</div>
  </div>
)

export default SbomPage