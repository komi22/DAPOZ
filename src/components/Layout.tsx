import React, { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Shield,
  Settings,
  ChevronDown,
  ChevronRight,
  Network,
  Cpu,
  Users,
  FileCheck,
  Search,
  Target,
  AlertTriangle,
  Menu,
  X,
  Database,
  Monitor,
  AppWindow,
  SearchCheck
} from 'lucide-react'

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation()
  const [expandedMenus, setExpandedMenus] = useState<{ [key: string]: boolean }>({
    'zt-policy': true,
    'zt-diagnosis': true,
    'application-control': true
  })
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const toggleMenu = (menuKey: string) => {
    setExpandedMenus(prev => ({
      ...prev,
      [menuKey]: !prev[menuKey]
    }))
  }

  const menuItems = [
    {
      title: '대시보드',
      icon: LayoutDashboard,
      path: '/dashboard'
    },
    {
      title: 'ZT 정책 적용',
      icon: Shield,
      key: 'zt-policy',
      submenu: [
        {
          title: '신원접근 통제',
          icon: Users,
          path: '/zt-policy-apply/identity'
        },
        {
          title: '네트워크 통제',
          icon: Network,
          path: '/zt-policy-apply/network'
        },
        {
          title: '어플리케이션 통제',
          icon: AppWindow,
          key: 'application-control',
          submenu: [
            {
              title: '프로세스 통제',
              icon: Cpu,
              path: '/zt-policy-apply/process'
            },
            {
              title: 'SBOM 생성',
              icon: FileCheck,
              path: '/zt-policy-apply/sbom'
            }
          ]
        },
        {
          title: '데이터 통제',
          icon: Database,
          path: '/data-control'
        },
        {
          title: '디바이스 통제',
          icon: Monitor,
          path: '/zt-policy-apply/device'
        }
      ]
    },
    {
      title: 'ZT 정책 진단',
      icon: Search,
      key: 'zt-diagnosis',
      submenu: [
        {
          title: '진단 평가',
          icon: SearchCheck,
          path: '/zt-policy-diagnosis/diagnosis-evaluation'
        },
        {
          title: '위협 개선 리포팅',
          icon: AlertTriangle,
          path: '/zt-policy-diagnosis/threat-report'
        },
        // ✅ 새로 추가된 메뉴: 공격 테스트
        {
          title: '공격 테스트',
          icon: Target,
          path: '/zt-policy-diagnosis/attack-test'
        }
      ]
    }
  ]

  const isActiveRoute = (path: string) => {
    if (path === '/dashboard') {
      return location.pathname === '/' || location.pathname === '/dashboard'
    }
    return location.pathname.startsWith(path)
  }

  const Sidebar = () => (
    <div className="w-64 bg-slate-900 shadow-lg border-r border-slate-800 flex flex-col fixed h-screen">
      <div className="p-6 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <img
            src="/logo/Dapoz_logo.png"
            alt="DAPOZ Logo"
            className="w-12 h-12 rounded-xl object-cover"
          />
          <div>
            <h1 className="text-xl font-bold text-white">Dapoz</h1>
            <p className="text-sm text-white">Security Dashboard</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {menuItems.map((item) => (
          <div key={item.title}>
            {item.submenu ? (
              <div>
                <button
                  onClick={() => toggleMenu((item as any).key!)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                    expandedMenus[(item as any).key!]
                      ? 'bg-[#E8F0F8]/30 text-white font-bold'
                      : 'text-white hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <item.icon className="w-5 h-5" />
                    <span>{item.title}</span>
                  </div>
                  {expandedMenus[(item as any).key!] ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>
                {expandedMenus[(item as any).key!] && (
                  <div className="mt-2 ml-4 space-y-1">
                    {item.submenu.map((subItem: any) => (
                      <div key={subItem.path || subItem.title}>
                        {subItem.submenu ? (
                          <div>
                            <button
                              onClick={() => toggleMenu(subItem.key!)}
                              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                                expandedMenus[subItem.key!]
                                  ? 'bg-[#E8F0F8]/30 text-white font-bold'
                                  : 'text-white hover:bg-slate-800'
                              }`}
                            >
                              <div className="flex items-center space-x-3">
                                <subItem.icon className="w-4 h-4" />
                                <span>{subItem.title}</span>
                              </div>
                              {expandedMenus[subItem.key!] ? (
                                <ChevronDown className="w-3 h-3" />
                              ) : (
                                <ChevronRight className="w-3 h-3" />
                              )}
                            </button>
                            {expandedMenus[subItem.key!] && (
                              <div className="mt-1 ml-4 space-y-1">
                                {subItem.submenu.map((nestedItem: any) => (
                                  <Link
                                    key={nestedItem.path}
                                    to={nestedItem.path}
                                    className={`flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                                      isActiveRoute(nestedItem.path)
                                        ? 'bg-[#E8F0F8]/30 text-white font-bold'
                                        : 'text-white hover:bg-slate-800'
                                    }`}
                                  >
                                    <nestedItem.icon className="w-4 h-4" />
                                    <span>{nestedItem.title}</span>
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <Link
                            to={subItem.path}
                            className={`flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                              isActiveRoute(subItem.path)
                                ? 'bg-[#E8F0F8]/30 text-white font-bold'
                                : 'text-white hover:bg-slate-800'
                            }`}
                          >
                            <subItem.icon className="w-4 h-4" />
                            <span>{subItem.title}</span>
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Link
                to={(item as any).path!}
                className={`flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActiveRoute((item as any).path!)
                    ? 'bg-[#E8F0F8]/30 text-white font-bold'
                    : 'text-white hover:bg-slate-800'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span>{item.title}</span>
              </Link>
            )}
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <div className="text-xs text-white text-center">
          <p>Dapoz Security Dashboard</p>
          <p>Zero Trust Network Access</p>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Mobile Menu Button */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 bg-slate-900 rounded-lg shadow-md border border-slate-800"
        >
          {isMobileMenuOpen ? (
            <X className="w-5 h-5 text-white" />
          ) : (
            <Menu className="w-5 h-5 text-white" />
          )}
        </button>
      </div>

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black bg-opacity-50"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full">
            <Sidebar />
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
        <main className="flex-1 p-6 lg:p-8 pt-16 lg:pt-8">
          {children}
        </main>
      </div>
    </div>
  )
}

export default Layout
