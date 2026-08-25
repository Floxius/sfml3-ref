import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

const DOCS_DIR = path.resolve('SFML-3.1.0');
const OUTPUT_FILE = path.resolve('index.json');

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

export function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+\n/g, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function htmlToMarkdown(element: cheerio.Cheerio<any>, $: cheerio.CheerioAPI): string {
  const $el = element.clone();

  // Process code fragments before text extraction
  $el.find('.fragment').each((_, frag) => {
    const lines: string[] = [];
    $(frag).find('.line').each((_, line) => {
      lines.push($(line).text().replace(/\u00a0/g, ' '));
    });
    const code = lines.join('\n');
    $(frag).replaceWith(`\n\n\`\`\`cpp\n${code}\n\`\`\`\n\n`);
  });

  // Process param lists
  $el.find('dl.params').each((_, dl) => {
    let paramMd = '\n\n**Parameters:**\n';
    $(dl).find('table.params tr').each((_, tr) => {
      const name = $(tr).find('.paramname').text().trim();
      $(tr).find('.paramname').remove();
      const doc = cleanText($(tr).text());
      if (name) {
        paramMd += `- \`${name}\`: ${doc}\n`;
      }
    });
    $(dl).replaceWith(paramMd + '\n');
  });

  // Process return section
  $el.find('dl.section.return, dl.return').each((_, dl) => {
    $(dl).find('dt').remove();
    const text = cleanText($(dl).text());
    $(dl).replaceWith(`\n\n**Returns:** ${text}\n\n`);
  });

  // Process see also
  $el.find('dl.section.see, dl.see').each((_, dl) => {
    $(dl).find('dt').remove();
    const text = cleanText($(dl).text());
    $(dl).replaceWith(`\n\n**See also:** ${text}\n\n`);
  });

  // Process warnings / notes / attention
  $el.find('dl.section.warning, dl.section.note, dl.section.attention').each((_, dl) => {
    const title = $(dl).find('dt').text().trim() || 'Note';
    $(dl).find('dt').remove();
    const text = cleanText($(dl).text());
    $(dl).replaceWith(`\n\n> **${title}:** ${text}\n\n`);
  });

  // Process fieldtable (enums / structs)
  $el.find('table.fieldtable').each((_, ft) => {
    let fieldMd = '\n\n**Values:**\n';
    $(ft).find('tr').each((_, tr) => {
      const name = $(tr).find('.fieldname').text().trim();
      const doc = cleanText($(tr).find('.fielddoc').text());
      if (name) {
        fieldMd += `- \`${name}\`${doc ? `: ${doc}` : ''}\n`;
      }
    });
    $(ft).replaceWith(fieldMd + '\n');
  });

  // Process inline code
  $el.find('span.tt, code, tt').each((_, c) => {
    const text = $(c).text().trim();
    $(c).replaceWith(`\`${text}\``);
  });

  // Process links: keep text
  $el.find('a').each((_, a) => {
    const text = $(a).text().trim();
    $(a).replaceWith(text);
  });

  // Replace br with newline
  $el.find('br').replaceWith('\n');

  // Process paragraphs
  $el.find('p').each((_, p) => {
    const text = cleanText($(p).text());
    $(p).replaceWith(`\n\n${text}\n\n`);
  });

  // Process list items
  $el.find('li').each((_, li) => {
    const text = cleanText($(li).text());
    $(li).replaceWith(`\n- ${text}`);
  });

  return cleanText($el.text());
}

export function parsePrototype(memitem: cheerio.Cheerio<any>, $: cheerio.CheerioAPI): string {
  const protoEl = memitem.find('.memproto');
  if (protoEl.length === 0) return '';

  const labels: string[] = [];
  protoEl.find('.mlabels-right .mlabel, .mlabels .mlabel').each((_, l) => {
    const text = $(l).text().trim();
    if (text && !labels.includes(text)) {
      labels.push(text);
    }
  });

  const templateEl = protoEl.find('.template');
  let templateText = '';
  if (templateEl.length > 0) {
    templateText = templateEl.text().replace(/\s+/g, ' ').trim() + '\n';
  }

  const mainDecl = protoEl.find('.mlabels-left').length > 0 ? protoEl.find('.mlabels-left') : protoEl;
  const clone = mainDecl.clone();
  clone.find('.template').remove();
  clone.find('.mlabels-right').remove();

  let signature = clone.text()
    .replace(/\s+/g, ' ')
    .replace(/\s*\(\s*/g, '(')
    .replace(/\s*\)\s*/g, ')')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\)(const|noexcept|override|final|nodiscard)/g, ') $1')
    .replace(/&\s*([a-zA-Z0-9_])/g, '& $1')
    .trim();

  signature = signature.replace(/\s*;\s*$/, '');
  const labelSuffix = labels.length > 0 ? ` [${labels.join(', ')}]` : '';

  return `${templateText}${signature}${labelSuffix}`.trim();
}

export function determineModule($: cheerio.CheerioAPI, filename: string): string {
  const ingroup = $('.ingroups a').text().trim().replace(/ module$/i, '');
  if (ingroup && ['System', 'Window', 'Graphics', 'Audio', 'Network'].includes(ingroup)) {
    return ingroup;
  }

  const includeText = $('p:contains("#include")').text();
  const match = includeText.match(/SFML\/(System|Window|Graphics|Audio|Network)\//i);
  if (match) {
    const mod = match[1];
    return mod.charAt(0).toUpperCase() + mod.slice(1).toLowerCase();
  }

  const navItems = $('.navpath li').map((_, el) => $(el).text().trim()).get();
  for (const item of navItems) {
    if (['System', 'Window', 'Graphics', 'Audio', 'Network'].includes(item)) {
      return item;
    }
  }

  if (filename.includes('PlaybackDevice') || filename.includes('Audio')) return 'Audio';
  if (filename.includes('Glsl') || filename.includes('Shape') || filename.includes('Sprite') || filename.includes('Texture')) return 'Graphics';
  if (filename.includes('Dns') || filename.includes('Ftp') || filename.includes('Http') || filename.includes('Socket') || filename.includes('Packet') || filename.includes('IpAddress')) return 'Network';
  if (filename.includes('Window') || filename.includes('Event') || filename.includes('Keyboard') || filename.includes('Mouse') || filename.includes('Joystick') || filename.includes('Sensor') || filename.includes('Touch') || filename.includes('Clipboard') || filename.includes('Cursor') || filename.includes('VideoMode') || filename.includes('Vulkan') || filename.includes('Style')) return 'Window';
  
  return 'System';
}

export function extractHeader($: cheerio.CheerioAPI): string | undefined {
  const includeText = $('p:contains("#include")').text();
  const match = includeText.match(/SFML\/[a-zA-Z0-9_\/]+\.hpp/);
  return match ? match[0] : undefined;
}

export function cleanBrief(raw: string): string {
  return raw
    .replace(/More\.\.\.$/i, '')
    .replace(/\s*More\.\.\./g, '')
    .trim();
}

export function buildIndex(): SFMLIndex {
  console.log(`Reading Doxygen HTML documentation from: ${DOCS_DIR}`);
  if (!fs.existsSync(DOCS_DIR)) {
    throw new Error(`Documentation directory not found: ${DOCS_DIR}`);
  }

  const files = fs.readdirSync(DOCS_DIR).filter(f => f.endsWith('.html'));

  const index: SFMLIndex = {
    version: '3.1.0',
    modules: {
      System: {
        name: 'System',
        brief: 'Base module of SFML, defining various utilities (time, strings, streams, vectors, angles).',
        description: '',
        symbols: []
      },
      Window: {
        name: 'Window',
        brief: 'Provides OpenGL-based windows, context settings, video modes, and abstractions for events and input handling.',
        description: '',
        symbols: []
      },
      Graphics: {
        name: 'Graphics',
        brief: '2D graphics module: sprites, text, shapes, render windows, render textures, shaders, transforms.',
        description: '',
        symbols: []
      },
      Audio: {
        name: 'Audio',
        brief: 'Sounds, streaming (music or custom sources), recording, spatialization.',
        description: '',
        symbols: []
      },
      Network: {
        name: 'Network',
        brief: 'Socket-based communication (TCP, UDP), DNS queries, HTTP and FTP protocols.',
        description: '',
        symbols: []
      }
    },
    symbols: {},
    aliases: {}
  };

  // 1. Process group files for module descriptions & standalone functions/enums
  const groupFiles = [
    { file: 'group__system.html', mod: 'System' },
    { file: 'group__window.html', mod: 'Window' },
    { file: 'group__graphics.html', mod: 'Graphics' },
    { file: 'group__audio.html', mod: 'Audio' },
    { file: 'group__network.html', mod: 'Network' }
  ];

  for (const { file, mod } of groupFiles) {
    const filePath = path.join(DOCS_DIR, file);
    if (!fs.existsSync(filePath)) continue;

    const content = fs.readFileSync(filePath, 'utf-8');
    const $ = cheerio.load(content);

    const descEl = $('#details').nextUntil('h2.groupheader').filter('.textblock');
    const fullDesc = descEl.length > 0 ? htmlToMarkdown(descEl, $) : '';
    if (fullDesc) {
      index.modules[mod].description = fullDesc;
    }

    // Standalone functions / enums in group files
    $('.memitem').each((_, el) => {
      const mem = $(el);
      const title = mem.prev('.memtitle').text().replace(/^[◆\s]+/, '').trim();
      if (!title || title.includes('anonymous enum')) return;

      const proto = parsePrototype(mem, $);
      const doc = htmlToMarkdown(mem.find('.memdoc'), $);
      const isEnum = proto.startsWith('enum');
      const isTypedef = proto.startsWith('using') || proto.startsWith('typedef');
      const type = isEnum ? 'enum' : isTypedef ? 'typedef' : 'function';

      const fullName = title.startsWith('sf::') ? title : `sf::${title.replace(/\(\)$/, '')}`;
      const symbolKey = fullName.replace(/\(\)$/, '');

      const symbolDoc: SymbolDoc = {
        name: symbolKey,
        module: mod,
        type,
        header: extractHeader($) || `SFML/${mod}.hpp`,
        brief: cleanBrief(doc.split('\n\n')[0] || ''),
        description: doc,
        members: [{
          name: title,
          signature: proto,
          kind: type,
          description: doc
        }]
      };

      index.symbols[symbolKey] = symbolDoc;
      if (!index.modules[mod].symbols.includes(symbolKey)) {
        index.modules[mod].symbols.push(symbolKey);
      }
    });
  }

  // 2. Process class and struct files
  const classFiles = files.filter(f => (f.startsWith('class') || f.startsWith('struct')) && !f.includes('-members') && f !== 'classes.html');

  for (const file of classFiles) {
    const content = fs.readFileSync(path.join(DOCS_DIR, file), 'utf-8');
    const $ = cheerio.load(content);

    const rawTitle = $('.headertitle .title').text().replace(/\s+/g, ' ').trim();
    let type: 'class' | 'struct' = file.startsWith('struct') ? 'struct' : 'class';
    if (rawTitle.includes('Struct Reference')) type = 'struct';
    else if (rawTitle.includes('Class Reference')) type = 'class';

    let rawSymbolName = rawTitle
      .replace(/\s*(Class|Struct|Reference|module|Graphics|Window|Audio|Network|System).*$/gi, '')
      .trim();

    if (!rawSymbolName.startsWith('sf::') && !rawSymbolName.startsWith('sf')) {
      const navItems = $('.navpath li').map((_, el) => $(el).text().trim()).get();
      if (navItems.length >= 2) {
        rawSymbolName = navItems.join('::');
      } else {
        rawSymbolName = `sf::${rawSymbolName}`;
      }
    }

    // Normalized name without template formatting spaces, e.g. "sf::Vector2<T>" vs "sf::Vector2"
    const untemplatedName = rawSymbolName.replace(/<.*>$/, '').trim();
    const cleanTemplateName = rawSymbolName.replace(/<\s*([^>]+?)\s*>/g, (_, g1) => `<${g1.trim()}>`);
    const symbolName = untemplatedName !== rawSymbolName ? untemplatedName : rawSymbolName;

    const mod = determineModule($, file);
    const header = extractHeader($);

    // Brief & detailed description
    const briefEl = $('.contents > p.briefdescription, .contents > p').first();
    const brief = briefEl.length > 0 ? cleanBrief(htmlToMarkdown(briefEl, $)) : '';

    const detailsEl = $('#details').nextUntil('h2.groupheader').filter('.textblock');
    const description = detailsEl.length > 0 ? htmlToMarkdown(detailsEl, $) : brief;

    // Members
    const members: MemberDoc[] = [];
    $('.memitem').each((_, el) => {
      const mem = $(el);
      const title = mem.prev('.memtitle').text().replace(/^[◆\s]+/, '').trim();
      if (!title) return;

      const proto = parsePrototype(mem, $);
      const memDoc = htmlToMarkdown(mem.find('.memdoc'), $);
      
      let kind = 'method';
      const simpleName = symbolName.split('::').pop()!;
      if (title.includes('(') && title.startsWith(simpleName)) {
        kind = 'constructor';
      } else if (title.startsWith('~')) {
        kind = 'destructor';
      } else if (title.startsWith('operator')) {
        kind = 'operator';
      } else if (proto.startsWith('enum')) {
        kind = 'enum';
      } else if (proto.startsWith('using') || proto.startsWith('typedef')) {
        kind = 'typedef';
      } else if (mem.find('.mlabels-left .memname tr').length === 1 && !proto.includes('(')) {
        kind = 'attribute';
      }

      members.push({
        name: title,
        signature: proto,
        kind,
        description: memDoc
      });
    });

    const symbolDoc: SymbolDoc = {
      name: cleanTemplateName,
      module: mod,
      type,
      header,
      brief,
      description,
      members
    };

    index.symbols[symbolName] = symbolDoc;
    if (cleanTemplateName !== symbolName) {
      index.symbols[cleanTemplateName] = symbolDoc;
    }
    if (rawSymbolName !== symbolName && rawSymbolName !== cleanTemplateName) {
      index.symbols[rawSymbolName] = symbolDoc;
    }

    if (!index.modules[mod].symbols.includes(symbolName)) {
      index.modules[mod].symbols.push(symbolName);
    }
  }

  // 3. Process namespace files
  const nsFiles = files.filter(f => f.startsWith('namespacesf_1_1') && !f.includes('members'));

  for (const file of nsFiles) {
    const content = fs.readFileSync(path.join(DOCS_DIR, file), 'utf-8');
    const $ = cheerio.load(content);

    const rawTitle = $('.headertitle .title').text().replace(/\s+/g, ' ').trim();
    let symbolName = rawTitle.replace(/\s*(Namespace|Reference|module|Graphics|Window|Audio|Network|System).*$/gi, '').trim();
    if (!symbolName.startsWith('sf::')) {
      symbolName = `sf::${symbolName}`;
    }

    const mod = determineModule($, file);
    const header = extractHeader($);

    const briefEl = $('.contents > p.briefdescription, .contents > p').first();
    const brief = briefEl.length > 0 ? cleanBrief(htmlToMarkdown(briefEl, $)) : '';

    const detailsEl = $('#details').nextUntil('h2.groupheader').filter('.textblock');
    const description = detailsEl.length > 0 ? htmlToMarkdown(detailsEl, $) : brief;

    const members: MemberDoc[] = [];
    $('.memitem').each((_, el) => {
      const mem = $(el);
      const title = mem.prev('.memtitle').text().replace(/^[◆\s]+/, '').trim();
      if (!title) return;

      const proto = parsePrototype(mem, $);
      const memDoc = htmlToMarkdown(mem.find('.memdoc'), $);

      let kind = 'function';
      if (proto.startsWith('enum')) kind = 'enum';
      else if (proto.startsWith('using') || proto.startsWith('typedef')) kind = 'typedef';
      else if (proto.startsWith('const') && !proto.includes('(')) kind = 'constant';

      members.push({
        name: title,
        signature: proto,
        kind,
        description: memDoc
      });
    });

    const symbolDoc: SymbolDoc = {
      name: symbolName,
      module: mod,
      type: 'namespace',
      header,
      brief,
      description,
      members
    };

    index.symbols[symbolName] = symbolDoc;
    if (!index.modules[mod].symbols.includes(symbolName)) {
      index.modules[mod].symbols.push(symbolName);
    }
  }

  // 4. Common SFML aliases & typedef shortcuts
  const typedefAliases: Record<string, string> = {
    'Vector2f': 'sf::Vector2',
    'sf::Vector2f': 'sf::Vector2',
    'Vector2i': 'sf::Vector2',
    'sf::Vector2i': 'sf::Vector2',
    'Vector2u': 'sf::Vector2',
    'sf::Vector2u': 'sf::Vector2',
    'Vector3f': 'sf::Vector3',
    'sf::Vector3f': 'sf::Vector3',
    'Vector3i': 'sf::Vector3',
    'sf::Vector3i': 'sf::Vector3',
    'IntRect': 'sf::Rect',
    'sf::IntRect': 'sf::Rect',
    'FloatRect': 'sf::Rect',
    'sf::FloatRect': 'sf::Rect',
    'seconds': 'sf::Time',
    'sf::seconds': 'sf::Time',
    'milliseconds': 'sf::Time',
    'sf::milliseconds': 'sf::Time',
    'microseconds': 'sf::Time',
    'sf::microseconds': 'sf::Time',
    'degrees': 'sf::Angle',
    'sf::degrees': 'sf::Angle',
    'radians': 'sf::Angle',
    'sf::radians': 'sf::Angle'
  };

  index.aliases = typedefAliases;

  return index;
}

export function main() {
  const startTime = Date.now();
  console.log('Building SFML 3.1.0 documentation index...');
  
  const index = buildIndex();
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(index, null, 2), 'utf-8');
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  const sizeMb = (fs.statSync(OUTPUT_FILE).size / (1024 * 1024)).toFixed(2);

  console.log(`\nSuccessfully generated ${OUTPUT_FILE} (${sizeMb} MB) in ${elapsed}s`);
  console.log(`Indexed ${Object.keys(index.symbols).length} symbols across 5 modules:`);
  for (const [mod, data] of Object.entries(index.modules)) {
    console.log(`  - ${mod}: ${data.symbols.length} symbols`);
  }
}

main();
