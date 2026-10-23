import * as parser from 'xlsx';
import {DOMParser} from '@xmldom/xmldom';
import xls from './xls-preflight.cjs';
import xlsb from './xlsb-preflight.cjs';
import worker from './legacy-workbook-worker.cjs';
worker.installLegacyWorkbookWorker(self,{parser,preflights:{xls:xls.preflightXls,xlsb:bytes=>xlsb.inspectXlsb(bytes,{DOMParser})}});
