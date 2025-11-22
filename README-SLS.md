
# SLS 파일 배포 가이드

## SLS 파일 위치
SLS 파일은 SaltStack Master 컨테이너의 `/srv/salt/` 디렉토리에 배치해야 합니다.

## 배포 방법

### 1. 컨테이너에 직접 복사
```bash
# SLS 파일을 SaltStack Master 컨테이너에 복사
docker cp salt/find_docs.sls salt_master:/srv/salt/find_docs.sls
```

### 2. 컨테이너 내부에서 직접 생성
```bash
# SaltStack Master 컨테이너 접속
docker exec -it salt_master bash

# SLS 파일 생성
cat > /srv/salt/find_docs.sls << 'EOF'
find_documents:
  cmd.run:
    - name: powershell -Command "Get-ChildItem -Recurse C:\Users -Include *.txt,*.pdf,*.doc,*.docx,*.ppt,*.pptx,*.xls,*.xlsx,*.csv,*.hwp,*.rtf -File | Select-Object -ExpandProperty FullName"
    - shell: powershell
    - timeout: 300
EOF
```

## 실행 방법
```bash
# 특정 호스트에서 실행
docker exec -it salt_master salt 10.10.10.13 state.apply find_docs

# 모든 호스트에서 실행
docker exec -it salt_master salt '*' state.apply find_docs
```

## SLS 파일 사용의 장점

1. **인용 문제 해결**: Docker → Salt → PowerShell 3단계 인용 문제 완전 해결
2. **재사용성**: 한 번 작성한 명령어를 여러 호스트에서 반복 사용
3. **유지보수**: 복잡한 명령어를 파일로 관리하여 수정 용이
4. **버전 관리**: SLS 파일을 Git 등으로 버전 관리 가능
5. **문서화**: 명령어의 목적과 사용법을 SLS 파일에 주석으로 기록

## 추가 SLS 파일 예시

### 시스템 정보 수집
```yaml
# system_info.sls
collect_system_info:
  cmd.run:
    - name: systeminfo
    - shell: cmd
```

### 네트워크 연결 상태 확인
```yaml
# network_status.sls
check_network_connections:
  cmd.run:
    - name: netstat -an
    - shell: cmd