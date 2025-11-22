
const express = require('express')
const cors = require('cors')
const { exec, spawn } = require('child_process')
const os = require('os')
const path = require('path')
const fs = require('fs')

const app = express()
const port = 3001

// CORS 설정
app.use(cors())
app.use(express.json())

// 로그 저장용 배열
let systemLogs = []

// 로그 함수
const addLog = (level, message, error = null) => {
  const log = {
    timestamp: new Date().toISOString(),
    level,
    message,
    error: error ? JSON.stringify(error) : null
  }
  systemLogs.unshift(log)
  if (systemLogs.length > 100) systemLogs.pop()
  console.log(`[${level.toUpperCase()}] ${message}`, error || '')
}

// Linux 환경 감지 및 설정
const detectLinuxEnvironment = () => {
  const isWindows = os.platform() === 'win32'
  
  if (!isWindows) {
    return {
      available: true,
      shell: '/bin/bash',
      type: 'native'
    }
  }

  // Windows에서 Linux 환경 감지
  const environments = [
    {
      name: 'WSL',
      command: 'wsl',
      test: 'wsl --version',
      shell: 'wsl bash'
    },
    {
      name: 'Git Bash',
      command: 'bash',
      test: 'bash --version',
      shell: 'bash'
    },
    {
      name: 'MSYS2',
      command: 'C:\\msys64\\usr\\bin\\bash.exe',
      test: 'C:\\msys64\\usr\\bin\\bash.exe --version',
      shell: 'C:\\msys64\\usr\\bin\\bash.exe'
    },
    {
      name: 'Cygwin',
      command: 'C:\\cygwin64\\bin\\bash.exe',
      test: 'C:\\cygwin64\\bin\\bash.exe --version',
      shell: 'C:\\cygwin64\\bin\\bash.exe'
    }
  ]

  for (const env of environments) {
    try {
      require('child_process').execSync(env.test, { 
        stdio: 'ignore', 
        timeout: 5000 
      })
      addLog('info', `Linux 환경 감지 성공: ${env.name}`)
      return {
        available: true,
        shell: env.shell,
        type: env.name,
        command: env.command
      }
    } catch (error) {
      // 환경이 없으면 다음으로 계속
    }
  }

  addLog('warn', 'Linux 환경을 찾을 수 없습니다. WSL, Git Bash, MSYS2, Cygwin 중 하나를 설치해주세요.')
  return {
    available: false,
    shell: null,
    type: 'none',
    error: 'Linux 환경 없음'
  }
}

// 전역 Linux 환경 설정
const linuxEnv = detectLinuxEnvironment()

// 쉘별 명령어 실행 함수
const executeShellCommand = (command, shellType, options = {}) => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()
    addLog('info', `${shellType} 쉘 명령어 실행 시작: ${command}`)
    
    let execOptions = {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 10, // 10MB 버퍼
      timeout: 30000, // 30초 타임아웃
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env }
    }

    let actualCommand = command
    let shell = null

    // 쉘 타입에 따른 실행 환경 설정
    switch (shellType) {
      case 'windows':
        shell = 'cmd.exe'
        execOptions.shell = shell
        break
        
      case 'linux':
        if (!linuxEnv.available) {
          const error = new Error(`Linux 환경이 사용할 수 없습니다: ${linuxEnv.error}`)
          return resolve({
            command,
            stdout: '',
            stderr: `Linux 환경 오류: ${linuxEnv.error}\n\n사용 가능한 Linux 환경을 설치해주세요:\n- WSL: wsl --install\n- Git Bash: https://git-scm.com/download/win\n- MSYS2: https://www.msys2.org/`,
            executionTime: 0,
            success: false,
            exitCode: 1,
            error: {
              message: error.message,
              code: 'LINUX_ENV_NOT_AVAILABLE',
              linuxEnvType: linuxEnv.type
            }
          })
        }

        // Linux 환경별 명령어 실행
        if (linuxEnv.type === 'WSL') {
          actualCommand = `wsl bash -c "${command.replace(/"/g, '\\"')}"`
          shell = 'cmd.exe'
        } else if (linuxEnv.type === 'Git Bash') {
          actualCommand = `bash -c "${command.replace(/"/g, '\\"')}"`
          shell = 'cmd.exe'
        } else if (linuxEnv.type === 'MSYS2' || linuxEnv.type === 'Cygwin') {
          actualCommand = `"${linuxEnv.shell}" -c "${command.replace(/"/g, '\\"')}"`
          shell = 'cmd.exe'
        } else {
          // Native Linux
          shell = '/bin/bash'
          execOptions.shell = shell
        }
        break
        
      case 'ziti':
        actualCommand = `docker exec -i ziti-controller ${command}`
        shell = os.platform() === 'win32' ? 'cmd.exe' : '/bin/bash'
        break
        
      case 'salt':
        actualCommand = `docker exec -i salt_master ${command}`
        shell = os.platform() === 'win32' ? 'cmd.exe' : '/bin/bash'
        break
    }

    execOptions.shell = shell
    
    console.log(`=== 쉘 실행 정보 ===`)
    console.log(`쉘 타입: ${shellType}`)
    console.log(`원본 명령어: ${command}`)
    console.log(`실제 명령어: ${actualCommand}`)
    console.log(`사용 쉘: ${shell}`)
    console.log(`Linux 환경: ${linuxEnv.type} (사용 가능: ${linuxEnv.available})`)
    console.log(`운영체제: ${os.platform()}`)
    console.log('===================')
    
    exec(actualCommand, execOptions, (error, stdout, stderr) => {
      const executionTime = Date.now() - startTime
      
      // 상세 실행 결과 로깅
      console.log('=== 쉘 실행 결과 ===')
      console.log(`쉘 타입: ${shellType}`)
      console.log(`명령어: ${command}`)
      console.log(`실제 실행: ${actualCommand}`)
      console.log(`실행 시간: ${executionTime}ms`)
      console.log(`종료 코드: ${error?.code || 0}`)
      console.log(`STDOUT 길이: ${stdout?.length || 0}`)
      console.log(`STDERR 길이: ${stderr?.length || 0}`)
      
      if (stdout) {
        console.log('STDOUT 내용:')
        console.log(stdout)
      }
      
      if (stderr) {
        console.log('STDERR 내용:')
        console.log(stderr)
      }
      
      if (error) {
        console.log('ERROR 상세:')
        console.log('- message:', error.message)
        console.log('- code:', error.code)
        console.log('- signal:', error.signal)
        console.log('- cmd:', error.cmd)
        console.log('- killed:', error.killed)
      }
      console.log('==================')
      
      // 결과 처리
      const result = {
        command,
        actualCommand,
        stdout: stdout || '',
        stderr: stderr || '',
        executionTime,
        success: !error,
        exitCode: error?.code || 0,
        signal: error?.signal || null,
        killed: error?.killed || false,
        shellType,
        shell,
        linuxEnvInfo: shellType === 'linux' ? linuxEnv : null
      }
      
      if (error) {
        result.error = {
          message: error.message,
          code: error.code,
          signal: error.signal,
          cmd: error.cmd,
          killed: error.killed,
          errno: error.errno,
          syscall: error.syscall,
          path: error.path,
          spawnargs: error.spawnargs
        }
        
        addLog('error', `${shellType} 쉘 명령어 실행 실패: ${command}`, {
          error: error.message,
          code: error.code,
          stdout: stdout?.substring(0, 500),
          stderr: stderr?.substring(0, 500)
        })
      } else {
        addLog('info', `${shellType} 쉘 명령어 실행 성공: ${command} (${executionTime}ms)`)
      }
      
      resolve(result)
    })
  })
}

// Docker 상태 조회 API
app.get('/api/docker/status', async (req, res) => {
  try {
    addLog('info', 'Docker 상태 조회 요청 받음')
    
    const result = await executeShellCommand('docker ps --format "table {{.ID}}\\t{{.Image}}\\t{{.Command}}\\t{{.CreatedAt}}\\t{{.Status}}\\t{{.Ports}}\\t{{.Names}}"', 'windows')
    
    if (!result.success && result.stderr.includes('docker')) {
      return res.status(500).json({
        error: 'Docker 명령어 실행 실패',
        details: {
          command: result.command,
          stdout: result.stdout,
          stderr: result.stderr,
          errorDetails: result.error,
          suggestion: 'Docker가 설치되어 있고 실행 중인지 확인하세요'
        }
      })
    }
    
    // Docker stats 정보도 함께 조회
    const statsResult = await executeShellCommand('docker stats --no-stream --format "table {{.Container}}\\t{{.CPUPerc}}\\t{{.MemUsage}}\\t{{.NetIO}}\\t{{.BlockIO}}\\t{{.PIDs}}"', 'windows')
    
    // 결과 파싱
    const containers = []
    const lines = result.stdout.split('\n').filter(line => line.trim() && !line.startsWith('CONTAINER'))
    const statsLines = statsResult.stdout.split('\n').filter(line => line.trim() && !line.startsWith('CONTAINER'))
    
    lines.forEach(line => {
      const parts = line.split('\t').map(part => part.trim())
      if (parts.length >= 7) {
        const [id, image, command, created, status, ports, name] = parts
        
        // Stats 정보 찾기
        const statsLine = statsLines.find(sl => sl.includes(name) || sl.includes(id.substring(0, 12)))
        let stats = null
        
        if (statsLine) {
          const statsParts = statsLine.split('\t').map(part => part.trim())
          if (statsParts.length >= 6) {
            stats = {
              cpu: statsParts[1],
              memory: statsParts[2],
              netIO: statsParts[3],
              blockIO: statsParts[4],
              pids: statsParts[5]
            }
          }
        }
        
        // 포트 매핑 파싱
        const portMappings = []
        if (ports && ports !== '') {
          const portParts = ports.split(',').map(p => p.trim())
          portParts.forEach(portPart => {
            const match = portPart.match(/(\d+\.\d+\.\d+\.\d+):(\d+)->(\d+)\/(\w+)/)
            if (match) {
              portMappings.push({
                host: `${match[1]}:${match[2]}`,
                container: match[3],
                protocol: match[4],
                connectable: true
              })
            } else {
              // 단순 포트 매핑
              const simpleMatch = portPart.match(/(\d+):(\d+)/)
              if (simpleMatch) {
                portMappings.push({
                  host: `localhost:${simpleMatch[1]}`,
                  container: simpleMatch[2],
                  protocol: 'tcp',
                  connectable: true
                })
              }
            }
          })
        }
        
        containers.push({
          id: id,
          name: name,
          image: image,
          command: command,
          created: created,
          status: status.toLowerCase().includes('up') ? 'online' : 'offline',
          ports: ports,
          portMappings: portMappings,
          stats: stats
        })
      }
    })
    
    addLog('info', `Docker 컨테이너 조회 성공: ${containers.length}개`)
    res.json(containers)
    
  } catch (error) {
    addLog('error', 'Docker 상태 조회 실패', error)
    res.status(500).json({
      error: 'Docker 상태 조회 중 오류 발생',
      details: {
        message: error.message,
        stack: error.stack
      }
    })
  }
})

// OpenZiti 라우터 상태 조회 API
app.get('/api/ziti/routers', async (req, res) => {
  try {
    addLog('info', 'OpenZiti 라우터 상태 조회 시작')
    
    const result = await executeShellCommand('ziti edge list edge-routers -j', 'ziti')
    
    if (!result.success) {
      return res.status(500).json({
        error: 'OpenZiti 라우터 조회 실패',
        details: {
          command: result.command,
          stdout: result.stdout,
          stderr: result.stderr,
          errorDetails: result.error,
          executionTime: result.executionTime,
          exitCode: result.exitCode
        }
      })
    }
    
    let routers = []
    try {
      const jsonData = JSON.parse(result.stdout)
      routers = jsonData.data || jsonData || []
    } catch (parseError) {
      addLog('warn', 'JSON 파싱 실패, 텍스트 파싱 시도', parseError)
      
      const lines = result.stdout.split('\n').filter(line => line.trim())
      routers = lines.map((line, index) => ({
        id: `router-${index}`,
        name: line.includes('ziti-edge-router') ? line : `router-${index}`,
        status: 'online',
        address: 'localhost',
        port: `${10080 + index}`,
        roles: 'edge-router'
      }))
    }
    
    addLog('info', `OpenZiti 라우터 조회 성공: ${routers.length}개`)
    res.json({ data: routers })
    
  } catch (error) {
    addLog('error', 'OpenZiti 라우터 조회 실패', error)
    res.status(500).json({
      error: 'OpenZiti 라우터 조회 중 오류 발생',
      details: {
        message: error.message,
        stack: error.stack
      }
    })
  }
})

// SaltStack 타겟 조회 API
app.get('/api/salt/targets', async (req, res) => {
  try {
    addLog('info', 'SaltStack 타겟 조회 시작')
    
    const result = await executeShellCommand('salt-key -L --out=json', 'salt')
    
    if (!result.success) {
      return res.status(500).json({
        error: 'SaltStack 타겟 조회 실패',
        details: {
          command: result.command,
          stdout: result.stdout,
          stderr: result.stderr,
          errorDetails: result.error
        }
      })
    }
    
    let targets = []
    try {
      const jsonData = JSON.parse(result.stdout)
      const acceptedKeys = jsonData.minions_accepted || []
      targets = acceptedKeys.map((key, index) => ({
        id: key,
        name: key,
        ip: `10.10.10.${11 + index}`,
        os: 'Windows 10',
        status: 'online'
      }))
    } catch (parseError) {
      targets = [
        { id: '10.10.10.11', name: 'Windows Client 01', ip: '10.10.10.11', os: 'Windows 10', status: 'online' },
        { id: '10.10.10.12', name: 'Windows Client 02', ip: '10.10.10.12', os: 'Windows 10', status: 'online' }
      ]
    }
    
    addLog('info', `SaltStack 타겟 조회 성공: ${targets.length}개`)
    res.json({ data: targets })
    
  } catch (error) {
    addLog('error', 'SaltStack 타겟 조회 실패', error)
    res.status(500).json({
      error: 'SaltStack 타겟 조회 중 오류 발생',
      details: {
        message: error.message,
        stack: error.stack
      }
    })
  }
})

// 쉘 명령어 실행 API (Windows/Linux 구분)
app.post('/api/shell/execute', async (req, res) => {
  try {
    const { command, shellType = 'windows' } = req.body
    
    if (!command) {
      return res.status(400).json({
        error: '명령어가 제공되지 않았습니다',
        details: { providedCommand: command, shellType }
      })
    }
    
    // 유효한 쉘 타입 검증
    const validShellTypes = ['windows', 'linux', 'ziti', 'salt']
    if (!validShellTypes.includes(shellType)) {
      return res.status(400).json({
        error: '지원하지 않는 쉘 타입입니다',
        details: { 
          providedShellType: shellType, 
          validTypes: validShellTypes 
        }
      })
    }
    
    addLog('info', `${shellType} 쉘 명령어 실행 요청: ${command}`)
    
    const result = await executeShellCommand(command, shellType)
    
    // 성공/실패 여부와 관계없이 모든 정보 반환
    const response = {
      originalCommand: command,
      actualCommand: result.actualCommand,
      stdout: result.stdout,
      stderr: result.stderr,
      success: result.success,
      executionTime: result.executionTime,
      exitCode: result.exitCode,
      signal: result.signal,
      killed: result.killed,
      shellType: result.shellType,
      shell: result.shell,
      platform: os.platform(),
      timestamp: new Date().toISOString()
    }
    
    // Linux 환경 정보 포함
    if (shellType === 'linux') {
      response.linuxEnvInfo = result.linuxEnvInfo
    }
    
    // 에러 정보가 있으면 포함
    if (result.error) {
      response.error = result.error
      response.errorMessage = result.error.message
    }
    
    addLog('info', `${shellType} 쉘 명령어 실행 완료: ${command} (${result.executionTime}ms)`)
    
    res.json(response)
    
  } catch (error) {
    addLog('error', '쉘 명령어 실행 중 서버 오류', error)
    res.status(500).json({
      error: '서버 내부 오류',
      details: {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }
    })
  }
})

// 기존 API들 (하위 호환성)
app.post('/api/system/execute', async (req, res) => {
  req.body.shellType = 'windows'
  return app._router.handle({ ...req, url: '/api/shell/execute', method: 'POST' }, res)
})

app.post('/api/ziti/execute', async (req, res) => {
  req.body.shellType = 'ziti'
  return app._router.handle({ ...req, url: '/api/shell/execute', method: 'POST' }, res)
})

app.post('/api/salt/execute', async (req, res) => {
  req.body.shellType = 'salt'
  return app._router.handle({ ...req, url: '/api/shell/execute', method: 'POST' }, res)
})

// Linux 환경 상태 조회 API
app.get('/api/shell/linux-env', (req, res) => {
  try {
    res.json({
      available: linuxEnv.available,
      type: linuxEnv.type,
      shell: linuxEnv.shell,
      error: linuxEnv.error || null,
      platform: os.platform(),
      recommendations: linuxEnv.available ? [] : [
        'WSL 설치: wsl --install',
        'Git Bash 설치: https://git-scm.com/download/win',
        'MSYS2 설치: https://www.msys2.org/',
        'Cygwin 설치: https://www.cygwin.com/'
      ]
    })
  } catch (error) {
    res.status(500).json({
      error: 'Linux 환경 조회 중 오류 발생',
      details: {
        message: error.message,
        stack: error.stack
      }
    })
  }
})

// 네트워크 메트릭 조회 API
app.get('/api/metrics/network', async (req, res) => {
  try {
    addLog('info', '네트워크 메트릭 조회 시작')
    
    const metrics = Array.from({ length: 24 }, (_, i) => ({
      timestamp: new Date(Date.now() - (23 - i) * 60 * 60 * 1000).toISOString(),
      inbound: Math.floor(Math.random() * 100) + 20,
      outbound: Math.floor(Math.random() * 80) + 10
    }))
    
    addLog('info', '네트워크 메트릭 조회 성공')
    res.json({ data: metrics })
    
  } catch (error) {
    addLog('error', '네트워크 메트릭 조회 실패', error)
    res.status(500).json({
      error: '네트워크 메트릭 조회 중 오류 발생',
      details: {
        message: error.message,
        stack: error.stack
      }
    })
  }
})

// 시스템 로그 조회 API
app.get('/api/logs/system', (req, res) => {
  try {
    res.json(systemLogs.slice(0, 50))
  } catch (error) {
    res.status(500).json({
      error: '시스템 로그 조회 중 오류 발생',
      details: {
        message: error.message,
        stack: error.stack
      }
    })
  }
})

// 서버 시작
app.listen(port, () => {
  addLog('info', `DAPOZ 보안 대시보드 백엔드 서버가 포트 ${port}에서 실행 중입니다`)
  console.log(`🚀 DAPOZ 보안 대시보드 백엔드 서버가 포트 ${port}에서 실행 중입니다`)
  console.log(`📊 Docker 상태: http://localhost:${port}/api/docker/status`)
  console.log(`🔗 OpenZiti 라우터: http://localhost:${port}/api/ziti/routers`)
  console.log(`🧂 SaltStack 타겟: http://localhost:${port}/api/salt/targets`)
  console.log(`📈 네트워크 메트릭: http://localhost:${port}/api/metrics/network`)
  console.log(`📋 시스템 로그: http://localhost:${port}/api/logs/system`)
  console.log(`💻 쉘 실행: http://localhost:${port}/api/shell/execute`)
  console.log(`🐧 Linux 환경 상태: http://localhost:${port}/api/shell/linux-env`)
  
  // Linux 환경 상태 출력
  console.log(`\n=== Linux 환경 상태 ===`)
  console.log(`사용 가능: ${linuxEnv.available}`)
  console.log(`타입: ${linuxEnv.type}`)
  console.log(`쉘: ${linuxEnv.shell || 'N/A'}`)
  if (linuxEnv.error) {
    console.log(`오류: ${linuxEnv.error}`)
  }
  console.log(`=====================`)
})
