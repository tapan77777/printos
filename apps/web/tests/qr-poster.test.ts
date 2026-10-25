import {it,expect} from 'vitest';
import {PDFDocument} from 'pdf-lib';
import {qrPoster,customerQrUrl,qrPreview} from '../lib/qrPoster';
it('builds the existing customer route from the configured origin with safe path encoding',()=>{
 expect(customerQrUrl('https://example.test','shop-123')).toBe('https://example.test/p/shop-123');expect(customerQrUrl('https://example.test','a/b')).toBe('https://example.test/p/a%2Fb');expect(()=>customerQrUrl('javascript:unsafe','p')).toThrow();expect(()=>customerQrUrl('https://user:private@example.test','p')).toThrow();
});
it('creates a real printable A4 PDF and PNG QR without a physical printer',async()=>{
 const bytes=await qrPoster('https://example.test','shop-fixture','Fixture shop');expect(Buffer.from(bytes).subarray(0,5).toString()).toBe('%PDF-');const pdf=await PDFDocument.load(bytes);expect(pdf.getPageCount()).toBe(1);expect(pdf.getPage(0).getWidth()).toBeCloseTo(595.28);expect(await qrPreview('https://example.test','shop-fixture')).toMatch(/^data:image\/png;base64,/);
});
it('does not fail PDF export for a shop name outside the built-in font',async()=>{expect((await qrPoster('https://example.test','fixture','मेरा प्रिंट')).length).toBeGreaterThan(1000);});
