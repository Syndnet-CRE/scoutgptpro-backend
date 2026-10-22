const assert = require('node:assert/strict');
async function main() {
  assert.equal(process.version, 'v22.23.4');
  require('express'); require('pg'); require('@modelcontextprotocol/sdk/client/index.js');
  const fs = require('node:fs'); const path = require('node:path');
  const engineDir = path.resolve('node_modules/.prisma/client');
  const engineFiles = fs.readdirSync(engineDir).filter(name => /^libquery_engine.*\.so\.node$/.test(name));
  assert.equal(engineFiles.length, 1); require(path.join(engineDir, engineFiles[0]));
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  await prisma.$disconnect();
  const PDFDocument = require('pdfkit');
  const pdf = await new Promise((resolve, reject) => {
    const document = new PDFDocument(); const chunks = [];
    document.on('data', chunk => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
    document.text('Runtime security smoke'); document.end();
  });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  const ExcelJS = require('exceljs'); const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Smoke').addRow(['runtime', process.version]);
  const buffer = await workbook.xlsx.writeBuffer();
  const roundtrip = new ExcelJS.Workbook(); await roundtrip.xlsx.load(buffer);
  assert.equal(roundtrip.getWorksheet('Smoke').getCell('B1').value, process.version);
  console.log(`Prisma client, MCP import, PDF and Excel roundtrip passed on ${process.version}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
