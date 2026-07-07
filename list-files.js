#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = path.join(__dirname, 'src');
const outputFile = path.join(__dirname, 'file_list.txt');

/**
 * Percorre um diretório recursivamente e retorna todos os arquivos .js
 */
function walkDir(dir) {
  let results = [];
  const list = fs.readdirSync(dir);

  for (const item of list) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      results = results.concat(walkDir(fullPath));
    } else if (item.endsWith('.js')) {
      // Caminho relativo a partir de 'src'
      const relativePath = path.relative(srcDir, fullPath);
      results.push(relativePath);
    }
  }

  return results;
}

// Busca todos os arquivos .js
const jsFiles = walkDir(srcDir);

// Ordena alfabeticamente
jsFiles.sort();

// Escreve no arquivo de saída
const content = jsFiles.join('\n') + '\n';
fs.writeFileSync(outputFile, content, 'utf-8');

console.log(`✅ Arquivos JavaScript encontrados em src/: ${jsFiles.length}`);
console.log(`📄 Lista gerada em: ${outputFile}`);
console.log('');
console.log('Arquivos listados:');
jsFiles.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));