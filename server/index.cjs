const express = require('express')
const cors = require('cors')
const { exec, spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const https = require('https');
const util = require('util')
const { promisify } = require('util')
const http = require('http')
const crypto = require('crypto')


// 콘솔 프린트 시 문자열/배열 길이 제한 해제 (truncate 방지)
util.inspect.defaultOptions.maxStringLength = null
util.inspect.defaultOptions.maxArrayLength = null
util.inspect.defaultOptions.depth = null
util.inspect.defaultOptions.breakLength = 120

const app = express()
const PORT = 3001

// CORS 설정
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://61.72.143.248:5173'],
  credentials: true
}))

app.use(express.json())

// 로그 저장 함수
const saveLog = (level, message, error = null) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    error: error ? JSON.stringify(error) : null
  }
  
  try {
    const logFile = path.join(__dirname, 'logs.json')
    let logs = []
    
    if (fs.existsSync(logFile)) {
      const data = fs.readFileSync(logFile, 'utf8')
      logs = JSON.parse(data)
    }
    
    logs.unshift(logEntry)
    logs = logs.slice(0, 100) // 최근 100개만 유지
    
    fs.writeFileSync(logFile, JSON.stringify(logs, null, 2))
  } catch (err) {
    console.error('로그 저장 실패:', err)
  }
  
  console.log(`[${logEntry.timestamp}] [${level.toUpperCase()}] ${message}`)
  if (error) {
    // 객체 그대로 찍으면 util.inspect가 잘라버림 → 반드시 '문자열'로 출력
    // error는 { error: Error, stdout: string, stderr: string } 형태일 수 있음
    const printable =
      typeof error === 'string'
        ? error
        : (error.stack ||
           (error.stderr ? `STDERR:\n${error.stderr}\n` : '') +
           (error.stdout ? `STDOUT:\n${error.stdout}\n` : '') ||
           JSON.stringify(error))
    console.error(printable)
  }
}

// Promise 기반 exec 함수
const execPromise = (command) => {
  return new Promise((resolve, reject) => {
    exec(
      command,
      {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 200, // 200MB까지 수용 (필요시 조정)
      },
      (error, stdout, stderr) => {
        if (error) {
          reject({ error, stdout, stderr })
        } else {
          resolve({ stdout, stderr })
        }
      }
    )
  })
}

// Promise 기반 spawn 함수 (인자 배열 안전 전달)
const spawnPromise = (cmd, args, options = {}) => {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { shell: false, ...options })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += d.toString() })
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.on('error', (err) => { reject({ error: err, stdout, stderr }) })
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr })
      else reject({ error: new Error(`Process exited with code ${code}`), stdout, stderr })
    })
  })
}


// 헬스체크 엔드포인트
app.get('/api/health', (req, res) => {
  saveLog('info', '헬스체크 요청 수신')
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    message: '백엔드 서버가 정상적으로 실행 중입니다'
  })
})

// 시스템 명령어 실행 엔드포인트 추가
app.post('/api/system/execute', async (req, res) => {
  try {
    const { command } = req.body
    
    if (!command) {
      return res.status(400).json({ error: '명령어가 필요합니다' })
    }
    
    saveLog('info', `시스템 명령어 실행: ${command}`)
    
    const result = await execPromise(command)
    saveLog('info', `시스템 명령어 실행 성공: ${command}`, result)
    
    res.json({
      stdout: result.stdout || '',
      stderr: result.stderr || ''
    })
    
  } catch (error) {
    saveLog('error', '시스템 명령어 실행 실패', error)
    
    res.json({
      stdout: error.stdout || '',
      stderr: error.stderr || error.error?.message || '명령어 실행 실패'
    })
  }
})

// Docker 컨테이너 상태 조회 엔드포인트 수정
app.get('/api/docker/status', async (req, res) => {
  try {
    saveLog('info', 'Docker 컨테이너 상태 조회 시작')
    
    // docker ps 명령어로 컨테이너 목록 조회
    const psCommand = 'docker ps'
    const psResult = await execPromise(psCommand)
    
    // docker stats 조회 (실행 중인 컨테이너만)
    const statsCommand = 'docker stats --no-stream --format "{{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"'
    let statsResult = { stdout: '' }
    try {
      statsResult = await execPromise(statsCommand)
    } catch (statsError) {
      console.log('Docker stats 조회 실패, 기본값 사용')
    }
    
    // 컨테이너 정보 파싱
    const containers = parseDockerPsOutput(psResult.stdout, statsResult.stdout)
    
    saveLog('info', `Docker 컨테이너 상태 조회 성공: ${containers.length}개 컨테이너`)
    
    res.json({
      containers: containers
    })
  } catch (error) {
    saveLog('error', 'Docker 컨테이너 상태 조회 실패', error)
    res.status(500).json({ 
      error: error.error?.message || 'Docker 상태 조회 실패',
      containers: []
    })
  }
})

// Docker ps 출력 파싱 함수 수정
const parseDockerPsOutput = (psOutput, statsOutput) => {
  const containers = []
  
  try {
    // docker ps 출력을 라인별로 분할
    const lines = psOutput.split('\n').filter(line => line.trim())
    
    // 헤더 라인 제거 (CONTAINER ID   IMAGE   COMMAND ...)
    const dataLines = lines.slice(1)
    
    // docker stats 출력 파싱
    const statsMap = {}
    if (statsOutput) {
      const statsLines = statsOutput.split('\n').filter(line => line.trim())
      statsLines.forEach(line => {
        const parts = line.split('\t')
        if (parts.length >= 5) {
          statsMap[parts[0]] = {
            cpu: parts[1] || 'N/A',
            memory: parts[2] || 'N/A',
            netIO: parts[3] || 'N/A',
            blockIO: parts[4] || 'N/A'
          }
        }
      })
    }
    
    // 각 컨테이너 라인 파싱
    dataLines.forEach(line => {
      if (!line.trim()) return
      
      // 정규식을 사용하여 docker ps 출력 파싱
      const regex = /^(\w+)\s+(\S+)\s+"([^"]+)"\s+(.+?)\s+(Up .+?)\s+(.+?)\s+(\S+)$/
      const match = line.match(regex)
      
      if (match) {
        const [, containerId, image, command, created, status, ports, name] = match
        
        // 포트 매핑 파싱
        const portMappings = []
        if (ports && ports !== '') {
          // 포트 형식: 0.0.0.0:1280->1280/tcp, [::]:1280->1280/tcp
          const portMatches = ports.match(/(\d+\.\d+\.\d+\.\d+:)?(\d+)->(\d+)\/(\w+)/g)
          if (portMatches) {
            portMatches.forEach(portMatch => {
              const portRegex = /(?:(\d+\.\d+\.\d+\.\d+):)?(\d+)->(\d+)\/(\w+)/
              const portMatchResult = portMatch.match(portRegex)
              if (portMatchResult) {
                portMappings.push({
                  host: portMatchResult[2],
                  container: portMatchResult[3],
                  protocol: portMatchResult[4],
                  connectable: true
                })
              }
            })
          }
        }
        
        containers.push({
          id: containerId,
          name: name,
          status: status.includes('Up') ? 'running' : 'stopped',
          image: image,
          created: created,
          command: command,
          portMappings: portMappings,
          stats: statsMap[name] || statsMap[containerId] || {
            cpu: 'N/A',
            memory: 'N/A',
            netIO: 'N/A',
            blockIO: 'N/A'
          }
        })
      } else {
        // 정규식이 매치되지 않는 경우 간단한 방식으로 파싱
        const parts = line.split(/\s+/)
        if (parts.length >= 7) {
          const containerId = parts[0]
          const image = parts[1]
          const name = parts[parts.length - 1]
          
          containers.push({
            id: containerId,
            name: name,
            status: 'running',
            image: image,
            created: 'unknown',
            command: 'unknown',
            portMappings: [],
            stats: statsMap[name] || statsMap[containerId] || {
              cpu: 'N/A',
              memory: 'N/A',
              netIO: 'N/A',
              blockIO: 'N/A'
            }
          })
        }
      }
    })
    
    return containers
  } catch (error) {
    console.error('Docker ps 출력 파싱 오류:', error)
    console.log('원본 출력:', psOutput)
    return []
  }
}

// SaltStack 키 목록 조회
app.get('/api/salt/keys', async (req, res) => {
  try {
    saveLog('info', 'SaltStack 키 목록 조회 시작')
    
    const command = 'docker exec -i salt_master salt-key -L'
    saveLog('info', `Salt 명령어 실행: ${command}`)
    
    const result = await execPromise(command)
    saveLog('info', `Salt 명령어 실행 성공: ${command}`, result)
    
    // 키 목록 파싱
    const output = result.stdout
    const keys = []
    
    if (output) {
      const lines = output.split('\n')
      let currentStatus = null
      
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.includes('Accepted Keys:')) {
          currentStatus = 'accepted'
        } else if (trimmed.includes('Denied Keys:')) {
          currentStatus = 'denied'
        } else if (trimmed.includes('Unaccepted Keys:')) {
          currentStatus = 'unaccepted'
        } else if (trimmed.includes('Rejected Keys:')) {
          currentStatus = 'rejected'
        } else if (trimmed && currentStatus && !trimmed.includes('Keys:')) {
          keys.push({
            id: trimmed,
            status: currentStatus
          })
        }
      }
    }
    
    saveLog('info', `SaltStack 키 목록 조회 성공: ${keys.length}개 키`)
    
    res.json({
      data: keys,
      raw: result.stdout
    })
  } catch (error) {
    saveLog('error', 'SaltStack 키 목록 조회 실패', error)
    res.status(500).json({ 
      error: error.error?.message || '키 목록 조회 실패',
      details: error
    })
  }
})

// SaltStack 대상 목록 조회 (키 목록에서 추출)
app.get('/api/salt/targets', async (req, res) => {
  try {
    saveLog('info', 'SaltStack 대상 목록 조회 시작')
    
    const command = 'docker exec -i salt_master salt-key -L'
    saveLog('info', `Salt 명령어 실행: ${command}`)
    
    const result = await execPromise(command)
    saveLog('info', `Salt 명령어 실행 성공: ${command}`, result)
    
    // 승인된 키만 대상으로 간주
    const output = result.stdout
    const targets = []
    
    if (output) {
      const lines = output.split('\n')
      let inAcceptedSection = false
      
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.includes('Accepted Keys:')) {
          inAcceptedSection = true
        } else if (trimmed.includes('Keys:') && !trimmed.includes('Accepted Keys:')) {
          inAcceptedSection = false
        } else if (trimmed && inAcceptedSection && !trimmed.includes('Keys:')) {
          targets.push({
            id: trimmed,
            name: trimmed,
            ip: trimmed,
            status: 'online', // 승인된 키는 온라인으로 간주
            os: 'Windows'
          })
        }
      }
    }
    
    saveLog('info', `SaltStack 대상 목록 조회 성공: ${targets.length}개 대상`)
    
    res.json({
      data: targets
    })
  } catch (error) {
    saveLog('error', 'SaltStack 대상 목록 조회 실패', error)
    res.status(500).json({ 
      error: error.error?.message || '대상 목록 조회 실패',
      details: error
    })
  }
})

// 데이터 통제만 안전하게: SaltStack 명령어 실행 - 출력을 그대로 반환
app.post('/api/salt/execute', async (req, res) => {
  try {
    const { command, targets } = req.body
    
    if (!command || !targets || targets.length === 0) {
      return res.status(400).json({ error: '명령어와 대상이 필요합니다' })
    }
    
    const target = targets[0] // 첫 번째 대상 사용
    const trimmed = String(command).trim()

    // ── cmd.run 일 때만: 인자 배열로 안전 전달 (따옴표/옵션오인 방지)
    if (trimmed.startsWith('cmd.run')) {
      const argsPart = trimmed.replace(/^cmd\.run\s+/, '')
      // 바깥 따옴표 한 쌍만 제거 (있다면)
      let payload = argsPart
      if ((payload.startsWith("'") && payload.endsWith("'")) || (payload.startsWith('"') && payload.endsWith('"'))) {
        payload = payload.substring(1, payload.length - 1)
      }

      const dockerArgs = [
        'exec', '-i', 'salt_master',
        'salt', target,
        'cmd.run',
        payload
      ]

      const fullForLog = `docker ${dockerArgs.map(a => (a.includes(' ') ? '"' + a + '"' : a)).join(' ')}`
      saveLog('info', `Salt 명령어 실행(spawn): ${fullForLog}`)

      const result = await spawnPromise('docker', dockerArgs)
      saveLog('info', `Salt 명령어 실행 성공(spawn): ${fullForLog}`, result)

      return res.json({
        stdout: result.stdout || '',
        stderr: result.stderr || ''
      })
    }

    // ── 그 외: 기존 exec 경로 그대로 (기능 보존)
    const fullCommand = `docker exec -i salt_master salt "${target}" ${trimmed}`
    saveLog('info', `Salt 명령어 실행(exec): ${fullCommand}`)
    
    const result = await execPromise(fullCommand)
    saveLog('info', `Salt 명령어 실행 성공: ${fullCommand}`, result)
    
    // 백엔드에서 stdout/stderr를 직접 반환
    res.json({
      stdout: result.stdout || '',
      stderr: result.stderr || ''
    })
    
  } catch (error) {
    saveLog('error', 'Salt 명령어 실행 실패', error)
    
    // 에러 시에도 실제 출력을 반환
    res.json({
      stdout: error.stdout || '',
      stderr: error.stderr || error.error?.message || '명령어 실행 실패'
    })
  }
})

// SaltStack 핑 테스트 - 출력을 그대로 반환
app.post('/api/salt/ping', async (req, res) => {
  try {
    const { target } = req.body
    
    if (!target) {
      return res.status(400).json({ error: '대상이 필요합니다' })
    }
    
    const command = `docker exec -i salt_master salt "${target}" test.ping`
    saveLog('info', `Salt 명령어 실행: ${command}`)
    
    const result = await execPromise(command)
    saveLog('info', `Salt 명령어 실행 성공: ${command}`, result)
    
    // 백엔드에서 stdout/stderr를 직접 반환
    res.json({
      stdout: result.stdout || '',
      stderr: result.stderr || ''
    })
    
  } catch (error) {
    saveLog('error', 'Salt 핑 테스트 실패', error)
    
    // 에러 시에도 실제 출력을 반환
    res.json({
      stdout: error.stdout || '',
      stderr: error.stderr || error.error?.message || '핑 테스트 실패'
    })
  }
})

// 키 수락
app.post('/api/salt/keys/accept', async (req, res) => {
  try {
    const { keyId } = req.body
    
    if (!keyId) {
      return res.status(400).json({ error: '키 ID가 필요합니다' })
    }
    
    const command = `docker exec -i salt_master salt-key -a "${keyId}" -y`
    saveLog('info', `Salt 키 수락: ${command}`)
    
    const result = await execPromise(command)
    saveLog('info', `Salt 키 수락 성공: ${command}`, result)
    
    res.json({
      success: true,
      output: result.stdout
    })
  } catch (error) {
    saveLog('error', 'Salt 키 수락 실패', error)
    res.status(500).json({ 
      error: error.error?.message || '키 수락 실패',
      output: error.stderr || ''
    })
  }
})

// 모든 키 수락
app.post('/api/salt/keys/accept-all', async (req, res) => {
  try {
    const command = 'docker exec -i salt_master salt-key -A -y'
    saveLog('info', `Salt 모든 키 수락: ${command}`)
    
    const result = await execPromise(command)
    saveLog('info', `Salt 모든 키 수락 성공: ${command}`, result)
    
    res.json({
      success: true,
      output: result.stdout
    })
  } catch (error) {
    saveLog('error', 'Salt 모든 키 수락 실패', error)
    res.status(500).json({ 
      error: error.error?.message || '모든 키 수락 실패',
      output: error.stderr || ''
    })
  }
})

// 키 거부
app.post('/api/salt/keys/reject', async (req, res) => {
  try {
    const { keyId } = req.body
    
    if (!keyId) {
      return res.status(400).json({ error: '키 ID가 필요합니다' })
    }
    
    const command = `docker exec -i salt_master salt-key -r "${keyId}" -y`
    saveLog('info', `Salt 키 거부: ${command}`)
    
    const result = await execPromise(command)
    saveLog('info', `Salt 키 거부 성공: ${command}`, result)
    
    res.json({
      success: true,
      output: result.stdout
    })
  } catch (error) {
    saveLog('error', 'Salt 키 거부 실패', error)
    res.status(500).json({ 
      error: error.error?.message || '키 거부 실패',
      output: error.stderr || ''
    })
  }
})

// 키 삭제
app.post('/api/salt/keys/delete', async (req, res) => {
  try {
    const { keyId } = req.body
    
    if (!keyId) {
      return res.status(400).json({ error: '키 ID가 필요합니다' })
    }
    
    const command = `docker exec -i salt_master salt-key -d "${keyId}" -y`
    saveLog('info', `Salt 키 삭제: ${command}`)
    
    const result = await execPromise(command)
    saveLog('info', `Salt 키 삭제 성공: ${command}`, result)
    
    res.json({
      success: true,
      output: result.stdout
    })
  } catch (error) {
    saveLog('error', 'Salt 키 삭제 실패', error)
    res.status(500).json({ 
      error: error.error?.message || '키 삭제 실패',
      output: error.stderr || ''
    })
  }
})

// ============================================
// 디바이스 필라 관련 코드 시작
// ============================================

const execPromiseWithTimeout = (command, timeout = 60000) => {
  return new Promise((resolve, reject) => {
    const child = exec(command, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stdout, stderr })
      } else {
        resolve({ stdout, stderr })
      }
    })
    
    let isKilled = false
    const timeoutId = setTimeout(() => {
      isKilled = true
      child.kill()
      reject({ 
        error: new Error('Command timeout'), 
        stdout: '', 
        stderr: 'Command execution timeout',
        killed: true
      })
    }, timeout)
    
    child.on('close', (code) => {
      clearTimeout(timeoutId)
      if (isKilled) return
    })
  })
}

const spawnPromiseWithTimeout = (cmd, args, options = {}, timeout = 60000) => {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { shell: false, ...options })
    let stdout = ''
    let stderr = ''
    
    let isKilled = false
    const timeoutId = setTimeout(() => {
      isKilled = true
      child.kill('SIGTERM')
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL')
        }
      }, 1000)
      reject({ 
        error: new Error('Command timeout'), 
        stdout, 
        stderr: stderr || 'Command execution timeout',
        killed: true
      })
    }, timeout)
    
    child.stdout.on('data', (d) => { stdout += d.toString() })
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.on('error', (err) => {
      clearTimeout(timeoutId)
      reject({ error: err, stdout, stderr })
    })
    child.on('close', (code) => {
      clearTimeout(timeoutId)
      if (isKilled) return
      if (code === 0) resolve({ stdout, stderr })
      else reject({ error: new Error(`Process exited with code ${code}`), stdout, stderr })
    })
  })
}

const minionCommandQueue = new Map()

const cleanupCommandQueue = () => {
  const now = Date.now()
  for (const [target, queue] of minionCommandQueue.entries()) {
    if (queue.waiting.length === 0 && !queue.executing && (now - queue.lastCommandTime) > 300000) {
      minionCommandQueue.delete(target)
    }
  }
}

setInterval(cleanupCommandQueue, 600000)

const isGpoCommand = (command) => {
  if (!command) return false
  const trimmed = String(command).trim()
  return trimmed.includes('lgpo.set') || 
         trimmed.includes('lgpo.get') || 
         trimmed.includes('gpupdate') ||
         (trimmed.startsWith('cmd.run') && (
           trimmed.includes('gpupdate') || 
           trimmed.includes('lgpo')
         ))
}

const waitForMinionReady = async (target, command) => {
  if (!minionCommandQueue.has(target)) {
    minionCommandQueue.set(target, {
      executing: false,
      waiting: [],
      lastCommandTime: 0,
      currentCommand: null
    })
  }
  
  const queue = minionCommandQueue.get(target)
  
  if (queue.executing) {
    return new Promise((resolve) => {
      queue.waiting.push({ resolve, command: command ? command.substring(0, 100) : null })
      saveLog('info', `Minion ${target} 명령어 실행 대기 중... (현재 실행 중: ${queue.currentCommand || '알 수 없음'}, 대기 중: ${queue.waiting.length}개)`)
    })
  }
  
  const timeSinceLastCommand = Date.now() - queue.lastCommandTime
  if (timeSinceLastCommand < 100) {
    await new Promise(resolve => setTimeout(resolve, 100 - timeSinceLastCommand))
  }
  
  queue.executing = true
  queue.lastCommandTime = Date.now()
  queue.currentCommand = command ? command.substring(0, 100) : null
}

const markMinionCommandComplete = (target) => {
  const queue = minionCommandQueue.get(target)
  if (!queue) return
  
  queue.executing = false
  queue.currentCommand = null
  
  if (queue.waiting.length > 0) {
    const next = queue.waiting.shift()
    queue.executing = true
    queue.lastCommandTime = Date.now()
    queue.currentCommand = next.command
    next.resolve()
  }
}

const checkMinionConnection = async (target, maxRetries = 1) => {
  try {
    const pingCommand = `docker exec -i salt_master salt "${target}" test.ping --timeout=3`
    const result = await execPromiseWithTimeout(pingCommand, 5000)
    
    if (result.stdout && (result.stdout.includes('True') || result.stdout.includes('true'))) {
      return true
    }
  } catch (error) {
    return false
  }
  return false
}

const DEPARTMENT_FILE = path.join(__dirname, 'device_departments.json')

function readDepartments() {
  try {
    if (fs.existsSync(DEPARTMENT_FILE)) {
      const data = fs.readFileSync(DEPARTMENT_FILE, 'utf8')
      return JSON.parse(data)
    }
  } catch (error) {
    saveLog('error', '부서 정보 파일 읽기 실패', error)
  }
  return {}
}

function writeDepartments(departments) {
  try {
    fs.writeFileSync(DEPARTMENT_FILE, JSON.stringify(departments, null, 2), 'utf8')
    return true
  } catch (error) {
    saveLog('error', '부서 정보 파일 쓰기 실패', error)
    return false
  }
}

app.post('/api/device/info', async (req, res) => {
  let target = null
  try {
    target = req.body.target
    
    if (!target) {
      return res.status(400).json({ 
        success: false,
        error: 'target 필드는 필수입니다' 
      })
    }
    
    saveLog('info', `디바이스 정보 수집 시작: ${target}`)
    
    // 큐 관리 추가 (Salt Minion 단일 스레드 제약)
    await waitForMinionReady(target, 'grains.items')
    
    const command = `docker exec -i salt_master salt "${target}" grains.items --out=json`
    saveLog('info', `Salt 명령어 실행: ${command}`)
    
    const result = await execPromise(command)
    
    const hasError = (result.stderr && result.stderr.includes('ERROR')) ||
                     (result.stdout && result.stdout.includes('Minion did not return'))
    
    if (hasError) {
      saveLog('warning', `Salt 명령어 실행 실패: ${command}`, result)
    } else {
      saveLog('info', `Salt 명령어 실행 성공: ${command}`)
    }
    
    markMinionCommandComplete(target)
    
    // JSON 파싱
    let deviceInfo = {}
    try {
      const jsonData = JSON.parse(result.stdout)
      if (jsonData[target]) {
        deviceInfo = jsonData[target]
      } else {
        // 단일 타겟인 경우 직접 파싱
        deviceInfo = jsonData
      }
    } catch (parseError) {
      saveLog('error', '디바이스 정보 JSON 파싱 실패', parseError)
      return res.status(500).json({
        success: false,
        error: '디바이스 정보 파싱 실패',
        details: parseError.message
      })
    }
    
    // 필요한 필드만 추출
    const extractedInfo = {
      id: target,
      host: deviceInfo.host || deviceInfo.fqdn || target,
      osfullname: deviceInfo.osfullname || deviceInfo.os || 'Unknown',
      osrelease: deviceInfo.osrelease || deviceInfo.osrelease || '',
      cpu_model: deviceInfo.cpu_model || deviceInfo.cpuarch || '',
      mem_total: deviceInfo.mem_total || 0,
      windowsdomain: deviceInfo.windowsdomain || '',
      fqdn_ip4: deviceInfo.fqdn_ip4 || []
    }
    
    saveLog('info', `디바이스 정보 수집 성공: ${target}`)
    res.json({
      success: true,
      data: extractedInfo
    })
    
  } catch (error) {
    if (target) {
      markMinionCommandComplete(target)
    }
    
    if (error.killed || (error.error && error.error.message && error.error.message.includes('timeout'))) {
      saveLog('warning', `Minion ${target} 명령어 타임아웃`)
    }
    
    saveLog('error', '디바이스 정보 수집 실패', error)
    res.status(500).json({
      success: false,
      error: error.error?.message || '디바이스 정보 수집 실패',
      details: error
    })
  }
})

app.post('/api/device/execute', async (req, res) => {
  let target = null
  let isGroupTarget = false
  
  try {
    const { command, targets } = req.body
    
    if (!command || !targets || targets.length === 0) {
      return res.status(400).json({ error: '명령어와 대상이 필요합니다' })
    }
    
    target = targets[0]
    const trimmed = String(command).trim()
    
    isGroupTarget = target.startsWith('-G')
    
    if (!isGroupTarget) {
      await waitForMinionReady(target, trimmed)
    }

    if (!isGroupTarget) {
      saveLog('info', `디바이스 명령어 실행: ${target}`)
    } else {
      saveLog('info', `그룹 타겟팅 명령어 실행: ${target}`)
    }

    if (trimmed.startsWith('cmd.run')) {
      const argsPart = trimmed.replace(/^cmd\.run\s+/, '')
      let payload = argsPart
      if ((payload.startsWith("'") && payload.endsWith("'")) || (payload.startsWith('"') && payload.endsWith('"'))) {
        payload = payload.substring(1, payload.length - 1)
      }

      let shellArg = null
      if (payload.includes(' shell=')) {
        const shellMatch = payload.match(/shell=(\w+)/)
        if (shellMatch) {
          shellArg = shellMatch[1]
          payload = payload.replace(/\s*shell=\w+\s*/, '').trim()
          if ((payload.startsWith("'") && payload.endsWith("'")) || (payload.startsWith('"') && payload.endsWith('"'))) {
            payload = payload.substring(1, payload.length - 1)
          }
        }
      }

      // 그룹 타겟팅 지원
      const dockerArgs = ['exec', '-i', 'salt_master', 'salt']
      
    if (isGroupTarget) {
        const groupMatch = target.match(/-G\s+(?:'|")?department:(\w+)(?:'|")?/)
        if (groupMatch) {
          dockerArgs.push('-G', `department:${groupMatch[1]}`)
    } else {
          const altMatch = target.match(/department:(\w+)/)
          if (altMatch) {
            dockerArgs.push('-G', `department:${altMatch[1]}`)
          } else {
            const parts = target.replace(/-G\s+['"]?/, '').replace(/['"]$/, '').split(':')
            if (parts.length === 2) {
              dockerArgs.push('-G', `${parts[0]}:${parts[1]}`)
            } else {
              dockerArgs.push('-G', target.replace(/-G\s+/, ''))
            }
          }
        }
      } else {
        dockerArgs.push(target)
      }
      
      dockerArgs.push('cmd.run', payload)
      
      if (shellArg) {
        dockerArgs.push(`shell=${shellArg}`)
      }

      const fullForLog = `docker ${dockerArgs.map(a => (a.includes(' ') ? '"' + a + '"' : a)).join(' ')}`
      saveLog('info', `Salt 명령어 실행(spawn): ${fullForLog}`)

      const isLongRunningCommand = payload.includes('gpupdate') || payload.includes('Get-') || payload.includes('ConvertTo-Json')
      const timeout = isLongRunningCommand ? 120000 : 90000
      
      const result = await spawnPromiseWithTimeout('docker', dockerArgs, {}, timeout)
      
      const isRuleNotFound = result.stdout && (
        result.stdout.includes('지정된 조건과 일치하는 규칙이 없습니다') ||
        result.stdout.includes('지정된 필터와 일치하는 규칙을 찾을 수 없습니다')
      )
      
      const hasError = (!isRuleNotFound && result.stderr && result.stderr.includes('ERROR')) ||
                       (result.stdout && result.stdout.includes('Minion did not return'))
      
      if (hasError) {
        saveLog('warning', `Salt 명령어 실행 실패(spawn): ${fullForLog}`, result)
      } else {
        saveLog('info', `Salt 명령어 실행 성공(spawn): ${fullForLog}`)
      }

      if (!isGroupTarget) {
        markMinionCommandComplete(target)
      }

      return res.json({
        stdout: result.stdout || '',
        stderr: result.stderr || ''
      })
    }

    const isLongRunningCommand = trimmed.includes('lgpo.set') || trimmed.includes('lgpo.get') || trimmed.includes('gpupdate')
    const timeout = isLongRunningCommand ? 150000 : 90000
    
    let targetArg = ''
    if (isGroupTarget) {
      const groupMatch = target.match(/-G\s+(?:'|")?department:(\w+)(?:'|")?/)
      if (groupMatch) {
        targetArg = `-G department:${groupMatch[1]}`
      } else {
        const altMatch = target.match(/department:(\w+)/)
        if (altMatch) {
          targetArg = `-G department:${altMatch[1]}`
        } else {
          const cleaned = target.replace(/-G\s+['"]?/, '-G ').replace(/['"]$/, '').trim()
          const deptValue = target.replace(/-G\s+['"]?department:/, '').replace(/['"]$/, '')
          targetArg = deptValue ? `-G department:${deptValue}` : (cleaned.startsWith('-G') ? cleaned : `-G ${cleaned}`)
        }
      }
    } else {
      targetArg = `"${target}"`
    }
    
    const fullCommand = `docker exec -i salt_master salt ${targetArg} ${trimmed} --timeout=90`
    
    saveLog('info', `디바이스 명령어 실행: ${trimmed}, 대상: ${target}`)
    saveLog('info', `Salt 명령어 실행(exec): ${fullCommand}`)
    
    const result = await execPromiseWithTimeout(fullCommand, timeout)
    
    const hasError = (result.stderr && result.stderr.includes('ERROR')) ||
                     (result.stdout && result.stdout.includes('Minion did not return')) ||
                     (isGroupTarget && result.stdout && result.stdout.includes('No minions matched the target'))
    
    if (hasError) {
      saveLog('warning', `Salt 명령어 실행 실패: ${fullCommand}`, result)
    } else {
      saveLog('info', `Salt 명령어 실행 성공: ${fullCommand}`)
    }
    
    if (!isGroupTarget) {
      markMinionCommandComplete(target)
    }
    
    res.json({
      stdout: result.stdout || '',
      stderr: result.stderr || ''
    })
    
  } catch (error) {
    if (target && !isGroupTarget) {
      markMinionCommandComplete(target)
    }
    
    if (error.killed || (error.error && error.error.message && error.error.message.includes('timeout'))) {
      saveLog('warning', `Minion ${target} 명령어 타임아웃`)
    }
    
    saveLog('error', '디바이스 명령어 실행 실패', error)
    
    res.json({
      stdout: error.stdout || '',
      stderr: error.stderr || error.error?.message || '명령어 실행 실패'
    })
  }
})

// 부서 정보 조회
app.get('/api/device/department/:target', async (req, res) => {
  try {
    const { target } = req.params
    
    const departments = readDepartments()
    const department = departments[target] || null
    
    res.json({
      success: true,
      department: department
    })
    
  } catch (error) {
    saveLog('error', '부서 정보 조회 실패', error)
    res.status(500).json({
      success: false,
      error: error.message || '부서 정보 조회 실패'
    })
  }
})

app.post('/api/device/department', async (req, res) => {
  try {
    const { target, department } = req.body
    
    if (!target || !department) {
      return res.status(400).json({
        success: false,
        error: 'target와 department 필드는 필수입니다'
      })
    }
    
    const departments = readDepartments()
    departments[target] = department
    
    if (!writeDepartments(departments)) {
      return res.status(500).json({
        success: false,
        error: '부서 정보 저장 실패'
      })
    }
    
    try {
      await waitForMinionReady(target, 'grains.setval')
      const grainsCommand = `docker exec -i salt_master salt "${target}" grains.setval department "${department}"`
      await execPromise(grainsCommand)
      markMinionCommandComplete(target)
      saveLog('info', `Salt grains에 부서 정보 설정: ${target} -> ${department}`)
    } catch (grainsError) {
      saveLog('warning', `Salt grains 설정 실패 (파일 저장은 성공): ${target}`, grainsError)
    }
    
    saveLog('info', `부서 정보 설정 성공: ${target} -> ${department}`)
    res.json({
      success: true,
      message: '부서가 설정되었습니다'
    })
    
  } catch (error) {
    saveLog('error', '부서 정보 설정 실패', error)
    res.status(500).json({
      success: false,
      error: error.message || '부서 정보 설정 실패'
    })
  }
})

// 보안 스케줄 등록
app.post('/api/device/schedule/security', async (req, res) => {
  try {
    const { scheduleType } = req.body
    
    if (!scheduleType) {
      return res.status(400).json({
        success: false,
        error: 'scheduleType 필드는 필수입니다'
      })
    }
    
    saveLog('info', `보안 스케줄 등록: ${scheduleType}`)
    
    // 스케줄 타입에 따라 명령어 결정
    let command = ''
    let name = ''
    let hours = 4
    
    if (scheduleType === 'defender') {
      name = 'monitor_defender'
      hours = 4
      command = 'cmd.run "Get-MpComputerStatus | ConvertTo-Json" shell=powershell'
    } else if (scheduleType === 'bitlocker') {
      name = 'monitor_bitlocker'
      hours = 6
      command = 'cmd.run "Get-BitLockerVolume | ConvertTo-Json" shell=powershell'
    } else if (scheduleType === 'updates') {
      name = 'monitor_updates'
      hours = 24
      command = 'cmd.run "Get-HotFix | Select-Object -First 20 | ConvertTo-Json" shell=powershell'
    } else {
      return res.status(400).json({
        success: false,
        error: '지원하지 않는 스케줄 타입입니다'
      })
    }
    
    // 모든 타겟에 스케줄 등록
    const scheduleCommand = `docker exec -i salt_master salt '*' schedule.add name=${name} function=cmd.run args='["${command}"]' hours=${hours}`
    saveLog('info', `스케줄 등록 명령어: ${scheduleCommand}`)
    
    const result = await execPromise(scheduleCommand)
    saveLog('info', `스케줄 등록 성공: ${scheduleType}`, result)
    
    res.json({
      success: true,
      message: `${scheduleType} 모니터링 스케줄이 등록되었습니다`,
      schedule: {
        name,
        hours,
        command
      }
    })
    
  } catch (error) {
    saveLog('error', '보안 스케줄 등록 실패', error)
    res.status(500).json({
      success: false,
      error: error.error?.message || '스케줄 등록 실패',
      details: error
    })
  }
})

// 모든 보안 스케줄 등록
app.post('/api/device/schedule/all', async (req, res) => {
  try {
    saveLog('info', '모든 보안 스케줄 등록 시작')
    
    const schedules = [
      { type: 'defender', name: 'monitor_defender', hours: 4 },
      { type: 'bitlocker', name: 'monitor_bitlocker', hours: 6 },
      { type: 'updates', name: 'monitor_updates', hours: 24 }
    ]
    
    const results = []
    for (const schedule of schedules) {
      try {
        let command = ''
        if (schedule.type === 'defender') {
          command = 'cmd.run "Get-MpComputerStatus | ConvertTo-Json" shell=powershell'
        } else if (schedule.type === 'bitlocker') {
          command = 'cmd.run "Get-BitLockerVolume | ConvertTo-Json" shell=powershell'
        } else if (schedule.type === 'updates') {
          command = 'cmd.run "Get-HotFix | Select-Object -First 20 | ConvertTo-Json" shell=powershell'
        }
        
        const scheduleCommand = `docker exec -i salt_master salt '*' schedule.add name=${schedule.name} function=cmd.run args='["${command}"]' hours=${schedule.hours}`
        const result = await execPromise(scheduleCommand)
        results.push({ type: schedule.type, success: true })
      } catch (error) {
        results.push({ type: schedule.type, success: false, error: error.message })
      }
    }
    
    saveLog('info', '모든 보안 스케줄 등록 완료')
    res.json({
      success: true,
      message: '모든 보안 스케줄이 등록되었습니다',
      results
    })
    
  } catch (error) {
    saveLog('error', '모든 보안 스케줄 등록 실패', error)
    res.status(500).json({
      success: false,
      error: error.error?.message || '스케줄 등록 실패'
    })
  }
})

// 스케줄 목록 조회
app.get('/api/device/schedule/list', async (req, res) => {
  try {
    const { target } = req.query
    
    const targetParam = target ? `"${target}"` : '*'
    const command = `docker exec -i salt_master salt ${targetParam} schedule.list --out=json`
    saveLog('info', `스케줄 목록 조회: ${command}`)
    
    const result = await execPromise(command)
    
    let schedules = {}
    try {
      schedules = JSON.parse(result.stdout)
    } catch (e) {
      schedules = {}
    }
    
    res.json({
      success: true,
      schedules
    })
    
  } catch (error) {
    saveLog('error', '스케줄 목록 조회 실패', error)
    res.status(500).json({
      success: false,
      error: error.error?.message || '스케줄 목록 조회 실패',
      schedules: {}
    })
  }
})

const execAsync = (command) =>
  new Promise((resolve, reject) => {
    exec(command, { encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stdout, stderr })
      } else {
        resolve({ stdout, stderr })
      }
    })
  })

const ok = (data) => ({ success: true, data })
const fail = (message, meta) => ({ success: false, error: message, ...(meta ? { meta } : {}) })

async function getDeviceStatus() {
  try {
    const { stdout } = await execAsync('devicectl status --json')
    return JSON.parse(stdout)
  } catch (error) {
    return { error }
  }
}

async function rebootDevice(target = 'all') {
  try {
    const { stdout } = await execAsync(`devicectl reboot ${target} --json`)
    return JSON.parse(stdout)
  } catch (error) {
    return { error }
  }
}

async function updateFirmware(version, dryRun = false) {
  try {
    const dry = dryRun ? '--dry-run' : ''
    const { stdout } = await execAsync(`devicectl firmware update ${version} ${dry} --json`)
    return JSON.parse(stdout)
  } catch (error) {
    return { error }
  }
}

async function fetchDeviceLogs({ level = 'info', tail = 200 } = {}) {
  try {
    const { stdout } = await execAsync(`devicectl logs --level ${level} --tail ${tail} --json`)
    return JSON.parse(stdout)
  } catch (error) {
    return { error }
  }
}

async function applyDeviceConfig(configPath) {
  try {
    const { stdout } = await execAsync(`devicectl config apply ${configPath} --json`)
    return JSON.parse(stdout)
  } catch (error) {
    return { error }
  }
}

async function scanNetworks(interfaceName = 'eth0') {
  try {
    const { stdout } = await execAsync(`devicectl net scan ${interfaceName} --json`)
    return JSON.parse(stdout)
  } catch (error) {
    return { error }
  }
}

async function getPortStatus() {
  try {
    const { stdout } = await execAsync('devicectl ports --json')
    return JSON.parse(stdout)
  } catch (error) {
    return { error }
  }
}

const tasks = new Map()
let taskCounter = 1
function createTask(promiseFn) {
  const id = String(taskCounter++)
  const record = { id, status: 'pending', startedAt: Date.now(), result: null, error: null }
  tasks.set(id, record)
  promiseFn()
    .then((res) => {
      record.status = 'done'
      record.result = res
      record.endedAt = Date.now()
    })
    .catch((err) => {
      record.status = 'error'
      record.error = err?.error?.message || String(err)
      record.endedAt = Date.now()
    })
  return id
}

function getTask(id) {
  return tasks.get(id) || null
}

function listTasks() {
  return Array.from(tasks.values()).sort((a, b) => b.startedAt - a.startedAt)
}

const schedules = []

function validateCron(cron) {
  const parts = String(cron).trim().split(/\s+/)
  return parts.length === 5 || parts.length === 6
}

function addMaintenanceSchedule({ name, cron, action, target = 'all' }) {
  if (!name || !cron || !action) {
    return { error: new Error('name/cron/action은 필수입니다') }
  }
  if (!validateCron(cron)) {
    return { error: new Error('유효하지 않은 cron 식입니다') }
  }
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  schedules.push({ id, name, cron, action, target, enabled: true, createdAt: Date.now() })
  return { id }
}

function listMaintenanceSchedules() {
  return schedules.slice().sort((a, b) => b.createdAt - a.createdAt)
}

function toggleMaintenanceSchedule(id, enabled) {
  const idx = schedules.findIndex((s) => s.id === id)
  if (idx < 0) return { error: new Error('스케줄을 찾을 수 없습니다') }
  schedules[idx].enabled = !!enabled
  return { ok: true }
}

function removeMaintenanceSchedule(id) {
  const idx = schedules.findIndex((s) => s.id === id)
  if (idx < 0) return { error: new Error('스케줄을 찾을 수 없습니다') }
  schedules.splice(idx, 1)
  return { ok: true }
}

const history = []

function mountDevicePillar(app) {
  const router = express.Router()

  router.get('/health', (req, res) => {
    res.json(ok({ pillar: 'device', ts: Date.now() }))
  })

  router.get('/status', async (req, res) => {
    const result = await getDeviceStatus()
    if (result?.error) {
      return res.status(500).json(fail('상태 확인 실패', { detail: result.error?.message }))
    }
    res.json(ok(result))
  })

  router.post('/reboot', async (req, res) => {
    const { target = 'all', async = false } = req.body || {}
    if (async) {
      const taskId = createTask(() => rebootDevice(target))
      return res.json(ok({ taskId }))
    }
    const result = await rebootDevice(target)
    if (result?.error) {
      return res.status(500).json(fail('재시작 실패', { detail: result.error?.message }))
    }
    res.json(ok(result))
  })

  router.post('/firmware/update', async (req, res) => {
    const { version, dryRun = false, async = true } = req.body || {}
    if (!version) return res.status(400).json(fail('version 필드는 필수입니다'))

    if (async) {
      const taskId = createTask(() => updateFirmware(version, dryRun))
      return res.json(ok({ taskId }))
    }
    const result = await updateFirmware(version, dryRun)
    if (result?.error) {
      return res.status(500).json(fail('업데이트 실패', { detail: result.error?.message }))
    }
    res.json(ok(result))
  })

  router.get('/logs', async (req, res) => {
    const level = req.query.level || 'info'
    const tail = Number(req.query.tail || 200)
    const result = await fetchDeviceLogs({ level, tail })
    if (result?.error) {
      return res.status(500).json(fail('로그 조회 실패', { detail: result.error?.message }))
    }
    res.json(ok(result))
  })

  router.post('/config/apply', async (req, res) => {
    const { path } = req.body || {}
    if (!path) return res.status(400).json(fail('path 필드는 필수입니다'))
    const result = await applyDeviceConfig(path)
    if (result?.error) {
      return res.status(500).json(fail('구성 적용 실패', { detail: result.error?.message }))
    }
    res.json(ok(result))
  })

  router.get('/net/scan', async (req, res) => {
    const iface = req.query.if || 'eth0'
    const result = await scanNetworks(iface)
    if (result?.error) {
      return res.status(500).json(fail('네트워크 스캔 실패', { detail: result.error?.message }))
    }
    res.json(ok(result))
  })

  router.get('/ports', async (req, res) => {
    const result = await getPortStatus()
    if (result?.error) {
      return res.status(500).json(fail('포트 상태 조회 실패', { detail: result.error?.message }))
    }
    res.json(ok(result))
  })

  router.get('/tasks', (req, res) => {
    res.json(ok(listTasks()))
  })

  router.get('/tasks/:id', (req, res) => {
    const t = getTask(req.params.id)
    if (!t) return res.status(404).json(fail('해당 작업을 찾을 수 없습니다'))
    res.json(ok(t))
  })

  app.use('/device', router)
}

function mountMaintenanceAPI(app) {
  const router = express.Router()

  router.get('/', (req, res) => {
    res.json(ok(listMaintenanceSchedules()))
  })

  router.post('/', (req, res) => {
    const { name, cron, action, target = 'all' } = req.body || {}
    const out = addMaintenanceSchedule({ name, cron, action, target })
    if (out?.error) {
      return res.status(400).json(fail(out.error.message))
    }
    res.json(ok(out))
  })

  router.post('/:id/toggle', (req, res) => {
    const id = req.params.id
    const enabled = !!(req.body?.enabled ?? true)
    const out = toggleMaintenanceSchedule(id, enabled)
    if (out?.error) {
      return res.status(404).json(fail(out.error.message))
    }
    res.json(ok(out))
  })

  router.delete('/:id', (req, res) => {
    const id = req.params.id
    const out = removeMaintenanceSchedule(id)
    if (out?.error) {
      return res.status(404).json(fail(out.error.message))
    }
    res.json(ok(out))
  })

  app.use('/maintenance', router)
}

function deviceAuth(options = {}) {
  const { token = process.env.DEVICE_TOKEN, header = 'x-device-token' } = options
  return function (req, res, next) {
    if (!token) return res.status(500).json(fail('서버 토큰 미설정'))
    const provided = req.headers[header] || req.query.token || req.body?.token
    if (provided !== token) return res.status(401).json(fail('인증 실패'))
    next()
  }
}

function mountDeviceFeatureSet(app, { protect = false } = {}) {
  if (protect) {
    app.use('/device', deviceAuth())
    app.use('/maintenance', deviceAuth())
    app.use('/util', deviceAuth())
  }
  mountDevicePillar(app)
  mountMaintenanceAPI(app)
}

// ============================================
// 디바이스 필라 관련 코드 끝
// ============================================

// Docker 컨테이너 상태 조회 (수정된 파싱)
app.get('/api/docker/containers/:containerName/stats', async (req, res) => {
  try {
    const { containerName } = req.params
    
    const command = `docker stats ${containerName} --no-stream --format "table {{.Container}}    {{.CPUPerc}}    {{.MemUsage}}    {{.NetIO}}       {{.BlockIO}}"`
    saveLog('info', `Salt 명령어 실행: ${command}`)
    
    const result = await execPromise(command)
    saveLog('info', `Salt 명령어 실행 성공: ${command}`, result)
    
    // Docker stats 출력 파싱 (수정됨)
    const lines = result.stdout.split('\n').filter(line => line.trim())
    
    if (lines.length >= 2) {
      // 헤더 라인을 제외한 데이터 라인
      const dataLine = lines[1]
      
      // 여러 공백을 하나로 처리하여 분할
      const parts = dataLine.replace(/\s+/g, ' ').trim().split(' ')
      
      if (parts.length >= 5) {
        const containerStats = {
          name: parts[0],
          status: 'running',
          image: 'saltstack/salt:latest',
          created: new Date().toISOString(),
          ports: [
            {
              container: '4505',
              host: '4505',
              status: 'connected'
            }
          ],
          resources: {
            cpu: parts[1] || '0%',
            memory: parts[2] || '0B / 0B',
            networkIO: parts[3] || '0B / 0B',
            diskIO: parts[4] || '0B / 0B'
          }
        }
        
        saveLog('info', `컨테이너 정보 조회 성공 "${containerName}"`)
        res.json(containerStats)
      } else {
        throw new Error('Docker stats 출력 파싱 실패: 데이터 부족')
      }
    } else {
      throw new Error('Docker stats 출력이 예상과 다름')
    }
    
  } catch (error) {
    saveLog('error', `컨테이너 정보 조회 실패: ${containerName}`, error)
    
    // 기본값 반환
    res.json({
      name: req.params.containerName,
      status: 'unknown',
      image: 'saltstack/salt:latest',
      created: new Date().toISOString(),
      ports: [
        {
          container: '4505',
          host: '4505',
          status: 'unknown'
        }
      ],
      resources: {
        cpu: '0%',
        memory: '0B / 0B',
        networkIO: '0B / 0B',
        diskIO: '0B / 0B'
      }
    })
  }
})

// 시스템 로그 조회
app.get('/api/logs/system', (req, res) => {
  try {
    const logFile = path.join(__dirname, 'logs.json')
    
    if (fs.existsSync(logFile)) {
      const data = fs.readFileSync(logFile, 'utf8')
      const logs = JSON.parse(data)
      res.json(logs)
    } else {
      res.json([])
    }
  } catch (error) {
    console.error('로그 조회 실패:', error)
    res.status(500).json({ error: '로그 조회 실패' })
  }
})

// OpenZiti 라우터 목록 조회
app.get('/api/ziti/routers', async (req, res) => {
  try {
    saveLog('info', 'OpenZiti 라우터 목록 조회 시작')
    
    const command = 'docker exec -i ziti-controller /openziti/ziti edge list edge-routers'
    saveLog('info', `OpenZiti 명령어 실행: ${command}`)
    
    const result = await execPromise(command)
    saveLog('info', `OpenZiti 명령어 실행 성공: ${command}`, result)
    
    // 라우터 목록 파싱
    const output = result.stdout
    const routers = []
    
    if (output) {
      const lines = output.split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        // 라우터 정보가 포함된 라인 찾기 (실제 형식에 맞게 조정)
        if (trimmed && !trimmed.includes('id') && !trimmed.includes('---') && trimmed.length > 10) {
          const parts = trimmed.split(/\s+/)
          if (parts.length >= 3) {
            routers.push({
              id: parts[0],
              name: parts[1],
              status: parts[2] || 'unknown',
              isOnline: parts[2] === 'true' || parts[2] === 'online'
            })
          }
        }
      }
    }
    
    saveLog('info', `OpenZiti 라우터 목록 조회 성공: ${routers.length}개 라우터`)
    
    res.json({
      data: routers,
      raw: result.stdout
    })
  } catch (error) {
    saveLog('error', 'OpenZiti 라우터 목록 조회 실패', error)
    res.status(500).json({ 
      error: error.error?.message || '라우터 목록 조회 실패',
      details: error
    })
  }
})

// OpenZiti 명령어 실행
app.post('/api/ziti/execute', async (req, res) => {
  try {
    const { command } = req.body
    
    if (!command) {
      return res.status(400).json({ error: '명령어가 필요합니다' })
    }
    
    const fullCommand = `docker exec -i ziti-controller /openziti/${command}`
    saveLog('info', `OpenZiti 명령어 실행: ${fullCommand}`)
    
    const result = await execPromise(fullCommand)
    saveLog('info', `OpenZiti 명령어 실행 성공: ${fullCommand}`, result)
    
    res.json({
      stdout: result.stdout || '',
      stderr: result.stderr || ''
    })
    
    } catch (error) {
    saveLog('error', 'OpenZiti 명령어 실행 실패', error)
    
    res.json({
      stdout: error.stdout || '',
      stderr: error.stderr || error.error?.message || '명령어 실행 실패'
    })
  }
})

// Keycloak 로그인 및 토큰 설정 - Keycloak 24.x 경로 수정
app.post('/api/keycloak/login', async (req, res) => {
  try {
    saveLog('info', 'Keycloak 로그인 시도')
    
    // Keycloak 24.x 버전의 올바른 경로와 URL 사용 (auth 경로 제거)
    const command = 'docker exec -i keycloak /opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user admin --password admin'
    saveLog('info', `Keycloak 명령어 실행: ${command}`)
    
    const result = await execPromise(command)
    saveLog('info', `Keycloak 로그인 성공: ${command}`, result)
    
    res.json({
      success: true,
      stdout: result.stdout || '',
      stderr: result.stderr || ''
    })
    
  } catch (error) {
    saveLog('error', 'Keycloak 로그인 실패', error)
    
    res.json({
      success: false,
      stdout: error.stdout || '',
      stderr: error.stderr || error.error?.message || 'Keycloak 로그인 실패'
    })
  }
})

// Keycloak 사용자 목록 조회 - Keycloak 24.x 경로 수정
app.get('/api/keycloak/users', async (req, res) => {
  try {
    saveLog('info', 'Keycloak 사용자 목록 조회 시작')
    
    // Keycloak 24.x 버전의 올바른 경로와 URL 사용 (auth 경로 제거)
    const command = 'docker exec -i keycloak /opt/keycloak/bin/kcadm.sh get users --server http://localhost:8080 --realm master'
    saveLog('info', `Keycloak 명령어 실행: ${command}`)
    
    const result = await execPromise(command)
    saveLog('info', `Keycloak 사용자 목록 조회 성공: ${command}`, result)
    
    // JSON 파싱 시도
    let users = []
    try {
      users = JSON.parse(result.stdout || '[]')
    } catch (parseError) {
      console.log('JSON 파싱 실패, 빈 배열 반환')
    }
    
    res.json({
      data: users,
      raw: result.stdout
    })
    
  } catch (error) {
    saveLog('error', 'Keycloak 사용자 목록 조회 실패', error)
    
    res.json({
      data: [],
      error: error.stderr || error.error?.message || '사용자 목록 조회 실패'
    })
  }
})

// Keycloak 렐름 목록 조회 - Keycloak 24.x 경로 수정
app.get('/api/keycloak/realms', async (req, res) => {
  try {
    saveLog('info', 'Keycloak 렐름 목록 조회 시작')
    
    // Keycloak 24.x 버전의 올바른 경로와 URL 사용 (auth 경로 제거)
    const command = 'docker exec -i keycloak /opt/keycloak/bin/kcadm.sh get realms --server http://localhost:8080'
    saveLog('info', `Keycloak 명령어 실행: ${command}`)
    
    const result = await execPromise(command)
    saveLog('info', `Keycloak 렐름 목록 조회 성공: ${command}`, result)
    
    // JSON 파싱 시도
    let realms = []
    try {
      realms = JSON.parse(result.stdout || '[]')
    } catch (parseError) {
      console.log('JSON 파싱 실패, 빈 배열 반환')
    }
    
    res.json({
      data: realms,
      raw: result.stdout
    })
    
  } catch (error) {
    saveLog('error', 'Keycloak 렐름 목록 조회 실패', error)
    
    res.json({
      data: [],
      error: error.stderr || error.error?.message || '렐름 목록 조회 실패'
    })
  }
})

// Keycloak 이벤트 로그 조회 - 실제 접근 로그
app.get('/api/keycloak/events', async (req, res) => {
  try {
    saveLog('info', 'Keycloak 이벤트 로그 조회 시작')
    
    // Keycloak 24.x 버전의 이벤트 조회 명령어
    // 최근 50개의 이벤트를 가져옴
    const command = 'docker exec -i keycloak /opt/keycloak/bin/kcadm.sh get events --server http://localhost:8080 --realm master --max 50'
    saveLog('info', `Keycloak 이벤트 조회 명령어 실행: ${command}`)
    
    const result = await execPromise(command)
    saveLog('info', `Keycloak 이벤트 조회 성공: ${command}`, result)
    
    // JSON 파싱 시도
    let events = []
    try {
      const output = result.stdout || ''
      // JSON 배열 추출
      const jsonMatch = output.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        events = JSON.parse(jsonMatch[0])
      } else {
        // 전체 출력이 JSON인 경우
        events = JSON.parse(output)
      }
    } catch (parseError) {
      console.log('이벤트 JSON 파싱 실패:', parseError)
      // 파싱 실패 시 빈 배열 반환
      events = []
    }
    
    res.json({
      data: events,
      events: events,
      raw: result.stdout
    })
    
  } catch (error) {
    saveLog('error', 'Keycloak 이벤트 로그 조회 실패', error)
    
    res.json({
      data: [],
      events: [],
      error: error.stderr || error.error?.message || '이벤트 로그 조회 실패'
    })
  }
})

// Keycloak 명령어 실행 - Keycloak 24.x 경로 수정
app.post('/api/keycloak/execute', async (req, res) => {
  try {
    const { command } = req.body
    
    if (!command) {
      return res.status(400).json({ error: '명령어가 필요합니다' })
    }
    
    // Keycloak 24.x 버전의 올바른 경로와 URL 사용 (auth 경로 제거)
    const fullCommand = `docker exec -i keycloak /opt/keycloak/bin/kcadm.sh ${command} --server http://localhost:8080`
    saveLog('info', `Keycloak 명령어 실행: ${fullCommand}`)
    
    const result = await execPromise(fullCommand)
    saveLog('info', `Keycloak 명령어 실행 성공: ${fullCommand}`, result)
    
    res.json({
      stdout: result.stdout || '',
      stderr: result.stderr || ''
    })
    
    } catch (error) {
    saveLog('error', 'Keycloak 명령어 실행 실패', error)
    
    res.json({
      stdout: error.stdout || '',
      stderr: error.stderr || error.error?.message || '명령어 실행 실패'
    })
  }
})

// 서버 시작
app.listen(PORT, () => {
  saveLog('info', `백엔드 서버가 포트 ${PORT}에서 실행 중입니다`)
  console.log(`백엔드 서버가 포트 ${PORT}에서 실행 중입니다`)
})

// 프로세스 종료 시 로그 저장
process.on('SIGINT', () => {
  saveLog('info', '서버가 종료됩니다')
  process.exit(0)
})

process.on('SIGTERM', () => {
  saveLog('info', '서버가 종료됩니다')
  process.exit(0)
})

function buildEsQuery() {
  // 숫자형 필드로 매칭할 EventID 세트
  const EV_NUM = {
    "01_user_negligence":   [4688,4663,4624,4625],
    "02_external_attacker": [4688,7045,4697,4698,4699,1102,4624,4740,4625,4672],
    "03_departed_employee": [4624,4720,4722,4725,4726,4663,4660,4698,7045,6416],
    "04_insider_threat":    [4663,4688,1102,4672],
    "05_vuln_or_misconfig": [7045,4697,4698,4699,4688,4672,4673],
    "06_credential_attack": [4625,4624,4768,4769,4776],
    "07_remote_login":      [4624,4634,1149,4648],
    "08_persistence":       [4698,4699,7045,4697,4648],
    "09_powershell_scripting": [4103,4104,4688],
    "10_data_access_shares":   [4663,5140,5145],
    "11_bulk_staging":         [4663,4660,4688],
    "12_usb_exfil":            [6416,4663]
  };

  const mkFilter = (key) => ({
    terms: { "EventID": EV_NUM[key] }
  });

  const filters = Object.keys(EV_NUM).reduce((acc, k) => {
    acc[k] = mkFilter(k);
    return acc;
  }, {});

  return {
    size: 0,
    query: { match_all: {} },
    aggs: {
      threats: { filters: { filters } },
      // 디버깅용 — 상위 EventID 확인
      top_eventid: { terms: { field: "EventID", size: 10 } }
    }
  };
}


/**
 * 방법 A) Node 내부에서 HTTPS 호출 (권장) — self-signed 허용
 *  - 외부 패키지(node-fetch/axios) 불필요
 */
function callElasticsearchInternal(queryObj) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(queryObj)
    const options = {
      method: 'POST',
      hostname: 'localhost',
      port: 9200,
      path: '/logs-*/_search',
      headers: {
        'Authorization': 'Basic ' + Buffer.from('admin:Dapozbob14').toString('base64'),
        'Content-Type': 'application/json; charset=UTF-8',
        'Content-Length': Buffer.byteLength(postData)
      },
      agent: new https.Agent({ rejectUnauthorized: false }) // <- self-signed 허용
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          resolve(json)
        } catch (e) {
          reject({ error: new Error('ES 응답 JSON 파싱 실패'), stdout: data, stderr: e?.message })
        }
      })
    })

    req.on('error', (e) => reject({ error: e }))
    req.write(postData)
    req.end()
  })
}

/**
 * 방법 B) curl로 호출 (Windows도 동작) — 인용부호 이슈 회피 위해 임시파일 사용
 */
async function callElasticsearchByCurl(queryObj) {
  const tmpFile = path.join(__dirname, `es_query_${Date.now()}.json`)
  fs.writeFileSync(tmpFile, JSON.stringify(queryObj), 'utf8')
  const cmd = `curl -s -k -u admin:Dapozbob14 -H "Content-Type: application/json; charset=UTF-8" "https://localhost:9200/logs-*/_search" --data-binary "@${tmpFile}"`
  try {
    const { stdout } = await execPromise(cmd)
    try {
      return JSON.parse(stdout)
    } catch (e) {
      throw { error: new Error('ES 응답 JSON 파싱 실패(curl)'), stdout, stderr: e?.message }
    }
  } finally {
    try { fs.unlinkSync(tmpFile) } catch {}
  }
}

/**
 * 위험도 테이블
 */
const RISK_TABLE = {
  '01_user_negligence': 0.6,
  '02_external_attacker': 0.6,
  '03_departed_employee': 0.32,
  '04_insider_threat': 0.6,
  '05_vuln_or_misconfig': 0.64,
  '06_credential_attack': 1.0,
  '07_remote_login': 0.48,
  '08_persistence': 0.32,
  '09_powershell_scripting': 0.48,
  '10_data_access_shares': 0.48,
  '11_bulk_staging': 0.48,
  '12_usb_exfil': 0.24
}
const NORMALIZER = 6.24 // 합산/정규화 분모

// ===================== 진단 평가 라우터 =====================
const diagnosisRouter = express.Router();

diagnosisRouter.get('/ping', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});


/** 방법 A: Node HTTPS(셀프사인 허용) */
function callElasticsearchInternal(queryObj) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(queryObj);
    const req = https.request({
      method: 'POST',
      hostname: 'localhost',
      port: 9200,
      path: '/logs-*/_search',
      headers: {
        'Authorization': 'Basic ' + Buffer.from('admin:Dapozbob14').toString('base64'),
        'Content-Type': 'application/json; charset=UTF-8',
        'Content-Length': Buffer.byteLength(postData)
      },
      agent: new https.Agent({ rejectUnauthorized: false }) // self-signed 허용
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject({ error: new Error('ES 응답 JSON 파싱 실패'), stdout: data, stderr: e?.message }); }
      });
    });
    req.on('error', (e) => reject({ error: e }));
    req.write(postData);
    req.end();
  });
}

/** 방법 B: curl fallback (윈도우 호환, 인용부호 이슈 회피) */
async function callElasticsearchByCurl(queryObj) {
  const tmpFile = path.join(__dirname, `es_query_${Date.now()}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify(queryObj), 'utf8');
  const cmd = `curl -s -k -u admin:Dapozbob14 -H "Content-Type: application/json; charset=UTF-8" "https://localhost:9200/logs-*/_search" --data-binary "@${tmpFile}"`;
  try {
    const { stdout } = await execPromise(cmd);
    return JSON.parse(stdout);
  } catch (e) {
    throw { error: new Error('ES 응답 JSON 파싱 실패(curl)'), stdout: e.stdout, stderr: e.stderr };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

diagnosisRouter.post('/evaluate', async (req, res) => {
  try {
    saveLog('info', '진단 평가 분석 시작 (internal HTTPS)');
    const query = buildEsQuery();

    // A 시도 → 실패 시 B로 폴백
    let esData;
    try {
      esData = await callElasticsearchInternal(query);
    } catch (e1) {
      saveLog('error', 'ES 내부 호출 실패, curl 대체 경로 시도', e1);
      esData = await callElasticsearchByCurl(query);
    }

    const buckets = esData?.aggregations?.threats?.buckets || {};
    const topEventId = esData?.aggregations?.top_eventid?.buckets || [];  // ← buildEsQuery()와 동일한 키
    saveLog(
      'info',
      `디버그: 상위 EventID=${JSON.stringify(topEventId)}`
    );

    const detected = Object.entries(buckets)
      .filter(([, v]) => (v?.doc_count || 0) > 0)
      .map(([k]) => k);

    const sum = detected.reduce((acc, k) => acc + (RISK_TABLE[k] || 0), 0);
    let threatScore = parseFloat((sum / NORMALIZER).toFixed(2));

    if (detected.length === 0) {
      threatScore = 0;
    }

    //const checklistScore = Number(req.body?.checklistScore || 0); // 0~1
    let checklistScore = Number(req.body?.checklistScore ?? 0);
    if (Number.isFinite(checklistScore)) {
      if (checklistScore > 1) checklistScore = checklistScore / 100; // 73 -> 0.73
      if (checklistScore < 0) checklistScore = 0;
      if (checklistScore > 1) checklistScore = 1;
    } else {
      checklistScore = 0;
    }
    // const zeroTrustScore = parseFloat((checklistScore * threatScore).toFixed(2));
    const zeroTrustRaw = checklistScore * (1 / (1 + threatScore));
    const zeroTrustScore = Math.round(zeroTrustRaw * 100) / 100; // 표시용 2자리 반올림

    let level = '', meaning = '';
    if (zeroTrustScore <= 0.15) { level = '기존(Traditional)'; meaning = '통제가 거의 없거나 관리 부재'; }
    else if (zeroTrustScore <= 0.50) { level = '초기(Initial)'; meaning = '기초 통제 및 점검 절차 존재, 일부 수동 운영'; }
    else if (zeroTrustScore <= 0.85) { level = '향상(Advanced)'; meaning = '표준화된 절차 + 자동화 일부 적용'; }
    else { level = '최적화(Optimized)'; meaning = '지속 개선, 완전 자동화 및 정책 기반 운영'; }

    saveLog('info', `진단 평가 분석 완료: detected=${detected.join(',')}, threatScore=${threatScore}, zeroTrustScore=${zeroTrustScore}`);

    res.json({
      success: true,
      detectedScenarios: detected,
      threatScore,
      checklistScore,
      zeroTrustScore,
      maturity: { level, meaning }
    });
  } catch (error) {
    saveLog('error', '진단 평가 실행 실패', error);
    res.status(500).json({
      success: false,
      error: error?.error?.message || error?.message || '분석 실패',
      meta: { stdout: error?.stdout, stderr: error?.stderr }
    });
  }
});

// 라우터 마운트
app.use('/api/diagnosis', diagnosisRouter);
// =================== 진단 평가 라우터 끝 ===================


// ============================================
// [엔드포인트] 스케줄러 히스토리 클리어
// ============================================
function mountHistoryClear(app) {
  const router = express.Router()
  router.post('/maintenance/history/clear', (req, res) => {
    history.splice(0, history.length)
    res.json(ok({ cleared: true }))
  })
  app.use('/', router)
}

// ============================================
// [엔드포인트] 스케줄러 간단 상태
// ============================================
function mountSimpleSchedulerState(app) {
  const router = express.Router()
  router.get('/_scheduler/state', (req, res) => {
    res.json(ok({ running: !!__timer, tasks: tasks.size, schedules: schedules.length }))
  })
  app.use('/', router)
}

// ============================================
// [엔드포인트] 유지보수 스케줄 목록 페이지(경량)
// ============================================
function mountMaintenanceLightHTML(app) {
  app.get('/maintenance_light.html', (req, res) => {
    const list = listMaintenanceSchedules()
    const rows = list
      .map(
        (s) => `<tr><td>${s.name}</td><td>${s.cron}</td><td>${s.action}</td><td>${s.enabled}</td><td>${s.createdAt}</td></tr>`
      )
      .join('\n')

    const html = `
<!doctype html>
<html>
<head><meta charset="utf-8" /><title>Maintenance Light</title></head>
<body>
  <table>
    <thead><tr><th>Name</th><th>Cron</th><th>Action</th><th>Enabled</th><th>Created</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(html)
  })
}

// ============================================
// [엔드포인트] 스케줄러 목록 JSON 라우트(캐시 없음)
// ============================================
function mountMaintenanceJSON(app) {
  const router = express.Router()
  router.get('/maintenance.json', (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json(ok(listMaintenanceSchedules()))
  })
  app.use('/', router)
}

// ============================================
// [엔드포인트] 작업 큐 상세
// ============================================
function mountTaskDetail(app) {
  const router = express.Router()
  router.get('/tasks/:id/detail', (req, res) => {
    const t = tasks.get(req.params.id)
    if (!t) return res.status(404).json(fail('작업을 찾을 수 없습니다'))
    res.json(ok(t))
  })
  app.use('/', router)
}

// ============================================
// [엔드포인트] 스케줄러 목록 정렬 옵션
// ============================================
function mountScheduleSort(app) {
  const router = express.Router()
  router.get('/maintenance/sorted', (req, res) => {
    const by = String(req.query.by || 'createdAt')
    const dir = String(req.query.dir || 'desc')
    const list = listMaintenanceSchedules().sort((a, b) =>
      dir === 'asc' ? a[by] - b[by] : b[by] - a[by]
    )
    res.json(ok(list))
  })
  app.use('/', router)
}

// ============================================
// [엔드포인트] 간단한 상태/작업/스케줄 요약
// ============================================
function mountAllSummary(app) {
  const router = express.Router()
  router.get('/_all/summary', async (req, res) => {
    const status = await getDeviceStatus()
    const ports = await getPortStatus()
    res.json(
      ok({
        device: status?.error ? null : status,
        ports: ports?.error ? null : ports,
        schedules: listMaintenanceSchedules(),
        tasks: listTasks()
      })
    )
  })
  app.use('/', router)
}

// ============================================
// [엔드포인트] 유지보수 스케줄 샘플 데이터 주입
// ============================================
function mountSeedSchedules(app) {
  const router = express.Router()
  router.post('/_seed/schedules', (req, res) => {
    const n = Number(req.body?.n || 5)
    for (let i = 0; i < n; i++) {
      schedules.push({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: `sample-${i + 1}`,
        cron: '*/5 * * * *',
        action: ['status', 'reboot', 'logs'][i % 3],
        target: 'all',
        enabled: true,
        createdAt: Date.now()
      })
    }
    res.json(ok({ seeded: n }))
  })
  app.use('/', router)
}

// ============================================
// [엔드포인트] 포트 상태 목록 요약(열려있는 포트 수)
// ============================================
function mountOpenPortSummary(app) {
  const router = express.Router()
  router.get('/ports/summary', async (req, res) => {
    const result = await getPortStatus()
    if (result?.error) {
      return res.status(500).json(fail('포트 상태 조회 실패', { detail: result.error?.message }))
    }
    const open = (result?.ports || []).filter((p) => p?.open).length
    res.json(ok({ open }))
  })
  app.use('/', router)
}

// ============================================
// [엔드포인트] 유지보수 작업 최근 실행 기록
// ============================================
function mountRecentHistory(app) {
  const router = express.Router()
  router.get('/maintenance/history/recent', (req, res) => {
    const recent = history.slice(-50)
    res.json(ok(recent))
  })
  app.use('/', router)
}

// ============================================
// [엔드포인트] 유지보수 스케줄러 설정(더미)
// ============================================
function mountSchedulerSettings(app) {
  const router = express.Router()
  router.get('/_scheduler/settings', (req, res) => {
    res.json(ok({ intervalMs: 60000, cronSupport: false }))
  })
  app.use('/', router)
}

// ============================================
// [엔드포인트] 스케줄러 작업 카운트
// ============================================
function mountTaskCount(app) {
  const router = express.Router()
  router.get('/tasks/count', (req, res) => {
    res.json(ok({ count: tasks.size }))
  })
  app.use('/', router)
}

// ============================================
// [엔드포인트] 유지보수 스케줄러 상태 체크(간단 OK)
// ============================================
function mountSchedulerOk(app) {
  const router = express.Router()
  router.get('/_scheduler/ok', (req, res) => {
    res.json(ok({ ok: true }))
  })
  app.use('/', router)
}

// ============================================
// [엔드포인트] 스케줄러 작업 목록(간단)
// ============================================
function mountSimpleTasks(app) {
  const router = express.Router()
  router.get('/tasks.json', (req, res) => {
    res.json(ok(listTasks()))
  })
  app.use('/', router)
}

// ============================================
// [끝] 디바이스 필라/스케줄러 확장 끝
// ============================================

// [시작] 어플리케이션 통제의 SBOM 생성 기능 시작 ==

// SBOM 상수 정의
const SBOM_ROOT = path.join(__dirname, '..')
const SBOM_BASE = path.join(SBOM_ROOT, 'data', 'sbom')
const SBOM_LOGS = path.join(SBOM_BASE, 'logs')
const SBOM_META = path.join(SBOM_BASE, 'meta')
const SBOM_RESULTS_DIR = path.join(SBOM_BASE, 'results')
fs.mkdirSync(SBOM_LOGS, { recursive: true })
fs.mkdirSync(SBOM_META, { recursive: true })
fs.mkdirSync(SBOM_RESULTS_DIR, { recursive: true })

function _sbomLogFile(jobId) { return path.join(SBOM_LOGS, `${jobId}.log`) }
function _sbomMetaFile(jobId) { return path.join(SBOM_META, `${jobId}.json`) }

function sbomNewJob() {
  const jobId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex')
  fs.writeFileSync(_sbomLogFile(jobId), '')
  fs.writeFileSync(_sbomMetaFile(jobId), JSON.stringify({ status:'queued', meta:{}, offset:0 }, null, 2))
  return jobId
}

async function _sbomReadMeta(jobId) {
  try { return JSON.parse(fs.readFileSync(_sbomMetaFile(jobId),'utf8')) }
  catch { return { status:'unknown', meta:{}, offset:0 } }
}

async function sbomSetStatus(jobId, status) {
  const m = await _sbomReadMeta(jobId)
  m.status = status
  fs.writeFileSync(_sbomMetaFile(jobId), JSON.stringify(m,null,2))
}

async function sbomSetMeta(jobId, metaPatch) {
  const m = await _sbomReadMeta(jobId)
  m.meta = { ...(m.meta||{}), ...(metaPatch||{}) }
  fs.writeFileSync(_sbomMetaFile(jobId), JSON.stringify(m,null,2))
}

async function sbomAddLog(jobId, line) {
  fs.appendFileSync(_sbomLogFile(jobId), `${line}\n`)
}

async function sbomFinishJob(jobId, reason='done') {
  const m = await _sbomReadMeta(jobId)
  m.status = 'done'
  m.reason = reason
  m.finishedAt = new Date().toISOString()
  fs.writeFileSync(_sbomMetaFile(jobId), JSON.stringify(m,null,2))
}

async function sbomFailJob(jobId, reason='error') {
  const m = await _sbomReadMeta(jobId)
  m.status = 'error'
  m.reason = reason
  m.finishedAt = new Date().toISOString()
  fs.writeFileSync(_sbomMetaFile(jobId), JSON.stringify(m,null,2))
}

async function sbomCancelJob(jobId, reason='cancelled') {
  const m = await _sbomReadMeta(jobId)
  m.status = 'cancelled'
  m.reason = reason
  m.finishedAt = new Date().toISOString()
  fs.writeFileSync(_sbomMetaFile(jobId), JSON.stringify(m,null,2))
  await sbomAddLog(jobId, `작업이 사용자에 의해 취소되었습니다.`)
}

async function sbomReadSince(jobId, offset=0) {
  const file = _sbomLogFile(jobId)
  let content = ''
  try { content = fs.readFileSync(file,'utf8') } catch {}
  const lines = content.split('\n')
  const sliced = lines.slice(offset).filter(Boolean)
  const nextOffset = lines.filter(Boolean).length
  const meta = await _sbomReadMeta(jobId)
  return { status: meta.status, logAppend: sliced, installedCount: meta.meta?.installedCount, pathCount: meta.meta?.pathCount, dirCount: meta.meta?.dirCount, progress: meta.meta?.progress, nextOffset }
}

const SBOM_FORMAT = process.env.SBOM_FORMAT || 'spdx-json'

function sbomSh(cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 1024 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      if (err) {
        const error = new Error(stderr || err.message)
        error.stdout = stdout
        error.stderr = stderr
        error.code = err.code
        return reject(error)
      }
      resolve(stdout.trim())
    })
  })
}

function sbomSpawnPromise(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const timeout = options.timeout || 3600000
    const child = spawn(cmd, args, { shell: false, ...options })
    let stdout = ''
    let stderr = ''
    let timeoutId = null
    
    if (timeout > 0) {
      timeoutId = setTimeout(() => {
        child.kill()
        reject({ 
          code: -1, 
          stdout, 
          stderr, 
          message: `Process timed out after ${timeout / 1000} seconds` 
        })
      }, timeout)
    }
    
    child.stdout.on('data', (d) => { stdout += d.toString() })
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.on('error', (err) => { 
      if (timeoutId) clearTimeout(timeoutId)
      reject({ error: err, stdout, stderr }) 
    })
    child.on('close', (code) => {
      if (timeoutId) clearTimeout(timeoutId)
      if (code !== 0) {
        const errorMsg = stderr || stdout || `Process exited with code ${code}`
        reject({ code, stdout, stderr, message: errorMsg })
      } else {
        resolve({ stdout, stderr, code: 0 })
      }
    })
  })
}

function sbomFindAllMatchingFiles(dir, patterns) {
  try {
    if (!fs.existsSync(dir)) return []
    
    const files = []
    const searchDir = (currentDir) => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name)
        if (entry.isDirectory()) {
          searchDir(fullPath)
        } else if (entry.isFile()) {
          const matches = patterns.some(pattern => {
            if (pattern.includes('*')) {
              const regex = new RegExp(pattern.replace(/\*/g, '.*'))
              return regex.test(entry.name)
            }
            return entry.name === pattern || entry.name.endsWith(pattern)
          })
          if (matches) {
            files.push(fullPath)
          }
        }
      }
    }
    
    searchDir(dir)
    
    files.sort((a, b) => {
      const statA = fs.statSync(a)
      const statB = fs.statSync(b)
      return statB.mtimeMs - statA.mtimeMs
    })
    
    return files
  } catch (e) {
    return []
  }
}

async function runSourceSbomJob({ 
  jobId, repoUrl, branch = 'main', subdir = '',
  authType = 'none', authValue = '', outputFormat = 'json'
}) {
  // Docker 컨테이너 사용
  const FOSSLIGHT_CONTAINER = 'fosslight_scanner'
  
  // 컨테이너 내부 경로만 사용 (볼륨 마운트: /app/repos, /app/output)
  const containerRepoDir = `/app/repos/sbom-${jobId}/repo`
  let containerScanDir = subdir ? `${containerRepoDir}/${subdir}` : containerRepoDir
  const containerOutputDir = `/app/output/sbom-${jobId}`

  // Docker exec helper 함수
  const dockerExec = async (command) => {
    try {
      const dockerCmd = `docker exec -i ${FOSSLIGHT_CONTAINER} ${command}`
      const result = await execPromise(dockerCmd)
      return result
    } catch (e) {
      // execPromise는 { error, stdout, stderr } 형태로 reject
      const errorMsg = e.stderr || e.message || e.error?.message || 'Docker exec failed'
      const error = new Error(errorMsg)
      error.stdout = e.stdout || ''
      error.stderr = e.stderr || ''
      error.code = e.error?.code
      throw error
    }
  }

  try {
    const startedAt = new Date().toISOString()
    await sbomSetStatus(jobId, 'running')
    await sbomSetMeta(jobId, { startedAt, installedCount: 0, pathCount: 0, dirCount: 0, progress: 0 })
    await sbomAddLog(jobId, `Docker 컨테이너 실행 모드 (${FOSSLIGHT_CONTAINER})`)
    await sbomAddLog(jobId, `Repo: ${repoUrl} (branch=${branch}, subdir=${subdir || '.'})`)
    await sbomAddLog(jobId, `인증: ${authType}, 출력포맷: ${outputFormat}`)

    await sbomAddLog(jobId, `작업 디렉토리 (컨테이너): repos=${containerRepoDir}, output=${containerOutputDir}`)
    await sbomAddLog(jobId, `메모리/디스크: git clone --depth 1 사용 (최신 버전만), 작업 완료 후 자동 정리`)

    try {
      let gitCloneUrl = repoUrl
      
      if (authType === 'token' || authType === 'oauth') {
        const token = authValue.trim()
        if (!token) {
          throw new Error('토큰이 제공되지 않았습니다.')
        }
        
        if (repoUrl.startsWith('https://')) {
          gitCloneUrl = repoUrl.replace(/^https:\/\//, `https://${token}@`)
          await sbomAddLog(jobId, `토큰 인증 사용 (${authType === 'token' ? 'PAT' : 'OAuth'})`)
        } else {
          throw new Error('토큰 인증은 HTTPS URL만 지원합니다.')
        }
      }
      
      if (authType === 'token' || authType === 'oauth' || authType === 'none') {
        await sbomAddLog(jobId, `git clone 시작... (컨테이너 내부)`)
        await sbomAddLog(jobId, `Repository: ${repoUrl}, Branch: ${branch}`)
        await sbomSetMeta(jobId, { progress: 10 })
        
        // 컨테이너 내부에서 git clone 실행 (/app/repos/sbom-${jobId} 디렉토리에)
        const containerWorkDir = `/app/repos/sbom-${jobId}`
        let gitCloneCmd = `bash -c "mkdir -p ${containerWorkDir} && cd ${containerWorkDir} && git clone --depth 1 --branch ${branch} ${gitCloneUrl} repo"`
        
        try {
          const cloneResult = await dockerExec(gitCloneCmd)
          await sbomAddLog(jobId, `✓ git clone 완료`)
          await sbomSetMeta(jobId, { progress: 20 })
          if (cloneResult.stderr) {
            await sbomAddLog(jobId, `git clone stderr: ${cloneResult.stderr.substring(0, 200)}`)
          }
        } catch (e) {
          const errorMsg = e.stderr || e.message || String(e)
          if (errorMsg.includes('not found') || errorMsg.includes('remote branch')) {
            await sbomAddLog(jobId, `branch '${branch}'를 찾을 수 없습니다. 기본 branch로 클론 시도`)
            gitCloneCmd = `bash -c "mkdir -p ${containerWorkDir} && cd ${containerWorkDir} && git clone --depth 1 ${gitCloneUrl} repo"`
            const cloneResult = await dockerExec(gitCloneCmd)
            await sbomAddLog(jobId, `✓ git clone 완료 (기본 branch 사용)`)
            await sbomSetMeta(jobId, { progress: 20 })
            if (cloneResult.stderr) {
              await sbomAddLog(jobId, `git clone stderr: ${cloneResult.stderr.substring(0, 200)}`)
            }
          } else {
            await sbomAddLog(jobId, `git clone 실패: ${errorMsg.substring(0, 200)}`)
            throw e
          }
        }
      }
      // 컨테이너 내부에서 디렉토리 확인 및 자동 subdir 감지
      try {
        const checkResult = await dockerExec(`bash -c "ls -la ${containerRepoDir} 2>/dev/null | head -20"`)
        await sbomAddLog(jobId, `클론된 디렉토리 확인 완료`)
        if (checkResult.stdout) {
          await sbomAddLog(jobId, `디렉토리 내용: ${checkResult.stdout.substring(0, 300)}`)
        }
        
        // subdir이 비어있거나 '.'일 때 자동으로 실제 소스 디렉토리 찾기
        if (!subdir || subdir === '.' || subdir.trim() === '') {
          await sbomAddLog(jobId, `subdir이 지정되지 않음. 자동으로 소스 디렉토리 탐색 중...`)
          
          // .git을 제외한 디렉토리 찾기
          const findDirs = await dockerExec(`bash -c "find ${containerRepoDir} -maxdepth 1 -type d ! -name '.git' ! -name '.' ! -path '${containerRepoDir}' | head -5"`)
          
          if (findDirs.stdout && findDirs.stdout.trim()) {
            const dirs = findDirs.stdout.trim().split('\n').filter(d => d.trim())
            await sbomAddLog(jobId, `발견된 하위 디렉토리: ${dirs.length}개`)
            
            // 첫 번째 디렉토리 사용 (또는 가장 많은 파일이 있는 디렉토리)
            if (dirs.length > 0) {
              // 각 디렉토리의 파일 개수 확인
              let bestDir = dirs[0]
              let maxFiles = 0
              
              for (const dir of dirs) {
                const fileCountResult = await dockerExec(`bash -c "find '${dir}' -type f 2>/dev/null | wc -l"`)
                const fileCount = parseInt(fileCountResult.stdout.trim()) || 0
                await sbomAddLog(jobId, `  - ${path.basename(dir)}: ${fileCount}개 파일`)
                
                if (fileCount > maxFiles) {
                  maxFiles = fileCount
                  bestDir = dir
                }
              }
              
              // containerScanDir 업데이트
              containerScanDir = bestDir
              const detectedSubdir = bestDir.replace(containerRepoDir + '/', '')
              await sbomAddLog(jobId, `✓ 자동 선택된 디렉토리: ${detectedSubdir} (${maxFiles}개 파일)`)
            }
          } else {
            // 하위 디렉토리가 없으면 루트 디렉토리 사용
            await sbomAddLog(jobId, `하위 디렉토리가 없음. 루트 디렉토리에서 스캔합니다.`)
          }
        }
      } catch (e) {
        await sbomAddLog(jobId, `경고: 클론된 디렉토리 확인 실패 (계속 진행): ${e.message?.substring(0, 100)}`)
      }
    } catch (e) {
      await sbomAddLog(jobId, `git clone 실패: ${e.message?.substring(0, 300)}`)
      await sbomFailJob(jobId, 'git clone failed')
      return
    }

    // FOSSLight 공식 포맷: excel, csv, opossum, yaml, spdx-tag, spdx-yaml, spdx-json, spdx-xml
    // json 요청 시 opossum 사용
    const fosslightFormat = outputFormat === 'excel' ? 'excel' : 
                            outputFormat === 'csv' ? 'csv' : 
                            outputFormat === 'yaml' ? 'yaml' : 
                            outputFormat === 'opossum' ? 'opossum' :
                            outputFormat === 'json' ? 'opossum' : 
                            outputFormat === 'spdx-tag' ? 'spdx-tag' :
                            outputFormat === 'spdx-yaml' ? 'spdx-yaml' :
                            outputFormat === 'spdx-json' ? 'spdx-json' :
                            outputFormat === 'spdx-xml' ? 'spdx-xml' :
                            'excel'
    
    try {
      await sbomAddLog(jobId, `fosslight_source 실행 시작 (컨테이너 내부)`)
      await sbomAddLog(jobId, `출력 포맷: ${fosslightFormat} (요청: ${outputFormat})`)
      await sbomSetMeta(jobId, { progress: 25 })
      
      // 스캔할 디렉토리 내용 확인
      try {
        const scanDirCheck = await dockerExec(`bash -c "ls -la '${containerScanDir}' 2>/dev/null | head -30"`)
        await sbomAddLog(jobId, `스캔 디렉토리 (${containerScanDir}) 내용:`)
        if (scanDirCheck.stdout) {
          await sbomAddLog(jobId, scanDirCheck.stdout.substring(0, 500))
        }
        
        // 파일 개수 확인 및 메타데이터 업데이트
        const fileCount = await dockerExec(`bash -c "find '${containerScanDir}' -type f 2>/dev/null | wc -l"`)
        const actualFileCount = parseInt(fileCount.stdout.trim()) || 0
        await sbomAddLog(jobId, `발견된 파일 개수: ${actualFileCount}`)
        
        // 디렉토리 개수 확인
        const dirCount = await dockerExec(`bash -c "find '${containerScanDir}' -type d 2>/dev/null | wc -l"`)
        const actualDirCount = parseInt(dirCount.stdout.trim()) || 0
        await sbomAddLog(jobId, `발견된 디렉토리 개수: ${actualDirCount}`)
        
        // 실제 파일 개수와 디렉토리 개수로 메타데이터 업데이트 (항상 업데이트, 0이어도)
        await sbomSetMeta(jobId, { pathCount: actualFileCount, dirCount: actualDirCount })
        await sbomAddLog(jobId, `✓ 메타데이터 업데이트: pathCount=${actualFileCount}, dirCount=${actualDirCount}`)
      } catch (e) {
        await sbomAddLog(jobId, `경고: 스캔 디렉토리 확인 실패 (계속 진행): ${e.message?.substring(0, 100)}`)
      }
      
      // 공식 문서: fosslight_source -p dir_to_analyze -o output -f format
      // 컨테이너 내부 경로 사용: /app/repos (소스), /app/output (결과)
      // containerScanDir: /app/repos/sbom-${jobId}/repo (또는 /subdir)
      // containerOutputDir: /app/output/sbom-${jobId}
      // 공식 문서 예시: -p dir_to_analyze -o output
      const fosslightCmd = `fosslight_source -p "${containerScanDir}" -o "${containerOutputDir}" -f ${fosslightFormat}`
      
      await sbomAddLog(jobId, `fosslight_source 명령어 실행 중`)
      await sbomAddLog(jobId, `명령어 (컨테이너): ${fosslightCmd}`)
      await sbomSetMeta(jobId, { progress: 30 })
      
      // 컨테이너 내부에서 fosslight_scanner 실행
      // 실행 중에는 주기적으로 진행률 업데이트
      let progressInterval = null
      try {
        progressInterval = setInterval(async () => {
          try {
            // 로그 파일에서 진행 상황 확인
            const logCheckCmd = `bash -c "tail -20 ${containerOutputDir}/fosslight_log/*.txt 2>/dev/null | grep -i 'progress\\|complete\\|done\\|analyzing' | tail -1 || echo ''"`
            const logResult = await dockerExec(logCheckCmd)
            if (logResult.stdout && logResult.stdout.trim()) {
              // 로그에서 진행 상황이 있으면 증가 
              const currentMeta = await _sbomReadMeta(jobId)
              const currentProgress = currentMeta.meta?.progress || 30
              if (currentProgress < 75) {
                await sbomSetMeta(jobId, { progress: Math.min(currentProgress + 2, 75) })
              }
            }
          } catch (e) {}
        }, 5000) // 5초마다 확인
        
        let scanResult
        try {
          scanResult = await dockerExec(fosslightCmd)
        } catch (e) {
          // stderr에 버전 정보만 있으면 무시 
          const stderr = e.stderr || ''
          const isVersionWarningOnly = stderr.includes('Version Info') && 
                                       stderr.includes('Newer version is available') &&
                                       !stderr.toLowerCase().includes('error') &&
                                       !stderr.toLowerCase().includes('failed') &&
                                       !stderr.toLowerCase().includes('exception')
          
          if (isVersionWarningOnly) {
            // 버전 경고만 있으면 성공으로 처리
            scanResult = { stdout: e.stdout || '', stderr: stderr }
            await sbomAddLog(jobId, `⚠ 버전 경고 (무시): ${stderr.substring(0, 200)}`)
          } else {
            // 실제 에러인 경우 throw
            throw e
          }
        }
        
        if (progressInterval) clearInterval(progressInterval)
        await sbomAddLog(jobId, `✓ fosslight_source 실행 완료`)
        await sbomSetMeta(jobId, { progress: 80 })
      
        if (scanResult.stdout) {
          await sbomAddLog(jobId, `fosslight_source 출력: ${scanResult.stdout.substring(0, 500)}`)
        }
        if (scanResult.stderr && !scanResult.stderr.includes('Version Info')) {
          await sbomAddLog(jobId, `fosslight_source stderr: ${scanResult.stderr.substring(0, 500)}`)
        }
      } finally {
        if (progressInterval) clearInterval(progressInterval)
      }
    } catch (e) {
      let errorDetail = ''
      if (e.message) {
        errorDetail = e.message
      } else if (e.stderr) {
        errorDetail = e.stderr
      } else if (e.stdout) {
        errorDetail = e.stdout
      } else if (typeof e === 'string') {
        errorDetail = e
      } else {
        try {
          errorDetail = JSON.stringify(e, null, 2)
        } catch {
          errorDetail = String(e)
        }
      }
      
      await sbomAddLog(jobId, `fosslight_source 실행 실패: ${errorDetail.substring(0, 500)}`)
      if (e.stderr && e.stderr.length > 500) {
        await sbomAddLog(jobId, `stderr 전체: ${e.stderr.substring(0, 1000)}`)
      }
      if (e.stdout && e.stdout.length > 500) {
        await sbomAddLog(jobId, `stdout 전체: ${e.stdout.substring(0, 1000)}`)
      }
      
      await sbomFailJob(jobId, 'scan failed')
      return
    }

    try {
      // 컨테이너 내부에서 결과 파일 검색 
      await sbomAddLog(jobId, `결과 파일 검색 중 (컨테이너: ${containerOutputDir})`)
      await sbomSetMeta(jobId, { progress: 85 })
      
      // 컨테이너 내부에서 모든 파일 목록 가져오기
      const findFilesCmd = `bash -c "find ${containerOutputDir} -type f 2>/dev/null || echo ''"`
      const findResult = await dockerExec(findFilesCmd)
      const fileListStr = findResult.stdout || ''
      const allFiles = fileListStr.split('\n').filter(line => line.trim() !== '')
      
      await sbomAddLog(jobId, `발견된 파일 수: ${allFiles.length}`)
      await sbomSetMeta(jobId, { progress: 90 })
      if (allFiles.length > 0) {
        await sbomAddLog(jobId, `파일 목록: ${allFiles.slice(0, 5).join(', ')}${allFiles.length > 5 ? '...' : ''}`)
        await sbomAddLog(jobId, `발견된 모든 파일: ${allFiles.map(f => path.basename(f)).join(', ')}`)
      }
      
      // 요청한 포맷에 맞는 확장자 파일 찾기
      const expectedExtensions = {
        'excel': ['.xlsx'],
        'csv': ['.csv'],
        'opossum': ['.json'],
        'yaml': ['.yaml', '.yml'],
        'spdx-json': ['.spdx.json', '.json'], // .json 확장자도 허용 (파일명에 spdx 포함)
        'spdx-yaml': ['.spdx.yaml', '.yaml', '.yml'], // .yaml/.yml 확장자도 허용
        'spdx-tag': ['.spdx', '.tag'],
        'spdx-xml': ['.spdx.xml', '.xml'] // .xml 확장자도 허용
      }
      
      const extensions = expectedExtensions[fosslightFormat] || expectedExtensions[outputFormat] || ['.xlsx', '.csv', '.json', '.yaml', '.yml']
      
      // 컨테이너 내부 파일 경로로 필터링 
      const matchingFiles = []
      for (const containerFile of allFiles) {
        const basename = path.basename(containerFile).toLowerCase()
        const basenameWithoutExt = path.basename(containerFile, path.extname(containerFile)).toLowerCase()
        const lastExt = path.extname(containerFile).toLowerCase()
        const secondLastExt = path.extname(basenameWithoutExt).toLowerCase()
        const combinedExt = secondLastExt && secondLastExt !== '' ? (secondLastExt + lastExt) : lastExt
        
        let matches = false
        
        // SPDX 포맷인 경우: 파일명에 "spdx" 포함 + 확장자 일치
        if (fosslightFormat.startsWith('spdx-')) {
          // SPDX 파일은 파일명에 "spdx"가 포함되어야 함
          if (basename.includes('spdx')) {
            // 확장자가 일치하는지 확인 
            const extMatches = extensions.includes(lastExt) || extensions.includes(combinedExt)
            matches = extMatches
          }
        } else {
          // 일반 포맷인 경우 확장자만 확인 (SPDX 파일 제외)
          const extMatches = extensions.includes(lastExt) || extensions.includes(combinedExt)
          matches = extMatches && !basename.includes('spdx')
        }
        
        if (matches) {
          // 컨테이너 내부 파일의 수정 시간 가져오기
          try {
            const statCmd = `bash -c "stat -c %Y ${containerFile} 2>/dev/null || echo 0"`
            const statResult = await dockerExec(statCmd)
            const mtime = parseInt(statResult.stdout.trim()) || 0
            matchingFiles.push({
              containerPath: containerFile,
              mtime: mtime
            })
          } catch (e) {
            matchingFiles.push({
              containerPath: containerFile,
              mtime: 0
            })
          }
        }
      }
      
      // 최신 파일 우선 정렬
      matchingFiles.sort((a, b) => b.mtime - a.mtime)
      
      if (matchingFiles.length === 0) {
        await sbomAddLog(jobId, `발견된 모든 파일: ${allFiles.map(f => path.basename(f)).join(', ')}`)
        throw new Error(`요청한 포맷(${fosslightFormat})에 맞는 파일을 찾지 못했습니다.`)
      }
      
      // 최신 파일 선택
      const primaryContainerFile = matchingFiles[0].containerPath
      
      for (const file of matchingFiles) {
        const mtimeStr = file.mtime > 0 ? new Date(file.mtime * 1000).toISOString() : 'unknown'
        await sbomAddLog(jobId, `발견된 결과 파일: ${path.basename(file.containerPath)} (${mtimeStr})`)
      }
      
      await sbomAddLog(jobId, `선택된 결과 파일: ${path.basename(primaryContainerFile)}`)
      
      // 컨테이너에서 결과 파일을 호스트로 복사
      const safeRepo = repoUrl.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60)
      // 현재 시간을 파일명 타임스탬프로 사용
      const now = new Date()
      const timestamp = now.toISOString().replace(/[:.]/g, '').replace('T', '_').replace('Z', '')
      const tempHostFile = path.join(require('os').tmpdir(), `sbom-${jobId}-${Date.now()}.tmp`)
      
      try {
        // 컨테이너 파일을 호스트 임시 파일로 복사
        const copyCmd = `docker cp ${FOSSLIGHT_CONTAINER}:${primaryContainerFile} ${tempHostFile}`
        await execPromise(copyCmd)
        await sbomAddLog(jobId, `✓ 결과 파일 복사 완료: ${tempHostFile}`)
        
        // 파일 확장자 확인 (바이너리 파일인지 텍스트 파일인지)
        const tempExt = path.extname(primaryContainerFile).toLowerCase()
        const isBinaryFile = tempExt === '.xlsx' || tempExt === '.xls'
        
        // 바이너리 파일은 바이너리로, 텍스트 파일은 UTF-8로 읽기
        const fileContent = isBinaryFile 
          ? fs.readFileSync(tempHostFile) // 바이너리 모드 (기본값)
          : fs.readFileSync(tempHostFile, 'utf8') // 텍스트 모드
        
        // 확장자는 실제 파일의 확장자 사용
        let ext = path.extname(primaryContainerFile)
        const basename = path.basename(primaryContainerFile).toLowerCase()
        
        // 확장자가 없거나 잘못된 경우 포맷에 따라 설정
        if (!ext || ext === '') {
          if (basename.includes('spdx')) {
            if (fosslightFormat === 'spdx-tag') ext = '.tag'
            else if (fosslightFormat === 'spdx-xml') ext = '.xml'
            else if (fosslightFormat === 'spdx-yaml') ext = '.yaml'
            else if (fosslightFormat === 'spdx-json') ext = '.json'
            else ext = '.xml'
          } else {
            ext = fosslightFormat === 'excel' ? '.xlsx' : 
                  fosslightFormat === 'csv' ? '.csv' : 
                  fosslightFormat === 'yaml' ? '.yaml' : 
                  fosslightFormat === 'opossum' ? '.json' : '.json'
          }
        }
        
        // 파일명 생성 
        const local = `${timestamp}_${safeRepo}_source${ext}`
        const finalPath = path.join(SBOM_RESULTS_DIR, local)
        
        // 검사 완료 시간 기록 
        const fileFinishedAt = new Date()
        const fileFinishedAtMs = fileFinishedAt.getTime()
        
        // 모든 파일 형식의 시간 정보를 현재 시간으로 업데이트
        // 주의: 파일 내용을 수정할 때는 원본을 최대한 보존하고 필요한 부분만 수정
        // 바이너리 파일(Excel)은 내용 수정하지 않음
        let updatedContent = fileContent
        const currentTimeISO = fileFinishedAt.toISOString()
        const currentTimeDate = fileFinishedAt.toISOString().split('T')[0] 
        
        // Excel 파일은 바이너리이므로 내용 수정하지 않음
        if (isBinaryFile) {
          await sbomAddLog(jobId, `바이너리 파일(Excel)은 내용 수정 없이 원본 그대로 저장합니다.`)
        } else {
          try {
            // 원본 파일 크기 기록 (디버깅용)
            const originalSize = fileContent.length
            await sbomAddLog(jobId, `원본 파일 크기: ${originalSize} bytes`)
            
            // JSON 파일 (SPDX, Opossum 등 모든 형식)
            if (ext === '.json' || ext === '.spdx.json') {
              const fileContentStr = fileContent.toString('utf8')
            let jsonContent
            try {
              jsonContent = JSON.parse(fileContentStr)
        } catch (e) {
              await sbomAddLog(jobId, `JSON 파싱 실패 (시간 업데이트 스킵): ${e.message?.substring(0, 100)}`)
            }
            
            if (jsonContent) {
              let updated = false
              
              // SPDX 형식: creationInfo.created
              if (jsonContent.spdxVersion || jsonContent.SPDXID) {
                if (!jsonContent.creationInfo) {
                  jsonContent.creationInfo = {}
                }
                if (jsonContent.creationInfo.created !== currentTimeISO) {
                  jsonContent.creationInfo.created = currentTimeISO
                  updated = true
                  await sbomAddLog(jobId, `✓ SPDX creationInfo.created 업데이트: ${currentTimeISO}`)
                }
              }
              
              // Opossum 형식: metadata.createdAt 또는 createdAt
              if (jsonContent.items || jsonContent.metadata) {
                if (jsonContent.metadata && jsonContent.metadata.createdAt) {
                  jsonContent.metadata.createdAt = currentTimeISO
                  updated = true
                  await sbomAddLog(jobId, `✓ Opossum metadata.createdAt 업데이트: ${currentTimeISO}`)
                }
                if (jsonContent.createdAt) {
                  jsonContent.createdAt = currentTimeISO
                  updated = true
                  await sbomAddLog(jobId, `✓ JSON createdAt 업데이트: ${currentTimeISO}`)
                }
              }
              
              // 일반 JSON: createdAt, created, timestamp 등
              if (jsonContent.createdAt) {
                jsonContent.createdAt = currentTimeISO
                updated = true
                await sbomAddLog(jobId, `✓ JSON createdAt 업데이트: ${currentTimeISO}`)
              }
              if (jsonContent.created) {
                jsonContent.created = currentTimeISO
                updated = true
                await sbomAddLog(jobId, `✓ JSON created 업데이트: ${currentTimeISO}`)
              }
              if (jsonContent.timestamp) {
                jsonContent.timestamp = currentTimeISO
                updated = true
                await sbomAddLog(jobId, `✓ JSON timestamp 업데이트: ${currentTimeISO}`)
              }
              
              if (updated) {
                updatedContent = Buffer.from(JSON.stringify(jsonContent, null, 2), 'utf8')
              }
            }
          } 
          // XML 파일 (SPDX XML 등)
          else if (ext === '.xml' || ext === '.spdx.xml') {
            const xmlContent = fileContent.toString('utf8')
            let newContent = xmlContent
            let updated = false
            
            // SPDX XML: <creationInfo><created>
            const spdxCreatedPattern = /(<creationInfo>[\s\S]*?<created>)([^<]+)(<\/created>)/i
            if (spdxCreatedPattern.test(newContent)) {
              newContent = newContent.replace(spdxCreatedPattern, `$1${currentTimeISO}$3`)
              updated = true
              await sbomAddLog(jobId, `✓ SPDX XML creationInfo.created 업데이트: ${currentTimeISO}`)
            }
            
            // 일반 XML: <created>, <timestamp>, <date> 등
            const createdPattern = /(<created>)([^<]+)(<\/created>)/gi
            if (createdPattern.test(newContent)) {
              newContent = newContent.replace(createdPattern, `$1${currentTimeISO}$3`)
              updated = true
              await sbomAddLog(jobId, `✓ XML created 업데이트: ${currentTimeISO}`)
            }
            
            const timestampPattern = /(<timestamp>)([^<]+)(<\/timestamp>)/gi
            if (timestampPattern.test(newContent)) {
              newContent = newContent.replace(timestampPattern, `$1${currentTimeISO}$3`)
              updated = true
              await sbomAddLog(jobId, `✓ XML timestamp 업데이트: ${currentTimeISO}`)
            }
            
            if (updated) {
              updatedContent = Buffer.from(newContent, 'utf8')
            }
          } 
          // YAML 파일 (SPDX YAML 등) 
          else if (ext === '.yaml' || ext === '.yml' || ext === '.spdx.yaml') {
            const yamlContent = fileContent.toString('utf8')
            let newContent = yamlContent
            let updated = false
            
            // SPDX YAML: creationInfo: created:
            // creationInfo 섹션 내의 created 필드만 수정
            const spdxCreatedPattern = /(creationInfo:\s*\n(?:\s+[^\n]+\n)*?\s+created:\s*)([^\n]+)/i
            const spdxMatch = newContent.match(spdxCreatedPattern)
            if (spdxMatch) {
              newContent = newContent.replace(spdxCreatedPattern, `$1${currentTimeISO}`)
              updated = true
              await sbomAddLog(jobId, `✓ SPDX YAML creationInfo.created 업데이트: ${currentTimeISO}`)
            }
            
            // 일반 YAML: 최상위 레벨의 createdAt:, created: 만 수정
            // ^로 시작하는 줄의 시작 부분만 매칭하여 중첩된 필드는 건드리지 않음
            const topLevelCreatedAtPattern = /(^createdAt:\s*)([^\n]+)/m
            if (topLevelCreatedAtPattern.test(newContent) && !updated) {
              newContent = newContent.replace(topLevelCreatedAtPattern, `$1${currentTimeISO}`)
              updated = true
              await sbomAddLog(jobId, `✓ YAML createdAt 업데이트: ${currentTimeISO}`)
            }
            
            const topLevelCreatedPattern = /(^created:\s*)([^\n]+)/m
            if (topLevelCreatedPattern.test(newContent) && !updated) {
              newContent = newContent.replace(topLevelCreatedPattern, `$1${currentTimeISO}`)
              updated = true
              await sbomAddLog(jobId, `✓ YAML created 업데이트: ${currentTimeISO}`)
            }
            
            if (updated) {
              updatedContent = Buffer.from(newContent, 'utf8')
              await sbomAddLog(jobId, `YAML 파일 업데이트 후 크기: ${updatedContent.length} bytes`)
            } else {
              // 업데이트 없음 - 원본 그대로 사용
              updatedContent = fileContent
            }
          } 
          // Tag 파일 (SPDX Tag)
          else if (ext === '.tag' || ext === '.spdx.tag') {
            const tagContent = fileContent.toString('utf8')
            let newContent = tagContent
            let updated = false
            
            // SPDX Tag: CreationInfo: Created:
            const spdxCreatedPattern = /(^CreationInfo:\s*\n(?:[^\n]+\n)*?Created:\s*)([^\n]+)/im
            if (spdxCreatedPattern.test(newContent)) {
              newContent = newContent.replace(spdxCreatedPattern, `$1${currentTimeISO}`)
              updated = true
              await sbomAddLog(jobId, `✓ SPDX Tag CreationInfo.Created 업데이트: ${currentTimeISO}`)
            }
            
            // 일반 Tag: Created:, Timestamp: 등
            const createdPattern = /(^Created:\s*)([^\n]+)/gim
            if (createdPattern.test(newContent)) {
              newContent = newContent.replace(createdPattern, `$1${currentTimeISO}`)
              updated = true
              await sbomAddLog(jobId, `✓ Tag Created 업데이트: ${currentTimeISO}`)
            }
            
            if (updated) {
              updatedContent = Buffer.from(newContent, 'utf8')
            }
          }
          // CSV 파일
          else if (ext === '.csv') {
            const csvContent = fileContent.toString('utf8')
            let newContent = csvContent
            let updated = false
            
            // CSV 헤더나 주석에서 날짜/시간 패턴 찾기 
            const datePatterns = [
              { pattern: /(#\s*Generated:\s*)([^\n]+)/gi, name: 'Generated' },
              { pattern: /(#\s*Date:\s*)([^\n]+)/gi, name: 'Date' },
              { pattern: /(#\s*Created:\s*)([^\n]+)/gi, name: 'Created' },
              { pattern: /(#\s*Timestamp:\s*)([^\n]+)/gi, name: 'Timestamp' }
            ]
            
            for (const { pattern, name } of datePatterns) {
              // test() 대신 직접 replace를 시도하고 변경 여부 확인
              const beforeReplace = newContent
              newContent = newContent.replace(pattern, (match, prefix) => {
                updated = true
                return `${prefix}${currentTimeISO}`
              })
              
              if (updated && beforeReplace !== newContent) {
                await sbomAddLog(jobId, `✓ CSV ${name} 시간 정보 업데이트: ${currentTimeISO}`)
                break
              }
            }
            

            if (updated) {
              updatedContent = Buffer.from(newContent, 'utf8')
            } else {
              updatedContent = fileContent
            }
          }
          else if (ext === '.xlsx' || ext === '.xls') {
            updatedContent = fileContent
            await sbomAddLog(jobId, `Excel 파일은 바이너리 형식이므로 내용 수정 없이 원본 그대로 저장합니다.`)
          }
  } catch (e) {
            await sbomAddLog(jobId, `경고: 파일 시간 정보 업데이트 실패 (원본 그대로 저장): ${e.message?.substring(0, 100)}`)
            updatedContent = fileContent
          }
        }
        
        // 최종 파일 크기 확인
        await sbomAddLog(jobId, `최종 저장 파일 크기: ${updatedContent.length} bytes`)
        
        // 바이너리 파일은 바이너리로, 텍스트 파일은 UTF-8로 저장
        if (isBinaryFile) {
          // Excel 파일은 바이너리로 저장 (Buffer 그대로)
          fs.writeFileSync(finalPath, updatedContent)
        } else {
          // 텍스트 파일은 UTF-8로 저장
          if (Buffer.isBuffer(updatedContent)) {
            fs.writeFileSync(finalPath, updatedContent, 'utf8')
          } else {
            fs.writeFileSync(finalPath, updatedContent, 'utf8')
          }
        }
        
        // 검사 완료 시간을 파일의 수정 시간과 접근 시간으로 설정 (현재 시간 사용)
        try {
          const nowSeconds = Math.floor(Date.now() / 1000) // 초 단위 (정수)
          // atime (접근 시간)과 mtime (수정 시간)을 현재 시간으로 설정
          fs.utimesSync(finalPath, nowSeconds, nowSeconds)
          await sbomAddLog(jobId, `✓ 파일 시간 설정 완료: ${currentTimeISO}`)
    } catch (e) {
          await sbomAddLog(jobId, `경고: 파일 시간 설정 실패 (계속 진행): ${e.message?.substring(0, 100)}`)
        }
        await sbomAddLog(jobId, `✓ 저장 완료: ${local}`)
        await sbomAddLog(jobId, `저장 경로: ${finalPath}`)
        await sbomAddLog(jobId, `파일 크기: ${updatedContent.length} bytes`)
        
        // 결과 파일에서 패키지 수 추출 시도 (FOSSLight 기본 형식 + SPDX 형식)
        let packageCount = 0
        try {
          if (ext === '.json' || ext === '.spdx.json') {
            const jsonContent = JSON.parse(updatedContent.toString('utf8'))
            // SPDX JSON 형식
            if (jsonContent.packages && Array.isArray(jsonContent.packages)) {
              packageCount = jsonContent.packages.length
            } else if (jsonContent.spdxVersion && jsonContent.packages) {
              packageCount = jsonContent.packages.length
            } else if (jsonContent.items && Array.isArray(jsonContent.items)) {
              // Opossum 형식
              packageCount = jsonContent.items.length
            } else if (jsonContent.components && Array.isArray(jsonContent.components)) {
              // 기타 JSON 형식
              packageCount = jsonContent.components.length
            }
          } else if (ext === '.xml' || ext === '.spdx.xml') {
            const xmlContent = updatedContent.toString('utf8')
            // SPDX XML에서 package 태그 개수 확인
            const packageMatches = xmlContent.match(/<package /gi) || xmlContent.match(/<spdx:Package /gi)
            if (packageMatches) {
              packageCount = packageMatches.length
            }
          } else if (ext === '.yaml' || ext === '.yml' || ext === '.spdx.yaml') {
            const yamlContent = updatedContent.toString('utf8')
            // YAML에서 packages 섹션 찾기
            const packageMatches = yamlContent.match(/^  - name:/gm) || yamlContent.match(/^  PackageName:/gm) || yamlContent.match(/^- name:/gm)
            if (packageMatches) {
              packageCount = packageMatches.length
            }
          } else if (ext === '.tag' || ext === '.spdx.tag') {
            const tagContent = updatedContent.toString('utf8')
            // SPDX Tag 형식에서 PackageName 개수 확인
            const packageMatches = tagContent.match(/^PackageName:/gm)
            if (packageMatches) {
              packageCount = packageMatches.length
            }
          } else if (ext === '.csv') {
            const csvContent = updatedContent.toString('utf8')
            // CSV 형식: 헤더를 제외한 라인 개수
            const lines = csvContent.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'))
            if (lines.length > 1) {
              packageCount = lines.length - 1 // 헤더 제외
            }
          } else if (ext === '.xlsx' || ext === '.xls') {
            // Excel 파일 파싱 시도
            try {
              // xlsx 라이브러리 사용 시도
              let xlsx
              try {
                xlsx = require('xlsx')
    } catch (e) {
                // xlsx가 없으면 다른 방법 시도
                await sbomAddLog(jobId, `Excel 파싱 라이브러리(xlsx)가 없습니다. 간단한 방법으로 시도합니다.`)
                // Excel 파일을 ZIP으로 읽어서 시도 
                const AdmZip = require('adm-zip')
                const zip = new AdmZip(updatedContent)
                const zipEntries = zip.getEntries()
                // xl/sharedStrings.xml이나 시트 파일에서 데이터 추출 시도
                for (const entry of zipEntries) {
                  if (entry.entryName.includes('xl/worksheets/sheet') && entry.entryName.endsWith('.xml')) {
                    const sheetContent = entry.getData().toString('utf8')
                    // 행 개수
                    const rowMatches = sheetContent.match(/<row /gi)
                    if (rowMatches && rowMatches.length > 1) {
                      packageCount = rowMatches.length - 1 // 헤더 제외
                      break
                    }
                  }
                }
              }
              
              // xlsx 라이브러리가 있으면 사용
              if (xlsx && !packageCount) {
                const workbook = xlsx.read(updatedContent, { type: 'buffer' })
                if (workbook.SheetNames && workbook.SheetNames.length > 0) {
                  const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
                  const jsonData = xlsx.utils.sheet_to_json(firstSheet)
                  packageCount = jsonData.length
                }
              }
            } catch (excelError) {
              await sbomAddLog(jobId, `Excel 파싱 실패: ${excelError.message?.substring(0, 100)}`)
            }
          }
          
          if (packageCount > 0) {
            await sbomAddLog(jobId, `추출된 패키지 수: ${packageCount}`)
            await sbomSetMeta(jobId, { installedCount: packageCount })
          } else {
            await sbomAddLog(jobId, `패키지 수를 추출할 수 없습니다. (형식: ${ext})`)
          }
        } catch (e) {
          await sbomAddLog(jobId, `패키지 수 추출 실패 (계속 진행): ${e.message?.substring(0, 100)}`)
        }
        
        const jobFinishedAt = new Date().toISOString()
        await sbomSetMeta(jobId, { progress: 100, finishedAt: jobFinishedAt })
        await sbomFinishJob(jobId, 'done')
        
        // 임시 파일 정리
        try {
          fs.unlinkSync(tempHostFile)
        } catch (e) {}
      } catch (copyError) {
        await sbomAddLog(jobId, `결과 파일 복사 실패: ${copyError.message?.substring(0, 300)}`)
        throw copyError
      }
    } catch (e) {
      await sbomAddLog(jobId, `결과 회수 실패: ${e.message || e}`)
      await sbomFailJob(jobId, 'collect failed')
    }
  } catch (e) {
    await sbomAddLog(jobId, `전체 작업 실패: ${e.message || e}`)
    await sbomAddLog(jobId, `에러 스택: ${e.stack || 'N/A'}`)
    await sbomFailJob(jobId, 'job failed')
  } finally {
    try {
      await sbomAddLog(jobId, `작업 디렉토리 정리 중`)
      await dockerExec(`bash -c "rm -rf ${containerRepoDir} ${containerOutputDir} 2>/dev/null || true"`)
      await sbomAddLog(jobId, `✓ 작업 디렉토리 정리 완료`)
    } catch (e) {
      await sbomAddLog(jobId, `디렉토리 정리 경고: ${e.message?.substring(0, 100)}`)
    }
  }
}

// 라우터를 직접 엔드포인트로 변환 
app.get('/api/sbom/ping', (_req, res) => res.json({ ok: true }))

app.post('/api/sbom/jobs/:jobId/cancel', async (req, res) => {
  const jobId = req.params.jobId
  try {
    const meta = await _sbomReadMeta(jobId)
    if (meta.status === 'done' || meta.status === 'error' || meta.status === 'cancelled') {
      return res.status(400).json({ error: `작업이 이미 ${meta.status} 상태입니다.` })
    }
    await sbomCancelJob(jobId, 'user cancelled')
    res.json({ success: true, message: '작업이 취소되었습니다.' })
  } catch (e) {
    console.error('Cancel job error:', e)
    res.status(500).json({ error: e?.message || '작업 취소 실패' })
  }
})

app.get('/api/sbom/jobs/:jobId/status', async (req, res) => {
  const jobId = req.params.jobId
  const offset = Number(req.query.offset || 0)
  try {
    const data = await sbomReadSince(jobId, offset)
    res.json(data)
  } catch {
    res.json({ status:'error', logAppend:[], nextOffset: offset })
  }
})

app.get('/api/sbom/results', async (_req, res) => {
  try {
    const files = fs.readdirSync(SBOM_RESULTS_DIR)
      .filter(f => {
        const lower = f.toLowerCase()
        return lower.endsWith('.json') || lower.endsWith('.spdx.json') || 
               lower.endsWith('.yaml') || lower.endsWith('.yml') ||
               lower.endsWith('.xlsx') || lower.endsWith('.xls') ||
               lower.endsWith('.csv') ||
               lower.endsWith('.xml') || lower.endsWith('.tag') || lower.endsWith('.spdx.tag')
      })
    const rows = files
      .sort((a,b)=>fs.statSync(path.join(SBOM_RESULTS_DIR,b)).mtimeMs - fs.statSync(path.join(SBOM_RESULTS_DIR,a)).mtimeMs)
      .map(f => {
        const filePath = path.join(SBOM_RESULTS_DIR, f)
        const stat = fs.statSync(filePath)
        // 파일의 수정 시간을 현재 시간대로 표시
        const createdAt = new Date(stat.mtimeMs)
        // 로컬 시간대로 포맷팅 (YYYY-MM-DD HH:mm:ss)
        const year = createdAt.getFullYear()
        const month = String(createdAt.getMonth() + 1).padStart(2, '0')
        const day = String(createdAt.getDate()).padStart(2, '0')
        const hours = String(createdAt.getHours()).padStart(2, '0')
        const minutes = String(createdAt.getMinutes()).padStart(2, '0')
        const seconds = String(createdAt.getSeconds()).padStart(2, '0')
        const milliseconds = String(createdAt.getMilliseconds()).padStart(3, '0')
        const formattedTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`
        return {
        id: f, filename: f,
          createdAt: formattedTime
        }
      })
    res.json(rows)
  } catch { res.json([]) }
})

app.get('/api/sbom/results/:id/download', (req, res) => {
  const p = path.join(SBOM_RESULTS_DIR, req.params.id)
  if (!fs.existsSync(p)) return res.status(404).end()
  res.download(p)
})

app.delete('/api/sbom/results/:id', (req, res) => {
  try {
    const p = path.join(SBOM_RESULTS_DIR, req.params.id)
    if (!fs.existsSync(p)) {
      return res.status(404).json({ error: 'File not found' })
    }
    fs.unlinkSync(p)
    res.json({ success: true, message: 'File deleted successfully' })
  } catch (e) {
    console.error('Delete file error:', e)
    res.status(500).json({ error: e?.message || 'Failed to delete file' })
  }
})

app.get('/api/sbom/stats/monthly', (_req, res) => {
  try {
    if (!fs.existsSync(SBOM_META)) {
      return res.json([])
    }
    
    const metaFiles = fs.readdirSync(SBOM_META)
      .filter(f => f.endsWith('.json'))
    
    const monthlyCount = {}
    
    for (const file of metaFiles) {
      try {
        const metaPath = path.join(SBOM_META, file)
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
        
        if (meta.status === 'done' && meta.finishedAt) {
          const dt = new Date(meta.finishedAt)
          const monthKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
          monthlyCount[monthKey] = (monthlyCount[monthKey] || 0) + 1
        }
      } catch (e) {
      }
    }
    
    const rows = Object.keys(monthlyCount)
      .sort()
      .map(k => ({ month: k, count: monthlyCount[k] }))
    
    res.json(rows)
  } catch (e) {
    console.error('Stats error:', e)
    res.json([])
  }
})

app.post('/api/sbom/source/scan', express.json(), async (req, res) => {
  console.log('SBOM scan endpoint 호출됨!')
  console.log('요청 본문:', JSON.stringify(req.body, null, 2))
  try {
    console.log('SBOM scan request received:', req.body)
    
    const runnerId = String(req.body?.runnerId || '').trim()
    const repoUrl  = String(req.body?.repoUrl  || '').trim()
    const branch   = (req.body?.branch || 'main').trim()
    const subdir   = String(req.body?.subdir || '').trim()
    const mode     = (req.body?.mode || 'SOURCE').toUpperCase()
    const authType = String(req.body?.authType || 'none').trim()
    const authValue = String(req.body?.authValue || '').trim()
    const outputFormat = String(req.body?.outputFormat || 'json').trim()

    if (!repoUrl) {
      console.error('Missing required parameters:', { repoUrl })
      return res.status(400).json({ error: 'repoUrl required' })
    }

    const jobId = sbomNewJob()
    console.log('Created job:', jobId)
    
    res.json({ jobId, meta: {} })

    ;(async () => {
      try {
        await sbomAddLog(jobId, '소스코드 SBOM 요청 접수')
        await sbomSetStatus(jobId, 'queued')
        await sbomSetMeta(jobId, { installedCount: 0, pathCount: 0, dirCount: 0 })
        await sbomAddLog(jobId, `파라미터: repoUrl=${repoUrl}, mode=${mode}, authType=${authType}, outputFormat=${outputFormat}`)
        
        await runSourceSbomJob({ 
          jobId, runnerId, repoUrl, branch, subdir, mode,
          authType, authValue, outputFormat
        })
      } catch (e) {
        console.error('SBOM job error:', e)
        await sbomAddLog(jobId, `시작 실패: ${e?.message || e}`)
        await sbomAddLog(jobId, `에러 스택: ${e?.stack || 'N/A'}`)
        await sbomFailJob(jobId, 'start failed')
      }
    })()
  } catch (e) {
    console.error('SBOM scan endpoint error:', e)
    res.status(500).json({ error: e?.message || 'Internal server error' })
  }
})

console.log('SBOM 엔드포인트 등록 완료')
  console.log('등록된 엔드포인트:')
  console.log('   - POST /api/sbom/source/scan')
  console.log('   - GET  /api/sbom/jobs/:jobId/status')
  console.log('   - GET  /api/sbom/results')
  console.log('   - GET  /api/sbom/ping')
// [끝] 어플리케이션 통제의 SBOM 생성 기능 끝 ==

// ========================================
// 신원 통제 - 차단 규칙 관리 API (추가)
// ========================================

// 차단 규칙 저장 파일 경로
const blockRulesFile = path.join(__dirname, 'blockRules.json')

// 차단 규칙 로드
const loadBlockRules = () => {
  try {
    if (fs.existsSync(blockRulesFile)) {
      const data = fs.readFileSync(blockRulesFile, 'utf8')
      return JSON.parse(data)
    }
  } catch (error) {
    console.error('차단 규칙 로드 실패:', error)
  }
  return []
}

// 차단 규칙 저장
const saveBlockRules = (rules) => {
  try {
    fs.writeFileSync(blockRulesFile, JSON.stringify(rules, null, 2), 'utf8')
    return true
  } catch (error) {
    console.error('차단 규칙 저장 실패:', error)
    return false
  }
}

// 차단 규칙 조회 API
app.get('/api/block-rules', (req, res) => {
  try {
    const rules = loadBlockRules()
    res.json({ success: true, rules })
  } catch (error) {
    saveLog('error', '차단 규칙 조회 실패', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// 차단 규칙 추가 API
app.post('/api/block-rules', (req, res) => {
  try {
    const { id, type, value, reason, createdAt, enabled } = req.body
    
    if (!type || !value) {
      return res.status(400).json({ success: false, error: 'type과 value는 필수입니다' })
    }
    
    const rules = loadBlockRules()
    const newRule = {
      id: id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      value,
      reason: reason || '차단 규칙',
      createdAt: createdAt || new Date().toISOString(),
      enabled: enabled !== undefined ? enabled : true
    }
    
    rules.push(newRule)
    saveBlockRules(rules)
    
    saveLog('info', `차단 규칙 추가: ${type} - ${value}`)
    res.json({ success: true, rule: newRule })
  } catch (error) {
    saveLog('error', '차단 규칙 추가 실패', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// 차단 규칙 업데이트 API (토글 등)
app.put('/api/block-rules/:id', (req, res) => {
  try {
    const { id } = req.params
    const updates = req.body
    
    const rules = loadBlockRules()
    const index = rules.findIndex(rule => rule.id === id)
    
    if (index === -1) {
      return res.status(404).json({ success: false, error: '차단 규칙을 찾을 수 없습니다' })
    }
    
    rules[index] = { ...rules[index], ...updates }
    saveBlockRules(rules)
    
    saveLog('info', `차단 규칙 업데이트: ${id}`)
    res.json({ success: true, rule: rules[index] })
  } catch (error) {
    saveLog('error', '차단 규칙 업데이트 실패', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// 차단 규칙 삭제 API
app.delete('/api/block-rules/:id', (req, res) => {
  try {
    const { id } = req.params
    
    const rules = loadBlockRules()
    const filtered = rules.filter(rule => rule.id !== id)
    
    if (rules.length === filtered.length) {
      return res.status(404).json({ success: false, error: '차단 규칙을 찾을 수 없습니다' })
    }
    
    saveBlockRules(filtered)
    saveLog('info', `차단 규칙 삭제: ${id}`)
    res.json({ success: true })
  } catch (error) {
    saveLog('error', '차단 규칙 삭제 실패', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// 차단 규칙 확인 API (로그인 시도 시 호출)
app.post('/api/block-rules/check', (req, res) => {
  try {
    const { user, ip, resource, action } = req.body
    
    const rules = loadBlockRules()
    const activeRules = rules.filter(rule => rule.enabled)
    
    const blocked = activeRules.some(rule => {
      switch (rule.type) {
        case 'user':
          return user && user === rule.value
        case 'ip':
          return ip && ip === rule.value
        case 'resource':
          return resource && (resource === rule.value || resource.startsWith(rule.value))
        case 'action':
          return action && action === rule.value
        default:
          return false
      }
    })
    
    if (blocked) {
      const matchedRule = activeRules.find(rule => {
        switch (rule.type) {
          case 'user':
            return user && user === rule.value
          case 'ip':
            return ip && ip === rule.value
          case 'resource':
            return resource && (resource === rule.value || resource.startsWith(rule.value))
          case 'action':
            return action && action === rule.value
          default:
            return false
        }
      })
      
      saveLog('info', `차단 규칙에 의해 접근 차단: ${JSON.stringify({ user, ip, resource, action })}`)
      return res.json({ 
        success: true, 
        blocked: true, 
        reason: matchedRule?.reason || '차단 규칙에 의해 차단됨',
        rule: matchedRule
      })
    }
    
    res.json({ success: true, blocked: false })
  } catch (error) {
    saveLog('error', '차단 규칙 확인 실패', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Keycloak 이벤트 모니터링 및 차단 처리
const monitorKeycloakEvents = async () => {
  try {
    // Keycloak 이벤트 조회
    const command = 'docker exec -i keycloak /opt/keycloak/bin/kcadm.sh get events --realm master --server http://localhost:8080'
    const result = await execPromise(command)
    
    if (result.stdout) {
      let events = []
      try {
        const jsonMatch = result.stdout.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
          events = JSON.parse(jsonMatch[0])
        } else if (result.stdout.trim().startsWith('[')) {
          events = JSON.parse(result.stdout.trim())
        }
      } catch (e) {
        // JSON 파싱 실패 시 무시
        return
      }
      
      // 최근 LOGIN 이벤트만 확인
      const loginEvents = events.filter(event => 
        event.type === 'LOGIN' && event.time
      ).slice(0, 10) // 최근 10개만
      
      const rules = loadBlockRules()
      const activeRules = rules.filter(rule => rule.enabled)
      
      for (const event of loginEvents) {
        const userId = event.userId || event.user_id || event.username || 'unknown'
        const ipAddress = event.ipAddress || event.ip_address || event.details?.ipAddress || 'unknown'
        const resourcePath = event.resourcePath || event.resource_path || '/'
        const action = event.type || 'UNKNOWN'
        
        // 차단 규칙 확인
        const shouldBlock = activeRules.some(rule => {
          switch (rule.type) {
            case 'user':
              return userId === rule.value
            case 'ip':
              return ipAddress === rule.value
            case 'resource':
              return resourcePath === rule.value || resourcePath.startsWith(rule.value)
            case 'action':
              return action === rule.value
            default:
              return false
          }
        })
        
        if (shouldBlock) {
          // 차단 규칙에 해당하면 사용자 비활성화 또는 로그인 차단
          if (userId && userId !== 'unknown') {
            try {
              // 사용자 ID로 사용자 조회
              const userCommand = `docker exec -i keycloak /opt/keycloak/bin/kcadm.sh get users --realm master --server http://localhost:8080 -q username=${userId}`
              const userResult = await execPromise(userCommand)
              
              if (userResult.stdout) {
                const users = JSON.parse(userResult.stdout.match(/\[[\s\S]*\]/)?.[0] || '[]')
                if (users.length > 0) {
                  const user = users[0]
                  // 사용자 비활성화
                  const disableCommand = `docker exec -i keycloak /opt/keycloak/bin/kcadm.sh update users/${user.id} --realm master --server http://localhost:8080 -s enabled=false`
                  await execPromise(disableCommand)
                  saveLog('info', `차단 규칙에 의해 사용자 비활성화: ${userId} (IP: ${ipAddress})`)
                }
              }
            } catch (error) {
              saveLog('error', `사용자 차단 처리 실패: ${userId}`, error)
            }
          }
        }
      }
    }
  } catch (error) {
    // 모니터링 실패는 조용히 무시 (너무 많은 로그 방지)
  }
}

// Keycloak 이벤트 모니터링 시작 (30초마다)
let eventMonitorInterval = null
const startEventMonitoring = () => {
  if (eventMonitorInterval) {
    clearInterval(eventMonitorInterval)
  }
  
  eventMonitorInterval = setInterval(() => {
    monitorKeycloakEvents()
  }, 30000) // 30초마다 확인
  
  saveLog('info', 'Keycloak 이벤트 모니터링 시작 (30초 간격)')
}

// 서버 시작 시 이벤트 모니터링 시작
if (typeof app !== 'undefined' && app.listen) {
  const originalListen = app.listen
  app.listen = function(...args) {
    const server = originalListen.apply(this, args)
    // 서버 시작 후 모니터링 시작
    setTimeout(() => {
      startEventMonitoring()
    }, 5000) // 5초 후 시작
    return server
  }
}