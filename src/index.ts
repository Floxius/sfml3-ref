#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

export interface MemberDoc {
  name: string;
  signature: string;
  kind: string;
  description: string;
}

export interface SymbolDoc {
  name: string;
  module: string;
  type: 'class' | 'struct' | 'enum' | 'namespace' | 'function' | 'typedef' | 'concept';
  header?: string;
  brief: string;
  description: string;
  members: MemberDoc[];
}

export interface ModuleData {
  name: string;
  brief: string;
  description: string;
  symbols: string[];
}

export interface SFMLIndex {
  version: string;
  modules: Record<string, ModuleData>;
  symbols: Record<string, SymbolDoc>;
  aliases: Record<string, string>;
}

// Find and load index.json
function loadIndex(): SFMLIndex {
  const possiblePaths = [
    path.resolve(process.cwd(), 'index.json'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../index.json'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../index.json'),
    path.resolve('index.json')
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf-8');
        return JSON.parse(raw) as SFMLIndex;
      } catch (err) {
        console.error(`Failed to parse index at ${p}:`, err);
      }
    }
  }

  throw new Error(
    `SFML documentation index (index.json) could not be found. Please run 'npm run build:index' first.`
  );
}

const index = loadIndex();

// Normalizes a symbol query to lookup in index
function findSymbol(name: string): SymbolDoc | null {
  const trimmed = name.trim();
  if (!trimmed) return null;

  // Direct lookup
  if (index.symbols[trimmed]) return index.symbols[trimmed];

  // Lookup with sf:: prefix
  const withSf = trimmed.startsWith('sf::') ? trimmed : `sf::${trimmed}`;
  if (index.symbols[withSf]) return index.symbols[withSf];

  // Lookup in aliases (e.g. Vector2f, IntRect)
  if (index.aliases[trimmed] && index.symbols[index.aliases[trimmed]]) {
    return index.symbols[index.aliases[trimmed]];
  }
  if (index.aliases[withSf] && index.symbols[index.aliases[withSf]]) {
    return index.symbols[index.aliases[withSf]];
  }

  // Case-insensitive lookup
  const lower = trimmed.toLowerCase();
  const lowerWithSf = withSf.toLowerCase();
  for (const [key, sym] of Object.entries(index.symbols)) {
    if (key.toLowerCase() === lower || key.toLowerCase() === lowerWithSf) {
      return sym;
    }
  }

  // Check if query is in format "sf::Class::Method" or "Class::Method"
  const parts = trimmed.split('::');
  if (parts.length >= 2) {
    const parentName = parts.slice(0, -1).join('::');
    const parentSym = findSymbol(parentName);
    if (parentSym) return parentSym;
  }

  return null;
}

// Create MCP Server
const server = new McpServer({
  name: 'sfml3-ref',
  version: '1.0.0'
});

// Tool 1: list_modules
server.tool(
  'list_modules',
  'List the 5 primary SFML 3.1.0 modules (System, Window, Graphics, Audio, Network) with descriptions and symbol counts.',
  {},
  async () => {
    const moduleNames = Object.keys(index.modules);
    let md = `# SFML 3.1.0 Modules\n\n`;
    md += `SFML (Simple and Fast Multimedia Library) 3.1.0 is organized into ${moduleNames.length} primary modules:\n\n`;

    for (const modName of ['System', 'Window', 'Graphics', 'Audio', 'Network']) {
      const mod = index.modules[modName];
      if (!mod) continue;
      md += `### 📦 [${mod.name} Module]\n`;
      md += `**Summary:** ${mod.brief}\n\n`;
      md += `**Symbols count:** ${mod.symbols.length} classes, structs, enums, and functions.\n\n`;
    }

    md += `---\n*Tip: Use \`get_module_toc(module_name)\` to see all classes and symbols in a specific module.*`;

    return {
      content: [{ type: 'text', text: md }]
    };
  }
);

// Tool 2: get_module_toc
server.tool(
  'get_module_toc',
  'Get table of contents listing all classes, structs, enums, namespaces, and functions for a specific SFML module.',
  {
    module_name: z.string().describe('The name of the module: System, Window, Graphics, Audio, or Network (case-insensitive)')
  },
  async ({ module_name }) => {
    const normalizedMod = Object.keys(index.modules).find(
      m => m.toLowerCase() === module_name.trim().toLowerCase()
    );

    if (!normalizedMod) {
      const available = Object.keys(index.modules).join(', ');
      return {
        content: [{
          type: 'text',
          text: `❌ Module "${module_name}" not found. Available modules in SFML 3.1.0: ${available}.`
        }]
      };
    }

    const mod = index.modules[normalizedMod];
    const symbols = mod.symbols.map(s => index.symbols[s]).filter(Boolean);

    // Group symbols by type
    const classes = symbols.filter(s => s.type === 'class');
    const structs = symbols.filter(s => s.type === 'struct');
    const namespaces = symbols.filter(s => s.type === 'namespace');
    const enumsAndTypes = symbols.filter(s => s.type === 'enum' || s.type === 'typedef');
    const functions = symbols.filter(s => s.type === 'function');

    let md = `# SFML 3.1.0 - ${mod.name} Module Table of Contents\n\n`;
    md += `**Description:** ${mod.brief}\n\n`;
    md += `Total symbols: **${symbols.length}**\n\n`;

    if (namespaces.length > 0) {
      md += `## 🌐 Namespaces\n`;
      for (const s of namespaces) {
        md += `- **\`${s.name}\`**: ${s.brief || 'No summary available.'}\n`;
      }
      md += '\n';
    }

    if (classes.length > 0) {
      md += `## 🏛️ Classes\n`;
      for (const s of classes) {
        md += `- **\`${s.name}\`**: ${s.brief || 'No summary available.'}\n`;
      }
      md += '\n';
    }

    if (structs.length > 0) {
      md += `## 🧱 Structures\n`;
      for (const s of structs) {
        md += `- **\`${s.name}\`**: ${s.brief || 'No summary available.'}\n`;
      }
      md += '\n';
    }

    if (enumsAndTypes.length > 0) {
      md += `## 🏷️ Enumerations & Types\n`;
      for (const s of enumsAndTypes) {
        md += `- **\`${s.name}\`** (${s.type}): ${s.brief || 'No summary available.'}\n`;
      }
      md += '\n';
    }

    if (functions.length > 0) {
      md += `## ⚡ Functions\n`;
      for (const s of functions) {
        md += `- **\`${s.name}()\`**: ${s.brief || 'No summary available.'}\n`;
      }
      md += '\n';
    }

    md += `---\n*Tip: Use \`get_sfml_doc(symbol_name)\` (e.g. \`get_sfml_doc("${classes[0]?.name || structs[0]?.name || 'sf::Sprite'}")\`) to view full documentation, C++ prototypes, and code examples.*`;

    return {
      content: [{ type: 'text', text: md }]
    };
  }
);

// Tool 3: search_sfml_symbol
server.tool(
  'search_sfml_symbol',
  'Search for symbols (classes, methods, functions, enums, structs) matching a query term in SFML 3.1.0 documentation.',
  {
    query: z.string().describe('Search term (e.g. "Sprite", "setTexture", "Vector2", "pollEvent", "Dns", "sleep", "isOpen")')
  },
  async ({ query }) => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return {
        content: [{ type: 'text', text: 'Please provide a search query.' }]
      };
    }

    const exactMatches: SymbolDoc[] = [];
    const nameMatches: SymbolDoc[] = [];
    const memberMatches: { symbol: SymbolDoc; member: MemberDoc }[] = [];
    const descMatches: SymbolDoc[] = [];

    // Check alias first
    if (index.aliases[query.trim()]) {
      const target = index.symbols[index.aliases[query.trim()]];
      if (target && !exactMatches.includes(target)) {
        exactMatches.push(target);
      }
    }

    for (const sym of Object.values(index.symbols)) {
      const symNameLower = sym.name.toLowerCase();
      const simpleNameLower = sym.name.split('::').pop()?.toLowerCase() || '';

      if (symNameLower === q || simpleNameLower === q || symNameLower === `sf::${q}`) {
        if (!exactMatches.includes(sym)) exactMatches.push(sym);
      } else if (symNameLower.includes(q)) {
        if (!nameMatches.includes(sym) && !exactMatches.includes(sym)) nameMatches.push(sym);
      }

      // Check members
      for (const m of sym.members) {
        const memNameLower = m.name.toLowerCase();
        if (memNameLower.includes(q) || m.signature.toLowerCase().includes(q)) {
          memberMatches.push({ symbol: sym, member: m });
        }
      }

      // Check brief & description
      if (
        (sym.brief.toLowerCase().includes(q) || sym.description.toLowerCase().includes(q)) &&
        !exactMatches.includes(sym) &&
        !nameMatches.includes(sym)
      ) {
        descMatches.push(sym);
      }
    }

    let md = `# Search Results for "${query}"\n\n`;

    if (exactMatches.length === 0 && nameMatches.length === 0 && memberMatches.length === 0 && descMatches.length === 0) {
      md += `No exact or partial matches found for "${query}".\n\n`;
      md += `*Suggestions:*\n`;
      md += `- Try searching for a broader term (e.g. \`Vector\`, \`Sound\`, \`Window\`, \`Event\`, \`Texture\`).\n`;
      md += `- Use \`list_modules\` or \`get_module_toc(module_name)\` to browse available symbols.`;
      return {
        content: [{ type: 'text', text: md }]
      };
    }

    if (exactMatches.length > 0) {
      md += `## 🎯 Exact Match\n`;
      for (const s of exactMatches) {
        md += `- **\`${s.name}\`** (${s.type} in *${s.module}* module)\n`;
        if (s.header) md += `  Header: \`<${s.header}>\`\n`;
        md += `  ${s.brief || s.description.slice(0, 120)}\n\n`;
      }
    }

    if (nameMatches.length > 0) {
      md += `## 🔍 Matching Symbols\n`;
      for (const s of nameMatches.slice(0, 10)) {
        md += `- **\`${s.name}\`** (${s.type} in *${s.module}* module): ${s.brief || ''}\n`;
      }
      if (nameMatches.length > 10) {
        md += `*...and ${nameMatches.length - 10} more symbols.*\n`;
      }
      md += '\n';
    }

    if (memberMatches.length > 0) {
      md += `## ⚙️ Matching Methods & Members\n`;
      const shownMembers = memberMatches.slice(0, 12);
      for (const { symbol, member } of shownMembers) {
        md += `- **\`${symbol.name}::${member.name}\`** (${member.kind})\n`;
        md += `  \`\`\`cpp\n  ${member.signature}\n  \`\`\`\n`;
        if (member.description) {
          const firstLine = member.description.split('\n')[0].replace(/\*\*/g, '').slice(0, 120);
          md += `  ${firstLine}\n`;
        }
      }
      if (memberMatches.length > 12) {
        md += `\n*...and ${memberMatches.length - 12} more method matches.*\n`;
      }
      md += '\n';
    }

    if (descMatches.length > 0 && exactMatches.length === 0 && nameMatches.length === 0) {
      md += `## 📄 Description Matches\n`;
      for (const s of descMatches.slice(0, 5)) {
        md += `- **\`${s.name}\`** (${s.type} in *${s.module}*): ${s.brief || ''}\n`;
      }
      md += '\n';
    }

    md += `---\n*Tip: Call \`get_sfml_doc(symbol_name)\` with the exact symbol name to view complete C++ API documentation.*`;

    return {
      content: [{ type: 'text', text: md }]
    };
  }
);

// Tool 4: get_sfml_doc
server.tool(
  'get_sfml_doc',
  'Get complete Markdown documentation and C++ prototypes for a specific SFML symbol (class, struct, enum, function, namespace).',
  {
    symbol_name: z.string().describe('The name of the symbol (e.g. "sf::Sprite", "Sprite", "sf::Vector2", "sf::Dns", "sf::sleep", "Vector2f")')
  },
  async ({ symbol_name }) => {
    const sym = findSymbol(symbol_name);

    if (!sym) {
      // Find closest matches for recommendations
      const q = symbol_name.trim().toLowerCase();
      const suggestions = Object.keys(index.symbols)
        .filter(k => k.toLowerCase().includes(q) || q.includes(k.split('::').pop()!.toLowerCase()))
        .slice(0, 5);

      let notFoundMsg = `❌ Symbol "${symbol_name}" was not found in SFML 3.1.0 documentation.\n\n`;
      if (suggestions.length > 0) {
        notFoundMsg += `Did you mean one of these?\n`;
        for (const s of suggestions) {
          notFoundMsg += `- \`${s}\`\n`;
        }
      } else {
        notFoundMsg += `Try using \`search_sfml_symbol("${symbol_name}")\` to find relevant symbols and methods.`;
      }

      return {
        content: [{ type: 'text', text: notFoundMsg }]
      };
    }

    // Build comprehensive documentation in Markdown
    let md = `# ${sym.name}\n\n`;
    md += `- **Type:** \`${sym.type}\`\n`;
    md += `- **Module:** **${sym.module}**\n`;
    if (sym.header) {
      md += `- **Header:** \`#include <${sym.header}>\`\n`;
    }
    md += `\n---\n\n`;

    if (sym.brief) {
      md += `### 📌 Overview\n${sym.brief}\n\n`;
    }

    if (sym.description && sym.description !== sym.brief) {
      md += `### 📖 Description\n${sym.description}\n\n`;
    }

    if (sym.members.length > 0) {
      // Separate constructors, destructors, operators, methods, enums/types, attributes
      const constructors = sym.members.filter(m => m.kind === 'constructor');
      const destructors = sym.members.filter(m => m.kind === 'destructor');
      const operators = sym.members.filter(m => m.kind === 'operator');
      const methods = sym.members.filter(m => m.kind === 'method' || m.kind === 'function');
      const types = sym.members.filter(m => m.kind === 'enum' || m.kind === 'typedef');
      const attributes = sym.members.filter(m => m.kind === 'attribute' || m.kind === 'constant');
      const others = sym.members.filter(m => !constructors.includes(m) && !destructors.includes(m) && !operators.includes(m) && !methods.includes(m) && !types.includes(m) && !attributes.includes(m));

      md += `---\n\n## 🛠️ API Reference (${sym.members.length} members)\n\n`;

      if (types.length > 0) {
        md += `### 🏷️ Types & Enumerations\n\n`;
        for (const m of types) {
          md += `#### \`${m.name}\`\n`;
          if (m.signature) md += `\`\`\`cpp\n${m.signature}\n\`\`\`\n`;
          if (m.description) md += `${m.description}\n\n`;
        }
      }

      if (attributes.length > 0) {
        md += `### 📦 Public Attributes & Constants\n\n`;
        for (const m of attributes) {
          md += `#### \`${m.name}\`\n`;
          if (m.signature) md += `\`\`\`cpp\n${m.signature}\n\`\`\`\n`;
          if (m.description) md += `${m.description}\n\n`;
        }
      }

      if (constructors.length > 0 || destructors.length > 0) {
        md += `### 🏗️ Constructors & Destructor\n\n`;
        for (const m of [...constructors, ...destructors]) {
          md += `#### \`${m.name}\`\n`;
          if (m.signature) md += `\`\`\`cpp\n${m.signature}\n\`\`\`\n`;
          if (m.description) md += `${m.description}\n\n`;
        }
      }

      if (methods.length > 0) {
        md += `### ⚡ Member Functions\n\n`;
        for (const m of methods) {
          md += `#### \`${m.name}\`\n`;
          if (m.signature) md += `\`\`\`cpp\n${m.signature}\n\`\`\`\n`;
          if (m.description) md += `${m.description}\n\n`;
        }
      }

      if (operators.length > 0) {
        md += `### 🔄 Operators\n\n`;
        for (const m of operators) {
          md += `#### \`${m.name}\`\n`;
          if (m.signature) md += `\`\`\`cpp\n${m.signature}\n\`\`\`\n`;
          if (m.description) md += `${m.description}\n\n`;
        }
      }

      if (others.length > 0) {
        md += `### 🔹 Other Members\n\n`;
        for (const m of others) {
          md += `#### \`${m.name}\`\n`;
          if (m.signature) md += `\`\`\`cpp\n${m.signature}\n\`\`\`\n`;
          if (m.description) md += `${m.description}\n\n`;
        }
      }
    }

    return {
      content: [{ type: 'text', text: md.trim() }]
    };
  }
);

// Start the MCP Server with stdio transport
export async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

runServer().catch(err => {
  console.error('Fatal error starting SFML 3 MCP Server:', err);
  process.exit(1);
});
