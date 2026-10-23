"""Independent ReportLab fixture; no application or PDF.js imports."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont

output = Path(__file__).with_name('japanese-cid.pdf')
pdfmetrics.registerFont(UnicodeCIDFont('HeiseiMin-W3'))
pdf = canvas.Canvas(str(output), pagesize=(612, 792), pageCompression=0, invariant=1)
pdf.setTitle('External CMap comparison fixture')
pdf.setFont('HeiseiMin-W3', 14)
pdf.drawString(60, 700, '日本語の比較')
pdf.save()
