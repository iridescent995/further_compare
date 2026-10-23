"""Independent openpyxl readback; validates stored export values, not calculation."""
import sys
from openpyxl import load_workbook
book = load_workbook(sys.argv[1], data_only=False)
assert len(book.worksheets) == 1
sheet = book.worksheets[0]
assert sheet['B2'].value == 'native edit'
assert sheet['B3'].value == '12'
assert sheet['C2'].value == 'Café Ω中🚀'
assert sheet['C3'].value == 'edited\nnote'
assert all(cell.data_type != 'f' for row in sheet for cell in row)
print('Independent openpyxl readback passed: cached values, Unicode, multiline, no formulas.')
