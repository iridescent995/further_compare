"""Original independent column-order fixtures; ReportLab only, no application imports."""
from pathlib import Path
import json
from reportlab import Version
from reportlab.pdfgen import canvas
ROOT = Path(__file__).parent

def write(name, items):
    pdf = canvas.Canvas(str(ROOT / (name + '.pdf')), pagesize=(612, 792), invariant=1, pageCompression=0)
    pdf.setTitle(name)
    for x, y, text, size in items:
        pdf.setFont('Helvetica', size)
        pdf.drawString(x, y, text)
    pdf.save()

heading = (60, 740, 'PAGE HEADING spans the left and right text columns', 16)
footer = (60, 80, 'PAGE FOOTER spans the left and right text columns', 16)
left = [(60, 690, 'Left introduction', 12), (60, 670, 'Left continuation', 12), (60, 650, 'Left conclusion', 12)]
right = [(330, 690, 'Right introduction', 12), (330, 670, 'Right continuation', 12), (330, 650, 'Right conclusion', 12)]
row_stream = [heading] + [item for pair in zip(left, right) for item in pair] + [footer]
column_stream = [heading] + left + right + [footer]
write('row-major', row_stream)
write('column-major', column_stream)
changed = [(x, y, 'Right changed' if text == 'Right continuation' else text, size) for x, y, text, size in row_stream]
write('changed-word', changed)
second_heading = (60, 470, 'SECOND BAND spans the left and right text columns', 16)
left2 = [(60, 420, 'Lower left first', 12), (60, 400, 'Lower left last', 12)]
right2 = [(330, 420, 'Lower right first', 12), (330, 400, 'Lower right last', 12)]
write('multi-band', [heading] + [item for pair in zip(left, right) for item in pair] + [second_heading] + [item for pair in zip(left2, right2) for item in pair] + [footer])
expected = '\n'.join(item[2] for item in column_stream)
manifest = {'producer': 'ReportLab ' + Version, 'columnText': expected, 'changedText': expected.replace('Right continuation', 'Right changed'), 'multiBandText': '\n'.join(item[2] for item in [heading] + left + right + [second_heading] + left2 + right2 + [footer])}
(ROOT / 'expected.json').write_text(json.dumps(manifest, indent=2) + '\n')
