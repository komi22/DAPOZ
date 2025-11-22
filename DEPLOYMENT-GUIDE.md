
# Dapoz 완전 오프라인 배포 가이드

## 🎯 목적
완전히 격리된 내부망 환경에서 Dapoz Security Dashboard를 실행하기 위한 배포 가이드입니다.

## 📋 사전 준비 (온라인 환경에서)

### 1. 오프라인 패키지 생성
```bash
# 1. 의존성 설치
npm install

# 2. 오프라인 패키지 생성 스크립트 실행
npm run create-offline

# 3. 전체 프로젝트 압축
tar -czf dapoz-offline-complete.tar.gz .
# Windows: 7zip 또는 WinRAR 사용
```

### 2. Node.js 런타임 준비
대상 시스템 OS에 맞는 Node.js 다운로드:
- Windows: https://nodejs.org/dist/v18.18.0/node-v18.18.0-x64.msi
- Linux: https://nodejs.org/dist/v18.18.0/node-v18.18.0-linux-x64.tar.xz
- macOS: https://nodejs.org/dist/v18.18.0/node-v18.18.0.pkg

## 🚀 오프라인 환경 배포

### 1. 파일 전송
```bash
# USB, 내부 네트워크 등을 통해 전송할 파일들:
- dapoz-offline-complete.tar.gz (또는 .zip)
- node-v18.18.0-[platform] (Node.js 설치 파일)
```

### 2. 대상 시스템 설치

#### Step 1: Node.js 설치
```bash
# Linux
tar -xf node-v18.18.0-linux-x64.tar.xz
export PATH=$PWD/node-v18.18.0-linux-x64/bin:$PATH

# Windows: MSI 파일 실행
# macOS: PKG 파일 실행
```

#### Step 2: 프로젝트 압축 해제
```bash
tar -xzf dapoz-offline-complete.tar.gz
cd dapoz-offline-complete
```

#### Step 3: 실행
```bash
# Windows
start-windows.bat

# Linux/Mac
chmod +x start-unix.sh
./start-unix.sh

# 또는 수동 실행
npm run dev
```

## 🌐 접속 및 확인

### 브라우저 접속
```
http://localhost:5173
```

### 기능 확인 체크리스트
- [ ] 로그인 화면 표시
- [ ] 대시보드 그래프 로딩
- [ ] 사이드바 메뉴 동작
- [ ] 정책 관리 페이지
- [ ] 네트워크 제어 기능
- [ ] 프로세스 관리 기능

## 🔧 대안 실행 방법

### 방법 1: 정적 파일 서버
```bash
# Express 서버 사용
node start-static-server.js
# 접속: http://localhost:3000
```

### 방법 2: Python 서버 (Node.js 없는 경우)
```bash
cd dist
python -m http.server 3000
# 접속: http://localhost:3000
```

### 방법 3: Nginx/Apache (프로덕션)
```nginx
# nginx.conf
server {
    listen 80;
    root /path/to/dapoz/dist;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## 📊 시스템 리소스 요구사항

### 최소 요구사항
- **CPU**: 1 Core 2GHz+
- **RAM**: 2GB
- **Storage**: 1GB 여유공간
- **Network**: 내부망 연결

### 권장 사양
- **CPU**: 2 Core 3GHz+
- **RAM**: 4GB+
- **Storage**: 2GB+ 여유공간
- **Browser**: Chrome 90+, Firefox 88+, Edge 90+

## 🛠️ 문제 해결

### 포트 충돌
```bash
# 다른 포트 사용
npm run dev -- --port 4000
# 또는
PORT=4000 npm run dev
```

### 권한 문제 (Linux/Mac)
```bash
# 실행 권한 부여
chmod +x start-unix.sh
chmod +x node_modules/.bin/*
```

### 메모리 부족
```bash
# Node.js 메모리 제한 증가
NODE_OPTIONS="--max-old-space-size=4096" npm run dev
```

### 브라우저 호환성
```bash
# 레거시 브라우저 지원 빌드
npm run build:dev
```

## 🔒 보안 고려사항

### 네트워크 격리
- 외부 인터넷 연결 불필요
- 내부망에서만 접근 가능
- HTTPS 설정 권장 (프로덕션)

### 접근 제어
```bash
# 특정 IP만 허용 (방화벽 설정)
iptables -A INPUT -p tcp --dport 5173 -s 192.168.1.0/24 -j ACCEPT
iptables -A INPUT -p tcp --dport 5173 -j DROP
```

### 로그 관리
```bash
# 접근 로그 모니터링
tail -f /var/log/nginx/access.log
```

## 📝 배포 체크리스트

### 배포 전
- [ ] Node.js 런타임 준비
- [ ] 오프라인 패키지 생성 완료
- [ ] 대상 시스템 사양 확인
- [ ] 네트워크 설정 확인

### 배포 중
- [ ] 파일 전송 완료
- [ ] Node.js 설치 완료
- [ ] 프로젝트 압축 해제 완료
- [ ] 실행 스크립트 권한 설정

### 배포 후
- [ ] 웹 서버 정상 실행
- [ ] 브라우저 접속 확인
- [ ] 모든 기능 동작 확인
- [ ] 로그 모니터링 설정

## 📞 지원 정보

### 로그 파일 위치
```
logs/
├── access.log          # 접근 로그
├── error.log           # 오류 로그
└── application.log     # 애플리케이션 로그
```

### 디버깅 명령어
```bash
# 프로세스 확인
ps aux | grep node

# 포트 사용 확인
netstat -tulpn | grep :5173

# 메모리 사용량 확인
free -h
```

### 백업 및 복구
```bash
# 설정 백업
tar -czf dapoz-config-backup.tar.gz src/ package.json

# 복구
tar -xzf dapoz-config-backup.tar.gz
```

---

**✅ 이 가이드를 따라하면 완전히 격리된 오프라인 환경에서도 Dapoz Security Dashboard를 안정적으로 실행할 수 있습니다.**
