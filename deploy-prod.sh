#!/bin/bash

echo "🏠 PROPERTY INVESTMENT ANALYZER - PRODUCTION DEPLOYMENT"
echo "========================================================"
echo "Repository: https://github.com/Gyansri2928/property-investment-analyzer.git"
echo "Vercel:     https://vercel.com/gyan-sagar-srivastavas-projects/property-investment-analyzer"
echo "Live URL:   https://property-investment-analyzer-six.vercel.app"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check command success
check_status() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Success${NC}"
    else
        echo -e "${RED}❌ Failed${NC}"
        exit 1
    fi
}

# Step 1: Check current status
echo -e "${YELLOW}1. Checking current status...${NC}"
echo "Directory: $(pwd)"
echo "Branch: $(git branch --show-current)"
check_status

# Step 2: Check for uncommitted changes
echo -e "\n${YELLOW}2. Checking for uncommitted changes...${NC}"
if [ -n "$(git status --porcelain)" ]; then
    echo "Uncommitted changes found:"
    git status --short
else
    echo "No uncommitted changes"
fi

# Step 3: Update dependencies
echo -e "\n${YELLOW}3. Updating dependencies...${NC}"
npm install
check_status

# Step 4: Build test
echo -e "\n${YELLOW}4. Testing production build...${NC}"
npm run build
check_status

# Step 5: Get commit message
echo -e "\n${YELLOW}5. Git operations${NC}"
if [ -n "$(git status --porcelain)" ]; then
    echo "Please enter commit message (press Enter for default):"
    read commit_msg
    
    if [ -z "$commit_msg" ]; then
        commit_msg="Deploy: $(date '+%Y-%m-%d %H:%M:%S') - Property Investment Analyzer update"
    fi
    
    # Add and commit
    git add .
    git commit -m "$commit_msg"
    check_status
else
    echo "No changes to commit"
fi

# Step 6: Push to GitHub
echo -e "\n${YELLOW}6. Pushing to GitHub...${NC}"
git push personal main
check_status

# Step 7: Deployment info
echo -e "\n${GREEN}🎉 DEPLOYMENT INITIATED!${NC}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "${YELLOW}📊 Deployment Status:${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "${GREEN}✅ Code pushed to GitHub${NC}"
echo ""
echo "${YELLOW}⏳ Vercel is now automatically deploying...${NC}"
echo ""
echo "${YELLOW}📡 Monitor deployment at:${NC}"
echo "https://vercel.com/gyan-sagar-srivastavas-projects/property-investment-analyzer/deployments"
echo ""
echo "${YELLOW}🌐 Your live site:${NC}"
echo "https://property-investment-analyzer-six.vercel.app/"
echo ""
echo "${YELLOW}⏰ Estimated time: 1-3 minutes${NC}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "${GREEN}🚀 Deployment Complete!${NC}"
