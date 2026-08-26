# SFML 3.1.0 Documentation MCP Server (`sfml3-ref`)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![SFML](https://img.shields.io/badge/SFML-3.1.0-8bc34a.svg)](https://www.sfml-dev.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-SDK-orange.svg)](https://modelcontextprotocol.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6.svg)](https://www.typescriptlang.org/)

An official **Model Context Protocol (MCP)** server providing AI assistants (Claude Desktop, Cursor, Claude Code, Cline, etc.) with direct, offline access to the complete **SFML 3.1.0** C++ reference documentation.

---

## 🌟 Features

- **Clean Markdown API Reference**: Doxygen HTML documentation parsed and cleaned into formatted GitHub Markdown with syntax-highlighted C++ code blocks.
- **Full C++20 Signatures**: Full method prototypes with specifiers (`[[nodiscard]]`, `constexpr`, `explicit`, `delete`, default arguments).
- **Categorized by Module**: All 155+ symbols categorized across the 5 SFML modules: `System`, `Window`, `Graphics`, `Audio`, and `Network`.
- **Fast In-Memory Search**: Sub-millisecond lookup across symbol names, member functions, parameters, and descriptions.
- **Smart Aliases**: Direct resolution of common SFML typedefs and helpers (e.g., `Vector2f` ➔ `sf::Vector2<T>`, `IntRect` ➔ `sf::Rect<T>`, `seconds` ➔ `sf::Time`).

---

## 🛠️ MCP Tools

| Tool | Parameters | Description |
|---|---|---|
| `list_modules` | *none* | Lists the 5 primary SFML 3.1.0 modules with descriptions and symbol counts. |
| `get_module_toc` | `module_name: string` | Returns the table of contents for a module (classes, structs, enums, namespaces, functions). |
| `search_sfml_symbol` | `query: string` | Searches symbols and member methods for a given term (e.g. `Sprite`, `setTexture`, `pollEvent`). |
| `get_sfml_doc` | `symbol_name: string` | Returns complete Markdown documentation and C++ prototypes for a specific symbol (e.g. `sf::Sprite`, `sf::Vector2`, `sf::Dns`). |

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18.0.0 or higher recommended)
- `npm`

### Installation & Build

```bash
# 1. Clone the repository
git clone https://github.com/Floxius/sfml3-ref.git
cd sfml3-ref

# 2. Install dependencies
npm install

# 3. Build the TypeScript server
npm run build
```

> **Note:** The repository already includes the pre-built `index.json` (~1 MB), so you don't need to download the raw SFML Doxygen HTML files unless you want to re-run the indexing script.

---

## 🖥️ Client Configuration

### 1. Claude Desktop

Add the server to your Claude Desktop configuration file:

- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "sfml3-ref": {
      "command": "node",
      "args": [
        "/ABSOLUTE/PATH/TO/sfml3-ref/dist/src/index.js"
      ]
    }
  }
}
```

*(On Windows, use forward slashes or double backslashes, e.g. `C:/Users/<username>/Documents/sfml3-ref/dist/src/index.js`)*

#### Alternative: Running directly with `tsx` (No build step required)

```json
{
  "mcpServers": {
    "sfml3-ref": {
      "command": "npx",
      "args": [
        "-y",
        "tsx",
        "/ABSOLUTE/PATH/TO/sfml3-ref/src/index.ts"
      ]
    }
  }
}
```

---

### 2. Cursor / Cline / Other MCP Clients

Add an STDIO MCP server with:
- **Command:** `node`
- **Args:** `["/path/to/sfml3-ref/dist/src/index.js"]`

---

## 📖 Usage Examples

Once connected in Claude or your MCP client, you can ask prompts such as:

- *"List all modules available in SFML 3.1."*
- *"Show me all classes and functions in the SFML Graphics module."*
- *"What is the constructor signature for `sf::Sprite` in SFML 3?"*
- *"How do I query DNS records with `sf::Dns` in SFML 3.1?"*
- *"Search for event handling methods in SFML 3."*

---

## 🔄 Rebuilding the Index (Optional)

If you wish to re-generate `index.json` from scratch:

1. Download the SFML 3.1.0 Doxygen HTML documentation from the [SFML Website](https://www.sfml-dev.org/files/SFML-3.1.0-doc.zip).
2. Extract the HTML files into a folder named `SFML-3.1.0` in the repository root.
3. Run the indexing script:
   ```bash
   npm run build:index
   ```

---

## 📄 License

- **Server Code:** Licensed under the [MIT License](LICENSE).
- **SFML Documentation & Library:** Copyright © Laurent Gomila & SFML Team. SFML is licensed under the terms and conditions of the [zlib/png license](https://www.sfml-dev.org/license.php).
