// src/pages/threatreport.tsx

import React, { useEffect, useState } from 'react'
import {
  ShieldCheck,
  AlertTriangle,
  Info,
  ListChecks,
  Search,
  BookOpen
} from 'lucide-react'

type Severity = 'low' | 'medium' | 'high'

interface EvaluationResult {
  totalScore: number
  maturityLevel: string
  maturityDescription: string
  breakdown: {
    maturity: number
    asset: number
    threatModeling: number
    threatScenario: number
  }
}

interface ThreatReportStoredResult {
  evaluationResult: EvaluationResult | null
  detectedScenarios: string[]
  // DiagnosisEvaluation에서 이벤트 ID를 따로 저장해놨다면 여기로 들어오도록 가정
  collectedEventIds?: string[] | number[]
  eventIds?: string[] | number[]
}

interface ThreatGuide {
  key: string          // 매칭용 키 (예: 'T1003', 'T1550', 'T1566.001' 등)
  category: string     // 위협 유형(대분류)
  mitreId: string
  threatType: string   // 위협 종류
  description: string  // 위협 설명
  eventId: string
  logFields: string    // 이벤트 로그의 주요 필드
  rationale: string    // 판단 근거
  situation: string    // 로그 발생 가능 상황
  improvement: string  // 개선책
  severity: Severity   // 위험도 (하/중/상)
}

// 위험도별 UI 메타
function getSeverityMeta(severity: Severity) {
  switch (severity) {
    case 'high':
      return {
        label: '상',
        titleClass: 'text-red-700',
        badgeClass:
          'bg-red-50 text-red-700 border border-red-200',
        descContainerClass:
          'bg-red-50/80 border border-red-200',
        descTitleClass: 'text-red-700'
      }
    case 'medium':
      return {
        label: '중',
        titleClass: 'text-orange-700',
        badgeClass:
          'bg-orange-50 text-orange-700 border border-orange-200',
        descContainerClass:
          'bg-orange-50/80 border border-orange-200',
        descTitleClass: 'text-orange-700'
      }
    case 'low':
    default:
      return {
        label: '하',
        titleClass: 'text-yellow-700',
        badgeClass:
          'bg-yellow-50 text-yellow-700 border border-yellow-200',
        descContainerClass:
          'bg-yellow-50/80 border border-yellow-200',
        descTitleClass: 'text-yellow-700'
      }
  }
}

const THREAT_GUIDES: ThreatGuide[] = [
  // 1. T1003 자격 증명 덤프
  {
    key: 'T1003',
    category: '크리덴셜 공격',
    mitreId: 'T1003',
    threatType: '자격 증명 덤프',
    description: `공격자는 계정 로그인 및 자격 증명 자료를 얻기 위해 자격 증명을 유출하려고 시도할 수 있으며, 일반적으로 해시 또는 일반 텍스트 비밀번호 형태로 제공된다. 자격 증명은 OS 캐시, 메모리 또는 구조에서 얻을 수 있다. 이후 자격 증명을 사용하여 측면 이동을 수행하고 제한된 정보에 접근할 수 있다.`,
    eventId: '4648',
    logFields: `Process Name, Process ID, Account Whose Credentials Were Used > Account Name, Subject > Account Name, Target Server > Target Server Name`,
    rationale: `PtH 공격 체인의 자격 증명 재사용/전달 단계를 직접적으로 포착할 수 있는 이벤트이다.
- Subject > Account Name과 Account Whose Credentials Were Used > Account Name 값이 다르면 의심 계정 전환을 확인할 수 있어 자격 증명 덤프 가능성을 의심할 수 있다(자격 증명 도용 탐지 핵심 지표).
- Process Name, Process ID를 봤을 때 비표준 경로나 도구 이름이 확인되면 의심 덤프 도구 실행을 확인할 수 있다.
- Target Server > Target Server Name이 localhost 외 원격 서버라면, 자격 증명 덤프 후 PtH 기반 측면 이동 가능성을 의심할 수 있다.`,
    situation: `이 이벤트는 프로세스가 해당 계정의 자격 증명을 명시적으로 지정하여 계정 로그온을 시도할 때 생성된다. 예약된 작업, RUNAS 명령, 배치 작업 구성 등에서 자주 발생하며, 정상적인 운영 체제 활동에서도 주기적으로 발생하는 일상적인 이벤트이지만, 자격 증명 덤프 위협 측정 시 반드시 확인해야 하는 이벤트 로그이다.`,
    improvement: `자격 증명 덤프와 PtH 공격을 막기 위해서는 크리덴셜을 저장·관리하는 LSASS와 Kerberos/NTLM 자격 증명 저장소를 보호해야 한다. 또한 불필요한 관리자 권한과 계정 전환 경로를 최소화해 공격자가 확보한 해시나 토큰을 재사용하지 못하도록 해야 한다.`,
    severity: 'high'
  },

  // 2. T1550 Pass-the-Hash
  {
    key: 'T1550',
    category: '크리덴셜 공격',
    mitreId: 'T1550',
    threatType: '대체 인증 자료 사용 (Pass-the-Hash)',
    description: `공격자는 훔친 비밀번호 해시를 사용하여 Pass-the-Hash(PtH)를 통해 환경 내에서 측면 이동을 수행하고, 일반적인 시스템 접근 제어를 우회할 수 있다. PtH는 평문 비밀번호 없이 비밀번호 해시만으로 인증 단계에 진입하는 기법으로, 캡처한 해시를 이용해 로컬·원격 시스템에 인증하여 다양한 작업을 수행할 수 있다.`,
    eventId: '4648',
    logFields: `LogonType, AuthenticationPackage`,
    rationale: `원격·로컬을 불문하고 해시 기반 인증이 성공할 때 남는 핵심 이벤트로, 대부분의 PtH 네트워크 이동이 남는 로그이다. 단일 이벤트로 로그인(인증) 여부를 확인할 수 있는 최선의 지표이기 때문에 PtH 탐지에 매우 중요하다.`,
    situation: `해시 기반 인증 명령이 사용될 때, LogonUser() API가 호출될 때, 원격 명령 실행 도구가 해시를 사용해 세션을 만드는 경우, Kerberos 대신 NTLM 해시 인증이 강제로 사용되는 경우에 발생한다.`,
    improvement: `Pass-the-Hash 공격을 막기 위해서는 해시 기반 인증 자체가 악용되지 않도록 자격 증명 저장소(LSASS, Kerberos 캐시, NTLM 해시)를 보호하고, NTLM 사용을 최소화하며 가능한 Kerberos 기반 인증으로 강제하는 것이 중요하다. 또한 관리자 계정을 최소화하고, 동일 계정의 원격 인증·측면 이동 경로를 제한해 공격자가 탈취한 해시를 재사용할 기회를 줄여야 한다.`,
    severity: 'high'
  },

  // 3. T1134 토큰 조작
  {
    key: 'T1134',
    category: '크리덴셜 공격',
    mitreId: 'T1134',
    threatType: '토큰 조작',
    description: `공격자는 Windows의 액세스 토큰을 조작해 다른 사용자 또는 더 높은 보안 컨텍스트로 가장하여 권한을 우회할 수 있다. 토큰을 복사(토큰 도용)하거나 다른 프로세스에 적용하거나 새 프로세스를 생성하는 과정에서 권한이 상승할 수 있으며, 도용한 토큰에 원격 시스템 인증 권한이 있으면 해당 계정으로 원격 시스템까지 접근할 수 있다.`,
    eventId: '4703',
    logFields: `PrivilegeList, Process Name, SubjectUserName, SubjectLogonId, TokenElevationType`,
    rationale: `이미 로그인된 세션 내에서 다른 사용자 토큰을 복제하거나 필요한 특권을 부여·사용해 권한을 상승시키는 과정을 직접적으로 포착할 수 있는 이벤트이다.
- PrivilegeList에 SeDebugPrivilege, SeImpersonatePrivilege 등 고위험 특권이 실제로 사용되었는지 확인하여 토큰 변조·가장 여부를 식별할 수 있다.
- SubjectUserName으로 특권을 조정한 주체(일반 사용자 계정 vs 비정상 프로세스)를 구분할 수 있다.
- ProcessName으로 특권 변경을 수행한 프로세스 경로·이름을 통해 공격 도구 여부를 판단할 수 있다.
- SubjectLogonId로 동일 세션에서 반복적인 특권 상승 시도를 식별할 수 있다.`,
    situation: `토큰 조작에 필요한 고위험 특권(SeDebugPrivilege, SeImpersonatePrivilege 등)을 활성화하거나 사용할 때 발생한다. 일반 사용자 환경에서는 거의 사용되지 않는 특권이기 때문에, 비정상 프로세스나 비표준 경로에서 실행된 도구가 특권을 조정하면 토큰 복제·가장에 의한 권한 상승 시도로 의심할 수 있다.`,
    improvement: `토큰 조작 공격을 방지하기 위해서는 토큰 변조에 사용되는 고위험 특권을 최소화하고, 일반 사용자나 비정상 프로세스가 이러한 특권을 활성화하지 못하도록 권한·그룹 구성을 강화해야 한다. 또 RunAs·Impersonation·특권 상승이 가능한 모든 경로를 줄여 토큰 기반 권한 상승 자체가 어렵도록 만들어야 한다.`,
    severity: 'high'
  },

  // 4. T1021 원격 서비스 악용
  {
    key: 'T1021',
    category: '원격 서비스 악용',
    mitreId: 'T1021',
    threatType: '원격 서비스',
    description: `공격자는 탈취하거나 확보한 유효한 계정을 이용해 Telnet, SSH, VNC, RDP 등 원격 접속 서비스를 통해 로그인하여 해당 사용자 권한으로 작업을 수행할 수 있다. 도메인 환경에서는 하나의 계정으로 여러 시스템에 접근할 수 있어, 자격 증명을 얻으면 네트워크 전반으로 원격 로그인 및 측면 이동이 가능하다.`,
    eventId: '4624',
    logFields: `LogonType, AuthenticationPackage, Account Name, Logon Process Name`,
    rationale: `원격 서비스 악용 시 반드시 나타나는 원격 로그인 기록을 포함하고 있어 원격 서비스 위협을 직접적으로 포착할 수 있는 핵심 이벤트이다.
- LogonType 3(SMB/네트워크 로그인), 10(RDP)이면 원격 접속 시도가 명확하다.
- AuthenticationPackage가 NTLM이면 Kerberos 대신 NTLM이 강제되어 사용된 측면 이동·자격 증명 재사용 가능성을 의심할 수 있다.
- Account Name, Logon Process Name으로 어떤 계정이 어떤 원격 프로세스를 통해 접속했는지 확인해 비정상 계정 사용 여부를 판단할 수 있다.`,
    situation: `공격자가 SMB, RDP, WMI, WinRM 등 원격 서비스 기능을 이용해 다른 시스템에 로그인하거나 원격 명령을 실행할 때 발생한다. LogonType이 3 또는 10이면 원격 접속이 실제로 수행된 것으로 볼 수 있고, PSExec/WMIexec 등의 원격 실행 도구 사용 시 반복적으로 기록된다.`,
    improvement: `원격 서비스 악용을 막기 위해서는 RDP, SMB, WMI, WinRM 등 원격 로그인 경로를 최소화하고, 허용된 사용자와 시스템만 원격 인증을 수행하도록 접근 통제를 강화해야 한다. Kerberos 기반 인증을 우선 적용하고 NTLM 사용을 줄이며, 원격 로그인(LogonType 3·10)에 대해 비정상 계정·호스트 조합을 정밀 모니터링해야 한다.`,
    severity: 'high'
  },

  // 5. T1570 도구 전송
  {
    key: 'T1570',
    category: '도구 전송/스테이징',
    mitreId: 'T1570',
    threatType: '도구 전송',
    description: `공격자는 침해된 환경 내부에서 공격 도구나 파일을 한 시스템에서 다른 시스템으로 전송해 스테이징할 수 있다. 이를 위해 SMB/Windows 관리자 공유, RDP 기반 파일 전송, 파일 공유 프로토콜 등을 활용하여 내부 측면 이동을 지원한다.`,
    eventId: '5145',
    logFields: `ShareName, Relative Target Name, AccessMask, Source Address`,
    rationale: `원격 시스템에 파일이 실제로 생성되거나 쓰기(Write/Append) 작업이 발생할 때 기록되는 가장 직접적인 도구 전송 탐지 이벤트이다.
- ShareName으로 C$, ADMIN$ 등 관리 공유 접근 여부를 확인할 수 있다.
- RelativeTargetName으로 어떤 경로에 파일이 생성됐는지 파악해 도구 복사 여부를 확인할 수 있다.
- AccessMask에서 WriteData, AppendData 등이 있으면 원격 파일 업로드 흔적으로 판단할 수 있다.`,
    situation: `공격자가 SMB/Windows 관리자 공유를 통해 원격 시스템에 파일을 복사하거나 새 파일을 생성할 때 발생한다. 침해된 환경 내부에서 공격 도구, 스크립트, 백도어 등을 다른 시스템으로 전송 및 스테이징할 때 반복적으로 나타난다.`,
    improvement: `도구 전송 공격을 막기 위해서는 SMB 관리자 공유(C$, ADMIN$ 등)와 원격 파일 전송 프로토콜을 최소화하거나 접근 대상을 제한해야 한다. 쓰기 작업이 실제로 수행되는 공유 폴더를 감시해 비정상적인 파일 업로드 패턴을 탐지하고, 계정 권한 최소화와 공유 권한 세분화로 스테이징 자체를 어렵게 만들어야 한다.`,
    severity: 'medium'
  },

  // 6. T1595 능동적 스캐닝
  {
    key: 'T1595',
    category: '의도적 외부 공격자',
    mitreId: 'T1595',
    threatType: '능동적 스캐닝',
    description: `공격자는 표적 공격을 준비하기 위해 능동적 스캐닝을 수행하며, 이는 네트워크 트래픽을 이용해 피해자의 인프라를 직접 탐색하는 정찰 기법이다. 수집된 정보는 추가 정찰, 공격 준비, 초기 침투 등에 활용된다.`,
    eventId: '5156',
    logFields: `Source Address, Destination Address, Destination Port, Protocol`,
    rationale: `여러 포트로 연속적인 네트워크 연결을 시도할 때 반복적으로 생성되는 가장 직접적인 스캐닝 탐지 이벤트이다.
- 방화벽이 허용한 연결의 포트·프로토콜·원격지 정보를 상세히 기록하므로 다수 포트 접근 시도를 명확히 확인할 수 있다.
- 동일 Source Address에서 짧은 시간 안에 다양한 포트로 연결되면 능동적 스캐닝 징후로 판단할 수 있다.`,
    situation: `Nmap, Masscan 등 스캐닝 도구를 사용하여 다수 포트에 빠르게 연결을 시도할 때 연속적으로 기록된다. SMB·RDP·HTTP 등 다양한 포트로 짧은 시간 안에 접근이 발생하면 외부 또는 내부에서 능동적 스캔이 수행된 것으로 판단할 수 있다.`,
    improvement: `능동적 스캐닝을 차단하려면 불필요한 포트 노출을 최소화하고, 시스템 간 연결 가능한 서비스 범위를 제한하여 공격자가 여러 포트에 접근할 수 있는 표면 자체를 줄여야 한다. 동일 출발지에서 다수 포트로 단시간 연결이 발생하는 패턴을 네트워크 차원에서 탐지·차단하는 정책이 필요하다.`,
    severity: 'low'
  },

  // 7. T1566 피싱
  {
    key: 'T1566',
    category: '사용자 부주의',
    mitreId: 'T1566',
    threatType: '피싱',
    description: `공격자는 피해자에게 악성 링크나 첨부파일이 포함된 메시지를 보내 악성코드 실행이나 계정 탈취를 유도한다. 이메일·메신저·소셜 미디어 등 다양한 전자적 채널로 전달되며, 스피어피싱 또는 대량 스팸 형태로 이루어진다.`,
    eventId: '4688',
    logFields: `New Process Name, Creator Process Name`,
    rationale: `피싱 자체를 직접 기록하지는 않지만, 사용자가 악성 첨부파일 또는 악성 URL을 실행한 이후 나타나는 비정상적 프로세스 생성을 통해 후속 공격을 탐지할 수 있는 핵심 로그이다.
- Outlook·Chrome·Word·Excel 등 정상 애플리케이션이 powershell.exe, cmd.exe, wscript.exe 등의 자식 프로세스를 생성하면 피싱 성공 가능성이 크다.
- Parent Process Name과 CommandLine으로 스크립트 기반 드롭퍼·매크로 실행 여부를 확인할 수 있다.`,
    situation: `피해자가 악성 첨부파일(docm·js·zip·exe 등)을 실행하거나, 이메일/메신저/SNS에 포함된 악성 URL 클릭 후 스크립트 기반 드롭퍼(mshta·wscript·powershell 등)가 실행될 때 발생한다. 정상 프로그램이 비정상 자식 프로세스를 생성하면 피싱 성공 후 후속 침투로 이어질 가능성이 높다.`,
    improvement: `피싱 공격을 막기 위해서는 사용자가 악성 첨부파일을 실행하거나 악성 링크를 열지 못하도록 애플리케이션 실행 경로와 스크립트 실행 체인을 통제해야 한다. 특히 Outlook, Word, Chrome 등이 PowerShell·cmd·wscript 등을 자식 프로세스로 생성하지 못하도록 제한하면 피싱 후속 공격의 상당 부분을 차단할 수 있다.`,
    severity: 'medium'
  },

  // 8. T1071 애플리케이션 계층 프로토콜 악용
  {
    key: 'T1071',
    category: 'C2/데이터 유출',
    mitreId: 'T1071',
    threatType: '애플리케이션 계층 프로토콜 악용',
    description: `공격자는 탐지를 피하기 위해 HTTP/HTTPS/DNS/SMTP 같은 애플리케이션 계층 프로토콜을 사용해 C2 통신을 숨긴다. 명령과 결과는 정상 트래픽처럼 보이도록 프로토콜 데이터 안에 포함된다.`,
    eventId: '5156',
    logFields: `Source Address, Destination Address, Destination Port, Protocol, Process Name`,
    rationale: `WFP가 네트워크 연결 허용 시 기록하는 이벤트로, 악성 프로세스가 외부 C2 서버와 통신할 때 가장 직접적으로 나타난다. 동일 프로세스가 짧은 시간 안에 여러 포트/외부 IP로 반복 연결하거나, 평소 연결하지 않는 목적지로 트래픽이 발생하면 초기 C2 통신·데이터 유출 시도로 판단할 수 있다.`,
    situation: `악성코드가 HTTP/HTTPS/DNS/SMTP 등 정상 프로토콜로 위장해 C2 서버와 초기 통신을 시도할 때 발생한다. 평소 사용하지 않는 도메인·IP로의 반복 연결이나 비정상 포트 조합이 나타나면 애플리케이션 계층 악용 가능성이 높다.`,
    improvement: `정상적인 HTTPS/DNS/HTTP 트래픽과 악성 C2 트래픽을 구분하기 위해 프로세스 기반 네트워크 통제를 강화해야 한다. 내부 시스템이 평상시 통신하지 않는 외부 목적지·도메인·포트로 연결되는 행위를 최소화하고, 특정 애플리케이션·계정·업무 목적에 맞게 아웃바운드 트래픽을 제한해야 한다.`,
    severity: 'high'
  },

  // 9. T1041 C2 채널을 통한 유출
  {
    key: 'T1041',
    category: '데이터 유출',
    mitreId: 'T1041',
    threatType: 'C2 채널을 통한 데이터 유출',
    description: `공격자는 이미 구축된 C2 채널을 활용해 중요 데이터를 외부로 전송한다. 유출 데이터는 C2 통신과 동일한 프로토콜 안에 인코딩되어 전송되며, 겉보기에는 일반 트래픽처럼 보인다.`,
    eventId: '5156',
    logFields: `Source Address, Destination Address, Destination Port, Protocol, Bytes Sent/Bytes Received`,
    rationale: `악성 프로세스가 외부 서버로 비정상적인 양의 데이터를 전송할 때 반복적으로 나타난다. 동일 프로세스에서 특정 외부 IP/도메인으로 지속적인 연결이 발생하면 C2 통신·데이터 유출 채널 가능성을 의심할 수 있다.`,
    situation: `악성 프로세스가 외부 C2 서버로 계정정보, 키로깅 결과, 내부 문서 등의 데이터를 전송할 때 대량의 송신 트래픽이 발생하며 이 이벤트가 계속 기록된다. 평소 사용하지 않는 해외 IP로의 반복 업로드성 연결도 해당 상황에 포함된다.`,
    improvement: `C2 기반 데이터 유출을 막기 위해서는 내부 시스템이 외부 서버로 대량 송신(Bytes Sent) 트래픽을 발생시키는 행위를 제한해야 한다. 특정 애플리케이션·계정만 외부로 데이터 전송을 허용하고, 비업무 애플리케이션의 업로드 자체를 차단해 C2 트래픽 악용을 어렵게 만들어야 한다.`,
    severity: 'high'
  },

  // 10. T1567 웹 서비스를 통한 유출
  {
    key: 'T1567',
    category: '데이터 유출',
    mitreId: 'T1567',
    threatType: '웹 서비스를 통한 유출',
    description: `공격자는 합법적인 외부 웹 서비스를 이용해 데이터를 유출하며, 이런 서비스는 평소에도 사용되기 때문에 탐지가 어렵다. SSL/TLS 암호화까지 적용되어 있어 유출 행위가 정상 통신처럼 보인다.`,
    eventId: '5156',
    logFields: `Source Address, Destination Address, Destination Port, Protocol, Process Name, Bytes Sent`,
    rationale: `프로세스가 외부 웹 서비스로 지속적 또는 대량 송신 트래픽을 허용받을 때 기록된다. 정상 프로그램(브라우저·업무용 클라이언트 등)이 짧은 시간 내 특정 웹스토리지 도메인으로 반복적·대용량 트래픽을 발생시키면 웹 업로드 기반 데이터 유출 가능성을 의심할 수 있다.`,
    situation: `내부 시스템에서 탈취한 계정 정보·키로깅 결과·스크린샷·내부 문서 등을 웹 스토리지/클라우드 서비스로 업로드하는 과정에서 발생한다. 파일 분할 전송, 압축 후 업로드, 주기적 반복 전송 등 패턴이 동반된다.`,
    improvement: `웹 기반 데이터 유출은 정상적인 HTTPS 트래픽 속에 데이터를 숨겨 전송하므로, “어떤 프로세스가 어떤 웹 서비스로 데이터를 보낼 수 있는지”를 제한하는 것이 핵심이다. 평소 사용하지 않는 웹 저장소·파일 호스팅 서비스로의 업로드를 차단하고, 비업무 애플리케이션의 외부 웹 서비스 접근을 통제해야 한다.`,
    severity: 'high'
  },

  // 11. T1486 데이터 암호화(랜섬웨어)
  {
    key: 'T1486',
    category: '영향(랜섬웨어)',
    mitreId: 'T1486',
    threatType: '영향을 주기 위한 데이터 암호화/랜섬',
    description: `공격자는 대상 시스템이나 네트워크 내 다수 시스템의 데이터를 암호화하여 시스템 및 네트워크 리소스 가용성을 차단할 수 있다. 로컬 및 원격 드라이브의 데이터를 암호화하여 피해자가 데이터에 접근하지 못하게 만든 뒤 금전적인 보상을 요구하거나, 키를 제공하지 않아 영구적인 데이터 손실을 유도하기도 한다.`,
    eventId: '4688',
    logFields: `New Process Name, Process Command Line`,
    rationale: `프로세스 생성 로그로, 랜섬웨어나 암호화 도구 실행 흔적을 포착할 수 있다.
- Process Name과 Command Line에서 "encryptor.exe /silent", "7z.exe a -tzip C:\\encrypted.zip *.docx" 등 패턴이 보이면 데이터 암호화 가능성을 의심할 수 있다.
- Command Line에 .locked, .encrypted, ransom 문자열 또는 특이 압축 옵션이 보이면 대량 암호화 시작을 의심할 수 있다.
- 4688 후 4663 급증 패턴을 함께 보면 랜섬웨어 암호화 체인을 확인할 수 있다.`,
    situation: `새로운 프로세스가 생성될 때마다 발생하며, certutil.exe, bitsadmin.exe, makecab.exe, reg.exe 등 LOLBin 악용이나 랜섬웨어 실행 시 핵심 증거로 기록된다.`,
    improvement: `랜섬웨어 기반 암호화를 방지하기 위해서는 파일 시스템에 대한 대량 읽기·쓰기와 특정 확장자 생성 패턴을 유발하는 악성 프로세스 실행 자체를 차단해야 한다. 정상 프로그램 또는 LOLBins를 통한 암호화 프로세스 실행을 어렵게 만들고, 중요 데이터 접근 권한을 최소화해 암호화 확산을 막아야 한다.`,
    severity: 'high'
  },

  // 12. T1190 공개서비스 익스플로잇
  {
    key: 'T1190',
    category: '시스템 취약·설정오류 악용',
    mitreId: 'T1190',
    threatType: '공개 서비스 익스플로잇',
    description: `공격자는 인터넷과 연결된 Windows 서버·서비스의 취약점을 악용해 내부망에 최초 접근을 시도한다. 웹 서버(IIS), 데이터베이스, SMB, RDP, WinRM, SNMP 등의 잘못된 구성, 패치 미적용, 인증 우회 버그 등이 주요 대상이다.`,
    eventId: '4688',
    logFields: `New Process Name, Creator Process Name, Process Command Line, Mandatory Level`,
    rationale: `웹 서비스 프로세스(w3wp.exe, sqlservr.exe 등)가 자식 프로세스로 cmd.exe·powershell.exe를 생성하는지를 확인할 수 있는 핵심 로그이다. 정상 환경에서 웹 서버가 OS 명령 인터프리터를 실행하는 일은 거의 없으므로, Parent가 웹 서버인데 Command Line에 외부 다운로드(iwr/wget), PowerShell 인코딩(-enc) 등이 보이면 취약점 악용에 의한 RCE 가능성이 높다.`,
    situation: `Windows 웹 서비스나 애플리케이션 취약점 악용으로 웹쉘 업로드, xp_cmdshell 실행 등이 일어날 때 서비스 프로세스가 cmd.exe·powershell.exe·rundll32.exe를 비정상적으로 생성하며 이 이벤트가 발생한다.`,
    improvement: `공개 서비스 취약점 악용을 차단하려면 인터넷에 노출된 서비스의 공격 표면을 최소화하고 최신 패치를 유지해야 한다. 서비스 계정 권한과 실행 경로를 제한해 RCE 후속 행동을 차단하고, 불필요한 웹 기능·핸들러·모듈을 제거해 외부 요청이 OS 명령 실행으로 이어지는 구조를 제거해야 한다.`,
    severity: 'high'
  },

  // 13. T1203/T1210 특정 취약점 익스플로잇
  {
    key: 'T1203/T1210',
    category: '시스템 취약·설정오류 악용',
    mitreId: 'T1203/T1210',
    threatType: '특정 취약점 익스플로잇',
    description: `공격자는 웹 브라우저, Office 문서(PDF/Word/Excel), 멀티미디어 플레이어 등 사용자가 직접 실행하는 클라이언트 애플리케이션의 취약점을 악용하여 원격 코드 실행(RCE)을 시도한다. 사용자가 단순히 웹페이지나 문서를 열기만 해도 트리거될 수 있어 탐지가 어렵다.`,
    eventId: '4688',
    logFields: `Creator Process Name, New Process Name, Process Command Line, Mandatory Level`,
    rationale: `취약한 클라이언트 애플리케이션(브라우저, PDF/Office 뷰어 등)이 예상되지 않은 명령 인터프리터(cmd.exe, powershell.exe) 또는 rundll32.exe를 새로 생성하는지를 확인할 수 있는 핵심 로그이다. 정상적인 문서 열기나 웹 렌더링 과정에서는 이런 체인이 거의 발생하지 않으므로, 이 경우 취약점 악용을 통한 RCE 가능성이 크다.`,
    situation: `사용자가 웹페이지나 Office/PDF 문서를 열었을 뿐인데 브라우저나 문서 프로그램이 cmd.exe, powershell.exe, rundll32.exe 등을 비정상적으로 호출하는 경우에 발생한다. 악성 문서가 취약한 매크로 엔진 또는 OLE 개체를 통해 외부 DLL을 로드·실행할 때도 동일한 패턴의 4688 이벤트가 나타난다.`,
    improvement: `브라우저·PDF 뷰어·Office 등 클라이언트 애플리케이션은 취약점 패치를 신속히 적용하고, 불필요한 플러그인(ActiveX·스크립팅 엔진 등)을 제거해 공격 표면을 줄여야 한다. 또한 이들 프로그램이 cmd.exe·powershell.exe·rundll32.exe를 직접 생성하지 못하도록 실행 체인을 통제하면, 취약점이 트리거되더라도 후속 페이로드 실행을 어렵게 만들 수 있다.`,
    severity: 'high'
  },

  // 14. T1547 부팅/로그온 자동 실행
  {
    key: 'T1547',
    category: '지속성/부팅·자동실행',
    mitreId: 'T1547',
    threatType: '서비스·자동실행',
    description: `공격자는 시스템이 부팅되거나 사용자가 로그온할 때 자동으로 실행되는 프로그램(자동 시작 메커니즘)을 악용해 지속성을 확보하거나 권한을 상승시킬 수 있다. 레지스트리, 시작 프로그램 폴더, 서비스, 스케줄러 등 다양한 위치에 악성 프로그램을 추가하여 부팅 시 자동 실행되도록 만들 수 있다.`,
    eventId: '7045',
    logFields: `Service Name, Service File Name, Start Type, Service Account`,
    rationale: `새 서비스가 설치될 때마다 기록되며, 공격자가 지속성을 확보하기 위해 ‘서비스 등록’을 수행할 때 가장 직접적으로 드러나는 핵심 로그이다. 비정상 실행 파일이 서비스로 등록되거나, 서비스 경로가 Temp·AppData 등 비정상 디렉터리일 경우 악성 서비스 설치 가능성이 높다.`,
    situation: `공격자가 악성 코드를 지속적으로 실행하기 위해 sc create, PowerShell New-Service 등으로 서비스를 등록할 때 발생한다. 원격 침투 후 LocalSystem 권한 서비스 설치나 랜섬웨어가 부팅 시 자동 실행되도록 자기 자신을 서비스로 등록할 때도 동일하다.`,
    improvement: `서비스 기반 지속성 공격을 막기 위해서는 부팅·로그온 시 자동 실행되는 영역(서비스, 스케줄러, 레지스트리 Run 키 등)에 임의 실행 파일이 추가되지 않도록 실행·쓰기 권한을 최소화해야 한다. 자동 실행 경로의 파일 무결성과 실행 체인을 엄격히 통제하고, LocalSystem 서비스 권한을 최소화해야 한다.`,
    severity: 'medium'
  },

  // 15. T1068 권한 상승 익스플로잇
  {
    key: 'T1068',
    category: '권한 상승',
    mitreId: 'T1068',
    threatType: '권한 상승 익스플로잇',
    description: `공격자는 더 높은 권한을 얻기 위해 프로그램·서비스·운영체제·커널의 소프트웨어 취약점을 악용한다. 초기 침투 후 낮은 권한에서 시작하더라도 취약한 구성 요소를 이용해 사용자 권한에서 관리자/SYSTEM 권한으로 상승할 수 있다.`,
    eventId: '4672',
    logFields: `Account Name, Account Domain, Logon ID, Privileges, Logon Process Name`,
    rationale: `사용자나 프로세스에 고위험 Privilege가 부여될 때 발생하는 이벤트로, 권한 상승 시도의 핵심 지표다. 일반 사용자 계정에서 예상되지 않는 SeDebugPrivilege, SeImpersonatePrivilege 등이 활성화되면 이상 징후로 판단할 수 있다.`,
    situation: `사용자 로그인 직후 또는 프로세스가 SYSTEM 권한으로 동작하는 시점에 특별 권한이 부여될 때 발생한다. 권한 상승 익스플로잇 실행 후 쉘이나 임시 계정에 SYSTEM 권한이 부여될 때도 동일한 이벤트가 기록된다.`,
    improvement: `OS·드라이버·서비스에 최신 보안 패치를 적용해 LPE(Local Privilege Escalation) 취약점을 제거하고, 일반 사용자 계정이 고위험 Privilege를 획득하지 못하도록 권한 모델을 최소화해야 한다. 또한 취약한 서명 드라이버를 로드하지 못하도록 드라이버 무결성 보호를 강화해야 한다.`,
    severity: 'high'
  },

  // 16. T1566.001 스피어피싱(첨부)
  {
    key: 'T1566.001',
    category: '사용자 부주의',
    mitreId: 'T1566.001',
    threatType: '스피어피싱(첨부파일)',
    description: `공격자는 특정 개인이나 조직을 노린 사회공학 기반 전자 공격으로, 악성 첨부파일이 포함된 이메일을 활용해 피해자 시스템에 접근한다. 첨부 파일은 Office 문서, PDF, 실행 파일, 압축파일 등으로 위장한다.`,
    eventId: '4688',
    logFields: `New Process Name, Creator Process Name, Process Command Line, Mandatory Level`,
    rationale: `사용자가 이메일 첨부파일을 열었을 때 생성되는 프로세스를 통해 스피어피싱 첨부 실행 여부를 파악할 수 있다. Outlook/Chrome/Winword/Excel 등을 부모로 cmd.exe, powershell.exe, wscript.exe, mshta.exe, rundll32.exe 등이 생성되면 의심도가 매우 높다.`,
    situation: `스피어피싱 이메일에서 Word/Excel/PDF/ZIP 등 첨부파일을 열었을 때 문서 내부 매크로·스크립트가 자동 실행되거나 보안 경고를 우회해 악성 코드가 구동되면 해당 이벤트가 발생한다.`,
    improvement: `스피어피싱 기반 침해를 막으려면 문서·첨부파일·링크가 임의로 시스템 명령(cmd, powershell, wscript 등)을 실행하지 못하도록 실행 체인을 통제해야 한다. 자동 실행 기능(OLE, DDE, 매크로, Active Content)을 최소화하고, 첨부파일 실행 및 다운로드 경로를 제한해야 한다.`,
    severity: 'medium'
  },

  // 17. T1204 사용자 실행
  {
    key: 'T1204',
    category: '사용자 부주의',
    mitreId: 'T1204',
    threatType: '사용자 실행',
    description: `공격자는 사회공학 기법을 이용해 사용자가 직접 악성 파일·링크를 열거나 코드를 실행하도록 유도하는 공격 방식이다. 피싱·스피어피싱의 후속 행동으로 문서·스크립트 실행, 악성 웹사이트 접속, 원격 액세스 도구 설치 등으로 이어진다.`,
    eventId: '4688',
    logFields: `Account Name, Logon ID, Creator Process Name, New Process Name, Process Command Line, Mandatory Level`,
    rationale: `사용자가 직접 악성 파일·링크를 실행할 때 생성되는 신규 프로세스 로그로, 사용자 실행 기반 초기 침해 여부를 판단하는 핵심 근거이다. 정상일 때와 달리 비정상적으로 powershell.exe, cmd.exe, wscript.exe, mshta.exe, rundll32.exe 등이 생성되는 패턴에 주목해야 한다.`,
    situation: `사용자가 피싱/스피어피싱 메시지에서 문서, 실행파일, ZIP 등을 열람하면서 매크로나 스크립트가 자동 실행되거나, 바로가기(.lnk), 위장된 실행파일을 직접 실행할 때 해당 이벤트가 발생한다.`,
    improvement: `사용자 실행 기반 공격을 막기 위해서는 사용자가 실행하는 파일·링크·스크립트가 임의로 시스템 명령을 호출하지 못하도록 실행 흐름을 통제해야 한다. 외부에서 내려받은 파일 실행을 제한하고, 자동 실행 기능을 최소화하며, 사용자가 관리자 권한을 갖지 않도록 운영해야 한다.`,
    severity: 'medium'
  },

  // 18. T1059 명령 및 스크립팅 인터프리터
  {
    key: 'T1059',
    category: '명령/스크립트 인터프리터',
    mitreId: 'T1059',
    threatType: '명령 및 스크립팅 인터프리터',
    description: `공격자는 명령 및 스크립트 인터프리터를 악용하여 명령, 스크립트 또는 바이너리를 실행한다. PowerShell, cmd, wscript, cscript 등 다양한 인터페이스와 언어가 대상이며, 초기 페이로드나 보조 페이로드를 통해 임의 코드를 실행할 수 있다.`,
    eventId: '4688',
    logFields: `New Process Name, New Process ID, Process Command Line, Parent Process Name, Mandatory Level`,
    rationale: `프로세스 생성 시 확인되는 로그로, 명령 인터프리터 실행을 확인하는 핵심 이벤트이다.
- New Process Name이 powershell.exe, cmd.exe, wscript.exe, cscript.exe이면 스크립트 실행 가능성을 의심할 수 있다.
- Command Line에 EncodedCommand, -w hidden, IEX (New-Object Net.WebClient).DownloadString(...) 등이 보이면 의심스러운 PowerShell 다운로드 실행을 확인할 수 있다.
- Parent Process Name이 explorer.exe 또는 Office(winword.exe 등)인데 powershell.exe를 호출하면 비정상 인터프리터 실행으로 본다.`,
    situation: `powershell.exe -w hidden -enc, cmd.exe /c powershell, cscript.exe //B malicious.vbs 등의 명령이 실행될 때 생성된다. 정상 관리 작업에서도 발생하지만, 비정상 인코딩/옵션/부모 프로세스 조합일 때 악성 스크립트 실행 탐지에 중요하다.`,
    improvement: `PowerShell·cmd·wscript·cscript 등 스크립트 실행 엔진이 임의 실행되거나 자동 호출되지 않도록 실행 체인을 제한해야 한다. 인코딩된 명령, 숨김 실행, 다운로드 실행 등을 통해 악성 페이로드가 실행되지 않도록 스크립트 실행 정책과 다운로드 기능을 제한해야 한다.`,
    severity: 'low'
  },

  // 19. T1552 보안되지 않은 자격 증명
  {
    key: 'T1552',
    category: '내부자 위협',
    mitreId: 'T1552',
    threatType: '보안되지 않은 자격 증명',
    description: `공격자는 보안에 취약하게 저장된 자격 증명을 찾기 위해 손상된 시스템을 수색한다. 자격 증명은 일반 텍스트 파일, OS/애플리케이션 저장소, 기타 특수 파일·아티팩트 등에 저장될 수 있다.`,
    eventId: '4663',
    logFields: `Object Name, Access Request Information, Process Name`,
    rationale: `SAM, SYSTEM hive 파일이나 민감 레지스트리에 대한 읽기/접근 급증을 포착할 수 있는 이벤트이다. MITRE의 credential 파일 접근 탐지 전략에서도 권고되는 방식이다.
- Object Name이 C:\\Windows\\System32\\config\\SAM/SYSTEM 또는 HKLM\\SAM이면 자격 증명 저장소 접근 가능성을 의심할 수 있다.
- Accesses=ReadData 상태에서 reg.exe/cmd.exe 등이 SAM 파일에 연속 접근하면 자격 증명 열거를 의심할 수 있다.`,
    situation: `파일/레지스트리 객체에 대한 Handle + ReadData 접근 시 발생하며, 특히 C:\\Windows\\System32\\config\\SAM, SYSTEM 파일이나 HKLM\\SAM 키 접근에서 다수 생성된다. 정상 백업 외 동일 Object에 대한 4663 급증은 내부자 위협 신호다.`,
    improvement: `SAM·SYSTEM·SECURITY 등 OS 자격 증명 저장소와 애플리케이션 비밀번호 저장 위치에 대해 최소 권한을 유지하고, 일반 사용자가 읽기 작업을 수행하지 못하도록 통제해야 한다. 평문 자격 증명, 스크립트 하드코딩 패스워드, Config 파일 기반 비밀번호 저장 등을 제거해 파일 탐색만으로 민감 정보를 얻지 못하도록 해야 한다.`,
    severity: 'low'
  },

  // 20. T1562 방어력 약화 – 이벤트 로깅 비활성화
  {
    key: 'T1562',
    category: '방어 무력화',
    mitreId: 'T1562',
    threatType: 'Windows 이벤트 로깅 비활성화',
    description: `공격자는 탐지 및 감사에 활용될 수 있는 데이터를 제한하기 위해 Windows 이벤트 로깅을 비활성화할 수 있다. 시스템 전체 또는 특정 애플리케이션 로깅이 공격 대상이 될 수 있다.`,
    eventId: '1100',
    logFields: `Event ID, Provider, Level, Task, Keywords, Time Created, Computer Name, EventData`,
    rationale: `Event Logging Service가 중지될 때 1100 이벤트가 생성되어 로그 서비스 비활성화 행위를 기록한다. 1100 이후 로그 수집량 급감 패턴이 나타나면 이벤트 로깅 완전 비활성화 가능성을 의심할 수 있다.`,
    situation: `Windows Event Log 서비스가 net stop eventlog, sc stop eventlog, 레지스트리 변경 후 재부팅 등으로 중지될 때 생성된다. 정상 시스템 종료 시에도 발생하지만, 비정상 시간대/비관리자 계정에서의 1100은 방어 무력화 탐지 시 핵심 이벤트이다.`,
    improvement: `Event Log 서비스가 임의 중지되지 않도록 서비스 중지·수정 권한을 엄격히 제한해야 한다. 권한 상승 후 eventlog 서비스를 중단해 탐지를 무력화하는 패턴을 막기 위해 서비스 설정과 레지스트리 값의 무결성을 보호하고, 보안 구성 변경을 수행할 수 있는 계정을 최소화해야 한다.`,
    severity: 'high'
  },

  // 21. T1105 Ingress Tool Transfer
  {
    key: 'T1105',
    category: '대량 스테이징(데이터 탈취 준비)',
    mitreId: 'T1105',
    threatType: 'Ingress Tool Transfer',
    description: `공격자는 외부 시스템에서 손상된 환경으로 공격 도구 또는 기타 파일을 전송한다. 도구나 파일은 C2 채널이나 FTP 등 대체 프로토콜을 통해 피해자 네트워크로 복사될 수 있다.`,
    eventId: '4688',
    logFields: `New Process Name, New Process ID, Process Command Line`,
    rationale: `Ingress Tool Transfer 위협을 직접적으로 포착할 수 있는 이벤트이다.
- Process Name·Command Line에서 System32 내장 도구(certutil.exe, bitsadmin.exe 등)가 비정상 URL(외부 C2 서버)로 연결되면 악성 도구 다운로드 가능성을 의심할 수 있다.`,
    situation: `새로운 프로세스가 생성될 때마다 발생하며, certutil.exe, bitsadmin.exe, powershell.exe 등 내장 도구로 외부 URL에서 파일을 다운로드하는 명령 실행 시 기록된다.`,
    improvement: `Ingress Tool Transfer를 막기 위해서는 외부에서 내부로 파일이 다운로드되는 경로를 최소화하고, certutil·bitsadmin·PowerShell iwr/wget 등 기본 내장 다운로드 기능을 통한 도구 반입을 통제해야 한다. 임시 폴더·사용자 프로필·AppData 등에 임의 파일이 저장되지 않도록 파일 시스템 권한을 강화해야 한다.`,
    severity: 'medium'
  },

  // 22. T1560 Archive Collected Data
  {
    key: 'T1560',
    category: '데이터 유출 준비',
    mitreId: 'T1560',
    threatType: 'Archive Collected Data',
    description: `공격자는 유출 전에 수집된 데이터를 압축 및/또는 암호화해 네트워크 전송량을 줄이고, 탐지를 피하려고 한다.`,
    eventId: '4688',
    logFields: `New Process Name, New Process ID, Process Command Line`,
    rationale: `makecab.exe, rar.exe, 7z.exe 등 압축 유틸리티 실행 시 CommandLine에서 압축/암호화 패턴을 탐지하는 것이 MITRE에서 권고하는 전략이다.
- Process Name·Command Line에서 makecab.exe/rar.exe/7z.exe와 압축 옵션(-m, -ep1, a 등)이 보이면 데이터 아카이빙 가능성을 의심할 수 있다.`,
    situation: `새로운 프로세스가 생성될 때마다 발생하며, makecab.exe, rar.exe, 7z.exe, winrar.exe 등이 데이터를 압축하거나 암호화할 때 생성된다.`,
    improvement: `데이터 압축·암호화 기반 유출 준비를 막으려면 7z, rar, makecab 등의 임의 압축 도구 실행을 제한하고, TEMP·AppData 등 비정상 위치에서의 아카이빙 작업을 불가능하게 만들어야 한다. 중요 데이터 위치의 읽기·복사·패킹을 제한해 대량 파일을 하나로 묶는 동작 자체를 어렵게 해야 한다.`,
    severity: 'low'
  },

  // 23. T1609 컨테이너 관리 명령
  {
    key: 'T1609',
    category: '무결성 위협(데이터 조작)',
    mitreId: 'T1609',
    threatType: '컨테이너 관리 명령 악용',
    description: `공격자는 Docker 데몬, Kubernetes API 서버 또는 kubelet 등 컨테이너 관리 서비스를 악용해 컨테이너 내에서 명령을 실행하거나 컨테이너 탈출을 시도할 수 있다.`,
    eventId: '4688',
    logFields: `New Process Name, Process Command Line, Account Name`,
    rationale: `컨테이너 관리 명령 실행 시 생성되는 로그로 컨테이너 관리 도구 악용을 포착한다.
- New Process Name이 docker.exe, kubectl.exe이면 컨테이너 관리 도구 실행으로 본다.
- Account Name이 비관리자 계정인데 Docker/Kubernetes 관리 명령이 실행되면 비인가 컨테이너 접근 가능성을 의심할 수 있다.`,
    situation: `Windows Docker Desktop 또는 Kubernetes Windows 노드에서 docker exec, kubectl exec 등을 실행할 때 생성된다. 정상 개발자 작업에서도 발생하지만, 비관리자 계정·비정상 시간대 패턴은 컨테이너 탈출 및 명령 실행 탐지에 중요하다.`,
    improvement: `docker.exe·kubectl.exe 같은 컨테이너 관리 도구를 실행할 수 있는 계정을 제한하고, 컨테이너 관리 인터페이스(Docker Daemon, Kubernetes API)에 대한 접근 통제를 강화해야 한다. 일반 사용자나 비인가 계정이 컨테이너 관리 명령을 실행하지 못하도록 RBAC와 인증·토큰 관리 정책을 강화해야 한다.`,
    severity: 'medium'
  },

  // 24. T1490 시스템 복구 차단
  {
    key: 'T1490',
    category: '랜섬웨어/복구 차단',
    mitreId: 'T1490',
    threatType: '시스템 복구 차단',
    description: `공격자는 손상된 시스템 복구를 돕기 위해 설계된 서비스를 끄거나 데이터를 삭제해 복구를 방해하고, 백업·복구 옵션에 대한 접근을 차단한다. 이는 랜섬웨어 효과를 극대화하기 위한 전형적인 단계이다.`,
    eventId: '4688',
    logFields: `New Process Name, Process Command Line, Account Name`,
    rationale: `vssadmin.exe, bcdedit.exe, wbadmin.exe 등이 Volume Shadow Copy 삭제, 백업 카탈로그 삭제, 부팅 복구 비활성화 명령을 수행할 때 4688 이벤트가 생성된다.
- Command Line에 "vssadmin delete shadows /all /quiet", "bcdedit /set {default} recoveryenabled No" 등이 보이면 복구 차단 가능성을 의심할 수 있다.`,
    situation: `vssadmin.exe, bcdedit.exe, wbadmin.exe, wmic.exe 등이 볼륨 섀도 복사본 삭제, 백업 카탈로그 삭제, 부팅 복구 비활성화를 수행할 때 해당 이벤트가 기록된다.`,
    improvement: `시스템 복구 차단을 막기 위해서는 Volume Shadow Copy, 복구 파티션, 백업 카탈로그 등 자체 복구 기능에 대한 무단 변경을 금지해야 한다. vssadmin, bcdedit, wbadmin 같은 도구 사용을 엄격히 제한하고, 일반 사용자나 서비스 계정이 복구 설정을 변경할 수 없도록 권한 구조를 설계해야 한다.`,
    severity: 'high'
  },

  // 25. T1565 데이터 조작
  {
    key: 'T1565',
    category: '정책 우회/구성 변경 공격',
    mitreId: 'T1565',
    threatType: '데이터 조작',
    description: `적대자는 외부 결과에 영향을 미치거나 활동을 숨기기 위해 데이터를 삽입, 삭제 또는 조작하여 데이터 무결성을 위협할 수 있다.`,
    eventId: '4670',
    logFields: `Object Name, Object Type, Account Name, Original Security Descriptor, New Security Descriptor`,
    rationale: `개체의 권한이 변경될 때 생성되는 로그로 데이터 조작 및 무결성 위협을 직접 포착한다.
- Object Name이 로그파일(.log), DB(.mdb, .sqlite), ntds.dit 등일 때 ACL 변경은 고위험 신호이다.
- Original/New Security Descriptor 비교로 Everyone/Guests 권한 부여 등 비인가 권한 조작을 확인할 수 있다.`,
    situation: `파일/레지스트리 객체의 ACL/Permissions 변경 시 생성된다. 공격자가 데이터 무결성 공격을 위해 민감 파일·시스템 파일 권한을 변경할 때 발생한다.`,
    improvement: `로그파일·DB·시스템 파일 등 무결성이 중요한 객체 권한을 최소 권한 원칙으로 유지하고, 비인가 계정이 ACL을 변경할 수 없도록 해야 한다. 객체 보안 설정 변경 자체를 차단하고, 서비스·애플리케이션 계정도 필요한 권한만 갖도록 제한해야 한다.`,
    severity: 'high'
  },

  // 26. T1078 유효 계정(퇴직자 위협)
  {
    key: 'T1078',
    category: '퇴직자 위협',
    mitreId: 'T1078',
    threatType: '유효 계정 악용(퇴직자 계정)',
    description: `공격자는 기존 계정의 자격 증명을 획득해 초기 접근, 지속성, 권한 상승 또는 방어 회피 수단으로 악용할 수 있다. 특히 퇴직자 계정이 비활성화되지 않은 경우, VPN·RDP·메일 등으로 계속 접근이 가능하다.`,
    eventId: '4624',
    logFields: `Account Name, Logon Type, Source Network Address`,
    rationale: `모든 성공적인 로그온 시 생성되는 이벤트로, 퇴직자 계정 재사용 여부를 확인하는 핵심 로그이다.
- Account Name이 퇴직자 계정이면 유효 계정 남용 가능성을 의심할 수 있다.
- Logon Type 3(Network), 10(RemoteInteractive)에서 퇴직자 계정 로그온이 보이면 원격 접근 남용을 의심할 수 있다.
- Source Network Address가 회사 외부 IP 또는 미등록 위치면 외부에서 계정 악용을 의심한다.`,
    situation: `퇴직자 계정이 VPN/RDP/도메인 로그온으로 재접속할 때 발생할 수 있다. 정상 사용자 로그온에서도 발생하지만, 퇴직자 계정·비정상 시간대·비정상 위치 조합이면 내부자 위협 탐지 시 중요하다.`,
    improvement: `퇴직자 계정 악용을 막기 위해서는 계정 라이프사이클 관리가 필수적이다. 퇴직·이동·휴직 등 상태 변화 발생 시 계정 비활성화 또는 삭제를 즉시 수행해야 한다. 외부 접속 가능한 모든 시스템에 대해 MFA를 적용하고, 계정 사용 범위·시간·접속 위치를 제한해야 한다.`,
    severity: 'medium'
  },

  // 27. T1098 계정 조작
  {
    key: 'T1098',
    category: '정책 우회/구성 변경 공격',
    mitreId: 'T1098',
    threatType: '계정 조작',
    description: `공격자는 접근 권한 유지·상승을 위해 계정 속성·그룹 멤버십·로그온 정책 등을 조작한다. 비밀번호 만료 회피, 스마트카드 요구 비활성화 등 보안 속성을 약화하는 방식이 포함된다.`,
    eventId: '4738',
    logFields: `Target Account, Changed Attributes, Subject > Account Name`,
    rationale: `계정 속성이 변경될 때 생성되는 이벤트로, 계정 조작을 직접 포착할 수 있다.
- Target Account가 관리자/서비스 계정이고 Changed Attributes에 "Password not required", "Account never expires"가 있으면 계정 조작 가능성이 크다.
- Subject > Account Name이 비관리자 계정인데 고권한 계정 변경을 수행하면 비인가 계정 조작으로 본다.`,
    situation: `net user, PowerShell Set-ADUser, AD 사용자 관리 도구 등으로 계정 속성을 변경할 때 생성된다. 정상 HR/관리 작업에서도 발생하지만, 비정상 시간대·비관리자 계정 패턴은 악성 계정 조작 신호다.`,
    improvement: `관리자·서비스 계정 등 고권한 계정 속성 변경을 일반 사용자가 수행할 수 없도록 권한을 강하게 제한해야 한다. 계정 보안 속성 변경 자체를 엄격히 통제하고, 패스워드 정책·만료 정책·로그온 제약 조건을 표준화해야 한다.`,
    severity: 'high'
  },

  // 28. T1136 계정 생성
  {
    key: 'T1136',
    category: '계정/권한 조작',
    mitreId: 'T1136',
    threatType: '계정 생성',
    description: `공격자는 피해자 시스템에 대한 접근을 유지하기 위해 계정을 생성할 수 있다. 충분한 수준의 권한이 있는 경우, 새로운 계정을 만들어 장기적인 원격 접근 수단으로 활용할 수 있다.`,
    eventId: '4720',
    logFields: `New Account, Attributes, Subject > Account Name`,
    rationale: `새로운 사용자 개체가 생성될 때마다 생성되는 이벤트이다.
- New Account > Account Name이 "tempuser", "backup", "admin2" 등 의심스러운 이름이면 악성 계정 생성 가능성을 의심한다.
- Attributes > New UAC Value에서 0x15(비활성화+PasswordNotRequired) 등 비정상 속성이 있으면 백도어 계정 설정 가능성이 크다.`,
    situation: `net user newuser password /add, PowerShell New-LocalUser 등으로 계정을 생성할 때 발생한다.`,
    improvement: `악성 계정 생성을 막기 위해서는 신규 계정 생성 권한을 관리자·전담 운영 계정으로만 제한하고, 일반 사용자나 서비스 계정이 계정을 추가할 수 없도록 구조를 설계해야 한다. 또한 계정 속성 변경 자체를 강하게 통제해 “PasswordNotRequired”, “Account never expires” 같은 약화된 속성이 설정되지 못하도록 해야 한다.`,
    severity: 'high'
  },

  // 29. T1070 로그 조작(지표 제거)
  {
    key: 'T1070',
    category: '로그 조작(증거 은닉)',
    mitreId: 'T1070',
    threatType: '지표 제거(로그 삭제)',
    description: `공격자는 침입 활동을 숨기기 위해 Windows 이벤트 로그를 삭제하는 경우가 있다. 보안·시스템·응용프로그램 로그를 제거하면 탐지 및 포렌식 분석이 어려워진다.`,
    eventId: '1102',
    logFields: `Security ID, Account Name, Log File, Process Information`,
    rationale: `Security 로그 클리어 시 1102 이벤트가 생성되어 로그 삭제 행위를 기록한다.
- Subject > Security ID와 Account Name이 비관리자 계정 또는 비정상 계정인데 1102가 발생하면 악성 로그 클리어 가능성을 의심할 수 있다.
- Log File (Cleared)에 "Security"가 명시되면 보안 흔적 삭제를 의미한다.
- Process Information에서 wevtutil.exe 또는 powershell.exe가 보이면 명령줄 기반 로그 클리어로 본다.`,
    situation: `Security 이벤트 로그가 wevtutil cl security, PowerShell Remove-EventLog, Event Viewer GUI를 통해 클리어될 때 생성된다. 정상 시스템 관리 작업에서는 거의 발생하지 않으며, 지표 제거 탐지 시 핵심 이벤트이다.`,
    improvement: `로그 삭제는 공격자가 자신의 활동 흔적을 숨기기 위해 수행하는 대표적 지표 제거 기법이므로, 보안·시스템 로그에 대한 삭제 및 변경 권한을 철저히 제한해야 한다. wevtutil·PowerShell 기반 이벤트 클리어 사용을 통제하고, 일반 사용자나 비인가 계정이 로그 파일을 초기화하지 못하도록 권한 구조를 강화해야 한다.`,
    severity: 'high'
  },

  // 30. T1053 예약 작업
  {
    key: 'T1053',
    category: '예약 작업·서비스 악용(지속성 확보)',
    mitreId: 'T1053',
    threatType: '예약된 작업',
    description: `공격자는 작업 스케줄링 기능을 악용해 악성 코드의 초기 실행 또는 반복 실행을 용이하게 한다. 시스템 시작 시 또는 특정 일정에 맞춰 악성 프로그램을 자동 실행하는 데 사용된다.`,
    eventId: '4698',
    logFields: `Task Name, Task Content, Account Name`,
    rationale: `새 예약 작업이 생성될 때마다 생성되는 이벤트이다.
- Task Name이 "Updater", "WindowsUpdate", "SVCHOST" 등 위장된 이름이면 악성 예약 작업 생성 가능성을 의심할 수 있다.
- Task Content에서 악성 페이로드 경로나 명령이 등록되어 있으면 서비스 악용 행위를 의심할 수 있다.`,
    situation: `schtasks /create, PowerShell New-ScheduledTask, Task Scheduler GUI 등을 통해 새 예약 작업을 만들 때 발생한다.`,
    improvement: `예약 작업 악용을 막으려면 schtasks·PowerShell·Task Scheduler를 통해 실행 파일이나 스크립트가 임의로 등록되지 못하도록 작업 생성 권한을 최소화해야 한다. 자동 실행 경로와 실행 계정 권한을 제한하고, 허용된 작업 목록만 운영하도록 관리 절차를 강화해야 한다.`,
    severity: 'medium'
  },

  // 31. T1543 시스템 프로세스 생성·수정
  {
    key: 'T1543',
    category: '예약 작업·서비스 악용(지속성 확보)',
    mitreId: 'T1543',
    threatType: '시스템 프로세스 생성 또는 수정',
    description: `Windows에서 공격자는 서비스를 새로 만들거나 기존 서비스를 수정해 지속적으로 악성 페이로드를 실행할 수 있다. 서비스는 부팅 시 자동 실행되고 SYSTEM 권한으로 동작하는 경우가 많아, 악성 실행 파일을 서비스로 등록하면 재부팅 후에도 계속 실행된다.`,
    eventId: '7045',
    logFields: `Service Name, Service File Name, Service Type, Start Type, Service Account`,
    rationale: `새 서비스가 시스템에 설치될 때 반드시 기록되는 로그이다. binPath에 비정상 경로(C:\\Users\\Public, Temp, AppData 등)나 의심 실행 파일이 포함되면 악성 서비스 생성 정황으로 본다.`,
    situation: `원격 침투 이후 sc.exe, PowerShell(New-Service) 등으로 악성 exe를 서비스로 등록하는 경우 발생한다. 정상 서비스 이름으로 위장한 악성 서비스 등록이나 재부팅 후 자동 실행을 위한 지속성 확보 과정에서도 동일하다.`,
    improvement: `서비스 생성·수정 권한을 엄격히 제한하고, 서비스가 실행하는 바이너리 경로와 무결성을 보호해야 한다. 서비스 등록 경로나 실행 파일 배치 경로를 통제하면 지속성을 확보하기 어려워진다.`,
    severity: 'high'
  },

  // 32. T1052 USB/외장매체 기반 유출
  {
    key: 'T1052',
    category: 'USB/외장매체 기반 유출',
    mitreId: 'T1052',
    threatType: '물리적 매체를 통한 침투/유출',
    description: `공격자는 이동식 드라이브와 같은 물리적 매체를 통해 데이터를 유출하거나 악성코드를 반입할 수 있다. 외장 HDD, USB 드라이브, 휴대폰, 기타 이동식 저장장치가 포함된다.`,
    eventId: '4663',
    logFields: `Task Category, Object Name, Account Name`,
    rationale: `USB 기반 유출의 핵심인 “데이터 복사 행위”를 4663(Object Access)이 포착한다.
- Task Category가 "Removable Storage Device"이면 USB/외장매체 접근을 의미한다.
- Object Name이 E:, F:\\ 등 USB 드라이브이고 대량 .docx/.pdf 읽기/쓰기가 확인되면 데이터 복사 유출 가능성을 의심할 수 있다.`,
    situation: `USB/외장매체에 대한 파일 읽기/쓰기 접근 시 "Task Category: Removable Storage Device"로 생성된다. 정상 파일 복사에서도 발생하지만, 대량·민감 파일 접근 패턴은 내부자 데이터 유출 탐지에 중요하다.`,
    improvement: `USB·외장매체 기반 유출을 막으려면 물리적 저장장치 사용 자체를 엄격히 제한하거나, 승인된 장치만 사용 가능하도록 통제해야 한다. 민감 데이터에 대한 읽기·복사 권한을 최소화하고 외장매체로의 대량 파일 복사가 불가능한 구조를 유지해야 한다.`,
    severity: 'medium'
  }
]


// DiagnosisEvaluation에서 쓰던 시나리오 코드 ↔ MITRE 기법 매핑
const SCENARIO_TO_TECHNIQUES: Record<string, string[]> = {
  '01_user_negligence': ['T1566', 'T1204', 'T1059', 'T1027'],
  '02_external_attacker': ['T1110', 'T1078', 'T1021', 'T1071', 'T1571', 'T1499'],
  '06_credential_attack': ['T1003', 'T1555', 'T1550', 'T1110']
}

// (1) 시나리오 문자열 안에 THREAT_GUIDES.key(T1003 등)가 직접 들어있을 때 매칭
function resolveThreatsByKeyTokens(detectedScenarios: string[]): ThreatGuide[] {
  if (!Array.isArray(detectedScenarios) || detectedScenarios.length === 0) {
    return []
  }

  const results: ThreatGuide[] = []
  const seen = new Set<string>()

  detectedScenarios.forEach((raw) => {
    const scenario = (raw || '').toString().trim()
    if (!scenario) return

    THREAT_GUIDES.forEach((guide) => {
      const key = guide.key.trim()
      if (!key) return

      const match =
        scenario === key ||
        scenario.includes(key) ||
        key.includes(scenario)

      if (match && !seen.has(guide.key)) {
        seen.add(guide.key)
        results.push(guide)
      }
    })
  })

  return results
}

// (2) SCENARIO_TO_TECHNIQUES 테이블 기반 매칭 (01_user_negligence → T1566, T1204, ...)
function resolveThreatsByScenarioCodes(detectedScenarios: string[]): ThreatGuide[] {
  if (!Array.isArray(detectedScenarios) || detectedScenarios.length === 0) {
    return []
  }

  const results: ThreatGuide[] = []
  const seen = new Set<string>()

  detectedScenarios.forEach((raw) => {
    const scenarioCode = (raw || '').toString().trim()
    if (!scenarioCode) return

    const techniqueKeys = SCENARIO_TO_TECHNIQUES[scenarioCode]
    if (!techniqueKeys) return

    techniqueKeys.forEach((tKey) => {
      THREAT_GUIDES.forEach((guide) => {
        if (guide.key === tKey && !seen.has(guide.key)) {
          seen.add(guide.key)
          results.push(guide)
        }
      })
    })
  })

  return results
}

// 텍스트 배열에서 3~5자리 숫자 이벤트 ID 추출 (예: "4624", "EventID: 4688" 등)
function extractEventIdsFromTextList(texts: (string | number)[]): Set<string> {
  const ids = new Set<string>()
  texts.forEach((raw) => {
    if (raw === null || raw === undefined) return
    const text = raw.toString()
    const matches = text.match(/\d{3,5}/g)
    if (!matches) return
    matches.forEach((id) => ids.add(id))
  })
  return ids
}

// ThreatGuide.eventId 문자열("4624/4625/4688", "5156 (방화벽 로그)" 등)에서 숫자 이벤트 ID만 추출
function extractGuideEventIds(eventIdField: string): string[] {
  if (!eventIdField) return []
  const matches = eventIdField.match(/\d{3,5}/g)
  return matches ?? []
}

// (3) 이벤트 ID 기반 매칭
function resolveThreatsByEventIds(allEventIds: Set<string>): ThreatGuide[] {
  if (!allEventIds || allEventIds.size === 0) return []

  const results: ThreatGuide[] = []
  const seen = new Set<string>()

  THREAT_GUIDES.forEach((guide) => {
    const guideEventIds = extractGuideEventIds(guide.eventId)
    if (guideEventIds.length === 0) return

    const hasIntersection = guideEventIds.some((id) => allEventIds.has(id))
    if (hasIntersection && !seen.has(guide.key)) {
      seen.add(guide.key)
      results.push(guide)
    }
  })

  return results
}

// 최종 통합 매칭: 시나리오 코드, MITRE 키, 이벤트 ID 전부 활용
function resolveAllMatchedThreats(stored: ThreatReportStoredResult | null): ThreatGuide[] {
  if (!stored) return []

  const detectedScenarios = Array.isArray(stored.detectedScenarios)
    ? stored.detectedScenarios.map((s) => s.toString())
    : []

  const all: ThreatGuide[] = []
  const seen = new Set<string>()

  const pushUnique = (list: ThreatGuide[]) => {
    list.forEach((g) => {
      if (!seen.has(g.key)) {
        seen.add(g.key)
        all.push(g)
      }
    })
  }

  // ① 시나리오 코드(01_user_negligence 등) → SCENARIO_TO_TECHNIQUES
  pushUnique(resolveThreatsByScenarioCodes(detectedScenarios))

  // ② 시나리오 문자열 안에 포함된 MITRE 키(T1003 등)
  pushUnique(resolveThreatsByKeyTokens(detectedScenarios))

  // ③ DiagnosisEvaluation에서 모은 이벤트 ID + 시나리오 문자열 안의 숫자 이벤트 ID
  const rawEventIdList: (string | number)[] = []

  if (Array.isArray(stored.collectedEventIds)) {
    rawEventIdList.push(...stored.collectedEventIds)
  }
  if (Array.isArray(stored.eventIds)) {
    rawEventIdList.push(...stored.eventIds)
  }
  // 시나리오 문자열 안에 "4624/4625" 같이 들어있을 수도 있으니 같이 넣어준다.
  rawEventIdList.push(...detectedScenarios)

  const eventIdSet = extractEventIdsFromTextList(rawEventIdList)
  pushUnique(resolveThreatsByEventIds(eventIdSet))

  return all
}

const ThreatReportPage: React.FC = () => {
  const [storedResult, setStoredResult] = useState<ThreatReportStoredResult | null>(null)
  const [matchedThreats, setMatchedThreats] = useState<ThreatGuide[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    try {
      if (typeof window === 'undefined') {
        setIsLoading(false)
        return
      }

      const raw = window.localStorage.getItem('dapo:lastDiagnosisResult')
      if (!raw) {
        setStoredResult(null)
        setMatchedThreats([])
        setIsLoading(false)
        return
      }

      const parsed: any = JSON.parse(raw)

      const stored: ThreatReportStoredResult = {
        evaluationResult: parsed.evaluationResult || null,
        detectedScenarios: Array.isArray(parsed.detectedScenarios)
          ? parsed.detectedScenarios.map((s: any) => s.toString())
          : [],
        collectedEventIds: Array.isArray(parsed.collectedEventIds)
          ? parsed.collectedEventIds
          : Array.isArray(parsed.eventIds)
            ? parsed.eventIds
            : undefined,
        eventIds: Array.isArray(parsed.eventIds) ? parsed.eventIds : undefined
      }

      setStoredResult(stored)

      // DiagnosisEvaluation.tsx에서 수집한 시나리오/이벤트 ID를 모두 활용해서 매칭
      const matched = resolveAllMatchedThreats(stored)
      setMatchedThreats(matched)
    } catch (error) {
      console.error('위협 리포트 데이터 로드 실패:', error)
      setStoredResult(null)
      setMatchedThreats([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  const formatScore = (score: number | undefined | null) => {
    if (score === null || score === undefined || Number.isNaN(score)) return '-'
    return `${score}`
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="bg-white rounded-lg shadow-sm p-6 flex items-center">
        <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center mr-4">
          <ShieldCheck className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">위협 개선 리포팅</h1>
          <p className="text-gray-600 mt-1">
            진단 평가 결과와 탐지된 위협 시나리오를 기반으로, 이벤트 로그 관점의 판단 근거와 개선책을 제공합니다.
          </p>
        </div>
      </div>

      {/* 로딩 상태 */}
      {isLoading && (
        <div className="bg-white rounded-lg shadow-sm p-8 flex flex-col items-center justify-center">
          <div className="relative w-16 h-16 mb-4">
            <div className="absolute inset-0 rounded-full border-4 border-purple-200" />
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-purple-600 animate-spin" />
          </div>
          <p className="text-gray-700 font-medium">최근 진단 결과를 불러오는 중입니다...</p>
        </div>
      )}

      {/* 진단 이력 없음 */}
      {!isLoading && !storedResult && (
        <div className="bg-white rounded-lg shadow-sm p-8 flex flex-col items-center justify-center border border-dashed border-gray-300">
          <AlertTriangle className="w-10 h-10 text-yellow-500 mb-3" />
          <h2 className="text-lg font-semibold text-gray-900 mb-1">최근 진단 결과가 없습니다</h2>
          <p className="text-gray-600 text-sm text-center mb-4">
            먼저 <span className="font-semibold">진단 평가</span>를 수행한 뒤, 그 결과를 기반으로 위협 개선 리포팅을 조회할 수 있습니다.
          </p>
        </div>
      )}

      {/* 결과가 있을 때 */}
      {!isLoading && storedResult && storedResult.evaluationResult && (
        <>
          {/* 상단 요약 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 제로트러스트 총점 카드 */}
            <div className="bg-gradient-to-br from-purple-600 via-indigo-600 to-purple-700 rounded-xl p-6 text-white shadow-lg relative overflow-hidden">
              <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-white/10" />
              <div className="absolute -left-10 bottom-0 w-32 h-32 rounded-full bg-black/10" />
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    <CalculatorIcon />
                    <span className="ml-2 text-sm font-medium text-white/80">
                      Zero Trust 진단 점수
                    </span>
                  </div>
                  <span className="text-xs bg-white/20 px-3 py-1 rounded-full">
                    최근 진단 결과
                  </span>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-5xl font-extrabold leading-none">
                      {formatScore(storedResult.evaluationResult.totalScore)}
                      <span className="text-2xl ml-1">점</span>
                    </div>
                    <p className="mt-2 text-sm text-purple-100">
                      진단 평가에서 산출된 제로트러스트 종합 점수입니다.
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-purple-100 mb-1">체크리스트 점수</p>
                    <p className="text-lg font-semibold">
                      {formatScore(storedResult.evaluationResult.breakdown.maturity)}점
                    </p>
                    <p className="text-xs text-purple-100 mt-3 mb-1">위협 시나리오 점수</p>
                    <p className="text-lg font-semibold">
                      {formatScore(storedResult.evaluationResult.breakdown.asset)}점
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 성숙도 카드 */}
            <div className="bg-white rounded-xl shadow-sm p-6 border border-indigo-100 flex flex-col justify-between">
              <div className="flex items-center mb-4">
                <ListChecks className="w-6 h-6 text-indigo-600 mr-2" />
                <h2 className="text-lg font-semibold text-gray-900">Zero Trust 성숙도</h2>
              </div>
              <div className="mb-4">
                <p className="text-3xl font-bold text-indigo-700 mb-1">
                  {storedResult.evaluationResult.maturityLevel || '-'} 단계
                </p>
                <p className="text-sm text-gray-600">
                  {storedResult.evaluationResult.maturityDescription ||
                    '성숙도 설명이 제공되지 않았습니다.'}
                </p>
              </div>
              <div className="flex items-center text-xs text-gray-500 bg-indigo-50/60 rounded-lg px-3 py-2">
                <Info className="w-4 h-4 text-indigo-500 mr-1" />
                <span>
                  현재 성숙도 수준에서 발생할 수 있는 위협 시나리오에 대한{' '}
                  <span className="font-semibold">구체적인 로그 근거와 개선책</span>을 제공합니다.
                </span>
              </div>
            </div>

            {/* 탐지된 위협 시나리오 요약 카드 */}
            <div className="bg-white rounded-xl shadow-sm p-6 border border-purple-100 flex flex-col justify-between">
              <div className="flex items-center mb-3">
                <Search className="w-6 h-6 text-purple-600 mr-2" />
                <h2 className="text-lg font-semibold text-gray-900">탐지된 위협 시나리오</h2>
              </div>

              {(!storedResult.detectedScenarios ||
                storedResult.detectedScenarios.length === 0) && (
                <div className="flex-1 flex flex-col justify-center">
                  <p className="text-sm text-gray-600 mb-1">탐지된 위협 시나리오가 없습니다.</p>
                  <p className="text-xs text-gray-500">
                    현재 진단 결과 기준에서는 로그 기반으로 특이 위협 시나리오가 식별되지 않았습니다.
                  </p>
                </div>
              )}

              {storedResult.detectedScenarios &&
                storedResult.detectedScenarios.length > 0 && (
                  <>
                    <p className="text-sm text-gray-600 mb-3">
                      최근 진단에서{' '}
                      <span className="font-semibold text-purple-700">
                        {storedResult.detectedScenarios.length}
                      </span>
                      개의 위협 시나리오가 선별되었습니다.
                    </p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {storedResult.detectedScenarios.map((scenario, idx) => (
                        <span
                          key={`${scenario}-${idx}`}
                          className="inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-purple-50 text-purple-700 border border-purple-100"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-500 mr-1.5" />
                          {scenario}
                        </span>
                      ))}
                    </div>
                  </>
                )}
            </div>
          </div>

          {/* 위협 개선 카드들 */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <AlertTriangle className="w-6 h-6 text-red-500 mr-2" />
                <h2 className="text-xl font-semibold text-gray-900">
                  발생 가능한 위협 시나리오
                </h2>
              </div>
              <span className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
                매칭된 위협 수:{' '}
                <span className="font-semibold text-gray-900">{matchedThreats.length}</span>
              </span>
            </div>

            {matchedThreats.length === 0 && (
              <div className="border border-dashed border-gray-300 rounded-lg p-6 text-center">
                <BookOpen className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-700 mb-1">
                  현재 탐지된 시나리오/이벤트 ID와 매칭되는 상세 위협 정의가 없습니다.
                </p>
                <p className="text-xs text-gray-500">
                  DiagnosisEvaluation.tsx에서 수집한 시나리오 코드(예: 01_user_negligence)나
                  이벤트 ID(4624, 4688, 5156 등)가 위협 가이드의 키·이벤트 ID와 매칭되도록
                  구성되면, 위협별 안내와 개선책이 자동으로 출력됩니다.
                </p>
              </div>
            )}

            {matchedThreats.length > 0 && (
              <div className="mt-4 space-y-5">
                {matchedThreats.map((threat, index) => {
                  const meta = getSeverityMeta(threat.severity || 'medium')
                  return (
                    <div
                      key={`${threat.key}-${index}`}
                      className="border border-gray-200 rounded-lg p-5 hover:border-gray-300 hover:shadow-md transition-all"
                    >
                      {/* 헤더 영역 */}
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between mb-4 gap-3">
                        <div>
                          <div className="flex items-center mb-1 flex-wrap gap-2">
                            <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                              {threat.category}
                            </span>
                            <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-50 text-gray-700 border border-gray-200">
                              MITRE {threat.mitreId}
                            </span>
                            <span
                              className={
                                'inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ' +
                                meta.badgeClass
                              }
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5" />
                              위험도 {meta.label}
                            </span>
                          </div>
                          <h3
                            className={
                              'text-lg font-bold flex items-center gap-1.5 ' +
                              meta.titleClass
                            }
                          >
                            <AlertTriangle className="w-4 h-4" />
                            {threat.threatType}
                          </h3>
                        </div>

                        <div className="flex items-center text-xs bg-gray-50 text-gray-700 px-3 py-2 rounded-lg border border-gray-200">
                          <span className="font-semibold mr-1">이벤트 ID</span>
                          <span className="font-bold text-gray-900">{threat.eventId}</span>
                        </div>
                      </div>

                      {/* 본문 그리드 */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm">
                        {/* 왼쪽: 위협 설명 + 로그 필드 */}
                        <div className="space-y-3">
                          <div className={meta.descContainerClass + ' rounded-md p-3'}>
                            <h4
                              className={
                                'flex items-center text-xs font-semibold mb-1 ' +
                                meta.descTitleClass
                              }
                            >
                              <AlertTriangle className="w-4 h-4 mr-1.5" />
                              위협 설명 (공격 시나리오)
                            </h4>
                            <p className="text-sm text-gray-900 leading-relaxed">
                              {threat.description}
                            </p>
                          </div>
                          <div className="bg-gray-50 rounded-md p-3 border border-gray-200">
                            <h4 className="text-xs font-semibold text-gray-700 mb-1">
                              탐지된 이벤트 로그 정보
                            </h4>
                            <p className="text-xs text-gray-900 leading-relaxed">
                              <span className="font-semibold text-gray-900">
                                이벤트 ID {threat.eventId}
                              </span>
                              <span className="text-gray-500"> / 주요 필드: </span>
                              {threat.logFields}
                            </p>
                          </div>
                        </div>

                        {/* 오른쪽: 판단 근거 + 발생 상황 */}
                        <div className="space-y-3">
                          <div>
                            <h4 className="flex items-center text-xs font-semibold text-gray-700 mb-1">
                              <Info className="w-4 h-4 text-blue-500 mr-1.5" />
                              이 로그가 의미하는 위험
                            </h4>
                            <p className="text-sm text-gray-900 leading-relaxed">
                              {threat.rationale}
                            </p>
                          </div>
                          <div className="bg-indigo-50 rounded-md p-3 border border-indigo-100">
                            <h4 className="text-xs font-semibold text-indigo-800 mb-1">
                              이 로그가 왜 발견되었나요?
                            </h4>
                            <p className="text-xs text-indigo-900/90 leading-relaxed">
                              {threat.situation}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* 개선책 */}
                      <div className="mt-4 border-top border-dashed border-gray-200 pt-3">
                        <h4 className="flex items-center text-xs font-semibold text-emerald-700 mb-1.5">
                          <ShieldCheck className="w-4 h-4 text-emerald-500 mr-1.5" />
                          보안 대책
                        </h4>
                        <p className="text-sm text-gray-900 leading-relaxed">
                          {threat.improvement}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// 진단 페이지와 분위기를 맞추기 위한 Calculator 아이콘
const CalculatorIcon: React.FC = () => (
  <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center">
    <svg
      className="w-5 h-5 text-white"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <rect x="9" y="7" width="6" height="2" />
      <circle cx="10" cy="13" r="1" />
      <circle cx="14" cy="13" r="1" />
      <circle cx="10" cy="17" r="1" />
      <circle cx="14" cy="17" r="1" />
    </svg>
  </div>
)

export default ThreatReportPage
