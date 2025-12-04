// src/pages/ZTAttackTest.tsx
import React, { useEffect, useMemo, useState } from 'react'
import {
  Target,
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Play,
  Activity,
  Terminal,
  ListChecks,
} from 'lucide-react'
import { saltApi, deviceApi } from '../utils/api'

type RiskLevel = 'high' | 'medium' | 'low'

interface SaltTarget {
  id: string
  name?: string
  ip?: string
  status?: 'online' | 'offline' | string
  os?: string
  roles?: string[]
}

interface AttackTestDef {
  id: number
  risk: RiskLevel
  title: string
  description: string
  mitre: string
  commands: string[]
}

const ATTACK_TESTS: AttackTestDef[] = [
  // 🔴 위험도 높음
  {
    id: 7,
    risk: 'high',
    title: 'Remote Service 생성 시도',
    description: '원격 시스템에 새로운 서비스를 생성하여 코드 실행을 시도합니다.',
    mitre: 'MITRE T1543.003',
    commands: [
      'sc.exe \\\\10.10.10.12 create TestService binpath= "cmd.exe /C whoami"',
      'sc.exe \\\\10.10.10.12 delete TestService',
    ],
  },
  {
    id: 8,
    risk: 'high',
    title: 'Scheduled Task 생성 시도',
    description: '원격 시스템에 예약 작업을 생성하여 명령 실행을 시도합니다.',
    mitre: 'MITRE T1053.005',
    commands: [
      'schtasks /Create /S 10.10.10.12 /TN "TestTask" /TR "cmd.exe /c whoami" /SC ONCE /ST 12:00',
      'schtasks /Delete /S 10.10.10.12 /TN "TestTask" /F',
    ],
  },
  {
    id: 9,
    risk: 'high',
    title: 'SMB 파일 복제 (Lateral Tool Transfer)',
    description: 'SMB 공유를 통해 원격 시스템으로 도구/파일을 전파하는지 테스트합니다.',
    mitre: 'MITRE T1570',
    commands: [
      'Copy-Item C:\\Users\\Public\\test.bat \\\\10.10.10.12\\C$\\Temp\\test.bat',
    ],
  },
  {
    id: 16,
    risk: 'high',
    title: 'WinRM 은닉형 원격 명령',
    description: '커스텀 WinRM 엔드포인트를 통해 은닉형 원격 명령 실행이 가능한지 확인합니다.',
    mitre: 'MITRE T1021.006',
    commands: [
      'Enter-PSSession -ComputerName 10.10.10.12 -ConfigurationName "MyEndpoint" -Credential (Get-Credential)',
    ],
  },
  {
    id: 20,
    risk: 'high',
    title: '원격 시스템 종료 / 재부팅 시도',
    description: '원격 시스템에 대한 shutdown / reboot 명령이 허용되는지 시도합니다.',
    mitre: 'MITRE T1529',
    commands: [
      'shutdown /m \\\\10.10.10.12 /r /t 0 /c "Test reboot from 10.10.10.11"',
      'shutdown /m \\\\10.10.10.12 /s /t 0 /c "Test shutdown from 10.10.10.11"',
    ],
  },

  // 🟠 위험도 중간
  {
    id: 1,
    risk: 'medium',
    title: 'WMI 원격 명령 실행',
    description: 'WMI를 이용하여 원격 프로세스 생성이 가능한지 확인합니다.',
    mitre: 'MITRE T1047',
    commands: [
      'Invoke-WmiMethod -ComputerName 10.10.10.12 -Class Win32_Process -Name Create -ArgumentList "cmd.exe /c whoami"',
    ],
  },
  {
    id: 2,
    risk: 'medium',
    title: 'PowerShell Remoting 원격 명령 실행',
    description: 'PowerShell Remoting 세션을 통한 원격 명령 실행 시도를 테스트합니다.',
    mitre: 'MITRE T1021.006',
    commands: [
      'Enter-PSSession -ComputerName 10.10.10.12 -Credential (Get-Credential)',
    ],
  },
  {
    id: 4,
    risk: 'medium',
    title: 'RDP 연결 실행',
    description: 'RDP 포트 및 세션 연결 시도가 가능한지 확인합니다.',
    mitre: 'MITRE T1021.001',
    commands: [
      'cmd.exe /c "mstsc /v:10.10.10.12"',
      'Test-NetConnection -ComputerName 10.10.10.12 -Port 3389',
    ],
  },
  {
    id: 6,
    risk: 'medium',
    title: '네트워크 서비스 포트 스캔',
    description: '1~1024 포트에 대해 기본 포트 스캔을 수행하여 노출 서비스 여부를 확인합니다.',
    mitre: 'MITRE T1046',
    commands: [
      '1..1024 | % { Test-NetConnection -ComputerName 10.10.10.12 -Port $_ -InformationLevel Quiet }',
    ],
  },
  {
    id: 13,
    risk: 'medium',
    title: '내부 관리자 콘솔 접근 실행',
    description: '내부 관리 콘솔 웹 UI 접근 가능 여부를 테스트합니다.',
    mitre: 'MITRE T1071',
    commands: [
      'Invoke-WebRequest -Uri "https://10.10.10.50:8443" -UseBasicParsing  # 실제 콘솔 IP로 수정 필요',
    ],
  },
  {
    id: 14,
    risk: 'medium',
    title: '원격 드라이브 매핑 및 지속적 파일 접근',
    description: '원격 공유 드라이브를 매핑하여 지속적인 파일 접근이 가능한지 확인합니다.',
    mitre: 'MITRE T1021.002, T1074',
    commands: [
      'net use Z: \\\\10.10.10.12\\Share /user:TESTDOMAIN\\testuser testpassword',
      'dir Z:\\',
    ],
  },
  {
    id: 15,
    risk: 'medium',
    title: '비인가 프로토콜 내부 통신 경로 탐색',
    description: 'Ping 기반으로 내부 IP 대역의 활성 호스트를 탐색합니다.',
    mitre: 'MITRE T1018, T1046',
    commands: [
      '1..200 | ForEach-Object { $ip = "10.10.10.$_"; if (Test-Connection -ComputerName $ip -Count 1 -Quiet) { "$ip is alive" } }',
    ],
  },
  {
    id: 18,
    risk: 'medium',
    title: '원격 로그인 사용자 세션 조회',
    description: '원격 시스템에 로그인한 사용자 세션 정보를 조회합니다.',
    mitre: 'MITRE T1087, T1018',
    commands: [
      'quser /server:10.10.10.12',
      'query user /server:10.10.10.12',
    ],
  },
  {
    id: 19,
    risk: 'medium',
    title: '원격 프로세스 목록 열람',
    description: '원격 시스템에서 실행 중인 프로세스 목록을 조회합니다.',
    mitre: 'MITRE T1057',
    commands: [
      'tasklist /s 10.10.10.12 /u TESTDOMAIN\\testuser /p TestPassword!123',
    ],
  },

  // 🟢 위험도 낮음
  {
    id: 3,
    risk: 'low',
    title: 'SMB Admin$ 접근 실행',
    description: '관리자 공유(Admin$, C$) 접근 가능 여부를 테스트합니다.',
    mitre: 'MITRE T1021.002',
    commands: [
      'Test-Path \\\\10.10.10.12\\Admin$',
      'Get-ChildItem \\\\10.10.10.12\\C$',
    ],
  },
  {
    id: 5,
    risk: 'low',
    title: '시스템 정보 열람',
    description: '원격 윈도우 OS 정보 조회가 가능한지 확인합니다.',
    mitre: 'MITRE T1082',
    commands: [
      'Get-WmiObject -Class Win32_OperatingSystem -ComputerName 10.10.10.12',
    ],
  },
  {
    id: 10,
    risk: 'low',
    title: 'Remote Registry 레지스트리 조회',
    description: '원격 레지스트리 접근 및 특정 키 조회가 가능한지 확인합니다.',
    mitre: 'MITRE T1012',
    commands: [
      'reg query \\\\10.10.10.12\\HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion',
    ],
  },
  {
    id: 11,
    risk: 'low',
    title: 'AD 기반 Discovery',
    description: '도메인 내 컴퓨터/사용자 정보를 조회하는지 테스트합니다.',
    mitre: 'MITRE T1018, T1087, T1482',
    commands: [
      'Get-ADComputer -Filter * -Properties Name,OperatingSystem',
      'Get-ADUser -Filter * -Properties SamAccountName,Enabled',
    ],
  },
  {
    id: 12,
    risk: 'low',
    title: 'DNS Zone Transfer / 내부 도메인 정보 수집',
    description: 'DNS 서버에서 도메인 정보 전체 조회가 가능한지 확인합니다.',
    mitre: 'MITRE T1046',
    commands: [
      'set type=any',
      'ls -d internal.local      rem 내부 도메인 가정',
    ],
  },
  {
    id: 17,
    risk: 'low',
    title: 'NETBIOS & SMB 공유 자원 열람',
    description: 'NETBIOS 및 공유 자원 목록 조회가 가능한지 확인합니다.',
    mitre: 'MITRE T1018, T1135',
    commands: [
      'nbtstat -A 10.10.10.12',
      'net view /domain',
      'net view \\\\10.10.10.12',
    ],
  },
]

const RISK_LABEL: Record<RiskLevel, string> = {
  high: '🔴 높음',
  medium: '🟠 중간',
  low: '🟢 낮음',
}

const RISK_COLOR: Record<RiskLevel, string> = {
  high: 'bg-red-100 text-red-800 border-red-300',
  medium: 'bg-amber-100 text-amber-800 border-amber-300',
  low: 'bg-emerald-100 text-emerald-800 border-emerald-300',
}

type ResultStatus = 'safe' | 'compromised' | 'unknown' | 'error'

interface ResultSummary {
  status: ResultStatus
  title: string
  description: string
  mitigation?: string
}

interface AttackResult {
  testId: number
  testTitle: string
  risk: RiskLevel
  targetName: string
  targetIp: string
  stdout: string
  stderr: string
  timestamp: string
}

const interpretResult = (testId: number, stdout: string, stderr: string): ResultSummary => {
  const out = stdout || ''
  const err = stderr || ''
  const combined = `${out}\n${err}`

  // TIMEOUT → 공격 완전 차단
  if (/timeout of \d+ms exceeded/i.test(combined)) {
    return {
      status: 'safe',
      title: '공격 시도를 완전히 차단했습니다.',
      description:
        '지정된 시간 내에 대상 시스템이 응답하지 않아 해당 공격 행위가 실행되지 않았습니다. 공격을 발생시킬 수 없는 안전한 환경으로 판단됩니다.',
      mitigation:
        '현재 네트워크 및 정책 설정은 해당 유형의 원격 행위를 효과적으로 차단하고 있습니다. 필요 시 운영 편의성과 보안을 함께 고려하여 타임아웃 및 정책을 조정할 수 있습니다.',
    }
  }

  switch (testId) {
    case 1: {
      const hasReturn0 = /ReturnValue\s*:\s*0/.test(out)
      const hasPid = /ProcessId\s*:\s*\d+/.test(out)
      if (hasReturn0 && hasPid) {
        return {
          status: 'compromised',
          title: 'WMI 원격 프로세스 생성이 성공했습니다.',
          description:
            '공격 테스트에 의해 다음과 같은 결과가 식별되었습니다. 악성 행위가 가능한 취약한 상태입니다. WMI를 통한 원격 프로세스 생성이 허용되어, 공격자가 lateral movement에 활용할 수 있습니다.',
          mitigation:
            'WMI 원격 호출을 허용된 관리 서버로만 제한하고, 방화벽에서 관련 포트(RPC/DCOM)를 통제하십시오. 또한 로컬/도메인 정책을 통해 원격 WMI 실행 권한을 최소화해야 합니다.',
        }
      }
      return {
        status: 'safe',
        title: 'WMI 원격 프로세스 생성이 성공하지 않았습니다.',
        description:
          '해당 테스트에서 WMI 기반 원격 프로세스 생성이 완료되지 않았습니다. 정책 또는 네트워크 수준에서 차단되었을 가능성이 있습니다.',
      }
    }

    case 2: {
      const missingCred =
        /Get-Credential[\s\S]*MissingMandatoryParameter/i.test(combined) ||
        /MissingMandatoryParameter,Microsoft\.PowerShell\.Commands\.GetCredentialCommand/i.test(
          combined,
        )
      if (missingCred) {
        return {
          status: 'safe',
          title: 'PowerShell Remoting 자동 원격 명령 실행이 차단되었습니다.',
          description:
            '자격 증명 입력이 필수이지만 자동으로 전달되지 않아 PowerShell Remoting 세션이 열리지 않았습니다. 본 테스트 기준으로는 원격 명령이 자동 실행되지 않는 상태입니다.',
          mitigation:
            '운영 편의성을 위해 서비스 계정 등을 사용할 경우, 최소 권한 원칙을 적용하고, PowerShell Remoting 허용 대상을 관리망/점검망으로 한정하십시오.',
        }
      }
      return {
        status: 'safe',
        title: 'PowerShell Remoting 원격 명령이 성공적으로 수행되지 않았습니다.',
        description:
          '해당 테스트에서 PowerShell Remoting 기반 원격 명령이 완료되지 않았습니다. 자격 증명/정책 설정에 의해 자동 실행이 제한된 상태입니다.',
      }
    }

    case 3: {
      const hasTrue = /\bTrue\b/i.test(out)
      const hasListing = /Mode\s+LastWriteTime\s+Length\s+Name/.test(out)
      if (hasTrue && hasListing) {
        return {
          status: 'compromised',
          title: 'SMB Admin$ / C$ 관리자 공유에 접근이 허용되었습니다.',
          description:
            '공격 테스트에 의해 다음과 같은 결과가 식별되었습니다. 악성 행위가 가능한 취약한 상태입니다. 원격 SMB 관리자 공유(Admin$, C$)에 접근하여 디렉터리 목록을 조회할 수 있습니다.',
          mitigation:
            'Admin$, C$ 등 관리자 공유를 비활성화하거나, 방화벽에서 SMB(445) 접근을 제한하십시오. 또한 도메인/로컬 정책에서 원격 관리자 공유 및 파일 시스템 접근 권한을 최소화해야 합니다.',
        }
      }
      return {
        status: 'safe',
        title: 'SMB 관리자 공유 접근이 허용되지 않았습니다.',
        description:
          'Admin$ 또는 C$ 공유에 정상적으로 접근하지 못했습니다. SMB 관리자 공유가 차단된 상태로 보입니다.',
      }
    }

    case 4: {
      const tcpTrue = /TcpTestSucceeded\s*:\s*True/i.test(combined)
      const tcpFalse = /TcpTestSucceeded\s*:\s*False/i.test(combined)
      if (tcpTrue) {
        return {
          status: 'compromised',
          title: 'RDP(3389) 원격 접속이 허용되었습니다.',
          description:
            'RDP 포트에 대한 연결 테스트가 성공하여, 원격 데스크톱 접속이 가능한 상태입니다. 공격자가 계정 탈취 시 RDP 기반 침해에 활용할 수 있습니다.',
          mitigation:
            'RDP 포트를 외부/불필요 네트워크에 노출하지 말고, 필요 시 VPN·Jump 서버를 통해서만 접근하도록 구성하십시오. 계정 잠금 정책과 MFA를 함께 적용하는 것이 바람직합니다.',
        }
      }
      if (tcpFalse || /Connecting to remote server .* failed/i.test(combined)) {
        return {
          status: 'safe',
          title: 'RDP 원격 접속 시도가 차단되었습니다.',
          description:
            '해당 테스트에서 RDP 포트 또는 세션 연결이 완료되지 않았습니다. 네트워크 또는 정책 수준에서 RDP 접근이 제한된 상태입니다.',
        }
      }
      return {
        status: 'safe',
        title: 'RDP 원격 접속이 성공하지 않았습니다.',
        description:
          '테스트 기준으로 RDP 세션이 형성되지 않았습니다. 현재 구성에서는 본 시나리오에 대한 원격 접속이 제한된 것으로 볼 수 있습니다.',
      }
    }

    case 5: {
      const hasSystemDir = /SystemDirectory\s*:/.test(out)
      const hasVersion = /Version\s*:/.test(out)
      if (hasSystemDir && hasVersion) {
        return {
          status: 'compromised',
          title: '원격 시스템의 상세 OS 정보가 조회되었습니다.',
          description:
            '공격 테스트에 의해 다음과 같은 결과가 식별되었습니다. 원격 시스템의 OS 버전, 시리얼, 등록 사용자 등의 정보가 수집 가능한 상태입니다.',
          mitigation:
            'WMI를 통한 원격 시스템 정보 조회 권한을 최소한의 관리 주체로만 제한하고, 방화벽에서 관련 포트를 통제하십시오. 필요 시 보안 로그/감사를 활성화하여 정보 수집 시도를 모니터링하십시오.',
        }
      }
      return {
        status: 'safe',
        title: '원격 OS 정보가 조회되지 않았습니다.',
        description:
          '해당 테스트에서 원격 OS 상세 정보가 수집되지 않았습니다. 정보 수집 시도가 정책에 의해 제한된 것으로 보입니다.',
      }
    }

    case 6: {
      const anyOpen = /True\s*$/m.test(out) || /TcpTestSucceeded\s*:\s*True/i.test(out)
      if (anyOpen) {
        return {
          status: 'compromised',
          title: '네트워크 서비스 포트가 외부에서 열려 있습니다.',
          description:
            '포트 스캔 결과 일부 포트가 응답하여, 네트워크 서비스가 노출된 상태입니다. 공격자가 취약한 서비스를 악용할 수 있습니다.',
          mitigation:
            '불필요한 서비스/포트는 비활성화하고, 방화벽·ACL을 통해 접근을 최소화하십시오. 필수 서비스에 대해서는 최신 패치 적용과 취약점 점검이 필요합니다.',
        }
      }
      return {
        status: 'safe',
        title: '포트 스캔 기준으로 노출 서비스가 확인되지 않았습니다.',
        description:
          '해당 테스트에서 응답하는 포트가 발견되지 않았습니다. 현재 설정에서는 기본 포트 범위 내에서 외부 노출이 제한된 것으로 보입니다.',
      }
    }

    case 7:
    case 8: {
      const success = /SUCCESS|설정되었습니다|created successfully/i.test(combined)
      const accessDenied = /Access is denied|액세스가 거부되었습니다/i.test(combined)
      if (success) {
        return {
          status: 'compromised',
          title: '원격 서비스/예약 작업 생성이 허용되었습니다.',
          description:
            '공격 테스트에서 원격 서비스 또는 예약 작업이 성공적으로 생성되어, 지속적인 코드 실행에 악용될 수 있는 상태입니다.',
          mitigation:
            '원격 서비스/스케줄 생성 권한을 최소 권한 계정으로 제한하고, 방화벽과 그룹 정책을 통해 원격 관리 채널을 엄격히 통제하십시오.',
        }
      }
      if (accessDenied) {
        return {
          status: 'safe',
          title: '원격 서비스/예약 작업 생성 시도가 차단되었습니다.',
          description:
            '권한 부족으로 인해 서비스 또는 예약 작업을 생성하지 못했습니다. 현재 정책상 본 경로를 통한 지속성 확보가 어려운 상태입니다.',
        }
      }
      return {
        status: 'safe',
        title: '원격 서비스/예약 작업 생성이 성공하지 않았습니다.',
        description:
          '해당 테스트에서 서비스 또는 예약 작업이 실제로 생성되었다는 정황이 없습니다. 현재 구성에서는 본 시나리오에 대한 공격 성공 가능성이 낮습니다.',
      }
    }

    case 9: {
      const pathNotFound =
        /Copy-Item[\s\S]*PathNotFound/i.test(combined) ||
        /ItemNotFoundException/i.test(combined)
      if (pathNotFound) {
        return {
          status: 'safe',
          title: 'SMB 파일 복제(도구 전파)가 성공적으로 수행되지 않았습니다.',
          description:
            '지정된 파일 경로를 찾지 못해 원격 공유로의 파일 복제가 이루어지지 않았습니다. 본 테스트 기준으로는 Lateral Tool Transfer가 완료되지 않은 상태입니다.',
          mitigation:
            'SMB 공유를 통한 도구 전파를 보다 엄밀히 검증하려면, 테스트용 더미 파일을 사전에 생성한 뒤 해당 파일의 복제 여부를 점검하도록 스크립트를 보완할 수 있습니다.',
        }
      }
      return {
        status: 'safe',
        title: 'SMB 파일 복제가 확인되지 않았습니다.',
        description:
          '해당 테스트에서 원격 공유로의 파일 복제 성공 정황이 없습니다. 현재 구성에서는 본 시나리오에 대한 공격 성공 가능성이 낮습니다.',
      }
    }

    case 10: {
      const networkNotFoundKo =
        /��Ʈ��ũ ��θ� ã�� ���߽��ϴ�/i.test(combined) ||
        /네트워크 경로를 찾을 수 없습니다/i.test(combined)
      const networkNotFoundEn = /network path was not found/i.test(combined)
      if (networkNotFoundKo || networkNotFoundEn) {
        return {
          status: 'safe',
          title: 'Remote Registry 네트워크 경로가 차단되었습니다.',
          description:
            '원격 레지스트리 경로를 찾을 수 없어 쿼리가 실패했습니다. 네트워크 또는 서비스 수준에서 Remote Registry 접근이 제한된 상태로 보입니다.',
          mitigation:
            '현재 Remote Registry 차단 상태를 유지하는 것이 안전합니다. 필요한 경우에만 제한된 관리 채널을 통해 레지스트리 접근을 허용하십시오.',
        }
      }
      return {
        status: 'safe',
        title: 'Remote Registry 조회가 성공적으로 이루어지지 않았습니다.',
        description:
          '해당 테스트에서 원격 레지스트리 키 조회가 완료되지 않았습니다. 정책 또는 네트워크 설정으로 인해 접근이 제한된 상태일 가능성이 높습니다.',
      }
    }

    case 11: {
      const adCmdNotFound =
        /Get-ADComputer[\s\S]*CommandNotFoundException/i.test(combined) ||
        /Get-ADUser[\s\S]*CommandNotFoundException/i.test(combined)
      if (adCmdNotFound) {
        return {
          status: 'safe',
          title: 'AD 기반 Discovery 명령이 수행되지 않았습니다.',
          description:
            'Get-ADComputer / Get-ADUser 명령이 인식되지 않아 AD 객체 조회가 수행되지 않았습니다. 본 호스트에서는 테스트 기준으로 AD 기반 탐색이 어려운 상태입니다.',
          mitigation:
            '운영 목적상 AD 관리 도구가 필요한 경우, 관리 전용 서버에만 설치하고 일반 사용자 단말에서는 불필요한 디렉터리 탐색 도구를 제거하는 것이 바람직합니다.',
        }
      }
      return {
        status: 'safe',
        title: 'AD 기반 Discovery 결과가 확인되지 않았습니다.',
        description:
          '해당 테스트에서 AD 컴퓨터/사용자 목록 조회가 성공했다는 정황이 없습니다. 현재 구성에서는 본 경로를 통한 정보 수집이 제한된 상태입니다.',
      }
    }

    case 12: {
      const depthError =
        /'Depth' �Ű� ����/i.test(combined) ||
        /CannotConvertArgumentNoMessage/i.test(combined)
      if (depthError) {
        return {
          status: 'safe',
          title: 'DNS Zone Transfer 기반 내부 도메인 정보 수집이 수행되지 않았습니다.',
          description:
            'PowerShell 명령 인자 오류로 인해 내부 도메인 전체 정보 조회가 완료되지 않았습니다. 본 테스트 기준으로는 Zone Transfer가 성공하지 않은 상태입니다.',
          mitigation:
            'Zone Transfer 보안 검증을 강화하려면 nslookup/dig 기반의 명시적 AXFR 테스트를 추가하고, DNS 서버 설정에서 허용 대상 네임서버만 전송을 허용하도록 제한하십시오.',
        }
      }
      return {
        status: 'safe',
        title: 'DNS Zone Transfer 공격이 성공하지 않았습니다.',
        description:
          '해당 테스트에서 내부 도메인 전체 레코드가 조회되었다는 정황이 없습니다. 현재 설정에서는 Zone Transfer 시도가 제한된 것으로 보입니다.',
      }
    }

    case 13: {
      const webBlocked =
        /Invoke-WebRequest/i.test(combined) &&
        /WebCmdletWebResponseException/i.test(combined)
      if (webBlocked || /remote name could not be resolved/i.test(combined)) {
        return {
          status: 'safe',
          title: '내부 관리자 콘솔 웹 UI 접근 시도가 차단되었습니다.',
          description:
            'Invoke-WebRequest 요청이 정상적으로 완료되지 않아 관리자 콘솔 페이지에 접근하지 못했습니다. 네트워크 또는 인증 정책으로 인해 직접적인 웹 UI 접근이 제한된 상태입니다.',
          mitigation:
            '관리 콘솔은 전용 관리망 또는 Jump 서버를 통해서만 접근하도록 하고, 인터넷/업무망에서 직접 접근이 불가능하도록 세분화된 네트워크 정책을 유지하십시오.',
        }
      }
      return {
        status: 'safe',
        title: '내부 관리자 콘솔 접근이 성공하지 않았습니다.',
        description:
          '해당 테스트에서 관리자 콘솔 페이지에 정상적으로 도달했다는 정황이 없습니다. 현재 구성에서는 본 경로를 통한 직접 접근이 어렵습니다.',
      }
    }

    case 14: {
      const sysErr86 =
        /�ý��� ���� 86/i.test(combined) ||
        /System error 86 has occurred/i.test(combined)
      const driveNotFound =
        /DriveNotFoundException/i.test(combined) ||
        /드라이브를 찾을 수 없습니다/i.test(combined)
      if (sysErr86 || driveNotFound) {
        return {
          status: 'safe',
          title: '원격 드라이브 매핑이 성공하지 않았습니다.',
          description:
            '인증 오류 또는 드라이브 매핑 실패로 인해 원격 공유 드라이브(Z:)를 사용할 수 없습니다. 본 테스트 기준으로는 지속적인 파일 접근 경로 확보에 실패한 상태입니다.',
          mitigation:
            '공유 리소스에 대해서는 강력한 인증 정책과 접근 제어 목록을 적용하고, 불필요한 공유는 제거하여 lateral movement에 사용될 수 있는 경로를 최소화하십시오.',
        }
      }
      return {
        status: 'safe',
        title: '원격 드라이브 매핑 기반 지속적 파일 접근이 확인되지 않았습니다.',
        description:
          '해당 테스트에서 매핑된 드라이브를 통한 파일 접근이 성공했다는 정황이 없습니다. 현재 구성에서는 본 시나리오에 대한 공격 성공 가능성이 낮습니다.',
      }
    }

    case 18: {
      // quser / query CommandNotFound → 세션 조회 도구 자체 부재 → 공격 실패(방어)
      const quserNotFound =
        /quser[\s\S]*CommandNotFoundException/i.test(combined)
      const queryNotFound =
        /query[\s\S]*CommandNotFoundException/i.test(combined)
      if (quserNotFound || queryNotFound) {
        return {
          status: 'safe',
          title: '원격 로그인 사용자 세션 조회가 수행되지 않았습니다.',
          description:
            'quser / query 명령이 인식되지 않아 원격 사용자 세션 정보를 조회하지 못했습니다. 본 테스트 기준으로는 세션 정보 수집이 실패한 상태입니다.',
          mitigation:
            '운영 목적상 세션 조회가 필요하다면, 관리 전용 서버에만 해당 도구를 허용하고 일반 업무 단말에서는 불필요한 세션 탐색 도구를 제공하지 않는 것이 바람직합니다.',
        }
      }
      // 나중에 실제 quser 결과(Active 세션 목록) 패턴이 나오면 compromised 분기 추가 가능
      return {
        status: 'safe',
        title: '원격 로그인 사용자 세션 조회 결과가 확인되지 않았습니다.',
        description:
          '해당 테스트에서 원격 세션 목록이 정상적으로 조회되었다는 정황이 없습니다. 현재 구성에서는 본 경로를 통한 세션 정보 수집이 제한된 상태입니다.',
      }
    }

    case 19: {
      // tasklist 헤더 + 다수 프로세스 → 원격 프로세스 목록 열람 성공
      const hasHeader = /Image Name\s+PID\s+Session Name\s+Session#\s+Mem Usage/i.test(
        combined,
      )
      if (hasHeader) {
        return {
          status: 'compromised',
          title: '원격 프로세스 목록 열람이 성공했습니다.',
          description:
            '공격 테스트에 의해 대상 시스템의 프로세스 목록이 상세히 조회되었습니다. 이는 공격자가 방어 우회를 위한 프로세스 탐색 및 권한 상승, 백도어 탐지 회피 등에 활용할 수 있는 정보입니다.',
          mitigation:
            'tasklist /s 등 원격 프로세스 조회를 허용할 계정을 최소화하고, 방화벽과 ACL을 통해 관리망 이외의 경로에서는 원격 프로세스 열람이 불가능하도록 제한하십시오. 또한 원격 관리 도구 사용에 대한 로깅과 모니터링을 강화하는 것이 필요합니다.',
        }
      }
      const accessDenied =
        /Access is denied/i.test(combined) ||
        /액세스가 거부되었습니다/i.test(combined)
      if (accessDenied) {
        return {
          status: 'safe',
          title: '원격 프로세스 목록 열람 시도가 차단되었습니다.',
          description:
            '권한 부족 또는 정책에 의해 원격 프로세스 목록을 조회하지 못했습니다. 현재 구성에서는 본 경로를 통한 프로세스 정보 열람이 제한된 상태입니다.',
        }
      }
      return {
        status: 'safe',
        title: '원격 프로세스 목록 열람이 성공적으로 수행되지 않았습니다.',
        description:
          '해당 테스트에서 원격 프로세스 목록이 정상적으로 수집되었다는 명확한 정황이 없습니다. 정책 또는 네트워크 설정에 의해 제한된 상태일 수 있습니다.',
      }
    }

    case 20: {
      // 코드 1191: 다른 사용자가 로그인하여 시스템을 종료할 수 없음 → 원격 shutdown 명령이 호스트까지 도달했다고 간주(공격 성공)
      const code1191 = /1191\)/.test(combined)
      if (code1191) {
        return {
          status: 'compromised',
          title: '원격 시스템 종료 명령이 대상 시스템에 전달되었습니다.',
          description:
            '원격 종료 명령이 대상 시스템까지 도달하여 처리되었으나, 현재 로그인한 다른 사용자로 인해 실제 종료는 수행되지 않았습니다. 본 테스트 기준으로는 원격 전원 제어 명령이 실행 가능한 경로가 존재하는 것으로 판단됩니다.',
          mitigation:
            'shutdown /m 등 원격 전원 제어 명령은 관리망의 제한된 계정(서버 관리자 등)으로만 허용하고, 일반 단말이나 외부망에서는 차단하십시오. 또한 그룹 정책과 방화벽을 통해 원격 전원 제어 트래픽을 엄격히 통제하고, 관련 이벤트 로그를 주기적으로 점검해야 합니다.',
        }
      }
      const accessDenied =
        /Access is denied/i.test(combined) ||
        /액세스가 거부되었습니다/i.test(combined)
      if (accessDenied) {
        return {
          status: 'safe',
          title: '원격 시스템 종료 / 재부팅 시도가 차단되었습니다.',
          description:
            '권한 부족 또는 정책에 의해 원격 종료/재부팅 명령이 실행되지 않았습니다. 현재 구성에서는 본 경로를 통한 전원 제어가 제한된 상태입니다.',
        }
      }
      return {
        status: 'safe',
        title: '원격 시스템 종료 / 재부팅이 수행되지 않았습니다.',
        description:
          '해당 테스트에서 시스템 종료/재부팅이 실제로 이루어졌다는 정황이 없습니다. 정책 또는 네트워크 설정에 의해 제한된 상태로 볼 수 있습니다.',
      }
    }

    default:
      break
  }

  if (!out && !err) {
    return {
      status: 'unknown',
      title: '출력 정보가 없습니다.',
      description:
        '해당 테스트에 대한 출력이 존재하지 않습니다. 네트워크 상태나 실행 환경을 점검할 필요가 있습니다.',
    }
  }

  return {
    status: 'unknown',
    title: '공격 테스트 결과 해석이 필요합니다.',
    description:
      '해당 테스트 결과는 자동 규칙으로 판단하기 어렵습니다. STDOUT/STDERR 내용을 기반으로 수동 분석이 필요합니다.',
  }
}

const ZTAttackTest: React.FC = () => {
  const [targets, setTargets] = useState<SaltTarget[]>([])
  const [selectedTargetId, setSelectedTargetId] = useState<string>('')
  const [loadingTargets, setLoadingTargets] = useState(false)

  const [isRunningBatch, setIsRunningBatch] = useState(false)
  const [selectedTestIds, setSelectedTestIds] = useState<number[]>([])
  const [results, setResults] = useState<AttackResult[]>([])
  const [expandedResults, setExpandedResults] = useState<Record<string, boolean>>({})

  const [error, setError] = useState<string>('')

  const riskSummary = useMemo(() => {
    const high = ATTACK_TESTS.filter(t => t.risk === 'high').length
    const medium = ATTACK_TESTS.filter(t => t.risk === 'medium').length
    const low = ATTACK_TESTS.filter(t => t.risk === 'low').length
    return { high, medium, low, total: ATTACK_TESTS.length }
  }, [])

  useEffect(() => {
    fetchTargets()
    const interval = setInterval(fetchTargets, 30000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchTargets = async () => {
    setLoadingTargets(true)
    setError('')
    try {
      const response = await saltApi.getTargets()
      const data = response.data?.data || response.data || []
      const list: SaltTarget[] = Array.isArray(data) ? data : []
      setTargets(list)

      if (!selectedTargetId && list.length > 0) {
        const online = list.filter(t => t.status === 'online')
        setSelectedTargetId((online[0] || list[0]).id)
      }
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Salt 대상 조회 실패')
      setTargets([])
    } finally {
      setLoadingTargets(false)
    }
  }

  const buildSaltCommand = (test: AttackTestDef, hostIp: string): string => {
    const payloadRaw = test.commands
      .join(' ; ')
      .replace(/10\.10\.10\.12/g, hostIp)
      .replace(/10\.10\.10\.50/g, hostIp)

    const payloadEscaped = payloadRaw.replace(/'/g, "''")

    return `cmd.run '${payloadEscaped}' shell=powershell`
  }

  const runAttackTest = async (test: AttackTestDef): Promise<void> => {
    setError('')

    const target = targets.find(t => t.id === selectedTargetId) || null
    if (!target) {
      setError('실행 가능한 Salt 대상이 없습니다.')
      return
    }

    const hostIp = target.ip || target.id

    try {
      const saltCommand = buildSaltCommand(test, hostIp)
      const response = await deviceApi.executeCommand(saltCommand, [target.id])
      const stdout = response.data?.stdout || ''
      const stderr = response.data?.stderr || ''

      const result: AttackResult = {
        testId: test.id,
        testTitle: test.title,
        risk: test.risk,
        targetName: target.name || target.id,
        targetIp: hostIp,
        stdout,
        stderr,
        timestamp: new Date().toLocaleString('ko-KR'),
      }

      setResults(prev => [...prev, result])
    } catch (e: any) {
      const msg = e.response?.data?.error || e.message || '공격 테스트 실행 실패'
      const isTimeout = /timeout of \d+ms exceeded/i.test(msg)

      const target = targets.find(t => t.id === selectedTargetId) || null
      const hostIp = target?.ip || target?.id || 'Unknown'

      const result: AttackResult = {
        testId: test.id,
        testTitle: test.title,
        risk: test.risk,
        targetName: target?.name || target?.id || 'Unknown',
        targetIp: hostIp,
        stdout: '',
        stderr: msg,
        timestamp: new Date().toLocaleString('ko-KR'),
      }

      setResults(prev => [...prev, result])

      if (!isTimeout) {
        setError(msg)
      } else {
        setError('')
      }
    }
  }

  const toggleTestSelection = (id: number) => {
    setSelectedTestIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    )
  }

  const isAllSelected =
    ATTACK_TESTS.length > 0 && selectedTestIds.length === ATTACK_TESTS.length

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedTestIds([])
    } else {
      setSelectedTestIds(ATTACK_TESTS.map(t => t.id))
    }
  }

  const runSelectedTests = async () => {
    setError('')
    if (selectedTestIds.length === 0) return
    if (!selectedTargetId) {
      setError('대상을 먼저 선택해 주세요.')
      return
    }
    setIsRunningBatch(true)
    try {
      const orderedTests = ATTACK_TESTS.filter(t => selectedTestIds.includes(t.id)).sort(
        (a, b) => a.id - b.id,
      )
      for (const test of orderedTests) {
        await runAttackTest(test)
      }
    } finally {
      setIsRunningBatch(false)
    }
  }

  const clearResults = () => {
    setResults([])
    setExpandedResults({})
  }

  const toggleResultDetails = (key: string) => {
    setExpandedResults(prev => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const getRiskBadge = (risk: RiskLevel) => (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${RISK_COLOR[risk]}`}
    >
      {RISK_LABEL[risk]}
    </span>
  )

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="bg-white rounded-lg shadow-sm p-6 flex items-center">
        <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center mr-4">
          <Target className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">공격 테스트</h1>
          <p className="text-gray-600 mt-1">
            자동 공격 테스트를 통해 제로트러스트 정책이 실제 공격을 방어하는지 확인합니다.
            실제 침해 없이(가용성 저하 없이), 행위 기반 방식으로 20가지 시나리오를 선택하여
            대상에 실행합니다.
          </p>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow-sm p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Shield className="w-8 h-8 text-emerald-500" />
            <div>
              <p className="text-sm text-gray-500">전체 테스트 수</p>
              <p className="text-2xl font-bold text-gray-900">{riskSummary.total} 개</p>
            </div>
          </div>
          <div className="flex flex-col space-y-1 text-sm text-gray-600 text-right">
            <span>🔴 높음: {riskSummary.high}</span>
            <span>🟠 중간: {riskSummary.medium}</span>
            <span>🟢 낮음: {riskSummary.low}</span>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-4 flex flex-col justify-between">
          <div className="flex items-center mb-3">
            <Activity className="w-6 h-6 text-indigo-500 mr-2" />
            <div>
              <p className="text-sm font-semibold text-gray-800">Salt 대상 상태</p>
              <p className="text-xs text-gray-500">
                현재 Accepted Keys 기준으로 공격 테스트 대상을 선택합니다.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              대상 수: <span className="font-semibold">{targets.length}</span> 개
            </p>
            <button
              onClick={fetchTargets}
              className="px-3 py-1.5 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
              disabled={loadingTargets}
            >
              {loadingTargets ? '갱신 중...' : '대상 새로고침'}
            </button>
          </div>
        </div>
      </div>

      {/* 상세 목록 + 실행 */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <ListChecks className="w-5 h-5 text-gray-700 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">공격 테스트 상세</h2>
          </div>
          {/* 대상 선택 + 선택 검사 일괄 실행 */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <span className="text-xs text-gray-500">대상 선택:</span>
              <select
                value={selectedTargetId}
                onChange={e => setSelectedTargetId(e.target.value)}
                className="text-sm border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              >
                {targets.length === 0 && <option value="">대상 없음</option>}
                {targets.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name || t.id} ({t.ip || 'IP 미상'}) {t.status === 'online' ? '🟢' : '🔴'}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={runSelectedTests}
              disabled={
                selectedTestIds.length === 0 ||
                targets.length === 0 ||
                isRunningBatch
              }
              className={`inline-flex items-center px-3 py-1.5 text-xs rounded-md border font-semibold ${
                selectedTestIds.length === 0 || targets.length === 0 || isRunningBatch
                  ? 'border-gray-300 text-gray-400 bg-gray-50'
                  : 'border-emerald-500 text-emerald-600 hover:bg-emerald-50'
              }`}
            >
              <Play className="w-3 h-3 mr-1" />
              {isRunningBatch ? '선택 검사 실행 중...' : '선택 검사 일괄 실행'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-700 flex items-start">
            <AlertTriangle className="w-4 h-4 mt-0.5 mr-2" />
            <span>{error}</span>
          </div>
        )}

        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  선택
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  테스트
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  위험도
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  MITRE
                </th>
              </tr>
              <tr className="bg-gray-50 border-t border-gray-200">
                <th className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th colSpan={4} className="px-4 py-2 text-xs text-gray-400 text-left">
                  전체 선택 / 해제
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {ATTACK_TESTS.sort((a, b) => a.id - b.id).map(test => (
                <tr key={test.id} className="hover:bg-gray-50">
                  <td className="px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={selectedTestIds.includes(test.id)}
                      onChange={() => toggleTestSelection(test.id)}
                    />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">검사 {test.id}</td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">{test.title}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{test.description}</div>
                  </td>
                  <td className="px-4 py-3 text-sm">{getRiskBadge(test.risk)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{test.mitre}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 누적 실행 결과 콘솔 + RESULT 요약 리스트 */}
      {results.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">공격 테스트 결과 요약</h2>
              <p className="text-xs text-gray-500">
                총 {results.length}건의 테스트 결과가 누적되어 있습니다.
              </p>
            </div>
            <button
              onClick={clearResults}
              className="px-3 py-1.5 text-xs rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
            >
              결과 전체 초기화
            </button>
          </div>

          <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
            {results.map((res, idx) => {
              const summary = interpretResult(res.testId, res.stdout, res.stderr)
              const key = `${res.timestamp}-${res.testId}-${idx}`
              const isExpanded = !!expandedResults[key]

              const statusColor =
                summary.status === 'compromised'
                  ? 'text-red-600 bg-red-50 border-red-200'
                  : summary.status === 'safe'
                  ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
                  : 'text-amber-600 bg-amber-50 border-amber-200'

              const StatusIcon =
                summary.status === 'compromised'
                  ? XCircle
                  : summary.status === 'safe'
                  ? CheckCircle
                  : AlertTriangle

              return (
                <div
                  key={key}
                  className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center">
                      <StatusIcon
                        className={`w-5 h-5 mr-2 ${
                          summary.status === 'compromised'
                            ? 'text-red-500'
                            : summary.status === 'safe'
                            ? 'text-emerald-500'
                            : 'text-amber-500'
                        }`}
                      />
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          검사 {res.testId} · {res.testTitle}
                        </p>
                        <p className="text-xs text-gray-500">
                          대상: {res.targetName} ({res.targetIp}) · 실행 시각: {res.timestamp}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => toggleResultDetails(key)}
                        className="px-2 py-1 text-[11px] rounded-md border border-gray-300 text-gray-600 hover:bg-gray-100 flex items-center"
                      >
                        <Terminal className="w-3 h-3 mr-1" />
                        {isExpanded ? '상세 결과 닫기' : '상세 결과 보기'}
                      </button>
                      {getRiskBadge(res.risk)}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* RESULT 요약 패널 */}
                    <div className={`border rounded-md p-4 ${statusColor}`}>
                      <h3 className="text-sm font-semibold mb-2">공격 결과</h3>
                      <p className="text-sm font-bold mb-1">{summary.title}</p>
                      <p className="text-xs mb-3 text-gray-700">{summary.description}</p>
                      {summary.mitigation && (
                        <>
                          <h4 className="text-xs font-semibold mb-1">대응 방안</h4>
                          <p className="text-xs text-gray-700 whitespace-pre-line">
                            {summary.mitigation}
                          </p>
                        </>
                      )}
                    </div>

                    {/* STDOUT 원본 (토글) */}
                    {isExpanded && (
                      <div className="border border-gray-200 rounded-md">
                        <div className="px-3 py-2 border-b border-gray-200 flex items-center bg-gray-50">
                          <Terminal className="w-4 h-4 text-gray-600 mr-2" />
                          <span className="text-xs font-semibold text-gray-700">
                            STDOUT (원본 출력)
                          </span>
                        </div>
                        <pre className="p-3 text-xs bg-black text-gray-100 rounded-b-md overflow-auto max-h-64">
                          {res.stdout || '(출력 없음)'}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default ZTAttackTest
