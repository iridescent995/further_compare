import com.sun.star.beans.PropertyValue;
import com.sun.star.comp.helper.Bootstrap;
import com.sun.star.uno.UnoRuntime;
import com.sun.star.uno.XComponentContext;
import com.sun.star.bridge.XUnoUrlResolver;
import com.sun.star.frame.XComponentLoader;
import com.sun.star.frame.XDesktop;
import com.sun.star.frame.XStorable;
import com.sun.star.sheet.XSpreadsheetDocument;
import com.sun.star.sheet.XSpreadsheet;
import com.sun.star.sheet.XCalculatable;
import com.sun.star.container.XIndexAccess;
import com.sun.star.lang.XComponent;
import com.sun.star.table.XCell;
import com.sun.star.document.MacroExecMode;
import com.sun.star.document.UpdateDocMode;
public class ReadGroups {
 static PropertyValue p(String n,Object v){PropertyValue p=new PropertyValue();p.Name=n;p.Value=v;return p;}
 public static void main(String[]args)throws Exception{
  XComponentContext local=Bootstrap.createInitialComponentContext(null);
  XUnoUrlResolver resolver=UnoRuntime.queryInterface(XUnoUrlResolver.class,local.getServiceManager().createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver",local));
  XComponentContext ctx=UnoRuntime.queryInterface(XComponentContext.class,resolver.resolve("uno:socket,host=127.0.0.1,port=20421;urp;StarOffice.ComponentContext"));
  Object desktop=ctx.getServiceManager().createInstanceWithContext("com.sun.star.frame.Desktop",ctx);
  XComponentLoader loader=UnoRuntime.queryInterface(XComponentLoader.class,desktop);
  System.out.println("Explicit load policy NEVER_EXECUTE="+MacroExecMode.NEVER_EXECUTE+" NO_UPDATE="+UpdateDocMode.NO_UPDATE);
  for(int i=0;i<args.length;i+=2){
   System.out.println("INPUT "+args[i]);
   XComponent doc=loader.loadComponentFromURL(new java.io.File(args[i]).toURI().toString(),"_blank",0,new PropertyValue[]{p("Hidden",true),p("ReadOnly",true),p("MacroExecutionMode",MacroExecMode.NEVER_EXECUTE),p("UpdateDocMode",UpdateDocMode.NO_UPDATE)});
   if(doc==null)throw new Exception("Document load refused");
   UnoRuntime.queryInterface(XCalculatable.class,doc).enableAutomaticCalculation(false);
   XSpreadsheetDocument calc=UnoRuntime.queryInterface(XSpreadsheetDocument.class,doc);
   XIndexAccess sheets=UnoRuntime.queryInterface(XIndexAccess.class,calc.getSheets());
   for(int j=0;j<sheets.getCount();j++){XSpreadsheet sheet=UnoRuntime.queryInterface(XSpreadsheet.class,sheets.getByIndex(j));for(int row=0;row<10;row++){XCell cell=sheet.getCellByPosition(2,row);System.out.println("CELL "+j+" C"+(row+1)+" formula="+cell.getFormula()+" value="+cell.getValue()+" error="+cell.getError());}}
   UnoRuntime.queryInterface(XStorable.class,doc).storeToURL(new java.io.File(args[i+1]).toURI().toString(),new PropertyValue[]{p("FilterName","Calc MS Excel 2007 XML"),p("Overwrite",true)});doc.dispose();
  }
  UnoRuntime.queryInterface(XDesktop.class,desktop).terminate();
 }
}
