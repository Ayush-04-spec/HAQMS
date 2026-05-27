@echo off
REM ==========================================
REM HAQMS DEPLOYMENT SCRIPT - WINDOWS
REM ==========================================
REM Quick deployment automation for Docker Compose

echo ╔════════════════════════════════════════════════════════════╗
echo ║         HAQMS - Hospital Appointment ^& Queue System       ║
echo ║              Docker Deployment Automation                 ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

REM Check if Docker is installed
docker --version >nul 2>&1
if errorlevel 1 (
    echo ❌ ERROR: Docker is not installed.
    echo    Please install Docker Desktop from: https://docs.docker.com/desktop/install/windows-install/
    pause
    exit /b 1
)

REM Check if Docker Compose is installed
docker-compose --version >nul 2>&1
if errorlevel 1 (
    echo ❌ ERROR: Docker Compose is not installed.
    echo    Please install Docker Compose from: https://docs.docker.com/compose/install/
    pause
    exit /b 1
)

echo ✅ Docker and Docker Compose are installed
echo.

REM Prompt for deployment action
echo Select deployment action:
echo   1) Fresh deployment (build and start)
echo   2) Start existing containers
echo   3) Stop all containers
echo   4) Rebuild and restart
echo   5) Clean deployment (remove volumes and rebuild)
echo   6) View logs
echo   7) Exit
echo.
set /p choice="Enter choice [1-7]: "

if "%choice%"=="1" goto fresh
if "%choice%"=="2" goto start
if "%choice%"=="3" goto stop
if "%choice%"=="4" goto rebuild
if "%choice%"=="5" goto clean
if "%choice%"=="6" goto logs
if "%choice%"=="7" goto exit
goto invalid

:fresh
echo.
echo 🚀 Starting fresh deployment...
echo    This will build all images and start containers
echo.
docker-compose up --build -d
echo.
echo ✅ Deployment complete!
echo.
echo 📊 Container Status:
docker-compose ps
echo.
echo 🌐 Access Points:
echo    Frontend: http://localhost:3000
echo    Backend:  http://localhost:5000/api
echo    Database: localhost:5432
echo.
echo 📝 View logs: docker-compose logs -f
goto end

:start
echo.
echo ▶️  Starting existing containers...
docker-compose up -d
echo.
echo ✅ Containers started!
docker-compose ps
goto end

:stop
echo.
echo ⏹️  Stopping all containers...
docker-compose down
echo.
echo ✅ All containers stopped!
goto end

:rebuild
echo.
echo 🔄 Rebuilding and restarting...
docker-compose down
docker-compose up --build -d
echo.
echo ✅ Rebuild complete!
docker-compose ps
goto end

:clean
echo.
echo ⚠️  WARNING: This will delete all database data!
set /p confirm="Are you sure? (yes/no): "
if /i "%confirm%"=="yes" (
    echo.
    echo 🧹 Cleaning deployment...
    docker-compose down -v --rmi all
    echo.
    echo 🚀 Starting fresh deployment...
    docker-compose up --build -d
    echo.
    echo ✅ Clean deployment complete!
    docker-compose ps
) else (
    echo ❌ Clean deployment cancelled
)
goto end

:logs
echo.
echo 📋 Viewing logs (Ctrl+C to exit)...
echo.
docker-compose logs -f
goto end

:invalid
echo.
echo ❌ Invalid choice. Exiting.
pause
exit /b 1

:exit
echo.
echo 👋 Exiting deployment script
exit /b 0

:end
echo.
echo ═══════════════════════════════════════════════════════════
echo Deployment script completed successfully!
echo ═══════════════════════════════════════════════════════════
pause
