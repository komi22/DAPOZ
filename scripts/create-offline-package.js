
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.join(__dirname, '..')

console.log('🚀 DAPOZ 완전 오프라인 패키지 생성 시작...')

try {
  // 1. 의존성 설치 확인
  console.log('📦 의존성 설치 확인 중...')
  if (!fs.existsSync(path.join(projectRoot, 'node_modules'))) {
    console.log('⚠️  node_modules가 없습니다. npm install을 실행합니다...')
    execSync('npm install', { cwd: projectRoot, stdio: 'inherit' })
  }

  // 2. 프로덕션 빌드
  console.log('🔨 프로덕션 빌드 생성 중...')
  execSync('npm run build', { cwd: projectRoot, stdio: 'inherit' })

  // 3. 배포 가이드 생성
  const deploymentGuide = `
# DAPOZ 보안 대시보드 오프라인 배포 가이드

## 📋 시스템 요구사항
- Node.js 18.0.0 이상
- Docker (OpenZiti, SaltStack 컨테이너용)
- Windows 10/11 (클라이언트)

## 🚀 배포 단계

### 1. 압축 해제
\`\`\`bash
tar -xzf dapoz-complete-offline.tar.gz
cd dapoz-complete-offline
\`\`\`

### 2. OpenZiti 컨테이너 시작
\`\`\`bash
# 네트워크 생성
docker network create myFirstZitiNetwork

# 컨트롤러 시작
docker run --name ziti-controller \\
  -e ZITI_CTRL_EDGE_ADVERTISED_ADDRESS=192.168.149.100 \\
  -e ZITI_CTRL_ADVERTISED_ADDRESS=192.168.149.100 \\
  -e ZITI_CTRL_EDGE_IP_OVERRIDE=192.168.149.100 \\
  --network myFirstZitiNetwork \\
  --network-alias ziti-edge-controller \\
  -p 1280:1280 -p 6262:6262 \\
  -v myPersistentZitiFiles:/persistent \\
  -d openziti/quickstart \\
  //var/openziti/scripts/run-controller.sh

# 라우터 1 시작
docker run --name ziti-edge-router-1 \\
  -e ZITI_ROUTER_NAME=ziti-edge-router-1 \\
  -e ZITI_ROUTER_ADVERTISED_ADDRESS=192.168.149.100 \\
  -e ZITI_ROUTER_IP_OVERRIDE=192.168.149.100 \\
  -e ZITI_ROUTER_ROLES=public \\
  -e ZITI_ROUTER_PORT=3022 \\
  -e ZITI_ROUTER_LISTENER_BIND_PORT=10080 \\
  -e ZITI_CTRL_EDGE_ADVERTISED_ADDRESS=192.168.149.100 \\
  -e ZITI_CTRL_EDGE_ADVERTISED_PORT=1280 \\
  --network myFirstZitiNetwork \\
  -p 192.168.149.100:3022:3022 \\
  -p 192.168.149.100:10080:10080 \\
  -v myPersistentZitiFiles:/persistent \\
  -d openziti/quickstart \\
  //var/openziti/scripts/run-router.sh edge

# 라우터 2 시작
docker run --name ziti-edge-router-2 \\
  -e ZITI_ROUTER_NAME=ziti-edge-router-2 \\
  -e ZITI_ROUTER_ADVERTISED_ADDRESS=192.168.149.100 \\
  -e ZITI_ROUTER_IP_OVERRIDE=192.168.149.100 \\
  -e ZITI_ROUTER_ROLES=public \\
  -e ZITI_ROUTER_PORT=4022 \\
  -e ZITI_ROUTER_LISTENER_BIND_PORT=11080 \\
  -e ZITI_CTRL_EDGE_ADVERTISED_ADDRESS=192.168.149.100 \\
  -e ZITI_CTRL_EDGE_ADVERTISED_PORT=1280 \\
  --network myFirstZitiNetwork \\
  -p 192.168.149.100:4022:4022 \\
  -p 192.168.149.100:11080:11080 \\
  -v myPersistentZitiFiles:/persistent \\
  -d openziti/quickstart \\
  //var/openziti/scripts/run-router.sh edge
\`\`\`

### 3. SaltStack 컨테이너 시작
\`\`\`bash
# 필요한 디렉토리 생성
mkdir -p roots keys logs

# Salt Master 시작
docker run --name salt_master --detach \\
    --publish 4505:4505 --publish 4506:4506 \\
    --env 'SALT_LOG_LEVEL=info' \\
    --volume $(pwd)/roots/:/home/salt/data/srv/ \\
    --volume $(pwd)/keys/:/home/salt/data/keys/ \\
    --volume $(pwd)/logs/:/home/salt/data/logs/ \\
    ghcr.io/cdalvaro/docker-salt-master:latest
\`\`\`

### 4. OpenZiti 콘솔 시작
\`\`\`bash
# 인증서 복사
rm -rf "$HOME/.ziti/zac-pki"
mkdir -p "$HOME/.ziti/zac-pki"
HOST_DIR="$HOME/.ziti/zac-pki"

docker run --rm \\
  -v myPersistentZitiFiles:/persistent \\
  -v "\${HOST_DIR}:/zac-pki" \\
  busybox sh -lc '
    set -e
    mkdir -p /zac-pki &&
    cp /persistent/pki/ziti-edge-controller-intermediate/keys/*-server.key        /zac-pki/server.key &&
    cp /persistent/pki/ziti-edge-controller-intermediate/certs/*-server.chain.pem /zac-pki/server.chain.pem &&
    ls -l /zac-pki
  '

# ZAC 콘솔 시작
docker run --rm --name zac \\
  -e ZAC_CONTROLLER_URLS="https://192.168.149.100:1280" \\
  -p 1408:1408 -p 8443:8443 \\
  -v "\${HOST_DIR}/server.key:/usr/src/app/server.key" \\
  -v "\${HOST_DIR}/server.chain.pem:/usr/src/app/server.chain.pem" \\
  -d openziti/zac
\`\`\`

### 5. 웹 콘솔 시작
\`\`\`bash
# 백엔드 서버 시작
npm run server &

# 프론트엔드 서버 시작
npm run preview
\`\`\`

## 🔧 클라이언트 설정

### Windows 클라이언트 설정
1. 바탕화면에 다음 파일들 준비:
   - client-1.jwt (OpenZiti 콘솔에서 다운로드)
   - controller-ca.pem (컨테이너에서 복사)
   - ziti-edge-tunnel.exe (첨부된 파일)

2. 관리자 권한으로 CMD 실행:
\`\`\`cmd
cd C:\\Users\\[사용자명]\\Desktop
set "ZITI_CA_BUNDLE=controller-ca.pem"
ziti-edge-tunnel.exe enroll --jwt client-1.jwt --identity client-1.json
ziti-edge-tunnel.exe run --identity client-1.json
\`\`\`

3. SaltStack Minion 설치:
   - https://docs.saltproject.io/salt/install-guide/en/latest/topics/install-by-operating-system/windows.html
   - master: 192.168.149.100
   - id: 10.10.10.11 (클라이언트 IP)

## 🌐 접속 정보
- 웹 콘솔: http://localhost:4173
- OpenZiti 콘솔: https://192.168.149.100:8443
- 백엔드 API: http://localhost:3001

## 🔍 문제 해결
1. 시간 동기화 문제가 발생하면:
   \`\`\`cmd
   powershell -Command "Set-Date -Date '2025-09-15T13:21:00+09:00'"
   \`\`\`

2. Salt 클라이언트 키 수락:
   \`\`\`bash
   docker exec -it salt_master salt-key -A -y
   \`\`\`

3. 연결 테스트:
   \`\`\`bash
   docker exec -it salt_master salt '10.10.10.11' test.ping
   \`\`\`
`

  fs.writeFileSync(path.join(projectRoot, 'DEPLOYMENT-GUIDE.md'), deploymentGuide)

  // 4. 실행 스크립트 생성 (Linux/Mac)
  const startScript = `#!/bin/bash
echo "🚀 DAPOZ 보안 대시보드 시작 중..."

# 백엔드 서버 시작
echo "📡 백엔드 서버 시작..."
npm run server &
BACKEND_PID=$!

# 잠시 대기
sleep 3

# 프론트엔드 서버 시작
echo "🌐 프론트엔드 서버 시작..."
npm run preview &
FRONTEND_PID=$!

echo "✅ DAPOZ 대시보드가 시작되었습니다!"
echo "🌐 웹 콘솔: http://localhost:4173"
echo "📡 백엔드 API: http://localhost:3001"
echo ""
echo "종료하려면 Ctrl+C를 누르세요"

# 종료 처리
trap 'echo "🛑 서버 종료 중..."; kill $BACKEND_PID $FRONTEND_PID; exit' INT

# 대기
wait
`

  fs.writeFileSync(path.join(projectRoot, 'start.sh'), startScript)
  execSync('chmod +x start.sh', { cwd: projectRoot })

  // 5. 실행 스크립트 생성 (Windows)
  const startBat = `@echo off
echo 🚀 DAPOZ 보안 대시보드 시작 중...

echo 📡 백엔드 서버 시작...
start /B npm run server

timeout /t 3 /nobreak > nul

echo 🌐 프론트엔드 서버 시작...
start /B npm run preview

echo ✅ DAPOZ 대시보드가 시작되었습니다!
echo 🌐 웹 콘솔: http://localhost:4173
echo 📡 백엔드 API: http://localhost:3001
echo.
echo 종료하려면 이 창을 닫으세요
pause
`

  fs.writeFileSync(path.join(projectRoot, 'start.bat'), startBat)

  // 6. package.json 업데이트 (스크립트 추가)
  const packageJsonPath = path.join(projectRoot, 'package.json')
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  
  packageJson.scripts = {
    ...packageJson.scripts,
    'create-offline': 'node scripts/create-offline-package.js',
    'server': 'node server/index.js',
    'start-all': 'npm run server & npm run preview'
  }
  
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2))

  console.log('✅ 모든 파일이 준비되었습니다!')
  console.log('')
  console.log('📦 완전 오프라인 패키지를 생성하려면:')
  console.log('   tar -czf dapoz-complete-offline.tar.gz --exclude=".git" --exclude="*.log" .')
  console.log('')
  console.log('🚀 로컬에서 테스트하려면:')
  console.log('   ./start.sh (Linux/Mac) 또는 start.bat (Windows)')
  console.log('')
  console.log('📖 상세한 배포 가이드는 DEPLOYMENT-GUIDE.md를 참조하세요')

} catch (error) {
  console.error('❌ 오프라인 패키지 생성 실패:', error.message)
  process.exit(1)
}
