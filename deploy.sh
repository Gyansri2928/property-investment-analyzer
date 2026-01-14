#!/bin/bash

echo "🚀 PROPERTY INVESTMENT ANALYZER - PRODUCTION DEPLOYMENT"
echo "========================================================"
echo "GitHub:  https://github.com/Ashish22june/property-comparison"
echo "Vercel:  https://vercel.com/ashish22june-4664s-projects/property-comparison"
echo "Live:    https://property-comparison-lqggsphbn-ashish22june-4664s-projects.vercel.app"
echo ""

# Step 1: Check environment
echo "📋 CHECKING ENVIRONMENT"
echo "-----------------------"
pwd
node --version
npm --version
git --version

# Step 2: Update dependencies
echo ""
echo "📦 UPDATING DEPENDENCIES"
echo "------------------------"
npm install

# Step 3: Test build
echo ""
echo "🔨 TESTING PRODUCTION BUILD"
echo "---------------------------"
npm run build

if [ $? -ne 0 ]; then
    echo "❌ BUILD FAILED! Fix errors before deploying."
    exit 1
fi

echo "✅ Build successful!"

# Step 4: Git operations
echo ""
echo "📚 GIT OPERATIONS"
echo "-----------------"
echo "Current branch:"
git branch --show-current

echo ""
echo "Changes to commit:"
git status --short

echo ""
read -p "Enter commit message: " commit_message

# Default message if empty
if [ -z "$commit_message" ]; then
    commit_message="Deploy: $(date '+%Y-%m-%d %H:%M:%S')"
fi

# Commit and push
git add .
git commit -m "$commit_message"
git push origin main

echo ""
echo "✅ Code pushed to GitHub!"

# Step 5: Vercel deployment info
echo ""
echo "☁️  VERCEL DEPLOYMENT"
echo "--------------------"
echo "Vercel will automatically deploy from GitHub."
echo ""
echo "Monitor deployment at:"
echo "https://vercel.com/ashish22june-4664s-projects/property-comparison/deployments"
echo ""
echo "Live site will be available at:"
echo "https://property-comparison-lqggsphbn-ashish22june-4664s-projects.vercel.app"
echo ""
echo "🎉 DEPLOYMENT INITIATED!"
