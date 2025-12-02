#!/usr/bin/env bash

# Скрипт сборки VSIX для Git Panel (без установки)

set -euo pipefail

echo "🧩 Сборка VSIX для Git Panel..."

# Текущая директория скрипта (корень проекта)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "📁 Корень проекта: $SCRIPT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js не найден в PATH. Установи Node.js и попробуй ещё раз."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "❌ npm не найден в PATH. Установи npm и попробуй ещё раз."
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "❌ npx не найден в PATH. Проверь установку Node.js/npm."
  exit 1
fi

echo "📦 Проверка зависимостей..."
if [ ! -d "node_modules" ]; then
  echo "➡️  node_modules не найден, выполняю npm install..."
  npm install
else
  echo "✔️  node_modules уже существует — пропускаю npm install"
fi

echo "🔨 Сборка TypeScript (npm run build)..."
npm run build

echo "📦 Сборка VSIX (npx vsce package)..."
npx vsce package --allow-missing-repository

VSIX_FILE="$(ls -1t ./*.vsix | head -n 1 || true)"

if [ -z "$VSIX_FILE" ]; then
  echo "❌ Не удалось найти собранный .vsix файл."
  exit 1
fi

echo ""
echo "✅ VSIX успешно собран:"
echo "   $VSIX_FILE"
echo ""
echo "📋 Установка в Cursor/VS Code:"
echo "  1. Открой Extensions"
echo "  2. В меню выбери «Install from VSIX…»"
echo "  3. Укажи файл: $VSIX_FILE"
echo ""
echo "🎉 Теперь можно быстро править код и пересобирать VSIX одной командой:"
echo "   ./install.sh"

