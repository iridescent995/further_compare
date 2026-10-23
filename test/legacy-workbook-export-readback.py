"""Independent exported workbook readback; never evaluates formulas."""
import sys
from openpyxl import load_workbook
book = load_workbook(sys.argv[1], data_only=False)
mode = sys.argv[2]
if mode == 'native':
    assert len(book.worksheets) == 1
    sheet = book.worksheets[0]
    assert sheet['B2'].value == 'native edit'
    assert sheet['C3'].value == 'edited\nnote'
    assert all(cell.data_type != 'f' for row in sheet for cell in row)
elif mode == 'mixed':
    assert book['Data']['B3'].value == 12
    assert book['Data']['B3'].data_type == 'n'
    assert book['Retained']['A1'].value == '=1+2'
else:
    assert len(book.worksheets) == 1
    sheet = book.worksheets[0]
    assert sheet['B2'].value == ('edited' if mode == 'xls' else 'xlsb edit')
    assert all(cell.data_type != 'f' for row in sheet for cell in row)
    if mode == 'xls':
        assert sheet['B3'].value == '12'
        assert sheet['C2'].value == 'Café Ω中🚀'
print('Independent openpyxl export readback passed:', mode)
