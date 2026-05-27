#!/bin/bash

# ==========================================
# HAQMS DEPLOYMENT SCRIPT
# ==========================================
# Quick deployment automation for Docker Compose

set -e  # Exit on error

echo "╔════════════════════════════════════════════════════════════╗"
echo "║         HAQMS - Hospital Appointment & Queue System       ║"
echo "║              Docker Deployment Automation                 ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ ERROR: Docker is not installed."
    echo "   Please install Docker from: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ ERROR: Docker Compose is not installed."
    echo "   Please install Docker Compose from: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker and Docker Compose are installed"
echo ""

# Check if ports are available
echo "🔍 Checking port availability..."

check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        echo "⚠️  WARNING: Port $port is already in use"
        return 1
    else
        echo "✅ Port $port is available"
        return 0
    fi
}

check_port 3000
check_port 5000
check_port 5432

echo ""

# Prompt for deployment action
echo "Select deployment action:"
echo "  1) Fresh deployment (build and start)"
echo "  2) Start existing containers"
echo "  3) Stop all containers"
echo "  4) Rebuild and restart"
echo "  5) Clean deployment (remove volumes and rebuild)"
echo "  6) View logs"
echo "  7) Exit"
echo ""
read -p "Enter choice [1-7]: " choice

case $choice in
    1)
        echo ""
        echo "🚀 Starting fresh deployment..."
        echo "   This will build all images and start containers"
        echo ""
        docker-compose up --build -d
        echo ""
        echo "✅ Deployment complete!"
        echo ""
        echo "📊 Container Status:"
        docker-compose ps
        echo ""
        echo "🌐 Access Points:"
        echo "   Frontend: http://localhost:3000"
        echo "   Backend:  http://localhost:5000/api"
        echo "   Database: localhost:5432"
        echo ""
        echo "📝 View logs: docker-compose logs -f"
        ;;
    2)
        echo ""
        echo "▶️  Starting existing containers..."
        docker-compose up -d
        echo ""
        echo "✅ Containers started!"
        docker-compose ps
        ;;
    3)
        echo ""
        echo "⏹️  Stopping all containers..."
        docker-compose down
        echo ""
        echo "✅ All containers stopped!"
        ;;
    4)
        echo ""
        echo "🔄 Rebuilding and restarting..."
        docker-compose down
        docker-compose up --build -d
        echo ""
        echo "✅ Rebuild complete!"
        docker-compose ps
        ;;
    5)
        echo ""
        echo "⚠️  WARNING: This will delete all database data!"
        read -p "Are you sure? (yes/no): " confirm
        if [ "$confirm" = "yes" ]; then
            echo ""
            echo "🧹 Cleaning deployment..."
            docker-compose down -v --rmi all
            echo ""
            echo "🚀 Starting fresh deployment..."
            docker-compose up --build -d
            echo ""
            echo "✅ Clean deployment complete!"
            docker-compose ps
        else
            echo "❌ Clean deployment cancelled"
        fi
        ;;
    6)
        echo ""
        echo "📋 Viewing logs (Ctrl+C to exit)..."
        echo ""
        docker-compose logs -f
        ;;
    7)
        echo ""
        echo "👋 Exiting deployment script"
        exit 0
        ;;
    *)
        echo ""
        echo "❌ Invalid choice. Exiting."
        exit 1
        ;;
esac

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "Deployment script completed successfully!"
echo "═══════════════════════════════════════════════════════════"
