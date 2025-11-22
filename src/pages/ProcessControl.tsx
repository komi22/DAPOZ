import { API_BASE_URL } from '../utils/api';

import React, { useState, useEffect } from 'react'
import {Users, Monitor, Play, RefreshCw, AlertTriangle, CheckCircle, Clock, Activity, Settings, Key, Wifi, Container, Check, X, Trash2, Server, Database, Shield, Cpu, HardDrive, Network, Calendar, Plus, Pause, SkipForward, Edit, Save, RotateCcw, List, UserCheck, UserX, Eye} from 'lucide-react'
import { saltApi } from '../utils/api'

interface SaltKey {
  id: string
  status: 'accepted' | 'unaccepted' | 'denied' | 'rejected'
  fingerprint?: string
}

interface ContainerInfo {
  id: string
  name: string
  image: string
  status: string
  ports: string[]
  created: string
}

interface ContainerStats {
  name: string
  image: string
  status: string
  created: string
  ports: Array<{
    container: string
    host: string
    status: string
  }>
  resources: {
    cpu: string
    memory: string
    networkIO: string
    diskIO: string
  }
}

interface ScheduleJob {
  name: string
  function: string
  seconds?: number
  minutes?: number
  hours?: number
  enabled: boolean
  next_run?: string
}

// 프로세스 이름 정규화: 공백 제거 + .exe 붙어 있으면 제거
const normalizeProcessName = (name: string) =>
  name.trim().replace(/\.exe$/i, '')

const ProcessControl: React.FC = () => {
  const [targets, setTargets] = useState<any[]>([])
  const [selectedTarget, setSelectedTarget] = useState('')
  const [processes, setProcesses] = useState<any[]>([])
  const [commandInput, setCommandInput] = useState('')
  const [executionResult, setExecutionResult] = useState('')
  const [systemLogs, setSystemLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshingTargets, setRefreshingTargets] = useState(false)
  const [refreshingProcesses, setRefreshingProcesses] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<string>('')
  const [showLogs, setShowLogs] = useState(false)
  const [error, setError] = useState<string>('')
  
  // SaltStack 키 관리 상태
  const [saltKeys, setSaltKeys] = useState<SaltKey[]>([])
  const [loadingKeys, setLoadingKeys] = useState(false)
  const [containerStats, setContainerStats] = useState<ContainerStats | null>(null)
  const [pingResults, setPingResults] = useState<Record<string, boolean>>({})
  const [pingLoading, setPingLoading] = useState<Record<string, boolean>>({})

  // 키별 로딩 상태
  const [keyActionLoading, setKeyActionLoading] = useState<Record<string, string>>({})

  // 스케줄 관리 상태
  const [scheduleJobs, setScheduleJobs] = useState<ScheduleJob[]>([])
  const [loadingSchedule, setLoadingSchedule] = useState(false)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [newSchedule, setNewSchedule] = useState({
    name: '',
    command: '',
    seconds: 60,
    target: ''
  })

  // 블랙리스트/화이트리스트 상태
  const [showBlacklistModal, setShowBlacklistModal] = useState(false)
  const [showWhitelistModal, setShowWhitelistModal] = useState(false)
  const [blacklistProcess, setBlacklistProcess] = useState('')
  const [whitelistTarget, setWhitelistTarget] = useState('')
  const [isCreatingWhitelist, setIsCreatingWhitelist] = useState(false)
  const [isCreatingBlacklist, setIsCreatingBlacklist] = useState(false)

  // 프로세스 블랙리스트 상태
  const [blacklistedProcesses, setBlacklistedProcesses] = useState<string[]>([])
  const [selectedProcess, setSelectedProcess] = useState<any>(null)
  const [showToast, setShowToast] = useState(false)
  const [commandResults, setCommandResults] = useState<Record<string, string>>({})
  const [showResultModal, setShowResultModal] = useState(false)
  const [selectedCommandResult, setSelectedCommandResult] = useState<string>('')
  const [parsedEventLogs, setParsedEventLogs] = useState<any[]>([])
  const [resultType, setResultType] = useState<'text' | 'events' | 'processes' | 'network' | 'memory'>('text')

  // Docker 컨테이너 실시간 리소스 정보 조회
  const fetchContainerStats = async () => {
    try {
      const response = await fetch(API_BASE_URL + '/docker/containers/salt_master/stats')
      if (response.ok) {
        const stats = await response.json()
        setContainerStats(stats)
      }
    } catch (error) {
      console.error('컨테이너 리소스 정보 조회 실패:', error)
    }
  }

  // 화이트리스트 생성 (CLI 스크립트 기반)
  const createWhitelist = async () => {
    if (!whitelistTarget) {
      setError('대상을 선택해주세요.')
      return
    }

    setIsCreatingWhitelist(true)
    setError('')
    
    try {
      // 1단계: 프로세스 정보 수집
      setExecutionResult('화이트리스트 생성 중...\n[1/7] 프로세스 정보 수집 중...')
      
      const processCommand = `cmd.run "Get-Process | Select-Object Id,ProcessName,StartTime,Path | ConvertTo-Json -Depth 2" shell=powershell`
      const processResponse = await saltApi.executeCommand(processCommand, [whitelistTarget])
      
      if (!processResponse.data) {
        throw new Error('프로세스 정보를 가져올 수 없습니다.')
      }

      setExecutionResult(prev => prev + '\n[2/7] 화이트리스트 경로 및 파일 추출 중...')

      // 2단계: 화이트리스트 파일 생성 명령어들
      const commands = [
  // PowerShell용 디렉터리 생성 (존재해도 그냥 넘어감)
  `cmd.run "powershell -NoProfile -Command \"if (!(Test-Path 'C:\\salt')) { New-Item -ItemType Directory -Path 'C:\\salt' -Force | Out-Null }\""`,
  
  // PowerShell 스크립트로 화이트리스트 생성 (기존과 동일)
  `cmd.run "$processes = Get-Process | Select-Object ProcessName,Path; $paths = $processes | Where-Object { $_.Path } | Select-Object -ExpandProperty Path | Sort-Object -Unique; $names = $processes | Select-Object -ExpandProperty ProcessName | Sort-Object -Unique; $paths | Out-File -FilePath 'C:\\salt\\whitelist_path.txt' -Encoding UTF8; $names | Out-File -FilePath 'C:\\salt\\whitelist_name.txt' -Encoding UTF8" shell=powershell`,
  
  // 화이트리스트 검증 스크립트 생성 (기존 그대로)
  `cmd.run "powershell -NoProfile -ExecutionPolicy Bypass -Command \"@'
$allowPath = Get-Content 'C:\\salt\\whitelist_path.txt' | ForEach-Object { $_.ToLower() }
$allowName = Get-Content 'C:\\salt\\whitelist_name.txt' | ForEach-Object { $_.ToLower() }
Get-Process | ForEach-Object {
    $pname = $_.ProcessName.ToLower()
    if (
        ($pname -notin 'smss','csrss','wininit','services','lsass','winlogon','explorer','svchost','system','salt-minion') -and
        ($pname -notmatch 'salt') -and
        ($pname -notmatch 'ziti') -and
        ($pname -notmatch 'fluent')
    ) {
        if ($_.Path) {
            if ($allowPath -notcontains $_.Path.ToLower()) { 
                Write-Host \"Killing unauthorized process: $($_.ProcessName) (Path: $($_.Path))\"
                Stop-Process -Id $_.Id -Force 
            }
        } else {
            if ($allowName -notcontains $pname) { 
                Write-Host \"Killing unauthorized process: $($_.ProcessName)\"
                Stop-Process -Id $_.Id -Force 
            }
        }
    }
}
'@ | Out-File -FilePath 'C:\\salt\\kill_unapproved.ps1' -Encoding UTF8\""`
]

      let stepCount = 3
      for (const command of commands) {
        setExecutionResult(prev => prev + `\n[${stepCount}/7] 명령어 실행 중...`)
        await saltApi.executeCommand(command, [whitelistTarget])
        stepCount++
      }

      // 6단계: 스케줄 추가
      setExecutionResult(prev => prev + '\n[6/7] 스케줄 추가 중...')
      const scheduleCommand = `schedule.add whitelist_enforcement function='cmd.run' job_args="['powershell -NoProfile -ExecutionPolicy Bypass -File C:\\\\salt\\\\kill_unapproved.ps1']" seconds=60 persist=True`

      
      await saltApi.executeCommand(scheduleCommand, [whitelistTarget])

      // 7단계: 스케줄 저장
      setExecutionResult(prev => prev + '\n[7/7] 스케줄 저장 중...')
      await saltApi.executeCommand('schedule.save', [whitelistTarget])

      setExecutionResult(prev => prev + '\n\n 화이트리스트 생성 완료!')
      setExecutionResult(prev => prev + '\n\n실행 명령어:')
      setExecutionResult(prev => prev + `\ndocker exec -it salt_master salt '${whitelistTarget}' schedule.run_job whitelist_enforcement`)
      
      setShowWhitelistModal(false)
      setWhitelistTarget('')
      
      // 스케줄 목록 새로고침
      if (selectedTarget) {
        fetchScheduleJobs(selectedTarget)
      }

    } catch (error: any) {
      console.error('화이트리스트 생성 실패:', error)
      setError(`화이트리스트 생성 실패: ${error.message}`)
      setExecutionResult(prev => prev + `\n\n❌ 오류 발생: ${error.message}`)
    } finally {
      setIsCreatingWhitelist(false)
    }
  }

  // 블랙리스트 생성
  const createBlacklist = async () => {
    const rawName = blacklistProcess.trim()
    const processName = normalizeProcessName(rawName)

    if (!rawName) {
      setError('차단할 프로세스명을 입력해주세요.')
      return
    }

    if (!selectedTarget) {
      setError('대상을 선택해주세요.')
      return
    }

    setIsCreatingBlacklist(true)
    setError('')
    
    try {
      setExecutionResult(`블랙리스트 생성 중...\n프로세스 "${processName}" 차단 스케줄 생성 중...`)

      // 블랙리스트 프로세스 종료 스크립트 생성
      const scriptCommand = `cmd.run "powershell -NoProfile -ExecutionPolicy Bypass -Command \"@'
Get-Process -Name '${processName}' -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host \"Killing blacklisted process: $($_.ProcessName) (PID: $($_.Id))\"
    Stop-Process -Id $_.Id -Force
}
'@ | Out-File -FilePath 'C:\\salt\\kill_${processName}.ps1' -Encoding UTF8""`

      await saltApi.executeCommand(scriptCommand, [selectedTarget])

      // 스케줄 추가
      const scheduleCommand = `schedule.add blacklist_${processName} function='cmd.run' job_args="['powershell -NoProfile -ExecutionPolicy Bypass -File C:\\\\salt\\\\kill_${processName}.ps1']" seconds=30 persist=True`
      await saltApi.executeCommand(scheduleCommand, [selectedTarget])

      // 스케줄 저장
      await saltApi.executeCommand('schedule.save', [selectedTarget])

      setExecutionResult(prev => prev + '\n\n 블랙리스트 생성 완료!')
      setExecutionResult(prev => prev + `\n프로세스 "${processName}"가 30초마다 자동으로 종료됩니다.`)
      setExecutionResult(prev => prev + '\n\n실행 명령어:')
      setExecutionResult(prev => prev + `\ndocker exec -it salt_master salt '${selectedTarget}' schedule.run_job blacklist_${processName}`)
      
      setShowBlacklistModal(false)
      setBlacklistProcess('')
      
      // 스케줄 목록 새로고침
      if (selectedTarget) {
        fetchScheduleJobs(selectedTarget)
      }

    } catch (error: any) {
      console.error('블랙리스트 생성 실패:', error)
      setError(`블랙리스트 생성 실패: ${error.message}`)
      setExecutionResult(prev => prev + `\n\n❌ 오류 발생: ${error.message}`)
    } finally {
      setIsCreatingBlacklist(false)
    }
  }

  // 스케줄 목록 조회
  const fetchScheduleJobs = async (target: string) => {
    if (!target) return
    
    setLoadingSchedule(true)
    try {
      const command = `schedule.list`
      const response = await saltApi.executeCommand(command, [target])
      
      // 백엔드 응답 구조 확인
      console.log('스케줄 조회 응답:', response)
      
      if (response.data) {
        // 백엔드에서 직접 stdout을 반환하는 경우
        if (response.data.stdout !== undefined) {
          const output = response.data.stdout
          setExecutionResult(`명령어 실행 결과:\n$ docker exec -i salt_master salt '${target}' schedule.list\n\n${output}`)
          const jobs = parseScheduleOutput(output)
          setScheduleJobs(jobs)
        }
        // 배열 형태로 반환하는 경우 (기존 방식)
        else if (Array.isArray(response.data) && response.data.length > 0) {
          const result = response.data[0].result
          const output = result.stdout || ''
          setExecutionResult(`명령어 실행 결과:\n$ docker exec -i salt_master salt '${target}' schedule.list\n\n${output}`)
          const jobs = parseScheduleOutput(output)
          setScheduleJobs(jobs)
        }
        else {
          setExecutionResult(`명령어 실행 결과:\n$ docker exec -i salt_master salt '${target}' schedule.list\n\n스케줄 작업이 없습니다.`)
        }
      }
    } catch (error: any) {
      console.error('스케줄 조회 실패:', error)
      setError(`스케줄 조회 실패: ${error.message}`)
    } finally {
      setLoadingSchedule(false)
    }
  }

  // 스케줄 출력 파싱 함수
  const parseScheduleOutput = (output: string): ScheduleJob[] => {
    // Salt schedule.list 출력을 파싱하여 ScheduleJob 배열로 변환
    // 실제 출력 형식에 맞게 구현 필요
    return []
  }

  // 스케줄 작업 실행
  const executeScheduleCommand = async (command: string, target: string) => {
    setLoading(true)
    try {
      const response = await saltApi.executeCommand(command, [target])
      
      // 백엔드 응답 구조 확인
      console.log('스케줄 명령어 응답:', response)
      
      if (response.data) {
        // 백엔드에서 직접 stdout을 반환하는 경우
        if (response.data.stdout !== undefined) {
          const output = response.data.stdout || response.data.stderr || '명령어가 성공적으로 실행되었습니다.'
          setExecutionResult(`명령어 실행 결과:\n$ docker exec -i salt_master salt '${target}' ${command}\n\n${output}`)
        }
        // 배열 형태로 반환하는 경우 (기존 방식)
        else if (Array.isArray(response.data) && response.data.length > 0) {
          const result = response.data[0].result
          const output = result.stdout || result.stderr || '명령어가 성공적으로 실행되었습니다.'
          setExecutionResult(`명령어 실행 결과:\n$ docker exec -i salt_master salt '${target}' ${command}\n\n${output}`)
        }
        
        // 스케줄 목록 새로고침
        fetchScheduleJobs(target)
      }
    } catch (error: any) {
      setError(`스케줄 명령어 실행 실패: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  // 프로세스를 블랙리스트에 추가
  const addToBlacklist = (process: any) => {
    if (process && !blacklistedProcesses.includes(process.name)) {
      setBlacklistedProcesses(prev => [...prev, process.name])
      
      // 프로세스 종료 스케줄 생성
      const killCommand = `cmd.run "taskkill /F /IM ${process.name}"`
      setNewSchedule({
        name: `kill_${process.name}`,
        command: killCommand,
        seconds: 60,
        target: selectedTarget
      })
      setShowScheduleModal(true)
    }
  }

  // 스케줄 생성
  const createSchedule = async () => {
    if (!newSchedule.name || !newSchedule.target) return
    
    setLoading(true)
    try {
      const command = `schedule.add ${newSchedule.name} function='${newSchedule.command}' seconds=${newSchedule.seconds}`
      
      const response = await saltApi.executeCommand(command, [newSchedule.target])
      
      // 백엔드 응답 구조 확인
      console.log('스케줄 생성 응답:', response)
      
      if (response.data) {
        // 백엔드에서 직접 stdout을 반환하는 경우
        if (response.data.stdout !== undefined) {
          const output = response.data.stdout || '스케줄이 성공적으로 생성되었습니다.'
          setExecutionResult(`명령어 실행 결과:\n$ docker exec -i salt_master salt '${newSchedule.target}' ${command}\n\n${output}`)
        }
        // 배열 형태로 반환하는 경우 (기존 방식)
        else if (Array.isArray(response.data) && response.data.length > 0) {
          const result = response.data[0].result
          const output = result.stdout || '스케줄이 성공적으로 생성되었습니다.'
          setExecutionResult(`명령어 실행 결과:\n$ docker exec -i salt_master salt '${newSchedule.target}' ${command}\n\n${output}`)
        }
        
        setShowScheduleModal(false)
        fetchScheduleJobs(newSchedule.target)
        
        // 폼 초기화
        setNewSchedule({
          name: '',
          command: '',
          seconds: 60,
          target: ''
        })
      }
    } catch (error: any) {
      setError(`스케줄 생성 실패: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  // SaltStack 키 목록 조회
  const fetchSaltKeys = async () => {
    setLoadingKeys(true)
    setError('')
    try {
      console.log('SaltStack 키 목록 조회 시작...')
      const response = await saltApi.getKeys()
      console.log('키 목록 응답:', response)
      
      // 안전한 데이터 처리
      const keysData = response.data?.data || response.data || []
      setSaltKeys(Array.isArray(keysData) ? keysData : [])
      
      // 원시 데이터도 로그로 출력
      if (response.data?.raw) {
        console.log('Salt-key 원시 출력:', response.data.raw)
        setExecutionResult(`명령어 실행 결과:\n$ docker exec -i salt_master salt-key -L\n\n${response.data.raw}`)
      }
    } catch (error: any) {
      console.error('키 목록 조회 실패:', error)
      const errorMessage = error.response?.data?.error || error.message || '알 수 없는 오류'
      setError(`키 조회 오류: ${errorMessage}`)
      setExecutionResult(`키 조회 실패:\n${JSON.stringify(error.response?.data || error, null, 2)}`)
      setSaltKeys([])
    } finally {
      setLoadingKeys(false)
      fetchSystemLogs()
    }
  }

  // 키 액션 실행 (수락/거부/삭제)
  const executeKeyAction = async (keyId: string, action: 'accept' | 'reject' | 'delete', actionName: string) => {
    setKeyActionLoading(prev => ({ ...prev, [keyId]: action }))
    
    try {
      let response
      switch (action) {
        case 'accept':
          response = await saltApi.acceptKey(keyId)
          break
        case 'reject':
          response = await saltApi.rejectKey(keyId)
          break
        case 'delete':
          if (!confirm(`정말로 키 '${keyId}'를 삭제하시겠습니까?`)) return
          response = await saltApi.deleteKey(keyId)
          break
      }
      
      setExecutionResult(`${actionName} 성공: ${keyId}\n$ docker exec -i salt_master salt-key -${action === 'accept' ? 'a' : action === 'reject' ? 'r' : 'd'} "${keyId}" -y\n\n${response.data?.output || ''}`)
      fetchSaltKeys() // 키 목록 새로고침
      if (action === 'accept') {
        fetchTargets() // 대상 목록도 새로고침 (수락된 키는 대상이 됨)
      }
    } catch (error: any) {
      console.error(`${actionName} 실패:`, error)
      setError(`${actionName} 실패: ${error.response?.data?.error || error.message}`)
      setExecutionResult(`${actionName} 실패 (${keyId}):\n${JSON.stringify(error.response?.data || error, null, 2)}`)
    } finally {
      setKeyActionLoading(prev => {
        const newState = { ...prev }
        delete newState[keyId]
        return newState
      })
    }
  }

  // 특정 키 수락
  const acceptKey = async (keyId: string) => {
    await executeKeyAction(keyId, 'accept', '키 수락')
  }

  // 모든 키 수락
  const acceptAllKeys = async () => {
    try {
      const response = await saltApi.acceptAllKeys()
      setExecutionResult(`모든 키 수락 성공:\n$ docker exec -i salt_master salt-key -A -y\n\n${response.data?.output || ''}`)
      fetchSaltKeys() // 키 목록 새로고침
      fetchTargets() // 대상 목록도 새로고침
    } catch (error: any) {
      console.error('모든 키 수락 실패:', error)
      setError(`모든 키 수락 실패: ${error.response?.data?.error || error.message}`)
      setExecutionResult(`모든 키 수락 실패:\n${JSON.stringify(error.response?.data || error, null, 2)}`)
    }
  }

  // 키 거부
  const rejectKey = async (keyId: string) => {
    await executeKeyAction(keyId, 'reject', '키 거부')
  }

  // 키 삭제
  const deleteKey = async (keyId: string) => {
    await executeKeyAction(keyId, 'delete', '키 삭제')
  }

  // 핑 테스트 - 백엔드 응답을 그대로 출력
  const pingTarget = async (target: string) => {
    setPingLoading(prev => ({ ...prev, [target]: true }))
    try {
      console.log(`핑 테스트 시작: ${target}`)
      const response = await saltApi.pingTarget(target)
      console.log('핑 테스트 응답:', response)
      
      if (response.data) {
        // 백엔드에서 직접 stdout을 반환하는 경우
        if (response.data.stdout !== undefined) {
          const output = response.data.stdout || response.data.stderr || ''
          
          // 성공 여부 판단 - stdout에 True가 포함되어 있으면 성공
          const success = output.includes('True') || output.includes('true')
          
          setPingResults(prev => ({ ...prev, [target]: success }))
          
          // 실제 출력 그대로 표시
          if (success) {
            setExecutionResult(`핑 테스트 성공 (${target}):\n$ docker exec -i salt_master salt "${target}" test.ping\n\n${output}`)
          } else {
            setExecutionResult(`핑 테스트 실패 (${target}):\n$ docker exec -i salt_master salt "${target}" test.ping\n\n${output}`)
          }
        }
        // 배열 형태로 반환하는 경우 (기존 방식)
        else if (Array.isArray(response.data) && response.data.length > 0) {
          const result = response.data[0].result
          const output = result.stdout || result.stderr || ''
          
          // 성공 여부 판단
          const success = result.success && output && (output.includes('True') || output.includes('true'))
          
          setPingResults(prev => ({ ...prev, [target]: success }))
          
          if (success) {
            setExecutionResult(`핑 테스트 성공 (${target}):\n$ docker exec -i salt_master salt "${target}" test.ping\n\n${output}`)
          } else {
            setExecutionResult(`핑 테스트 실패 (${target}):\n$ docker exec -i salt_master salt "${target}" test.ping\n\n${output}`)
          }
        }
        else {
          setPingResults(prev => ({ ...prev, [target]: false }))
          setExecutionResult(`핑 테스트 실패 (${target}):\n$ docker exec -i salt_master salt "${target}" test.ping\n\n출력 없음`)
        }
      }
    } catch (error: any) {
      console.error('핑 테스트 실패:', error)
      setPingResults(prev => ({ ...prev, [target]: false }))
      setError(`핑 테스트 실패: ${error.response?.data?.error || error.message}`)
      setExecutionResult(`핑 테스트 네트워크 오류 (${target}):\n${JSON.stringify(error.response?.data || error, null, 2)}`)
    } finally {
      setPingLoading(prev => ({ ...prev, [target]: false }))
    }
  }

  // 모든 대상 핑 테스트
  const pingAllTargets = async () => {
    try {
      const response = await saltApi.pingAll()
      const results = response.data?.results || {}
      setPingResults(results)
      setExecutionResult(`전체 핑 테스트 결과:\n$ docker exec -i salt_master salt "*" test.ping\n\n${response.data?.output || JSON.stringify(results, null, 2)}`)
    } catch (error: any) {
      console.error('전체 핑 테스트 실패:', error)
      setError(`전체 핑 테스트 실패: ${error.response?.data?.error || error.message}`)
      setExecutionResult(`전체 핑 테스트 실패:\n${JSON.stringify(error.response?.data || error, null, 2)}`)
    }
  }

  // 시스템 로그 조회
  const fetchSystemLogs = async () => {
    try {
      const response = await fetch(API_BASE_URL + '/logs/system')
      const logs = await response.json()
      setSystemLogs(Array.isArray(logs) ? logs : [])
    } catch (error) {
      console.error('시스템 로그 조회 실패:', error)
      setSystemLogs([])
    }
  }

  // 대상 목록 조회
  const fetchTargets = async () => {
    setRefreshingTargets(true)
    setError('')
    let isNetworkError = false
    try {
      console.log('SaltStack 대상 목록 조회 시작...')
      const response = await saltApi.getTargets()
      console.log('대상 목록 응답:', response)
      
      // 안전한 데이터 처리
      const targetsData = response.data?.data || response.data || []
      setTargets(Array.isArray(targetsData) ? targetsData : [])
      setLastUpdate(new Date().toLocaleString('ko-KR'))
      console.log('대상 목록 업데이트 완료:', targetsData)
    } catch (error: any) {
      console.error('대상 목록 조회 실패:', error)
      
      // 네트워크 에러인 경우 더 명확한 메시지 표시
      if (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
        isNetworkError = true
        const errorMessage = '백엔드 서버(localhost:3001)에 연결할 수 없습니다.\n\n해결 방법:\n1. 백엔드 서버가 실행 중인지 확인하세요 (server/index.cjs)\n2. 포트 3001이 사용 가능한지 확인하세요\n3. 방화벽 설정을 확인하세요'
        setError(errorMessage)
        setExecutionResult(`대상 조회 실패: 네트워크 연결 오류\n\n${errorMessage}\n\n에러 상세:\n${error.message || '알 수 없는 네트워크 오류'}`)
      } else {
        const errorMessage = error.response?.data?.error || error.response?.data?.message || error.message || '알 수 없는 오류'
      setError(`대상 조회 오류: ${errorMessage}`)
        setExecutionResult(`대상 조회 실패:\n${errorMessage}\n\n에러 상세:\n${JSON.stringify(error.response?.data || { message: error.message }, null, 2)}`)
      }
      setTargets([])
    } finally {
      setRefreshingTargets(false)
      // fetchSystemLogs는 네트워크 에러가 아닐 때만 호출
      if (!isNetworkError) {
      fetchSystemLogs()
      }
    }
  }

  // 프로세스 목록 조회
  const fetchProcesses = async (target: string) => {
    if (!target) return
    
    setRefreshingProcesses(true)
    setError('')
    try {
      console.log('프로세스 목록 조회 시작:', target)
      const response = await saltApi.getProcesses(target)
      console.log('프로세스 목록 응답:', response)
      
      // 안전한 데이터 처리
      const processesData = response.data?.data || response.data || []
      setProcesses(Array.isArray(processesData) ? processesData : [])
      console.log('프로세스 목록 업데이트 완료:', processesData)
    } catch (error: any) {
      console.error('프로세스 목록 조회 실패:', error)
      const errorMessage = error.response?.data?.error || error.message || '알 수 없는 오류'
      setError(`프로세스 조회 오류: ${errorMessage}`)
      setExecutionResult(`프로세스 조회 실패 (${target}):\n${JSON.stringify(error.response?.data || error, null, 2)}`)
      setProcesses([])
    } finally {
      setRefreshingProcesses(false)
      fetchSystemLogs()
    }
  }

  useEffect(() => {
    fetchContainerStats()
    fetchSaltKeys()
    fetchTargets()
    fetchSystemLogs()
    
    // 30초마다 자동 업데이트
    const interval = setInterval(() => {
      fetchContainerStats()
      fetchSaltKeys()
      fetchTargets()
      if (selectedTarget) {
        fetchProcesses(selectedTarget)
        fetchScheduleJobs(selectedTarget)
      }
      fetchSystemLogs()
    }, 30000)
    
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (selectedTarget) {
      fetchProcesses(selectedTarget)
      fetchScheduleJobs(selectedTarget)
    }
  }, [selectedTarget])

  const onlineTargets = targets.filter(target => target.status === 'online').length
  const totalTargets = targets.length
  // 안전한 필터링
  const unacceptedKeys = Array.isArray(saltKeys) ? saltKeys.filter(key => key.status === 'unaccepted').length : 0
  const acceptedKeys = Array.isArray(saltKeys) ? saltKeys.filter(key => key.status === 'accepted').length : 0
  const deniedKeys = Array.isArray(saltKeys) ? saltKeys.filter(key => key.status === 'denied').length : 0
  const rejectedKeys = Array.isArray(saltKeys) ? saltKeys.filter(key => key.status === 'rejected').length : 0

  const processCommands = [
    {
      name: '연결 테스트',
      command: "test.ping",
      description: 'Salt 연결 상태를 테스트합니다'
    },
    {
      name: '시스템 정보',
      command: "grains.items",
      description: '대상 시스템의 상세 정보를 조회합니다'
    },
    {
      name: '프로세스 목록',
      command: 'cmd.run "tasklist /fo csv"',
      description: '실행 중인 모든 프로세스를 조회합니다 (윈도우)'
    },
    {
      name: '메모리 사용량',
      command: 'cmd.run "powershell -NoProfile -ExecutionPolicy Bypass -Command \"$OutputEncoding=[System.Text.Encoding]::UTF8; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $mem = Get-CimInstance Win32_OperatingSystem; $total = [math]::Round($mem.TotalVisibleMemorySize / 1MB, 2); $free = [math]::Round($mem.FreePhysicalMemory / 1MB, 2); $used = [math]::Round($total - $free, 2); Write-Host \\\"총 메모리: ${total} GB\\\"; Write-Host \\\"사용 중: ${used} GB\\\"; Write-Host \\\"사용 가능: ${free} GB\\\"; Write-Host \\\"사용률: $([math]::Round(($used / $total) * 100, 2))%\\\"\"',
      description: '메모리 사용량을 확인합니다 (윈도우)'
    },
    {
      name: '디스크 사용량',
      command: 'cmd.run "wmic logicaldisk get size,freespace,caption"',
      description: '디스크 사용량을 확인합니다 (윈도우)'
    },
    {
      name: '네트워크 연결',
      command: 'cmd.run "cmd /c \"chcp 65001 >nul 2>&1 && netstat -ano\""',
      description: '네트워크 연결 상태를 확인합니다 (윈도우)'
    },
    {
      name: '서비스 상태',
      command: 'cmd.run "powershell -NoProfile -ExecutionPolicy Bypass -Command \"$OutputEncoding=[System.Text.Encoding]::UTF8; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Get-Service | Select-Object -First 50 | ForEach-Object { Write-Host \\\"SERVICE_NAME: $($_.Name)\\\"; Write-Host \\\"DISPLAY_NAME: $($_.DisplayName)\\\"; Write-Host \\\"STATUS: $($_.Status)\\\"; Write-Host \\\"START_TYPE: $($_.StartType)\\\"; Write-Host \\\"\\\" }\"',
      description: '시스템 서비스 상태를 확인합니다 (윈도우)'
    },
    {
      name: '이벤트 로그',
      command: 'cmd.run "powershell -NoProfile -ExecutionPolicy Bypass -Command \"$OutputEncoding=[System.Text.Encoding]::UTF8; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Get-WinEvent -LogName System -MaxEvents 10 | ForEach-Object { [PSCustomObject]@{ LogName=$_.LogName; Source=$_.ProviderName; Date=$_.TimeCreated; EventID=$_.Id; Task=$_.TaskDisplayName; Level=$_.LevelDisplayName; Opcode=$_.OpcodeDisplayName; Keyword=($_.KeywordsDisplayNames -join \', \'); User=$_.UserId; UserName=$_.UserName; Computer=$_.MachineName; Description=$_.Message } } | ConvertTo-Json -Depth 10\""',
      description: '시스템 이벤트 로그를 확인합니다 (윈도우)'
    }
  ]

  // 스케줄 관리 명령어
  const scheduleCommands = [
    {
      name: '스케줄 목록 확인',
      command: "schedule.list",
      description: '등록된 모든 스케줄 작업을 확인합니다'
    },
    {
      name: '즉시 실행',
      command: "schedule.run_job 작업명",
      description: '특정 스케줄 작업을 즉시 실행합니다'
    },
    {
      name: '주기 수정',
      command: "schedule.modify 작업명 seconds=5",
      description: '스케줄 작업의 실행 주기를 수정합니다'
    },
    {
      name: '작업 일시중지',
      command: "schedule.disable_job 작업명",
      description: '특정 스케줄 작업을 일시중지합니다'
    },
    {
      name: '작업 재개',
      command: "schedule.enable_job 작업명",
      description: '일시중지된 스케줄 작업을 재개합니다'
    },
    {
      name: '작업 삭제',
      command: "schedule.delete 작업명",
      description: '스케줄 작업을 완전히 삭제합니다'
    },
    {
      name: '스케줄러 비활성화',
      command: "schedule.disable",
      description: '전체 스케줄러를 비활성화합니다'
    },
    {
      name: '스케줄러 활성화',
      command: "schedule.enable",
      description: '전체 스케줄러를 활성화합니다'
    },
    {
      name: '스케줄 저장',
      command: "schedule.save",
      description: '현재 스케줄 설정을 영구 저장합니다'
    },
    {
      name: '스케줄 재로드',
      command: "schedule.reload",
      description: '저장된 스케줄 설정을 다시 로드합니다'
    }
  ]

  const handleCommandSelect = (command: string) => {
    setCommandInput(command)
  }

  // 명령어 직접 실행 (토스트 포함)
  const handleExecuteCommandDirect = async (command: string) => {
    if (!command.trim()) {
      setError('명령어를 입력해주세요.')
      return
    }
    
    if (!selectedTarget) {
      setError('대상을 선택해주세요. 명령어는 선택된 대상에 실행됩니다.')
      return
    }
    
    // 토스트 메시지 표시
    setShowToast(true)
    setTimeout(() => setShowToast(false), 3000)
    
    setLoading(true)
    setExecutionResult('명령어 실행 중...')
    setError('')
    
    try {
      console.log('Salt 명령어 실행:', command, '대상:', selectedTarget)
      const response = await saltApi.executeCommand(command, [selectedTarget])
      console.log('Salt 명령어 실행 결과:', response)
      
      let resultText = '';
      let rawOutput = '';
      
      if (response.data) {
        if (response.data.stdout !== undefined || response.data.stderr !== undefined) {
          let output = response.data.stdout || response.data.stderr || '출력 없음'
          rawOutput = output; // 원본 출력 저장
          
          // 인코딩 변환 시도 (깨진 문자 수정)
          if (typeof output === 'string' && (output.includes('') || output.includes(''))) {
            // 깨진 문자가 있으면 서버에 재요청하거나 클라이언트에서 처리
            // 일단 원본 유지 (서버에서 이미 변환되어야 함)
          }
          
          resultText = `명령어 실행 결과:\n$ docker exec -i salt_master salt "${selectedTarget}" ${command}\n\n${output}`;
          setExecutionResult(resultText);
        }
        else if (Array.isArray(response.data) && response.data.length > 0) {
          const result = response.data[0].result
          const output = result.stdout || result.stderr || '출력 없음'
          rawOutput = output; // 원본 출력 저장
          
          resultText = `명령어 실행 결과:\n$ docker exec -i salt_master salt "${selectedTarget}" ${command}\n\n${output}`;
          setExecutionResult(resultText);
          if (result.error) {
            setError(`명령어 실행 실패: ${result.error}`)
          }
        }
        else {
          rawOutput = '명령어가 실행되었지만 출력이 없습니다.';
          resultText = `명령어 실행 결과:\n$ docker exec -i salt_master salt "${selectedTarget}" ${command}\n\n${rawOutput}`;
          setExecutionResult(resultText);
        }
      }
      // 결과 저장 - 원본 출력을 저장 (파싱을 위해)
      setCommandResults(prev => ({ ...prev, [command]: rawOutput }));
    } catch (error: any) {
      console.error('Salt 명령어 실행 네트워크 오류:', error)
      const resultText = `네트워크 오류:\n$ docker exec -i salt_master salt "${selectedTarget}" ${command}\n\n오류: ${error.message}\n\n백엔드 서버(localhost:3001)가 실행 중인지 확인하세요.`;
      setExecutionResult(resultText);
      setCommandResults(prev => ({ ...prev, [command]: resultText }));
      setError(`네트워크 오류: ${error.message}`)
    } finally {
      setLoading(false)
      fetchSystemLogs()
    }
  }

  // 인코딩 변환 헬퍼 (클라이언트 측) - 복구 시도
  const fixEncoding = (text: string): string => {
    if (!text || typeof text !== 'string') return text
    
    // 깨진 문자 패턴 감지
    const nonAscii = text.match(/[^\x00-\x7F]/g)
    const hasBrokenChars = text.includes('') || text.includes('') || 
                          /[ȮϴðʰǾ]/.test(text) ||
                          (nonAscii && nonAscii.length > 0 && 
                           !text.match(/[가-힣]/g) && text.includes('.'))
    
    if (hasBrokenChars) {
      // 복구 시도: 깨진 문자를 제거하는 대신 원본 유지
      // 서버에서 이미 변환되어야 하므로 여기서는 최소한의 정리만
      // 실제 복구는 서버에서 이루어져야 함
      return text;
    }
    return text
  }

  // 결과 파싱 (Salt 명령어 결과를 구조화)
  const parseProcessResult = (rawResult: string, command: string): string => {
    if (!rawResult || rawResult.includes('아직 실행된')) {
      return rawResult;
    }

    // 인코딩 수정 시도
    const fixedResult = fixEncoding(rawResult)

    // 원본 결과에서 불필요한 프롬프트 제거
    const cleanRawResult = fixedResult
      .replace(/명령어 실행 결과:\s*\n\$[^\n]+\n\n/g, '')
      .replace(/docker exec -i salt_master salt[^\n]+\n\n/g, '')
      .trim();

    try {
      // test.ping 결과
      if (command.includes('test.ping')) {
        if (rawResult.includes('True') || rawResult.includes('true')) {
          return '✅ 연결 성공: 대상과 통신이 정상적으로 이루어집니다.';
        }
        if (rawResult.includes('False') || rawResult.includes('false')) {
          return '❌ 연결 실패: 대상과 통신할 수 없습니다.';
        }
      }

      // 이벤트 로그 결과 (JSON 배열 형식)
      if (command.includes('Get-WinEvent') || command.includes('Get-EventLog') || rawResult.includes('Event[')) {
        const jsonMatch = rawResult.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            let jsonStr = jsonMatch[0];
            
            // JSON 파싱
            const events = JSON.parse(jsonStr);
            if (Array.isArray(events) && events.length > 0) {
              // 클라이언트 측에서도 추가 변환 시도 (서버에서 완벽하지 않을 수 있음)
              const fixEventEncoding = (obj: any): any => {
                if (typeof obj === 'string') {
                  // 깨진 문자가 있으면 변환 시도
                  if (obj.includes('') || obj.includes('') || /[ȮϴðʰǾ]/.test(obj) || /[̹]/.test(obj)) {
                    // TextDecoder를 사용하여 변환 시도
                    try {
                      // UTF-8로 인코딩한 후 cp949로 디코딩 시도 (브라우저에서는 직접 cp949 불가)
                      // 대신 깨진 문자를 최소한 정리
                      let fixed = obj;
                      // 깨진 문자 패턴을 제거하거나 대체
                      fixed = fixed.replace(/[]+/g, '?').replace(/[]+/g, '?');
                      fixed = fixed.replace(/[ȮϴðʰǾ]+/g, '?');
                      fixed = fixed.replace(/[̹]+/g, '?');
                      return fixed;
                    } catch (e) {
                      return obj;
                    }
                  }
                  return obj;
                }
                if (Array.isArray(obj)) {
                  return obj.map(item => fixEventEncoding(item));
                }
                if (obj && typeof obj === 'object') {
                  const fixed: any = {};
                  for (const key in obj) {
                    if (obj.hasOwnProperty(key)) {
                      fixed[key] = fixEventEncoding(obj[key]);
                    }
                  }
                  return fixed;
                }
                return obj;
              };
              
              const fixedEvents = events.map((event: any) => fixEventEncoding(event));
              
              // 중복 제거 (Event ID, Source, Description 기준)
              const seen = new Set<string>();
              const uniqueEvents = fixedEvents.filter((event: any) => {
                const eventId = event.EventID || event['Event ID'] || '';
                const source = event.Source || '';
                const description = (event.Description || '').substring(0, 50);
                const key = `${eventId}_${source}_${description}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
              });
              
              const formattedEvents = uniqueEvents.map((event: any, idx: number) => {
                const formatField = (value: any): string => {
                  if (value === null || value === undefined) return '';
                  // User 객체인 경우 Value 추출
                  if (typeof value === 'object' && value.Value) {
                    return value.Value;
                  }
                  // Date 객체나 W/Date 형식 처리
                  if (typeof value === 'object' && value.getTime) {
                    return new Date(value).toLocaleString('ko-KR');
                  }
                  const str = String(value);
                  // W/Date(...) 형식 처리
                  const dateMatch = str.match(/W\/Date\((\d+)\)/);
                  if (dateMatch) {
                    return new Date(parseInt(dateMatch[1])).toLocaleString('ko-KR');
                  }
                  return str;
                };
                
                const formatDate = (dateValue: any): string => {
                  if (!dateValue) return 'N/A';
                  // Date 객체인 경우
                  if (dateValue instanceof Date) {
                    return dateValue.toLocaleString('ko-KR');
                  }
                  // W/Date(...) 형식
                  const dateMatch = String(dateValue).match(/W\/Date\((\d+)\)/);
                  if (dateMatch) {
                    return new Date(parseInt(dateMatch[1])).toLocaleString('ko-KR');
                  }
                  // ISO 형식
                  if (typeof dateValue === 'string' && dateValue.includes('T')) {
                    try {
                      return new Date(dateValue).toLocaleString('ko-KR');
                    } catch (e) {
                      return dateValue;
                    }
                  }
                  return String(dateValue);
                };
                
                const logName = formatField(event.LogName || event['Log Name']) || 'System';
                const source = formatField(event.Source) || 'N/A';
                const date = formatDate(event.Date || event.TimeCreated);
                const eventId = formatField(event.EventID || event['Event ID']) || 'N/A';
                const level = formatField(event.Level || event.LevelDisplayName) || 'N/A';
                const description = formatField(event.Description || event.Message) || 'N/A';
                const task = formatField(event.Task || event.TaskDisplayName);
                const opcode = formatField(event.Opcode || event.OpcodeDisplayName);
                const keyword = formatField(event.Keyword);
                const user = formatField(event.User || event.UserId);
                const userName = formatField(event.UserName || event['User Name']);
                const computer = formatField(event.Computer || event.MachineName) || 'N/A';
                
                // 보기 좋게 포맷팅
                let result = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
                result += `이벤트 #${idx + 1}\n`;
                result += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
                result += `📋 로그: ${logName}\n`;
                result += `🔍 소스: ${source}\n`;
                result += `📅 날짜: ${date}\n`;
                result += `🆔 이벤트 ID: ${eventId}\n`;
                if (level && level !== 'N/A') {
                  result += `📊 레벨: ${level}\n`;
                }
                if (task) {
                  result += `📝 작업: ${task}\n`;
                }
                if (opcode) {
                  result += `⚙️  Opcode: ${opcode}\n`;
                }
                if (keyword) {
                  result += `🔑 키워드: ${keyword}\n`;
                }
                if (user) {
                  result += `👤 사용자: ${user}`;
                  if (userName) {
                    result += ` (${userName})`;
                  }
                  result += `\n`;
                }
                result += `💻 컴퓨터: ${computer}\n`;
                result += `\n📄 설명:\n${description}\n`;
                
                return result;
              });
              
              return `이벤트 로그: ${uniqueEvents.length}개 (중복 제거됨)\n\n${formattedEvents.join('\n\n')}`;
            }
          } catch (e) {
            // JSON 파싱 실패 시 원본 반환
            console.error('이벤트 로그 파싱 실패:', e);
          }
        }
      }

      // grains.items 결과 (JSON 파싱)
      if (command.includes('grains.items')) {
        const jsonMatch = rawResult.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            const importantKeys = ['os', 'osfullname', 'osrelease', 'host', 'fqdn_ip4', 'cpu_model', 'mem_total'];
            const summary = importantKeys
              .filter(key => parsed[key])
              .map(key => `${key}: ${JSON.stringify(parsed[key])}`)
              .join('\n');
            if (summary) {
              return `시스템 정보:\n\n${summary}`;
            }
          } catch (e) {
            // JSON 파싱 실패 시 원본 반환
          }
        }
      }

      // tasklist 결과 (프로세스 목록) - 다양한 형식 지원
      if (command.includes('tasklist')) {
        // CSV 형식 시도
        const csvLines = rawResult.split('\n').filter(line => {
          const trimmed = line.trim();
          // 헤더나 빈 줄 제외
          if (!trimmed || trimmed.length < 3) return false;
          if (trimmed.includes('Image Name') || trimmed.includes('PID') || trimmed.includes('Session Name')) return false;
          if (trimmed.includes('=') || trimmed.startsWith('---')) return false;
          // CSV 형식인지 확인 (쉼표 포함)
          if (!trimmed.includes(',')) return false;
          return true;
        });
        
        if (csvLines.length > 0) {
          const processMap = new Map<string, number>();
          csvLines.forEach(line => {
            const parts = line.split(',').map(p => p.trim().replace(/"/g, ''));
            let processName = parts[0] || '';
            
            // 유효한 프로세스 이름인지 엄격하게 확인
            if (!processName || processName.length < 3) return;
            
            // 일반적인 단어나 헤더 제외
            const excludedWords = ['the', 'minion', 'salt', 'run', 'name', 'pid', 'session', 'memory', 'usage', 'image', 'display'];
            const lowerName = processName.toLowerCase();
            if (excludedWords.includes(lowerName)) return;
            
            // 프로세스 이름은 보통 .exe, .dll 등으로 끝나거나 특정 패턴을 가짐
            // .exe로 끝나거나, 영문/숫자로 시작하고 적절한 길이를 가져야 함
            const isValidProcessName = 
              processName.endsWith('.exe') || 
              processName.endsWith('.dll') ||
              processName.endsWith('.sys') ||
              (/^[a-zA-Z][a-zA-Z0-9._-]{2,}$/.test(processName) && processName.length >= 3 && processName.length <= 50);
            
            if (!isValidProcessName) {
              // 한글이 포함된 경우는 허용하되, 최소 3자 이상
              if (!/[가-힣]/.test(processName) || processName.length < 3) return;
            }
            
            // 특수 문자만 있는 경우 제외
            if (/^[^a-zA-Z0-9가-힣._-]+$/.test(processName)) return;
            
            // 인코딩 변환 시도 (복구)
            processName = fixEncoding(processName);
            
            // 변환 후에도 유효성 재확인
            if (processName && processName.trim().length >= 3 && processName.trim().length <= 50) {
              // 다시 제외 단어 확인
              const lowerConverted = processName.toLowerCase();
              if (!excludedWords.includes(lowerConverted)) {
                processMap.set(processName, (processMap.get(processName) || 0) + 1);
              }
            }
          });
          
          if (processMap.size > 0) {
            const uniqueProcesses = Array.from(processMap.entries())
              .sort((a, b) => b[1] - a[1]) // 개수 순으로 정렬
              .map(([name, count], idx) => 
                count > 1 ? `${idx + 1}. ${name} (${count}개)` : `${idx + 1}. ${name}`
              );
            
            return `실행 중인 프로세스: ${processMap.size}개 (총 ${csvLines.length}개 인스턴스)\n\n${uniqueProcesses.join('\n')}`;
          }
        }
        
        // 일반 텍스트 형식 시도 (공백으로 구분)
        const textLines = rawResult.split('\n').filter(line => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.length < 3) return false;
          // 헤더 제외
          if (trimmed.includes('Image Name') || trimmed.includes('PID') || trimmed.includes('Session')) return false;
          if (trimmed.includes('=') || trimmed.startsWith('---')) return false;
          // 최소 길이 확인
          if (trimmed.length < 10) return false;
          return true;
        });
        
        if (textLines.length > 0) {
          const processMap = new Map<string, number>();
          textLines.forEach(line => {
            const parts = line.trim().split(/\s+/);
            let processName = parts[0] || '';
            
            // 유효한 프로세스 이름인지 엄격하게 확인
            if (!processName || processName.length < 3) return;
            
            // 일반적인 단어나 헤더 제외
            const excludedWords = ['the', 'minion', 'salt', 'run', 'name', 'pid', 'session', 'memory', 'usage', 'image', 'display'];
            const lowerName = processName.toLowerCase();
            if (excludedWords.includes(lowerName)) return;
            
            // 프로세스 이름은 보통 .exe로 끝나거나 특정 패턴을 가짐
            const isValidProcessName = 
              processName.endsWith('.exe') || 
              processName.endsWith('.dll') ||
              processName.endsWith('.sys') ||
              (/^[a-zA-Z][a-zA-Z0-9._-]{2,}$/.test(processName) && processName.length >= 3 && processName.length <= 50);
            
            if (!isValidProcessName) {
              // 한글이 포함된 경우는 허용하되, 최소 3자 이상
              if (!/[가-힣]/.test(processName) || processName.length < 3) return;
            }
            
            // 특수 문자만 있는 경우 제외
            if (/^[^a-zA-Z0-9가-힣._-]+$/.test(processName)) return;
            
            // 인코딩 변환 시도 (복구)
            processName = fixEncoding(processName);
            
            // 변환 후에도 유효성 재확인
            if (processName && processName.trim().length >= 3 && processName.trim().length <= 50) {
              // 다시 제외 단어 확인
              const lowerConverted = processName.toLowerCase();
              if (!excludedWords.includes(lowerConverted)) {
                processMap.set(processName, (processMap.get(processName) || 0) + 1);
              }
            }
          });
          
          if (processMap.size > 0) {
            const uniqueProcesses = Array.from(processMap.entries())
              .sort((a, b) => b[1] - a[1]) // 개수 순으로 정렬
              .map(([name, count], idx) => 
                count > 1 ? `${idx + 1}. ${name} (${count}개)` : `${idx + 1}. ${name}`
              );
            
            return `실행 중인 프로세스: ${processMap.size}개 (총 ${textLines.length}개 인스턴스)\n\n${uniqueProcesses.join('\n')}`;
          }
        }
      }

      // 메모리 사용량 결과 (PowerShell Get-CimInstance)
      if (command.includes('메모리') || command.includes('Memory') || command.includes('TotalVisibleMemorySize') || 
          (command.includes('systeminfo') && command.includes('Memory'))) {
        // PowerShell 출력 파싱
        const lines = cleanRawResult.split('\n').filter(line => line.trim().length > 0);
        if (lines.length > 0) {
          // 메모리 정보가 구조화되어 있으면 그대로 표시
          const memoryInfo = lines.filter(line => 
            line.includes('총 메모리') || 
            line.includes('사용 중') || 
            line.includes('사용 가능') || 
            line.includes('사용률') ||
            line.includes('Memory') ||
            line.includes('메모리')
          );
          if (memoryInfo.length > 0) {
            return `메모리 사용량:\n\n${memoryInfo.join('\n')}`;
          }
          // 구조화되지 않은 경우 전체 표시
          return `메모리 정보:\n\n${lines.join('\n')}`;
        }
      }
      
      // 네트워크 연결 결과 (netstat)
      if (command.includes('네트워크') || command.includes('netstat')) {
        const lines = cleanRawResult.split('\n').filter(line => {
          const trimmed = line.trim();
          // 빈 줄이나 헤더 제외
          if (!trimmed || trimmed.length < 10) return false;
          // Active Connections, Proto 같은 헤더 제외
          if (trimmed.includes('Active Connections') || trimmed.includes('Proto') || 
              trimmed.includes('Local Address') || trimmed.includes('Foreign Address') ||
              trimmed.startsWith('---')) return false;
          // TCP/UDP 연결 정보만 포함
          return (trimmed.startsWith('TCP') || trimmed.startsWith('UDP')) && 
                 (trimmed.includes('LISTENING') || trimmed.includes('ESTABLISHED') || 
                  trimmed.includes('TIME_WAIT') || trimmed.includes('CLOSE_WAIT') ||
                  trimmed.includes('SYN_SENT') || trimmed.includes('SYN_RECEIVED'));
        });
        
        if (lines.length > 0) {
          // 상태별로 그룹화
          const listening = lines.filter(l => l.includes('LISTENING'));
          const established = lines.filter(l => l.includes('ESTABLISHED'));
          const others = lines.filter(l => !l.includes('LISTENING') && !l.includes('ESTABLISHED'));
          
          let result = `네트워크 연결 상태:\n\n`;
          if (listening.length > 0) {
            result += `[LISTENING - ${listening.length}개]\n${listening.join('\n')}\n\n`;
          }
          if (established.length > 0) {
            result += `[ESTABLISHED - ${established.length}개]\n${established.join('\n')}\n\n`;
          }
          if (others.length > 0) {
            result += `[기타 - ${others.length}개]\n${others.join('\n')}`;
          }
          return result.trim();
        }
        
        // 필터링된 결과가 없으면 전체 표시
        const allLines = cleanRawResult.split('\n').filter(line => {
          const trimmed = line.trim();
          return trimmed && trimmed.length > 0 && 
                 !trimmed.includes('Active Connections') && 
                 !trimmed.includes('Proto');
        });
        if (allLines.length > 0) {
          return `네트워크 연결 상태:\n\n${allLines.join('\n')}`;
        }
      }

      // schedule 명령어 결과
      if (command.includes('schedule.')) {
        if (rawResult.includes('success') || rawResult.includes('성공') || rawResult.includes('완료')) {
          return '✅ 스케줄 작업이 성공적으로 처리되었습니다.';
        }
        if (rawResult.includes('list')) {
          const lines = rawResult.split('\n').filter(line => line.trim() && !line.includes('명령어 실행 결과'));
          if (lines.length > 0) {
            return `스케줄 작업 목록:\n\n${lines.join('\n')}`;
          }
        }
      }

      // 성공 메시지 - 실제 결과도 함께 표시
      if (rawResult.includes('성공') || rawResult.includes('success') || rawResult.includes('True')) {
        // 실제 결과 내용이 있으면 함께 표시
        const hasContent = cleanRawResult && cleanRawResult.length > 0 && 
                          !cleanRawResult.match(/^(성공|success|True|False|false)$/i);
        if (hasContent) {
          return `✅ 명령어가 성공적으로 실행되었습니다.\n\n실행 결과:\n${cleanRawResult}`;
        }
        return '✅ 명령어가 성공적으로 실행되었습니다.';
      }

      // 에러 메시지
      if (rawResult.includes('error') || rawResult.includes('Error') || rawResult.includes('실패')) {
        const errorMatch = rawResult.match(/(error|Error|실패|오류)[:\s]+([^\n]+)/i);
        if (errorMatch) {
          return `❌ 오류: ${errorMatch[2]}`;
        }
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
    if (!rawResult) {
      setSelectedCommandResult('아직 실행된 명령어가 없습니다.');
      setResultType('text');
      setParsedEventLogs([]);
    } else {
      // 명령어 실행 실패 에러인지 확인 (ERROR, Unable to run command 등)
      if (rawResult.includes('ERROR:') || rawResult.includes('Unable to run command') || 
          rawResult.includes('명령어 실행 실패') || rawResult.includes('네트워크 오류')) {
        // 명령어 실행 실패 - 에러 메시지로 표시
        setSelectedCommandResult(` 명령어 실행 실패\n\n${rawResult}`);
        setResultType('text');
        setParsedEventLogs([]);
        setShowResultModal(true);
        return;
      }
      
      // 이벤트 로그인 경우 구조화된 데이터로 파싱
      if (command.includes('Get-WinEvent') || command.includes('Get-EventLog') || 
          rawResult.includes('Event[') || rawResult.includes('LogName') || rawResult.includes('EventID')) {
        // JSON 배열 찾기 (여러 패턴 시도)
        let jsonMatch = rawResult.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          // 중괄호로 감싸진 배열도 시도
          jsonMatch = rawResult.match(/\{[\s\S]*"LogName"[\s\S]*\}/);
        }
        if (jsonMatch) {
          try {
            let jsonStr = jsonMatch[0];
            // 깨진 문자 정리
            jsonStr = jsonStr.replace(/\\u0027/g, "'").replace(/\\u0022/g, '"');
            const events = JSON.parse(jsonStr);
            if (Array.isArray(events) && events.length > 0) {
              setParsedEventLogs(events);
              setResultType('events');
              setSelectedCommandResult('');
              setShowResultModal(true);
              return;
            } else if (typeof events === 'object' && events.LogName) {
              // 단일 객체인 경우 배열로 변환
              setParsedEventLogs([events]);
              setResultType('events');
              setSelectedCommandResult('');
              setShowResultModal(true);
              return;
            }
          } catch (e) {
            console.error('이벤트 로그 JSON 파싱 실패:', e);
            // JSON 파싱 실패 시 텍스트로 표시
          }
        }
      }
      
      const parsedResult = parseProcessResult(rawResult, command);
      setSelectedCommandResult(parsedResult);
      setResultType('text');
      setParsedEventLogs([]);
    }
    setShowResultModal(true);
  };

  // 명령어 실행 - 백엔드 응답을 그대로 출력
  const handleExecuteCommand = async () => {
    if (!commandInput.trim()) {
      setError('명령어를 입력해주세요.')
      return
    }
    
    // 대상이 선택되지 않은 경우 경고 표시
    if (!selectedTarget) {
      setError('대상을 선택해주세요. 명령어는 선택된 대상에 실행됩니다.')
      return
    }
    
    setLoading(true)
    setExecutionResult('명령어 실행 중...')
    setError('')
    
    try {
      console.log('Salt 명령어 실행:', commandInput, '대상:', selectedTarget)
      const response = await saltApi.executeCommand(commandInput, [selectedTarget])
      console.log('Salt 명령어 실행 결과:', response)
      
      if (response.data) {
        // 백엔드에서 직접 stdout을 반환하는 경우
        if (response.data.stdout !== undefined || response.data.stderr !== undefined) {
          const output = response.data.stdout || response.data.stderr || '출력 없음'
          
          // 성공 여부는 stderr가 없고 stdout이 있으면 성공으로 판단
          const success = response.data.stdout && !response.data.stderr
          
          if (success) {
            setExecutionResult(`명령어 실행 결과:\n$ docker exec -i salt_master salt "${selectedTarget}" ${commandInput}\n\n${output}`)
          } else {
            setExecutionResult(`명령어 실행 결과:\n$ docker exec -i salt_master salt "${selectedTarget}" ${commandInput}\n\n${output}`)
          }
        }
        // 배열 형태로 반환하는 경우 (기존 방식)
        else if (Array.isArray(response.data) && response.data.length > 0) {
          const result = response.data[0].result
          const output = result.stdout || result.stderr || '출력 없음'
          
          if (result.success) {
            setExecutionResult(`명령어 실행 결과:\n$ docker exec -i salt_master salt "${selectedTarget}" ${commandInput}\n\n${output}`)
          } else {
            setExecutionResult(`명령어 실행 결과:\n$ docker exec -i salt_master salt "${selectedTarget}" ${commandInput}\n\n${output}`)
            if (result.error) {
              setError(`명령어 실행 실패: ${result.error}`)
            }
          }
        }
        else {
          setExecutionResult(`명령어 실행 결과:\n$ docker exec -i salt_master salt "${selectedTarget}" ${commandInput}\n\n명령어가 실행되었지만 출력이 없습니다.`)
        }
      }
    } catch (error: any) {
      console.error('Salt 명령어 실행 네트워크 오류:', error)
      setExecutionResult(`네트워크 오류:\n$ docker exec -i salt_master salt "${selectedTarget}" ${commandInput}\n\n오류: ${error.message}\n\n백엔드 서버(localhost:3001)가 실행 중인지 확인하세요.`)
      setError(`네트워크 오류: ${error.message}`)
    } finally {
      setLoading(false)
      fetchSystemLogs()
    }
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">프로세스 통제</h1>
          <p className="text-gray-600 mt-1">SaltStack을 통한 엔드포인트 프로세스 관리 (윈도우 환경)</p>
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
            onClick={fetchSaltKeys}
            disabled={loadingKeys}
            style={{ backgroundColor: loadingKeys ? undefined : '#10113C' }}
            className="flex items-center space-x-2 text-white px-4 py-2 rounded-lg hover:opacity-90 disabled:bg-gray-400 transition-opacity"
          >
            <Key className={`w-4 h-4 ${loadingKeys ? 'animate-spin' : ''}`} />
            <span>{loadingKeys ? '키 새로고침 중...' : '키 새로고침'}</span>
          </button>
          <button
            onClick={fetchTargets}
            disabled={refreshingTargets}
            style={{ backgroundColor: refreshingTargets ? undefined : '#0d4f2c' }}
            className="flex items-center space-x-2 text-white px-4 py-2 rounded-lg hover:opacity-90 disabled:bg-gray-400 transition-opacity"
          >
            <RefreshCw className={`w-4 h-4 ${refreshingTargets ? 'animate-spin' : ''}`} />
            <span>{refreshingTargets ? '새로고침 중...' : '대상 새로고침'}</span>
          </button>
        </div>
      </div>

      {/* 상세 로그 패널 */}
      {showLogs && (
        <div className="bg-gray-900 text-green-400 rounded-xl p-4">
          <h3 className="text-lg font-semibold mb-3 text-white">시스템 로그 (최근 20개)</h3>
          <div className="max-h-64 overflow-y-auto space-y-1 font-mono text-sm">
            {systemLogs.slice(0, 20).map((log, index) => (
              <div key={index} className={`${
                log.level === 'error' ? 'text-red-400' : 
                log.level === 'info' ? 'text-green-400' : 'text-yellow-400'
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
          </div>
        </div>
      )}

      {/* 1. Salt 컨테이너 상태 & SaltStack 키 관리 (반반 비율) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Salt 컨테이너 상태 (왼쪽 50%) - 간소화 */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Salt 컨테이너 상태</h2>
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${
                containerStats?.status.includes('running') ? 'bg-green-500' : 'bg-red-500'
              }`}></div>
              <span className={`text-sm font-medium ${
                containerStats?.status.includes('running') ? 'text-green-600' : 'text-red-600'
              }`}>
                {containerStats?.status || 'Unknown'}
              </span>
            </div>
          </div>

          {containerStats ? (
            <div className="space-y-6">
              {/* 실시간 리소스 사용량 */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                  <Cpu className="w-5 h-5 mr-2 text-blue-600" />
                  실시간 리소스 사용량
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">CPU:</span>
                    <span className="font-medium text-gray-900">{containerStats.resources.cpu}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">메모리:</span>
                    <span className="font-medium text-gray-900">{containerStats.resources.memory}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">네트워크 I/O:</span>
                    <span className="font-medium text-gray-900">{containerStats.resources.networkIO}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">디스크 I/O:</span>
                    <span className="font-medium text-gray-900">{containerStats.resources.diskIO}</span>
                  </div>
                </div>
              </div>

              {/* 포트 매핑 */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">포트 매핑</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-mono text-sm">4505/tcp</span>
                    <span className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-700">
                      연결 가능
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-600 mt-2">컨테이너 정보를 불러오는 중...</p>
            </div>
          )}
        </div>

        {/* SaltStack 키 관리 (오른쪽 50%) */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">SaltStack 키 관리</h2>
            {unacceptedKeys > 0 && (
              <div className="flex items-center space-x-1 bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">
                <AlertTriangle className="w-3 h-3" />
                <span className="text-xs font-medium">{unacceptedKeys}</span>
              </div>
            )}
          </div>

          {loadingKeys ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
              <p className="text-gray-600 mt-2">키 조회 중...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* 키 통계 */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">키 통계</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-green-700">{acceptedKeys}</p>
                    <p className="text-green-600 text-sm">승인됨</p>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-yellow-700">{unacceptedKeys}</p>
                    <p className="text-yellow-600 text-sm">미승인</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-red-700">{deniedKeys}</p>
                    <p className="text-red-600 text-sm">거부됨</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-gray-700">{rejectedKeys}</p>
                    <p className="text-gray-600 text-sm">제거됨</p>
                  </div>
                </div>
              </div>

              {/* 미승인 키 목록 */}
              {unacceptedKeys > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">승인 대기</h3>
                  <div className="border-2 border-yellow-200 rounded-lg p-4 bg-yellow-50">
                    <div className="space-y-3">
                      {saltKeys.filter(key => key.status === 'unaccepted').slice(0, 3).map((key, index) => (
                        <div key={index} className="bg-white border border-yellow-300 rounded p-3">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-sm text-gray-900 truncate">{key.id}</span>
                            <div className="flex space-x-2">
                              <button
                                onClick={() => acceptKey(key.id)}
                                disabled={keyActionLoading[key.id] === 'accept'}
                                className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 disabled:bg-gray-400"
                              >
                                {keyActionLoading[key.id] === 'accept' ? '...' : '수락'}
                              </button>
                              <button
                                onClick={() => rejectKey(key.id)}
                                disabled={keyActionLoading[key.id] === 'reject'}
                                className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700 disabled:bg-gray-400"
                              >
                                {keyActionLoading[key.id] === 'reject' ? '...' : '거부'}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {unacceptedKeys > 3 && (
                        <p className="text-sm text-gray-500 text-center">+{unacceptedKeys - 3}개 더...</p>
                      )}
                    </div>
                    {unacceptedKeys > 1 && (
                      <button
                        onClick={acceptAllKeys}
                        className="w-full mt-3 bg-green-600 text-white py-2 rounded hover:bg-green-700"
                      >
                        모두 수락
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* 키 목록 */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">키 목록</h3>
                
                {/* 승인된 키 */}
                {acceptedKeys > 0 && (
                  <div className="mb-4">
                    <h4 className="text-md font-medium text-green-700 mb-2">승인된 키 ({acceptedKeys}개)</h4>
                    <div className="border border-green-200 rounded-lg p-3 bg-green-50">
                      <div className="space-y-2">
                        {saltKeys.filter(key => key.status === 'accepted').slice(0, 3).map((key, index) => (
                          <div key={index} className="bg-white border border-green-300 rounded p-2">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-sm text-gray-900 truncate">{key.id}</span>
                              <div className="flex space-x-1">
                                <button
                                  onClick={() => rejectKey(key.id)}
                                  disabled={keyActionLoading[key.id] === 'reject'}
                                  className="bg-red-600 text-white px-2 py-1 rounded text-xs hover:bg-red-700 disabled:bg-gray-400"
                                >
                                  {keyActionLoading[key.id] === 'reject' ? '...' : '거부'}
                                </button>
                                <button
                                  onClick={() => deleteKey(key.id)}
                                  disabled={keyActionLoading[key.id] === 'delete'}
                                  className="bg-gray-600 text-white px-2 py-1 rounded text-xs hover:bg-gray-700 disabled:bg-gray-400"
                                >
                                  {keyActionLoading[key.id] === 'delete' ? '...' : '삭제'}
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                        {acceptedKeys > 3 && (
                          <p className="text-sm text-gray-500 text-center">+{acceptedKeys - 3}개 더...</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 거부된 키 */}
                {deniedKeys > 0 && (
                  <div className="mb-4">
                    <h4 className="text-md font-medium text-red-700 mb-2">거부된 키 ({deniedKeys}개)</h4>
                    <div className="border border-red-200 rounded-lg p-3 bg-red-50">
                      <div className="space-y-2">
                        {saltKeys.filter(key => key.status === 'denied').slice(0, 3).map((key, index) => (
                          <div key={index} className="bg-white border border-red-300 rounded p-2">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-sm text-gray-900 truncate">{key.id}</span>
                              <div className="flex space-x-1">
                                <button
                                  onClick={() => acceptKey(key.id)}
                                  disabled={keyActionLoading[key.id] === 'accept'}
                                  className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700 disabled:bg-gray-400"
                                >
                                  {keyActionLoading[key.id] === 'accept' ? '...' : '수락'}
                                </button>
                                <button
                                  onClick={() => deleteKey(key.id)}
                                  disabled={keyActionLoading[key.id] === 'delete'}
                                  className="bg-gray-600 text-white px-2 py-1 rounded text-xs hover:bg-gray-700 disabled:bg-gray-400"
                                >
                                  {keyActionLoading[key.id] === 'delete' ? '...' : '삭제'}
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                        {deniedKeys > 3 && (
                          <p className="text-sm text-gray-500 text-center">+{deniedKeys - 3}개 더...</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 제거된 키 */}
                {rejectedKeys > 0 && (
                  <div className="mb-4">
                    <h4 className="text-md font-medium text-gray-700 mb-2">제거된 키 ({rejectedKeys}개)</h4>
                    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                      <div className="space-y-2">
                        {saltKeys.filter(key => key.status === 'rejected').slice(0, 3).map((key, index) => (
                          <div key={index} className="bg-white border border-gray-300 rounded p-2">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-sm text-gray-900 truncate">{key.id}</span>
                              <div className="flex space-x-1">
                                <button
                                  onClick={() => acceptKey(key.id)}
                                  disabled={keyActionLoading[key.id] === 'accept'}
                                  className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700 disabled:bg-gray-400"
                                >
                                  {keyActionLoading[key.id] === 'accept' ? '...' : '수락'}
                                </button>
                                <button
                                  onClick={() => deleteKey(key.id)}
                                  disabled={keyActionLoading[key.id] === 'delete'}
                                  className="bg-gray-600 text-white px-2 py-1 rounded text-xs hover:bg-gray-700 disabled:bg-gray-400"
                                >
                                  {keyActionLoading[key.id] === 'delete' ? '...' : '삭제'}
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                        {rejectedKeys > 3 && (
                          <p className="text-sm text-gray-500 text-center">+{rejectedKeys - 3}개 더...</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {saltKeys.length === 0 && (
                <div className="text-center py-8">
                  <Key className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-500">등록된 키가 없습니다</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 2. 관리 대상 현황 */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">관리 대상 현황</h2>
          <button
            onClick={pingAllTargets}
            style={{ backgroundColor: '#10113C' }}
            className="flex items-center space-x-2 text-white px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
          >
            <Wifi className="w-4 h-4" />
            <span>전체 핑 테스트</span>
          </button>
        </div>
        
        <div className="flex items-center space-x-4 mb-4">
          <div className="flex items-center space-x-2">
            <Users className="w-6 h-6 text-green-600" />
            <span className="text-2xl font-bold text-gray-900">{onlineTargets}</span>
            <span className="text-gray-600">/ {totalTargets}</span>
            <span className="text-gray-600">온라인</span>
          </div>
          <div className={`flex items-center space-x-1 px-3 py-1 rounded-full ${
            onlineTargets === totalTargets ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
          }`}>
            {onlineTargets === totalTargets ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <Clock className="w-4 h-4" />
            )}
            <span className="text-sm font-medium">
              {onlineTargets === totalTargets ? '모든 대상 연결됨' : '일부 대상 오프라인'}
            </span>
          </div>
        </div>

        {/* 대상 목록 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {targets.map((target, index) => (
            <button
              key={target.id || index}
              onClick={() => setSelectedTarget(target.id)}
              className={`text-left p-4 border rounded-lg transition-colors ${
                selectedTarget === target.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-3">
                  <div className={`w-3 h-3 rounded-full ${
                    target.status === 'online' ? 'bg-green-500' : 'bg-red-500'
                  }`}></div>
                  <div>
                    <h3 className="font-medium text-gray-900">{target.name}</h3>
                    <p className="text-sm text-gray-500">{target.ip}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end space-y-1">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    target.status === 'online' 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {target.status}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      pingTarget(target.id)
                    }}
                    disabled={pingLoading[target.id]}
                    style={{ backgroundColor: pingLoading[target.id] ? undefined : '#10113C' }}
                    className="flex items-center space-x-1 text-white px-2 py-1 rounded text-xs hover:opacity-90 disabled:bg-gray-400 transition-opacity"
                  >
                    {pingLoading[target.id] ? (
                      <div className="animate-spin rounded-full h-3 w-3 border-b border-white"></div>
                    ) : (
                      <Wifi className="w-3 h-3" />
                    )}
                    <span>핑</span>
                  </button>
                  {pingResults[target.id] !== undefined && (
                    <div className={`flex items-center space-x-1 px-2 py-1 rounded text-xs ${
                      pingResults[target.id] ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {pingResults[target.id] ? (
                        <CheckCircle className="w-3 h-3" />
                      ) : (
                        <X className="w-3 h-3" />
                      )}
                      <span>{pingResults[target.id] ? '성공' : '실패'}</span>
                    </div>
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-600">{target.os}</p>
              {target.containerInfo && (
                <p className="text-xs text-blue-600 mt-1">
                  컨테이너: {target.containerInfo.name}
                </p>
              )}
            </button>
          ))}
        </div>
        
        {targets.length === 0 && !refreshingTargets && (
          <div className="text-center py-8">
            <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-2" />
            <p className="text-gray-600">관리 대상을 불러올 수 없습니다</p>
            <p className="text-sm text-gray-500">SaltStack 컨테이너 상태를 확인하고 다시 시도하세요</p>
          </div>
        )}
        
        {refreshingTargets && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
            <p className="text-gray-600 mt-2">관리 대상을 조회하는 중...</p>
          </div>
        )}
      </div>

      {/* 스케줄 관리 */}
      {selectedTarget && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">스케줄 관리</h2>
            <div className="flex items-center space-x-2">
              <Calendar className="w-5 h-5 text-purple-600" />
              <span className="text-lg font-bold text-gray-900">{scheduleJobs.length}</span>
              <span className="text-gray-600">개 작업</span>
            </div>
          </div>

          {/* 블랙리스트/화이트리스트 버튼 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <button
              onClick={() => setShowBlacklistModal(true)}
              className="flex items-center justify-center space-x-3 bg-red-600 text-white p-4 rounded-lg hover:bg-red-700 transition-colors"
            >
              <UserX className="w-6 h-6" />
              <div className="text-left">
                <h3 className="font-semibold">프로세스 블랙리스트</h3>
                <p className="text-sm opacity-90">특정 프로세스를 자동으로 차단합니다</p>
              </div>
            </button>
            
            <button
              onClick={() => setShowWhitelistModal(true)}
              className="flex items-center justify-center space-x-3 bg-[#0d4f2c] text-white p-4 rounded-lg hover:bg-[#0d4f2c]/90 transition-colors"
            >
              <UserCheck className="w-6 h-6" />
              <div className="text-left">
                <h3 className="font-semibold">프로세스 화이트리스트</h3>
                <p className="text-sm opacity-90">허용된 프로세스만 실행되도록 설정합니다</p>
              </div>
            </button>
          </div>

          {/* 스케줄 작업 목록 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {scheduleJobs.map((job, index) => (
              <div key={index} className="border rounded-lg p-4 bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-gray-900">{job.name}</h3>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    job.enabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {job.enabled ? '활성' : '비활성'}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-3">{job.function}</p>
                <div className="flex space-x-1">
                  <button
                    onClick={() => executeScheduleCommand(`schedule.run_job ${job.name}`, selectedTarget)}
                    className="bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700"
                  >
                    <SkipForward className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => executeScheduleCommand(`schedule.${job.enabled ? 'disable' : 'enable'}_job ${job.name}`, selectedTarget)}
                    className="bg-yellow-600 text-white px-2 py-1 rounded text-xs hover:bg-yellow-700"
                  >
                    {job.enabled ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  </button>
                  <button
                    onClick={() => executeScheduleCommand(`schedule.delete ${job.name}`, selectedTarget)}
                    className="bg-red-600 text-white px-2 py-1 rounded text-xs hover:bg-red-700"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>

        </div>
      )}

      {/* 명령어 목록 */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">명령어 목록 (윈도우 환경)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {processCommands.map((command, index) => (
            <div
              key={index}
              className="text-left p-3 border rounded-lg hover:bg-gray-50 hover:border-blue-300 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-900">{command.name}</h3>
                <Monitor className="w-4 h-4 text-gray-400" />
              </div>
              <p className="text-xs text-gray-600 mb-3">{command.description}</p>
              <div className="flex items-center space-x-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleExecuteCommandDirect(command.command);
                  }}
                  disabled={!selectedTarget || loading}
                  className="flex items-center space-x-1 bg-[#10113C] text-white px-3 py-1.5 rounded text-xs hover:bg-[#10113C]/90 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  <Play className="w-3 h-3" />
                  <span>실행</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleShowResult(command.command);
                  }}
                  disabled={!commandResults[command.command]}
                  className="flex items-center space-x-1 bg-gray-600 text-white px-3 py-1.5 rounded text-xs hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  <Eye className="w-3 h-3" />
                  <span>결과</span>
                </button>
              </div>
            </div>
          ))}
        </div>
          </div>

          {/* 스케줄 명령어 목록 */}
      {selectedTarget && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">스케줄 관리 명령어</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            {scheduleCommands.map((command, index) => (
              <div
                key={index}
                className="text-left p-3 border rounded-lg hover:bg-gray-50 hover:border-purple-300 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-900">{command.name}</h3>
                  <Calendar className="w-4 h-4 text-purple-400" />
                </div>
                <p className="text-xs text-gray-600 mb-3">{command.description}</p>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExecuteCommandDirect(command.command);
                    }}
                    disabled={!selectedTarget || loading}
                    className="flex items-center space-x-1 bg-[#10113C] text-white px-3 py-1.5 rounded text-xs hover:bg-[#10113C]/90 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  >
                    <Play className="w-3 h-3" />
                    <span>실행</span>
              </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleShowResult(command.command);
                    }}
                    disabled={!commandResults[command.command]}
                    className="flex items-center space-x-1 bg-gray-600 text-white px-3 py-1.5 rounded text-xs hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  >
                    <Eye className="w-3 h-3" />
                    <span>결과</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
              {resultType === 'events' && parsedEventLogs.length > 0 ? (
                <div className="space-y-4">
                  <div className="text-sm text-gray-600 mb-4">
                    총 {parsedEventLogs.length}개의 이벤트
                  </div>
                  {parsedEventLogs.map((event: any, idx: number) => {
                    const formatField = (value: any): string => {
                      if (value === null || value === undefined) return '';
                      if (typeof value === 'object' && value.Value) return value.Value;
                      if (typeof value === 'object' && value.getTime) {
                        return new Date(value).toLocaleString('ko-KR');
                      }
                      const str = String(value);
                      const dateMatch = str.match(/W\/Date\((\d+)\)/);
                      if (dateMatch) {
                        return new Date(parseInt(dateMatch[1])).toLocaleString('ko-KR');
                      }
                      return str;
                    };
                    
                    const formatDate = (dateValue: any): string => {
                      if (!dateValue) return 'N/A';
                      if (dateValue instanceof Date) {
                        return dateValue.toLocaleString('ko-KR');
                      }
                      const dateMatch = String(dateValue).match(/W\/Date\((\d+)\)/);
                      if (dateMatch) {
                        return new Date(parseInt(dateMatch[1])).toLocaleString('ko-KR');
                      }
                      if (typeof dateValue === 'string' && dateValue.includes('T')) {
                        try {
                          return new Date(dateValue).toLocaleString('ko-KR');
                        } catch (e) {
                          return dateValue;
                        }
                      }
                      return String(dateValue);
                    };
                    
                    const logName = formatField(event.LogName || event['Log Name']) || 'System';
                    const source = formatField(event.Source) || 'N/A';
                    const date = formatDate(event.Date || event.TimeCreated);
                    const eventId = formatField(event.EventID || event['Event ID']) || 'N/A';
                    const level = formatField(event.Level || event.LevelDisplayName) || 'N/A';
                    const description = formatField(event.Description || event.Message) || 'N/A';
                    const task = formatField(event.Task || event.TaskDisplayName);
                    const opcode = formatField(event.Opcode || event.OpcodeDisplayName);
                    const keyword = formatField(event.Keyword);
                    const user = formatField(event.User || event.UserId);
                    const userName = formatField(event.UserName || event['User Name']);
                    const computer = formatField(event.Computer || event.MachineName) || 'N/A';
                    
                    const getLevelColor = (level: string) => {
                      const lower = level.toLowerCase();
                      if (lower.includes('error') || lower.includes('오류')) return 'bg-red-50 border-red-200';
                      if (lower.includes('warning') || lower.includes('경고')) return 'bg-yellow-50 border-yellow-200';
                      if (lower.includes('정보') || lower.includes('information')) return 'bg-blue-50 border-blue-200';
                      return 'bg-gray-50 border-gray-200';
                    };
                    
                    return (
                      <div key={idx} className={`border rounded-lg p-4 ${getLevelColor(level)} transition-all hover:shadow-md`}>
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-2">
                              <span className="text-xs font-semibold text-gray-500">이벤트 #{idx + 1}</span>
                              <span className="text-xs px-2 py-1 rounded bg-white border border-gray-300 text-gray-700">
                                ID: {eventId}
                              </span>
                              {level && level !== 'N/A' && (
                                <span className="text-xs px-2 py-1 rounded bg-white border border-gray-300 text-gray-700">
                                  {level}
                                </span>
                              )}
                            </div>
                            <h4 className="font-semibold text-gray-900 mb-1">{source}</h4>
                            <p className="text-xs text-gray-500">{date}</p>
                          </div>
                        </div>
                        
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                            <div>
                              <span className="text-gray-600">로그:</span>
                              <span className="ml-2 text-gray-900">{logName}</span>
                            </div>
                            {task && (
                              <div>
                                <span className="text-gray-600">작업:</span>
                                <span className="ml-2 text-gray-900">{task}</span>
                              </div>
                            )}
                            {opcode && (
                              <div>
                                <span className="text-gray-600">Opcode:</span>
                                <span className="ml-2 text-gray-900">{opcode}</span>
                              </div>
                            )}
                            {keyword && (
                              <div>
                                <span className="text-gray-600">키워드:</span>
                                <span className="ml-2 text-gray-900">{keyword}</span>
                              </div>
                            )}
                            {user && (
                              <div>
                                <span className="text-gray-600">사용자:</span>
                                <span className="ml-2 text-gray-900">
                                  {user}
                                  {userName && ` (${userName})`}
                                </span>
                              </div>
                            )}
                            <div>
                              <span className="text-gray-600">컴퓨터:</span>
                              <span className="ml-2 text-gray-900">{computer}</span>
                            </div>
                          </div>
                          
                          {description && description !== 'N/A' && (
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <div className="text-xs text-gray-600 mb-1">설명:</div>
                              <div className="text-sm text-gray-800 bg-white p-3 rounded border border-gray-200">
                                {description}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-gray-800 text-sm leading-relaxed whitespace-pre-wrap break-words font-mono">
                  {selectedCommandResult ? (
                    <div className="space-y-2">
                      {selectedCommandResult.split('\n').map((line, idx) => {
                        // 에러 메시지 강조
                        if (line.includes('오류') || line.includes('ERROR') || line.includes('Error')) {
                          return (
                            <div key={idx} className="bg-red-50 border-l-4 border-red-500 p-3 rounded">
                              <div className="flex items-start">
                                <span className="text-red-600 font-semibold mr-2">❌</span>
                                <span className="text-red-800">{line}</span>
                              </div>
                            </div>
                          );
                        }
                        // 성공 메시지 강조
                        if (line.includes('✅') || line.includes('성공') || line.includes('success')) {
                          return (
                            <div key={idx} className="bg-green-50 border-l-4 border-green-500 p-3 rounded">
                              <span className="text-green-800">{line}</span>
                            </div>
                          );
                        }
                        // 구분선 스타일링
                        if (line.includes('━━') || line.includes('===') || line.includes('---')) {
                          return (
                            <div key={idx} className="border-t border-gray-300 my-2"></div>
                          );
                        }
                        // 헤더 스타일링
                        if (line.includes('이벤트 로그:') || line.includes('네트워크 연결') || 
                            line.includes('메모리 사용량') || line.includes('실행 중인 프로세스')) {
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

      {/* 명령어 실행 */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">명령어 실행</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              대상 선택
            </label>
            <select
              value={selectedTarget}
              onChange={(e) => setSelectedTarget(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">대상을 선택하세요</option>
              {targets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.name} ({target.ip}) - {target.status}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              SaltStack 명령어 입력
            </label>
            <div className="flex space-x-2">
              <textarea
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                rows={3}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm resize-none"
                placeholder={`Salt 명령어를 입력하거나 위 목록에서 선택하세요 (예: test.ping)${selectedTarget ? ` - ${selectedTarget}에 실행됩니다` : ''}`}
              />
              <button
                onClick={handleExecuteCommand}
                disabled={!commandInput.trim() || !selectedTarget || loading}
                style={{ backgroundColor: (!commandInput.trim() || !selectedTarget || loading) ? undefined : '#10113C' }}
                className="flex items-center space-x-2 text-white px-4 py-2 rounded-lg hover:opacity-90 disabled:bg-gray-300 disabled:cursor-not-allowed transition-opacity self-start"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  <Play className="w-4 h-4" />
                )}
                <span>{loading ? '실행 중...' : '실행'}</span>
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {selectedTarget 
                ? `docker exec -i salt_master salt "${selectedTarget}" 명령어 형태로 실행됩니다.` 
                : '대상을 선택하면 명령어가 해당 대상에 실행됩니다.'
              }
            </p>
          </div>

          {executionResult && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                실행 결과
              </label>
              <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm whitespace-pre-wrap max-h-96 overflow-y-auto">
                {executionResult}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 스케줄 생성 모달 */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">스케줄 작업 생성</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">작업 이름</label>
                <input
                  type="text"
                  value={newSchedule.name}
                  onChange={(e) => setNewSchedule(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="예: kill_notepad"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">명령어</label>
                <textarea
                  value={newSchedule.command}
                  onChange={(e) => setNewSchedule(prev => ({ ...prev, command: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  placeholder="예: cmd.run 'taskkill /F /IM notepad.exe'"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">실행 주기 (초)</label>
                <input
                  type="number"
                  value={newSchedule.seconds}
                  onChange={(e) => setNewSchedule(prev => ({ ...prev, seconds: parseInt(e.target.value) || 60 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="1"
                />
              </div>
            </div>
            
            <div className="flex space-x-2 mt-6">
              <button
                onClick={createSchedule}
                disabled={loading || !newSchedule.name || !newSchedule.command}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
              >
                {loading ? '생성 중...' : '생성'}
              </button>
              <button
                onClick={() => setShowScheduleModal(false)}
                className="flex-1 bg-gray-600 text-white py-2 rounded-lg hover:bg-gray-700"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 블랙리스트 생성 모달 */}
      {showBlacklistModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <UserX className="w-5 h-5 mr-2 text-red-600" />
              프로세스 블랙리스트 생성
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">차단할 프로세스명</label>
                <input
                  type="text"
                  value={blacklistProcess}
                  onChange={(e) => setBlacklistProcess(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="예: notepad, chrome, calculator"
                />
                <p className="text-xs text-gray-500 mt-1">
                  입력한 프로세스명과 일치하는 모든 프로세스가 30초마다 자동으로 종료됩니다.
                </p>
              </div>
              
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <h4 className="text-sm font-medium text-red-800 mb-2">주의사항</h4>
                <ul className="text-xs text-red-700 space-y-1">
                  <li>• 시스템 프로세스는 자동으로 제외됩니다</li>
                  <li>• 블랙리스트는 30초 주기로 실행됩니다</li>
                  <li>• 스케줄 관리에서 비활성화할 수 있습니다</li>
                </ul>
              </div>
            </div>
            
            <div className="flex space-x-2 mt-6">
              <button
                onClick={createBlacklist}
                disabled={isCreatingBlacklist || !blacklistProcess.trim() || !selectedTarget}
                className="flex-1 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 disabled:bg-gray-400"
              >
                {isCreatingBlacklist ? '생성 중...' : '블랙리스트 생성'}
              </button>
              <button
                onClick={() => setShowBlacklistModal(false)}
                className="flex-1 bg-gray-600 text-white py-2 rounded-lg hover:bg-gray-700"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 화이트리스트 생성 모달 */}
      {showWhitelistModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <UserCheck className="w-5 h-5 mr-2 text-green-600" />
              프로세스 화이트리스트 생성
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">대상 선택</label>
                <select
                  value={whitelistTarget}
                  onChange={(e) => setWhitelistTarget(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">대상을 선택하세요</option>
                  {targets.map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.name} ({target.ip})
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <h4 className="text-sm font-medium text-green-800 mb-2">화이트리스트 생성 과정</h4>
                <ul className="text-xs text-green-700 space-y-1">
                  <li>• 현재 실행 중인 모든 프로세스를 수집합니다</li>
                  <li>• 허용된 프로세스 목록을 생성합니다</li>
                  <li>• 미승인 프로세스 종료 스크립트를 배포합니다</li>
                  <li>• 60초 주기로 자동 실행되는 스케줄을 생성합니다</li>
                  <li>• 시스템 필수 프로세스는 자동으로 보호됩니다</li>
                </ul>
              </div>
              
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <h4 className="text-sm font-medium text-yellow-800 mb-2">⚠️ 주의사항</h4>
                <p className="text-xs text-yellow-700">
                  화이트리스트 생성 후 허용되지 않은 모든 프로세스가 자동으로 종료됩니다. 
                  필요한 프로세스가 실행 중인 상태에서 진행하세요.
                </p>
              </div>
            </div>
            
            <div className="flex space-x-2 mt-6">
              <button
                onClick={createWhitelist}
                disabled={isCreatingWhitelist || !whitelistTarget}
                className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400"
              >
                {isCreatingWhitelist ? '생성 중...' : '화이트리스트 생성'}
              </button>
              <button
                onClick={() => setShowWhitelistModal(false)}
                className="flex-1 bg-gray-600 text-white py-2 rounded-lg hover:bg-gray-700"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ProcessControl