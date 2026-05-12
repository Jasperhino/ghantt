#!/bin/bash

# Railway deployment script for ghantt

echo "🚂 Deploying ghantt to Railway..."

# Check if railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "Please create a .env file with:"
    echo "  GITHUB_CLIENT_ID=your_client_id"
    echo "  GITHUB_CLIENT_SECRET=your_secret"
    exit 1
fi

# Load .env for local reference (not uploaded)
source .env

echo "📝 Using GitHub OAuth App:"
echo "  Client ID: ${GITHUB_CLIENT_ID:0:10}..."

# Login to Railway
echo "🔐 Logging into Railway..."
railway login

# Initialize project if needed
if [ ! -f .railway ]; then
    echo "🎯 Initializing Railway project..."
    railway init
fi

# Deploy
echo "🚀 Deploying to Railway..."
railway up

# Get the deployment URL
echo "🔗 Getting deployment URL..."
DEPLOY_URL=$(railway status --json | grep -o '"url":"[^"]*' | grep -o '[^"]*$')

if [ -z "$DEPLOY_URL" ]; then
    echo "⚠️  Couldn't auto-detect URL. Please check Railway dashboard."
    echo "📝 Set these environment variables in Railway:"
else
    echo "✅ Deployed to: https://$DEPLOY_URL"
    echo ""
    echo "📝 Now set these environment variables in Railway dashboard:"
    echo "   (https://railway.app/project/*/settings/variables)"
fi

echo ""
echo "GITHUB_CLIENT_ID=$GITHUB_CLIENT_ID"
echo "GITHUB_CLIENT_SECRET=$GITHUB_CLIENT_SECRET"
echo "APP_URL=https://$DEPLOY_URL"
echo "NODE_ENV=production"
echo ""
echo "🔧 Then update your GitHub OAuth App:"
echo "   1. Go to https://github.com/settings/applications"
echo "   2. Edit your OAuth App"
echo "   3. Update Homepage URL to: https://$DEPLOY_URL"
echo "   4. Update Callback URL to: https://$DEPLOY_URL/api/auth/callback"
echo ""
echo "✨ Done! Your app should be live at https://$DEPLOY_URL"