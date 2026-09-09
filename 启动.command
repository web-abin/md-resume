#!/bin/zsh
cd -- "$(dirname -- "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v npm >/dev/null 2>&1; then
  echo '请先安装 Node.js 22.13 或更高版本，再重新启动。'
  read -r 'reply?按回车退出'
  exit 1
fi
if [ ! -d node_modules ]; then
  npm install || exit 1
fi
echo '简历编辑器正在启动。请打开下方 Local 地址；关闭此窗口会停止服务。'
npm run dev -- --host 127.0.0.1
