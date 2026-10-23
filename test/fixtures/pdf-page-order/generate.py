"""Original independent PDF fixtures, ReportLab 4.4.9; no app/PDF.js imports."""
from pathlib import Path
from reportlab.pdfgen import canvas
root = Path(__file__).parent

def make(name, rows, rotation=0, compensate=False):
    c = canvas.Canvas(str(root / (name + '.pdf')), pagesize=(612, 792), invariant=1, pageCompression=0)
    c.setTitle(name)
    if rotation:
        c.setPageRotation(rotation)
    if compensate:
        c.rotate(rotation)
    for x, y, text, size in rows:
        c.setFont('Helvetica', size)
        c.drawString(x, y, text)
    c.save()

items = [(60,700,'Left top',12),(310,700,'Right top',12),(60,680,'Left bottom',12),(310,680,'Right bottom',12)]
make('row-major', items)
make('column-major', [items[i] for i in [0,2,1,3]])
make('changed-word', [items[0],items[2],items[1],(310,680,'Right changed',12)])
make('mixed-fonts', [(60,700,'Small',10),(150,700,'Large',18),(60,660,'Next line',12)])
make('sideways', [(60,500,'Sideways',12)], rotation=90)
make('rotated-horizontal', [(60,-500,'Rotated horizontal',12)], rotation=90, compensate=True)
make('overlap', [(60,700,'First',12),(60,700,'Second',12)])
