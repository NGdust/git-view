#!/bin/bash

# Script to install Git Plugin (JetBrains Style) in VS Code/Cursor

echo "🔧 Installing Git Plugin (JetBrains Style)..."

# Определяем операционную систему
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    VSCODE_EXTENSIONS_DIR="$HOME/.vscode/extensions"
    CURSOR_EXTENSIONS_DIR="$HOME/.cursor/extensions"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    VSCODE_EXTENSIONS_DIR="$HOME/.vscode/extensions"
    CURSOR_EXTENSIONS_DIR="$HOME/.cursor/extensions"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
    # Windows (Git Bash)
    VSCODE_EXTENSIONS_DIR="$USERPROFILE/.vscode/extensions"
    CURSOR_EXTENSIONS_DIR="$USERPROFILE/.cursor/extensions"
else
    echo "❌ Unsupported operating system: $OSTYPE"
    exit 1
fi

# Get current directory path
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXTENSION_NAME="git-plugin-vc"
EXTENSION_ID="git-plugin-vc"

# Проверяем наличие Node.js и npm
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "📦 Installing dependencies..."
cd "$SCRIPT_DIR"
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "🔨 Compiling TypeScript..."
npm run compile

if [ $? -ne 0 ]; then
    echo "❌ Failed to compile TypeScript"
    exit 1
fi

# Определяем, куда устанавливать (VS Code или Cursor)
INSTALL_DIR=""
if [ -d "$CURSOR_EXTENSIONS_DIR" ]; then
    INSTALL_DIR="$CURSOR_EXTENSIONS_DIR"
    EDITOR_NAME="Cursor"
elif [ -d "$VSCODE_EXTENSIONS_DIR" ]; then
    INSTALL_DIR="$VSCODE_EXTENSIONS_DIR"
    EDITOR_NAME="VS Code"
else
    # Создаем директорию для VS Code по умолчанию
    INSTALL_DIR="$VSCODE_EXTENSIONS_DIR"
    EDITOR_NAME="VS Code"
    echo "📁 Creating extensions directory: $INSTALL_DIR"
    mkdir -p "$INSTALL_DIR"
fi

# Create extensions directory if it doesn't exist
mkdir -p "$INSTALL_DIR"

# Copy extension
EXTENSION_DIR="$INSTALL_DIR/$EXTENSION_ID"
echo "📁 Copying extension to $EXTENSION_DIR..."

if [ -d "$EXTENSION_DIR" ]; then
    echo "⚠️  Extension already installed. Removing old version..."
    rm -rf "$EXTENSION_DIR"
fi

# Проверяем наличие скомпилированных файлов
if [ ! -d "$SCRIPT_DIR/out" ]; then
    echo "❌ Compiled files not found. Please run 'npm run compile' first."
    exit 1
fi

# Копируем только необходимые файлы
mkdir -p "$EXTENSION_DIR"
cp -r "$SCRIPT_DIR/package.json" "$EXTENSION_DIR/"
cp -r "$SCRIPT_DIR/out" "$EXTENSION_DIR/"
cp -r "$SCRIPT_DIR/media" "$EXTENSION_DIR/"
if [ -f "$SCRIPT_DIR/README.md" ]; then
    cp -r "$SCRIPT_DIR/README.md" "$EXTENSION_DIR/"
fi

# Копируем node_modules только для production зависимостей
if [ -d "$SCRIPT_DIR/node_modules" ]; then
    echo "📚 Copying production dependencies..."
    mkdir -p "$EXTENSION_DIR/node_modules"
    
    # Копируем только необходимые пакеты
    if [ -d "$SCRIPT_DIR/node_modules/simple-git" ]; then
        cp -r "$SCRIPT_DIR/node_modules/simple-git" "$EXTENSION_DIR/node_modules/"
    fi
    
    # Копируем зависимости simple-git
    if [ -d "$SCRIPT_DIR/node_modules/@kwsites" ]; then
        mkdir -p "$EXTENSION_DIR/node_modules/@kwsites"
        cp -r "$SCRIPT_DIR/node_modules/@kwsites" "$EXTENSION_DIR/node_modules/"
    fi
    
    # Копируем другие возможные зависимости
    if [ -d "$SCRIPT_DIR/node_modules/debug" ]; then
        cp -r "$SCRIPT_DIR/node_modules/debug" "$EXTENSION_DIR/node_modules/" 2>/dev/null || true
    fi
fi

echo "✅ Extension successfully installed in $EDITOR_NAME!"
echo ""
echo "📋 Next steps:"
echo "1. Restart $EDITOR_NAME"
echo "2. Open a Git repository"
echo "3. Look for 'Git Log' in the Source Control panel"
echo "4. Or press Cmd+Shift+P (or Ctrl+Shift+P) and type 'Git Plugin: Open View'"
echo ""
echo "🎉 Enjoy your new Git plugin!"

