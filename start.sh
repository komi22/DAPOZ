
#!/bin/bash
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

echo ""
echo "✅ DAPOZ 대시보드가 시작되었습니다!"
echo ""
echo "🌐 웹 콘솔: http://localhost:4173"
echo "📡 백엔드 API: http://localhost:3001"
echo "🔐 OpenZiti 콘솔: https://192.168.149.100:8443"
echo ""
echo "💡 컨테이너 상태 확인:"
echo "   docker ps | grep ziti"
echo "   docker ps | grep salt"
echo ""
echo "종료하려면 Ctrl+C를 누르세요"

# 종료 처리
trap 'echo "🛑 서버 종료 중..."; kill $BACKEND_PID $FRONTEND_PID; exit' INT

# 대기
wait
