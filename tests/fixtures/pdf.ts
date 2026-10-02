import {deflateSync} from 'node:zlib'
// Small synthetic PDF with a compressed text stream; no user data or external resources.
export function pdfFixture(text='The project code is ORCHID-42. Delivery is on Friday.'){
 const escaped=text.replaceAll('\\','\\\\').replaceAll('(','\\(').replaceAll(')','\\)')
 const stream=deflateSync(Buffer.from(`BT /F1 14 Tf 50 750 Td (${escaped}) Tj ET`))
 const objects=[Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>'),Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),Buffer.concat([Buffer.from(`<< /Filter /FlateDecode /Length ${stream.length} >>\nstream\n`),stream,Buffer.from('\nendstream')])]
 let output=Buffer.from('%PDF-1.4\n');const offsets=[0]
 objects.forEach((body,index)=>{offsets.push(output.length);output=Buffer.concat([output,Buffer.from(`${index+1} 0 obj\n`),body,Buffer.from('\nendobj\n')])})
 const xref=output.length
 return Buffer.concat([output,Buffer.from(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)])
}
