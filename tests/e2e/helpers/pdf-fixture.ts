/** An original two-page test document. No family archive is included. */
export function pdfFixture() {
  const stream = (page: number) => `BT /F1 24 Tf 40 720 Td (SYNTHETIC ARCHIVE - PAGE ${page}) Tj ET\n0.5 w 40 690 500 1 re S\nBT /F1 16 Tf 40 650 Td (Readable test record ${page}.) Tj ET`
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream(1).length} >>\nstream\n${stream(1)}\nendstream`,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
    `<< /Length ${stream(2).length} >>\nstream\n${stream(2)}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
  let result = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, i) => { offsets.push(result.length); result += `${i + 1} 0 obj\n${object}\nendobj\n` })
  const xref = result.length
  result += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  result += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(result)
}
