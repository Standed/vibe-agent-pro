#!/bin/bash

# 合并显示token用量和git信息的statusline脚本

# 获取token用量信息
token_info=$(bunx ccusage statusline 2>/dev/null || echo "tokens:N/A")

# 获取git信息 
git_info=$(echo "$(pwd | sed 's|.*/||') $(git branch --show-current 2>/dev/null | sed 's/^/git:/' || echo 'no-git') $(git status --porcelain 2>/dev/null | wc -l | sed 's/^/changes:/' | sed 's/changes:0/clean/' || echo '')")

# 合并输出，用分隔符分开
echo "$token_info | $git_info"