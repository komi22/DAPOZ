<p align="center">
  <img src="public/logo/Dapoz_banner.png" alt="DAPOZ Zero-Trust Baseline & Assessment" width="100%">
</p>

<p align="center">
  <strong>Diagnostics & Policy for Zero Trust</strong>
</p>

<p align="center">
  <a href="#-why-dapoz">Why DAPOZ?</a> •
  <a href="#-features">Features</a> •
  <a href="#-technologies">Technologies</a> •
  <a href="#-getting-started">Getting Started</a> •
  <a href="#-usage">Usage</a> •
  <a href="#-license">License</a>
</p>

---

# [1] About the Project

## Why DAPOZ?

### DAPOZ는 조직이 **Zero Trust 보안 모델을 체계적으로 도입하고 관리**할 수 있도록 돕는 종합 보안 솔루션입니다.

Zero Trust를 도입하지 않은 기업도 **초기 기준선을 빠르게 확보**할 수 있으며, **진단과 개선을 통해 지속적으로 Zero Trust 수준을 강화**할 수 있습니다.

### DAPOZ는 다음과 같은 핵심 가치를 제공합니다:

* 🎯 **체계적인 Zero Trust 도입**  
  Zero Trust의 5대 필라(Network, Identity, Device, Process, Data)를 체계적으로 적용하고 관리합니다.

* 🔍 **실시간 보안 진단 및 평가**  
  체크리스트 기반 진단과 위협 시나리오 분석을 통해 현재 보안 수준을 정확히 파악합니다.

* 🛡️ **MITRE ATT&CK 기반 위협 분석**  
  실제 이벤트 로그를 기반으로 위협을 탐지하고, 구체적인 개선 방안을 제시합니다.

* 🤖 **AI 기반 위협 개선 지원**  
  RAG(Retrieval-Augmented Generation) 기반 AI 챗봇을 통해 위협별 맞춤형 개선 방안을 제공합니다.

* 📊 **실시간 모니터링 및 대시보드**  
  Zero Trust 네트워크의 보안 현황을 실시간으로 모니터링하고 시각화합니다.

* 📦 **SBOM 생성 및 관리**  
  소프트웨어 공급망 보안을 위한 SBOM(Software Bill of Materials)을 자동으로 생성하고 분석합니다.

---

## Features

### DAPOZ는 6가지 핵심 기능을 제공합니다:

* 🏗️ **Zero Trust 정책 적용**  
  Network, Identity, Device, Process, Data 5대 필라를 통한 통합 보안 정책 적용 및 관리.

* 📋 **Zero Trust 진단 및 평가**  
  체크리스트 기반 진단, 위협 시나리오 분석, 성숙도 평가를 통한 종합 보안 진단.

* 📦 **SBOM 생성 및 분석**  
  FossLight Scanner를 활용한 소스코드 기반 SBOM 자동 생성 (SOURCE/DEPENDENCY 모드 지원).

* 🛡️ **위협 리포트 및 개선 방안**  
  MITRE ATT&CK 프레임워크 기반 위협 탐지, 이벤트 로그 분석, 구체적인 개선 방안 제시.

* 🤖 **AI 챗봇 (RAG 기반)**  
  LangChain + ChromaDB를 활용한 위협 개선 질의응답 시스템. MITRE ATT&CK Runbook 기반 답변 제공.

* 📊 **실시간 대시보드**  
  네트워크 트래픽, 보안 상태, 시스템 성능, Zero Trust 성숙도 추이를 실시간으로 모니터링.

---

## Technologies

DAPOZ는 다음과 같은 오픈소스 기술을 활용합니다:

* **Frontend**
  * React 18.3+ (UI 프레임워크)
  * TypeScript 5.5+ (타입 안정성)
  * Tailwind CSS 3.4+ (스타일링)
  * Vite 5.4+ (빌드 도구)
  * Recharts 3.2+ (차트 시각화)
  * ECharts 5.4+ (고급 차트)

* **Backend**
  * Node.js + Express 4.18+ (서버 프레임워크)
  * ChromaDB 1.8+ (벡터 데이터베이스)

* **AI/LLM**
  * LangChain 0.3+ (LLM 프레임워크)
  * OpenAI API 4.20+ (GPT 모델)
  * ChromaDB (RAG 벡터 저장소)

* **SBOM**
  * FossLight Scanner (SBOM 생성 도구)

* **기타**
  * XLSX 0.18+ (Excel 파일 처리)
  * Lucide React (아이콘)

---

# [2] Getting Started

## Prerequisites

DAPOZ를 실행하기 위해 다음이 필요합니다:

* **Node.js** 18.0 이상
* **npm** 또는 **pnpm** 패키지 매니저
* **Git** (저장소 클론용)

### Optional (AI 챗봇 기능 사용 시)

* **OpenAI API Key** (환경 변수로 설정)
* **ChromaDB** (로컬 또는 원격 인스턴스)

## Installation

### 1. 저장소 클론

```bash
git clone https://github.com/your-org/dapoz.git
cd dapoz/DAPOZ
```

### 2. 의존성 설치

```bash
npm install
# 또는
pnpm install
```

### 3. 환경 변수 설정 (선택사항)

AI 챗봇 기능을 사용하려면 `.env` 파일을 생성하고 OpenAI API 키를 설정하세요:

```bash
# .env 파일 생성
OPENAI_API_KEY=your-api-key-here
```

### 4. 서버 실행

#### 개발 모드

**터미널 1: 프론트엔드 개발 서버**
```bash
npm run dev
```

**터미널 2: 백엔드 API 서버**
```bash
npm run server
# 또는
node server/index.cjs
```

#### 프로덕션 빌드

```bash
# 프론트엔드 빌드
npm run build

# 빌드된 파일 미리보기
npm run preview
```

### 5. AI 챗봇 초기화 (선택사항)

AI 챗봇 기능을 사용하려면 먼저 MITRE ATT&CK Runbook을 인덱싱해야 합니다:

```bash
# Runbook 인덱싱 (서버 실행 후)
curl -X POST http://localhost:3000/api/llm/index-runbooks \
  -H "Content-Type: application/json" \
  -d '{"force": true}'
```

---

# [3] Usage

## 주요 기능 사용법

### 1. Zero Trust 정책 적용

**경로**: `/zt-policy-apply`

5대 필라별로 Zero Trust 정책을 적용할 수 있습니다:

* **통합 통제** (`/zt-policy-apply/integrated`)
* **신원 통제** (`/zt-policy-apply/identity`)
* **네트워크 통제** (`/zt-policy-apply/network`)
* **프로세스 통제** (`/zt-policy-apply/process`)
* **디바이스 통제** (`/zt-policy-apply/device`)
* **데이터 통제** (`/data-control`)

### 2. Zero Trust 진단 및 평가

**경로**: `/zt-policy-diagnosis`

#### 2.1 체크리스트 (`/zt-policy-diagnosis/checklist`)

Network, Identity, Device, Application, Data 카테고리별 체크리스트를 작성하고 관리합니다.

#### 2.2 진단 평가 (`/zt-policy-diagnosis/diagnosis-evaluation`)

Excel 파일을 업로드하여 Zero Trust 성숙도를 평가합니다:

1. **체크리스트 파일 업로드**: Zero Trust 구현 항목 체크리스트
2. **자산 파일 업로드**: 시스템 자산 및 위협 시나리오 정보
3. **진단 실행**: 서버에서 종합 평가 수행
4. **결과 확인**: Zero Trust 점수 및 성숙도 레벨 확인

**지원 파일 형식**: `.xlsx`, `.xls`

**템플릿 다운로드**: `/templates/check.xlsx`

#### 2.3 평가 (`/zt-policy-diagnosis/evaluation`)

네트워크, 프로세스, 정책 문서별 Zero Trust 평가를 수행합니다.

### 3. SBOM 생성

**경로**: `/zt-policy-apply/sbom`

FossLight Scanner를 활용한 소스코드 SBOM 생성:

1. **Repository URL 입력**: Git 저장소 URL (HTTPS 또는 SSH)
2. **옵션 설정**:
   * Branch (기본값: main)
   * Subdirectory (선택사항)
   * 인증 방법 (Public/Private Repository)
   * 출력 포맷 (Opossum, Excel, CSV, YAML, SPDX 등)
3. **스캔 시작**: 백그라운드 작업으로 SBOM 생성
4. **결과 다운로드**: 생성된 SBOM 파일 다운로드

**지원 출력 포맷**:
* 일반 포맷: Opossum, Excel, CSV, YAML
* SPDX 포맷: JSON, YAML, Tag, XML

### 4. 위협 리포트 및 개선 방안

**경로**: `/zt-policy-diagnosis/threat-report`

진단 평가 결과를 기반으로 MITRE ATT&CK 기반 위협 분석 및 개선 방안을 제공합니다:

* **탐지된 위협 시나리오**: 이벤트 로그 기반 위협 탐지
* **위협별 상세 분석**: 
  * 위협 설명 및 공격 시나리오
  * 이벤트 로그 정보 및 판단 근거
  * 발생 가능 상황 분석
  * 구체적인 보안 대책
* **AI 챗봇 연동**: 위협별 맞춤형 질의응답

### 5. AI 챗봇

**경로**: 위협 리포트 페이지 또는 우하단 챗봇 버튼

RAG 기반 AI 챗봇을 통해 위협 개선 방안에 대해 질문할 수 있습니다:

* **MITRE ATT&CK 기반 답변**: Runbook 문서를 참고한 정확한 답변
* **위협별 컨텍스트**: 특정 위협에 대한 맞춤형 질의응답
* **참고 자료 제공**: 답변에 사용된 MITRE 기법 정보 표시

**예시 질문**:
* "T1003 자격증명덤프에 대한 상세 개선 방안 알려줘"
* "T1098 계정 조작 방어 방법"
* "자격 증명 덤프 공격 설정 방법"

### 6. 대시보드

**경로**: `/dashboard`

실시간 보안 모니터링 대시보드:

* **연결 장비 수**: 현재 온라인 상태인 장비 수
* **보안 위협**: 탐지된 위협 및 차단 현황
* **네트워크 상태**: 네트워크 트래픽 및 연결 상태
* **시스템 성능**: CPU, 메모리, 네트워크 처리량
* **Zero Trust 성숙도 추이**: 시간에 따른 Zero Trust 점수 변화 그래프
* **빠른 명령어 실행**: Docker, Ziti 등 시스템 명령어 실행

---

# [4] API Reference

## LLM API

### POST `/api/llm/index-runbooks`

MITRE ATT&CK Runbook을 ChromaDB에 인덱싱합니다.

**Request Body**:
```json
{
  "force": false  // true: 기존 collection 삭제 후 재인덱싱
}
```

**Response**:
```json
{
  "success": true,
  "message": "Runbooks 인덱싱 완료",
  "chunkCount": 1234
}
```

### POST `/api/llm/chat`

AI 챗봇 질의응답 API.

**Request Body**:
```json
{
  "question": "T1003 자격증명덤프 방어 방법",
  "technique_id": "T1003",  // 선택사항
  "context": {  // 선택사항
    "technique_id": "T1003",
    "threat_type_kr": "크리덴셜 공격",
    "technique_name_kr": "자격 증명 덤프",
    "event_ids": ["4648"]
  }
}
```

**Response**:
```json
{
  "success": true,
  "answer": "자격 증명 덤프 공격을 방어하기 위해서는...",
  "sources": [
    {
      "technique_id": "T1003",
      "content": "..."
    }
  ]
}
```

## SBOM API

### POST `/sbom/source/scan`

소스코드 SBOM 스캔을 시작합니다.

**Request Body**:
```json
{
  "repoUrl": "https://github.com/org/repo.git",
  "branch": "main",  // 선택사항
  "subdir": "src/",  // 선택사항
  "mode": "SOURCE",
  "authType": "token",  // "none" | "token"
  "authValue": "ghp_xxx",  // token인 경우
  "outputFormat": "opossum"  // "excel" | "csv" | "yaml" | "opossum" | "spdx-json" 등
}
```

**Response**:
```json
{
  "jobId": "job-123",
  "meta": {
    "installedCount": 0,
    "pathCount": 0,
    "dirCount": 0,
    "progress": 0
  }
}
```

### GET `/sbom/jobs/:jobId/status`

SBOM 스캔 작업 상태를 조회합니다.

**Response**:
```json
{
  "status": "running",  // "idle" | "queued" | "running" | "done" | "error" | "cancelled"
  "logAppend": ["로그 메시지..."],
  "installedCount": 150,
  "pathCount": 1200,
  "dirCount": 50,
  "progress": 75
}
```

### GET `/sbom/results`

생성된 SBOM 결과 목록을 조회합니다.

**Response**:
```json
[
  {
    "id": "result-123",
    "filename": "sbom-2024-12-03.xlsx",
    "createdAt": "2024-12-03T10:30:00Z"
  }
]
```

### GET `/sbom/results/:resultId/download`

SBOM 결과 파일을 다운로드합니다.

---

# [5] Architecture

## 시스템 구조

```
DAPOZ/
├── src/                    # 프론트엔드 소스코드
│   ├── components/        # React 컴포넌트
│   ├── pages/             # 페이지 컴포넌트
│   ├── lib/               # 라이브러리 및 유틸리티
│   └── utils/             # 유틸리티 함수
├── server/                # 백엔드 서버
│   ├── routes/            # API 라우트
│   ├── llm/               # LLM 관련 서비스
│   └── index.cjs          # Express 서버 진입점
├── public/                # 정적 파일
│   ├── logo/              # 로고 이미지
│   └── templates/         # Excel 템플릿
└── package.json           # 프로젝트 설정
```

## 주요 컴포넌트

### 프론트엔드
* **Dashboard**: 실시간 보안 모니터링
* **ZTChecklist**: Zero Trust 체크리스트 관리
* **DiagnosisEvaluation**: 진단 평가 실행
* **Sbom**: SBOM 생성 및 관리
* **ThreatReport**: 위협 리포트 및 개선 방안
* **ThreatChatbot**: AI 챗봇 컴포넌트

### 백엔드
* **Express Server**: RESTful API 서버
* **LLM Service**: LangChain 기반 챗봇 서비스
* **Vector Store**: ChromaDB 벡터 저장소
* **Document Loader**: MITRE ATT&CK Runbook 로더

---

# [6] Screenshots

## 대시보드

<p align="center">
  <img src="public/logo/Dapozer-MainDashboard.png" alt="DAPOZ Zero-Trust Baseline & Assessment" width="100%">
</p>

## Zero Trust 진단 평가

진단 평가를 통해 Zero Trust 성숙도를 평가하고 점수를 확인할 수 있습니다.

## SBOM 생성

소스코드 저장소를 입력하여 SBOM을 자동으로 생성합니다.

## 위협 리포트

MITRE ATT&CK 기반 위협 분석 및 구체적인 개선 방안을 제공합니다.

## AI 챗봇

RAG 기반 AI 챗봇을 통해 위협 개선 방안에 대해 질문할 수 있습니다.

---

# [7] DAPOZ's VISION

### "DAPOZ는 조직이 Zero Trust 보안 모델을 체계적으로 도입하고 지속적으로 개선할 수 있도록 지원하여, 안전하고 신뢰할 수 있는 디지털 환경을 구축합니다."

✔️ **체계적인 Zero Trust 도입 지원**

DAPOZ는 Zero Trust의 5대 필라를 체계적으로 적용할 수 있는 도구와 가이드를 제공합니다. 초기 도입 단계부터 고도화 단계까지 단계별로 지원하여 조직의 Zero Trust 여정을 가속화합니다.

✔️ **실제 위협 기반 보안 강화**

MITRE ATT&CK 프레임워크와 실제 이벤트 로그 분석을 통해 이론적 보안이 아닌 **실제 발생 가능한 위협**에 집중합니다. 이를 통해 보안 투자 대비 효과를 극대화합니다.

✔️ **AI 기반 지능형 보안 관리**

RAG 기반 AI 챗봇을 통해 위협별 맞춤형 개선 방안을 제공합니다. 복잡한 보안 정책과 설정을 이해하기 쉽게 설명하고, 실무진이 즉시 적용할 수 있는 구체적인 가이드를 제공합니다.

✔️ **오픈소스 기반 접근성**

Apache 2.0 라이선스로 제공되는 오픈소스 솔루션으로, 조직의 규모와 예산에 관계없이 누구나 사용할 수 있습니다. 커뮤니티의 기여를 통해 지속적으로 발전합니다.

---

# [8] Contributing

DAPOZ는 오픈소스 프로젝트입니다. 기여를 환영합니다!

## 기여 방법

1. **Fork** 저장소를 포크합니다.
2. **Feature Branch** 생성: `git checkout -b feature/amazing-feature`
3. **Commit** 변경사항: `git commit -m 'Add some amazing feature'`
4. **Push** 브랜치: `git push origin feature/amazing-feature`
5. **Pull Request** 생성

## 기여 가이드라인

* 코드 스타일을 준수해주세요 (ESLint 설정 참고)
* 새로운 기능 추가 시 테스트를 작성해주세요
* 문서를 업데이트해주세요
* 커밋 메시지는 명확하게 작성해주세요

---

# [9] License

이 프로젝트는 **Apache License 2.0** 라이선스 하에 배포됩니다.

자세한 내용은 [LICENSE](LICENSE) 파일을 참조하세요.

---

# [10] Acknowledgments

* 이 솔루션은 **Best of Best 14 Security Consulting Track**의 지원으로 개발되었습니다.
* **MITRE ATT&CK** 프레임워크를 기반으로 위협 분석 기능을 제공합니다.
* **FossLight Scanner**를 활용하여 SBOM 생성 기능을 제공합니다.

---

# [11] Contact

* 📧 **이메일**: [이메일 주소]
* 🐛 **이슈 리포트**: [GitHub Issues](https://github.com/your-org/dapoz/issues)
* 💬 **토론**: [GitHub Discussions](https://github.com/your-org/dapoz/discussions)

DAPOZ는 오픈소스 프로젝트로, 모든 분의 기여와 협력을 환영합니다. 함께 더 안전한 디지털 환경을 만들어가요!

---

<p align="center">
  <strong>Made with DAPOZER - DiAgnostics & POlicy for ZERotrust</strong>
</p>
