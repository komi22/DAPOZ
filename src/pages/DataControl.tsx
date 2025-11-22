import React, { useState, useEffect } from 'react'
import {Play, RefreshCw, Server, FileText, AlertCircle, CheckCircle, Clock, Wifi, Users, Command, Copy, Shield, Eye, File, Search, AlertTriangle} from 'lucide-react'
import { saltApi } from '../utils/api'

interface ScanResult {
  host: string
  files: string[]
  status: 'success' | 'error' | 'scanning'
  error?: string
  timestamp: string
  scanType?: 'basic' | 'sensitive'
  scanScope?: 'basic' | 'deep'
  sensitiveMatches?: Array<{
    file: string
    matches: number
    details: Array<{
      line: number
      text: string
    }>
  }>
}

const DataControl: React.FC = () => {
  const [targets, setTargets] = useState<any[]>([])
  const [selectedTarget, setSelectedTarget] = useState<string>('')
  const [scanResults, setScanResults] = useState<ScanResult[]>([])
  const [isScanning, setIsScanning] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshingTargets, setRefreshingTargets] = useState(false)
  const [error, setError] = useState<string>('')
  const [lastUpdate, setLastUpdate] = useState<string>('')
  const [pingResults, setPingResults] = useState<Record<string, boolean>>({})
  const [pingLoading, setPingLoading] = useState<Record<string, boolean>>({})
  const [scanScope, setScanScope] = useState<'basic' | 'deep'>('basic')

  useEffect(() => {
    fetchTargets()
    
    // 30초마다 자동 업데이트
    const interval = setInterval(() => {
      fetchTargets()
    }, 30000)
    
    return () => clearInterval(interval)
  }, [])

  // SaltStack 대상 목록 조회
  const fetchTargets = async () => {
    setRefreshingTargets(true)
    setError('')
    try {
      console.log('SaltStack 대상 목록 조회 시작...')
      const response = await saltApi.getTargets()
      console.log('대상 목록 응답:', response)
      
      // 안전한 데이터 처리
      const targetsData = response.data?.data || response.data || []
      setTargets(Array.isArray(targetsData) ? targetsData : [])
      setLastUpdate(new Date().toLocaleString('ko-KR'))
      
      // 첫 번째 온라인 호스트를 자동 선택
      const onlineTargets = targetsData.filter((target: any) => target.status === 'online')
      if (onlineTargets.length > 0 && !selectedTarget) {
        setSelectedTarget(onlineTargets[0].id)
      }
      
      console.log('대상 목록 업데이트 완료:', targetsData)
    } catch (error: any) {
      console.error('대상 목록 조회 실패:', error)
      const errorMessage = error.response?.data?.error || error.message || '알 수 없는 오류'
      setError(`대상 조회 오류: ${errorMessage}`)
      setTargets([])
    } finally {
      setRefreshingTargets(false)
      setLoading(false)
    }
  }

  // 핑 테스트
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
          const success = output.includes('True') || output.includes('true')
          setPingResults(prev => ({ ...prev, [target]: success }))
        }
        // 배열 형태로 반환하는 경우 (기존 방식)
        else if (Array.isArray(response.data) && response.data.length > 0) {
          const result = response.data[0].result
          const output = result.stdout || result.stderr || ''
          const success = result.success && output && (output.includes('True') || output.includes('true'))
          setPingResults(prev => ({ ...prev, [target]: success }))
        }
        else {
          setPingResults(prev => ({ ...prev, [target]: false }))
        }
      }
    } catch (error: any) {
      console.error('핑 테스트 실패:', error)
      setPingResults(prev => ({ ...prev, [target]: false }))
      setError(`핑 테스트 실패: ${error.response?.data?.error || error.message}`)
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
    } catch (error: any) {
      console.error('전체 핑 테스트 실패:', error)
      setError(`전체 핑 테스트 실패: ${error.response?.data?.error || error.message}`)
    }
  }

  // 기본 PowerShell 명령어 실행
  const executeBasicScan = async () => {
    if (!selectedTarget) {
      alert('스캔할 호스트를 선택해주세요.')
      return
    }

    setIsScanning(true)
    
    // 스캔 시작 상태로 결과 추가
    const newScanResult: ScanResult = {
      host: selectedTarget,
      files: [],
      status: 'scanning',
      timestamp: new Date().toLocaleString('ko-KR'),
      scanType: 'basic'
    }
    
    setScanResults(prev => [newScanResult, ...prev])

    try {
      const command = `cmd.run 'powershell -Command "Get-ChildItem -Path C:\\Users -Recurse -File -Force | Where-Object { @('.txt','.pdf','.doc','.docx','.ppt','.pptx','.xls','.xlsx','.csv','.hwp','.rtf') -contains $_.Extension.ToLower() } | Select-Object -ExpandProperty FullName"'`
      const response = await saltApi.executeCommand(command, [selectedTarget])

      if (response.data) {
        let files: string[] = []
        let success = false
        let errorMessage = ''

        // 백엔드에서 직접 stdout을 반환하는 경우
        if (response.data.stdout !== undefined) {
          const output = response.data.stdout || ''
          files = output ? output.split('\n').filter((line: string) => line.trim()) : []
          success = !response.data.stderr
          errorMessage = response.data.stderr || ''
        }
        // 배열 형태로 반환하는 경우 (기존 방식)
        else if (Array.isArray(response.data) && response.data.length > 0) {
          const result = response.data[0].result
          const output = result.stdout || ''
          files = output ? output.split('\n').filter((line: string) => line.trim()) : []
          success = result.success
          errorMessage = result.error || result.stderr || ''
        }
        
        setScanResults(prev => prev.map((result, index) => 
          index === 0 ? {
            ...result,
            files: files,
            status: success ? 'success' : 'error',
            error: success ? undefined : errorMessage || '스캔 실행 중 오류가 발생했습니다.'
          } : result
        ))
      } else {
        setScanResults(prev => prev.map((result, index) => 
          index === 0 ? {
            ...result,
            status: 'error',
            error: '응답 데이터가 없습니다.'
          } : result
        ))
      }
    } catch (error: any) {
      setScanResults(prev => prev.map((result, index) => 
        index === 0 ? {
          ...result,
          status: 'error',
          error: `네트워크 오류가 발생했습니다: ${error.message}`
        } : result
      ))
    } finally {
      setIsScanning(false)
    }
  }

  // 민감 정보 스캔 실행 (파일 내용 기반) - 탐색 범위별 처리
  const executeSensitiveScan = async () => {
    if (!selectedTarget) {
      alert('스캔할 호스트를 선택해주세요.')
      return
    }

    setIsScanning(true)
    
    // 스캔 시작 상태로 결과 추가
    const newScanResult: ScanResult = {
      host: selectedTarget,
      files: [],
      status: 'scanning',
      timestamp: new Date().toLocaleString('ko-KR'),
      scanType: 'sensitive',
      scanScope: scanScope,
      sensitiveMatches: []
    }
    
    setScanResults(prev => [newScanResult, ...prev])

    try {
      // PowerShell 스크립트 (Tika + Get-Content 혼합 사용)
      const basicScanScript = `
        $ErrorActionPreference = 'SilentlyContinue';
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8;

        function Get-FileText {
          param([string]$Path)

          # 파일 확장자
          $ext = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()

          # 1) 순수 텍스트 계열은 먼저 Get-Content로 시도
          if ($ext -in @('.txt', '.csv', '.log', '.ini', '.cfg')) {
            try {
              $content = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 -ErrorAction Stop
              if ($content) {
                return $content
              }
            } catch {
              # 실패하면 Tika로 넘어감
            }
          }

          # 2) Tika 사용 (pdf/doc/xls/ppt 등)
          try {
            $tikaOutput = & java -jar 'C:\\tika-app-3.2.3\\tika-app-3.2.3.jar' -t $Path 2>$null
            if ($LASTEXITCODE -eq 0 -and $tikaOutput) {
              return $tikaOutput -join [Environment]::NewLine
            }
          } catch {
            # Tika 실패 시 마지막 단계로 넘어감
          }

          # 3) 최후 수단: 바이트를 읽어서 UTF8로 디코딩
          try {
            $bytes = [System.IO.File]::ReadAllBytes($Path)
            if ($bytes.Length -gt 0) {
              return [System.Text.Encoding]::UTF8.GetString($bytes)
            }
          } catch {
          }

          return $null
        }

        Write-Host '=== Starting sensitive scan ===';
        [Console]::Out.Flush();
        
        $patterns = @('주소', '전화번호', '이메일', '비밀번호', '계좌번호', '주민번호', '카드번호', 'password', 'email', 'phone', 'address', 'account', '\d{6}-\d{7}', '/^0\d{1,2}-?\d{3,4}-?\d{4}$/', '^([a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6})*$', '/[가-힣 1-9\-]+/g');
        $folders = @('Desktop', 'Downloads', 'Documents', 'Pictures');
        $extensions = @('*.txt', '*.pdf', '*.doc', '*.docx', '*.ppt', '*.pptx', '*.xls', '*.xlsx', '*.csv', '*.hwp', '*.rtf');
        $fileCount = 0;
        $matchCount = 0;
        
        Get-ChildItem 'C:\\Users\\*' -Directory | ForEach-Object {
          $userPath = $_.FullName;
          
          foreach ($folder in $folders) {
            $folderPath = Join-Path $userPath $folder;
            if (Test-Path $folderPath) {
              Get-ChildItem -Path $folderPath -Include $extensions -File -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {
                $file = $_.FullName;
                $fileCount++;
                
                try {
                  $content = Get-FileText $file;
                  if ($content) {
                    $foundMatch = $false;
                    foreach ($pattern in $patterns) {
                      if ($content -match $pattern) {
                        if (-not $foundMatch) {
                          Write-Host "SENSITIVE_FILE: $file";
                          [Console]::Out.Flush();
                          $foundMatch = $true;
                          $matchCount++;
                        }
                        
                        $lines = $content -split [Environment]::NewLine;
                        for ($i = 0; $i -lt $lines.Count; $i++) {
                          if ($lines[$i] -match $pattern) {
                            $text = $lines[$i].Trim();
                            if ($text.Length -gt 100) { 
                              $text = $text.Substring(0, 100) + '...'; 
                            }
                            Write-Host "LINE_$($i+1): $text";
                            [Console]::Out.Flush();
                          }
                        }
                      }
                    }
                    
                    if ($foundMatch) {
                      Write-Host '---';
                      [Console]::Out.Flush();
                    }
                  }
                } catch {
                  # 에러는 무시하고 계속 진행
                }
              }
            }
          }
        }
        
        Write-Host "=== Scan completed: $fileCount files scanned, $matchCount files with matches ===";
        [Console]::Out.Flush();
      `.trim()

      const deepScanScript = `
        $ErrorActionPreference = 'SilentlyContinue';
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8;

        function Get-FileText {
          param([string]$Path)

          $ext = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()

          if ($ext -in @('.txt', '.csv', '.log', '.ini', '.cfg')) {
            try {
              $content = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 -ErrorAction Stop
              if ($content) {
                return $content
              }
            } catch {
            }
          }

          try {
            $tikaOutput = & java -jar 'C:\\tika-app-3.2.3\\tika-app-3.2.3.jar' -t $Path 2>$null
            if ($LASTEXITCODE -eq 0 -and $tikaOutput) {
              return $tikaOutput -join [Environment]::NewLine
            }
          } catch {
          }

          try {
            $bytes = [System.IO.File]::ReadAllBytes($Path)
            if ($bytes.Length -gt 0) {
              return [System.Text.Encoding]::UTF8.GetString($bytes)
            }
          } catch {
          }

          return $null
        }

        Write-Host '=== Starting deep sensitive scan ===';
        [Console]::Out.Flush();
        
        $patterns = @('주소', '전화번호', '이메일', '비밀번호', '계좌번호', '주민번호', '카드번호', 'password', 'email', 'phone', 'address', 'account');
        $extensions = @('*.txt', '*.pdf', '*.doc', '*.docx', '*.ppt', '*.pptx', '*.xls', '*.xlsx', '*.csv', '*.hwp', '*.rtf');
        $fileCount = 0;
        $matchCount = 0;
        
        Get-ChildItem -Path 'C:\\Users' -Include $extensions -File -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {
          $file = $_.FullName;
          $fileCount++;
          
          try {
            $content = Get-FileText $file;
            if ($content) {
              $foundMatch = $false;
              foreach ($pattern in $patterns) {
                if ($content -match $pattern) {
                  if (-not $foundMatch) {
                    Write-Host "SENSITIVE_FILE: $file";
                    [Console]::Out.Flush();
                    $foundMatch = $true;
                    $matchCount++;
                  }
                  
                  $lines = $content -split [Environment]::NewLine;
                  for ($i = 0; $i -lt $lines.Count; $i++) {
                    if ($lines[$i] -match $pattern) {
                      $text = $lines[$i].Trim();
                      if ($text.Length -gt 100) { 
                        $text = $text.Substring(0, 100) + '...'; 
                      }
                      Write-Host "LINE_$($i+1): $text";
                      [Console]::Out.Flush();
                    }
                  }
                }
              }
              
              if ($foundMatch) {
                Write-Host '---';
                [Console]::Out.Flush();
              }
            }
          } catch {
            # 에러는 무시하고 계속 진행
          }
        }
        
        Write-Host "=== Deep scan completed: $fileCount files scanned, $matchCount files with matches ===";
        [Console]::Out.Flush();
      `.trim()

      // 선택된 범위에 따라 스크립트 선택
      const powershellScript = scanScope === 'basic' ? basicScanScript : deepScanScript

      const command = `cmd.run 'powershell -NoProfile -ExecutionPolicy Bypass -Command "${powershellScript}"'`
      
      console.log(`중요 정보 스캔 시작 (${scanScope === 'basic' ? '기본' : '심층'} 탐색)...`)
      const response = await saltApi.executeCommand(command, [selectedTarget])
      console.log('중요 정보 스캔 응답:', response)

      if (response.data) {
        let success = false
        let errorMessage = ''
        let output = ''
        let sensitiveMatches: Array<{
          file: string
          matches: number
          details: Array<{ line: number; text: string }>
        }> = []

        // stdout 직접 반환
        if (response.data.stdout !== undefined) {
          output = response.data.stdout || ''
          success = output.length > 0
          const stderr = response.data.stderr || ''
          errorMessage = stderr && !stderr.includes('non-zero exit code') ? stderr : ''
        }
        // 배열 형태
        else if (Array.isArray(response.data) && response.data.length > 0) {
          const result = response.data[0].result
          output = result.stdout || ''
          success = result.success || output.length > 0
          errorMessage = result.error || result.stderr || ''
        }

        if (success && output) {
          const lines = output.split('\n')
          const cleanedLines: string[] = []
          
          for (let i = 0; i < lines.length; i++) {
            let line = lines[i]

            if ((line.match(/^\d+\.\d+\.\d+\.\d+:$/) || line.startsWith('===')) && 
                !line.includes('SENSITIVE_FILE:') && !line.includes('LINE_')) {
              continue
            }
            
            line = line.replace(/^    /, '').trim()
            
            if (line.length > 0) {
              cleanedLines.push(line)
            }
          }
          
          let currentFile = ''
          let currentDetails: Array<{ line: number; text: string }> = []
          
          for (let i = 0; i < cleanedLines.length; i++) {
            const line = cleanedLines[i]
            
            if (line.startsWith('SENSITIVE_FILE: ')) {
              if (currentFile && currentDetails.length > 0) {
                sensitiveMatches.push({
                  file: currentFile,
                  matches: currentDetails.length,
                  details: [...currentDetails]
                })
              }
              
              currentFile = line.replace('SENSITIVE_FILE: ', '').trim()
              currentDetails = []
            }
            else if (line.startsWith('LINE_') && line.includes(': ')) {
              const match = line.match(/^LINE_(\d+):\s*(.*)$/)
              if (match && currentFile) {
                const lineNumber = parseInt(match[1])
                const text = match[2].trim()
                
                if (text.length > 0) {
                  currentDetails.push({
                    line: lineNumber,
                    text: text
                  })
                }
              }
            }
            else if (line === '---' || line.startsWith('DEBUG:') || line.startsWith('===')) {
              continue
            }
          }
          
          if (currentFile && currentDetails.length > 0) {
            sensitiveMatches.push({
              file: currentFile,
              matches: currentDetails.length,
              details: currentDetails
            })
          }
        }
        
        setScanResults(prev => prev.map((result, index) => 
          index === 0 ? {
            ...result,
            files: sensitiveMatches.map(match => match.file),
            status: success ? 'success' : 'error',
            error: success ? undefined : errorMessage || '중요 정보 스캔 실행 중 오류가 발생했습니다.',
            sensitiveMatches: sensitiveMatches
          } : result
        ))
      } else {
        setScanResults(prev => prev.map((result, index) => 
          index === 0 ? {
            ...result,
            status: 'error',
            error: '응답 데이터가 없습니다.'
          } : result
        ))
      }
    } catch (error: any) {
      console.error('중요 정보 스캔 오류:', error)
      setScanResults(prev => prev.map((result, index) => 
        index === 0 ? {
          ...result,
          status: 'error',
          error: `네트워크 오류가 발생했습니다: ${error.message}`
        } : result
      ))
    } finally {
      setIsScanning(false)
    }
  }

  // 클립보드에 복사
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      alert('클립보드에 복사되었습니다!')
    }).catch(() => {
      alert('복사에 실패했습니다.')
    })
  }

  const clearResults = () => {
    setScanResults([])
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />
      case 'scanning':
        return <Clock className="w-5 h-5 text-blue-500 animate-spin" />
      default:
        return null
    }
  }

  // 민감 단어 하이라이트 함수
  const highlightSensitiveWords = (text: string) => {
    const sensitiveWords = ['주소', '전화번호', '이메일', '비밀번호', '계좌번호', '주민번호', '카드번호', 'password', 'email', 'phone', 'address', 'account']
    let highlightedText = text
    
    sensitiveWords.forEach(word => {
      const regex = new RegExp(`(${word})`, 'gi')
      highlightedText = highlightedText.replace(regex, '<mark class="bg-red-200 text-red-800 px-1 rounded">$1</mark>')
    })
    
    return highlightedText
  }

  // 파일 경로에서 파일명만 추출
  const getFileName = (filePath: string) => {
    return filePath.split('\\').pop() || filePath
  }

  // 파일 경로에서 디렉토리 경로만 추출
  const getDirectoryPath = (filePath: string) => {
    const parts = filePath.split('\\')
    return parts.slice(0, -1).join('\\')
  }

  const onlineTargets = targets.filter(target => target.status === 'online').length
  const totalTargets = targets.length

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">데이터 통제</h1>
          <p className="text-gray-600">SaltStack 기반 호스트별 문서 파일 스캔 및 관리</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-center h-32">
            <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
            <span className="ml-2 text-gray-600">호스트 목록을 불러오는 중...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">데이터 통제</h1>
          <p className="text-gray-600">SaltStack 기반 호스트별 문서 파일 스캔 및 관리</p>
          {lastUpdate && (
            <p className="text-xs text-gray-500 mt-1">마지막 업데이트: {lastUpdate}</p>
          )}
          {error && (
            <div className="flex items-center space-x-2 mt-2">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>
        <button
          onClick={fetchTargets}
          disabled={refreshingTargets}
          className="flex items-center space-x-2 px-4 py-2 bg-[#0d4f2c] text-white rounded-lg hover:bg-[#0d4f2c]/90 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${refreshingTargets ? 'animate-spin' : ''}`} />
          <span>{refreshingTargets ? '새로고침 중...' : '새로고침'}</span>
        </button>
      </div>

      {/* SaltStack 대상 현황 */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">SaltStack 관리 대상 현황</h2>
          <button
            onClick={pingAllTargets}
            className="flex items-center space-x-2 bg-[#10113C] text-white px-4 py-2 rounded-lg hover:bg-[#10113C]/90 transition-colors"
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
              className={`text-left p-4 border rounded-lg transition-colors bg-white ${
                selectedTarget === target.id
                  ? 'border-gray-300 bg-gray-50'
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
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    target.status === 'online' 
                      ? 'bg-green-100 text-green-800' 
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
                    className="flex items-center space-x-1 bg-[#10113C] text-white px-2 py-1 rounded-full text-xs hover:bg-[#10113C]/90 disabled:bg-gray-400"
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
                        <AlertCircle className="w-3 h-3" />
                      )}
                      <span>{pingResults[target.id] ? '성공' : '실패'}</span>
                    </div>
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-600">{target.os}</p>
            </button>
          ))}
        </div>
        
        {targets.length === 0 && !refreshingTargets && (
          <div className="text-center py-8">
            <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-2" />
            <p className="text-gray-600">SaltStack 관리 대상을 불러올 수 없습니다</p>
            <p className="text-sm text-gray-500">SaltStack 컨테이너 상태를 확인하고 다시 시도하세요</p>
          </div>
        )}
        
        {refreshingTargets && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-600 mt-2">관리 대상을 조회하는 중...</p>
          </div>
        )}
      </div>

      {/* 호스트 선택 및 스캔 실행 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">문서 스캔 실행</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              대상 호스트 선택
            </label>
            <select
              value={selectedTarget}
              onChange={(e) => setSelectedTarget(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={isScanning}
            >
              {targets.length === 0 ? (
                <option value="">연결된 호스트가 없습니다</option>
              ) : (
                <>
                  <option value="">호스트를 선택하세요</option>
                  {targets.map(target => (
                    <option key={target.id} value={target.id}>
                      {target.name} ({target.ip}) - {target.status}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              스캔 대상 파일
            </label>
            <div className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-600">
              *.txt, *.pdf, *.doc, *.docx, *.ppt, *.pptx, *.xls, *.xlsx, *.csv, *.hwp, *.rtf
            </div>
          </div>
        </div>

        {/* 스캔 실행 버튼들 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* 기본 문서 스캔 */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Command className="w-5 h-5 text-slate-600" />
              <h3 className="font-medium text-slate-900">기본 문서 스캔</h3>
            </div>
            <p className="text-sm text-slate-700 mb-3">
              PowerShell을 사용하여 C:\Users 폴더에서 문서 파일을 검색합니다.
            </p>
            <button
              onClick={executeBasicScan}
              disabled={isScanning || !selectedTarget || targets.length === 0}
              className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-[#10113C] text-white rounded-lg hover:bg-[#10113C]/90 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {isScanning ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              <span>{isScanning ? '스캔 중...' : '기본 스캔 시작'}</span>
            </button>
          </div>

          {/* 민감 정보 스캔 범위 선택 */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Shield className="w-5 h-5 text-slate-600" />
              <h3 className="font-medium text-slate-900">중요 정보 스캔</h3>
            </div>
            <p className="text-sm text-slate-700 mb-3">
              파일 내용에서 개인정보, 계정정보 등 중요한 데이터를 검색합니다.
            </p>
            
            {/* 탐색 범위 선택 */}
            <div className="mb-3">
              <div className="flex space-x-2">
                <button
                  onClick={() => setScanScope('basic')}
                  className={`flex-1 px-3 py-2 text-xs rounded-lg transition-colors ${
                    scanScope === 'basic'
                      ? 'bg-[#10113C] text-white'
                      : 'bg-slate-200 text-slate-800 hover:bg-slate-300'
                  }`}
                >
                  기본 탐색
                </button>
                <button
                  onClick={() => setScanScope('deep')}
                  className={`flex-1 px-3 py-2 text-xs rounded-lg transition-colors ${
                    scanScope === 'deep'
                      ? 'bg-[#10113C] text-white'
                      : 'bg-slate-200 text-slate-800 hover:bg-slate-300'
                  }`}
                >
                  심층 탐색
                </button>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                {scanScope === 'basic' 
                  ? '각 사용자의 주요 폴더만 검색 (Desktop, Downloads, Documents, Pictures)'
                  : 'C:\\Users 전체 폴더 검색'
                }
              </p>
            </div>

            <button
              onClick={executeSensitiveScan}
              disabled={isScanning || !selectedTarget || targets.length === 0}
              className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-[#10113C] text-white rounded-lg hover:bg-[#10113C]/90 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {isScanning ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
              <span>{isScanning ? '스캔 중...' : `${scanScope === 'basic' ? '기본' : '심층'} 스캔`}</span>
            </button>
          </div>

          {/* 결과 관리 */}
          {scanResults.length > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <FileText className="w-5 h-5 text-gray-600" />
                <h3 className="font-medium text-gray-900">스캔 결과 관리</h3>
              </div>
              <p className="text-sm text-gray-700 mb-3">
                현재 {scanResults.length}개의 스캔 결과가 있습니다.
              </p>
              <button
                onClick={clearResults}
                className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                <span>결과 지우기</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 스캔 결과 */}
      {scanResults.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">스캔 결과</h2>
          </div>
          
          <div className="divide-y divide-gray-200">
            {scanResults.map((result, index) => (
              <div key={index} className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <Server className="w-5 h-5 text-gray-500" />
                    <span className="font-medium text-gray-900">
                      {targets.find(t => t.id === result.host)?.name || result.host}
                    </span>
                    {getStatusIcon(result.status)}
                    {result.scanType === 'sensitive' && (
                      <div className="flex items-center space-x-1">
                        <div className="flex items-center space-x-1 px-2 py-1 bg-red-100 text-red-700 rounded text-xs">
                          <Shield className="w-3 h-3" />
                          <span>중요 정보</span>
                        </div>
                        {result.scanScope && (
                          <div className={`flex items-center space-x-1 px-2 py-1 rounded text-xs ${
                            result.scanScope === 'basic' 
                              ? 'bg-blue-100 text-blue-700' 
                              : 'bg-purple-100 text-purple-700'
                          }`}>
                            <span>{result.scanScope === 'basic' ? '기본' : '심층'}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="text-sm text-gray-500">{result.timestamp}</span>
                </div>

                {result.status === 'scanning' && (
                  <div className="flex items-center space-x-3 text-blue-600 bg-blue-50 p-4 rounded-lg">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                    <p>{result.scanType === 'sensitive' ? '파일 내용에서 중요 정보를 스캔하고 있습니다...' : '문서 파일을 스캔하고 있습니다...'}</p>
                  </div>
                )}

                {result.status === 'error' && (
                  <div className="flex items-center space-x-3 text-red-600 bg-red-50 p-4 rounded-lg">
                    <AlertCircle className="w-5 h-5" />
                    <p>오류: {result.error}</p>
                  </div>
                )}

                {result.status === 'success' && (
                  <div>
                    {result.scanType === 'sensitive' && result.sensitiveMatches ? (
                      <div>
                        {/* 중요 정보 스캔 결과 헤더 */}
                        <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-lg p-4 mb-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center space-x-3">
                              <div className="flex items-center justify-center w-10 h-10 bg-red-100 rounded-full">
                                <AlertTriangle className="w-5 h-5 text-red-600" />
                              </div>
                              <div>
                                <h3 className="text-lg font-bold text-red-900">중요 단어 포함 파일</h3>
                                <p className="text-sm text-red-700">
                                  개인정보 및 중요한 데이터가 발견되었습니다 
                                  ({result.scanScope === 'basic' ? '기본 탐색' : '심층 탐색'})
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-2xl font-bold text-red-600">{result.sensitiveMatches.length}</div>
                              <div className="text-sm text-red-700">개 파일</div>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                            <div className="bg-white rounded-lg p-3 border border-red-200">
                              <div className="text-lg font-semibold text-red-600">
                                {result.sensitiveMatches.reduce((sum, match) => sum + match.matches, 0)}
                              </div>
                              <div className="text-sm text-red-700">총 중요 항목</div>
                            </div>
                            <div className="bg-white rounded-lg p-3 border border-red-200">
                              <div className="text-lg font-semibold text-orange-600">
                                {result.sensitiveMatches.length}
                              </div>
                              <div className="text-sm text-orange-700">위험 파일</div>
                            </div>
                            <div className="bg-white rounded-lg p-3 border border-red-200">
                              <div className="text-lg font-semibold text-red-600">높음</div>
                              <div className="text-sm text-red-700">위험도</div>
                            </div>
                          </div>
                        </div>
                        
                        {result.sensitiveMatches.length > 0 ? (
                          <div className="space-y-4">
                            {result.sensitiveMatches.map((match, matchIndex) => (
                              <div key={matchIndex} className="border border-red-200 rounded-lg overflow-hidden">
                                {/* 파일 헤더 */}
                                <div className="bg-red-50 px-4 py-3 border-b border-red-200">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-3">
                                      <File className="w-5 h-5 text-red-600" />
                                      <div>
                                        <h4 className="font-semibold text-red-900">{getFileName(match.file)}</h4>
                                        <p className="text-sm text-red-700">{getDirectoryPath(match.file)}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-center space-x-3">
                                      <div className="flex items-center space-x-1 bg-red-100 text-red-800 px-3 py-1 rounded-full">
                                        <Search className="w-4 h-4" />
                                        <span className="text-sm font-medium">{match.matches}개 발견</span>
                                      </div>
                                      <button
                                        onClick={() => copyToClipboard(match.file)}
                                        className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                                        title="파일 경로 복사"
                                      >
                                        <Copy className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                                
                                {/* 민감 정보 내용 */}
                                <div className="p-4">
                                  <div className="space-y-3 max-h-64 overflow-y-auto">
                                    {match.details.map((detail, detailIndex) => (
                                      <div key={detailIndex} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                                        <div className="flex items-center justify-between mb-2">
                                          <span className="text-sm font-medium text-gray-600">라인 {detail.line}</span>
                                          <button
                                            onClick={() => copyToClipboard(detail.text)}
                                            className="text-gray-400 hover:text-gray-600 transition-colors"
                                            title="내용 복사"
                                          >
                                            <Copy className="w-4 h-4" />
                                          </button>
                                        </div>
                                        <div 
                                          className="text-sm text-gray-800 font-mono bg-white p-2 rounded border break-all"
                                          dangerouslySetInnerHTML={{ __html: highlightSensitiveWords(detail.text) }}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-8 bg-green-50 border border-green-200 rounded-lg">
                            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                            <h3 className="text-lg font-medium text-green-800 mb-1">중요한 정보가 발견되지 않았습니다</h3>
                            <p className="text-green-600">
                              {result.scanScope === 'basic' ? '기본 폴더' : '전체 폴더'}에서 개인정보나 중요한 데이터를 찾을 수 없습니다.
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center space-x-2 mb-3">
                          <FileText className="w-4 h-4 text-green-500" />
                          <span className="text-sm font-medium text-gray-700">
                            발견된 문서 파일: {result.files.length}개
                          </span>
                        </div>
                        
                        {result.files.length > 0 ? (
                          <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">
                            <div className="space-y-1">
                              {result.files.map((file, fileIndex) => (
                                <div key={fileIndex} className="text-sm text-gray-700 font-mono">
                                  {file}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="text-gray-500 text-sm">
                            해당 경로에서 문서 파일을 찾을 수 없습니다.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default DataControl
