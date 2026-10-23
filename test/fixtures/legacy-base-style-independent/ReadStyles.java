import com.sun.star.beans.*;
import com.sun.star.comp.helper.Bootstrap;
import com.sun.star.uno.UnoRuntime;
import com.sun.star.uno.XComponentContext;
import com.sun.star.bridge.XUnoUrlResolver;
import com.sun.star.frame.*;
import com.sun.star.container.*;
import com.sun.star.lang.XComponent;
import com.sun.star.sheet.*;
import com.sun.star.table.*;
import com.sun.star.document.*;
import com.sun.star.util.*;
public class ReadStyles {
 static PropertyValue p(String n,Object v){PropertyValue p=new PropertyValue();p.Name=n;p.Value=v;return p;}
 static PropertyValue[] safe(){return new PropertyValue[]{p("Hidden",true),p("ReadOnly",true),p("MacroExecutionMode",MacroExecMode.NEVER_EXECUTE),p("UpdateDocMode",UpdateDocMode.NO_UPDATE)};}
 static String esc(Object v){return String.valueOf(v).replace("\\","\\\\").replace("\t","\\t").replace("\n","\\n");}
 static XComponent open(XComponentLoader loader,String file)throws Exception{return loader.loadComponentFromURL(new java.io.File(file).toURI().toString(),"_blank",0,safe());}
 static XSpreadsheet sheet(XComponent doc,int i)throws Exception{return UnoRuntime.queryInterface(XSpreadsheet.class,UnoRuntime.queryInterface(XIndexAccess.class,UnoRuntime.queryInterface(XSpreadsheetDocument.class,doc).getSheets()).getByIndex(i));}
 static void make(XComponentLoader loader,String dir,boolean changed)throws Exception{
  XComponent doc=loader.loadComponentFromURL("private:factory/scalc","_blank",0,safe());XSpreadsheet sh=sheet(doc,0);
  for(int i=0;i<9;i++){XCell c=sh.getCellByPosition(0,i);if(i!=6)c.setValue(123.25);}
  XPropertySet font=UnoRuntime.queryInterface(XPropertySet.class,sh.getCellByPosition(0,0));font.setPropertyValue("CharFontName","Liberation Sans");font.setPropertyValue("CharHeight",changed?16f:11f);font.setPropertyValue("CharWeight",changed?150f:100f);font.setPropertyValue("CharColor",changed?0x8a2040:0x203040);
  UnoRuntime.queryInterface(XPropertySet.class,sh.getCellByPosition(0,1)).setPropertyValue("CellBackColor",changed?0xffcc99:0xccffee);
  BorderLine border=new BorderLine();border.Color=changed?0xaa2211:0x2244aa;border.OuterLineWidth=(short)(changed?70:35);UnoRuntime.queryInterface(XPropertySet.class,sh.getCellByPosition(0,2)).setPropertyValue("BottomBorder",border);
  XPropertySet align=UnoRuntime.queryInterface(XPropertySet.class,sh.getCellByPosition(0,3));align.setPropertyValue("HoriJustify",changed?CellHoriJustify.RIGHT:CellHoriJustify.CENTER);align.setPropertyValue("IsTextWrapped",changed);align.setPropertyValue("RotateAngle",changed?4500:0);
  CellProtection protection=new CellProtection();protection.IsLocked=!changed;protection.IsFormulaHidden=changed;UnoRuntime.queryInterface(XPropertySet.class,sh.getCellByPosition(0,4)).setPropertyValue("CellProtection",protection);
  XNumberFormats formats=UnoRuntime.queryInterface(XNumberFormatsSupplier.class,doc).getNumberFormats();com.sun.star.lang.Locale locale=new com.sun.star.lang.Locale("en","US","");String code=changed?"0.0000":"0.00";int key=formats.queryKey(code,locale,false);if(key<0)key=formats.addNew(code,locale);UnoRuntime.queryInterface(XPropertySet.class,sh.getCellByPosition(0,5)).setPropertyValue("NumberFormat",key);
  XPropertySet blank=UnoRuntime.queryInterface(XPropertySet.class,sh.getCellByPosition(0,6));blank.setPropertyValue("CellBackColor",changed?0xffaaaa:0xaaaaff);blank.setPropertyValue("CharWeight",150f);
  XColumnRowRange cr=UnoRuntime.queryInterface(XColumnRowRange.class,sh);UnoRuntime.queryInterface(XPropertySet.class,UnoRuntime.queryInterface(XIndexAccess.class,cr.getColumns()).getByIndex(1)).setPropertyValue("CellBackColor",changed?0xddffaa:0xffddaa);UnoRuntime.queryInterface(XPropertySet.class,UnoRuntime.queryInterface(XIndexAccess.class,cr.getRows()).getByIndex(9)).setPropertyValue("CellBackColor",changed?0xaaffdd:0xddaaff);UnoRuntime.queryInterface(XPropertySet.class,sh.getCellByPosition(1,9)).setPropertyValue("CellBackColor",0x112233);
  String stem=dir+"/"+(changed?"changed":"baseline");XStorable save=UnoRuntime.queryInterface(XStorable.class,doc);save.storeToURL(new java.io.File(stem+".ods").toURI().toString(),new PropertyValue[]{p("FilterName","calc8"),p("Overwrite",true)});save.storeToURL(new java.io.File(stem+".xls").toURI().toString(),new PropertyValue[]{p("FilterName","MS Excel 97"),p("Overwrite",true)});doc.dispose();
 }
 static void inspect(XComponentLoader loader,String file)throws Exception{
  XComponent doc=open(loader,file);if(doc==null)throw new Exception("Load refused "+file);System.out.println("FILE\t"+new java.io.File(file).getName());XIndexAccess sheets=UnoRuntime.queryInterface(XIndexAccess.class,UnoRuntime.queryInterface(XSpreadsheetDocument.class,doc).getSheets());XNumberFormats formats=UnoRuntime.queryInterface(XNumberFormatsSupplier.class,doc).getNumberFormats();
  for(int i=0;i<sheets.getCount();i++){XSpreadsheet sh=sheet(doc,i);System.out.println("SHEET\t"+i+"\t"+UnoRuntime.queryInterface(XNamed.class,sh).getName());for(int r=0;r<12;r++)for(int c=0;c<6;c++){XCell cell=sh.getCellByPosition(c,r);XPropertySet p=UnoRuntime.queryInterface(XPropertySet.class,cell);if(cell.getType()==CellContentType.EMPTY&&!(c==0&&r==6)&&!(c==1&&r==0)&&!(r==9&&c<3))continue;BorderLine border=(BorderLine)p.getPropertyValue("BottomBorder");CellProtection protection=(CellProtection)p.getPropertyValue("CellProtection");String format=(String)formats.getByKey((Integer)p.getPropertyValue("NumberFormat")).getPropertyValue("FormatString");System.out.println("CELL\t"+r+"\t"+c+"\t"+esc(cell.getFormula())+"\t"+p.getPropertyValue("CharFontName")+"\t"+p.getPropertyValue("CharHeight")+"\t"+p.getPropertyValue("CharWeight")+"\t"+p.getPropertyValue("CharColor")+"\t"+p.getPropertyValue("CellBackColor")+"\t"+border.Color+":"+border.OuterLineWidth+":"+border.InnerLineWidth+":"+border.LineDistance+"\t"+((CellHoriJustify)p.getPropertyValue("HoriJustify")).getValue()+"\t"+p.getPropertyValue("IsTextWrapped")+"\t"+p.getPropertyValue("RotateAngle")+"\t"+protection.IsLocked+":"+protection.IsFormulaHidden+":"+protection.IsHidden+":"+protection.IsPrintHidden+"\t"+esc(format));}}
  doc.dispose();
 }
 public static void main(String[]args)throws Exception{XComponentContext local=Bootstrap.createInitialComponentContext(null);XUnoUrlResolver resolver=UnoRuntime.queryInterface(XUnoUrlResolver.class,local.getServiceManager().createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver",local));XComponentContext ctx=UnoRuntime.queryInterface(XComponentContext.class,resolver.resolve("uno:socket,host=127.0.0.1,port=20424;urp;StarOffice.ComponentContext"));Object desktop=ctx.getServiceManager().createInstanceWithContext("com.sun.star.frame.Desktop",ctx);XComponentLoader loader=UnoRuntime.queryInterface(XComponentLoader.class,desktop);System.out.println("POLICY NEVER_EXECUTE="+MacroExecMode.NEVER_EXECUTE+" NO_UPDATE="+UpdateDocMode.NO_UPDATE);if(!args[0].equals("--inspect")){make(loader,args[0],false);make(loader,args[0],true);for(String name:new String[]{"baseline.ods","changed.ods","baseline.xls","changed.xls"})inspect(loader,args[0]+"/"+name);}for(int i=1;i<args.length;i++)inspect(loader,args[i]);UnoRuntime.queryInterface(XDesktop.class,desktop).terminate();}
}
