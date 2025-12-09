import React, { useState, useEffect } from 'react'
import {RefreshCw, Play, ChevronDown, ChevronUp, Shield, HardDrive, Download, X, Eye, XCircle} from 'lucide-react'
import { saltApi, deviceApi } from '../utils/api'

interface DeviceInfo {
  id?: string
  host?: string
  osfullname?: string
  osrelease?: string
  cpu_model?: string
  mem_total?: number
  windowsdomain?: string
  fqdn_ip4?: string[]
  department?: string
}

interface SecurityStatus {
  defender?: {
    AntivirusEnabled?: boolean
    RealTimeProtectionEnabled?: boolean
    BehaviorMonitorEnabled?: boolean
  }
  bitlocker?: {
    MountPoint?: string
    VolumeStatus?: string
    ProtectionStatus?: string
  }
  updates?: {
    installed?: Array<{
      HotFixID?: string
      Description?: string
      InstalledOn?: string
      InstalledBy?: string
    }>
    pending?: Array<{
      Title?: string
      Size?: number
      Priority?: number
    }>
    pendingCount?: number
    lastUpdateDate?: string
  }
  connection?: boolean
  lastChecked?: string
}

interface Target {
  id: string
  status: 'online' | 'offline'
  ip?: string
}

const DeviceControl: React.FC = () => {
  const [targets, setTargets] = useState<Target[]>([])
  const [devices, setDevices] = useState<Record<string, DeviceInfo>>({})
  const [selectedDevice, setSelectedDevice] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshingTargets, setRefreshingTargets] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('전체')
  const [currentPage, setCurrentPage] = useState(1)
  const [securityStatuses, setSecurityStatuses] = useState<Record<string, SecurityStatus>>({})
  const [showPolicyStatus, setShowPolicyStatus] = useState(false)
  const [selectedDepartmentTarget, setSelectedDepartmentTarget] = useState<string>('')
  const [selectedDepartmentType, setSelectedDepartmentType] = useState<'individual' | 'group'>('individual')
  const [lastUpdate, setLastUpdate] = useState<string>('')
  const [policyStatuses, setPolicyStatuses] = useState<Record<string, {
    usb: string
    screensaver: string
    firewall: string
    firewallRules: {
      http: string
      https: string
      dns: string
    }
    lastChecked: string
  }>>({})
  const [refreshingGpoPolicy, setRefreshingGpoPolicy] = useState(false)
  const [refreshingFirewallRules, setRefreshingFirewallRules] = useState(false)
  const [commandExecutionType, setCommandExecutionType] = useState<'individual' | 'group'>('individual')
  const [selectedGroupDepartment, setSelectedGroupDepartment] = useState<string>('')
  const [loadingSecurityStatus, setLoadingSecurityStatus] = useState<Record<string, boolean>>({})
  const [showToast, setShowToast] = useState(false)
  const [showResultModal, setShowResultModal] = useState(false)
  const [selectedCommandResult, setSelectedCommandResult] = useState<{commandKey: string, result: any} | null>(null)
  const [commandResults, setCommandResults] = useState<Record<string, any>>({})
  const [showCommandDetails, setShowCommandDetails] = useState(false)
  const [showScreensaverModal, setShowScreensaverModal] = useState(false)
  const [screensaverMinutes, setScreensaverMinutes] = useState(1)
  const [pendingScreensaverCommand, setPendingScreensaverCommand] = useState<any>(null)
  
  // 부서 목록 관리 
  const [departments, setDepartments] = useState<string[]>(() => {
    const saved = localStorage.getItem('deviceDepartments')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        const filtered = parsed.filter((d: string) => d !== '전체')
        if (JSON.stringify(filtered) !== JSON.stringify(parsed)) {
          localStorage.setItem('deviceDepartments', JSON.stringify(filtered))
        }
        return filtered
      } catch {
        return []
      }
    }
    return []
  })
  const [newDepartment, setNewDepartment] = useState('')
  
  const itemsPerPage = 10

  const getCustomDepartments = () => {
    return departments
  }

  // 부서 추가 함수
  const handleAddDepartment = () => {
    if (!newDepartment.trim()) return
    
    const trimmedDept = newDepartment.trim()
    
    // 이미 존재하는 부서인지 확인
    if (departments.includes(trimmedDept)) {
      alert('이미 존재하는 부서입니다.')
      return
    }
    
    // 부서 추가 
    const updatedDepartments = [...departments]
    updatedDepartments.push(trimmedDept)
    
    setDepartments(updatedDepartments)
    localStorage.setItem('deviceDepartments', JSON.stringify(updatedDepartments))
    
    // 부서 추가 후 자동으로 "부서 전체" 모드로 전환하고 새 부서 선택
    setSelectedDepartmentType('group')
    setSelectedGroupDepartment(trimmedDept)
    
    setNewDepartment('')
  }

  // 부서 삭제 함수
  const handleDeleteDepartment = (dept: string) => {
    // '전체'는 삭제 불가
    if (dept === '전체') {
      alert('전체는 삭제할 수 없습니다.')
      return
    }
    
    // 현재 선택된 부서인 경우 선택 해제
    if (selectedGroupDepartment === dept) {
      setSelectedGroupDepartment('')
    }
    
    // 부서 목록에서 제거 
    const updatedDepartments = departments.filter(d => d !== dept)
    setDepartments(updatedDepartments)
    localStorage.setItem('deviceDepartments', JSON.stringify(updatedDepartments))
  }

  const fetchTargets = async (includeDeviceInfo: boolean = true) => {
    setRefreshingTargets(true)
    try {
      console.log('SaltStack 대상 목록 조회 시작...')
      const response = await saltApi.getTargets()
      console.log('대상 목록 응답:', response)
      
      const targetsData = response.data?.data || response.data || []
      const targetsList = Array.isArray(targetsData) ? targetsData : []
      setTargets(targetsList)
      setLastUpdate(new Date().toLocaleString('ko-KR'))
      console.log('대상 목록 업데이트 완료:', targetsList)
      
      if (includeDeviceInfo && targetsList.length > 0) {
        await loadAllDeviceInfo(targetsList)
      }
    } catch (error: any) {
      console.error('대상 목록 조회 실패:', error)
    } finally {
      setRefreshingTargets(false)
    }
  }

  const loadAllDeviceInfo = async (targetsList?: Target[]) => {
    setLoading(true)
    try {
      const onlineTargets = targetsList || targets.filter(t => t.status === 'online')
      
      if (onlineTargets.length === 0) {
        console.log('온라인 타겟이 없습니다')
        return
      }

      const newDeviceData: Record<string, DeviceInfo> = {}
      
      // 병렬 처리로 모든 디바이스 정보 수집 (성능 개선)
      const deviceInfoPromises = onlineTargets.map(async (target) => {
        try {
          const response = await deviceApi.getDeviceInfo(target.id)
          if (response.data?.success && response.data.data) {
            const deviceInfo: DeviceInfo = response.data.data
            
            // 부서 정보도 병렬로 조회
            try {
              const deptResponse = await deviceApi.getDepartment(target.id)
              if (deptResponse.data?.success && deptResponse.data.department) {
                deviceInfo.department = deptResponse.data.department
              }
            } catch (e) {
              // 부서 정보 조회 실패는 무시
            }
            
            return { targetId: target.id, deviceInfo }
          }
          return null
        } catch (error) {
          console.error(`디바이스 ${target.id} 정보 수집 실패:`, error)
          return null
        }
      })
      
      // 모든 Promise 완료 대기
      const results = await Promise.all(deviceInfoPromises)
      
      // 결과를 newDeviceData에 병합
      results.forEach(result => {
        if (result && result.deviceInfo) {
          newDeviceData[result.targetId] = result.deviceInfo
        }
      })
      
      setDevices(prevDevices => {
        const updatedDevices = { ...prevDevices, ...newDeviceData }
        return updatedDevices
      })
      
      const firstTarget = Object.keys(newDeviceData)[0]
      if (firstTarget && !selectedDevice) {
        setSelectedDevice(firstTarget)
      }
    } catch (error) {
      console.error('디바이스 정보 수집 실패:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTargets(true)
    
    const interval = setInterval(async () => {
      if (refreshingTargets || loading) {
        return
      }
      
      try {
        setRefreshingTargets(true)
        const response = await saltApi.getTargets()
        const targetsData = response.data?.data || response.data || []
        const targetsList = Array.isArray(targetsData) ? targetsData : []
        
        setTargets(targetsList)
        setLastUpdate(new Date().toLocaleString('ko-KR'))
      } catch (error: any) {
        console.error('자동 새로고침 실패:', error)
      } finally {
        setRefreshingTargets(false)
      }
    }, 180000)
    
    return () => clearInterval(interval)
  }, [])

  const loadDeviceSecurityStatus = async (target: string) => {
    if (!target) return
    
    if (loadingSecurityStatus[target]) {
      console.log(`이미 ${target}의 보안 상태를 조회 중입니다. 중복 실행을 방지합니다.`)
      return
    }
    
    setLoadingSecurityStatus(prev => ({ ...prev, [target]: true }))
    
    try {
      const defenderCommand = `cmd.run "Get-MpComputerStatus | Select-Object AntivirusEnabled,RealTimeProtectionEnabled,BehaviorMonitorEnabled | ConvertTo-Json" shell=powershell`
      const bitlockerCommand = `cmd.run "Get-BitLockerVolume | Select-Object MountPoint,VolumeStatus,ProtectionStatus | ConvertTo-Json" shell=powershell`
      const installedUpdatesCommand = `cmd.run "Get-HotFix | Select-Object -First 20 HotFixID,Description,InstalledOn,InstalledBy | ConvertTo-Json" shell=powershell`
      
      const [defenderResponse, bitlockerResponse, updatesResponse] = await Promise.all([
        deviceApi.executeCommand(defenderCommand, [target]).catch(e => {
          console.error('Defender 상태 조회 실패:', e)
          return { data: { stdout: '', stderr: '' } }
        }),
        deviceApi.executeCommand(bitlockerCommand, [target]).catch(e => {
          console.error('BitLocker 상태 조회 실패:', e)
          return { data: { stdout: '', stderr: '' } }
        }),
        deviceApi.executeCommand(installedUpdatesCommand, [target]).catch(e => {
          console.error('Windows Update 상태 조회 실패:', e)
          return { data: { stdout: '', stderr: '' } }
        })
      ])
      
      // Defender 데이터 파싱
      let defenderData = null
      if (defenderResponse?.data?.stdout) {
        const defenderOutput = defenderResponse.data.stdout.trim()
        if (defenderOutput && 
            !defenderOutput.includes('Minion did not return') && 
            !defenderOutput.includes('No response') &&
            !defenderOutput.includes('ERROR')) {
          const cleanedOutput = defenderOutput.replace(/^[\w.]+:\s*\n\s*/, '').trim()
          const jsonMatch = cleanedOutput.match(/\{[\s\S]*\}/)
          if (jsonMatch && jsonMatch[0].length > 10) {
            try {
              const parsed = JSON.parse(jsonMatch[0])
              if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
                defenderData = parsed
              }
            } catch (parseError) {
              console.error('Defender JSON 파싱 실패:', parseError)
            }
          }
        }
      }
      
      // BitLocker 데이터 파싱
      let bitlockerData = null
      let bitlockerCompleted = false
      if (bitlockerResponse?.data?.stdout) {
        const bitlockerOutput = bitlockerResponse.data.stdout.trim()
        bitlockerCompleted = !bitlockerOutput.includes('Minion did not return') && 
                             !bitlockerOutput.includes('No response')
        
        if (bitlockerOutput && bitlockerCompleted && !bitlockerOutput.includes('ERROR')) {
          const cleanedOutput = bitlockerOutput.replace(/^[\w.]+:\s*\n\s*/, '').trim()
          const jsonMatch = cleanedOutput.match(/\[[\s\S]*\]|\{[\s\S]*\}/)
          if (jsonMatch) {
            try {
              const parsed = JSON.parse(jsonMatch[0])
              if (parsed) {
                if (Array.isArray(parsed)) {
                  bitlockerData = parsed.length > 0 ? parsed[0] : { MountPoint: 'N/A', VolumeStatus: 'N/A', ProtectionStatus: 'Off' }
                } else if (typeof parsed === 'object' && Object.keys(parsed).length > 0) {
                  bitlockerData = parsed
                } else {
                  bitlockerData = { MountPoint: 'N/A', VolumeStatus: 'N/A', ProtectionStatus: 'Off' }
                }
              } else {
                bitlockerData = { MountPoint: 'N/A', VolumeStatus: 'N/A', ProtectionStatus: 'Off' }
              }
            } catch (parseError) {
              console.error('BitLocker JSON 파싱 실패:', parseError)
            }
          } else if (bitlockerCompleted) {
            bitlockerData = { MountPoint: 'N/A', VolumeStatus: 'N/A', ProtectionStatus: 'Off' }
          }
        } else if (bitlockerCompleted) {
          bitlockerData = { MountPoint: 'N/A', VolumeStatus: 'N/A', ProtectionStatus: 'Off' }
        }
      }
      
      // Windows Update 데이터 파싱
      let updatesData = null
      let updatesCompleted = false
      if (updatesResponse?.data?.stdout) {
        const updatesOutput = updatesResponse.data.stdout.trim()
        updatesCompleted = !updatesOutput.includes('Minion did not return') && 
                           !updatesOutput.includes('No response')
        
        if (updatesOutput && updatesCompleted && !updatesOutput.includes('ERROR')) {
          const cleanedOutput = updatesOutput.replace(/^[\w.]+:\s*\n\s*/, '').trim()
          const jsonMatch = cleanedOutput.match(/\[[\s\S]*\]|\{[\s\S]*\}/)
          if (jsonMatch && jsonMatch[0].length > 10) {
            try {
              const parsed = JSON.parse(jsonMatch[0])
              if (parsed && (Array.isArray(parsed) ? parsed.length > 0 : Object.keys(parsed).length > 0)) {
                const updatesList = Array.isArray(parsed) ? parsed : [parsed]
                const validUpdates = updatesList.filter(u => u && u.HotFixID).map(update => {
                let installedOnStr = null
                if (update.InstalledOn) {
                  if (typeof update.InstalledOn === 'object') {
                    if (update.InstalledOn.value) {
                      const dateMatch = update.InstalledOn.value.match(/\/Date\((\d+)\)\//)
                      if (dateMatch) {
                        const timestamp = parseInt(dateMatch[1], 10)
                        const date = new Date(timestamp)
                        installedOnStr = date.toLocaleString('ko-KR', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        })
                      } else {
                        installedOnStr = update.InstalledOn.value
                      }
                    } else if (update.InstalledOn.DateTime) {
                      const dateTimeStr = update.InstalledOn.DateTime
                      if (!dateTimeStr.includes('???')) {
                        installedOnStr = dateTimeStr
                      }
                    }
                  } else {
                    installedOnStr = update.InstalledOn
                  }
                }
                
                return {
                  HotFixID: update.HotFixID,
                  Description: update.Description,
                  InstalledOn: installedOnStr,
                  InstalledBy: update.InstalledBy
                }
              })
              
                const lastUpdate = validUpdates.length > 0 ? validUpdates[0].InstalledOn : null
                
                updatesData = {
                  installed: validUpdates,
                  pendingCount: 0,
                  lastUpdateDate: lastUpdate
                }
              } else if (updatesCompleted) {
                updatesData = {
                  installed: [],
                  pendingCount: 0,
                  lastUpdateDate: null
                }
              }
            } catch (parseError) {
              console.error('Windows Update JSON 파싱 실패:', parseError)
              if (updatesCompleted) {
                updatesData = {
                  installed: [],
                  pendingCount: 0,
                  lastUpdateDate: null
                }
              }
            }
          } else if (updatesCompleted) {
            updatesData = {
              installed: [],
              pendingCount: 0,
              lastUpdateDate: null
            }
          }
        } else if (updatesCompleted) {
          updatesData = {
            installed: [],
            pendingCount: 0,
            lastUpdateDate: null
          }
        }
      }
      
      const connectionStatus = true
      
      setSecurityStatuses(prev => {
        const prevStatus = prev[target] || {}
        return {
          ...prev,
          [target]: {
            defender: defenderData || prevStatus.defender,
            bitlocker: bitlockerCompleted ? (bitlockerData || prevStatus.bitlocker) : prevStatus.bitlocker,
            updates: updatesCompleted ? (updatesData || prevStatus.updates) : prevStatus.updates,
            connection: connectionStatus,
            lastChecked: new Date().toLocaleString('ko-KR')
          }
        }
      })
    } catch (error) {
      console.error('보안 상태 조회 실패:', error)
    } finally {
      setLoadingSecurityStatus(prev => {
        const updated = { ...prev }
        delete updated[target]
        return updated
      })
    }
  }

  useEffect(() => {
    if (!selectedDevice) return
    
    // 디바이스 선택 시 즉시 보안 상태 조회 (성능 개선: 3초 → 0.3초)
    const timeoutId = setTimeout(() => {
      loadDeviceSecurityStatus(selectedDevice)
    }, 300) // 3초 → 0.3초로 단축 (사용자 입력 안정화를 위한 최소 대기)
    
    return () => clearTimeout(timeoutId)
  }, [selectedDevice])

  const filteredDevices = Object.entries(devices).filter(([target, info]) => {
    const matchesSearch = searchTerm === '' || 
      target.includes(searchTerm) || 
      info.host?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesDepartment = departmentFilter === '전체' || 
      (info.department || '미설정') === departmentFilter
    
    return matchesSearch && matchesDepartment
  })

  const totalPages = Math.ceil(filteredDevices.length / itemsPerPage)
  const paginatedDevices = filteredDevices.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  // 부서 설정
  const handleSetDepartment = async () => {
    const target = selectedDepartmentTarget || selectedDevice
    if (!target || selectedDepartmentType === 'group') return
    
    try {
      const department = departmentFilter === '전체' ? 'HR' : departmentFilter
      await deviceApi.setDepartment(target, department)
      
      setDevices(prev => ({
        ...prev,
        [target]: {
          ...prev[target],
          department
        }
      }))
      
      alert('부서가 설정되었습니다.')
    } catch (error) {
      console.error('부서 설정 실패:', error)
      alert('부서 설정에 실패했습니다.')
    }
  }

  const handleAddSecuritySchedule = async (scheduleType: string) => {
    try {
      await deviceApi.addSecuritySchedule(scheduleType)
      alert(`${scheduleType} 모니터링 스케줄이 등록되었습니다.`)
    } catch (error) {
      console.error('스케줄 등록 실패:', error)
      alert('스케줄 등록에 실패했습니다.')
    }
  }

  const parsePolicyStatus = (stdout: string): string => {
    if (!stdout) return 'Unknown'
    
    let cleanedOutput = stdout
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.match(/^[\d.]+:\s*$/))
      .join(' ')
      .trim()
    
    cleanedOutput = cleanedOutput.replace(/^[\d.]+:\s*/, '').trim()
    
    const lowerOutput = cleanedOutput.toLowerCase()
    if (lowerOutput.includes('enabled')) return 'Enabled'
    if (lowerOutput.includes('disabled')) return 'Disabled'
    if (lowerOutput.includes('not configured')) return 'Not Configured'
    if (lowerOutput.includes('none')) return 'Not Configured'
    
    return 'Unknown'
  }

  const loadGpoPolicyStatus = async (target: string) => {
    if (!target) return
    
    setRefreshingGpoPolicy(true)
    
    let usbStatus = 'Unknown'
    let screensaverStatus = 'Unknown'
    let firewallStatus = 'Unknown'
    
    const usbPolicyCommand = 'lgpo.get_policy "Removable Disks: Deny write access" machine'
    const screensaverPolicyCommand = 'lgpo.get_policy "Enable screen saver" user'
    const firewallPolicyCommand = 'lgpo.get_policy "Network\\Network Connections\\Windows Defender Firewall\\Domain Profile\\Windows Defender Firewall: Protect all network connections" machine'
    
    try {
      const [usbResponse, screensaverResponse, firewallResponse] = await Promise.all([
        deviceApi.executeCommand(usbPolicyCommand, [target]).catch(e => {
          console.error('USB 정책 상태 조회 실패:', e)
          return { data: { stdout: '', stderr: '' } }
        }),
        deviceApi.executeCommand(screensaverPolicyCommand, [target]).catch(e => {
          console.error('화면보호기 정책 상태 조회 실패:', e)
          return { data: { stdout: '', stderr: '' } }
        }),
        deviceApi.executeCommand(firewallPolicyCommand, [target]).catch(e => {
          console.error('방화벽 정책 상태 조회 실패:', e)
          return { data: { stdout: '', stderr: '' } }
        })
      ])
      
      const usbStdout = usbResponse.data?.stdout || ''
      if (!usbStdout || 
          usbStdout.includes('Minion did not return') || 
          usbStdout.includes('No response') ||
          usbStdout.includes('ERROR')) {
        if (usbStdout && !usbStdout.includes('ERROR')) {
          console.error('USB 정책 상태 조회: Minion 응답 없음')
        }
        usbStatus = 'Unknown'
      } else {
        const parsed = parsePolicyStatus(usbStdout)
        if (parsed !== 'Unknown') {
          usbStatus = parsed
        }
      }
      
      const screensaverStdout = screensaverResponse.data?.stdout || ''
      if (!screensaverStdout || 
          screensaverStdout.includes('Minion did not return') || 
          screensaverStdout.includes('No response') ||
          screensaverStdout.includes('ERROR')) {
        if (screensaverStdout && !screensaverStdout.includes('ERROR')) {
          console.error('화면보호기 정책 상태 조회: Minion 응답 없음')
        }
        screensaverStatus = 'Unknown'
      } else {
        const parsed = parsePolicyStatus(screensaverStdout)
        if (parsed !== 'Unknown') {
          screensaverStatus = parsed
        }
      }
      
      const firewallStdout = firewallResponse.data?.stdout || ''
      if (!firewallStdout || 
          firewallStdout.includes('Minion did not return') || 
          firewallStdout.includes('No response') ||
          firewallStdout.includes('ERROR')) {
        if (firewallStdout && !firewallStdout.includes('ERROR')) {
          console.error('방화벽 정책 상태 조회: Minion 응답 없음')
        }
        firewallStatus = 'Unknown'
      } else {
        const parsed = parsePolicyStatus(firewallStdout)
        if (parsed !== 'Unknown') {
          firewallStatus = parsed
        }
      }
    } catch (error) {
      console.error('GPO 정책 상태 조회 실패:', error)
    }
    
    const hasValidData = usbStatus !== 'Unknown' || screensaverStatus !== 'Unknown' || firewallStatus !== 'Unknown'
    
    if (hasValidData) {
      setPolicyStatuses(prev => ({
        ...prev,
        [target]: {
          ...prev[target],
          usb: usbStatus,
          screensaver: screensaverStatus,
          firewall: firewallStatus,
          lastChecked: new Date().toLocaleString('ko-KR')
        }
      }))
    }
    
    setRefreshingGpoPolicy(false)
  }

  const loadFirewallRuleStatus = async (target: string) => {
    if (!target) return
    
    setRefreshingFirewallRules(true)
    
    const checkFirewallRule = async (ruleName: string): Promise<string> => {
      try {
        const checkCommand = `cmd.run "netsh advfirewall firewall show rule name=\\"${ruleName}\\"" shell=cmd`
        const response = await deviceApi.executeCommand(checkCommand, [target])
        const rawOutput = response.data?.stdout || ''
        const stdout = rawOutput.replace(/^[\w.]+:\s*\n\s*/, '').trim()
        const stderr = response.data?.stderr || ''
        const fullOutput = (stdout + ' ' + stderr).toLowerCase()
        
        if (stdout.includes('Minion did not return') || stdout.includes('No response')) {
          console.error(`방화벽 규칙 확인 실패 (${ruleName}): Minion 응답 없음`)
          return 'Error'
        }
        
        if (stdout.includes('지정된 조건과 일치하는 규칙이 없습니다') || 
            stdout.includes('지정된 필터와 일치하는 규칙을 찾을 수 없습니다') || 
            stdout.includes('No rules match') || 
            stdout.includes('cannot find') ||
            fullOutput.includes('지정된 조건과 일치하는 규칙이 없습니다') ||
            fullOutput.includes('지정된 필터와 일치하는 규칙을 찾을 수 없습니다')) {
          return 'Not Configured'
        }
        
        if (stdout.includes('규칙 이름') || stdout.includes('Rule Name') || stdout.includes('Enabled') || stdout.includes('Disabled')) {
          return 'Enabled'
        }
        
        return 'Unknown'
      } catch (error: any) {
        const errorStdout = error?.response?.data?.stdout || error?.stdout || ''
        const errorStderr = error?.response?.data?.stderr || error?.stderr || ''
        const errorOutput = (errorStdout + ' ' + errorStderr).toLowerCase()
        
        if (errorStdout.includes('지정된 조건과 일치하는 규칙이 없습니다') || 
            errorStdout.includes('지정된 필터와 일치하는 규칙을 찾을 수 없습니다') ||
            errorOutput.includes('지정된 조건과 일치하는 규칙이 없습니다') ||
            errorOutput.includes('지정된 필터와 일치하는 규칙을 찾을 수 없습니다')) {
          return 'Not Configured'
        }
        
        console.error(`방화벽 규칙 확인 실패 (${ruleName}):`, error)
        return 'Error'
      }
    }
    
    try {
      const [httpRule, httpsRule, dnsRule] = await Promise.all([
        checkFirewallRule('Block HTTP Outbound'),
        checkFirewallRule('Block HTTPS Outbound'),
        checkFirewallRule('Block Google DNS')
      ])
      
      const hasValidData = httpRule !== 'Unknown' || httpsRule !== 'Unknown' || dnsRule !== 'Unknown'
      
      if (hasValidData) {
        setPolicyStatuses(prev => ({
          ...prev,
          [target]: {
            ...prev[target],
            firewallRules: {
              http: httpRule,
              https: httpsRule,
              dns: dnsRule
            },
            lastChecked: new Date().toLocaleString('ko-KR')
          }
        }))
      }
    } catch (error) {
      console.error('방화벽 규칙 상태 조회 실패:', error)
    }
    
    setRefreshingFirewallRules(false)
  }

  const handleRunAllTests = async () => {
    setRefreshing(true)
    try {
      const devicesToCheck = filteredDevices.map(([target]) => target)
      
      const testPromises = devicesToCheck.map(async (target) => {
        try {
          await loadDeviceSecurityStatus(target)
          return { target, success: true, skipped: false }
        } catch (error) {
          console.error(`디바이스 ${target} 보안 검사 실패:`, error)
          return { target, success: false, skipped: false, error }
        }
      })
      
      const results = await Promise.all(testPromises)
      const successCount = results.filter(r => r.success).length
      const failedCount = results.filter(r => !r.success && !r.skipped).length
      
      if (failedCount > 0) {
        alert(`${successCount}개 디바이스 검사 완료, ${failedCount}개 실패. 콘솔을 확인해주세요.`)
      } else {
        alert(`모든 디바이스 보안 검사가 완료되었습니다. (${successCount}개)`)
      }
    } catch (error) {
      console.error('전체 테스트 실패:', error)
      alert('일부 디바이스 검사 중 오류가 발생했습니다. 콘솔을 확인해주세요.')
    } finally {
      setRefreshing(false)
    }
  }

  const [commandTarget, setCommandTarget] = useState<string>('')

  const securityCommands = [
    {
      name: 'Defender 상태 확인',
      command: 'Get-MpComputerStatus | Select-Object AntivirusEnabled,RealTimeProtectionEnabled,BehaviorMonitorEnabled | ConvertTo-Json',
      description: 'Windows Defender 상태 확인',
      target: 'individual',
      category: 'monitoring'
    },
    {
      name: 'BitLocker 상태 확인',
      command: 'Get-BitLockerVolume | Select-Object MountPoint,VolumeStatus,ProtectionStatus | ConvertTo-Json',
      description: 'BitLocker 암호화 상태 확인',
      target: 'individual',
      category: 'monitoring'
    },
    {
      name: 'Windows Update 확인',
      command: 'Get-HotFix | Select-Object -Last 10 HotFixID,Description,InstalledOn | ConvertTo-Json',
      description: '최근 Windows 업데이트 확인',
      target: 'individual',
      category: 'monitoring'
    },
    {
      name: '보안 컴플라이언스 종합',
      command: '$status = @{}; $status["timestamp"] = Get-Date -Format "yyyy-MM-dd HH:mm:ss"; $status["hostname"] = $env:COMPUTERNAME; $defender = Get-MpComputerStatus; $status["av_enabled"] = $defender.AntivirusEnabled; $status["realtime_protection"] = $defender.RealTimeProtectionEnabled; $bitlocker = Get-BitLockerVolume -MountPoint C: -ErrorAction SilentlyContinue; if ($bitlocker) { $status["encryption_enabled"] = ($bitlocker.ProtectionStatus -eq "On") } else { $status["encryption_enabled"] = $false }; $status | ConvertTo-Json',
      description: '전체 보안 상태 종합 확인',
      target: 'both',
      category: 'monitoring'
    },
    {
      name: 'USB 쓰기 차단',
      command: 'lgpo.set computer_policy="{\'Removable Disks: Deny write access\': \'Enabled\'}"',
      description: 'USB 저장장치 쓰기 차단 정책 적용',
      target: 'individual',
      category: 'usb'
    },
    {
      name: 'USB 정책 상태 확인',
      command: 'lgpo.get_policy "Removable Disks: Deny write access" machine',
      description: 'USB 쓰기 차단 정책 상태 확인',
      target: 'individual',
      category: 'usb'
    },
    {
      name: 'USB 쓰기 차단 해제',
      command: 'lgpo.set computer_policy="{\'Removable Disks: Deny write access\': \'Not Configured\'}"',
      description: 'USB 쓰기 차단 정책 해제',
      target: 'individual',
      category: 'usb'
    },
    {
      name: '화면보호기 활성화',
      command: 'lgpo.set user_policy="{\'Enable screen saver\': \'Enabled\', \'Screen saver timeout\': {\'ScreenSaverTimeOutFreqSpin\': \'60\'}, \'Password protect the screen saver\': \'Enabled\'}"',
      description: '화면보호기 활성화 및 타임아웃 설정 (암호보호 포함)',
      target: 'individual',
      category: 'screensaver'
    },
    {
      name: '화면보호기 정책 확인',
      command: 'lgpo.get_policy "Enable screen saver" user',
      description: '화면보호기 활성화 상태 확인',
      target: 'individual',
      category: 'screensaver'
    },
    {
      name: '화면보호기 비활성화',
      command: 'lgpo.set user_policy="{\'Enable screen saver\': \'Not Configured\', \'Screen saver timeout\': \'Not Configured\', \'Password protect the screen saver\': \'Not Configured\'}"',
      description: '화면보호기 정책 비활성화',
      target: 'individual',
      category: 'screensaver'
    },
    {
      name: '방화벽 전체 활성화',
      command: 'lgpo.set computer_policy="{\'Network\\Network Connections\\Windows Defender Firewall\\Domain Profile\\Windows Defender Firewall: Protect all network connections\': \'Enabled\', \'Network\\Network Connections\\Windows Defender Firewall\\Standard Profile\\Windows Defender Firewall: Protect all network connections\': \'Enabled\', \'Network\\Network Connections\\Windows Defender Firewall\\Domain Profile\\Windows Defender Firewall: Do not allow exceptions\': \'Enabled\'}"',
      description: '방화벽 전체 활성화 및 예외 차단',
      target: 'individual',
      category: 'firewall-policy'
    },
    {
      name: '방화벽 정책 삭제',
      command: 'lgpo.set computer_policy="{\'Network\\Network Connections\\Windows Defender Firewall\\Domain Profile\\Windows Defender Firewall: Protect all network connections\': \'Not Configured\', \'Network\\Network Connections\\Windows Defender Firewall\\Domain Profile\\Windows Defender Firewall: Do not allow exceptions\': \'Not Configured\', \'Network\\Network Connections\\Windows Defender Firewall\\Standard Profile\\Windows Defender Firewall: Protect all network connections\': \'Not Configured\', \'Network\\Network Connections\\Windows Defender Firewall\\Standard Profile\\Windows Defender Firewall: Do not allow exceptions\': \'Not Configured\'}"',
      description: '방화벽 정책 초기화',
      target: 'individual',
      category: 'firewall-policy'
    },
    {
      name: 'HTTP 포트 차단',
      command: 'netsh advfirewall firewall add rule name="Block HTTP Outbound" dir=out action=block protocol=TCP localport=80',
      description: 'HTTP(80) 아웃바운드 포트 차단',
      target: 'individual',
      category: 'firewall-rule'
    },
    {
      name: 'HTTPS 포트 차단',
      command: 'netsh advfirewall firewall add rule name="Block HTTPS Outbound" dir=out action=block protocol=TCP localport=443',
      description: 'HTTPS(443) 아웃바운드 포트 차단',
      target: 'individual',
      category: 'firewall-rule'
    },
    {
      name: 'Google DNS 차단',
      command: 'netsh advfirewall firewall add rule name="Block Google DNS" dir=out action=block protocol=any remoteip=8.8.8.8',
      description: 'Google DNS(8.8.8.8) 아웃바운드 차단',
      target: 'individual',
      category: 'firewall-rule'
    },
    {
      name: '방화벽 규칙 확인',
      command: 'netsh advfirewall firewall show rule name=all',
      description: '모든 방화벽 규칙 목록 확인',
      target: 'individual',
      category: 'firewall-rule'
    },
    {
      name: 'HTTP 차단 규칙 삭제',
      command: 'netsh advfirewall firewall delete rule name="Block HTTP Outbound"',
      description: 'HTTP 포트 차단 규칙 삭제',
      target: 'individual',
      category: 'firewall-rule'
    },
    {
      name: 'HTTPS 차단 규칙 삭제',
      command: 'netsh advfirewall firewall delete rule name="Block HTTPS Outbound"',
      description: 'HTTPS 포트 차단 규칙 삭제',
      target: 'individual',
      category: 'firewall-rule'
    },
    {
      name: 'Google DNS 차단 규칙 삭제',
      command: 'netsh advfirewall firewall delete rule name="Block Google DNS"',
      description: 'Google DNS 차단 규칙 삭제',
      target: 'individual',
      category: 'firewall-rule'
    }
  ]

  const categoryGroups: Record<string, { title: string; commands: typeof securityCommands }> = {
    monitoring: {
      title: '보안 상태 모니터링',
      commands: securityCommands.filter(cmd => cmd.category === 'monitoring')
    },
    usb: {
      title: 'USB 장치 통제',
      commands: securityCommands.filter(cmd => cmd.category === 'usb')
    },
    gpo: {
      title: '그룹 정책 관리',
      commands: securityCommands.filter(cmd => cmd.category === 'gpo')
    },
    screensaver: {
      title: '화면보호기 정책',
      commands: securityCommands.filter(cmd => cmd.category === 'screensaver')
    },
    'firewall-policy': {
      title: '방화벽 정책',
      commands: securityCommands.filter(cmd => cmd.category === 'firewall-policy')
    },
    'firewall-rule': {
      title: '방화벽 규칙 관리',
      commands: securityCommands.filter(cmd => cmd.category === 'firewall-rule')
    }
  }

  const handleCommandClick = async (command: any) => {
    if (command.name.includes('화면보호기 활성화')) {
      setPendingScreensaverCommand(command)
      setShowScreensaverModal(true)
      return
    }

    await executeCommand(command)
  }

  const executeCommand = async (command: any, customTimeoutSeconds?: number) => {
    const isGroupExecution = commandExecutionType === 'group'
    
    if (!isGroupExecution) {
      const targetForCommand = selectedDevice || commandTarget
      if (!targetForCommand) {
        alert('개별 디바이스를 선택해주세요.')
        return
      }
    } else {
      if (!selectedGroupDepartment || selectedGroupDepartment === '전체') {
        alert('그룹 실행을 위해 부서를 선택해주세요.')
        return
      }
    }

    setShowToast(true)
    setTimeout(() => setShowToast(false), 3000)

    try {
      if (command.name.includes('스케줄 등록')) {
        const scheduleType = command.name.includes('Defender') ? 'defender' : 
                           command.name.includes('BitLocker') ? 'bitlocker' : 'updates'
        await handleAddSecuritySchedule(scheduleType)
      } else {
        let saltCommand = ''
        let displayCommand = command.command
        let target = ''
        
        if (isGroupExecution) {
          target = `-G 'department:${selectedGroupDepartment}'`
        } else {
          target = selectedDevice || commandTarget
          if (!target) {
            alert('타겟을 선택해주세요.')
            return
          }
        }
        
        if (customTimeoutSeconds !== undefined) {
          const timeoutSeconds = customTimeoutSeconds * 60
          saltCommand = `lgpo.set user_policy="{'Enable screen saver': 'Enabled', 'Screen saver timeout': {'ScreenSaverTimeOutFreqSpin': '${timeoutSeconds}'}, 'Password protect the screen saver': 'Enabled'}"`
          displayCommand = saltCommand
        } else {
          const isGpoSetCommand = command.command.startsWith('lgpo.set')
          
          if (command.command.startsWith('lgpo.')) {
            saltCommand = command.command
            displayCommand = command.command
          } else if (command.command.startsWith('netsh ') || command.command.startsWith('gpupdate ')) {
            saltCommand = `cmd.run "${command.command}" shell=cmd`
            displayCommand = `CMD> ${command.command}`
          } else {
            saltCommand = `cmd.run "${command.command}" shell=powershell`
            displayCommand = `PS C:\\> ${command.command}`
          }
        }
        
        const response = await deviceApi.executeCommand(saltCommand, [target])
        
        const commandKey = `${command.name}_${target}_${Date.now()}`
        const commandDisplayName = customTimeoutSeconds !== undefined 
          ? `화면보호기 활성화 (${customTimeoutSeconds}분)`
          : command.name
        const resultData = {
          command: commandDisplayName,
          displayCommand,
          target: isGroupExecution ? `${selectedGroupDepartment} 부서 전체` : target,
          stdout: response.data?.stdout || '',
          stderr: response.data?.stderr || '',
          timestamp: new Date().toLocaleString('ko-KR')
        }
        setCommandResults(prev => ({ ...prev, [commandKey]: resultData }))
        
        const isGpoSetCommand = saltCommand.startsWith('lgpo.set')
        if (isGpoSetCommand) {
          const gpupdateCommand = `cmd.run "gpupdate /force" shell=cmd`
          const gpupdateResponse = await deviceApi.executeCommand(gpupdateCommand, [target])
          
          if (gpupdateResponse.data?.stdout) {
            setCommandResults(prev => ({
              ...prev,
              [commandKey]: {
                ...prev[commandKey],
                stdout: prev[commandKey].stdout + '\n\nGPO 정책 적용 중...\nCMD> gpupdate /force\n' + gpupdateResponse.data.stdout,
                stderr: prev[commandKey].stderr + (gpupdateResponse.data?.stderr ? '\n' + gpupdateResponse.data.stderr : '')
              }
            }))
          } else if (gpupdateResponse.data?.stderr) {
            setCommandResults(prev => ({
              ...prev,
              [commandKey]: {
                ...prev[commandKey],
                stderr: prev[commandKey].stderr + '\n오류: ' + gpupdateResponse.data.stderr
              }
            }))
          }
        }
        
        // 결과 모달 자동 열기
        setSelectedCommandResult({ commandKey, result: resultData })
        setShowResultModal(true)
      }
    } catch (error) {
      console.error('명령어 실행 실패:', error)
      alert('명령어 실행에 실패했습니다.')
    }
  }


  const parseCommandResult = (commandName: string, stdout: string, stderr: string) => {
    if (stderr || (stdout && (stdout.includes('Traceback') || stdout.includes('Exception') || stdout.includes('Error')))) {
      const errorText = stderr || stdout
      let errorSummary = ''
      
      if (errorText.includes('Minions returned with non-zero exit code')) {
        errorSummary = '명령어 실행이 실패했습니다. Minion에서 오류가 발생했거나 명령어가 올바르지 않습니다.'
      } else if (errorText.includes('XMLSyntaxError')) {
        const match = errorText.match(/XMLSyntaxError: ([^\n]+)/)
        errorSummary = match ? match[1] : 'XML 구문 오류가 발생했습니다.'
      } else if (errorText.includes('Minion did not return')) {
        errorSummary = 'Minion이 응답하지 않았습니다. 디바이스 연결 상태를 확인해주세요.'
      } else if (errorText.includes('Traceback')) {
        const lines = errorText.split('\n')
        const errorLine = lines.find(line => line.includes('Error:') || line.includes('Exception:'))
        errorSummary = errorLine ? errorLine.replace(/.*Error:\s*/, '').replace(/.*Exception:\s*/, '') : '명령어 실행 중 오류가 발생했습니다.'
      } else if (errorText.includes('ERROR:')) {
        const match = errorText.match(/ERROR:\s*([^\n]+)/)
        errorSummary = match ? match[1] : '명령어 실행 중 오류가 발생했습니다.'
      } else {
        errorSummary = errorText.split('\n').find(line => line.trim() && !line.includes('Traceback')) || errorText.split('\n')[0] || '알 수 없는 오류가 발생했습니다.'
      }
      
      return {
        type: 'error',
        summary: errorSummary,
        fullError: errorText
      }
    }

    try {
      let jsonData: any = null
      let cleanedOutput = stdout.trim()
      
      if (cleanedOutput.startsWith('{') && cleanedOutput.includes('": "')) {
        const outerMatch = cleanedOutput.match(/\{[^:]+:\s*"([^"]+)"\s*\}/)
        if (outerMatch) {
          const innerJson = outerMatch[1].replace(/\\r\\n/g, '\n').replace(/\\"/g, '"')
          try {
            jsonData = JSON.parse(innerJson)
          } catch (e) {
            try {
              jsonData = JSON.parse(cleanedOutput)
            } catch (e2) {
              // JSON 파싱 실패 시 원본 출력 반환
            }
          }
        } else {
          try {
            jsonData = JSON.parse(cleanedOutput)
          } catch (e) {
            // JSON 파싱 실패 시 원본 출력 반환
          }
        }
      } else if (cleanedOutput.startsWith('{') || cleanedOutput.startsWith('[')) {
        try {
          jsonData = JSON.parse(cleanedOutput)
        } catch (e) {
          // JSON 파싱 실패 시 원본 출력 반환
        }
      }

      if (jsonData) {
        if (commandName.includes('Defender')) {
          return {
            type: 'defender',
            data: jsonData
          }
        } else if (commandName.includes('BitLocker')) {
          return {
            type: 'bitlocker',
            data: Array.isArray(jsonData) ? jsonData[0] : jsonData
          }
        } else if (commandName.includes('Update') || commandName.includes('HotFix')) {
          return {
            type: 'updates',
            data: Array.isArray(jsonData) ? jsonData : (jsonData ? [jsonData] : [])
          }
        } else {
          return {
            type: 'json',
            data: jsonData
          }
        }
      }
    } catch (e) {
      // JSON 파싱 실패 시 원본 출력 반환
    }

    const cleanedOutput = stdout.trim()
    
    // lgpo.get_policy 명령어 결과 파싱
    if (commandName.includes('정책 상태 확인') || commandName.includes('정책 확인') || commandName.includes('lgpo.get_policy') || stdout.includes('lgpo.get_policy')) {
      const output = cleanedOutput.toLowerCase()
      let status = 'Unknown'
      if (output.includes('enabled')) {
        status = 'Enabled'
      } else if (output.includes('disabled')) {
        status = 'Disabled'
      } else if (output.includes('not configured') || output.includes('none')) {
        status = 'Not Configured'
      }
      
      let policyName = ''
      if (commandName.includes('USB') || stdout.includes('Removable Disks')) {
        policyName = 'USB 쓰기 차단 정책'
      } else if (commandName.includes('화면보호기') || stdout.includes('screen saver')) {
        policyName = '화면보호기 정책'
      } else if (commandName.includes('방화벽') || stdout.includes('firewall')) {
        policyName = '방화벽 정책'
      } else {
        policyName = '정책'
      }
      
      // 결과가 비어있지 않은 경우에만 policy-status 반환
      if (cleanedOutput && !cleanedOutput.includes('Traceback') && !cleanedOutput.includes('Error')) {
        return {
          type: 'policy-status',
          policyName,
          status
        }
      }
    }
    
    if (commandName.includes('화면보호기') || commandName.includes('방화벽') || commandName.includes('USB')) {
      if (cleanedOutput.includes('Result: True') || cleanedOutput.includes('result: true') || cleanedOutput.toLowerCase().includes('ok') || cleanedOutput.includes('성공')) {
        let successMessage = ''
        if (commandName.includes('화면보호기 활성화')) {
          successMessage = '화면보호기 정책이 성공적으로 활성화되었습니다.'
        } else if (commandName.includes('화면보호기 비활성화')) {
          successMessage = '화면보호기 정책이 성공적으로 비활성화되었습니다.'
        } else if (commandName.includes('방화벽 전체 활성화')) {
          successMessage = '방화벽 정책이 성공적으로 활성화되었습니다.'
        } else if (commandName.includes('방화벽 정책 삭제')) {
          successMessage = '방화벽 정책이 성공적으로 삭제되었습니다.'
        } else if (commandName.includes('USB 쓰기 차단')) {
          successMessage = 'USB 쓰기 차단 정책이 성공적으로 적용되었습니다.'
        } else if (commandName.includes('USB 쓰기 차단 해제')) {
          successMessage = 'USB 쓰기 차단 정책이 성공적으로 해제되었습니다.'
        } else {
          successMessage = '정책이 성공적으로 적용되었습니다.'
        }
        return {
          type: 'success',
          message: successMessage
        }
      } else if (cleanedOutput.includes('Result: False') || cleanedOutput.includes('result: false') || cleanedOutput.includes('False')) {
        return {
          type: 'error',
          summary: '정책 적용에 실패했습니다.',
          fullError: stdout
        }
      }
    }
    
    if (commandName.includes('포트 차단') || commandName.includes('DNS 차단') || commandName.includes('차단 규칙 삭제')) {
      if (cleanedOutput.includes('Ok.') || cleanedOutput.includes('확인') || cleanedOutput.toLowerCase().includes('success')) {
        let successMessage = ''
        if (commandName.includes('HTTP 포트 차단')) {
          successMessage = 'HTTP 포트 차단 규칙이 성공적으로 추가되었습니다.'
        } else if (commandName.includes('HTTPS 포트 차단')) {
          successMessage = 'HTTPS 포트 차단 규칙이 성공적으로 추가되었습니다.'
        } else if (commandName.includes('Google DNS 차단')) {
          successMessage = 'Google DNS 차단 규칙이 성공적으로 추가되었습니다.'
        } else if (commandName.includes('차단 규칙 삭제')) {
          successMessage = '방화벽 규칙이 성공적으로 삭제되었습니다.'
        } else {
          successMessage = '방화벽 규칙이 성공적으로 적용되었습니다.'
        }
        return {
          type: 'success',
          message: successMessage
        }
      }
    }

    return {
      type: 'text',
      data: stdout
    }
  }

  return (
    <div className="space-y-6" data-chrome-password-autocomplete="off">
      {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">디바이스 통제</h1>
            <p className="text-gray-600 mt-1">디바이스 통제 및 모니터링</p>
            {lastUpdate && (
              <p className="text-sm text-gray-500 mt-1">마지막 업데이트: {lastUpdate}</p>
            )}
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => fetchTargets(true)}
              disabled={refreshingTargets || loading}
              style={{ backgroundColor: '#0d4f2c' }}
              className="flex items-center space-x-2 text-white px-4 py-2 rounded-lg hover:opacity-90 disabled:bg-gray-300 transition-opacity"
            >
              <RefreshCw className={`w-4 h-4 ${refreshingTargets ? 'animate-spin' : ''}`} />
              <span>{refreshingTargets ? '새로고침 중...' : '대상 새로고침'}</span>
            </button>
            <button
              onClick={() => loadAllDeviceInfo()}
              disabled={loading || refreshing}
              style={{ backgroundColor: '#10113C' }}
              className="flex items-center space-x-2 text-white px-4 py-2 rounded-lg hover:opacity-90 disabled:bg-gray-300 transition-opacity"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>정보 수집</span>
            </button>
          </div>
        </div>

        {/* 관리 대상 현황 */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">관리 대상 현황</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">전체 대상</div>
              <div className="text-2xl font-bold text-blue-600">{targets.length}</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">온라인</div>
              <div className="text-2xl font-bold text-green-600">
                {targets.filter(t => t.status === 'online').length}
              </div>
            </div>
            <div className="bg-red-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">오프라인</div>
              <div className="text-2xl font-bold text-red-600">
                {targets.filter(t => t.status === 'offline').length}
              </div>
            </div>
          </div>
          
          {targets.length > 0 && (
            <div className="mt-4">
              <div className="text-sm text-gray-600 mb-2">연결된 클라이언트 목록 (클릭하여 선택):</div>
              <div className="flex flex-wrap gap-2">
                {targets.map(target => (
                  <button
                    key={target.id}
                    onClick={() => {
                      setSelectedDevice(target.id)
                      setCommandTarget(target.id)
                    }}
                    className={`px-3 py-1 rounded-full text-sm transition-colors ${
                      (selectedDevice === target.id || commandTarget === target.id)
                        ? 'bg-[#10113C]/ text-[#10113C] ring-2 ring-[#10113C]/30'
                        : target.status === 'online'
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {target.id} ({target.status === 'online' ? '온라인' : '오프라인'})
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

      {/* 1. 상단: 디바이스 목록 테이블 */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">디바이스 관리</h2>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="검색: IP/이름"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm w-48"
            />
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              {departments.map(dept => (
                <option key={dept} value={dept}>부서: {dept}</option>
              ))}
            </select>
            <button 
              style={{ backgroundColor: '#10113C' }}
              className="px-3 py-2 text-white rounded-md text-sm hover:opacity-90 transition-opacity"
            >
              CSV 내보내기
            </button>
          </div>
        </div>
        
        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <p className="mt-2 text-gray-600">디바이스 정보 수집 중...</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white border border-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">디바이스명</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">IP 주소</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">OS</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">부서</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">연결 상태</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">마지막 확인</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">작업</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedDevices.map(([target, info]) => {
                    const targetStatus = targets.find(t => t.id === target)?.status || 'offline'
                    return (
                      <tr 
                        key={target}
                        className={`hover:bg-gray-50 cursor-pointer ${selectedDevice === target ? 'bg-blue-50' : ''}`}
                        onClick={() => setSelectedDevice(target)}
                      >
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {info.host || target}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                          {target}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                          {info.osfullname ? info.osfullname.split(' ')[2] : 'Unknown'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                          {info.department || '미설정'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            targetStatus === 'online'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}>
                            {targetStatus === 'online' ? '온라인' : '오프라인'}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date().toLocaleTimeString()}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedDevice(target)
                            }}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            선택
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            
            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center space-x-2 mt-4">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 border rounded disabled:opacity-50"
                >
                  이전
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-3 py-1 border rounded ${currentPage === page ? 'bg-blue-600 text-white' : ''}`}
                  >
                    {page}
                  </button>
                ))}
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 border rounded disabled:opacity-50"
                >
                  다음
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* 2. 중앙: 전체 디바이스 보안 검사 결과 */}
      <div className="bg-white rounded-xl shadow-sm border p-6" data-chrome-password-autocomplete="off">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">전체 디바이스 보안 현황</h2>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-500">마지막 실행: {new Date().toLocaleString()}</span>
            <button
              onClick={handleRunAllTests}
              disabled={refreshing}
              style={{ backgroundColor: refreshing ? undefined : '#0d4f2c' }}
              className="flex items-center space-x-2 text-white px-4 py-2 rounded-lg hover:opacity-90 disabled:bg-gray-300 transition-opacity"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>전체 테스트 실행</span>
            </button>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">디바이스</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">부서</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Defender</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">BitLocker</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Update</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">연결상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedDevices.map(([target, info]) => {
                const security = securityStatuses[target]
                const isLoading = loadingSecurityStatus[target]
                return (
                  <tr 
                    key={target}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelectedDevice(target)}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{info.host || target}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{info.department || '미설정'}</td>
                    <td className="px-4 py-3 text-sm">
                      {isLoading ? (
                        <span className="text-gray-400">로딩 중...</span>
                      ) : security?.defender?.AntivirusEnabled ? (
                        <span className="text-green-600">OK</span>
                      ) : security?.defender !== undefined ? (
                        <span className="text-red-600">OFF</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {isLoading ? (
                        <span className="text-gray-400">로딩 중...</span>
                      ) : security?.bitlocker?.ProtectionStatus === 'On' ? (
                        <span className="text-green-600">ON</span>
                      ) : security?.bitlocker !== undefined ? (
                        <span className="text-gray-400">OFF</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">최신</td>
                    <td className="px-4 py-3 text-sm">
                      {isLoading ? (
                        <span className="text-gray-400">로딩 중...</span>
                      ) : security?.connection ? (
                        <span className="text-green-600">Online</span>
                      ) : security?.connection !== undefined ? (
                        <span className="text-red-600">Offline</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        
        {/* 선택된 디바이스 상세 정보 패널 */}
        {selectedDevice && (
          <div className="mt-6 border-t pt-6" data-chrome-password-autocomplete="off" data-form-type="other">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">
                상세 정보: {devices[selectedDevice]?.host || selectedDevice}
              </h3>
              <button
                onClick={() => setSelectedDevice('')}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Defender 상세 */}
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <div className="flex items-center space-x-2 mb-3">
                  <Shield className="w-5 h-5 text-blue-600" />
                  <h4 className="font-semibold text-gray-800">Windows Defender</h4>
                </div>
                {securityStatuses[selectedDevice]?.defender ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">바이러스 백신:</span>
                      <span className={securityStatuses[selectedDevice].defender?.AntivirusEnabled ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                        {securityStatuses[selectedDevice].defender?.AntivirusEnabled ? '활성화' : '비활성화'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">실시간 보호:</span>
                      <span className={securityStatuses[selectedDevice].defender?.RealTimeProtectionEnabled ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                        {securityStatuses[selectedDevice].defender?.RealTimeProtectionEnabled ? '활성화' : '비활성화'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">동작 모니터:</span>
                      <span className={securityStatuses[selectedDevice].defender?.BehaviorMonitorEnabled ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                        {securityStatuses[selectedDevice].defender?.BehaviorMonitorEnabled ? '활성화' : '비활성화'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">정보 없음</p>
                )}
              </div>
              
              {/* BitLocker 상세 */}
              <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                <div className="flex items-center space-x-2 mb-3">
                  <HardDrive className="w-5 h-5 text-purple-600" />
                  <h4 className="font-semibold text-gray-800">BitLocker</h4>
                </div>
                {loadingSecurityStatus[selectedDevice] ? (
                  <p className="text-sm text-gray-500">로딩 중...</p>
                ) : securityStatuses[selectedDevice]?.bitlocker ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">보호 상태:</span>
                      <span className={securityStatuses[selectedDevice].bitlocker?.ProtectionStatus === 'On' ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                        {securityStatuses[selectedDevice].bitlocker?.ProtectionStatus === 'On' ? '활성화' : '비활성화'}
                      </span>
                    </div>
                    {securityStatuses[selectedDevice].bitlocker?.MountPoint && securityStatuses[selectedDevice].bitlocker.MountPoint !== 'N/A' && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">마운트 포인트:</span>
                        <span className="text-gray-700 font-medium">
                          {securityStatuses[selectedDevice].bitlocker.MountPoint}
                        </span>
                      </div>
                    )}
                    {securityStatuses[selectedDevice].bitlocker?.VolumeStatus && securityStatuses[selectedDevice].bitlocker.VolumeStatus !== 'N/A' && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">볼륨 상태:</span>
                        <span className="text-gray-700 font-medium">
                          {securityStatuses[selectedDevice].bitlocker.VolumeStatus}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">정보 없음</p>
                )}
              </div>
              
              {/* Windows Update 상세 */}
              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                <div className="flex items-center space-x-2 mb-3">
                  <Download className="w-5 h-5 text-green-600" />
                  <h4 className="font-semibold text-gray-800">Windows Update</h4>
                </div>
                {loadingSecurityStatus[selectedDevice] ? (
                  <p className="text-sm text-gray-500">로딩 중...</p>
                ) : securityStatuses[selectedDevice]?.updates ? (
                  <div className="space-y-2 text-sm">
                    {securityStatuses[selectedDevice].updates?.lastUpdateDate && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">최근 업데이트:</span>
                        <span className="text-gray-700 font-medium text-xs">
                          {securityStatuses[selectedDevice].updates?.lastUpdateDate}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-600">설치된 업데이트:</span>
                      <span className="text-gray-700 font-medium">
                        {securityStatuses[selectedDevice].updates?.installed?.length || 0}개
                      </span>
                    </div>
                    {securityStatuses[selectedDevice].updates?.installed && 
                     securityStatuses[selectedDevice].updates.installed.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-green-200">
                        <p className="text-xs text-gray-600 mb-1">최근 업데이트 목록:</p>
                        <div className="max-h-32 overflow-y-auto space-y-1">
                          {securityStatuses[selectedDevice].updates.installed.slice(0, 5).map((update, idx) => (
                            <div key={idx} className="text-xs text-gray-700 bg-white p-1 rounded">
                              <div className="font-medium">{update.HotFixID}</div>
                              {update.Description && (
                                <div className="text-gray-500 truncate">{update.Description}</div>
                              )}
                              {update.InstalledOn && (
                                <div className="text-gray-400 text-xs">{update.InstalledOn}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">정보 없음</p>
                )}
              </div>
            </div>
            
            {securityStatuses[selectedDevice]?.lastChecked && (
              <div className="mt-4 text-xs text-gray-500 text-right">
                마지막 확인: {securityStatuses[selectedDevice].lastChecked}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. 하단: 부서 설정 */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">디바이스 부서 설정</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">대상 선택</label>
              <div className="flex space-x-2">
                <select
                  value={selectedDepartmentType}
                  onChange={(e) => setSelectedDepartmentType(e.target.value as 'individual' | 'group')}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="individual">개별 디바이스</option>
                  <option value="group">부서 전체</option>
                </select>
                {selectedDepartmentType === 'individual' && (
                  <select
                    value={selectedDepartmentTarget || selectedDevice}
                    onChange={(e) => {
                      setSelectedDepartmentTarget(e.target.value)
                      setSelectedDevice(e.target.value)
                      setCommandTarget(e.target.value)
                    }}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">디바이스 선택</option>
                    {targets.filter(t => t.status === 'online').map(target => (
                      <option key={target.id} value={target.id}>
                        {devices[target.id]?.host || target.id} ({target.id})
                      </option>
                    ))}
                  </select>
                )}
                {selectedDepartmentType === 'group' && (
                  <select
                    value={selectedGroupDepartment}
                    onChange={(e) => setSelectedGroupDepartment(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">부서 선택</option>
                    {getCustomDepartments().map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
            
            {/* 부서 추가 섹션 - 항상 표시 */}
            <div className="border-t pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">새 부서 추가</label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={newDepartment}
                  onChange={(e) => setNewDepartment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAddDepartment()
                    }
                  }}
                  placeholder="부서명을 입력하세요"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleAddDepartment}
                  disabled={!newDepartment.trim()}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  추가
                </button>
              </div>
            </div>

            {/* 부서 목록 및 삭제 섹션 */}
            <div className="border-t pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">부서 목록</label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {getCustomDepartments().map(dept => (
                  <div
                    key={dept}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded-lg border border-gray-200"
                  >
                    <span className="text-sm text-gray-700">{dept}</span>
                    <button
                      onClick={() => {
                        if (window.confirm(`"${dept}" 부서를 삭제하시겠습니까?`)) {
                          handleDeleteDepartment(dept)
                        }
                      }}
                      className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                      title="부서 삭제"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {getCustomDepartments().length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-2">등록된 부서가 없습니다.</p>
                )}
              </div>
            </div>

            {/* 개별 디바이스 선택 시 */}
            {selectedDepartmentType === 'individual' && (selectedDepartmentTarget || selectedDevice) && (
              <>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-sm text-gray-600">
                    현재 선택: {devices[selectedDepartmentTarget || selectedDevice]?.host || (selectedDepartmentTarget || selectedDevice)}
                  </p>
                  <p className="text-sm text-gray-600">
                    현재 부서: {devices[selectedDepartmentTarget || selectedDevice]?.department || '미설정'}
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">부서 변경</label>
                  <div className="flex space-x-2">
                    <select
                      value={departmentFilter === '전체' ? '' : departmentFilter}
                      onChange={(e) => setDepartmentFilter(e.target.value || '전체')}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="">부서 선택</option>
                      {getCustomDepartments().map(dept => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        const target = selectedDepartmentTarget || selectedDevice
                        if (target && departmentFilter && departmentFilter !== '전체') {
                          handleSetDepartment()
                        }
                      }}
                      disabled={!selectedDepartmentTarget && !selectedDevice || !departmentFilter || departmentFilter === '전체'}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                      저장
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* 부서 전체 선택 시 */}
            {selectedDepartmentType === 'group' && selectedGroupDepartment && (
              <div className="space-y-4">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <h4 className="text-sm font-semibold text-gray-800 mb-2">
                    선택된 부서: <span className="text-blue-600">{selectedGroupDepartment}</span>
                  </h4>
                  <p className="text-xs text-gray-600 mb-3">
                    이 부서에 속한 모든 디바이스에 명령을 실행할 수 있습니다.
                  </p>
                  
                  {/* 해당 부서의 디바이스 목록 */}
                  <div className="mt-3">
                    <p className="text-xs font-medium text-gray-700 mb-2">디바이스 목록:</p>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {Object.entries(devices)
                        .filter(([target, info]) => info.department === selectedGroupDepartment)
                        .map(([target, info]) => {
                          const targetStatus = targets.find(t => t.id === target)?.status || 'offline'
                          return (
                            <div
                              key={target}
                              className="flex items-center justify-between p-2 bg-white rounded border border-gray-200"
                            >
                              <div className="flex-1">
                                <p className="text-sm font-medium text-gray-900">
                                  {info.host || target}
                                </p>
                                <p className="text-xs text-gray-500">{target}</p>
                              </div>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                targetStatus === 'online'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-100 text-gray-700'
                              }`}>
                                {targetStatus === 'online' ? '온라인' : '오프라인'}
                              </span>
                            </div>
                          )
                        })}
                      {Object.entries(devices).filter(([target, info]) => info.department === selectedGroupDepartment).length === 0 && (
                        <p className="text-sm text-gray-500 text-center py-4">
                          이 부서에 속한 디바이스가 없습니다.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
      </div>

      {/* 4. 하단 중앙: 명령어 목록 (카드 형식) */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800">보안 모니터링 명령어</h2>
          <div className="flex items-center space-x-4">
            {/* 실행 타입 선택 */}
            <div className="flex items-center space-x-2">
              <label className="text-sm text-gray-600">실행 타입:</label>
              <select
                value={commandExecutionType}
                onChange={(e) => setCommandExecutionType(e.target.value as 'individual' | 'group')}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="individual">개별 디바이스</option>
                <option value="group">그룹 (부서별)</option>
              </select>
            </div>
            
            {/* 개별 디바이스 선택 */}
            {commandExecutionType === 'individual' && (
              <div className="flex items-center space-x-2">
                <label className="text-sm text-gray-600">디바이스:</label>
                <select
                  value={commandTarget}
                  onChange={(e) => {
                    setCommandTarget(e.target.value)
                    if (e.target.value) {
                      setSelectedDevice(e.target.value)
                    }
                  }}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">디바이스 선택</option>
                  {targets.filter(t => t.status === 'online').map(target => (
                    <option key={target.id} value={target.id}>
                      {target.id}
                    </option>
                  ))}
                </select>
              </div>
            )}
            
            {/* 그룹 (부서) 선택 */}
            {commandExecutionType === 'group' && (
              <div className="flex items-center space-x-2">
                <label className="text-sm text-gray-600">부서:</label>
                <select
                  value={selectedGroupDepartment}
                  onChange={(e) => setSelectedGroupDepartment(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {getCustomDepartments().map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
        
        {commandExecutionType === 'individual' && !commandTarget && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              개별 명령어를 실행하려면 위에서 디바이스를 선택하거나, 관리 대상 현황에서 클라이언트를 클릭하세요.
            </p>
          </div>
        )}
        
        {commandExecutionType === 'group' && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>{selectedGroupDepartment}</strong> 부서의 모든 디바이스에 명령어가 적용됩니다.
            </p>
          </div>
        )}
        
        {/* 카테고리별 명령어 그룹 */}
        <div className="space-y-6">
          {Object.entries(categoryGroups).map(([categoryKey, category]) => {
            if (category.commands.length === 0) return null
            
            return (
              <div key={categoryKey} className="border-b border-gray-200 pb-6 last:border-b-0 last:pb-0">
                <h4 className="text-lg font-semibold text-gray-800 mb-4">{category.title}</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {category.commands.map((cmd, index) => {
                    const isFirewallRule = cmd.category === 'firewall-rule'
                    const canExecute = isFirewallRule && commandExecutionType === 'group'
                      ? false
                      : commandExecutionType === 'group' 
                        ? (selectedGroupDepartment && selectedGroupDepartment !== '전체')
                        : (commandTarget || selectedDevice)
                    
                    return (
                      <div
                        key={`${categoryKey}-${index}`}
                        className={`text-left p-4 border rounded-lg transition-colors ${
                          canExecute
                            ? 'hover:bg-gray-50 hover:border-blue-300'
                            : 'opacity-50'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <h4 className="font-medium text-gray-900">{cmd.name}</h4>
                            {commandExecutionType === 'group' && (
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                                그룹
                              </span>
                            )}
                            {commandExecutionType === 'individual' && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                                개별
                              </span>
                            )}
                          </div>
                          <Play className={`w-4 h-4 ${canExecute ? 'text-blue-500' : 'text-gray-300'}`} />
                        </div>
                        <p className="text-sm text-gray-600 mb-3">{cmd.description}</p>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleCommandClick(cmd)}
                            disabled={!canExecute}
                            className="flex items-center space-x-1 bg-[#10113C] text-white px-3 py-1.5 rounded text-sm hover:bg-[#10113C]/90 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                          >
                            <Play className="w-3 h-3" />
                            <span>실행</span>
                          </button>
                          <button
                            onClick={() => {
                              const commandKeys = Object.keys(commandResults).filter(key => 
                                commandResults[key].command === cmd.name
                              )
                              if (commandKeys.length > 0) {
                                const latestKey = commandKeys.sort().reverse()[0]
                                setSelectedCommandResult({ commandKey: latestKey, result: commandResults[latestKey] })
                                setShowResultModal(true)
                              }
                            }}
                            disabled={!Object.keys(commandResults).some(key => commandResults[key].command === cmd.name)}
                            className="flex items-center space-x-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                            <span>결과</span>
                          </button>
                        </div>
                        {!canExecute && (
                          <p className="text-xs text-red-600 mt-2">
                            {isFirewallRule && commandExecutionType === 'group' 
                              ? '방화벽 규칙은 개별 실행만 가능합니다'
                              : commandExecutionType === 'group' 
                                ? '부서 선택 필요' 
                                : '디바이스 선택 필요'}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 5. 맨 하단: 정책 적용 현황 */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowPolicyStatus(!showPolicyStatus)}
            className="flex items-center justify-between flex-1 text-left"
          >
            <h2 className="text-xl font-semibold text-gray-800">디바이스 정책 적용 현황</h2>
            {showPolicyStatus ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
          {showPolicyStatus && selectedDevice && (
            <div className="flex items-center space-x-2 ml-2">
              <button
                onClick={() => loadGpoPolicyStatus(selectedDevice)}
                disabled={refreshingGpoPolicy}
                style={{ backgroundColor: '#10113C' }}
                className="flex items-center space-x-2 text-white px-3 py-1.5 rounded-lg hover:opacity-90 disabled:bg-gray-300 transition-opacity text-sm"
              >
                <RefreshCw className={`w-4 h-4 ${refreshingGpoPolicy ? 'animate-spin' : ''}`} />
                <span>{refreshingGpoPolicy ? '확인 중...' : 'GPO 현황 확인'}</span>
              </button>
              <button
                onClick={() => loadFirewallRuleStatus(selectedDevice)}
                disabled={refreshingFirewallRules}
                style={{ backgroundColor: '#10113C' }}
                className="flex items-center space-x-2 text-white px-3 py-1.5 rounded-lg hover:opacity-90 disabled:bg-gray-300 transition-opacity text-sm"
              >
                <RefreshCw className={`w-4 h-4 ${refreshingFirewallRules ? 'animate-spin' : ''}`} />
                <span>{refreshingFirewallRules ? '확인 중...' : '방화벽 규칙 확인'}</span>
              </button>
            </div>
          )}
        </div>
        
        {showPolicyStatus && selectedDevice && (
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">디바이스</label>
              <select
                value={selectedDevice}
                onChange={(e) => {
                  setSelectedDevice(e.target.value)
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                {Object.keys(devices).map(target => (
                  <option key={target} value={target}>
                    {devices[target].host || target}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="border-t pt-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-700">USB 통제</span>
                <span className={`text-sm ${
                  refreshingGpoPolicy ? 'text-gray-400' :
                  policyStatuses[selectedDevice]?.usb === 'Enabled' ? 'text-green-600' :
                  policyStatuses[selectedDevice]?.usb === 'Disabled' ? 'text-yellow-600' :
                  policyStatuses[selectedDevice]?.usb === 'Not Configured' ? 'text-gray-500' :
                  policyStatuses[selectedDevice]?.usb === 'Error' ? 'text-red-600' : 'text-gray-400'
                }`}>
                  {refreshingGpoPolicy ? '로딩 중...' : (policyStatuses[selectedDevice]?.usb || '미확인')}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-700">화면보호기</span>
                <span className={`text-sm ${
                  refreshingGpoPolicy ? 'text-gray-400' :
                  policyStatuses[selectedDevice]?.screensaver === 'Enabled' ? 'text-green-600' :
                  policyStatuses[selectedDevice]?.screensaver === 'Disabled' ? 'text-yellow-600' :
                  policyStatuses[selectedDevice]?.screensaver === 'Not Configured' ? 'text-gray-500' :
                  policyStatuses[selectedDevice]?.screensaver === 'Error' ? 'text-red-600' : 'text-gray-400'
                }`}>
                  {refreshingGpoPolicy ? '로딩 중...' : (policyStatuses[selectedDevice]?.screensaver || '미확인')}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-700">방화벽</span>
                <span className={`text-sm ${
                  refreshingGpoPolicy ? 'text-gray-400' :
                  policyStatuses[selectedDevice]?.firewall === 'Enabled' ? 'text-green-600' :
                  policyStatuses[selectedDevice]?.firewall === 'Disabled' ? 'text-yellow-600' :
                  policyStatuses[selectedDevice]?.firewall === 'Not Configured' ? 'text-gray-500' :
                  policyStatuses[selectedDevice]?.firewall === 'Error' ? 'text-red-600' : 'text-gray-400'
                }`}>
                  {refreshingGpoPolicy ? '로딩 중...' : (policyStatuses[selectedDevice]?.firewall || '미확인')}
                </span>
              </div>
              <div className="border-t pt-3 mt-3 space-y-2">
                <p className="text-sm font-medium text-gray-700 mb-2">방화벽 규칙</p>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-600">HTTP 차단</span>
                  <span className={`text-xs ${
                    refreshingFirewallRules ? 'text-gray-400' :
                    policyStatuses[selectedDevice]?.firewallRules?.http === 'Enabled' ? 'text-green-600' :
                    policyStatuses[selectedDevice]?.firewallRules?.http === 'Not Configured' ? 'text-gray-500' :
                    policyStatuses[selectedDevice]?.firewallRules?.http === 'Error' ? 'text-red-600' : 'text-gray-400'
                  }`}>
                    {refreshingFirewallRules ? '로딩 중...' : (policyStatuses[selectedDevice]?.firewallRules?.http || '미확인')}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-600">HTTPS 차단</span>
                  <span className={`text-xs ${
                    refreshingFirewallRules ? 'text-gray-400' :
                    policyStatuses[selectedDevice]?.firewallRules?.https === 'Enabled' ? 'text-green-600' :
                    policyStatuses[selectedDevice]?.firewallRules?.https === 'Not Configured' ? 'text-gray-500' :
                    policyStatuses[selectedDevice]?.firewallRules?.https === 'Error' ? 'text-red-600' : 'text-gray-400'
                  }`}>
                    {refreshingFirewallRules ? '로딩 중...' : (policyStatuses[selectedDevice]?.firewallRules?.https || '미확인')}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-600">Google DNS 차단</span>
                  <span className={`text-xs ${
                    refreshingFirewallRules ? 'text-gray-400' :
                    policyStatuses[selectedDevice]?.firewallRules?.dns === 'Enabled' ? 'text-green-600' :
                    policyStatuses[selectedDevice]?.firewallRules?.dns === 'Not Configured' ? 'text-gray-500' :
                    policyStatuses[selectedDevice]?.firewallRules?.dns === 'Error' ? 'text-red-600' : 'text-gray-400'
                  }`}>
                    {refreshingFirewallRules ? '로딩 중...' : (policyStatuses[selectedDevice]?.firewallRules?.dns || '미확인')}
                  </span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-700">Salt 연결</span>
                <span className={`text-sm ${securityStatuses[selectedDevice]?.connection ? 'text-green-600' : 'text-red-600'}`}>
                  {securityStatuses[selectedDevice]?.connection ? 'Online' : 'Offline'} (마지막 수집: {new Date().toLocaleTimeString()})
                </span>
              </div>
              {policyStatuses[selectedDevice]?.lastChecked && (
                <div className="text-xs text-gray-500 pt-2 border-t">
                  마지막 정책 상태 확인: {policyStatuses[selectedDevice].lastChecked}
                </div>
              )}
              
              <div className="border-t pt-3 mt-3">
                <p className="text-sm font-medium text-gray-700 mb-2">자동 수집 스케줄</p>
                <div className="space-y-1 text-sm text-gray-600">
                  <div>Defender: 4시간마다</div>
                  <div>BitLocker: 6시간마다</div>
                  <div>Windows Update: 24시간마다</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 토스트 메시지 */}
      {showToast && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-[#10113C] text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-in slide-in-from-top-5">
          명령어가 실행됩니다
        </div>
      )}

      {/* 결과 모달 */}
      {showResultModal && selectedCommandResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowResultModal(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-800">
                명령어 실행 결과: {selectedCommandResult.result.command}
              </h3>
              <button
                onClick={() => setShowResultModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="overflow-y-auto p-4 flex-1">
              {selectedCommandResult.result ? (() => {
                const parsed = parseCommandResult(
                  selectedCommandResult.result.command,
                  selectedCommandResult.result.stdout || '',
                  selectedCommandResult.result.stderr || ''
                )

                return (
                  <div className="space-y-4">
                    {/* 성공 메시지 표시 */}
                    {parsed.type === 'success' && (
                      <div className="border rounded-lg p-6 border-green-200 bg-green-50">
                        <div className="flex items-center space-x-3">
                          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                          <div>
                            <h4 className="font-semibold text-green-800 text-lg">성공</h4>
                            <p className="text-sm text-green-700 mt-1">{parsed.message}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 에러 표시 */}
                    {parsed.type === 'error' && (
                      <div className="border rounded-lg p-6 border-red-200 bg-red-50">
                        <div className="flex items-center space-x-3 mb-3">
                          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                            <XCircle className="w-6 h-6 text-red-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-red-800 text-lg">오류 발생</h4>
                            <p className="text-sm text-red-700 mt-1">{parsed.summary}</p>
                          </div>
                        </div>
                        {parsed.fullError && (
                          <details className="mt-3">
                            <summary className="text-xs text-red-600 cursor-pointer hover:text-red-800 font-medium">
                              상세 오류 보기
                            </summary>
                            <div className="bg-white rounded p-3 mt-2 max-h-64 overflow-y-auto border border-red-200">
                              <pre className="text-xs text-red-600 whitespace-pre-wrap font-mono">
                                {parsed.fullError}
                              </pre>
                            </div>
                          </details>
                        )}
                      </div>
                    )}

                    {/* Defender 결과 파싱 */}
                    {parsed.type === 'defender' && parsed.data && (
                      <div className="border rounded p-3 bg-blue-50 border-blue-200">
                        <h4 className="font-semibold text-gray-800 mb-3 flex items-center space-x-2">
                          <Shield className="w-5 h-5 text-blue-600" />
                          <span>Windows Defender 상태</span>
                        </h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between bg-white p-2 rounded">
                            <span className="text-gray-600">바이러스 백신:</span>
                            <span className={parsed.data.AntivirusEnabled ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                              {parsed.data.AntivirusEnabled ? '✓ 활성화' : '✗ 비활성화'}
                            </span>
                          </div>
                          <div className="flex justify-between bg-white p-2 rounded">
                            <span className="text-gray-600">실시간 보호:</span>
                            <span className={parsed.data.RealTimeProtectionEnabled ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                              {parsed.data.RealTimeProtectionEnabled ? '✓ 활성화' : '✗ 비활성화'}
                            </span>
                          </div>
                          <div className="flex justify-between bg-white p-2 rounded">
                            <span className="text-gray-600">동작 모니터:</span>
                            <span className={parsed.data.BehaviorMonitorEnabled ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                              {parsed.data.BehaviorMonitorEnabled ? '✓ 활성화' : '✗ 비활성화'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* BitLocker 결과 파싱 */}
                    {parsed.type === 'bitlocker' && parsed.data && (
                      <div className="border rounded p-3 bg-purple-50 border-purple-200">
                        <h4 className="font-semibold text-gray-800 mb-3 flex items-center space-x-2">
                          <HardDrive className="w-5 h-5 text-purple-600" />
                          <span>BitLocker 상태</span>
                        </h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between bg-white p-2 rounded">
                            <span className="text-gray-600">보호 상태:</span>
                            <span className={parsed.data.ProtectionStatus === 'On' || parsed.data.ProtectionStatus === 1 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                              {parsed.data.ProtectionStatus === 'On' || parsed.data.ProtectionStatus === 1 ? '✓ 활성화' : '✗ 비활성화'}
                            </span>
                          </div>
                          {parsed.data.MountPoint && (
                            <div className="flex justify-between bg-white p-2 rounded">
                              <span className="text-gray-600">마운트 포인트:</span>
                              <span className="text-gray-700 font-medium">{parsed.data.MountPoint}</span>
                            </div>
                          )}
                          {parsed.data.VolumeStatus !== undefined && (
                            <div className="flex justify-between bg-white p-2 rounded">
                              <span className="text-gray-600">볼륨 상태:</span>
                              <span className="text-gray-700 font-medium">{String(parsed.data.VolumeStatus)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Windows Update 결과 파싱 */}
                    {parsed.type === 'updates' && parsed.data && parsed.data.length > 0 && (
                      <div className="border rounded p-3 bg-green-50 border-green-200">
                        <h4 className="font-semibold text-gray-800 mb-3 flex items-center space-x-2">
                          <Download className="w-5 h-5 text-green-600" />
                          <span>Windows Update 목록 ({parsed.data.length}개)</span>
                        </h4>
                        <div className="max-h-96 overflow-y-auto space-y-2">
                          {parsed.data.map((update: any, idx: number) => (
                            <div key={idx} className="bg-white p-3 rounded border">
                              <div className="font-medium text-sm text-gray-900">{update.HotFixID || update.KB || 'N/A'}</div>
                              {update.Description && (
                                <div className="text-xs text-gray-600 mt-1">{update.Description}</div>
                              )}
                              {update.InstalledOn && (
                                <div className="text-xs text-gray-400 mt-1">
                                  설치일: {typeof update.InstalledOn === 'string' ? update.InstalledOn : 
                                    (update.InstalledOn.value ? update.InstalledOn.value : 'N/A')}
                                </div>
                              )}
                              {update.InstalledBy && (
                                <div className="text-xs text-gray-400 mt-1">설치자: {update.InstalledBy}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* JSON 결과 (일반) */}
                    {parsed.type === 'json' && parsed.data && (
                      <div className="border rounded p-3">
                        <h4 className="font-semibold text-gray-800 mb-2">결과</h4>
                        <div className="bg-gray-50 rounded p-3 max-h-96 overflow-y-auto">
                          <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono">
                            {JSON.stringify(parsed.data, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* 정책 상태 확인 결과 */}
                    {parsed.type === 'policy-status' && (
                      <div className="border rounded-lg p-6 bg-blue-50 border-blue-200">
                        <h4 className="font-semibold text-gray-800 mb-4 text-lg">{parsed.policyName} 상태</h4>
                        <div className="bg-white rounded-lg p-4">
                          <div className="flex items-center justify-between">
                            <span className="text-gray-700 font-medium">현재 상태:</span>
                            <span className={`text-lg font-bold ${
                              parsed.status === 'Enabled' ? 'text-green-600' :
                              parsed.status === 'Disabled' ? 'text-yellow-600' :
                              parsed.status === 'Not Configured' ? 'text-gray-500' :
                              'text-gray-400'
                            }`}>
                              {parsed.status === 'Enabled' ? '✓ 활성화됨' :
                               parsed.status === 'Disabled' ? '✗ 비활성화됨' :
                               parsed.status === 'Not Configured' ? '○ 미설정' :
                               '알 수 없음'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 텍스트 결과 (파싱 불가) */}
                    {parsed.type === 'text' && parsed.data && (
                      <div className="border rounded p-3">
                        <h4 className="font-semibold text-gray-800 mb-2">출력 결과</h4>
                        <div className="bg-gray-50 rounded p-3 max-h-96 overflow-y-auto">
                          <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono">
                            {parsed.data}
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* 결과 없음 */}
                    {parsed.type !== 'error' && parsed.type !== 'success' && parsed.type !== 'policy-status' && !parsed.data && (
                      <div className="text-center py-8 text-gray-500">
                        결과가 없습니다.
                      </div>
                    )}

                    {/* 명령어 상세 정보 (접기/펴기) */}
                    <div className="border-t pt-4 mt-4">
                      <button
                        onClick={() => setShowCommandDetails(!showCommandDetails)}
                        className="flex items-center justify-between w-full text-xs text-gray-500 hover:text-gray-700"
                      >
                        <span>명령어 상세 정보</span>
                        {showCommandDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                      {showCommandDetails && (
                        <div className="mt-2 space-y-1 text-xs text-gray-600">
                          <div className="flex justify-between">
                            <span>명령어:</span>
                            <span className="font-mono text-xs break-all ml-2 text-right">{selectedCommandResult.result.displayCommand}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>대상:</span>
                            <span>{selectedCommandResult.result.target}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>실행 시간:</span>
                            <span>{selectedCommandResult.result.timestamp}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })() : (
                <div className="text-center py-8 text-gray-500">
                  결과 정보가 없습니다.
                </div>
              )}
            </div>
            
            <div className="p-4 border-t flex justify-end">
              <button
                onClick={() => setShowResultModal(false)}
                className="px-6 py-2 bg-[#10113C] text-white rounded-lg hover:opacity-90 transition-opacity"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 화면보호기 시간 선택 모달 */}
      {showScreensaverModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">화면보호기 활성화 시간 설정</h3>
                <button
                  onClick={() => {
                    setShowScreensaverModal(false)
                    setPendingScreensaverCommand(null)
                    setScreensaverMinutes(1)
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  화면보호기 활성화 시간 (분)
                </label>
                <div className="flex items-center space-x-4">
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={screensaverMinutes}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 1
                      setScreensaverMinutes(Math.max(1, Math.min(60, value)))
                    }}
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#10113C] focus:border-transparent"
                  />
                  <span className="text-sm text-gray-600">분</span>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  선택 가능 범위: 1분 ~ 60분
                </p>
              </div>

              <div className="flex items-center space-x-3">
                <button
                  onClick={async () => {
                    if (pendingScreensaverCommand) {
                      setShowScreensaverModal(false)
                      await executeCommand(pendingScreensaverCommand, screensaverMinutes)
                      setPendingScreensaverCommand(null)
                      setScreensaverMinutes(1)
                    }
                  }}
                  className="flex-1 bg-[#10113C] text-white px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
                >
                  적용 ({screensaverMinutes}분)
                </button>
                <button
                  onClick={() => {
                    setShowScreensaverModal(false)
                    setPendingScreensaverCommand(null)
                    setScreensaverMinutes(1)
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DeviceControl